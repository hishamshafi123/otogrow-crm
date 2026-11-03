import type * as ReactTypes from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvertisingObservationController } from '@/delivery/advertising/workbench/AdvertisingObservationController';
import {
  observationReview,
  observationState,
  OBSERVATION_REQUEST,
} from '@/delivery/advertising/workbench/__tests__/advertising-observation.fixtures';

let mockLightReady = true;
let mockDetailReady = true;
let mockTaskRevision = 3;
let mockDetailRevision = 3;
let mockTaskOwner = 'writer';
let mockDenied = false;
const mockRefresh = jest.fn();
jest.mock('@/delivery/advertising/workbench/useAdvertisingReview', () => ({
  useAdvertisingReview: () => {
    const review = observationReview();
    const task = review.actions[0].task;
    if (task) {
      task.revision = mockDetailRevision;
      task.ownerId = mockTaskOwner;
    }
    return {
      denied: mockDenied,
      data: mockLightReady
        ? {
            review: {
              id: review.id,
              state: review.state,
              revision: review.revision,
            },
            currentSourceFingerprint: 'source',
            blockingReasons: [],
            tasks: [
              {
                actionId: review.actions[0].id,
                taskId: 'task',
                revision: mockTaskRevision,
                state: 'APPROVED',
              },
            ],
          }
        : null,
      detail: mockDetailReady
        ? { review, currentSourceFingerprint: 'source' }
        : null,
      query: { refetch: mockRefresh },
      detailQuery: { refetch: mockRefresh },
    };
  },
}));
jest.mock('@/delivery/assistants/useAssistantPanelFocus', () => ({
  useAssistantPanelFocus: () => undefined,
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock(
  '@/delivery/advertising/workbench/AdvertisingObservationPanel',
  () => ({
    AdvertisingObservationPanel: ({
      fresh,
      consumeIntent,
      enabled,
    }: {
      fresh: boolean;
      consumeIntent: () => void;
      enabled: boolean;
    }) => {
      const { useState, useEffect } =
        jest.requireActual<typeof ReactTypes>('react');
      const [openedFresh] = useState(fresh);
      const [notes, setNotes] = useState('');
      useEffect(() => consumeIntent(), [consumeIntent]);
      return (
        <div hidden={!enabled}>
          <p>
            {openedFresh ? 'Owned observation form' : 'Check-only observation'}
          </p>
          <label>
            Test notes
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
      );
    },
  }),
);
const properties = () => {
  const review = observationReview();
  return {
    state: observationState(),
    selection: { kind: 'META' as const, id: review.source.id },
    sourceScope: 'source',
    reviewId: review.id,
    actionId: review.actions[0].id,
    requestId: OBSERVATION_REQUEST,
    fresh: true,
    consumeIntent: jest.fn(),
    enabled: true,
    authorityLost: false,
    onClose: jest.fn(),
    onSaved: jest.fn().mockResolvedValue(undefined),
    onAuthorityLost: jest.fn(),
  };
};
const view = (props: ReturnType<typeof properties>) => (
  <I18nProvider i18n={i18n}>
    <AdvertisingObservationController
      state={props.state}
      selection={props.selection}
      sourceScope={props.sourceScope}
      reviewId={props.reviewId}
      actionId={props.actionId}
      requestId={props.requestId}
      fresh={props.fresh}
      consumeIntent={props.consumeIntent}
      enabled={props.enabled}
      authorityLost={props.authorityLost}
      onClose={props.onClose}
      onSaved={props.onSaved}
      onAuthorityLost={props.onAuthorityLost}
    />
  </I18nProvider>
);
beforeEach(() => {
  i18n.load('en', {});
  i18n.activate('en');
  mockLightReady = true;
  mockDetailReady = true;
  mockTaskRevision = 3;
  mockDetailRevision = 3;
  mockTaskOwner = 'writer';
  mockDenied = false;
  mockRefresh.mockReset().mockImplementation(async () => {
    mockDetailRevision = mockTaskRevision;
  });
});
it('does not consume a fresh intent before both current state and exact work are verified', () => {
  const props = properties();
  mockLightReady = false;
  const rendered = render(view(props));
  expect(props.consumeIntent).not.toHaveBeenCalled();
  expect(screen.queryByText('Check-only observation')).not.toBeInTheDocument();
  mockLightReady = true;
  rendered.rerender(view(props));
  expect(screen.getByText('Owned observation form')).toBeVisible();
  expect(props.consumeIntent).toHaveBeenCalledTimes(1);
});
it('keeps mounted notes through a task-only revision refresh without treating old evidence as current', async () => {
  const props = properties();
  const rendered = render(view(props));
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Test notes'),
    'Keep this outcome explanation',
  );
  mockTaskRevision = 4;
  rendered.rerender(view({ ...props, fresh: false }));
  expect(
    screen.getByDisplayValue('Keep this outcome explanation'),
  ).not.toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Refresh current task and plan' }),
  );
  await waitFor(() =>
    expect(
      screen.getByDisplayValue('Keep this outcome explanation'),
    ).toBeVisible(),
  );
  expect(props.consumeIntent).toHaveBeenCalledTimes(1);
  expect(props.onAuthorityLost).not.toHaveBeenCalled();
});
it('preserves the mounted panel through temporary unreadable detail but discards it after known assignment loss', async () => {
  const props = properties();
  const rendered = render(view(props));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Test notes'), 'Private outcome notes');
  mockDetailReady = false;
  rendered.rerender(view({ ...props, fresh: false }));
  expect(screen.getByDisplayValue('Private outcome notes')).not.toBeVisible();
  mockDetailReady = true;
  rendered.rerender(view({ ...props, fresh: false }));
  expect(screen.getByDisplayValue('Private outcome notes')).toBeVisible();
  mockTaskOwner = 'another-owner';
  rendered.rerender(view({ ...props, fresh: false }));
  expect(
    screen.queryByDisplayValue('Private outcome notes'),
  ).not.toBeInTheDocument();
  expect(props.onAuthorityLost).toHaveBeenCalledTimes(1);
  mockTaskOwner = 'writer';
  rendered.rerender(view({ ...props, fresh: false }));
  expect(
    screen.queryByDisplayValue('Private outcome notes'),
  ).not.toBeInTheDocument();
});
