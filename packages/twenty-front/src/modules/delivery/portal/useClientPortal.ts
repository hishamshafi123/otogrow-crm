import { useLayoutEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  portalAttemptResult,
  portalSessionSchema,
  type PortalAttempt,
  type PortalCommand,
  type PortalForm,
  type PortalReviewDecision,
  type PortalSession,
} from '@/delivery/portal/portal-response';

class PortalHttpError extends Error {
  constructor(readonly status: number) {
    super('Portal request failed');
  }
}
const EMPTY_REVIEW = {
  decision: 'COMMENT' as PortalReviewDecision,
  comment: '',
};

export const useClientPortal = (token: string) => {
  const { t } = useLingui();
  const [code, setCode] = useState('');
  const [data, setData] = useState<PortalSession | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<PortalForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<Record<string, typeof EMPTY_REVIEW>>(
    {},
  );
  const [budget, setBudget] = useState({ amount: '', reason: '' });
  const [budgetForm, setBudgetForm] = useState<{
    revision: number;
    currency: string;
    channel: string;
    period: string;
  } | null>(null);
  const [attempt, setAttempt] = useState<PortalAttempt | null>(null);
  const [uploadUnknown, setUploadUnknown] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- A request must claim the boundary synchronously before React can render disabled controls.
  const boundary = useRef({ generation: 0, pending: false, active: true });
  useLayoutEffect(() => {
    const activeBoundary = boundary.current;
    activeBoundary.active = true;
    return () => {
      activeBoundary.active = false;
      activeBoundary.generation++;
    };
  }, []);
  const current = (epoch: number) =>
    boundary.current.active && boundary.current.generation === epoch;
  const begin = () => {
    if (boundary.current.pending || !boundary.current.active) return null;
    boundary.current.pending = true;
    setBusy(true);
    setError('');
    setMessage('');
    return boundary.current.generation;
  };
  const finish = (epoch: number) => {
    if (!current(epoch)) return;
    boundary.current.pending = false;
    setBusy(false);
  };
  const denied = () => {
    boundary.current.generation++;
    boundary.current.pending = false;
    setGeneration((previous) => previous + 1);
    setBusy(false);
    setVerified(false);
    setData(null);
    setForm(null);
    setAnswers({});
    setReviews({});
    setBudget({ amount: '', reason: '' });
    setBudgetForm(null);
    setAttempt(null);
    setUploadUnknown(false);
    setMessage('');
    setError(
      t`Access could not be confirmed. Private information was cleared. Enter your code again or ask your account manager for a fresh link.`,
    );
  };
  const headers = () => ({ Authorization: `Bearer ${token}:${code}` });
  const fetchPortal = async (
    path: string,
    init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
  ) => {
    const response = await fetch(
      `${REACT_APP_SERVER_BASE_URL}/portal/delivery-client/${path}`,
      {
        ...init,
        headers: { ...headers(), ...init?.headers },
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      },
    );
    if (!response.ok) throw new PortalHttpError(response.status);
    return response;
  };
  const failure = (caught: unknown, epoch: number, writing = false) => {
    if (!current(epoch)) return;
    if (
      caught instanceof PortalHttpError &&
      [401, 403, 404].includes(caught.status)
    ) {
      denied();
      return;
    }
    setVerified(false);
    setError(
      caught instanceof PortalHttpError && caught.status === 409
        ? t`The form or saved response changed. Check the current workspace before continuing. Your original response is retained.`
        : writing
          ? t`We could not confirm whether your response was saved. Your original response is retained. Check its status before retrying.`
          : t`We could not verify the workspace. Your drafts are retained on this page. Check access to continue.`,
    );
  };
  const acceptSession = (session: PortalSession) => {
    const currentShares = new Set(session.shares.map((share) => share.id));
    if (Object.keys(reviews).some((id) => !currentShares.has(id))) {
      setGeneration((previous) => previous + 1);
      setReviews((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([id]) => currentShares.has(id)),
        ),
      );
    }
    if (
      !session.advertising &&
      (budget.amount.length > 0 || budget.reason.length > 0)
    ) {
      setGeneration((previous) => previous + 1);
      setBudget({ amount: '', reason: '' });
    }
    if (!session.advertising) setBudgetForm(null);
    else if (
      !budgetForm ||
      (budget.amount.length === 0 &&
        budget.reason.length === 0 &&
        attempt?.command.action !== 'budget')
    )
      setBudgetForm({
        revision: session.engagement.revision,
        currency: session.advertising.currency,
        channel: session.advertising.channel,
        period: session.advertising.period,
      });
    setData(session);
    setVerified(true);
    if (
      !form ||
      (!Object.values(answers).some((answer) => answer.length > 0) &&
        attempt?.command.action !== 'onboard')
    )
      setForm({
        revision: session.engagement.revision,
        fields: session.engagement.fields,
      });
  };
  const reconcile = (
    owned: PortalAttempt,
    session: PortalSession,
    checked: boolean,
  ) => {
    const result = portalAttemptResult(owned, session);
    if (result === 'MATCH') {
      setAttempt(null);
      if (owned.command.action === 'onboard') {
        setAnswers({});
        setForm({
          revision: session.engagement.revision,
          fields: session.engagement.fields,
        });
      } else if (owned.command.action === 'budget') {
        setBudget({ amount: '', reason: '' });
        if (session.advertising)
          setBudgetForm({
            revision: session.engagement.revision,
            currency: session.advertising.currency,
            channel: session.advertising.channel,
            period: session.advertising.period,
          });
      } else {
        const shareId = owned.command.shareId;
        setReviews((previous) => ({ ...previous, [shareId]: EMPTY_REVIEW }));
      }
      setMessage(
        t`Your exact response is saved. You can review it in the history below.`,
      );
    } else if (
      result === 'STALE' &&
      (owned.command.action === 'review' ||
        (owned.command.action === 'budget' && !session.advertising))
    ) {
      setGeneration((previous) => previous + 1);
      setAttempt(null);
      setMessage(
        t`This response source is no longer available. Its private local preparation was cleared. Ask your account manager to confirm any earlier submission.`,
      );
    } else
      setAttempt({
        ...owned,
        state:
          result === 'NOT_FOUND' ? (checked ? 'RETRY' : 'UNKNOWN') : result,
      });
  };
  const refresh = async () => {
    const epoch = begin();
    if (epoch === null) return;
    try {
      const session = portalSessionSchema.parse(
        await (await fetchPortal('session')).json(),
      );
      if (!current(epoch)) return;
      acceptSession(session);
      if (attempt) reconcile(attempt, session, true);
    } catch (caught) {
      failure(caught, epoch);
    } finally {
      finish(epoch);
    }
  };
  const send = async (owned: PortalAttempt) => {
    if (!verified || (attempt && attempt !== owned)) return;
    const epoch = begin();
    if (epoch === null) return;
    setAttempt({ ...owned, state: 'UNKNOWN' });
    try {
      const session = portalSessionSchema.parse(
        await (
          await fetchPortal('response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(owned.command),
          })
        ).json(),
      );
      if (!current(epoch)) return;
      acceptSession(session);
      reconcile(owned, session, false);
    } catch (caught) {
      failure(caught, epoch, true);
    } finally {
      finish(epoch);
    }
  };
  const submit = (command: PortalCommand) => {
    if (attempt) return;
    void send({
      command,
      form: command.action === 'onboard' ? form : null,
      state: 'UNKNOWN',
    });
  };
  const retry = () => {
    if (attempt?.state === 'RETRY' && verified) void send(attempt);
  };
  const discardChecked = () => {
    if (
      !attempt ||
      !verified ||
      !['RETRY', 'STALE', 'CONFLICT'].includes(attempt.state)
    )
      return;
    setAttempt(null);
    setMessage(
      t`The checked attempt was closed. Review your draft before creating a new response.`,
    );
  };
  const replaceForm = () => {
    if (!data || attempt || !verified) return;
    setAnswers({});
    setForm({
      revision: data.engagement.revision,
      fields: data.engagement.fields,
    });
  };
  const replaceBudgetForm = () => {
    if (!data?.advertising || attempt || !verified) return;
    setBudget({ amount: '', reason: '' });
    setBudgetForm({
      revision: data.engagement.revision,
      currency: data.advertising.currency,
      channel: data.advertising.channel,
      period: data.advertising.period,
    });
  };
  const upload = async (file: File) => {
    if (!verified || attempt || uploadUnknown) return;
    const epoch = begin();
    if (epoch === null) return;
    setUploadUnknown(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const session = portalSessionSchema.parse(
        await (await fetchPortal('assets', { method: 'POST', body })).json(),
      );
      if (!current(epoch)) return;
      acceptSession(session);
      setUploadUnknown(false);
      setMessage(t`The upload completed. Check the brand asset list below.`);
    } catch (caught) {
      failure(caught, epoch, true);
    } finally {
      finish(epoch);
    }
  };
  const download = async (path: string, name: string) => {
    if (!verified) return;
    const epoch = begin();
    if (epoch === null) return;
    try {
      const blob = await (await fetchPortal(path)).blob();
      if (!current(epoch)) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      failure(caught, epoch);
    } finally {
      finish(epoch);
    }
  };
  const dirty =
    Boolean(attempt) ||
    uploadUnknown ||
    Object.values(answers).some((answer) => answer.length > 0) ||
    Object.values(reviews).some(
      (review) => review.comment.length > 0 || review.decision !== 'COMMENT',
    ) ||
    budget.amount.length > 0 ||
    budget.reason.length > 0;
  return {
    code,
    setCode,
    data,
    verified,
    busy,
    generation,
    error,
    message,
    form,
    answers,
    setAnswers,
    reviews,
    setReviews,
    budget,
    budgetForm,
    setBudget,
    attempt,
    uploadUnknown,
    dirty,
    refresh,
    submit,
    retry,
    discardChecked,
    replaceForm,
    replaceBudgetForm,
    upload,
    download,
    acknowledgeUploadInspection: () => {
      if (verified && !busy) setUploadUnknown(false);
    },
  };
};
