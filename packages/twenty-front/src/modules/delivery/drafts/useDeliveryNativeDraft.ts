import { useCallback, useState, type FormEvent } from 'react';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';

const snapshot = (form: HTMLFormElement) =>
  JSON.stringify(
    Array.from(
      form.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('input, select, textarea'),
    )
      .filter((field) => Boolean(field.name))
      .map((field) => [
        field.name,
        field instanceof HTMLInputElement &&
        ['checkbox', 'radio'].includes(field.type)
          ? field.checked
          : field instanceof HTMLInputElement && field.type === 'password'
            ? Boolean(field.value)
            : field instanceof HTMLSelectElement && field.multiple
              ? Array.from(field.selectedOptions, (option) => option.value)
              : field.value,
      ]),
  );

export const useDeliveryNativeDraft = ({
  extraValues,
  busy,
}: {
  extraValues: unknown;
  busy: boolean;
}) => {
  const [values, setValues] = useState({ baseline: '', current: '' });
  const [extraBaseline, setExtraBaseline] = useState(() =>
    JSON.stringify(extraValues),
  );
  const dirty =
    values.current !== values.baseline ||
    JSON.stringify(extraValues) !== extraBaseline;
  useDeliveryDraftStatus({ dirty, saving: busy });
  return {
    dirty,
    resetFormBaseline: (form: HTMLFormElement) => {
      const current = snapshot(form);
      setValues({ baseline: current, current });
      setExtraBaseline(JSON.stringify(extraValues));
    },
    markSaved: (nextExtraValues = extraValues) => {
      setValues((previous) => ({ ...previous, baseline: previous.current }));
      setExtraBaseline(JSON.stringify(nextExtraValues));
    },
    formRef: useCallback((form: HTMLFormElement | null) => {
      if (form) {
        const current = snapshot(form);
        setValues({ baseline: current, current });
      }
    }, []),
    onChange: (event: FormEvent<HTMLFormElement>) => {
      const current = snapshot(event.currentTarget);
      setValues((previous) => ({ ...previous, current }));
    },
  };
};
