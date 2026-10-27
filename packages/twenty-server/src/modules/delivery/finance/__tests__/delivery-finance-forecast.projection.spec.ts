import {
  calculateFinanceForecast,
  type FinanceForecastProjectionInput,
} from 'src/modules/delivery/finance/delivery-finance-forecast.projection';

const input = (
  fields: Partial<FinanceForecastProjectionInput> = {},
): FinanceForecastProjectionInput => ({
  anchorMicros: '100000000',
  anchorClosingDate: '2026-10-26',
  businessDate: '2026-10-28',
  horizonDays: 30,
  actualMovements: [],
  expectedMovements: [],
  ...fields,
});

it('counts an actual receipt once while projecting only the invoice remainder', () => {
  const result = calculateFinanceForecast(
    input({
      anchorMicros: '0',
      actualMovements: [
        { date: '2026-10-28', kind: 'INCOME', amountMicros: '400000000' },
      ],
      expectedMovements: [
        {
          id: 'invoice',
          date: '2026-10-29',
          kind: 'INFLOW',
          amountMicros: '600000000',
        },
      ],
    }),
  );
  expect(result.currentCashMicros).toBe('400000000');
  expect(result.actualInflowMicros).toBe('400000000');
  expect(result.expectedInflowMicros).toBe('600000000');
  expect(result.endingCashMicros).toBe('1000000000');
});

it('excludes cash covered by the anchor and future recorded cash', () => {
  const result = calculateFinanceForecast(
    input({
      actualMovements: [
        { date: '2026-10-25', kind: 'INCOME', amountMicros: '900000000' },
        { date: '2026-10-26', kind: 'EXPENSE', amountMicros: '800000000' },
        { date: '2026-10-27', kind: 'EXPENSE', amountMicros: '10000000' },
        { date: '2026-10-28', kind: 'INCOME', amountMicros: '30000000' },
        { date: '2026-10-28', kind: 'SALARY', amountMicros: '20000000' },
        { date: '2026-10-29', kind: 'INCOME', amountMicros: '700000000' },
        { date: '2026-10-29', kind: 'SALARY', amountMicros: '600000000' },
      ],
    }),
  );
  expect(result.actualInflowMicros).toBe('30000000');
  expect(result.actualOutflowMicros).toBe('30000000');
  expect(result.currentCashMicros).toBe('100000000');
  expect(result.endingCashMicros).toBe('100000000');
});

it('never shifts overdue or out-of-horizon expectations into the projection', () => {
  const result = calculateFinanceForecast(
    input({
      expectedMovements: [
        {
          id: 'overdue',
          date: '2026-10-27',
          kind: 'OUTFLOW',
          amountMicros: '1000000000',
        },
        {
          id: 'today',
          date: '2026-10-28',
          kind: 'OUTFLOW',
          amountMicros: '1000000',
        },
        {
          id: 'last-day',
          date: '2026-11-26',
          kind: 'INFLOW',
          amountMicros: '2000000',
        },
        {
          id: 'later',
          date: '2026-11-27',
          kind: 'INFLOW',
          amountMicros: '3000000000',
        },
      ],
    }),
  );
  expect(result.timeline).toHaveLength(30);
  expect(result.timeline[0]).toMatchObject({
    date: '2026-10-28',
    itemIds: ['today'],
  });
  expect(result.timeline[29]).toMatchObject({
    date: '2026-11-26',
    itemIds: ['last-day'],
  });
  expect(result.expectedOutflowMicros).toBe('1000000');
  expect(result.expectedInflowMicros).toBe('2000000');
  expect(result.endingCashMicros).toBe('101000000');
});

it.each(['0', '-1', '-9223372036854775808'])(
  'retains an explicit signed cash anchor %s exactly',
  (anchorMicros) => {
    const result = calculateFinanceForecast(input({ anchorMicros }));
    expect(result.currentCashMicros).toBe(anchorMicros);
    expect(result.endingCashMicros).toBe(anchorMicros);
    expect(result.firstNegativeDate).toBe(
      anchorMicros === '0' ? null : '2026-10-28',
    );
  },
);

