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
