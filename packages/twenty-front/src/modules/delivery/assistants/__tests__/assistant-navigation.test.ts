import {
  assistantDestination,
  assistantCatalogFirstPage,
  assistantHistoryFirstPage,
} from '@/delivery/assistants/assistant-navigation';

it('replaces only explicit assistant filters and retains exact selections and surrounding task context', () => {
  const params = new URLSearchParams(
    'view=agents&task=task&assistant=selected&assistantRun=old&assistantAfter=page2&project=client&search=keep',
  );
  const url = new URL(assistantCatalogFirstPage(params), 'https://local.test');
  expect(url.searchParams.has('assistantAfter')).toBe(false);
  for (const name of ['task', 'assistant', 'assistantRun', 'project', 'search'])
    expect(url.searchParams.get(name)).toBe(params.get(name));
  expect(params.get('assistantAfter')).toBe('page2');
});
it('keeps selected old runs when recovering the first history page', () => {
  const params = new URLSearchParams(
    'view=agents&assistantView=history&assistantRunsAfter=old&assistantRun=exact&assistantStatus=FAILED',
  );
  const url = new URL(assistantHistoryFirstPage(params), 'https://local.test');
  expect(url.searchParams.has('assistantRunsAfter')).toBe(false);
  expect(url.searchParams.get('assistantRun')).toBe('exact');
  expect(assistantDestination(params, { assistantStatus: null })).not.toContain(
    'assistantStatus',
  );
});
