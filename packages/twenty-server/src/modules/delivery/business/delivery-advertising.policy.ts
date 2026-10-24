import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';

export const advertisingInsights = (
  records: BusinessRecord[],
  now = new Date(),
) =>
  records.flatMap((record) => {
    if (record.kind !== 'AD_REPORT' || record.status === 'VOID') return [];
    const outcomes = {
      PURCHASES: record.purchases,
      LEADS: record.qualifiedLeads,
      CALLS: record.bookedCalls,
      REGISTRATIONS: record.webinarRegistrations,
    }[record.goal];
    const today = now.toISOString().slice(0, 10);
    const ageDays = Math.floor(
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${record.date}T00:00:00Z`)) /
        86400000,
    );
    const costPerOutcome = outcomes > 0 ? record.spend / outcomes : null;
    const signal =
      record.date > today
        ? 'FUTURE_DATE'
        : record.spend === 0
          ? 'NO_SPEND'
          : record.targetCost === 0
            ? 'NO_TARGET'
            : outcomes === 0
              ? 'NO_OUTCOMES'
              : costPerOutcome !== null && costPerOutcome > record.targetCost
                ? 'ABOVE_TARGET'
                : 'WITHIN_TARGET';
    return [
      {
        id: record.id,
        date: record.date,
        goal: record.goal,
        outcomes,
        costPerOutcome,
        attributedRoas:
          record.spend > 0 ? record.attributedRevenue / record.spend : null,
        targetCost: record.targetCost,
        excessSpend:
          record.targetCost > 0
            ? Math.max(0, record.spend - outcomes * record.targetCost)
            : null,
        ageDays,
        stale: ageDays > 1,
        signal,
      },
    ];
  });
