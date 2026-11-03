import {
  type DeliverySeoProjectsQuery,
  type DeliverySeoReportQuery,
  type DeliverySeoReportStateQuery,
  type DeliverySeoReceiptQuery,
  type DeliverySeoBodyInput,
  type DeliverySeoMetricInput,
  type DeliverySeoSaveInput,
  type DeliverySeoDecisionInput,
} from '~/generated-metadata/graphql';

export type SeoIdentity = Pick<
  DeliverySeoProjectsQuery['deliverySeoProjects'],
  'workspaceId' | 'memberId' | 'userWorkspaceId' | 'scope' | 'actor'
>;
export type SeoReport = DeliverySeoReportQuery['deliverySeoReport'];
export type SeoReportState =
  DeliverySeoReportStateQuery['deliverySeoReportState'];
export type SeoBody = Omit<
  DeliverySeoBodyInput,
  'metrics' | 'comparisonId' | 'comparisonVersion'
> & {
  metrics: (Omit<DeliverySeoMetricInput, 'value'> & { value: string | null })[];
  comparisonId: string | null;
  comparisonVersion: number | null;
};
export type SeoReceipt = DeliverySeoReceiptQuery['deliverySeoReceipt'];
export type SeoCommand =
  | { kind: 'SAVE'; input: DeliverySeoSaveInput }
  | { kind: 'DECIDE'; input: DeliverySeoDecisionInput };
export type SeoIntent = {
  requestId: string;
  reportId: string;
  projectId: string;
  revision: number;
  projectRevision: number;
  expectedCompanyId: string | null;
  taskNames?: Record<string, string>;
  body: SeoBody;
  mode: string;
};