it('retains sub-cent amounts and aggregate results above one bigint entry', () => {
  const result = calculateFinanceForecast(
    input({
      anchorMicros: '9223372036854775807',
      actualMovements: [
        { date: '2026-10-28', kind: 'INCOME', amountMicros: '1' },
      ],
      expectedMovements: [
        {
          id: 'salary',
          date: '2026-10-28',
          kind: 'OUTFLOW',
          amountMicros: '1',
        },
        {
          id: 'collection',
          date: '2026-10-29',
          kind: 'INFLOW',
          amountMicros: '2',
        },
      ],
    }),
  );
  expect(result.currentCashMicros).toBe('9223372036854775808');
  expect(result.endingCashMicros).toBe('9223372036854775809');
  expect(result.timeline[0].closingMicros).toBe('9223372036854775807');
});

it('reports the first negative daily close even if a later collection recovers cash', () => {
  const result = calculateFinanceForecast(
    input({
      anchorMicros: '100',
      expectedMovements: [
        {
          id: 'salary',
          date: '2026-10-29',
          kind: 'OUTFLOW',
          amountMicros: '101',
        },
        {
          id: 'collection',
          date: '2026-10-31',
          kind: 'INFLOW',
          amountMicros: '1000',
        },
      ],
    }),
  );
  expect(result.firstNegativeDate).toBe('2026-10-29');
  expect(result.timeline[1].closingMicros).toBe('-1');
  expect(result.timeline[2].closingMicros).toBe('-1');
  expect(result.timeline[3].closingMicros).toBe('999');
  expect(result.endingCashMicros).toBe('999');
});

it('uses same-day net closing cash without inventing intraday order', () => {
  const result = calculateFinanceForecast(
    input({
      anchorMicros: '-100',
      expectedMovements: [
        {
          id: 'z-salary',
          date: '2026-10-28',
          kind: 'OUTFLOW',
          amountMicros: '100',
        },
        {
          id: 'a-collection',
          date: '2026-10-28',
          kind: 'INFLOW',
          amountMicros: '200',
        },
      ],
    }),
  );
  expect(result.currentCashMicros).toBe('-100');
  expect(result.firstNegativeDate).toBeNull();
  expect(result.timeline[0]).toEqual({
    date: '2026-10-28',
    inflowMicros: '200',
    outflowMicros: '100',
    closingMicros: '0',
    itemIds: ['a-collection', 'z-salary'],
  });
});

it.each([
  ['2028-02-28', '2028-03-28', 30],
  ['2026-03-07', '2026-04-05', 30],
  ['2026-10-31', '2026-11-29', 30],
  ['2026-12-31', '2027-03-30', 90],
] as const)(
  'keeps %s through %s as %i business calendar dates',
  (businessDate, endDate, horizonDays) => {
    const result = calculateFinanceForecast(
      input({ businessDate, anchorClosingDate: '2020-01-01', horizonDays }),
    );
    expect(result.timeline).toHaveLength(horizonDays);
    expect(result.timeline[0].date).toBe(businessDate);
    expect(result.timeline[horizonDays - 1].date).toBe(endDate);
    expect(new Set(result.timeline.map((day) => day.date)).size).toBe(
      horizonDays,
    );
  },
);

it('keeps input records unchanged and produces deterministic source references', () => {
  const fields = input({
    expectedMovements: [
      { id: 'z-item', date: '2026-10-28', kind: 'OUTFLOW', amountMicros: '0' },
      { id: 'a-item', date: '2026-10-28', kind: 'INFLOW', amountMicros: '1' },
    ],
  });
  const original = JSON.stringify(fields);
  const first = calculateFinanceForecast(fields);
  const second = calculateFinanceForecast({
    ...fields,
    expectedMovements: [...fields.expectedMovements].reverse(),
  });
  expect(JSON.stringify(fields)).toBe(original);
  expect(second).toEqual(first);
});
