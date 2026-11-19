export const formatPerformanceMonth = (month: string, locale?: string) => {
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) return month;
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
};

export const formatPerformanceRate = (
  numerator: number,
  denominator: number,
  locale?: string,
) => {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 0 ||
    denominator <= 0 ||
    numerator > denominator
  )
    return null;
  return `${new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(numerator / denominator)} (${numerator}/${denominator})`;
};
