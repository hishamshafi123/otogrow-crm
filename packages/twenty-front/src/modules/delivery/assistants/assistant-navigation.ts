export const assistantDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(name);
    else next.set(name, value);
  }
  return `/delivery?${next}`;
};

export const assistantCatalogFirstPage = (params: URLSearchParams) =>
  assistantDestination(params, { assistantAfter: null });
export const assistantHistoryFirstPage = (params: URLSearchParams) =>
  assistantDestination(params, { assistantRunsAfter: null });
