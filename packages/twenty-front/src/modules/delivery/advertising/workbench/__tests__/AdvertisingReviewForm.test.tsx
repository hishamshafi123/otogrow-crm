import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { MemoryRouter } from 'react-router-dom';
import { NetworkStatus } from '@apollo/client';
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvertisingReviewForm } from '@/delivery/advertising/workbench/AdvertisingReviewForm';
import {
  existingAdvertisingReviewDraft,
  newAdvertisingAction,
  newAdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';
import { useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import {
  ADVERTISING_IDENTITY,
  ADVERTISING_OWNER_ID,
  ADVERTISING_REPORT_ID,
  ADVERTISING_REQUEST_ID,
  ADVERTISING_REVIEW_ID,
  ADVERTISING_TASK_ID,
  advertisingContext,
  advertisingSource,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';

import { observationReview } from '@/delivery/advertising/workbench/__tests__/advertising-observation.fixtures';

const mockContextQuery = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: () => mockContextQuery(),
}));
jest.mock('@/delivery/assistants/useAssistantAccess', () => ({
  useAssistantAccess: () => ({
    source: 'verified-advertising-test-context',
    administrator: true,
    permission: {
      ready: true,
      denied: false,
      manager: true,
      canManageRoles: true,
      scope: 'advertising-test-workspace',
      matches: () => true,
      access: { roleIds: ['admin-role'], capabilities: ['workspace.admin'] },
    },
  }),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({
    StyledAdvertisingItem: 'div',
    StyledAdvertisingBoundary: 'fieldset',
  }),
);
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftGuard: () => ({
    requestAction: (action: () => void) => action(),
  }),
  useDeliveryDraftStatus: jest.fn(),
}));
type AdvertisingChoicePickerProps = {
  label: string;
  value: { name: string } | null;
  disabled: boolean;
};
jest.mock('@/delivery/advertising/workbench/AdvertisingChoicePicker', () => ({
  AdvertisingChoicePicker: ({
    label,
    value,
    disabled,
  }: AdvertisingChoicePickerProps) => (
    <button type="button" disabled={disabled}>
      {label}: {value?.name ?? 'Choose'}
    </button>
  ),
}));

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockContextQuery.mockReturnValue({
    data: { deliveryAdvertisingContext: advertisingContext() },
    loading: false,
    error: undefined,
    networkStatus: NetworkStatus.ready,
    refetch: jest.fn(),
  });
});
const properties = () => {
  const source = advertisingSource();
  const initial = newAdvertisingReviewDraft(
    ADVERTISING_REVIEW_ID,
    ADVERTISING_REQUEST_ID,
    source,
  );
  initial.goal.kind = 'PURCHASES';
  initial.noChanges = true;
  initial.note = 'Current approved work covers the next review period.';
  const { result } = renderHook(() => useAdvertisingContext(true));
  return {
    initial,
    source,
    state: result.current,
    enabled: true,
    busy: false,
    readOnly: false,
    stale: false,
    onSave: jest.fn().mockResolvedValue(true),
  };
};
const view = (props: ReturnType<typeof properties>) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter
      initialEntries={[
        `/delivery?view=ads&adSource=${props.initial.sourceKind}&adReport=${props.initial.sourceId}&adMode=review&adReview=${props.initial.id}&adRequest=${props.initial.requestId}`,
      ]}
    >
      <AdvertisingReviewForm
        initial={props.initial}
        source={props.source}
        state={props.state}
        selection={{ kind: 'META', id: ADVERTISING_REPORT_ID }}
        scope="current-source"
        enabled={props.enabled}
        busy={props.busy}
        readOnly={props.readOnly}
        stale={props.stale}
        onSave={props.onSave}
      />
    </MemoryRouter>
  </I18nProvider>
);
const saveButton = () =>
  screen.getByRole('button', {
    name: /^(Save recommendations for review|Saving…)$/,
  });

it('requires an explicit separate-work acknowledgement even when an earlier review already adopted the legacy task', async () => {
  const props = properties();
  props.source.legacyTaskId = ADVERTISING_TASK_ID;
  props.source.legacyAdoptedReviewId = '30000000-0000-4000-8000-000000000019';
  props.source.legacyTask = {
    id: ADVERTISING_TASK_ID,
    title: 'Earlier campaign follow-up',
    revision: 7,
    state: 'APPROVED',
    ownerId: ADVERTISING_OWNER_ID,
    ownerName: 'Assigned marketer',
    reviewerId: ADVERTISING_IDENTITY.memberId,
    reviewerName: 'Amna',
    dueAt: '2026-10-30T00:00:00.000Z',
    submissionVersion: 2,
    submissionState: 'APPROVED',
    evidence: [],
  };
  props.initial.legacyHandling.mode = '';
  render(view(props));
  const user = userEvent.setup();
  expect(saveButton()).toBeDisabled();
  expect(
    screen.getByRole('option', {
      name: 'Link the existing task without changing it',
    }),
  ).toBeDisabled();
  await user.selectOptions(
    screen.getByLabelText('How should the existing follow-up be handled?'),
    'ADDITIONAL_WORK',
  );
  expect(saveButton()).toBeDisabled();
  const reason =
    'The earlier task is complete; this is a fresh no-change review.';
  await user.type(
    screen.getByLabelText(
      'How does this review relate to the existing follow-up?',
    ),
    reason,
  );
  await user.click(saveButton());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      actions: [],
      noChangeReason: props.initial.note,
      legacyHandling: {
        mode: 'ADDITIONAL_WORK',
        taskId: ADVERTISING_TASK_ID,
        taskRevision: 7,
        taskState: 'APPROVED',
        reason,
      },
    }),
  );
});

