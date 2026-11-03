import { type ReactNode } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryInboxForm } from '@/delivery/DeliveryInboxForm';
import {
  DeliveryCreativeAssemblyForm,
  DeliveryCreativeBriefForm,
  DeliveryCreativeShotForm,
} from '@/delivery/DeliveryCreativeForms';
import { type BusinessRecord } from '@/delivery/delivery-business.types';
import { type CreativeDocument } from '@/delivery/delivery-creative.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
}));
const wrap = (children: ReactNode) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
);
const run = jest.fn<Promise<boolean>, [Record<string, unknown>, number?]>();
const approve = jest.fn<Promise<boolean>, []>();
const record: BusinessRecord = {
  id: 'conversation',
  revision: 3,
  kind: 'CONVERSATION',
  projectId: 'project',
  title: 'Brand',
  status: 'OPEN',
  createdBy: 'admin',
  taskId: null,
  history: [],
};
const document: CreativeDocument = {
  version: 1,
  productionVersion: 1,
  assemblyVersion: 1,
  briefVersion: 1,
  approvedBriefVersion: null,
  brief: {
    objective: 'ADS',
    duration: 30,
    audience: '',
    painPoint: '',
    angle: '',
    concept: 'Product launch',
    productFacts: '',
    mandatoryClaims: '',
    visualDirection: '',
    format: '9:16',
    hook: '',
    cta: '',
    music: '',
    brandAssets: [],
  },
  briefHistory: [],
  references: [],
  shots: [],
  assets: [],
  finalAssetId: null,
  assembly: {
    assetIds: [],
    overlayText: '',
    audioId: null,
    notes: 'Calm pace',
  },
  variants: [],
  revisionCharge: 0,
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  run.mockReset().mockResolvedValue(true);
  approve.mockReset().mockResolvedValue(true);
});

