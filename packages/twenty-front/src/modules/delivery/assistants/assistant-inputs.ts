export const assistantInputProblems = ({
  kind,
  requiredInputs,
  brief,
  copy,
  requirements,
  sourceUrl,
  targetUrl,
}: {
  kind: string;
  requiredInputs: string[];
  brief: string;
  copy: string;
  requirements: string;
  sourceUrl: string;
  targetUrl: string;
}) => {
  const values: Record<string, string> = { brief, copy, requirements };
  const problems = requiredInputs.filter(
    (field) => typeof values[field] !== 'string' || values[field].trim() === '',
  );
  if (kind === 'SEO') {
    for (const [field, value] of [
      ['sourceUrl', sourceUrl],
      ['targetUrl', targetUrl],
    ]) {
      try {
        if (!['http:', 'https:'].includes(new URL(value).protocol))
          problems.push(field);
      } catch {
        problems.push(field);
      }
    }
  }
  return problems;
};
