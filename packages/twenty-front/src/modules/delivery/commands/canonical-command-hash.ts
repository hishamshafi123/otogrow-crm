const canonicalCommandValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalCommandValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalCommandValue(item)]),
    );
  return value;
};
export const canonicalCommandJson = (input: unknown) =>
  JSON.stringify(canonicalCommandValue(input));
export const hashCanonicalCommandInput = async (input: unknown) => {
  const bytes = new TextEncoder().encode(canonicalCommandJson(input));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};
