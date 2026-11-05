import { type ComponentProps } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { getOperationAST, type DocumentNode } from 'graphql';
import { DeliveryFathomImport } from '@/delivery/knowledge/fathom/DeliveryFathomImport';
import { DeliveryKnowledgeForm } from '@/delivery/knowledge/DeliveryKnowledgeForm';
import { knowledgeMatchesSubmitted } from '@/delivery/knowledge/knowledge-recovery';
import { type DeliveryKnowledgeDetailQuery } from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftStatus: jest.fn(),
  useDeliveryDraftGuard: () => ({
    requestAction: (action: () => void) => action(),
  }),
}));
jest.mock('@/delivery/knowledge/transcript/DeliveryTranscriptImport', () => ({
  DeliveryTranscriptImport: () => null,
}));
const mockQuery = jest.fn();
const mockMutate = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockQuery, mutate: mockMutate }),
}));
const CONTEXT = {
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'user-workspace',
  projectRevision: 1,
  actor: {
    memberId: 'member',
    isAdmin: true,
    isManager: true,
    roleIds: ['admin'],
    capabilities: ['workspace.admin'],
  },
};
const SETTINGS = {
  ...CONTEXT,
  observedAt: '2026-11-03T00:00:00Z',
  revision: 1,
  enabled: true,
  credentialConfigured: true,
};
const MEETING = {
  recordingId: '123',
  title: 'Original provider title',
  recordedAt: '2026-11-02T00:00:00Z',
  sourceUrl: 'https://fathom.video/calls/999',
  proof: 'sealed-meeting',
};
const PREVIEW = {
  ...CONTEXT,
  observedAt: '2026-11-03T00:00:00Z',
  projectId: 'project',
  sourceId: 'source',
  connectionRevision: 1,
  meeting: MEETING,
  transcript: '[00:01:02] Amna: Real transcript evidence',
  segmentCount: 1,
  proof: 'sealed-transcript',
  proofHash: 'a'.repeat(64),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  existingSourceId: null,
};
type ImportProps = ComponentProps<typeof DeliveryFathomImport>;
const wrap = (element: React.ReactNode) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter
      initialEntries={[
        '/delivery?view=knowledge&project=project&knowledgeCreate=source',
      ]}
    >
      {element}
    </MemoryRouter>
  </I18nProvider>
);
const setup = (changes: Partial<ImportProps> = {}) => {
  let props: ImportProps = {
    context: CONTEXT,
    projectId: 'project',
    sourceId: 'source',
    sourceIdentity: 'project:source:0',
    transcript: '',
    enabled: true,
    onAuthorityLost: jest.fn(),
    onImport: jest.fn().mockReturnValue(true),
    ...changes,
  };
  const content = () =>
    wrap(
      <DeliveryFathomImport
        context={props.context}
        projectId={props.projectId}
        sourceId={props.sourceId}
        sourceIdentity={props.sourceIdentity}
        transcript={props.transcript}
        enabled={props.enabled}
        onAuthorityLost={props.onAuthorityLost}
        onImport={props.onImport}
      />,
    );
  const rendered = render(content());
  return {
    props,
    update: (next: Partial<ImportProps>) => {
      props = { ...props, ...next };
      rendered.rerender(content());
    },
    unmount: rendered.unmount,
  };
};
const load = () =>
  userEvent.click(
    screen.getByRole('button', { name: 'Load Fathom connection' }),
  );
