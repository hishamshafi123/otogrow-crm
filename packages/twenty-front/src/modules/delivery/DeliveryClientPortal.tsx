import { useEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useLocation } from 'react-router-dom';
import {
  StyledDeliveryCanvas,
  StyledDeliveryStack,
  StyledDeliveryCard,
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { PortalLeaveGuard } from '@/delivery/portal/PortalLeaveGuard';
import { useClientPortal } from '@/delivery/portal/useClientPortal';
import {
  portalBudgetCents,
  type PortalReviewDecision,
} from '@/delivery/portal/portal-response';

const StyledPortal = styled(StyledDeliveryCanvas)`
  height: 100%;
  overflow-wrap: anywhere;
  width: 100%;
  > div {
    margin: 0 auto;
    max-width: 850px;
    min-width: 0;
  }
  fieldset {
    border: 0;
    margin: 0;
    min-width: 0;
    padding: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  input,
  textarea,
  select {
    box-sizing: border-box;
    max-width: 100%;
    width: 100%;
  }
  textarea {
    min-height: 88px;
    resize: vertical;
  }
  dialog {
    box-sizing: border-box;
    max-width: 440px;
    width: calc(100% - 32px);
  }
`;

export const DeliveryClientPortal = () => {
  const location = useLocation();
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const currentToken = location.hash ? location.hash.slice(1) : token;
  useEffect(() => {
    if (location.hash) setToken(location.hash.slice(1));
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, [location.hash]);
  return <ClientPortalWorkspace key={currentToken} token={currentToken} />;
};

const ClientPortalWorkspace = ({ token }: { token: string }) => {
  const { t } = useLingui();
  const portal = useClientPortal(token);
  const { data, form, attempt, verified, busy } = portal;
  const locked = busy || Boolean(attempt);
  const formChanged = Boolean(
    data && form && data.engagement.revision !== form.revision,
  );
  const budgetChanged = Boolean(
    data?.advertising &&
    portal.budgetForm &&
    (data.engagement.revision !== portal.budgetForm.revision ||
      data.advertising.currency !== portal.budgetForm.currency ||
      data.advertising.channel !== portal.budgetForm.channel ||
      data.advertising.period !== portal.budgetForm.period),
  );
  const [budgetError, setBudgetError] = useState('');
  return (
    <StyledPortal>
      <PortalLeaveGuard
        dirty={portal.dirty}
        busy={busy}
        generation={portal.generation}
      />
      <StyledDeliveryStack>
        <header>
          <small>
            <Trans>OTOGROW · CLIENT WORKSPACE</Trans>
          </small>
          <h1>{verified ? data?.engagement.name : t`Your client workspace`}</h1>
        </header>
        {portal.error && <p role="alert">{portal.error}</p>}
        {portal.message && <p role="status">{portal.message}</p>}
        {!data ? (
          <StyledDeliveryCard>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void portal.refresh();
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
                    value={portal.code}
                    disabled={busy}
                    required
                    onChange={(event) =>
                      portal.setCode(event.target.value.trim())
                    }
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
        ) : !verified ? (
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <p>
                <Trans>
                  Private information is hidden until access is verified. Your
                  local drafts remain on this page.
                </Trans>
              </p>
              {attempt && (
                <p>
                  <Trans>
                    A response is unconfirmed. Checking access also checks its
                    exact saved identity.
                  </Trans>
                </p>
              )}
              <StyledDeliveryButton
                disabled={busy}
                onClick={() => void portal.refresh()}
              >
                <Trans>Check access and saved responses</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
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
                    onClick={() => void portal.refresh()}
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
            {attempt && (
              <StyledDeliveryCard>
                <StyledDeliveryStack>
                  <h2>
                    <Trans>Check your submitted response</Trans>
                  </h2>
                  <p>
                    {attempt.state === 'RETRY'
                      ? t`A fresh check did not find this response. You can retry the exact original response or close the checked attempt.`
                      : attempt.state === 'CONFLICT'
                        ? t`This request identity has a different saved response. Nothing will be overwritten. Review the history or contact your account manager.`
                        : attempt.state === 'STALE'
                          ? t`The original form or shared version is no longer current. Review the history before closing this attempt. The original response cannot be retried.`
                          : t`We have not confirmed the result. Editing is paused so a retry cannot accidentally send different information.`}
                  </p>
                  <small>
                    <Trans>Request reference</Trans>:{' '}
                    {attempt.command.requestId}
                  </small>
                  <StyledDeliveryRow>
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={() => void portal.refresh()}
                    >
                      <Trans>Check saved response</Trans>
                    </StyledDeliveryButton>
                    {attempt.state === 'RETRY' && (
                      <StyledDeliveryButton
                        disabled={busy}
                        onClick={portal.retry}
                      >
                        <Trans>Retry exact original response</Trans>
                      </StyledDeliveryButton>
                    )}
                    {attempt.state !== 'UNKNOWN' && (
                      <StyledDeliveryButton
                        disabled={busy}
                        onClick={portal.discardChecked}
                      >
                        <Trans>Close checked attempt and keep notes</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledDeliveryRow>
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            )}
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h2>
                  <Trans>Brand assets</Trans>
                </h2>
                {portal.uploadUnknown && (
                  <>
                    <p role="status">
                      <Trans>
                        The upload result is unconfirmed. Check the current
                        asset list before uploading again; repeating an upload
                        may create a duplicate.
                      </Trans>
                    </p>
                    <StyledDeliveryButton
                      disabled={busy}
                      onClick={portal.acknowledgeUploadInspection}
                    >
                      <Trans>I checked the asset list</Trans>
                    </StyledDeliveryButton>
                  </>
                )}
                <label>
                  <Trans>
                    Upload a logo or brand guidelines (PNG, JPEG, WebP or PDF,
                    up to 20 MB)
                  </Trans>
                  <input
                    type="file"
                    disabled={locked || portal.uploadUnknown}
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void portal.upload(file);
                      event.target.value = '';
                    }}
                  />
                </label>
                {data.assets.map((asset) => (
                  <StyledDeliveryButton
                    key={asset.id}
                    disabled={busy}
                    onClick={() =>
                      void portal.download(`assets/${asset.id}`, asset.name)
                    }
                  >
                    {asset.name}
                  </StyledDeliveryButton>
                ))}
              </StyledDeliveryStack>
            </StyledDeliveryCard>
            {data.advertising && (
              <StyledDeliveryCard>
                <StyledDeliveryStack>
                  <h2>
                    <Trans>Advertising budget</Trans>
                  </h2>
                  <p>
                    {portal.budgetForm?.channel} · {portal.budgetForm?.currency}{' '}
                    · {portal.budgetForm?.period}
                  </p>
                  <p>
                    <Trans>
                      Request a change to advertising spend. Your project
                      manager reviews it before your marketer applies it. This
                      does not change your service fee.
                    </Trans>
                  </p>
                  {budgetChanged && (
                    <>
                      <p role="status">
                        <Trans>
                          The advertising settings changed. Your draft still
                          uses the original settings shown above. Discard it
                          explicitly before using the current settings.
                        </Trans>
                      </p>
                      <StyledDeliveryButton
                        disabled={locked}
                        onClick={portal.replaceBudgetForm}
                      >
                        <Trans>
                          Discard budget draft and use current settings
                        </Trans>
                      </StyledDeliveryButton>
                    </>
                  )}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (budgetChanged || !portal.budgetForm) return;
                      const amount = portalBudgetCents(portal.budget.amount);
                      if (amount === null) {
                        setBudgetError(
                          t`Enter a budget with up to two decimal places, between 0 and 1,000,000,000.`,
                        );
                        return;
                      }
                      setBudgetError('');
                      portal.submit({
                        action: 'budget',
                        requestId: crypto.randomUUID(),
                        revision: portal.budgetForm.revision,
                        amount,
                        reason: portal.budget.reason.trim(),
                      });
                    }}
                  >
                    <fieldset disabled={locked}>
                      <StyledDeliveryStack>
                        <label>
                          <Trans>Requested advertising budget</Trans>
                          <input
                            name="amount"
                            inputMode="decimal"
                            required
                            value={portal.budget.amount}
                            onChange={(event) => {
                              setBudgetError('');
                              portal.setBudget({
                                ...portal.budget,
                                amount: event.target.value,
                              });
                            }}
                          />
                        </label>
                        <label>
                          <Trans>Reason for change</Trans>
                          <input
                            name="reason"
                            maxLength={240}
                            required
                            value={portal.budget.reason}
                            onChange={(event) =>
                              portal.setBudget({
                                ...portal.budget,
                                reason: event.target.value,
                              })
                            }
                          />
                        </label>
                        {budgetError && <p role="alert">{budgetError}</p>}
                        <StyledDeliveryButton
                          type="submit"
                          disabled={
                            locked ||
                            budgetChanged ||
                            !portal.budgetForm ||
                            !portal.budget.reason.trim()
                          }
                        >
                          <Trans>Request budget change</Trans>
                        </StyledDeliveryButton>
                      </StyledDeliveryStack>
                    </fieldset>
                  </form>
                  <h3>
                    <Trans>Budget request history</Trans>
                  </h3>
                  {!data.advertising.requests.length && (
                    <p>
                      <Trans>No budget changes requested yet.</Trans>
                    </p>
                  )}
                  {data.advertising.requests.map((item) => (
                    <div key={item.id}>
                      <p>
                        {formatFinanceAmountMicros(
                          (BigInt(item.amount) * 10_000n).toString(),
                          item.currency,
                        )}{' '}
                        · {item.channel} · {item.period} · {item.status} ·{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                      {item.reason && <p>{item.reason}</p>}
                      {item.clientRequestId && (
                        <small>
                          <Trans>Request reference</Trans>:{' '}
                          {item.clientRequestId}
                        </small>
                      )}
                    </div>
                  ))}
                  <small>
                    <Trans>
                      A verified request means your manager checked the applied
                      change. This request history is not a live ad-account
                      balance.
                    </Trans>
                  </small>
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            )}
            {form && (
              <StyledDeliveryCard>
                <StyledDeliveryStack>
                  <h2>
                    <Trans>Brand onboarding</Trans>
                  </h2>
                  <small>
                    <Trans>
                      Provide brand links and notes. Do not enter passwords or
                      payment details.
                    </Trans>
                  </small>
                  {formChanged && (
                    <>
                      <p role="status">
                        <Trans>
                          Your account manager updated this form. Your original
                          answers are retained below so you can copy them.
                          Discard them explicitly to load the new form.
                        </Trans>
                      </p>
                      <StyledDeliveryButton
                        disabled={locked}
                        onClick={portal.replaceForm}
                      >
                        <Trans>Discard answers and load current form</Trans>
                      </StyledDeliveryButton>
                    </>
                  )}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (formChanged) return;
                      portal.submit({
                        action: 'onboard',
                        requestId: crypto.randomUUID(),
                        revision: form.revision,
                        answers: Object.fromEntries(
                          form.fields.map((field) => [
                            field.id,
                            (portal.answers[field.id] ?? '').trim(),
                          ]),
                        ),
                      });
                    }}
                  >
                    <fieldset disabled={locked}>
                      <StyledDeliveryStack>
                        {form.fields.map((field) => (
                          <label key={field.id}>
                            {field.label}
                            {field.required ? ' *' : ''}
                            <textarea
                              name={field.id}
                              required={field.required}
                              maxLength={6000}
                              value={portal.answers[field.id] ?? ''}
                              onChange={(event) =>
                                portal.setAnswers({
                                  ...portal.answers,
                                  [field.id]: event.target.value,
                                })
                              }
                            />
                          </label>
                        ))}
                        <StyledDeliveryButton
                          type="submit"
                          disabled={
                            locked ||
                            formChanged ||
                            form.fields.some(
                              (field) =>
                                field.required &&
                                !portal.answers[field.id]?.trim(),
                            )
                          }
                        >
                          <Trans>Submit brand information</Trans>
                        </StyledDeliveryButton>
                      </StyledDeliveryStack>
                    </fieldset>
                  </form>
                  <h3>
                    <Trans>Submitted brand information</Trans>
                  </h3>
                  {!data.submissions.length && (
                    <p>
                      <Trans>No brand information submitted yet.</Trans>
                    </p>
                  )}
                  {data.submissions.map((submission) => (
                    <details key={submission.id}>
                      <summary>
                        {new Date(submission.at).toLocaleString()} ·{' '}
                        {submission.accepted
                          ? t`Accepted by your account manager`
                          : t`Awaiting review`}{' '}
                        · {t`Form version`} {submission.formRevision}
                      </summary>
                      <small>
                        <Trans>Request reference</Trans>: {submission.id}
                      </small>
                      {submission.answers.map((answer, index) => (
                        <div key={`${index}-${answer.label}`}>
                          <strong>{answer.label}</strong>
                          <p style={{ whiteSpace: 'pre-wrap' }}>
                            {answer.value}
                          </p>
                        </div>
                      ))}
                    </details>
                  ))}
                </StyledDeliveryStack>
              </StyledDeliveryCard>
            )}
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
            {data.shares.map((share) => {
              const draft: { decision: PortalReviewDecision; comment: string } =
                portal.reviews[share.id] ?? {
                  decision: 'COMMENT',
                  comment: '',
                };
              return (
                <StyledDeliveryCard key={share.id}>
                  <StyledDeliveryStack>
                    <h3>
                      {share.title} ·{' '}
                      {share.kind === 'BRIEF' ? t`Brief` : t`Submission`} v
                      {share.version}
                    </h3>
                    <p
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
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
                          void portal.download(
                            `shares/${share.id}/asset`,
                            share.title,
                          )
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
                        <small>
                          {new Date(review.at).toLocaleString()} · {review.id}
                        </small>
                      </div>
                    ))}
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        portal.submit({
                          action: 'review',
                          requestId: crypto.randomUUID(),
                          shareId: share.id,
                          decision: draft.decision,
                          comment: draft.comment.trim(),
                        });
                      }}
                    >
                      <fieldset disabled={locked}>
                        <StyledDeliveryStack>
                          <label>
                            <Trans>Your decision for this version</Trans>
                            <select
                              value={draft.decision}
                              onChange={(event) => {
                                const decision = event.target.value;
                                if (
                                  decision === 'COMMENT' ||
                                  decision === 'APPROVED' ||
                                  decision === 'CHANGES_REQUESTED'
                                )
                                  portal.setReviews({
                                    ...portal.reviews,
                                    [share.id]: { ...draft, decision },
                                  });
                              }}
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
                              value={draft.comment}
                              onChange={(event) =>
                                portal.setReviews({
                                  ...portal.reviews,
                                  [share.id]: {
                                    ...draft,
                                    comment: event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <StyledDeliveryButton
                            disabled={locked || !draft.comment.trim()}
                            type="submit"
                          >
                            <Trans>Send review</Trans>
                          </StyledDeliveryButton>
                        </StyledDeliveryStack>
                      </fieldset>
                    </form>
                  </StyledDeliveryStack>
                </StyledDeliveryCard>
              );
            })}
          </>
        )}
      </StyledDeliveryStack>
    </StyledPortal>
  );
};
