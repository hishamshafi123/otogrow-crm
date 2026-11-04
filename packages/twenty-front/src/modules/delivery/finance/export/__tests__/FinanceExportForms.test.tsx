import { type ReactElement } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinanceExportProfileForm } from '@/delivery/finance/export/FinanceExportProfileForm';
import { FinanceExportSelectionForm } from '@/delivery/finance/export/FinanceExportSelectionForm';
import { FinanceExportBatchForm } from '@/delivery/finance/export/FinanceExportBatchForm';
import { FinanceExportImportForm } from '@/delivery/finance/export/FinanceExportImportForm';
import {
  financeExportBatchFixture,
  financeExportPreviewFixture,
  financeExportProfileFixture,
  financeExportsFixture,
} from '@/delivery/finance/export/__tests__/finance-export.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
jest.mock('@/delivery/finance/export/financeExportStyles', () => ({
  StyledExportFields: 'div',
  StyledExportRow: 'article',
}));
const mockSave = jest.fn();
const mockCancel = jest.fn();
const mockReload = jest.fn();
const setup = (element: ReactElement) => {
  const view = render(<I18nProvider i18n={i18n}>{element}</I18nProvider>);
  return {
    ...view,
    replace: (next: ReactElement) =>
      view.rerender(<I18nProvider i18n={i18n}>{next}</I18nProvider>),
  };
};
const profileForm = (
  profile = financeExportProfileFixture(),
  readOnly = false,
) => (
  <FinanceExportProfileForm
    initial={profile}
    allowedFields={financeExportsFixture().allowedFields}
    mappingScopes={financeExportsFixture().mappingScopes}
    projects={[]}
    readOnly={readOnly}
    busy={false}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
const selectionForm = (basis = 'CASH', readOnly = false) => (
  <FinanceExportSelectionForm
    profile={{ ...financeExportProfileFixture(), basis }}
    readOnly={readOnly}
    onReview={mockSave}
    onCancel={mockCancel}
  />
);
const batchForm = (
  snapshot = financeExportPreviewFixture(),
  readOnly = false,
  identity = 'workspace:member',
) => (
  <FinanceExportBatchForm
    snapshot={snapshot}
    identity={identity}
    selection={{
      profileId: snapshot.profile.id,
      currency: 'USD',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-28',
    }}
    readOnly={readOnly}
    checking={false}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
const importForm = (batch = financeExportBatchFixture(), readOnly = false) => (
  <FinanceExportImportForm
    batch={batch}
    readOnly={readOnly}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
beforeEach(() => {
  i18n.load('en', {});
  i18n.activate('en');
  jest.clearAllMocks();
  mockSave.mockResolvedValue(false);
});

describe('accountant export forms', () => {
  it('keeps an invalid mapping actionable after its section is collapsed', async () => {
    setup(profileForm());
    const user = userEvent.setup();
    await user.click(
      screen.getByText('Account and counterparty mappings', {
        selector: 'summary',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add mapping' }));
    await user.type(
      screen.getByLabelText('Reason for profile change'),
      'Map accounts',
    );
    await user.click(
      screen.getByText('Account and counterparty mappings', {
        selector: 'summary',
      }),
    );
    expect(
      screen.getByLabelText('Mapping 1 accounting code'),
    ).not.toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Save export profile' }),
    ).toBeDisabled();
    const requirement = screen.getByRole('button', {
      name: 'Review account and counterparty mappings: complete codes and matching values, and remove duplicate rules.',
    });
    expect(requirement).toBeVisible();
    await user.click(requirement);
    expect(
      screen.getByText('Account and counterparty mappings', {
        selector: 'summary',
      }),
    ).toHaveFocus();
    expect(screen.getByLabelText('Mapping 1 accounting code')).toBeVisible();
    await user.type(screen.getByLabelText('Mapping 1 accounting code'), '4100');
    expect(screen.queryByText('Before saving:')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save export profile' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Reason for profile change')).toHaveValue(
      'Map accounts',
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('keeps duplicate CSV headers actionable after closing the columns section', async () => {
    setup(profileForm());
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Column 2 header'));
    await user.type(screen.getByLabelText('Column 2 header'), 'Reference');
    await user.type(
      screen.getByLabelText('Reason for profile change'),
      'Update columns',
    );
    await user.click(screen.getByText('CSV columns', { selector: 'summary' }));
    expect(screen.getByLabelText('Column 2 header')).not.toBeVisible();
    await user.click(
      screen.getByRole('button', {
        name: 'Review CSV columns: choose supported fields and unique plain-text headers.',
      }),
    );
    expect(
      screen.getByText('CSV columns', { selector: 'summary' }),
    ).toHaveFocus();
    expect(screen.getByLabelText('Column 2 header')).toHaveValue('Reference');
    await user.clear(screen.getByLabelText('Column 2 header'));
    await user.type(screen.getByLabelText('Column 2 header'), 'Amount');
    expect(
      screen.getByRole('button', { name: 'Save export profile' }),
    ).toBeEnabled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('requires explicit cash dates and currency without guessing a reporting period', async () => {
    setup(selectionForm());
    expect(screen.getByLabelText('Cash date from')).toHaveValue('');
    expect(screen.getByLabelText('Cash date to')).toHaveValue('');
    expect(screen.queryByLabelText('Service month')).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText('Export currency'),
      'USD',
    );
    fireEvent.change(screen.getByLabelText('Cash date from'), {
      target: { value: '2026-10-01' },
    });
    expect(
      screen.getByRole('button', { name: 'Review export' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Cash date to'), {
      target: { value: '2026-10-28' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Review export' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'USD',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-28',
        serviceMonth: null,
        accountingDate: null,
      }),
    );
  });
  it('keeps recognition separate and requires an explicitly chosen accounting date', async () => {
    setup(selectionForm('RECOGNITION'));
    expect(screen.queryByLabelText('Cash date from')).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText('Export currency'),
      'EUR',
    );
    fireEvent.change(screen.getByLabelText('Service month'), {
      target: { value: '2026-09' },
    });
    expect(
      screen.getByLabelText('Accounting date for this handoff'),
    ).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Review export' }),
    ).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText('Accounting date for this handoff'),
      { target: { value: '2026-10-15' } },
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Review export' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'EUR',
        serviceMonth: '2026-09',
        accountingDate: '2026-10-15',
        dateFrom: null,
        dateTo: null,
      }),
    );
  });
  it('blocks source selection after a profile revision changes', async () => {
    const view = setup(selectionForm());
    await userEvent.selectOptions(
      screen.getByLabelText('Export currency'),
      'USD',
    );
    view.replace(
      <FinanceExportSelectionForm
        profile={{ ...financeExportProfileFixture(), revision: 2 }}
        readOnly={false}
        onReview={mockSave}
        onCancel={mockCancel}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('profile changed');
    expect(
      screen.getByRole('button', { name: 'Review export' }),
    ).toBeDisabled();
  });
  it('saves explicit profile settings and column ordering without inventing account codes', async () => {
    setup(profileForm());
    await userEvent.click(
      screen.getByRole('button', { name: 'Move column 2 earlier' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Column separator'),
      'TAB',
    );
    await userEvent.selectOptions(screen.getByLabelText('Decimal places'), '2');
    await userEvent.type(
      screen.getByLabelText('Reason for profile change'),
      'Match accountant sample',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save export profile' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 1,
        delimiter: 'TAB',
        precision: 2,
        mappings: [],
        reason: 'Match accountant sample',
        columns: [
          { header: 'Amount', field: 'AMOUNT', constant: null },
          { header: 'Reference', field: 'SOURCE_REFERENCE', constant: null },
        ],
      }),
    );
  });
  it.each(['Reference', '=SUM(A1)'])(
    'blocks duplicate or formula-like header %s',
    async (header) => {
      setup(profileForm());
      await userEvent.clear(screen.getByLabelText('Column 2 header'));
      await userEvent.type(screen.getByLabelText('Column 2 header'), header);
      await userEvent.type(
        screen.getByLabelText('Reason for profile change'),
        'Review template',
      );
      expect(
        screen.getByRole('button', { name: 'Save export profile' }),
      ).toBeDisabled();
    },
  );
  it('configures an explicit default mapping and rejects a duplicate rule', async () => {
    setup(profileForm());
    await userEvent.click(
      screen.getByText('Account and counterparty mappings', {
        selector: 'summary',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add mapping' }));
    await userEvent.type(
      screen.getByLabelText('Mapping 1 accounting code'),
      '4100',
    );
    await userEvent.type(
      screen.getByLabelText('Reason for profile change'),
      'Accountant confirmed code',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save export profile' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        mappings: [
          { target: 'ACCOUNT', scope: 'DEFAULT', key: null, value: '4100' },
        ],
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add mapping' }));
    await userEvent.type(
      screen.getByLabelText('Mapping 2 accounting code'),
      '4200',
    );
    expect(
      screen.getByRole('button', { name: 'Save export profile' }),
    ).toBeDisabled();
  });
  it('retains a profile draft read-only through lost management authority and flags stale revisions', async () => {
    const view = setup(profileForm());
    await userEvent.type(
      screen.getByLabelText('Reason for profile change'),
      'Keep my review',
    );
    const input = screen.getByLabelText('Reason for profile change');
    view.replace(profileForm(financeExportProfileFixture(), true));
    expect(input).toHaveValue('Keep my review');
    expect(input).toBeDisabled();
    view.replace(
      profileForm({ ...financeExportProfileFixture(), revision: 2 }),
    );
    expect(input).toHaveValue('Keep my review');
    expect(
      screen.getByRole('button', { name: 'Save export profile' }),
    ).toBeDisabled();
  });
  it('lets a reader create a reviewed first batch and uses a stable command on retry', async () => {
    setup(batchForm());
    const button = screen.getByRole('button', { name: 'Create export batch' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    const retry = await screen.findByRole('button', {
      name: 'Check earlier batch request',
    });
    await waitFor(() => expect(retry).toBeEnabled());
    await userEvent.click(retry);
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave.mock.calls[1][0]).toEqual(mockSave.mock.calls[0][0]);
    expect(mockSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        expectedPreviewToken: 'a'.repeat(64),
        acknowledgeRepeatedSources: false,
        reexportReason: null,
      }),
    );
  });
  it('requires deliberate duplicate-source acknowledgement and reason before re-export', async () => {
    const snapshot = financeExportPreviewFixture();
    snapshot.totals.repeatedSourceCount = 1;
    setup(batchForm(snapshot));
    const button = screen.getByRole('button', { name: 'Create export batch' });
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Reason for re-export'),
      'Correct accountant mapping',
    );
    await userEvent.click(button);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgeRepeatedSources: true,
        reexportReason: 'Correct accountant mapping',
      }),
    );
  });
  it('gates an uncertain earlier request by current authority and its original identity', async () => {
    const snapshot = financeExportPreviewFixture();
    const view = setup(batchForm(snapshot));
    await userEvent.click(
      screen.getByRole('button', { name: 'Create export batch' }),
    );
    const retry = await screen.findByRole('button', {
      name: 'Check earlier batch request',
    });
    view.replace(batchForm(snapshot, true));
    expect(retry).toBeDisabled();
    view.replace(batchForm(snapshot, false, 'foreign:member'));
    expect(retry).toBeDisabled();
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
  it('preserves a valid external import reference longer than 240 characters', async () => {
    setup(importForm());
    const reference = 'A'.repeat(300);
    await userEvent.type(
      screen.getByLabelText('External import reference'),
      reference,
    );
    await userEvent.type(
      screen.getByLabelText('Reason for import status change'),
      'Accountant supplied full reference',
    );
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark manually imported' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ reference }),
    );
  });
  it('preserves re-export review but prevents saving a stale source token', async () => {
    const snapshot = financeExportPreviewFixture();
    snapshot.totals.repeatedSourceCount = 1;
    const view = setup(batchForm(snapshot));
    await userEvent.type(
      screen.getByLabelText('Reason for re-export'),
      'Keep this reason',
    );
    view.replace(batchForm({ ...snapshot, previewToken: 'b'.repeat(64) }));
    expect(screen.getByLabelText('Reason for re-export')).toHaveValue(
      'Keep this reason',
    );
    expect(
      screen.getByRole('button', { name: 'Create export batch' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('blocks batch creation when precision or mapping errors are unresolved', () => {
    setup(
      batchForm({
        ...financeExportPreviewFixture(),
        canCreate: false,
        errors: ['PRECISION_UNSUPPORTED'],
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Create export batch' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Resolve the export errors',
    );
  });
  it('requires external reference, reason and human confirmation for manual import', async () => {
    setup(importForm());
    await userEvent.type(
      screen.getByLabelText('Reason for import status change'),
      'Accountant confirmed import',
    );
    await userEvent.click(screen.getByRole('checkbox'));
    expect(
      screen.getByRole('button', { name: 'Mark manually imported' }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('External import reference'),
      'IMPORT-789',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark manually imported' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: financeExportBatchFixture().id,
        revision: 1,
        status: 'CONFIRMED',
        reference: 'IMPORT-789',
        reason: 'Accountant confirmed import',
      }),
    );
    expect(mockSave.mock.calls[0][0].commandId).toBeDefined();
  });
  it('records reversal without claiming an external transaction was undone', async () => {
    setup(
      importForm({
        ...financeExportBatchFixture(),
        importStatus: 'CONFIRMED',
        importReference: 'IMPORT-789',
      }),
    );
    expect(screen.getByText(/does not undo transactions/)).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText('Reason for import status change'),
      'Wrong external file imported',
    );
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Reverse import confirmation' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REVERSED', reference: 'IMPORT-789' }),
    );
  });
  it('retains manual-import evidence on failed save and verified revision change', async () => {
    const view = setup(importForm());
    await userEvent.type(
      screen.getByLabelText('External import reference'),
      'IMPORT-KEEP',
    );
    await userEvent.type(
      screen.getByLabelText('Reason for import status change'),
      'Keep evidence',
    );
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Mark manually imported' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('not confirmed');
    view.replace(importForm({ ...financeExportBatchFixture(), revision: 2 }));
    expect(screen.getByLabelText('External import reference')).toHaveValue(
      'IMPORT-KEEP',
    );
    expect(
      screen.getByRole('button', { name: 'Mark manually imported' }),
    ).toBeDisabled();
  });
});
