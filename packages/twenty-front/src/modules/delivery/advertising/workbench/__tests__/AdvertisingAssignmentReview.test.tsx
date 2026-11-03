import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvertisingAssignmentReview } from '@/delivery/advertising/workbench/AdvertisingAssignmentReview';
import { observationReview } from '@/delivery/advertising/workbench/__tests__/advertising-observation.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({
    StyledAdvertisingFacts: 'dl',
    StyledAdvertisingText: 'p',
    StyledAdvertisingItem: 'article',
  }),
);
const properties = () => ({
  review: { ...observationReview(), state: 'DRAFT' },
  enabled: true,
  busy: false,
  confirmed: false,
  onConfirmedChange: jest.fn(),
  onAssign: jest.fn(),
  onClose: jest.fn(),
});
const view = (props: ReturnType<typeof properties>) => (
  <I18nProvider i18n={i18n}>
    <AdvertisingAssignmentReview
      review={props.review}
      enabled={props.enabled}
      busy={props.busy}
      confirmed={props.confirmed}
      onConfirmedChange={props.onConfirmedChange}
      onAssign={props.onAssign}
      onClose={props.onClose}
    />
  </I18nProvider>
);
beforeEach(() => {
  i18n.load('en', {});
  i18n.activate('en');
});
it('shows named recipients, deadline and reviewed evidence before an explicit assignment', async () => {
  const props = properties();
  const rendered = render(view(props));
  const user = userEvent.setup();
  expect(screen.getByText('Editor')).toBeInTheDocument();
  expect(screen.getByText('Manager')).toBeInTheDocument();
  expect(screen.getByText('2020-02-22')).toBeInTheDocument();
  expect(screen.getByText('Approved brief')).toBeInTheDocument();
  const commit = screen.getByRole('button', {
    name: 'Approve review and assign work',
  });
  expect(commit).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed the outcome, evidence and recipients.',
    }),
  );
  expect(props.onConfirmedChange).toHaveBeenCalledWith(true);
  expect(props.onAssign).not.toHaveBeenCalled();
  rendered.rerender(view({ ...props, confirmed: true }));
  await user.click(commit);
  expect(props.onAssign).toHaveBeenCalledTimes(1);
});
it('records an explicit no-change review without inventing a task', async () => {
  const props = properties();
  props.review.actions = [];
  props.review.noChangeReason =
    'The measured result is within the agreed target.';
  render(view({ ...props, confirmed: true }));
  const user = userEvent.setup();
  expect(
    screen.getByRole('heading', {
      name: 'Review the proposed no-change decision',
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', {
      name: 'I reviewed the outcome evidence and the no-change reason.',
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('The measured result is within the agreed target.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'This records the reviewed decision without creating tasks.',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText('New task')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Record no-change review' }),
  );
  expect(props.onAssign).toHaveBeenCalledTimes(1);
});
it('separates adopted progress from a newly approved recommendation and does not run optional support', () => {
  const props = properties();
  props.review.actions[0].adoptTaskId = 'task';
  props.review.actions[0].assistantId = 'assistant';
  props.review.actions[0].assistantName = 'Creative helper';
  props.review.actions[0].assistantVersion = 3;
  props.review.legacyHandling = {
    mode: 'ADOPT',
    taskId: 'task',
    taskRevision: 3,
    taskState: 'APPROVED',
    reason: '',
  };
  render(view(props));
  expect(
    screen.getByText(
      'This review creates 0 new tasks and links 1 existing tasks.',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Any existing approval applies to the original task/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/it will not run or spend credits/),
  ).toBeInTheDocument();
  expect(props.onAssign).not.toHaveBeenCalled();
});
it('keeps a completed legacy follow-up separate when explicitly acknowledged and blocks unavailable authority', () => {
  const props = properties();
  props.review.legacyHandling = {
    mode: 'ADDITIONAL_WORK',
    taskId: 'existing',
    taskRevision: 8,
    taskState: 'APPROVED',
    reason: 'The completed monitoring task has a different scope.',
  };
  const rendered = render(view({ ...props, confirmed: true, enabled: false }));
  expect(
    screen.getByText('The completed monitoring task has a different scope.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Approve review and assign work' }),
  ).toBeDisabled();
  rendered.rerender(view({ ...props, confirmed: true, busy: true }));
  expect(
    screen.getByRole('button', { name: 'Recording decision…' }),
  ).toBeDisabled();
  expect(props.onAssign).not.toHaveBeenCalled();
});
