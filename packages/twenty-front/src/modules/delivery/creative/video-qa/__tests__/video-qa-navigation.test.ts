import {
  retainsVideoQaCancellation,
  retainsVideoQaReader,
  videoQaDestination,
  videoQaSelectionValid,
  VIDEO_QA_CLOSE,
} from '@/delivery/creative/video-qa/video-qa-navigation';
import {
  VIDEO_QA_TASK_ID,
  VIDEO_QA_REQUEST_ID,
  VIDEO_QA_RUN_ID,
} from '@/delivery/creative/video-qa/__tests__/video-qa.fixtures';

const location = (changes: Record<string, string | null> = {}) => ({
  pathname: '/delivery',
  search: new URL(
    videoQaDestination(
      new URLSearchParams({
        view: 'creative',
        task: VIDEO_QA_TASK_ID,
        creativeStage: 'final',
        creativeQaRequest: VIDEO_QA_REQUEST_ID,
        creativeAsset: 'source-asset',
      }),
      changes,
    ),
    'https://os.invalid',
  ).search,
});
it('retains a preparation through its own reader/history navigation but never a different task, stage, source or start request', () => {
  const current = location();
  expect(
    retainsVideoQaReader(current, location({ creativeQaRun: VIDEO_QA_RUN_ID })),
  ).toBe(true);
  expect(
    retainsVideoQaReader(
      current,
      location({ creativeQaAfter: VIDEO_QA_RUN_ID }),
    ),
  ).toBe(true);
  const changes: Record<string, string | null>[] = [
    { task: VIDEO_QA_RUN_ID },
    { creativeStage: 'brief' },
    { creativeAsset: 'different-source' },
    { creativeQaRequest: VIDEO_QA_RUN_ID },
    { creativeProject: 'another-project' },
  ];
  for (const change of changes)
    expect(retainsVideoQaReader(current, location(change))).toBe(false);
  expect(
    retainsVideoQaReader(current, { ...current, pathname: '/outside' }),
  ).toBe(false);
});
it('keeps a frozen cancellation while returning to preparation/history but blocks different cancel or run identities', () => {
  const current = location({
    creativeQaRun: VIDEO_QA_RUN_ID,
    creativeQaCancel: VIDEO_QA_TASK_ID,
  });
  expect(
    retainsVideoQaCancellation(
      current,
      location({
        creativeQaRun: VIDEO_QA_RUN_ID,
        creativeQaCancel: VIDEO_QA_TASK_ID,
        creativeQaRequest: null,
        creativeQaAfter: VIDEO_QA_REQUEST_ID,
      }),
    ),
  ).toBe(true);
  expect(
    retainsVideoQaCancellation(
      current,
      location({
        creativeQaRun: VIDEO_QA_REQUEST_ID,
        creativeQaCancel: VIDEO_QA_TASK_ID,
      }),
    ),
  ).toBe(false);
  expect(
    retainsVideoQaCancellation(
      current,
      location({
        creativeQaRun: VIDEO_QA_RUN_ID,
        creativeQaCancel: VIDEO_QA_REQUEST_ID,
      }),
    ),
  ).toBe(false);
  expect(
    retainsVideoQaCancellation(
      current,
      location({ creativeQaRun: VIDEO_QA_RUN_ID, creativeQaCancel: null }),
    ),
  ).toBe(false);
});
it('clears all QA keys when changing task while retaining queue filters', () => {
  const current = new URLSearchParams({
    view: 'creative',
    task: VIDEO_QA_TASK_ID,
    creativeSearch: 'product',
    creativeProject: 'brand',
    creativeStage: 'final',
    creativeQaRequest: VIDEO_QA_REQUEST_ID,
    creativeQaRun: VIDEO_QA_RUN_ID,
    creativeQaCancel: VIDEO_QA_TASK_ID,
    creativeQaAfter: VIDEO_QA_RUN_ID,
  });
  const next = new URL(
    videoQaDestination(current, { task: VIDEO_QA_RUN_ID }),
    'https://os.invalid',
  ).searchParams;
  expect(next.get('task')).toBe(VIDEO_QA_RUN_ID);
  expect(next.get('creativeSearch')).toBe('product');
  expect(next.get('creativeProject')).toBe('brand');
  for (const key of Object.keys(VIDEO_QA_CLOSE))
    expect(next.has(key)).toBe(false);
});
it('rejects malformed request identities and cancellation without an exact run', () => {
  expect(videoQaSelectionValid(new URLSearchParams())).toBe(true);
  expect(
    videoQaSelectionValid(
      new URLSearchParams({ creativeQaRequest: VIDEO_QA_REQUEST_ID }),
    ),
  ).toBe(true);
  expect(
    videoQaSelectionValid(
      new URLSearchParams({ creativeQaRequest: 'invented' }),
    ),
  ).toBe(false);
  expect(
    videoQaSelectionValid(
      new URLSearchParams({ creativeQaCancel: VIDEO_QA_REQUEST_ID }),
    ),
  ).toBe(false);
  expect(
    videoQaSelectionValid(
      new URLSearchParams({
        creativeQaCancel: VIDEO_QA_REQUEST_ID,
        creativeQaRun: VIDEO_QA_RUN_ID,
      }),
    ),
  ).toBe(true);
});
