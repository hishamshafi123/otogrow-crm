import { FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { NoteTargetWorkspaceEntity } from 'src/modules/note/standard-objects/note-target.workspace-entity';
import { NoteWorkspaceEntity } from 'src/modules/note/standard-objects/note.workspace-entity';
import { type QuoteWorkspaceEntity } from 'src/modules/quoting/standard-objects/quote.workspace-entity';

export const QUOTING_ACTOR = {
  source: FieldActorSource.API,
  workspaceMemberId: null,
  name: 'System',
  context: {},
};

// noteTarget has no morph column for quote, so quote notes target the
// quote's company/person/opportunity and surface on those records' timelines.
export const createQuoteNote = async ({
  globalWorkspaceOrmManager,
  workspaceId,
  quote,
  title,
  markdown,
}: {
  globalWorkspaceOrmManager: GlobalWorkspaceOrmManager;
  workspaceId: string;
  quote: Pick<QuoteWorkspaceEntity, 'companyId' | 'personId' | 'opportunityId'>;
  title: string;
  markdown: string;
}): Promise<void> => {
  const noteRepository = await globalWorkspaceOrmManager.getRepository(
    workspaceId,
    NoteWorkspaceEntity,
    { shouldBypassPermissionChecks: true },
  );
  const noteTargetRepository = await globalWorkspaceOrmManager.getRepository(
    workspaceId,
    NoteTargetWorkspaceEntity,
    { shouldBypassPermissionChecks: true },
  );

  const lastNotePosition =
    (await noteRepository.maximum('position', undefined)) ?? 0;
  const noteId = v4();

  await noteRepository.insert({
    id: noteId,
    title,
    bodyV2: { blocknote: null, markdown },
    createdBy: QUOTING_ACTOR,
    position: lastNotePosition + 1,
  });

  if (isDefined(quote.companyId)) {
    await noteTargetRepository.insert({
      noteId,
      targetCompanyId: quote.companyId,
    });
  }

  if (isDefined(quote.personId)) {
    await noteTargetRepository.insert({
      noteId,
      targetPersonId: quote.personId,
    });
  }

  if (isDefined(quote.opportunityId)) {
    await noteTargetRepository.insert({
      noteId,
      targetOpportunityId: quote.opportunityId,
    });
  }
};
