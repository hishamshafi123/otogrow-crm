import {
  type OtogrowActivityAnalysisPreviewQuery,
  type OtogrowActivityAnalysisRunQuery,
  type OtogrowActivityAnalysisRequestQuery,
  type StartOtogrowActivityAnalysisInput,
  type CancelOtogrowActivityAnalysisInput,
} from '~/generated-metadata/graphql';

export type ActivityAnalysisPreview =
  OtogrowActivityAnalysisPreviewQuery['otogrowActivityAnalysisPreview'];
export type ActivityAnalysisDetail =
  OtogrowActivityAnalysisRunQuery['otogrowActivityAnalysisRun'];
export type ActivityAnalysisContext = ActivityAnalysisDetail['context'];
export type ActivityCurrentWorkSnapshot = NonNullable<
  ActivityAnalysisContext['currentWork']
>;
export type ActivityCurrentTask = ActivityCurrentWorkSnapshot['items'][number];
export type ActivityCurrentWorkScope = ActivityCurrentWorkSnapshot['scope'];
export type ActivityAnalysisCitationTarget =
  | { kind: 'EVENT'; eventId: string }
  | { kind: 'CURRENT_TASK'; taskId: string; scope: ActivityCurrentWorkScope };
export type ActivityAnalysisReceipt = NonNullable<
  OtogrowActivityAnalysisRequestQuery['otogrowActivityAnalysisRequest']['receipt']
>;
export type ActivityAnalysisCommand =
  | { kind: 'STARTED'; input: StartOtogrowActivityAnalysisInput }
  | { kind: 'CANCELLED'; input: CancelOtogrowActivityAnalysisInput };
export type ActivityAnalysisIntent =
  | { kind: 'start'; requestId: string; runId: string; agentId: string }
  | { kind: 'cancel'; requestId: string; runId: string; revision: number };
