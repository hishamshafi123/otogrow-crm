import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import {
  TwentyORMException,
  TwentyORMExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  FORM_SUBMISSION_NOTE_TITLE_PREFIX,
  type LeadScoringEventType,
} from 'src/modules/lead-scoring/constants/lead-scoring.constant';
import { LeadScoreEventWorkspaceEntity } from 'src/modules/lead-scoring/standard-objects/lead-score-event.workspace-entity';
import { LeadScoringRuleWorkspaceEntity } from 'src/modules/lead-scoring/standard-objects/lead-scoring-rule.workspace-entity';
import { computeLeadScoreBand } from 'src/modules/lead-scoring/utils/compute-lead-score-band.util';
import {
  describePropertyRuleMatch,
  evaluatePropertyRule,
} from 'src/modules/lead-scoring/utils/evaluate-lead-scoring-rule.util';
import { CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
import { ChannelMessageWorkspaceEntity } from 'src/modules/messaging/channels/standard-objects/channel-message.workspace-entity';
import { NoteWorkspaceEntity } from 'src/modules/note/standard-objects/note.workspace-entity';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { SequenceEnrollmentWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-enrollment.workspace-entity';
import { SequenceWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence.workspace-entity';

// A concurrent grant can win the insert race on the unique eventKey index;
// the event exists either way, so a duplicate is a successful no-op
const isDuplicateEntryError = (error: unknown) =>
  error instanceof TwentyORMException &&
  error.code === TwentyORMExceptionCode.DUPLICATE_ENTRY_DETECTED;

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  // Re-evaluates PROPERTY rules only: property score events are idempotent
  // (one per rule per person), created when the condition holds and removed
  // when it no longer does. EVENT rule grants come from their own listeners.
  async recomputePerson(workspaceId: string, personId: string): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const personRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          PersonWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const person = await personRepository.findOne({
        where: { id: personId },
      });

      if (!isDefined(person)) {
        return;
      }

      const companyRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          CompanyWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const companyId = person.companyId;

      const company = isNonEmptyString(companyId)
        ? await companyRepository.findOne({ where: { id: companyId } })
        : null;

      const ruleRepository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        LeadScoringRuleWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );
      const eventRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          LeadScoreEventWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const propertyRules = await ruleRepository.find({
        where: { isActive: true, ruleType: 'PROPERTY' },
      });

      for (const rule of propertyRules) {
        const eventKey = `prop:${rule.id}:${personId}`;
        const matches = evaluatePropertyRule(rule, { person, company });

        const existingEvent = await eventRepository.findOne({
          where: { eventKey },
        });

        if (matches && !isDefined(existingEvent)) {
          await this.insertScoreEvent({
            eventRepository,
            personId,
            ruleId: rule.id,
            points: rule.points,
            reason: describePropertyRuleMatch(rule),
            eventKey,
          });
        }

        if (!matches && isDefined(existingEvent)) {
          await eventRepository.delete(existingEvent.id);
        }
      }

      await this.refreshPersonScore(workspaceId, personId);
    }, authContext);
  }

  async handleFormSubmission(
    workspaceId: string,
    noteId: string,
    personId: string,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const noteRepository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        NoteWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );

      const note = await noteRepository.findOne({ where: { id: noteId } });

      if (
        !isDefined(note) ||
        !note.title?.startsWith(FORM_SUBMISSION_NOTE_TITLE_PREFIX)
      ) {
        return;
      }

      const formName = note.title.slice(
        FORM_SUBMISSION_NOTE_TITLE_PREFIX.length,
      );

      await this.grantEventsForType({
        workspaceId,
        personId,
        eventType: 'FORM_SUBMISSION',
        // One grant per person per form: a repeat submission does not re-score
        eventKeyBase: `form:${formName}:${personId}`,
        reason: `Form submission: ${formName}`,
      });
    }, authContext);
  }

  async handleInboundChannelMessage(
    workspaceId: string,
    channelMessageId: string,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const channelMessageRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          ChannelMessageWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const channelMessage = await channelMessageRepository.findOne({
        where: { id: channelMessageId },
      });

      if (
        !isDefined(channelMessage) ||
        channelMessage.direction !== 'INBOUND'
      ) {
        return;
      }

      const personId = channelMessage.personId;

      if (!isNonEmptyString(personId)) {
        return;
      }

      const eventType: LeadScoringEventType | null =
        channelMessage.channel === 'WHATSAPP'
          ? 'INBOUND_WHATSAPP'
          : channelMessage.channel === 'SMS'
            ? 'INBOUND_SMS'
            : null;

      if (!isDefined(eventType)) {
        return;
      }

      const channelLabel =
        channelMessage.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS';

      await this.grantEventsForType({
        workspaceId,
        personId,
        eventType,
        eventKeyBase: `channel-msg:${channelMessage.id}`,
        reason: `Inbound ${channelLabel} message`,
      });
    }, authContext);
  }

  async handleSequenceEnrollment(
    workspaceId: string,
    sequenceEnrollmentId: string,
    trigger: 'ENROLLED' | 'STATUS_CHANGED',
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const enrollmentRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          SequenceEnrollmentWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const enrollment = await enrollmentRepository.findOne({
        where: { id: sequenceEnrollmentId },
      });

      if (!isDefined(enrollment) || !isNonEmptyString(enrollment.personId)) {
        return;
      }

      const sequenceRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          SequenceWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const sequence = await sequenceRepository.findOne({
        where: { id: enrollment.sequenceId },
      });
      const sequenceName = sequence?.name ?? 'sequence';

      if (trigger === 'ENROLLED') {
        await this.grantEventsForType({
          workspaceId,
          personId: enrollment.personId,
          eventType: 'SEQUENCE_ENROLLED',
          eventKeyBase: `sequence-enrolled:${enrollment.id}`,
          reason: `Enrolled in sequence: ${sequenceName}`,
        });

        return;
      }

      if (enrollment.status === 'REPLIED') {
        await this.grantEventsForType({
          workspaceId,
          personId: enrollment.personId,
          eventType: 'SEQUENCE_REPLIED',
          eventKeyBase: `sequence-replied:${enrollment.id}`,
          reason: `Replied to sequence: ${sequenceName}`,
        });
      }

      if (enrollment.status === 'COMPLETED') {
        await this.grantEventsForType({
          workspaceId,
          personId: enrollment.personId,
          eventType: 'SEQUENCE_COMPLETED',
          eventKeyBase: `sequence-completed:${enrollment.id}`,
          reason: `Completed sequence: ${sequenceName}`,
        });
      }
    }, authContext);
  }

  private async grantEventsForType({
    workspaceId,
    personId,
    eventType,
    eventKeyBase,
    reason,
  }: {
    workspaceId: string;
    personId: string;
    eventType: LeadScoringEventType;
    eventKeyBase: string;
    reason: string;
  }): Promise<void> {
    const ruleRepository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      LeadScoringRuleWorkspaceEntity,
      { shouldBypassPermissionChecks: true },
    );

    const rules = await ruleRepository.find({
      where: { isActive: true, ruleType: 'EVENT', eventType },
    });

    if (rules.length === 0) {
      return;
    }

    const eventRepository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      LeadScoreEventWorkspaceEntity,
      { shouldBypassPermissionChecks: true },
    );

    let grantedAny = false;

    for (const rule of rules) {
      // The rule id is part of the key so several rules of the same type each
      // grant once for the same underlying event
      const granted = await this.insertScoreEvent({
        eventRepository,
        personId,
        ruleId: rule.id,
        points: rule.points,
        reason,
        eventKey: `${eventKeyBase}:${rule.id}`,
      });

      grantedAny = grantedAny || granted;
    }

    if (grantedAny) {
      await this.refreshPersonScore(workspaceId, personId);
    }
  }

  private async insertScoreEvent({
    eventRepository,
    personId,
    ruleId,
    points,
    reason,
    eventKey,
  }: {
    eventRepository: WorkspaceRepository<LeadScoreEventWorkspaceEntity>;
    personId: string;
    ruleId: string;
    points: number;
    reason: string;
    eventKey: string;
  }): Promise<boolean> {
    const existingEvent = await eventRepository.findOne({
      where: { eventKey },
    });

    if (isDefined(existingEvent)) {
      return false;
    }

    try {
      await eventRepository.insert({
        id: v4(),
        personId,
        ruleId,
        points,
        reason,
        eventKey,
      });

      return true;
    } catch (error) {
      if (!isDuplicateEntryError(error)) {
        throw error;
      }

      return false;
    }
  }

  private async refreshPersonScore(
    workspaceId: string,
    personId: string,
  ): Promise<void> {
    const eventRepository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      LeadScoreEventWorkspaceEntity,
      { shouldBypassPermissionChecks: true },
    );
    const personRepository = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      PersonWorkspaceEntity,
      { shouldBypassPermissionChecks: true },
    );

    const events = await eventRepository.find({
      where: { personId },
    });

    const leadScore = events.reduce(
      (total: number, event: LeadScoreEventWorkspaceEntity) =>
        total + (event.points ?? 0),
      0,
    );

    const person = await personRepository.findOne({ where: { id: personId } });

    if (!isDefined(person)) {
      return;
    }

    const leadScoreBand = computeLeadScoreBand(leadScore);

    // Skip the write when nothing changed: writing leadScore fires a person
    // UPDATED event, and the listener would re-enqueue a recompute forever
    if (
      (person.leadScore ?? 0) === leadScore &&
      person.leadScoreBand === leadScoreBand
    ) {
      return;
    }

    await personRepository.update(personId, { leadScore, leadScoreBand });

    this.logger.log(
      `Lead score for person ${personId} in workspace ${workspaceId} is now ${leadScore}`,
    );
  }
}
