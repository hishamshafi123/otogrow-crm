import { type ReactElement } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EscalationRuleForm } from '@/delivery/founder/escalation/EscalationRuleForm';
import { EscalationConfirmForm } from '@/delivery/founder/escalation/EscalationConfirmForm';
import { type EscalationRule } from '@/delivery/founder/escalation/escalation.types';
import {
  escalationRuleFixture,
  escalationSnapshotFixture,
} from '@/delivery/founder/escalation/__tests__/escalation.fixtures';
import { FOUNDER_OWNER_ID } from '@/delivery/founder/__tests__/founder.fixtures';

const mockSave = jest.fn();
const mockCancel = jest.fn();
const mockReload = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
}));
jest.mock('@/delivery/founder/escalation/escalationStyles', () => ({
  StyledEscalationFields: 'div',
}));
jest.mock('@/delivery/founder/escalation/EscalationPreview', () => ({
  EscalationPreview: () => <p>Read-only source preview</p>,
}));
const setup = (element: ReactElement) => {
  const wrap = (content: ReactElement) => (
    <I18nProvider i18n={i18n}>
      <MemoryRouter>{content}</MemoryRouter>
    </I18nProvider>
  );
  const view = render(wrap(element));
  return { replace: (next: ReactElement) => view.rerender(wrap(next)) };
};
const ruleForm = (initial: EscalationRule | null = null, readOnly = false) => (
  <EscalationRuleForm
    initial={initial}
    catalog={escalationSnapshotFixture()}
    identity="workspace:member"
    readOnly={readOnly}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
const enableForm = (signature = 'rule:1:preview-a', readOnly = false) => (
  <EscalationConfirmForm
    title="Enable founder alert rule"
    description="Review current saved rule"
    confirmLabel="Enable this reviewed rule"
    submitLabel="Enable this rule"
    signature={signature}
    identity="workspace:member"
    readOnly={readOnly}
    adoptionRequired
    buildInput={(commandId, reason, adoptLegacyRouting) => ({
      commandId,
      reason,
      adoptLegacyRouting,
      revision: 1,
      previewToken: 'preview-a',
      enabled: true,
    })}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  mockSave.mockResolvedValue(false);
});
describe('founder alert rule forms', () => {
  it('does not invent a recipient, condition or scope and permits a paused save without Telegram setup', async () => {
    setup(ruleForm());
    expect(
      screen.getByLabelText('Alert follow-up owner and Telegram recipient'),
    ).toHaveValue('');
    expect(
      screen.getByLabelText('Notify for one factual condition'),
    ).toHaveValue('');
    expect(screen.getByLabelText('Client scope')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Save rule paused' }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Rule name'),
      'Only chosen overdue work',
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Notify for one factual condition'),
      'TASK_OVERDUE',
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Alert follow-up owner and Telegram recipient'),
      FOUNDER_OWNER_ID,
    );
    await userEvent.selectOptions(screen.getByLabelText('Client scope'), 'ALL');
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Prepare routing for review',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save rule paused' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        condition: 'TASK_OVERDUE',
        recipientId: FOUNDER_OWNER_ID,
        projectScope: 'ALL',
        projectIds: [],
        includeCompany: false,
        repeatMode: 'ONCE',
        repeatHours: null,
        maxSends: 1,
      }),
    );
    expect(mockSave.mock.calls[0][0].enabled).toBeUndefined();
    expect(mockSave.mock.calls[0][0].adoptLegacyRouting).toBeUndefined();
  });
  it('supports company-only scope while rejecting a truly empty selected scope', async () => {
    const initial = {
      ...escalationRuleFixture(),
      projectIds: [],
      includeCompany: false,
    };
    setup(ruleForm(initial));
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Only company sources',
    );
    expect(
      screen.getByRole('button', { name: 'Save rule paused' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByLabelText('Include company and unassigned sources'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save rule paused' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        projectScope: 'SELECTED',
        projectIds: [],
        includeCompany: true,
      }),
    );
  });
  it('requires explicit monthly scope rather than assuming the current month', async () => {
    setup(ruleForm(escalationRuleFixture()));
    await userEvent.selectOptions(
      screen.getByLabelText('Notify for one factual condition'),
      'MONTHLY_NEGATIVE_RESULT',
    );
    expect(screen.getByLabelText('Service month')).toHaveValue('');
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Review recorded month',
    );
    expect(
      screen.getByRole('button', { name: 'Save rule paused' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Service month'), {
      target: { value: '2026-09' },
    });
    await userEvent.selectOptions(
      screen.getByLabelText('Currency scope (optional)'),
      'EUR',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save rule paused' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ serviceMonth: '2026-09', currency: 'EUR' }),
    );
  });
  it('clears irrelevant monthly/currency scope when choosing a nonmonetary condition', async () => {
    setup(
      ruleForm({
        ...escalationRuleFixture(),
        condition: 'MONTHLY_NEGATIVE_RESULT',
        serviceMonth: '2026-09',
        currency: 'USD',
      }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Notify for one factual condition'),
      'MANUAL_CLIENT_CONCERN',
    );
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Use the recorded client concern',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save rule paused' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ serviceMonth: null, currency: null }),
    );
  });
  it('requires bounded explicit interval and send count and preserves ONCE semantics', async () => {
    setup(ruleForm(escalationRuleFixture()));
    await userEvent.selectOptions(
      screen.getByLabelText('Repeat policy'),
      'INTERVAL',
    );
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Repeat only after accepted sends',
    );
    expect(
      screen.getByRole('button', { name: 'Save rule paused' }),
    ).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('Hours between successful sends'),
      '12',
    );
    await userEvent.type(screen.getByLabelText('Maximum sends per issue'), '3');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save rule paused' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        repeatMode: 'INTERVAL',
        repeatHours: 12,
        maxSends: 3,
      }),
    );
  });
  it('previews without saving or enabling and retains the configuration through current authority loss', async () => {
    const view = setup(ruleForm(escalationRuleFixture()));
    await userEvent.click(
      screen.getByRole('button', { name: 'Preview current matches' }),
    );
    expect(screen.getByText('Read-only source preview')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Keep my rule draft',
    );
    const reason = screen.getByLabelText('Reason for rule configuration');
    view.replace(ruleForm(escalationRuleFixture(), true));
    expect(reason).toHaveValue('Keep my rule draft');
    expect(reason).toBeDisabled();
  });
  it('preserves a stale rule draft and freezes the original paused-save request for explicit retry', async () => {
    const view = setup(ruleForm(escalationRuleFixture()));
    await userEvent.type(
      screen.getByLabelText('Reason for rule configuration'),
      'Keep original request',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save rule paused' }),
    );
    const original = mockSave.mock.calls[0][0];
    view.replace(ruleForm({ ...escalationRuleFixture(), revision: 2 }));
    expect(screen.getByLabelText('Reason for rule configuration')).toHaveValue(
      'Keep original request',
    );
    expect(
      screen.getByRole('button', { name: 'Save rule paused' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Check earlier paused save' }),
    );
    expect(mockSave.mock.calls[1][0]).toEqual(original);
  });
  it('requires enable confirmation and explicit legacy adoption rather than enabling during preview', async () => {
    setup(enableForm());
    await userEvent.type(
      screen.getByLabelText('Reason for this change'),
      'Adopt reviewed routing',
    );
    await userEvent.click(screen.getByLabelText('Enable this reviewed rule'));
    expect(
      screen.getByRole('button', { name: 'Enable this rule' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByLabelText(/Adopt configurable founder routing/),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Enable this rule' }),
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        adoptLegacyRouting: true,
        enabled: true,
        revision: 1,
        previewToken: 'preview-a',
      }),
    );
  });
  it('keeps enable acknowledgements on stale preview and retries only the frozen earlier request', async () => {
    const view = setup(enableForm());
    await userEvent.type(
      screen.getByLabelText('Reason for this change'),
      'Original review',
    );
    await userEvent.click(screen.getByLabelText('Enable this reviewed rule'));
    await userEvent.click(
      screen.getByLabelText(/Adopt configurable founder routing/),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Enable this rule' }),
    );
    const original = mockSave.mock.calls[0][0];
    view.replace(enableForm('rule:2:preview-b'));
    expect(
      screen.getByRole('button', { name: 'Enable this rule' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Reason for this change')).toHaveValue(
      'Original review',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Check earlier request' }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Check earlier request' }),
    );
    expect(mockSave.mock.calls[1][0]).toEqual(original);
  });
});

it('keeps minimum review wait explicit and separate from repeats', async () => {
  setup(
    ruleForm({ ...escalationRuleFixture(), condition: 'TASK_REVIEW_WAIT' }),
  );
  const wait = screen.getByLabelText('Minimum pending review wait in hours', {
    exact: true,
  });
  expect(wait).toHaveValue(null);
  await userEvent.type(wait, '12');
  await userEvent.type(
    screen.getByLabelText('Reason for rule configuration'),
    'Use the chosen review wait',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save rule paused' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      minimumReviewWaitHours: 12,
      repeatMode: 'ONCE',
      repeatHours: null,
    }),
  );
});
it('does not carry a review-age threshold into unrelated alert conditions', async () => {
  setup(
    ruleForm({
      ...escalationRuleFixture(),
      condition: 'TASK_REVIEW_WAIT',
      minimumReviewWaitHours: 12,
    }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Notify for one factual condition'),
    'TASK_OVERDUE',
  );
  expect(
    screen.queryByLabelText('Minimum pending review wait in hours', {
      exact: true,
    }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText('Reason for rule configuration'),
    'Only the deadline condition',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save rule paused' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({ minimumReviewWaitHours: null }),
  );
});
