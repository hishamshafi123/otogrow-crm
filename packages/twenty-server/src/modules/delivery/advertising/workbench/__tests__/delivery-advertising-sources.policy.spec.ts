import { ConflictException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { canReadManualAdvertisingReport } from 'src/modules/delivery/business/delivery-business.policy';
import { assertLegacyAdvertisingAssignmentAvailable } from 'src/modules/delivery/advertising/workbench/delivery-advertising-legacy-guard';

const report = {
  projectId: 'project-a',
  status: 'REVIEW',
  createdBy: 'author',
};
const author = { memberId: 'author', isAdmin: false, isManager: false };
const teammate = { memberId: 'teammate', isAdmin: false, isManager: false };
it('preserves manual author and approved teammate visibility only while project access is current', () => {
  expect(
    canReadManualAdvertisingReport(report, author, new Set(['project-a'])),
  ).toBe(true);
  expect(canReadManualAdvertisingReport(report, author, new Set())).toBe(false);
  expect(
    canReadManualAdvertisingReport(report, teammate, new Set(['project-a'])),
  ).toBe(false);
  expect(
    canReadManualAdvertisingReport(
      { ...report, status: 'APPROVED' },
      teammate,
      new Set(['project-a']),
    ),
  ).toBe(true);
  expect(
    canReadManualAdvertisingReport(
      report,
      { ...teammate, isManager: true },
      new Set(),
    ),
  ).toBe(true);
});
it('leaves legacy assignment available until a finalized packet exists and never mutates a source', async () => {
  const existsBy = jest.fn().mockResolvedValue(false);
  const manager = {
    getRepository: jest.fn(() => ({ existsBy })),
  } as unknown as EntityManager;
  await expect(
    assertLegacyAdvertisingAssignmentAvailable(
      manager,
      'workspace',
      'META',
      'report',
    ),
  ).resolves.toBeUndefined();
  expect(existsBy).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    sourceKind: 'META',
    sourceId: 'report',
    state: 'ASSIGNED',
  });
  existsBy.mockResolvedValue(true);
  await expect(
    assertLegacyAdvertisingAssignmentAvailable(
      manager,
      'workspace',
      'MANUAL',
      'report',
    ),
  ).rejects.toBeInstanceOf(ConflictException);
});
