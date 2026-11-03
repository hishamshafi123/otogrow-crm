import {
  canonicalCommandJson,
  hashCanonicalCommandInput,
} from '@/delivery/commands/canonical-command-hash';
import { type DeliveryCreativeAdLinkPreviewInput } from '~/generated-metadata/graphql';
import {
  type CreativeLearningBody,
  type CreativeLearningCommand,
} from '@/delivery/creative/learning/creative-learning.types';
import { learningGoalInput } from '@/delivery/creative/learning/creative-learning-navigation';
export const normalizeCreativeLearningCommand = (
  command: CreativeLearningCommand,
): CreativeLearningCommand => {
  const input = command.input;
  if (command.kind === 'SAVE')
    return {
      kind: 'SAVE',
      input: {
        projectId: command.input.projectId,
        sourceId: command.input.sourceId,
        adId: command.input.adId,
        taskId: command.input.taskId,
        submissionVersion: command.input.submissionVersion,
        assetId: command.input.assetId,
        goal: {
          ...learningGoalInput(command.input.goal),
          evidence: command.input.goal.evidence.trim(),
        },
        declaredComponents: command.input.declaredComponents.map(
          ({ role, assetId }) => ({ role, assetId }),
        ),
        declaredCopy: command.input.declaredCopy ?? null,
        associationEvidence: command.input.associationEvidence.trim(),
        evidenceUrl: command.input.evidenceUrl,
        note: command.input.note.trim(),
        correctsId: command.input.correctsId ?? null,
        id: input.id,
        requestId: input.requestId,
        revision: command.input.revision,
        previewFingerprint: command.input.previewFingerprint,
      },
    };
  if (command.kind === 'DECIDE')
    return {
      kind: 'DECIDE',
      input: {
        id: input.id,
        requestId: input.requestId,
        revision: command.input.revision,
        action: command.input.action,
        previewFingerprint: command.input.previewFingerprint,
        note: command.input.note.trim(),
      },
    };
  return {
    kind: 'LESSON',
    input: {
      id: input.id,
      requestId: input.requestId,
      projectId: command.input.projectId,
      linkIds: [...command.input.linkIds],
      linkFingerprints: [...command.input.linkFingerprints],
      title: command.input.title.trim(),
      assessment: command.input.assessment,
      lesson: command.input.lesson.trim(),
      limitations: command.input.limitations.trim(),
      nextTest: command.input.nextTest.trim(),
      correctsId: command.input.correctsId ?? null,
    },
  };
};
export const creativeLearningCanonicalInput = (
  command: CreativeLearningCommand,
) => canonicalCommandJson(normalizeCreativeLearningCommand(command).input);
export const creativeLearningCommandHash = (command: CreativeLearningCommand) =>
  hashCanonicalCommandInput(normalizeCreativeLearningCommand(command).input);
export const learningBodyInput = (
  body: CreativeLearningBody,
): DeliveryCreativeAdLinkPreviewInput => ({
  projectId: body.projectId,
  sourceId: body.sourceId,
  adId: body.adId,
  taskId: body.taskId,
  submissionVersion: body.submissionVersion,
  assetId: body.assetId,
  goal: learningGoalInput(body.goalSnapshot),
  declaredComponents: body.declaredComponents.map(({ role, assetId }) => ({
    role,
    assetId,
  })),
  declaredCopy: body.declaredCopy ?? null,
  associationEvidence: body.associationEvidence,
  evidenceUrl: body.evidenceUrl,
  note: body.note,
  correctsId: body.correctsId ?? null,
});
