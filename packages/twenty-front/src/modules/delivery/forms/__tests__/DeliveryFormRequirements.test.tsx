import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryFormRequirements } from '@/delivery/forms/DeliveryFormRequirements';

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

it('reveals nested sections and focuses the required field through the keyboard without submitting', async () => {
  const submit = jest.fn((event: FormEvent<HTMLFormElement>) =>
    event.preventDefault(),
  );
  render(
    <I18nProvider i18n={i18n}>
      <form onSubmit={submit}>
        <details>
          <summary>Advanced options</summary>
          <details>
            <summary>Account mappings</summary>
            <label>
              Account code
              <input id="account-code" defaultValue="Kept draft" />
            </label>
          </details>
        </details>
        <DeliveryFormRequirements
          requirements={[
            { targetId: 'account-code', message: 'Review the account code.' },
          ]}
        />
      </form>
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.tab();
  await user.tab();
  expect(
    screen.getByRole('button', { name: 'Review the account code.' }),
  ).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('Account code')).toBeVisible();
  expect(screen.getByLabelText('Account code')).toHaveFocus();
  expect(screen.getByLabelText('Account code')).toHaveValue('Kept draft');
  expect(submit).not.toHaveBeenCalled();
});

it('opens and focuses a section summary while preserving its contents', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <form>
        <details>
          <summary id="columns">CSV columns</summary>
          <label>
            Column name
            <input defaultValue="Date" />
          </label>
        </details>
        <DeliveryFormRequirements
          requirements={[
            { targetId: 'columns', message: 'Review CSV columns.' },
          ]}
        />
      </form>
    </I18nProvider>,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Review CSV columns.' }),
  );
  expect(
    screen.getByText('CSV columns', { selector: 'summary' }),
  ).toHaveFocus();
  expect(screen.getByLabelText('Column name')).toBeVisible();
  expect(screen.getByLabelText('Column name')).toHaveValue('Date');
});

it('does not reveal or focus a target belonging to another form', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <form>
        <details>
          <summary>Other profile</summary>
          <label>
            Other account
            <input id="other-account" />
          </label>
        </details>
      </form>
      <form>
        <DeliveryFormRequirements
          requirements={[
            { targetId: 'other-account', message: 'Review account.' },
          ]}
        />
      </form>
    </I18nProvider>,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Review account.' }),
  );
  expect(screen.getByLabelText('Other account')).not.toBeVisible();
  expect(screen.getByRole('button', { name: 'Review account.' })).toHaveFocus();
});

it('omits the summary when all requirements are met', () => {
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryFormRequirements requirements={[]} />
    </I18nProvider>,
  );
  expect(screen.queryByText('Before saving:')).not.toBeInTheDocument();
});
import { type FormEvent } from 'react';
