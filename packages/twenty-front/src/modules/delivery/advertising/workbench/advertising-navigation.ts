import { z } from 'zod';
import { advertisingDraftClose } from '@/delivery/advertising/drafts/advertising-draft-navigation';

const advertisingNavigationSchema = z
  .object({
    sourceKind: z.enum(['META', 'MANUAL']).nullish(),
    sourceId: z.uuid().nullish(),
    projectId: z.uuid().nullish(),
    reviewId: z.uuid().nullish(),
    actionId: z.uuid().nullish(),
    requestId: z.uuid().nullish(),
    mode: z.enum(['review', 'assign', 'observe']).nullish(),
    sourceFilter: z.enum(['META', 'MANUAL']).nullish(),
    status: z.string().max(80).nullish(),
    channel: z.string().max(80).nullish(),
    reviewsAfter: z.string().max(4000).nullish(),
    observationsAfter: z.string().max(4000).nullish(),
    search: z.string().max(160).nullish(),
    after: z.string().max(4000).nullish(),
    fromDate: z.iso.date().nullish(),
    throughDate: z.iso.date().nullish(),
    draftView: z.enum(['assistants', 'prepare', 'history']).nullish(),
    draftAssistant: z.uuid().nullish(),
    draftRequest: z.uuid().nullish(),
    draftRun: z.uuid().nullish(),
    draftCancelRequest: z.uuid().nullish(),
    draftAfter: z.string().max(2000).nullish(),
  })
  .refine((value) => Boolean(value.sourceId) === Boolean(value.sourceKind))
  .refine((value) => !value.reviewId || Boolean(value.sourceId))
  .refine((value) => !value.actionId || Boolean(value.reviewId))
  .refine((value) => Boolean(value.mode) === Boolean(value.requestId))
  .refine(
    (value) =>
      !value.mode || (Boolean(value.sourceId) && Boolean(value.reviewId)),
  )
  .refine((value) => value.mode !== 'observe' || Boolean(value.actionId))
  .refine(
    (value) =>
      !(
        value.draftView ||
        value.draftRun ||
        value.draftRequest ||
        value.draftAssistant ||
        value.draftCancelRequest
      ) || Boolean(value.sourceId),
  )
  .refine((value) => !value.draftRequest || Boolean(value.draftRun))
  .refine((value) => !value.draftCancelRequest || Boolean(value.draftRun))
  .refine(
    (value) =>
      value.draftView !== 'prepare' ||
      Boolean(value.draftRequest && value.draftRun && value.draftAssistant),
  )
  .refine(
    (value) =>
      !value.fromDate ||
      !value.throughDate ||
      value.fromDate <= value.throughDate,
  );

const ADVERTISING_PARAMETERS = {
  sourceKind: 'adSource',
  sourceId: 'adReport',
  projectId: 'adProject',
  reviewId: 'adReview',
  actionId: 'adAction',
  requestId: 'adRequest',
  mode: 'adMode',
  sourceFilter: 'adSourceFilter',
  status: 'adStatus',
  channel: 'adChannel',
  reviewsAfter: 'adReviewsAfter',
  observationsAfter: 'adObservationsAfter',
  search: 'adSearch',
  after: 'adAfter',
  fromDate: 'adFrom',
  throughDate: 'adThrough',
  draftView: 'adDraftView',
  draftAssistant: 'adDraftAssistant',
  draftRequest: 'adDraftRequest',
  draftRun: 'adDraftRun',
  draftCancelRequest: 'adDraftCancelRequest',
  draftAfter: 'adDraftAfter',
} as const;

export const readAdvertisingNavigation = (params: URLSearchParams) =>
  advertisingNavigationSchema.safeParse(
    Object.fromEntries(
      Object.entries(ADVERTISING_PARAMETERS).map(([field, parameter]) => [
        field,
        params.get(parameter),
      ]),
    ),
  );

export const advertisingDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'ads');
  for (const [field, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(field);
    else next.set(field, value);
  }
  return `/delivery?${next}`;
};

export const advertisingCloseCommand = { adRequest: null, adMode: null };
export const advertisingCloseReport = {
  ...advertisingDraftClose,
  ...advertisingCloseCommand,
  adReview: null,
  adAction: null,
  adSource: null,
  adReport: null,
};
