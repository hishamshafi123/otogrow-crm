import { useEffect, useState, type FormEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  type ClientPortalData,
  type ClientShare,
} from '@/delivery/delivery-clients.types';
import {
  StyledDeliveryCanvas,
  StyledDeliveryStack,
  StyledDeliveryCard,
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';

const StyledPortal = styled(StyledDeliveryCanvas)`
  height: 100%;
  overflow-wrap: anywhere;
  width: 100%;
  > div {
    margin: 0 auto;
    max-width: 850px;
  }
`;
export const DeliveryClientPortal = () => {
  const { t } = useLingui();
  const [token] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const [code, setCode] = useState('');
  const [data, setData] = useState<ClientPortalData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = async (input?: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-client/${input ? 'response' : 'session'}`,
        {
          method: input ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${token}:${code}`,
            ...(input ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(input ? { body: JSON.stringify(input) } : {}),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        },
      );
      if (!response.ok) {
        if (response.status === 404 || response.status === 403) setData(null);
        throw new Error(
          response.status === 409
            ? t`The form changed. Reload the portal before submitting again.`
            : t`Could not access this portal or save your response. Check your code, or ask your account manager for a fresh link.`,
        );
      }
      setData(await response.json());
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not load the portal.`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const download = async (path: string, name: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-client/${path}`,
        {
          headers: { Authorization: `Bearer ${token}:${code}` },
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        },
      );
      if (!response.ok)
        throw new Error(
          t`This file is no longer available. Ask your account manager for access.`,
        );
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t`Download failed.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/delivery-client/assets`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}:${code}` },
          body,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        },
      );
      if (!response.ok)
        throw new Error(
          t`Upload failed. Use PNG, JPEG, WebP or PDF under 20 MB, or ask your account manager to check access and storage limits.`,
        );
      setData(await response.json());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t`Upload failed.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <StyledPortal>
      <StyledDeliveryStack>
        <header>
          <small>
            <Trans>OTOGROW · CLIENT WORKSPACE</Trans>
          </small>
          <h1>{data?.engagement.name ?? t`Your client workspace`}</h1>
        </header>
        {error && <p role="alert">{error}</p>}
        {!data ? (
          <StyledDeliveryCard>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void request();
              }}
            >
              <StyledDeliveryStack>
                <p>
                  <Trans>
                    Enter the access code shared separately by your account
                    manager.
                  </Trans>
                </p>
                <label>
                  <Trans>Access code</Trans>
                  <input
                    type="password"
                    autoComplete="off"
                    value={code}
                    onChange={(event) => setCode(event.target.value.trim())}
                    required
                  />
                </label>
                <StyledDeliveryButton disabled={busy || !token} type="submit">
                  <Trans>Open workspace</Trans>
                </StyledDeliveryButton>
                {!token && (
                  <p>
                    <Trans>
                      Open the original link from your account manager to
                      continue.
                    </Trans>
                  </p>
                )}
              </StyledDeliveryStack>
            </form>
          </StyledDeliveryCard>
        ) : (
          <>
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <h2>
                    <Trans>Your services</Trans>
                  </h2>
                  <StyledDeliveryButton
                    disabled={busy}
                    onClick={() => void request()}
                  >
                    <Trans>Refresh</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                <p>{data.engagement.services.join(' · ')}</p>
                <p>{data.engagement.scope}</p>
                <p>{data.engagement.allowance}</p>
                <small>{data.engagement.contact}</small>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h2>
                  <Trans>Brand assets</Trans>
                </h2>
                <label>
                  <Trans>
                    Upload a logo or brand guidelines (PNG, JPEG, WebP or PDF,
                    up to 20 MB)
                  </Trans>
                  <input
                    type="file"
                    disabled={busy}
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                      event.target.value = '';
                    }}
                  />
                </label>
                {data.assets.map((asset) => (
                  <StyledDeliveryButton
                    key={asset.id}
                    disabled={busy}
                    onClick={() =>
                      void download(`assets/${asset.id}`, asset.name)
                    }
                  >
                    {asset.name}
                  </StyledDeliveryButton>
                ))}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
            {data.advertising && (
              <AdvertisingBudget data={data} busy={busy} onSubmit={request} />
            )}
            <Onboarding
              key={data.engagement.revision}
              data={data}
              busy={busy}
              onSubmit={request}
            />
            <h2>
              <Trans>Work shared for your review</Trans>
            </h2>
            {!data.shares.length && (
              <p>
                <Trans>
                  Your account manager will share approved work here.
                </Trans>
              </p>
            )}
            {data.shares.map((share) => (
              <StyledDeliveryCard key={share.id}>
                <StyledDeliveryStack>
                  <h3>
                    {share.title} ·{' '}
                    {share.kind === 'BRIEF' ? t`Brief` : t`Submission`} v
                    {share.version}
                  </h3>
                  <p
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {share.content}
                  </p>
                  {share.links
                    .filter((link) => /^https?:\/\//i.test(link))
                    .map((link) => (
                      <a
                        key={link}
                        href={link}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {link}
                      </a>
                    ))}
                  {share.hasAsset && (
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={() =>
                        void download(`shares/${share.id}/asset`, share.title)
                      }
                    >
                      <Trans>Download approved file</Trans>
                    </StyledDeliveryButton>
                  )}
                  {share.reviews.map((review) => (
                    <div key={review.id}>
                      <strong>
                        {review.decision === 'APPROVED'
                          ? t`Approved`
                          : review.decision === 'CHANGES_REQUESTED'
                            ? t`Changes requested`
                            : t`Comment`}
                      </strong>
                      <p>{review.comment}</p>
                      <small>{new Date(review.at).toLocaleString()}</small>
                    </div>
                  ))}
                  <Review share={share} busy={busy} onSubmit={request} />
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            ))}
          </>
        )}
      </StyledDeliveryStack>
    </StyledPortal>
  );
};
type OnboardingProps = {
  data: ClientPortalData;
  busy: boolean;
  onSubmit: (input: Record<string, unknown>) => Promise<boolean>;
};
const Onboarding = ({ data, busy, onSubmit }: OnboardingProps) => {
  const { t } = useLingui();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saved, setSaved] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answers = Object.fromEntries(new FormData(event.currentTarget));
    if (
      await onSubmit({
        action: 'onboard',
        requestId,
        revision: data.engagement.revision,
        answers,
      })
    ) {
      setRequestId(crypto.randomUUID());
      setSaved(true);
    }
  };
  return (
    <StyledDeliveryCard>
      <form onSubmit={submit}>
        <StyledDeliveryStack>
          <h2>
            <Trans>Brand onboarding</Trans>
          </h2>
          <small>
            <Trans>
              Provide brand links and notes. Do not enter passwords or payment
              details.
            </Trans>
          </small>
          {data.engagement.fields.map((field) => (
            <label key={field.id}>
              {field.label}
              {field.required ? ' *' : ''}
              <textarea
                name={field.id}
                required={field.required}
                maxLength={6000}
              />
            </label>
          ))}
          <StyledDeliveryButton type="submit" disabled={busy}>
            <Trans>Submit brand information</Trans>
          </StyledDeliveryButton>
          {saved && (
            <p role="status">
              <Trans>Your information was submitted for review.</Trans>
            </p>
          )}
          {data.submissions.map((submission) => (
            <small key={submission.id}>
              {new Date(submission.at).toLocaleString()} ·{' '}
              {submission.accepted
                ? t`Accepted by your account manager`
                : t`Awaiting review`}
            </small>
          ))}
        </StyledDeliveryStack>
      </form>
    </StyledDeliveryCard>
  );
};
type ReviewProps = {
  share: ClientShare;
  busy: boolean;
  onSubmit: OnboardingProps['onSubmit'];
};
const Review = ({ share, busy, onSubmit }: ReviewProps) => {
  const { t } = useLingui();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState('COMMENT');
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await onSubmit({
            action: 'review',
            requestId,
            shareId: share.id,
            decision,
            comment,
          })
        ) {
          setRequestId(crypto.randomUUID());
          setComment('');
        }
      }}
    >
      <StyledDeliveryStack>
        <label>
          <Trans>Your decision for this version</Trans>
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
          >
            <option value="COMMENT">{t`Leave a comment`}</option>
            <option value="APPROVED">{t`Approve this version`}</option>
            <option value="CHANGES_REQUESTED">{t`Request changes`}</option>
          </select>
        </label>
        <label>
          <Trans>Comment</Trans>
          <textarea
            required
            maxLength={6000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <StyledDeliveryButton disabled={busy} type="submit">
          <Trans>Send review</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </form>
  );
};

