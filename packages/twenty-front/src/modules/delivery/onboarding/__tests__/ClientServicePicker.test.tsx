import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientServicePicker } from '@/delivery/onboarding/ClientServicePicker';
const mockAdd = jest.fn();
let mockServices: string[] = [];
jest.mock('@/delivery/onboarding/useServiceCatalog', () => ({
  useServiceCatalog: () => ({
    services: mockServices,
    loading: false,
    unavailable: false,
    canAdd: true,
    add: mockAdd,
  }),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
}));
const Form = ({ initial = [] }: { initial?: string[] }) => {
  const [services, setServices] = useState(initial);
  return (
    <I18nProvider i18n={i18n}>
      <ClientServicePicker services={services} onChange={setServices} />
    </I18nProvider>
  );
};
beforeEach(() => {
  i18n.load('en', {});
  i18n.activate('en');
  mockServices = [];
  mockAdd.mockReset();
});
it('selects multiple services and all defaults without losing a legacy service', async () => {
  const user = userEvent.setup();
  render(<Form initial={['Brand consulting']} />);
  await user.click(screen.getByRole('checkbox', { name: 'SEO' }));
  await user.click(screen.getByRole('checkbox', { name: 'Website' }));
  expect(screen.getByRole('checkbox', { name: 'SEO' })).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Brand consulting' }),
  ).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Select all' }));
  for (const checkbox of screen.getAllByRole('checkbox'))
    expect(checkbox).toBeChecked();
});
it('saves a new service, selects it, and shows it unselected on the next onboarding', async () => {
  const user = userEvent.setup();
  mockAdd.mockImplementation(async (name: string) => {
    mockServices.push(name);
    return mockServices;
  });
  const view = render(<Form />);
  await user.click(screen.getByRole('button', { name: 'Add service' }));
  await user.type(
    screen.getByLabelText('New service name'),
    '  Brand   strategy ',
  );
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(mockAdd).toHaveBeenCalledWith('Brand strategy');
  expect(
    screen.getByRole('checkbox', { name: 'Brand strategy' }),
  ).toBeChecked();
  view.unmount();
  render(<Form />);
  expect(
    screen.getByRole('checkbox', { name: 'Brand strategy' }),
  ).not.toBeChecked();
});
it('reuses a case-insensitive duplicate without another save', async () => {
  const user = userEvent.setup();
  mockServices = ['Brand strategy'];
  render(<Form />);
  await user.click(screen.getByRole('button', { name: 'Add service' }));
  await user.type(screen.getByLabelText('New service name'), 'brand STRATEGY');
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(mockAdd).not.toHaveBeenCalled();
  expect(
    screen.getByRole('checkbox', { name: 'Brand strategy' }),
  ).toBeChecked();
});
it('retains the name after a failed save and does not select unsaved services', async () => {
  const user = userEvent.setup();
  mockAdd.mockRejectedValue(new Error('offline'));
  render(<Form />);
  await user.click(screen.getByRole('button', { name: 'Add service' }));
  await user.type(screen.getByLabelText('New service name'), 'Email marketing');
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(screen.getByLabelText('New service name')).toHaveValue(
    'Email marketing',
  );
  expect(
    screen.queryByRole('checkbox', { name: 'Email marketing' }),
  ).not.toBeInTheDocument();
});
it('rejects comma-separated names before saving', async () => {
  const user = userEvent.setup();
  render(<Form />);
  await user.click(screen.getByRole('button', { name: 'Add service' }));
  await user.type(screen.getByLabelText('New service name'), 'Brand, Email');
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(screen.getByRole('alert')).toHaveTextContent('without commas');
  expect(mockAdd).not.toHaveBeenCalled();
});

it('uses the latest form callback when a save finishes after another field changes', async () => {
  let resolve: (value: string[]) => void = () => {};
  mockAdd.mockReturnValue(
    new Promise<string[]>((done) => {
      resolve = done;
    }),
  );
  const submitted = jest.fn();
  const Parent = () => {
    const [scope, setScope] = useState('Original scope');
    return (
      <I18nProvider i18n={i18n}>
        <label>
          Scope
          <input
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          />
        </label>
        <ClientServicePicker
          services={[]}
          onChange={(services) => submitted({ scope, services })}
        />
      </I18nProvider>
    );
  };
  const user = userEvent.setup();
  render(<Parent />);
  await user.click(screen.getByRole('button', { name: 'Add service' }));
  await user.type(screen.getByLabelText('New service name'), 'Brand strategy');
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  await user.clear(screen.getByLabelText('Scope'));
  await user.type(screen.getByLabelText('Scope'), 'New scope');
  await act(async () => {
    resolve(['Brand strategy']);
  });
  expect(submitted).toHaveBeenCalledWith({
    scope: 'New scope',
    services: ['Brand strategy'],
  });
});

it('filters services and selects results without losing hidden selections', async () => {
  const user = userEvent.setup();
  mockServices = ['Email marketing', 'Brand strategy'];
  render(<Form initial={['SEO']} />);
  await user.type(screen.getByLabelText('Find a service'), 'marketing');
  expect(
    screen.queryByRole('checkbox', { name: 'SEO' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Select results' }));
  await user.clear(screen.getByLabelText('Find a service'));
  expect(screen.getByRole('checkbox', { name: 'SEO' })).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Email marketing' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Performance marketing' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Brand strategy' }),
  ).not.toBeChecked();
});
it('shows only selected services and clears the selection explicitly', async () => {
  const user = userEvent.setup();
  render(<Form initial={['SEO', 'Website']} />);
  await user.click(screen.getByRole('button', { name: 'Show selected' }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Show all services' }));
  expect(screen.getByRole('checkbox', { name: 'SEO' })).not.toBeChecked();
});
it('prefills a missing search as a new service and restores focus on cancel', async () => {
  const user = userEvent.setup();
  render(<Form />);
  await user.type(screen.getByLabelText('Find a service'), 'Brand strategy');
  expect(screen.getByText(/No matching service/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add service' }));
  expect(screen.getByLabelText('New service name')).toHaveValue(
    'Brand strategy',
  );
  expect(screen.getByLabelText('New service name')).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Add service' })).toHaveFocus();
});
it('allows filtered selection from a catalog larger than the per-plan limit', async () => {
  mockServices = Array.from(
    { length: 25 },
    (_, index) => `Custom service ${index}`,
  );
  const user = userEvent.setup();
  render(<Form />);
  expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
  await user.type(screen.getByLabelText('Find a service'), 'Custom service 24');
  await user.click(screen.getByRole('button', { name: 'Select results' }));
  expect(
    screen.getByRole('checkbox', { name: 'Custom service 24' }),
  ).toBeChecked();
});

it('keeps keyboard focus when removing a checkbox from the selected-only view', async () => {
  const user = userEvent.setup();
  render(<Form initial={['SEO']} />);
  await user.click(screen.getByRole('button', { name: 'Show selected' }));
  await user.click(screen.getByRole('checkbox', { name: 'SEO' }));
  expect(
    screen.getByRole('button', { name: 'Show all services' }),
  ).toHaveFocus();
});