it('preserves an unsent inbox edit during a refreshed conversation and uses the latest revision only after explicit reload', async () => {
  const props = {
    initialText: 'Original reply',
    record,
    admin: true,
    busy: false,
    run,
  };
  const view = render(
    wrap(
      <DeliveryInboxForm
        initialText={props.initialText}
        record={props.record}
        admin={props.admin}
        busy={props.busy}
        run={props.run}
      />,
    ),
  );
  await userEvent.type(
    screen.getByLabelText('Message'),
    ' with editor changes',
  );
  view.rerender(
    wrap(
      <DeliveryInboxForm
        admin={props.admin}
        busy={props.busy}
        run={props.run}
        initialText="New assistant reply"
        record={{ ...record, revision: 4 }}
      />,
    ),
  );
  expect(screen.getByLabelText('Message')).toHaveValue(
    'Original reply with editor changes',
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your draft is preserved',
  );
  expect(
    screen.getByRole('button', { name: 'Save reply draft' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  expect(screen.getByLabelText('Message')).toHaveValue('New assistant reply');
  await userEvent.type(screen.getByLabelText('Message'), ' checked');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save reply draft' }),
  );
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 4,
      text: 'New assistant reply checked',
    }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('Nothing was sent');
});

it('restores a clean inbox when a change is undone and retains input after a failed save', async () => {
  run.mockResolvedValueOnce(false);
  render(
    wrap(
      <DeliveryInboxForm
        initialText="Reply"
        record={record}
        admin
        busy={false}
        run={run}
      />,
    ),
  );
  await userEvent.selectOptions(
    screen.getByLabelText('What to save'),
    'INBOUND_NOTE',
  );
  expect(
    screen.getByRole('button', { name: 'Save incoming note' }),
  ).toBeEnabled();
  await userEvent.selectOptions(screen.getByLabelText('What to save'), 'DRAFT');
  expect(
    screen.getByRole('button', { name: 'Save reply draft' }),
  ).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Message'), ' edited');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save reply draft' }),
  );
  expect(screen.getByLabelText('Message')).toHaveValue('Reply edited');
  expect(
    screen.getByRole('button', { name: 'Save reply draft' }),
  ).toBeEnabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('adopts refreshed inbox content when the editor has no unsaved changes', () => {
  const props = {
    initialText: 'Original reply',
    record,
    admin: true,
    busy: false,
    run,
  };
  const view = render(
    wrap(
      <DeliveryInboxForm
        initialText={props.initialText}
        record={props.record}
        admin={props.admin}
        busy={props.busy}
        run={props.run}
      />,
    ),
  );
  view.rerender(
    wrap(
      <DeliveryInboxForm
        admin={props.admin}
        busy={props.busy}
        run={props.run}
        initialText="Updated reply"
        record={{ ...record, revision: 4 }}
      />,
    ),
  );
  expect(screen.getByLabelText('Message')).toHaveValue('Updated reply');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('preserves a creative brief when a new server version arrives and prevents approving unsaved edits', async () => {
  const props = {
    document,
    revision: 3,
    canEdit: true,
    busy: false,
    manager: true,
    save: run,
    onApprove: approve,
  };
  const view = render(
    wrap(
      <DeliveryCreativeBriefForm
        document={props.document}
        revision={props.revision}
        canEdit={props.canEdit}
        busy={props.busy}
        manager={props.manager}
        save={props.save}
        onApprove={props.onApprove}
      />,
    ),
  );
  await userEvent.type(screen.getByLabelText('Concept'), ' cinematic');
  expect(
    screen.getByRole('button', { name: 'Approve current brief' }),
  ).toBeDisabled();
  view.rerender(
    wrap(
      <DeliveryCreativeBriefForm
        canEdit={props.canEdit}
        busy={props.busy}
        manager={props.manager}
        save={props.save}
        onApprove={props.onApprove}
        revision={4}
        document={{
          ...document,
          briefVersion: 2,
          brief: { ...document.brief, concept: 'Updated concept' },
        }}
      />,
    ),
  );
  expect(screen.getByLabelText('Concept')).toHaveValue(
    'Product launch cinematic',
  );
  expect(
    screen.getByRole('button', { name: 'Save new brief version' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  expect(screen.getByLabelText('Concept')).toHaveValue('Updated concept');
  await userEvent.click(
    screen.getByRole('button', { name: 'Approve current brief' }),
  );
  expect(approve).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
});

it('keeps failed creative changes available and marks successful writes clean', async () => {
  run.mockResolvedValueOnce(false);
  render(
    wrap(
      <DeliveryCreativeBriefForm
        document={document}
        revision={3}
        canEdit
        busy={false}
        manager
        save={run}
        onApprove={approve}
      />,
    ),
  );
  await userEvent.type(screen.getByLabelText('Concept'), ' revised');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save new brief version' }),
  );
  expect(screen.getByLabelText('Concept')).toHaveValue(
    'Product launch revised',
  );
  expect(
    screen.getByRole('button', { name: 'Save new brief version' }),
  ).toBeEnabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Save new brief version' }),
  );
  expect(run).toHaveBeenLastCalledWith(
    expect.objectContaining({ action: 'brief' }),
    3,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Brief saved');
  expect(
    screen.getByRole('button', { name: 'Save new brief version' }),
  ).toBeDisabled();
});

it('keeps assembly notes through unrelated document refresh and reloads only on request', async () => {
  const props = {
    document,
    revision: 3,
    canEdit: true,
    busy: false,
    save: run,
  };
  const view = render(
    wrap(
      <DeliveryCreativeAssemblyForm
        document={props.document}
        revision={props.revision}
        canEdit={props.canEdit}
        busy={props.busy}
        save={props.save}
      />,
    ),
  );
  await userEvent.type(
    screen.getByLabelText('Editing notes'),
    ' and soft audio',
  );
  view.rerender(
    wrap(
      <DeliveryCreativeAssemblyForm
        canEdit={props.canEdit}
        busy={props.busy}
        save={props.save}
        revision={4}
        document={{
          ...document,
          version: 2,
          assembly: { ...document.assembly, notes: 'New server notes' },
        }}
      />,
    ),
  );
  expect(screen.getByLabelText('Editing notes')).toHaveValue(
    'Calm pace and soft audio',
  );
  expect(
    screen.getByRole('button', { name: 'Save assembly plan' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  expect(screen.getByLabelText('Editing notes')).toHaveValue(
    'New server notes',
  );
  await userEvent.type(screen.getByLabelText('Overlay text'), 'Launch');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save assembly plan' }),
  );
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'assembly', overlayText: 'Launch' }),
    4,
  );
});

it('preserves shot prompts through a failed write and a newer task revision', async () => {
  const user = userEvent.setup();
  const shot = {
    id: 'shot',
    version: 1,
    title: 'Product reveal',
    imagePrompt: 'Real product',
    animationPrompt: 'Slow pan',
    duration: 5,
    subject: '',
    product: '',
    location: '',
    notes: '',
    referenceId: null,
    history: [],
    imageId: null,
    clipId: null,
  };
  const saved = jest.fn();
  const cancelled = jest.fn();
  run.mockResolvedValueOnce(false);
  const view = render(
    wrap(
      <DeliveryCreativeShotForm
        shot={shot}
        document={document}
        revision={3}
        busy={false}
        canEdit
        save={run}
        onSaved={saved}
        onCancel={cancelled}
      />,
    ),
  );
  await user.type(
    screen.getByLabelText('Image prompt'),
    ' with accurate label',
  );
  await user.click(screen.getByRole('button', { name: 'Save shot' }));
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Image prompt')).toHaveValue(
    'Real product with accurate label',
  );
  view.rerender(
    wrap(
      <DeliveryCreativeShotForm
        shot={{ ...shot, title: 'New shot title', version: 2 }}
        document={document}
        revision={4}
        busy={false}
        canEdit
        save={run}
        onSaved={saved}
        onCancel={cancelled}
      />,
    ),
  );
  expect(screen.getByRole('button', { name: 'Save shot' })).toBeDisabled();
  expect(screen.getByLabelText('Image prompt')).toHaveValue(
    'Real product with accurate label',
  );
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  expect(screen.getByLabelText('Shot title')).toHaveValue('New shot title');
  await user.type(screen.getByLabelText('Image prompt'), ' checked');
  await user.click(screen.getByRole('button', { name: 'Save shot' }));
  expect(run).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: 'shot',
      id: 'shot',
      fields: expect.objectContaining({ imagePrompt: 'Real product checked' }),
    }),
    4,
  );
  expect(saved).toHaveBeenCalledTimes(1);
});