it.each([
  { known: true, value: '0' },
  { known: false, value: null },
])(
  'preserves reported zero versus unknown in a deliberate no-change review ($known)',
  async ({ known, value }) => {
    const props = properties();
    props.source.metrics[0].value = '0';
    render(view(props));
    const user = userEvent.setup();
    if (known)
      await user.selectOptions(
        screen.getByLabelText('Exact reported metric'),
        props.source.metrics[0].key,
      );
    expect(
      screen.getByText(
        new RegExp(`Reported value: ${known ? '0' : 'Unknown'}$`),
      ),
    ).toBeInTheDocument();
    await user.click(saveButton());
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: props.source.source.id,
        sourceFingerprint: props.source.fingerprint,
        actions: [],
        goal: expect.objectContaining({
          value,
          metricKey: known ? props.source.metrics[0].key : null,
          metricAdId: null,
          provenance: 'REPORT',
        }),
      }),
    );
  },
);

it('does not infer qualification or a business outcome from raw leads and unknown custom events', async () => {
  const props = properties();
  props.initial.goal.kind = 'QUALIFIED_LEADS';
  props.source.metrics.push(
    {
      key: 'raw-lead',
      label: 'Raw lead event',
      unit: 'COUNT',
      goalKinds: ['LEADS'],
      value: '9',
      provenance: 'PLATFORM_REPORTED',
      reason: null,
    },
    {
      key: 'custom-event',
      label: 'Unmapped custom event',
      unit: 'COUNT',
      goalKinds: [],
      value: '9',
      provenance: 'PLATFORM_REPORTED',
      reason: null,
    },
  );
  render(view(props));
  const user = userEvent.setup();
  expect(
    screen.queryByRole('option', { name: /Raw lead event/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: /Unmapped custom event/ }),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Outcome evidence'), 'HUMAN');
  await user.type(
    screen.getByLabelText(
      'Human-provided outcome value (leave blank if unknown)',
    ),
    '0',
  );
  expect(saveButton()).toBeDisabled();
  await user.type(
    screen.getByLabelText('Evidence for this outcome'),
    'The project manager checked CRM qualification notes.',
  );
  await user.click(saveButton());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      goal: expect.objectContaining({
        kind: 'QUALIFIED_LEADS',
        provenance: 'HUMAN',
        value: '0',
        metricKey: null,
        metricAdId: null,
        evidence: 'The project manager checked CRM qualification notes.',
      }),
    }),
  );
});

it('limits an editable action title to the native engine limit and submits current named recipients', async () => {
  const props = properties();
  props.initial.noChanges = false;
  props.initial.actions = [
    {
      ...newAdvertisingAction(props.source),
      title: '',
      rationale: 'Test a clearer product demonstration.',
      expectedResult: 'Review purchases after enough delivery.',
      evidence: 'Use the approved creative reference.',
      dueDate: '2026-11-01',
    },
  ];
  render(view(props));
  const user = userEvent.setup();
  const title = screen.getByLabelText('Action title');
  expect(title).toHaveAttribute('maxLength', '200');
  await user.type(title, 'a'.repeat(201));
  expect(title).toHaveValue('a'.repeat(200));
  expect(
    screen.getByRole('button', { name: 'Human owner: Assigned marketer' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Independent reviewer: Amna' }),
  ).toBeInTheDocument();
  await user.click(saveButton());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      actions: [
        expect.objectContaining({
          title: 'a'.repeat(200),
          ownerId: ADVERTISING_OWNER_ID,
          reviewerId: ADVERTISING_IDENTITY.memberId,
          adoptTaskId: null,
        }),
      ],
    }),
  );
});

