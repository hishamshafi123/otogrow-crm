import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';

type BusinessActor = { memberId: string; isAdmin: boolean; isManager: boolean };
export const canReadBusinessRecord = (
  record: BusinessRecord,
  actor: BusinessActor,
  projectIds: Set<string>,
) => {
  if (record.kind === 'FINANCE') return actor.isAdmin;
  if (record.kind === 'CONVERSATION')
    return record.private
      ? record.ownerId === actor.memberId
      : actor.isAdmin ||
          record.ownerId === actor.memberId ||
          record.grants.some(
            (grant) => grant.memberId === actor.memberId && grant.read,
          );
  if (actor.isManager) return true;
  if (!record.projectId || !projectIds.has(record.projectId)) return false;
  if (record.kind === 'AD_REPORT' && !['APPROVED'].includes(record.status))
    return record.createdBy === actor.memberId;
  return true;
};
export const canDraftConversation = (
  record: BusinessRecord,
  actor: BusinessActor,
) =>
  record.kind === 'CONVERSATION' &&
  canReadBusinessRecord(record, actor, new Set()) &&
  (actor.isAdmin ||
    record.ownerId === actor.memberId ||
    record.grants.some(
      (grant) => grant.memberId === actor.memberId && grant.read && grant.send,
    ));

export const assertBusinessTransition = (
  record: BusinessRecord,
  actor: BusinessActor,
  status: BusinessRecord['status'],
  evidence: string | null,
) => {
  if (record.status === 'VOID' || record.kind === 'CONVERSATION')
    throw new BadRequestException(
      'This record does not support that transition.',
    );
  if (status === 'VOID') {
    if (!actor.isAdmin) throw new ForbiddenException();
    return;
  }
  if (record.kind === 'FINANCE') {
    if (
      !actor.isAdmin ||
      status !== 'PAID' ||
      record.category !== 'RECEIVABLE' ||
      record.status === 'PAID' ||
      !evidence
    )
      throw new BadRequestException(
        'An administrator must confirm an unpaid receivable with payment evidence.',
      );
    return;
  }
  if (
    status === 'REVIEW' &&
    ['DRAFT', 'CHANGES_REQUESTED'].includes(record.status)
  ) {
    if (
      !actor.isManager &&
      record.createdBy !== actor.memberId &&
      !('ownerId' in record && record.ownerId === actor.memberId) &&
      !('marketerId' in record && record.marketerId === actor.memberId)
    )
      throw new ForbiddenException();
    if (record.kind === 'RELEASE' && record.checks.some((check) => !check.done))
      throw new BadRequestException('Complete the release checklist first.');
    return;
  }
  if (
    ['APPROVED', 'CHANGES_REQUESTED'].includes(status) &&
    record.status === 'REVIEW'
  ) {
    if (
      !actor.isManager ||
      actor.memberId === record.createdBy ||
      ('ownerId' in record && record.ownerId === actor.memberId) ||
      ('marketerId' in record && record.marketerId === actor.memberId)
    )
      throw new ForbiddenException(
        'A separate project manager must review this work.',
      );
    return;
  }
  if (record.kind === 'BUDGET') {
    if (
      status === 'APPLIED' &&
      record.status === 'APPROVED' &&
      actor.memberId === record.marketerId &&
      evidence
    )
      return;
    if (
      status === 'VERIFIED' &&
      record.status === 'APPLIED' &&
      actor.isManager &&
      actor.memberId !== record.marketerId &&
      evidence
    )
      return;
  }
  if (
    record.kind === 'CONTENT' &&
    status === 'PUBLISHED' &&
    record.status === 'APPROVED' &&
    evidence &&
    (actor.isManager || actor.memberId === record.ownerId)
  )
    return;
  if (
    record.kind === 'RELEASE' &&
    status === 'RELEASED' &&
    record.status === 'APPROVED' &&
    evidence &&
    actor.isManager &&
    actor.memberId !== record.ownerId
  )
    return;
  throw new BadRequestException(
    'Review the current stage and required evidence before continuing.',
  );
};

export const financialSummary = (
  records: BusinessRecord[],
  now = new Date(),
) => {
  const finance = records.filter(
    (record): record is Extract<BusinessRecord, { kind: 'FINANCE' }> =>
      record.kind === 'FINANCE' && record.status !== 'VOID',
  );
  const currencies = [...new Set(finance.map((record) => record.currency))];
  const date = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const previousStart = new Date(now.getTime() - 60 * 86400000)
    .toISOString()
    .slice(0, 10);
  return currencies.map((currency) => {
    const rows = finance.filter(
      (record) => record.currency === currency && record.date <= date,
    );
    const settled = rows.filter((record) => record.category !== 'RECEIVABLE');
    const income = (from: string, to: string) =>
      settled
        .filter(
          (record) =>
            record.category === 'INCOME' &&
            record.date > from &&
            record.date <= to,
        )
        .reduce((total, record) => total + record.amount, 0);
    const expense = (from: string, to: string) =>
      settled
        .filter(
          (record) =>
            ['EXPENSE', 'SALARY'].includes(record.category) &&
            record.date > from &&
            record.date <= to,
        )
        .reduce((total, record) => total + record.amount, 0);
    const income30 = income(start, date),
      expense30 = expense(start, date),
      previousIncome = income(previousStart, start),
      previousExpense = expense(previousStart, start);
    const cash = settled.reduce(
      (total, record) =>
        total +
        (['OPENING_BALANCE', 'INCOME'].includes(record.category)
          ? record.amount
          : -record.amount),
      0,
    );
    const netBurn = Math.max(0, expense30 - income30);
    const projectIds = [...new Set(settled.map((record) => record.projectId))];
    return {
      currency,
      cash,
      income30,
      expense30,
      netBurn,
      runwayMonths: netBurn > 0 ? Math.max(0, cash) / netBurn : null,
      revenueGrowth:
        previousIncome > 0
          ? (income30 - previousIncome) / previousIncome
          : null,
      spendingGrowth:
        previousExpense > 0
          ? (expense30 - previousExpense) / previousExpense
          : null,
      receivables: rows
        .filter(
          (record) =>
            record.category === 'RECEIVABLE' && record.status !== 'PAID',
        )
        .reduce((total, record) => total + record.amount, 0),
      overdue: rows
        .filter(
          (record) =>
            record.category === 'RECEIVABLE' &&
            record.status !== 'PAID' &&
            record.dueDate &&
            record.dueDate < date,
        )
        .reduce((total, record) => total + record.amount, 0),
      projects: projectIds.map((projectId) => {
        const project = settled.filter(
          (record) => record.projectId === projectId && record.date > start,
        );
        const revenue = project
          .filter((record) => record.category === 'INCOME')
          .reduce((total, record) => total + record.amount, 0);
        const costs = project
          .filter((record) => ['EXPENSE', 'SALARY'].includes(record.category))
          .reduce((total, record) => total + record.amount, 0);
        return {
          projectId,
          revenue,
          costs,
          cashContribution: revenue - costs,
          margin: revenue > 0 ? (revenue - costs) / revenue : null,
        };
      }),
    };
  });
};
