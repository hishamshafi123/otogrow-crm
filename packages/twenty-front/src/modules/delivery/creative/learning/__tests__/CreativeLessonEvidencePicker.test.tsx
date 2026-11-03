import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { getOperationAST, type DocumentNode } from 'graphql';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreativeLessonEvidencePicker } from '@/delivery/creative/learning/CreativeLessonEvidencePicker';
import { type CreativeLearningCommandAccess } from '@/delivery/creative/learning/useCreativeLearningCommands';
import { type CreativeLearningBody } from '@/delivery/creative/learning/creative-learning.types';
import { type CreativeLessonSelection } from '@/delivery/creative/learning/creative-lesson-evidence';
import { creativeLearningLinkFixture } from '@/delivery/creative/learning/__tests__/creative-learning.fixtures';
const mockRecords = Array.from({ length: 6 }, (_, index) => {
  const record = creativeLearningLinkFixture(
    `10000000-0000-4000-8000-00000000000${index + 1}`,
  );
  record.link.adName = `Observation ${index + 1}`;
  record.body.adName = record.link.adName;
  record.link.fingerprint = String(index + 1).repeat(64);
  return record;
});
const access: CreativeLearningCommandAccess = {
  source: 'current-source',
  capture: () => () => true,
  matches: (value) => value.memberId === mockRecords[0].memberId,
};
let mockError: Error | undefined;
let mockRefresh: () => void;
const mockQuery = jest.fn(),
  mockDenied = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/creative/learning/CreativeLearningEvidence', () => ({
  CreativeLearningEvidence: ({ body }: { body: CreativeLearningBody }) => (
    <p>Frozen evidence: {body.adName}</p>
  ),
}));
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockQuery }),
  useQuery: (
    document: DocumentNode,
    {
      variables,
    }: { variables: { input: { id?: string; afterId?: string | null } } },
  ) => {
    const name = getOperationAST(document)?.name?.value;
    const record =
      mockRecords.find((value) => value.link.id === variables.input.id) ??
      mockRecords[0];
    const result =
      name === 'DeliveryCreativeAdLinkState'
        ? { deliveryCreativeAdLinkState: record }
        : {
            deliveryCreativeAdLinks: {
              workspaceId: record.workspaceId,
              memberId: record.memberId,
              userWorkspaceId: record.userWorkspaceId,
              actor: record.actor,
              observedAt: record.observedAt,
              items: (variables.input.afterId
                ? mockRecords.slice(3)
                : mockRecords.slice(0, 3)
              ).map((value) => value.link),
              totalCount: 6,
              nextCursor: variables.input.afterId
                ? null
                : mockRecords[2].link.id,
            },
          };
    return {
      data: result,
      loading: false,
      error: mockError,
      networkStatus: NetworkStatus.ready,
      refetch: async () => ({ data: result }),
    };
  },
}));
const setup = () => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    const first = mockRecords[0];
    const [items, setItems] = useState<CreativeLessonSelection[]>([
      {
        id: first.link.id,
        version: first.selectedVersion,
        fingerprint: first.link.fingerprint,
        body: first.body,
        title: first.link.adName,
      },
    ]);
    const [ready, setReady] = useState(false);
    const [notes, setNotes] = useState('');
    return (
      <>
        <label>
          Lesson notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
        </label>
        <output aria-label="Selected observations">{items.length}</output>
        <output aria-label="Evidence readiness">
          {ready ? 'Current' : 'Unverified'}
        </output>
        <CreativeLessonEvidencePicker
          state={access}
          projectId={first.body.projectId}
          items={items}
          onChange={setItems}
          onReady={setReady}
          enabled
          onDenied={mockDenied}
        />
      </>
    );
  };
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
};
beforeEach(() => {
  jest.clearAllMocks();
  mockError = undefined;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockQuery.mockImplementation(
    async ({ variables }: { variables: { input: { id: string } } }) => ({
      data: {
        deliveryCreativeAdLink: mockRecords.find(
          (value) => value.link.id === variables.input.id,
        ),
      },
    }),
  );
});
it('loads each additional exact reviewed association before selection and caps a paged evidence set at five without manual IDs', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByText('Choose more reviewed observations'));
  await user.click(screen.getByRole('button', { name: /^Observation 2 ·/ }));
  expect(mockQuery.mock.calls[0][0].variables.input.id).toBe(
    mockRecords[1].link.id,
  );
  await user.click(screen.getByRole('button', { name: /^Observation 3 ·/ }));
  await user.click(
    screen.getByRole('button', { name: 'More reviewed observations' }),
  );
  await user.click(screen.getByRole('button', { name: /^Observation 4 ·/ }));
  await user.click(screen.getByRole('button', { name: /^Observation 5 ·/ }));
  expect(screen.getByLabelText('Selected observations')).toHaveTextContent('5');
  expect(
    screen.getByRole('button', { name: /^Observation 6 ·/ }),
  ).toBeDisabled();
  expect(mockQuery).toHaveBeenCalledTimes(4);
  expect(screen.getByLabelText('Evidence readiness')).toHaveTextContent(
    'Current',
  );
});
it('retains the exact selected windows and lesson notes during transport failure and permits source rechecking without clearing the lesson', async () => {
  setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Lesson notes'),
    'Keep this interpretation',
  );
  await user.click(screen.getByText('Choose more reviewed observations'));
  await user.click(screen.getByRole('button', { name: /^Observation 2 ·/ }));
  mockError = new Error('Connection unavailable');
  act(mockRefresh);
  expect(screen.getByLabelText('Selected observations')).toHaveTextContent('2');
  expect(screen.getByLabelText('Lesson notes')).toHaveValue(
    'Keep this interpretation',
  );
  expect(screen.getByLabelText('Evidence readiness')).toHaveTextContent(
    'Unverified',
  );
  expect(mockDenied).not.toHaveBeenCalled();
  mockError = undefined;
  act(mockRefresh);
  expect(screen.getByLabelText('Evidence readiness')).toHaveTextContent(
    'Current',
  );
  expect(screen.getByLabelText('Selected observations')).toHaveTextContent('2');
});
