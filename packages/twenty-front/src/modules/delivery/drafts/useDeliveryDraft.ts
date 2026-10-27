import { useState } from 'react';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';

export const useDeliveryDraft = <TValues>({
  initialValues,
  revision,
  busy,
}: {
  initialValues: TValues;
  revision: number;
  busy: boolean;
}) => {
  const signature = JSON.stringify(initialValues);
  const [state, setState] = useState({
    values: initialValues,
    baseline: signature,
    serverSignature: signature,
    revision,
  });
  const dirty = JSON.stringify(state.values) !== state.baseline;
  const [saving, setSaving] = useState(false);
  const { requestAction } = useDeliveryDraftGuard();
  if (
    !dirty &&
    !saving &&
    !busy &&
    (state.revision !== revision || state.serverSignature !== signature)
  ) {
    setState({
      values: initialValues,
      baseline: signature,
      serverSignature: signature,
      revision,
    });
  }
  useDeliveryDraftStatus({ dirty, saving: busy || saving });
  return {
    values: state.values,
    revision: state.revision,
    dirty,
    stale: dirty && state.revision !== revision,
    saving: busy || saving,
    setSaving,
    update: (values: TValues) =>
      setState((previous) => ({ ...previous, values })),
    markSaved: (values = state.values) =>
      setState((previous) => ({
        ...previous,
        values,
        baseline: JSON.stringify(values),
      })),
    reload: () =>
      requestAction(() =>
        setState({
          values: initialValues,
          baseline: signature,
          serverSignature: signature,
          revision,
        }),
      ),
  };
};
