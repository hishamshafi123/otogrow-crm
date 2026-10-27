export type FinanceForecastActualMovement = {
  date: string;
  kind: 'INCOME' | 'EXPENSE' | 'SALARY';
  amountMicros: string;
};
export type FinanceForecastExpectedMovement = {
  id: string;
  date: string;
  kind: 'INFLOW' | 'OUTFLOW';
  amountMicros: string;
};
export type FinanceForecastProjectionInput = {
  anchorMicros: string;
  anchorClosingDate: string;
  businessDate: string;
  horizonDays: 30 | 90;
  actualMovements: FinanceForecastActualMovement[];
  expectedMovements: FinanceForecastExpectedMovement[];
};
export type FinanceForecastDay = {
  date: string;
  inflowMicros: string;
  outflowMicros: string;
  closingMicros: string;
  itemIds: string[];
};
export type FinanceForecastProjection = {
  actualInflowMicros: string;
  actualOutflowMicros: string;
  currentCashMicros: string;
  expectedInflowMicros: string;
  expectedOutflowMicros: string;
  endingCashMicros: string;
  firstNegativeDate: string | null;
  timeline: FinanceForecastDay[];
};

export const calculateFinanceForecast = (
  input: FinanceForecastProjectionInput,
): FinanceForecastProjection => {
  let actualInflow = BigInt(0);
  let actualOutflow = BigInt(0);
  for (const movement of input.actualMovements) {
    if (
      movement.date <= input.anchorClosingDate ||
      movement.date > input.businessDate
    )
      continue;
    if (movement.kind === 'INCOME')
      actualInflow += BigInt(movement.amountMicros);
    else actualOutflow += BigInt(movement.amountMicros);
  }
  const currentCash = BigInt(input.anchorMicros) + actualInflow - actualOutflow;
  const movementsByDate = new Map<
    string,
    { inflow: bigint; outflow: bigint; itemIds: string[] }
  >();
  for (const movement of input.expectedMovements) {
    const day = movementsByDate.get(movement.date) ?? {
      inflow: BigInt(0),
      outflow: BigInt(0),
      itemIds: [],
    };
    if (movement.kind === 'INFLOW') day.inflow += BigInt(movement.amountMicros);
    else day.outflow += BigInt(movement.amountMicros);
    day.itemIds.push(movement.id);
    movementsByDate.set(movement.date, day);
  }

  const firstDay = new Date(`${input.businessDate}T12:00:00.000Z`);
  let expectedInflow = BigInt(0);
  let expectedOutflow = BigInt(0);
  let closingCash = currentCash;
  let firstNegativeDate: string | null = null;
  const timeline: FinanceForecastDay[] = [];
  for (let dayIndex = 0; dayIndex < input.horizonDays; dayIndex++) {
    // Calendar arithmetic in UTC preserves the selected business date across DST.
    const day = new Date(firstDay);
    day.setUTCDate(firstDay.getUTCDate() + dayIndex);
    const date = day.toISOString().slice(0, 10);
    const movements = movementsByDate.get(date);
    const inflow = movements?.inflow ?? BigInt(0);
    const outflow = movements?.outflow ?? BigInt(0);
    expectedInflow += inflow;
    expectedOutflow += outflow;
    closingCash += inflow - outflow;
    if (closingCash < BigInt(0) && firstNegativeDate === null)
      firstNegativeDate = date;
    timeline.push({
      date,
      inflowMicros: inflow.toString(),
      outflowMicros: outflow.toString(),
      closingMicros: closingCash.toString(),
      itemIds: movements ? [...movements.itemIds].sort() : [],
    });
  }
  return {
    actualInflowMicros: actualInflow.toString(),
    actualOutflowMicros: actualOutflow.toString(),
    currentCashMicros: currentCash.toString(),
    expectedInflowMicros: expectedInflow.toString(),
    expectedOutflowMicros: expectedOutflow.toString(),
    endingCashMicros: closingCash.toString(),
    firstNegativeDate,
    timeline,
  };
};
