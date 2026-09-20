import { FieldActorSource } from 'twenty-shared/types';
import { v4 } from 'uuid';

import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { NoteTargetWorkspaceEntity } from 'src/modules/note/standard-objects/note-target.workspace-entity';
import { NoteWorkspaceEntity } from 'src/modules/note/standard-objects/note.workspace-entity';

export const MEETING_BOOKING_ACTOR = {
  source: FieldActorSource.API,
  workspaceMemberId: null,
  name: 'System',
  context: {},
};

export const createMeetingNote = async ({
  globalWorkspaceOrmManager,
  workspaceId,
  personId,
  title,
  markdown,
}: {
  globalWorkspaceOrmManager: GlobalWorkspaceOrmManager;
  workspaceId: string;
  personId: string;
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
    createdBy: MEETING_BOOKING_ACTOR,
    position: lastNotePosition + 1,
  });

  await noteTargetRepository.insert({
    noteId,
    targetPersonId: personId,
  });
};
