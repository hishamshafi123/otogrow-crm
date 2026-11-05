import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryKnowledgeForm } from '@/delivery/knowledge/DeliveryKnowledgeForm';
import { type DeliveryKnowledgeSaveInput } from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/knowledge/transcript/DeliveryTranscriptImport', () => ({
  DeliveryTranscriptImport: () => null,
}));
jest.mock('@/delivery/knowledge/assets/KnowledgeAssetAttachments', () => ({
  KnowledgeAssetAttachments: ({
    onChange,
    onBlockingChange,
  }: {
    onChange: (
      files: {
        asset: {
          id: string;
          name: string;
          mimeType: string;
          size: number;
          sha256: string;
          uploadedBy: string;
          createdAt: string;
        };
        version: null;
      }[],
    ) => void;
    onBlockingChange: (blocked: boolean) => void;
  }) => (
    <>
      <button type="button" onClick={() => onBlockingChange(true)}>
        Select a local file
      </button>
      <button
        type="button"
        onClick={() => {
          onChange([
            {
              asset: {
                id: 'file',
                name: 'Brand.png',
                mimeType: 'image/png',
                size: 4,
                sha256: 'a'.repeat(64),
                uploadedBy: 'member',
                createdAt: '2026-11-05T00:00:00Z',
              },
              version: null,
            },
          ]);
          onBlockingChange(false);
        }}
      >
        Use uploaded file
      </button>
    </>
  ),
}));

const initial: DeliveryKnowledgeSaveInput = {
  id: 'source',
  projectId: 'project',
  revision: 1,
  title: 'Launch meeting',
  category: 'MEETING',
  meetingDate: '2026-10-26',
  sourceUrl: 'https://fathom.video/share/synthetic',
  transcript: 'Original notes',
  knowledge: 'Prior decision',
};
beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
const form = (
  props: Partial<React.ComponentProps<typeof DeliveryKnowledgeForm>> = {},
) => (
  <I18nProvider i18n={i18n}>
    <DeliveryKnowledgeForm
      initial={props.initial ?? initial}
      busy={props.busy ?? false}
      enabled={props.enabled ?? true}
      onSave={props.onSave ?? jest.fn().mockResolvedValue(false)}
      onClose={props.onClose ?? jest.fn()}
      onSaved={props.onSaved ?? jest.fn()}
      latestRevision={props.latestRevision}
      readOnly={props.readOnly}
      onReload={props.onReload}
      assetContext={props.assetContext}
      initialAssets={props.initialAssets}
      onAuthorityLost={props.onAuthorityLost}
    />
  </I18nProvider>
);

it('retains exact reviewed notes after a failed save and does not publish', async () => {
  const save = jest.fn().mockResolvedValue(false);
  const saved = jest.fn();
  render(form({ onSave: save, onSaved: saved }));
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Knowledge to publish'));
  await user.type(
    screen.getByLabelText('Knowledge to publish'),
    'Confirmed webinar plan',
  );
  await user.click(screen.getByRole('button', { name: 'Save meeting draft' }));
  expect(save).toHaveBeenCalledWith({
    ...initial,
    knowledge: 'Confirmed webinar plan',
  });
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Knowledge to publish')).toHaveValue(
    'Confirmed webinar plan',
  );
});

it('blocks saving while a file is unresolved, then saves its exact binding alongside reviewed usage notes', async () => {
  const save = jest.fn().mockResolvedValue(false);
  render(
    form({
      initial: { ...initial, category: 'ASSET_REFERENCE' },
      assetContext: {
        workspaceId: 'workspace',
        memberId: 'member',
        userWorkspaceId: 'user-workspace',
        projectId: 'project',
        projectRevision: 1,
        companyId: 'company',
        sourceId: 'source',
        sourceRevision: 1,
        scope: 'scope',
      },
      onAuthorityLost: jest.fn(),
      onSave: save,
    }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Select a local file' }),
  );
  expect(
    screen.getByRole('button', { name: 'Save knowledge draft' }),
  ).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use uploaded file' }),
  );
  expect(screen.getByLabelText('Knowledge category')).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save knowledge draft' }),
  );
  expect(save).toHaveBeenCalledWith({
    ...initial,
    category: 'ASSET_REFERENCE',
    attachments: [{ id: 'file', sha256: 'a'.repeat(64) }],
  });
});

it('retains dirty notes when a newer source revision requires explicit reload', async () => {
  const reload = jest.fn();
  const view = render(form({ latestRevision: 1, onReload: reload }));
  await userEvent.type(
    screen.getByLabelText('Transcript or meeting notes'),
    ' — local correction',
  );
  view.rerender(form({ latestRevision: 2, onReload: reload }));
  expect(screen.getByRole('alert')).toHaveTextContent('draft is preserved');
  expect(
    screen.getByRole('button', { name: 'Save meeting draft' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Transcript or meeting notes')).toHaveValue(
    'Original notes — local correction',
  );
});

it('changes category without losing source evidence and labels recording links truthfully', async () => {
  const save = jest.fn().mockResolvedValue(false);
  render(form({ onSave: save }));
  await userEvent.selectOptions(
    screen.getByLabelText('Knowledge category'),
    'PROMPT',
  );
  expect(screen.getByLabelText('Knowledge title')).toHaveValue(
    'Launch meeting',
  );
  expect(screen.getByLabelText('Source evidence and notes')).toHaveValue(
    'Original notes',
  );
  expect(
    screen.getByText(/reference-only unless you explicitly import from Fathom/),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save knowledge draft' }),
  );
  expect(save).toHaveBeenCalledWith({ ...initial, category: 'PROMPT' });
});

it('freezes a submitted body while keeping its notes available for recovery', () => {
  render(form({ readOnly: true }));
  expect(screen.getByLabelText('Transcript or meeting notes')).toHaveValue(
    'Original notes',
  );
  expect(
    screen.getByRole('button', { name: 'Save meeting draft' }),
  ).toBeDisabled();
});
