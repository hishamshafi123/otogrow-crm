import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MetaLeadFormTabs } from '@/meta-lead-forms/MetaLeadFormTabs';

const FORMS = ['Consultation', 'Demo'].map((name, index) => ({
  id: `form-${index}`,
  name,
  spreadsheetId: 'sheet',
  sheetId: index,
  isActive: true,
  lastSyncedAt: null,
  lastError: null,
}));
const ACTIVITY = [
  { formId: 'form-0', totalCount: 10, unreadCount: 1 },
  { formId: 'form-1', totalCount: 20, unreadCount: 3 },
];
const setup = (onSelect = jest.fn()) =>
  render(
    <I18nProvider i18n={i18n}>
      <MetaLeadFormTabs
        forms={FORMS}
        activity={ACTIVITY}
        selectedId="form-0"
        onSelect={onSelect}
      />
    </I18nProvider>,
  );

describe('Meta lead form tabs', () => {
  it('shows separate unread badges and lead totals for each form', () => {
    setup();
    const consultation = screen.getByRole('tab', {
      name: 'Consultation, 1 unread leads',
    });
    expect(consultation).toHaveAttribute('aria-selected', 'true');
    expect(within(consultation).getByText('10 leads')).toBeInTheDocument();
    expect(within(consultation).getByText('1')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Demo, 3 unread leads' }),
    ).toHaveAttribute('aria-selected', 'false');
  });

  it('selects the requested form when clicked', async () => {
    const onSelect = jest.fn();
    setup(onSelect);
    await userEvent.click(
      screen.getByRole('tab', { name: 'Demo, 3 unread leads' }),
    );
    expect(onSelect).toHaveBeenCalledWith('form-1');
  });

  it('supports keyboard switching and wraps across forms', async () => {
    const onSelect = jest.fn();
    setup(onSelect);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: 'Demo, 3 unread leads' }),
    ).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('form-1');
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: 'Consultation, 1 unread leads' }),
    ).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('form-0');
  });
});