it('retains the user draft and exact source/request identity after a failed save', async () => {
  const props = properties();
  props.onSave.mockResolvedValue(false);
  const rendered = render(view(props));
  const user = userEvent.setup();
  const note = screen.getByLabelText('Why no changes are needed');
  await user.clear(note);
  await user.type(
    note,
    'Keep this carefully reviewed explanation after a failed request.',
  );
  await user.click(saveButton());
  await waitFor(() => expect(saveButton()).toBeEnabled());
  rendered.rerender(
    view({
      ...props,
      source: { ...props.source, lastCheckedAt: '2026-10-31T06:01:00.000Z' },
    }),
  );
  expect(
    screen.getByDisplayValue(
      'Keep this carefully reviewed explanation after a failed request.',
    ),
  ).toBeInTheDocument();
  expect(props.onSave).toHaveBeenCalledTimes(1);
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      id: ADVERTISING_REVIEW_ID,
      requestId: ADVERTISING_REQUEST_ID,
      sourceId: ADVERTISING_REPORT_ID,
      sourceFingerprint: props.initial.sourceFingerprint,
    }),
  );
});

it.each(['readOnly', 'stale', 'busy', 'enabled'] as const)(
  'blocks submission during %s restrictions while preserving the local explanation',
  async (restriction) => {
    const props = properties();
    const rendered = render(view(props));
    const user = userEvent.setup();
    const note = screen.getByLabelText('Why no changes are needed');
    await user.clear(note);
    await user.type(note, 'A retained local explanation.');
    const restricted = {
      ...props,
      [restriction]: restriction === 'enabled' ? false : true,
    };
    rendered.rerender(view(restricted));
    expect(
      screen.getByDisplayValue('A retained local explanation.'),
    ).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    fireEvent.submit(
      screen.getByRole('form', { name: 'Advertising recommendation draft' }),
    );
    expect(props.onSave).not.toHaveBeenCalled();
  },
);

it('shows and preserves distinct saved review and no-change explanations', async () => {
  const props = properties();
  const review = observationReview();
  review.source = props.source.source;
  review.actions = [];
  review.state = 'DRAFT';
  review.note = 'Reviewed the latest evidence with the team.';
  review.noChangeReason =
    'Existing approved work already covers this reporting period.';
  props.initial = existingAdvertisingReviewDraft(
    review,
    ADVERTISING_REQUEST_ID,
  );
  render(view(props));
  const user = userEvent.setup();
  expect(screen.getByLabelText('Recommendation review summary')).toHaveValue(
    review.note,
  );
  expect(screen.getByLabelText('Why no changes are needed')).toHaveValue(
    review.noChangeReason,
  );
  await user.click(saveButton());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      note: review.note,
      noChangeReason: review.noChangeReason,
      actions: [],
    }),
  );
});

it('requires explicit current-responsibility confirmation while retaining the reviewed text and owned source IDs', async () => {
  const props = properties();
  props.initial.goal.metricKey = props.source.metrics[0].key;
  props.initial.goal.value = '2';
  const rendered = render(view(props));
  const current = {
    ...props,
    source: { ...props.source, fingerprint: 'c'.repeat(64) },
  };
  rendered.rerender(view(current));
  const user = userEvent.setup();
  expect(saveButton()).toBeDisabled();
  fireEvent.submit(
    screen.getByRole('form', { name: 'Advertising recommendation draft' }),
  );
  expect(props.onSave).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue(props.initial.note)).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Reconfirm current responsibilities' }),
  );
  await user.click(saveButton());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      id: props.initial.id,
      sourceId: props.initial.sourceId,
      sourceKind: props.initial.sourceKind,
      sourceFingerprint: current.source.fingerprint,
      note: props.initial.note,
      goal: expect.objectContaining({
        metricKey: props.source.metrics[0].key,
        value: '2',
      }),
    }),
  );
});

it('clears the previous outcome and target only after deliberate review of changed factual evidence', async () => {
  const props = properties();
  props.initial.goal.metricKey = props.source.metrics[0].key;
  props.initial.goal.value = '2';
  props.initial.targetCost = '25';
  const rendered = render(view(props));
  const current = {
    ...props,
    source: {
      ...props.source,
      fingerprint: 'c'.repeat(64),
      evidenceFingerprint: 'd'.repeat(64),
    },
  };
  rendered.rerender(view(current));
  const user = userEvent.setup();
  expect(saveButton()).toBeDisabled();
  expect(
    screen.getByLabelText(/Target cost per outcome \(optional\)/),
  ).toHaveValue('25');
  await user.click(
    screen.getByRole('button', {
      name: 'Use current evidence and review again',
    }),
  );
  expect(screen.getByLabelText('Exact reported metric')).toHaveValue('');
  expect(
    screen.getByLabelText(/Target cost per outcome \(optional\)/),
  ).toHaveValue('');
  expect(screen.getByDisplayValue(props.initial.note)).toBeInTheDocument();
  await user.click(saveButton());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceId: props.initial.sourceId,
      sourceFingerprint: current.source.fingerprint,
      goal: expect.objectContaining({
        metricKey: null,
        metricAdId: null,
        value: null,
        targetCostMicros: null,
      }),
    }),
  );
});
