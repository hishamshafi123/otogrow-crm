import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CreativeLearningComponents,
  areDeclaredLearningComponentsCurrent,
} from '@/delivery/creative/learning/CreativeLearningComponents';
import {
  type DeliveryCreativeAdLinkChoicesQuery,
  type DeliveryCreativeDeclaredComponentInput,
} from '~/generated-metadata/graphql';
const BASE = '10000000-0000-4000-8000-000000000001',
  HOOK = '10000000-0000-4000-8000-000000000002';
type Selection = NonNullable<
  DeliveryCreativeAdLinkChoicesQuery['deliveryCreativeAdLinkChoices']['selected']
>;
const selection = (): Selection => ({
  taskId: BASE,
  submissionVersion: 2,
  assetId: HOOK,
  hasSubmittedCopy: false,
  components: [
    {
      name: 'Approved product demonstration',
      role: 'BASE',
      assetId: BASE,
      briefVersion: 1,
      productionVersion: 1,
      assemblyVersion: 1,
      shotId: null,
      shotVersion: null,
    },
    {
      name: 'Approved question opening',
      role: 'HOOK',
      assetId: HOOK,
      briefVersion: 1,
      productionVersion: 1,
      assemblyVersion: 1,
      shotId: null,
      shotVersion: null,
    },
  ],
  provenComponents: [],
});
const mockChange = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
}));
const setup = (
  source = selection(),
  initial: DeliveryCreativeDeclaredComponentInput[] = [],
) => {
  const Page = () => {
    const [declared, setDeclared] = useState(initial);
    return (
      <CreativeLearningComponents
        selected={source}
        declared={declared}
        previousNames={[
          { assetId: 'old-asset', name: 'Earlier campaign opening' },
        ]}
        onChange={(value) => {
          mockChange(value);
          setDeclared(value);
        }}
      />
    );
  };
  render(
    <I18nProvider i18n={i18n}>
      <Page />
    </I18nProvider>,
  );
};
beforeEach(() => {
  jest.clearAllMocks();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});
it('leaves unknown components valid and allows only named approved source clips as explicit human declarations', async () => {
  const source = selection();
  setup(source);
  expect(screen.getByRole('combobox', { name: 'Main video' })).toHaveValue('');
  expect(areDeclaredLearningComponentsCurrent(source, [])).toBe(true);
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Main video' }),
    BASE,
  );
  expect(mockChange).toHaveBeenLastCalledWith([
    { role: 'BASE', assetId: BASE },
  ]);
  expect(
    screen.getByText(
      'Human declaration, not independently verified assembly evidence.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('makes a proven assembly role read-only and requires explicit removal of an earlier overlapping human declaration', async () => {
  const source = selection();
  source.provenComponents = [
    { ...source.components[1], provenance: 'ASSEMBLY_RUN' },
  ];
  setup(source, [
    { role: 'HOOK', assetId: HOOK },
    { role: 'BASE', assetId: BASE },
  ]);
  expect(
    screen.queryByRole('combobox', { name: 'Opening hook' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Recorded assembly component/)).toBeVisible();
  expect(
    areDeclaredLearningComponentsCurrent(source, [
      { role: 'HOOK', assetId: HOOK },
    ]),
  ).toBe(false);
  await userEvent.click(
    screen.getByRole('button', { name: 'Remove earlier declaration' }),
  );
  expect(mockChange).toHaveBeenLastCalledWith([
    { role: 'BASE', assetId: BASE },
  ]);
});
it('keeps an unavailable earlier declaration labelled until the user explicitly removes or replaces it', async () => {
  const source = selection();
  setup(source, [{ role: 'HOOK', assetId: 'old-asset' }]);
  expect(
    screen.getByRole('option', {
      name: /Earlier campaign opening · No longer eligible/,
    }),
  ).toBeDisabled();
  expect(
    areDeclaredLearningComponentsCurrent(source, [
      { role: 'HOOK', assetId: 'old-asset' },
    ]),
  ).toBe(false);
  expect(mockChange).not.toHaveBeenCalled();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Opening hook' }),
    '',
  );
  expect(mockChange).toHaveBeenLastCalledWith([]);
});