type AdvertisingBudgetProps = OnboardingProps;
const AdvertisingBudget = ({
  data,
  busy,
  onSubmit,
}: AdvertisingBudgetProps) => {
  const { t } = useLingui();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const advertising = data.advertising;
  if (!advertising) return null;
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h2>
          <Trans>Advertising budget</Trans>
        </h2>
        <p>
          {advertising.channel} · {advertising.currency} · {advertising.period}
        </p>
        <p>
          <Trans>
            Request a change to advertising spend. Your project manager reviews
            it before your marketer applies it. This does not change your
            service fee.
          </Trans>
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const amount = Math.round(Number(form.get('amount')) * 100);
            if (
              await onSubmit({
                action: 'budget',
                requestId,
                revision: data.engagement.revision,
                amount,
                reason: form.get('reason'),
              })
            )
              setRequestId(crypto.randomUUID());
          }}
        >
          <StyledDeliveryStack>
            <label>
              <Trans>Requested advertising budget</Trans>
              <input
                name="amount"
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                required
              />
            </label>
            <label>
              <Trans>Reason for change</Trans>
              <input name="reason" maxLength={240} required />
            </label>
            <StyledDeliveryButton
              type="submit"
              disabled={busy}
            >{t`Request budget change`}</StyledDeliveryButton>
          </StyledDeliveryStack>
        </form>
        <h3>
          <Trans>Budget request history</Trans>
        </h3>
        {!advertising.requests.length && (
          <p>
            <Trans>No budget changes requested yet.</Trans>
          </p>
        )}
        {advertising.requests.map((item) => (
          <div key={item.id}>
            {new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: item.currency,
            }).format(item.amount / 100)}{' '}
            · {item.channel} · {item.period} · {item.status} ·{' '}
            {new Date(item.createdAt).toLocaleDateString()}
          </div>
        ))}
        <small>
          <Trans>
            Only a verified request confirms that the manager checked the
            applied change. Live ad-account balances are not connected.
          </Trans>
        </small>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
