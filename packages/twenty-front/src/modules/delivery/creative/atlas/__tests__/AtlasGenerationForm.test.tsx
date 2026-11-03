import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  type DeliveryAtlasQuoteInput,
  type DeliveryAtlasStartInput,
} from '~/generated-metadata/graphql';
import { AtlasGenerationForm } from '@/delivery/creative/atlas/AtlasGenerationForm';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type AtlasProduction } from '@/delivery/creative/atlas/atlas.types';
import {
  atlasProductionFixture,
  atlasQuoteFixture,
  atlasRunFixture,
  ATLAS_IMAGE_PROFILE_ID,
  ATLAS_CLIP_PROFILE_ID,
  ATLAS_ASSET_ID,
  ATLAS_SHOT_ID,
} from '@/delivery/creative/atlas/__tests__/atlas.fixtures';
let mockCurrent: AtlasProduction;
let mockRefresh: () => void;
const onQuote = jest.fn();
const onStart = jest.fn();
const onCheck = jest.fn();
const onReload = jest.fn();
const onClose = jest.fn();
jest.mock('@/delivery/creative/atlas/atlasStyles', () => ({
  StyledAtlasForm: 'form',
  StyledAtlasBoundary: 'fieldset',
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
}));
const setup = (source = atlasProductionFixture()) => {
  mockCurrent = source;
  const opened = structuredClone(source);
  const Page = () => {
    const [, update] = useState(0);
    const [open, setOpen] = useState(true);
    mockRefresh = () => update((value) => value + 1);
    return open ? (
      <AtlasGenerationForm
        opened={opened}
        current={mockCurrent}
        busy={false}
        onQuote={onQuote}
        onStart={onStart}
        onCheck={onCheck}
        onReload={onReload}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    ) : (
      <p>Request review closed</p>
    );
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: ['/delivery?view=creative'] },
  );
  render(<RouterProvider router={router} />);
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  onQuote.mockImplementation(async (input: DeliveryAtlasQuoteInput) => ({
    ...atlasQuoteFixture(),
    requestId: input.requestId,
    profileId: input.profileId,
  }));
  onStart.mockImplementation(async (input: DeliveryAtlasStartInput) => ({
    ...atlasRunFixture(),
    id: input.runId,
    requestId: input.requestId,
    status: 'QUEUED',
    providerPredictionId: null,
  }));
  onCheck.mockImplementation(async (runId: string, requestId: string) => ({
    ...atlasRunFixture(),
    id: runId,
    requestId,
  }));
});
const prepareStatic = async () => {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Image or animation prompt'),
    'Explicit brand image prompt',
  );
  await user.click(
    screen.getByRole('button', { name: 'Review price and reservation' }),
  );
  expect(await screen.findByText('Price and spending review')).toBeVisible();
  return user;
};
it('prepares a static image without a fake shot and requires separate price sharing and generation confirmation', async () => {
  setup();
  expect(
    screen.queryByRole('combobox', { name: 'Production shot' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/No video storyboard or shot is required/),
  ).toBeVisible();
  expect(screen.getByText(/Reviewing price sends/)).toHaveTextContent(
    'selected approved images to Atlas',
  );
  expect(onQuote).not.toHaveBeenCalled();
  const user = await prepareStatic();
  expect(onQuote).toHaveBeenCalledWith(
    expect.objectContaining({
      profileId: ATLAS_IMAGE_PROFILE_ID,
      target: 'BRIEF',
      shotId: null,
      prompt: 'Explicit brand image prompt',
      referenceAssetIds: [],
      parameters: { resolution: '1k' },
    }),
  );
  expect(screen.getByText(/Atlas estimate.*0.12/)).toBeVisible();
  expect(screen.getByText(/Maximum OS reservation.*0.50/)).toBeVisible();
  expect(
    screen.getByText('Actual provider charge: unconfirmed.'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Start this generation request' }),
  ).toBeDisabled();
  expect(onStart).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed this exact model/ }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Start this generation request' }),
  );
  expect(await screen.findByText('Queued for generation')).toBeVisible();
  expect(
    screen.getByText('Status when this request was confirmed'),
  ).toBeVisible();
  expect(
    screen.getByText(/Review Saved Atlas requests below for current status/),
  ).toBeVisible();
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onStart).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: atlasQuoteFixture().runId,
      quoteToken: atlasQuoteFixture().quoteToken,
      requestId: onQuote.mock.calls[0][0].requestId,
    }),
  );
});
it('retains a prepared default and valid quote after a pure default change until Use updated default is explicit', async () => {
  setup();
  const user = await prepareStatic();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed this exact model/ }),
  );
  mockCurrent = {
    ...mockCurrent,
    defaultImageFamilyId: 'gpt-image-2',
    configurationRevision: 5,
  };
  act(mockRefresh);
  expect(screen.getByLabelText('Image model family')).toHaveValue(
    'nano-banana-pro',
  );
  expect(screen.getByLabelText('Image or animation prompt')).toHaveValue(
    'Explicit brand image prompt',
  );
  expect(screen.getByText(/The workspace default changed/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Start this generation request' }),
  ).toBeEnabled();
  expect(onQuote).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Use updated default' }));
  expect(screen.getByLabelText('Image model family')).toHaveValue(
    'gpt-image-2',
  );
  expect(screen.getByLabelText('Image or animation prompt')).toHaveValue(
    'Explicit brand image prompt',
  );
  expect(
    screen.queryByText('Price and spending review'),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Quality')).toHaveValue('medium');
  expect(onStart).not.toHaveBeenCalled();
});
it('retains an unavailable selection visibly rather than silently using another permitted model', async () => {
  setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Image or animation prompt'),
    'Keep this prepared prompt',
  );
  mockCurrent = {
    ...mockCurrent,
    allowedProfileIds: mockCurrent.allowedProfileIds.filter(
      (id) => id !== ATLAS_IMAGE_PROFILE_ID && !id.endsWith('/edit'),
    ),
  };
  act(mockRefresh);
  expect(screen.getByLabelText('Image model family')).toHaveValue(
    'nano-banana-pro',
  );
  expect(screen.getByLabelText('Image model family')).toHaveDisplayValue(
    'Prepared image family unavailable',
  );
  expect(screen.getByLabelText('Image or animation prompt')).toHaveValue(
    'Keep this prepared prompt',
  );
  expect(
    screen.getByRole('button', { name: 'Review price and reservation' }),
  ).toBeDisabled();
  expect(onQuote).not.toHaveBeenCalled();
});
it('uses the actual shot and its approved current image for I2V, including explicit false audio', async () => {
  setup({ ...atlasProductionFixture(), outputKind: 'VIDEO' });
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Output to generate'), 'CLIP');
  await user.selectOptions(
    screen.getByLabelText('Production shot'),
    ATLAS_SHOT_ID,
  );
  expect(screen.getByLabelText('Image or animation prompt')).toHaveValue(
    'Exact approved image animation prompt',
  );
  expect(screen.getByLabelText('Image or animation prompt')).toHaveAttribute(
    'readonly',
  );
  expect(
    screen.getByText(/Approved source image.*Approved product image/),
  ).toBeVisible();
  expect(
    screen.getByText(
      /The selected provider may reject an image’s dimensions or aspect/,
    ),
  ).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Review price and reservation' }),
  );
  expect(await screen.findByText('Price and spending review')).toBeVisible();
  expect(onQuote).toHaveBeenCalledWith(
    expect.objectContaining({
      profileId: ATLAS_CLIP_PROFILE_ID,
      target: 'SHOT',
      shotId: ATLAS_SHOT_ID,
      referenceAssetIds: [ATLAS_ASSET_ID],
      parameters: { duration: 8, generateAudio: false },
    }),
  );
});
it('blocks repeated start or a replacement request after an uncertain response until the exact saved job is checked', async () => {
  onStart.mockResolvedValueOnce(null);
  setup();
  const user = await prepareStatic();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed this exact model/ }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Start this generation request' }),
  );
  expect(
    await screen.findByText(/The start response is unconfirmed/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Start this generation request' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Review price again for these inputs' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Image or animation prompt')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Close pending request review' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Cancel preparation' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      /Closing this review does not stop a request Atlas may have accepted/,
    ),
  ).toHaveTextContent(
    'Use Check this saved request above before preparing another generation.',
  );
  act(mockRefresh);
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onQuote).toHaveBeenCalledTimes(1);
  await user.click(
    screen.getByRole('button', { name: 'Check this saved request' }),
  );
  expect(await screen.findByText('Waiting for Atlas output')).toBeVisible();
  expect(onCheck).toHaveBeenCalledWith(
    atlasQuoteFixture().runId,
    onQuote.mock.calls[0][0].requestId,
  );
  expect(onStart).toHaveBeenCalledTimes(1);
});
it('keeps prompt and model drafts until confirmed discard when the production source changes', async () => {
  setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Image or animation prompt'),
    'Retain until deliberate reload',
  );
  mockCurrent = { ...mockCurrent, taskRevision: 5 };
  act(mockRefresh);
  expect(
    screen.getByRole('button', { name: 'Review price and reservation' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload current production' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Image or animation prompt')).toHaveValue(
    'Retain until deliberate reload',
  );
  expect(onReload).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', { name: 'Reload current production' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(onReload).toHaveBeenCalledTimes(1);
  expect(onQuote).not.toHaveBeenCalled();
});
