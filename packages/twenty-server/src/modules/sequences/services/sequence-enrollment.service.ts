import { Injectable, type Type } from '@nestjs/common';

import { In, type ObjectLiteral } from 'typeorm';
import { v4 } from 'uuid';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  SEND_SEQUENCE_STEP_JOB,
  SEQUENCE_SEND_RETRY_LIMIT,
} from 'src/modules/sequences/constants/sequence.constant';
import { type SequenceDelayUnit } from 'src/modules/sequences/constants/sequence-delay-unit.constant';
import {
  SequenceException,
  SequenceExceptionCode,
} from 'src/modules/sequences/exceptions/sequence.exception';
import { type SequenceAnalyticsDTO } from 'src/modules/sequences/dtos/sequence-analytics.dto';
import { SequenceEnrollmentWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-enrollment.workspace-entity';
import { SequenceStepWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-step.workspace-entity';
import { SequenceWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence.workspace-entity';
import { type SendSequenceStepJobData } from 'src/modules/sequences/types/send-sequence-step-job-data.type';
import { computeSequenceNextSendAt } from 'src/modules/sequences/utils/compute-sequence-next-send-at.util';
import { MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { SequenceReplyDetectionService } from 'src/modules/sequences/services/sequence-reply-detection.service';
import { isDefined } from 'twenty-shared/utils';

type EnrollArgs = {
  workspaceId: string;
  sequenceId: string;
  personIds: string[];
};

type EnrollResult = {
  enrolledCount: number;
  enrollmentIds: string[];
};

@Injectable()
export class SequenceEnrollmentService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly sequenceReplyDetectionService: SequenceReplyDetectionService,
    @InjectMessageQueue(MessageQueue.emailQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  private getSystemRepository<T extends ObjectLiteral>(
    workspaceId: string,
    entity: Type<T>,
  ) {
    return this.globalWorkspaceOrmManager.getRepository(workspaceId, entity, {
      shouldBypassPermissionChecks: true,
    });
  }

  async enroll({
    workspaceId,
    sequenceId,
    personIds,
  }: EnrollArgs): Promise<EnrollResult> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const sequenceRepository = await this.getSystemRepository(
          workspaceId,
          SequenceWorkspaceEntity,
        );

        const sequence = await sequenceRepository.findOne({
          where: { id: sequenceId },
        });

        if (!isDefined(sequence)) {
          throw new SequenceException(
            `Sequence ${sequenceId} not found`,
            SequenceExceptionCode.SEQUENCE_NOT_FOUND,
          );
        }

        if (sequence.status !== 'ACTIVE') {
          throw new SequenceException(
            `Sequence ${sequenceId} is not active (status: ${sequence.status})`,
            SequenceExceptionCode.SEQUENCE_NOT_ACTIVE,
          );
        }

        const stepRepository = await this.getSystemRepository(
          workspaceId,
          SequenceStepWorkspaceEntity,
        );

        const firstStep = await stepRepository.findOne({
          where: { sequenceId },
          order: { stepPosition: 'ASC' },
        });

        if (!isDefined(firstStep)) {
          throw new SequenceException(
            `Sequence ${sequenceId} has no steps`,
            SequenceExceptionCode.SEQUENCE_HAS_NO_STEPS,
          );
        }

        const uniquePersonIds = [...new Set(personIds)];

        const personRepository = await this.getSystemRepository(
          workspaceId,
          PersonWorkspaceEntity,
        );

        const existingPeople = await personRepository.find({
          where: { id: In(uniquePersonIds) },
          select: { id: true },
        });
        const existingPersonIds = new Set(
          existingPeople.map((person) => person.id),
        );

        const enrollmentRepository = await this.getSystemRepository(
          workspaceId,
          SequenceEnrollmentWorkspaceEntity,
        );

        const existingEnrollments = await enrollmentRepository.find({
          where: { sequenceId, personId: In(uniquePersonIds) },
        });
        const existingEnrollmentByPersonId = new Map(
          existingEnrollments.map((enrollment) => [
            enrollment.personId,
            enrollment,
          ]),
        );

        const now = new Date();
        const enrollmentIds: string[] = [];

        for (const personId of uniquePersonIds) {
          if (!existingPersonIds.has(personId)) {
            continue;
          }

          const nextSendAt = computeSequenceNextSendAt({
            delayValue: firstStep.delayValue,
            delayUnit: firstStep.delayUnit as SequenceDelayUnit,
            businessHoursTimeZone: sequence.businessHoursTimeZone,
            from: now,
          });

          const existingEnrollment = existingEnrollmentByPersonId.get(personId);

          if (isDefined(existingEnrollment)) {
            if (existingEnrollment.status !== 'ACTIVE') {
              await enrollmentRepository.update(existingEnrollment.id, {
                status: 'ACTIVE',
                currentStepPosition: 0,
                nextSendAt,
                lastError: null,
              });
              await this.enqueueSendStepJob({
                workspaceId,
                enrollmentId: existingEnrollment.id,
                nextSendAt,
              });
            }

            enrollmentIds.push(existingEnrollment.id);
            continue;
          }

          const enrollmentId = v4();

          await enrollmentRepository.insert({
            id: enrollmentId,
            sequenceId,
            personId,
            status: 'ACTIVE',
            currentStepPosition: 0,
            nextSendAt,
          });

          await this.enqueueSendStepJob({
            workspaceId,
            enrollmentId,
            nextSendAt,
          });

          enrollmentIds.push(enrollmentId);
        }

        return {
          enrolledCount: enrollmentIds.length,
          enrollmentIds,
        };
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  async unenroll({
    workspaceId,
    enrollmentIds,
  }: {
    workspaceId: string;
    enrollmentIds: string[];
  }): Promise<number> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const enrollmentRepository = await this.getSystemRepository(
          workspaceId,
          SequenceEnrollmentWorkspaceEntity,
        );

        const { affected } = await enrollmentRepository.update(
          { id: In(enrollmentIds), status: 'ACTIVE' },
          { status: 'REMOVED', nextSendAt: null },
        );

        return affected ?? 0;
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  async unenrollPersonFromSequence({
    workspaceId,
    sequenceId,
    personId,
  }: {
    workspaceId: string;
    sequenceId: string;
    personId: string;
  }): Promise<number> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const enrollmentRepository = await this.getSystemRepository(
          workspaceId,
          SequenceEnrollmentWorkspaceEntity,
        );

        const { affected } = await enrollmentRepository.update(
          { sequenceId, personId, status: 'ACTIVE' },
          { status: 'REMOVED', nextSendAt: null },
        );

        return affected ?? 0;
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  async hasRepliedSince({
    workspaceId,
    personId,
    since,
  }: {
    workspaceId: string;
    personId: string;
    since: Date;
  }): Promise<boolean> {
    return this.sequenceReplyDetectionService.hasRepliedSince({
      workspaceId,
      personId,
      since,
    });
  }

  async getAnalytics({
    workspaceId,
    sequenceId,
  }: {
    workspaceId: string;
    sequenceId: string;
  }): Promise<SequenceAnalyticsDTO> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const enrollmentRepository = await this.getSystemRepository(
          workspaceId,
          SequenceEnrollmentWorkspaceEntity,
        );

        const enrollments = await enrollmentRepository.find({
          where: { sequenceId },
          select: { id: true, status: true },
        });

        const countByStatus = (status: string) =>
          enrollments.filter((enrollment) => enrollment.status === status)
            .length;

        let sentCount = 0;

        if (enrollments.length > 0) {
          const messageRepository = await this.getSystemRepository(
            workspaceId,
            MessageWorkspaceEntity,
          );

          sentCount = await messageRepository.count({
            where: {
              sequenceEnrollmentId: In(
                enrollments.map((enrollment) => enrollment.id),
              ),
            },
          });
        }

        return {
          sequenceId,
          totalEnrollments: enrollments.length,
          activeCount: countByStatus('ACTIVE'),
          repliedCount: countByStatus('REPLIED'),
          unsubscribedCount: countByStatus('UNSUBSCRIBED'),
          bouncedCount: countByStatus('BOUNCED'),
          completedCount: countByStatus('COMPLETED'),
          removedCount: countByStatus('REMOVED'),
          errorCount: countByStatus('ERROR'),
          sentCount,
        };
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  private async enqueueSendStepJob({
    workspaceId,
    enrollmentId,
    nextSendAt,
  }: {
    workspaceId: string;
    enrollmentId: string;
    nextSendAt: Date;
  }): Promise<void> {
    await this.messageQueueService.add<SendSequenceStepJobData>(
      SEND_SEQUENCE_STEP_JOB,
      { workspaceId, enrollmentId },
      {
        delay: Math.max(0, nextSendAt.getTime() - Date.now()),
        retryLimit: SEQUENCE_SEND_RETRY_LIMIT,
      },
    );
  }
}
