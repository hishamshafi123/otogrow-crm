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
it('selects multiple services and keeps selected items visible above available choices', async () => {
  const user = userEvent.setup();
  render(<Form initial={['Brand consulting']} />);
  await user.click(screen.getByRole('checkbox', { name: 'SEO' }));
  expect(screen.getByLabelText('Find a service or product')).toHaveFocus();
  await user.click(screen.getByRole('checkbox', { name: 'Website' }));
  const selected = screen.getByRole('list', { name: 'Selected services' });
  expect(selected).toHaveTextContent('Brand consulting');
  expect(selected).toHaveTextContent('SEO');
  expect(selected).toHaveTextContent('Website');
  expect(
    screen.queryByRole('checkbox', { name: 'SEO' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove SEO' }));
  expect(screen.getByRole('checkbox', { name: 'SEO' })).toBeInTheDocument();
});
it('saves a new service, selects it, and shows it available on the next onboarding', async () => {
  const user = userEvent.setup();
  mockAdd.mockImplementation(async (name: string) => {
    mockServices.push(name);
    return mockServices;
  });
  const view = render(<Form />);
  await user.click(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  );
  await user.type(
    screen.getByLabelText('New service or product name'),
    '  Brand   strategy ',
  );
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(mockAdd).toHaveBeenCalledWith('Brand strategy');
  expect(
    screen.getByRole('list', { name: 'Selected services' }),
  ).toHaveTextContent('Brand strategy');
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
  await user.click(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  );
  await user.type(
    screen.getByLabelText('New service or product name'),
    'brand STRATEGY',
  );
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(mockAdd).not.toHaveBeenCalled();
  expect(
    screen.getByRole('list', { name: 'Selected services' }),
  ).toHaveTextContent('Brand strategy');
});
it('retains the name after a failed save and does not select unsaved services', async () => {
  const user = userEvent.setup();
  mockAdd.mockRejectedValue(new Error('offline'));
  render(<Form />);
  await user.click(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  );
  await user.type(
    screen.getByLabelText('New service or product name'),
    'Email marketing',
  );
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(screen.getByLabelText('New service or product name')).toHaveValue(
    'Email marketing',
  );
  expect(
    screen.queryByRole('list', { name: 'Selected services' }),
  ).not.toBeInTheDocument();
});
it('rejects comma-separated names before saving', async () => {
  const user = userEvent.setup();
  render(<Form />);
  await user.click(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  );
  await user.type(
    screen.getByLabelText('New service or product name'),
    'Brand, Email',
  );
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
  await user.click(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  );
  await user.type(
    screen.getByLabelText('New service or product name'),
    'Brand strategy',
  );
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

it('filters available options without hiding selected items and supports individual catalog selection', async () => {
  const user = userEvent.setup();
  mockServices = ['Email marketing', 'Brand strategy'];
  render(<Form initial={['SEO']} />);
  await user.type(
    screen.getByLabelText('Find a service or product'),
    'marketing',
  );
  expect(
    screen.getByRole('list', { name: 'Selected services' }),
  ).toHaveTextContent('SEO');
  expect(
    screen.queryByRole('checkbox', { name: 'Brand strategy' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Email marketing' }));
  const selected = screen.getByRole('list', { name: 'Selected services' });
  expect(selected).toHaveTextContent('SEO');
  expect(selected).toHaveTextContent('Email marketing');
});
it('prefills a missing search as a custom service and restores focus on cancel', async () => {
  const user = userEvent.setup();
  render(<Form />);
  await user.type(
    screen.getByLabelText('Find a service or product'),
    'Brand strategy',
  );
  expect(screen.getByText(/No available options match/)).toBeInTheDocument();
  const add = screen.getByRole('button', {
    name: 'Add a custom service or product',
  });
  await user.click(add);
  expect(screen.getByLabelText('New service or product name')).toHaveValue(
    'Brand strategy',
  );
  expect(screen.getByLabelText('New service or product name')).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  ).toHaveFocus();
});
it('allows individual selection from a catalog larger than the per-plan limit', async () => {
  mockServices = Array.from(
    { length: 25 },
    (_, index) => `Custom service ${index}`,
  );
  const user = userEvent.setup();
  render(<Form />);
  await user.type(
    screen.getByLabelText('Find a service or product'),
    'Custom service 24',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Custom service 24' }));
  expect(
    screen.getByRole('list', { name: 'Selected services' }),
  ).toHaveTextContent('Custom service 24');
});

it('reuses a selected custom service without promoting it to the shared catalog again', async () => {
  const user = userEvent.setup();
  render(<Form initial={['Legacy custom']} />);
  await user.click(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  );
  await user.type(
    screen.getByLabelText('New service or product name'),
    'LEGACY CUSTOM',
  );
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(mockAdd).not.toHaveBeenCalled();
  expect(
    screen.getByRole('list', { name: 'Selected services' }),
  ).toHaveTextContent('Legacy custom');
});

it('keeps keyboard focus predictable when selecting and removing services', async () => {
  const user = userEvent.setup();
  render(<Form />);
  const search = screen.getByLabelText('Find a service or product');
  await user.click(search);
  await user.tab();
  expect(screen.getByRole('checkbox', { name: 'AI video' })).toHaveFocus();
  await user.keyboard('[Space]');
  expect(search).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Remove AI video' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('checkbox', { name: 'AI video' })).toHaveFocus();
});

it('blocks plan submission while custom catalog saving is pending and includes the confirmed service', async () => {
  let resolve: (services: string[]) => void = () => {};
  mockAdd.mockReturnValue(
    new Promise<string[]>((done) => {
      resolve = done;
    }),
  );
  const submitted = jest.fn();
  const Parent = () => {
    const [services, setServices] = useState<string[]>([]);
    const [editorState, setEditorState] = useState({
      dirty: false,
      busy: false,
    });
    return (
      <I18nProvider i18n={i18n}>
        <ClientServicePicker
          services={services}
          onChange={setServices}
          onEditorStateChange={setEditorState}
        />
        <button
          disabled={editorState.dirty || editorState.busy}
          onClick={() => submitted(services)}
        >
          Save plan
        </button>
      </I18nProvider>
    );
  };
  const user = userEvent.setup();
  render(<Parent />);
  await user.click(
    screen.getByRole('button', { name: 'Add a custom service or product' }),
  );
  await user.type(
    screen.getByLabelText('New service or product name'),
    'Brand strategy',
  );
  await user.click(screen.getByRole('button', { name: 'Save and select' }));
  expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
  expect(submitted).not.toHaveBeenCalled();
  await act(async () => {
    resolve(['Brand strategy']);
  });
  expect(screen.getByRole('button', { name: 'Save plan' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Save plan' }));
  expect(submitted).toHaveBeenCalledWith(['Brand strategy']);
});