const preview = async () => {
  await load();
  await userEvent.click(screen.getByRole('button', { name: 'Find meetings' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Preview transcript' }),
  );
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockQuery
    .mockReset()
    .mockResolvedValue({ data: { deliveryFathomSettings: SETTINGS } });
  mockMutate
    .mockReset()
    .mockImplementation(async ({ mutation }: { mutation: DocumentNode }) => {
      const operation = getOperationAST(mutation)?.name?.value;
      if (operation === 'FindDeliveryFathomMeetings')
        return {
          data: {
            findDeliveryFathomMeetings: {
              ...CONTEXT,
              projectId: 'project',
              sourceId: 'source',
              connectionRevision: 1,
              items: [MEETING],
              nextCursor: 'next',
              scannedCount: 10,
            },
          },
        };
      if (operation === 'PreviewDeliveryFathomTranscript')
        return { data: { previewDeliveryFathomTranscript: PREVIEW } };
      if (operation === 'SaveDeliveryFathomSettings')
        return {
          data: { saveDeliveryFathomSettings: { ...SETTINGS, revision: 2 } },
        };
      throw new Error('Unexpected operation');
    });
});
it('makes no provider request on mount, previews exact evidence and only imports after explicit choice', async () => {
  const view = setup();
  expect(mockQuery).not.toHaveBeenCalled();
  expect(mockMutate).not.toHaveBeenCalled();
  await preview();
  expect(
    screen.getByRole('region', { name: 'Fathom transcript preview' }),
  ).toHaveTextContent(PREVIEW.transcript);
  expect(view.props.onImport).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use this transcript' }),
  );
  expect(view.props.onImport).toHaveBeenCalledWith(PREVIEW, {
    sourceIdentity: 'project:source:0',
    transcript: '',
  });
});
it('retains edited notes and blocks replacement when the target changed during a preview', async () => {
  const view = setup({ transcript: 'My original notes' });
  await preview();
  view.update({ transcript: 'A newer human correction' });
  expect(
    screen.getByRole('button', { name: 'Replace notes with this transcript' }),
  ).toBeDisabled();
  expect(view.props.onImport).not.toHaveBeenCalled();
});
it('paginates only explicit unchanged searches and does not interpret link slugs as API recording IDs', async () => {
  setup();
  await load();
  await userEvent.type(
    screen.getByLabelText('Exact Fathom link (optional)'),
    'https://fathom.video/calls/999',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Find meetings' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Next 10 meetings' }),
  );
  expect(mockMutate.mock.calls[1][0].variables.input).toMatchObject({
    after: 'next',
    exactUrl: 'https://fathom.video/calls/999',
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Preview transcript' }),
  );
  expect(mockMutate.mock.calls[2][0].variables.input).toEqual({
    projectId: 'project',
    sourceId: 'source',
    recordingId: '123',
    meetingProof: 'sealed-meeting',
  });
});
it('hides private provider evidence on outage and restores it only after a fresh connection check', async () => {
  setup();
  await preview();
  mockQuery.mockRejectedValueOnce(new Error('Offline'));
  await userEvent.click(screen.getByText('Fathom connection'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check connection settings' }),
  );
  expect(
    screen.queryByRole('region', { name: 'Fathom transcript preview' }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check Fathom again' }),
  );
  expect(
    screen.getByRole('region', { name: 'Fathom transcript preview' }),
  ).toBeVisible();
});
it('disposes provider evidence after current authorization denial and rejects late prior-owner replies', async () => {
  const view = setup();
  await preview();
  mockQuery.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
    }),
  );
  await userEvent.click(screen.getByText('Fathom connection'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Check connection settings' }),
  );
  expect(view.props.onAuthorityLost).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(PREVIEW.transcript)).not.toBeInTheDocument();
  view.unmount();
  let finish: (value: unknown) => void = () => undefined;
  mockQuery.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const next = setup();
  await load();
  next.unmount();
  await act(async () => finish({ data: { deliveryFathomSettings: SETTINGS } }));
  expect(next.props.onImport).not.toHaveBeenCalled();
});
it('does not retry an unconfirmed settings write and requires a fresh revision check', async () => {
  setup();
  await load();
  await userEvent.click(screen.getByText('Fathom connection'));
  await userEvent.type(
    screen.getByLabelText('New or replacement Fathom API key'),
    'private-replacement',
  );
  mockMutate.mockRejectedValueOnce(new Error('Reply lost'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Save and enable imports' }),
  );
  expect(screen.getByText(/connection save is unconfirmed/)).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check Fathom again' }),
  );
  expect(
    screen.getByLabelText('New or replacement Fathom API key'),
  ).toHaveValue('');
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
it('imports into the real draft without overwriting its title/date/reviewed text, then preserves explicit human edits', async () => {
  const save = jest.fn().mockResolvedValue(false);
  render(
    wrap(
      <DeliveryKnowledgeForm
        initial={{
          id: 'source',
          projectId: 'project',
          revision: 0,
          category: 'MEETING',
          title: 'Our chosen label',
          meetingDate: '2026-11-03',
          sourceUrl: '',
          transcript: '',
          knowledge: 'Reviewed facts stay here',
        }}
        busy={false}
        enabled
        onSave={save}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        fathomContext={CONTEXT}
        onAuthorityLost={jest.fn()}
      />,
    ),
  );
  await preview();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use this transcript' }),
  );
  expect(screen.getByLabelText('Meeting title')).toHaveValue(
    'Our chosen label',
  );
  expect(screen.getByLabelText('Meeting date')).toHaveValue('2026-11-03');
  expect(screen.getByLabelText('Knowledge to publish')).toHaveValue(
    'Reviewed facts stay here',
  );
  await userEvent.type(
    screen.getByLabelText('Transcript or meeting notes'),
    '\nHuman clarification.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save meeting draft' }),
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Our chosen label',
      knowledge: 'Reviewed facts stay here',
      fathomImportProof: 'sealed-transcript',
      fathomImportHash: PREVIEW.proofHash,
      transcript: `${PREVIEW.transcript}\nHuman clarification.`,
    }),
  );
});
it('requires exact persisted provenance when checking an unknown imported save', () => {
  const input = {
    id: 'source',
    projectId: 'project',
    revision: 0,
    category: 'MEETING',
    title: 'Meeting',
    meetingDate: '2026-11-03',
    sourceUrl: '',
    transcript: PREVIEW.transcript,
    knowledge: '',
    fathomImportHash: PREVIEW.proofHash,
  };
  const detail: NonNullable<
    DeliveryKnowledgeDetailQuery['deliveryKnowledgeDetail']['detail']
  > = {
    ...input,
    revision: 1,
    version: 1,
    currentVersion: 1,
    publishedVersion: null,
    publishedAt: null,
    createdBy: 'member',
    canEdit: true,
    attachments: [],
    fathomProvenance: {
      provider: 'FATHOM',
      recordingId: '123',
      title: 'Original',
      recordedAt: null,
      sourceUrl: null,
      importedAt: '2026-11-03T00:00:00Z',
      importedBy: 'member',
      proofHash: 'different',
      segmentCount: 1,
      humanEdited: false,
    },
  };
  expect(knowledgeMatchesSubmitted(detail, input)).toBe(false);
  expect(
    knowledgeMatchesSubmitted(
      {
        ...detail,
        fathomProvenance: {
          ...detail.fathomProvenance!,
          proofHash: PREVIEW.proofHash,
        },
      },
      input,
    ),
  ).toBe(true);
});
