import { CREATIVE_PRODUCTION_STAGES } from '@/delivery/creative/production/creative-production.types';

export const creativeProductionStage = (
  value: string | null,
  params?: URLSearchParams,
) => {
  const selected = CREATIVE_PRODUCTION_STAGES.find((stage) => stage === value);
  if (selected) return selected;
  if (
    params?.get('panel') === 'task' ||
    params?.has('creativeSubmission') ||
    params?.has('creativeCompare') ||
    params?.has('creativeFeedback') ||
    params?.has('creativeQaRequest') ||
    params?.has('creativeQaRun')
  )
    return 'final';
  return params?.has('creativeAsset') ? 'assets' : 'brief';
};

export const creativeProductionDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'creative');
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'task')) {
    for (const key of [...next.keys()]) {
      if (
        key.startsWith('creative') &&
        ![
          'creativeSearch',
          'creativeProject',
          'creativeState',
          'creativeMine',
          'creativeProduction',
          'creativeAfter',
        ].includes(key)
      )
        next.delete(key);
    }
    next.delete('panel');
    next.delete('reviewBatch');
    next.delete('reviewBatchIndex');
  }
  return `/delivery?${next}`;
};

export const creativeApprovalDestination = (
  params: URLSearchParams,
  taskId: string,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'mine');
  next.set('task', taskId);
  next.set('panel', 'task');
  for (const key of [...next.keys()])
    if (
      key.startsWith('creativeQa') ||
      [
        'creativeStage',
        'creativeAsset',
        'reviewBatch',
        'reviewBatchIndex',
      ].includes(key)
    )
      next.delete(key);
  return `/delivery?${next}`;
};
