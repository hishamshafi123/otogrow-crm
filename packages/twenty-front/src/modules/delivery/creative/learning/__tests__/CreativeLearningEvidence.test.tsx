import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { CreativeLearningEvidence } from '@/delivery/creative/learning/CreativeLearningEvidence';
import { creativeLearningBodyFixture } from '@/delivery/creative/learning/__tests__/creative-learning.fixtures';
jest.mock('@/delivery/deliveryStyles', () => ({ StyledDeliveryStack: 'div' }));
jest.mock('@/delivery/creative/learning/creativeLearningStyles', () => ({
  StyledLearningFacts: 'dl',
  StyledLearningText: 'div',
}));
beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
it('distinguishes exact-ad spend from account totals and zero from unknown while linking exact source evidence', () => {
  const body = creativeLearningBodyFixture();
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <CreativeLearningEvidence body={body} />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.getByText(formatFinanceAmountMicros('2000000', 'USD', 'en')),
  ).toBeVisible();
  expect(
    screen.queryByText(formatFinanceAmountMicros('100000000', 'USD', 'en')),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Reported purchases · 0/)).toBeVisible();
  expect(screen.getByText(/It does not verify Meta/)).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Inspect exact advertising report' }),
  ).toHaveAttribute('href', expect.stringContaining(body.sourceId));
});
it('never borrows current brief or components for a legacy approved submission', async () => {
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <CreativeLearningEvidence body={creativeLearningBodyFixture()} />
      </MemoryRouter>
    </I18nProvider>,
  );
  await userEvent.click(
    screen.getByText('Creative components, planned intent and source versions'),
  );
  expect(screen.getByText(/no frozen learning snapshot/)).toBeVisible();
  expect(
    screen.getByText('Rendered hook, base and CTA components are unknown.'),
  ).toBeVisible();
  expect(screen.getByText('Copy unknown')).toBeVisible();
});
