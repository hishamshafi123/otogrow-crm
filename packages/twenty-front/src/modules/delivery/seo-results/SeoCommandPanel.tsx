import { useLayoutEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { useSeoCommands } from '@/delivery/seo-results/useSeoCommands';
import { type useSeoAccess } from '@/delivery/seo-results/useSeoAccess';
import {
  type SeoBody,
  type SeoCommand,
  type SeoIntent,
  type SeoReceipt,
} from '@/delivery/seo-results/seo-results.types';
import { SeoReportForm } from '@/delivery/seo-results/SeoReportForm';
import { canonicalSeoBody } from '@/delivery/seo-results/seo-body';
import {
  seoDestination,
  SEO_CLOSE_COMMAND,
} from '@/delivery/seo-results/seo-navigation';
import { useSeoLabels } from '@/delivery/seo-results/useSeoLabels';
import { StyledSeoBoundary } from '@/delivery/seo-results/seoStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type SeoCommandPanelProps = {
  access: ReturnType<typeof useSeoAccess>;
  project: { id: string; revision: number; companyId: string | null };
  reportId: string;
  requestId: string;
  mode: string;
  intent: SeoIntent | null;
  consumeIntent: (requestId: string) => void;
  enabled: boolean;
  onDenied: () => void;
  onSaved: () => Promise<unknown>;
  currentRevision?: number;
  canExecute?: boolean;
  ownerName?: string;
};
export const SeoCommandPanel = ({
  access,
  project,
  reportId,
  requestId,
  mode,
  intent,
  consumeIntent,
  enabled,
  onDenied,
  onSaved,
  currentRevision,
  canExecute = true,
  ownerName,
}: SeoCommandPanelProps) => {
  const { t } = useLingui();
  const labels = useSeoLabels();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus();
  const [opened] = useState(() =>
    intent?.requestId === requestId &&
    intent.reportId === reportId &&
    intent.projectId === project.id &&
    intent.mode === mode
      ? intent
      : null,
  );
  const [body, setBody] = useState<SeoBody | null>(opened?.body ?? null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [frozen, setFrozen] = useState<SeoCommand | null>(null);
  const [receipt, setReceipt] = useState<SeoReceipt | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState('');
  useLayoutEffect(() => consumeIntent(requestId), [requestId, consumeIntent]);
  const commands = useSeoCommands({
    access,
    scope: `${project.id}:${project.revision}:${project.companyId}:${reportId}`,
    enabled,
    onDenied,
  });
  const changed =
    receipt === null &&
    opened !== null &&
    (project.revision !== opened.projectRevision ||
      project.companyId !== opened.expectedCompanyId ||
      (currentRevision !== undefined && currentRevision !== opened.revision) ||
      !canExecute);
  const editable = mode === 'new' || mode === 'edit';
  useDeliveryDraftStatus({
    dirty:
      receipt === null &&
      (frozen !== null ||
        (body !== null &&
          JSON.stringify(body) !== JSON.stringify(opened?.body)) ||
        note !== '' ||
        confirmed),
    saving: commands.busy,
  });
  const accept = async (saved: SeoReceipt) => {
    setReceipt(saved);
    setFrozen(null);
    setBody(null);
    setRetryAllowed(false);
    setConflict(false);
    setMessage(t`The saved report action was confirmed.`);
    await onSaved().catch(() => undefined);
  };
  const execute = async (command: SeoCommand) => {
    if (!enabled || changed || conflict || commands.busy) return;
    setFrozen(command);
    setRetryAllowed(false);
    setMessage('');
    const saved = await commands.execute(command);
    if (saved.kind === 'FOUND') await accept(saved.receipt);
    else if (saved.kind === 'REJECTED') {
      setFrozen(null);
      setMessage(saved.message);
    } else if (saved.kind === 'CONFLICT') {
      setConflict(true);
      setMessage(saved.message);
    } else
      setMessage(
        t`The result could not be confirmed. Your exact submitted report action is kept. Check it before trying again.`,
      );
  };
  const check = async () => {
    setRetryAllowed(false);
    const result = await commands.check(requestId, reportId);
    if (result.kind === 'FOUND') {
      const expected = editable ? 'SAVE' : mode;
      if (result.receipt.action !== expected) {
        setMessage(
          t`A different report action uses this link. Close this view and inspect the saved report.`,
        );
        return;
      }
      await accept(result.receipt);
    } else if (result.kind === 'NOT_FOUND') {
      setRetryAllowed(frozen !== null && !changed && !conflict);
      setMessage(
        frozen && (changed || conflict)
          ? t`No saved action was found. Your submitted notes remain in this view, but the current report must be reviewed before another action.`
          : frozen
            ? t`No saved action was found. You can retry the exact action already submitted.`
            : t`No saved action was found. The unsaved preparation is no longer available. Close this view to review the current report again.`,
      );
    } else
      setMessage(
        t`The saved action could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <section
      ref={focus}
      tabIndex={-1}
      aria-label={t`Report preparation`}
      data-seo-request={requestId}
      data-seo-report={reportId}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            {editable
              ? t`Prepare report draft`
              : mode === 'SUBMIT'
                ? t`Submit for independent review`
                : mode === 'APPROVE'
                  ? t`Approve this report version`
                  : t`Return this report for changes`}
          </h3>
          <Link to={seoDestination(params, SEO_CLOSE_COMMAND)}>
            <Trans>Close preparation</Trans>
          </Link>
        </StyledDeliveryRow>
        {message && <p role="status">{message}</p>}
        {receipt && (
          <>
            <p>
              {labels.action(receipt.action)} · {t`Version ${receipt.version}`}{' '}
              · {receipt.actorName}
            </p>
            <Link to={seoDestination(params, SEO_CLOSE_COMMAND)}>
              <Trans>Open saved report</Trans>
            </Link>
          </>
        )}
        {(changed || conflict) && (
          <p role="alert">
            <Trans>
              This report or its editing authority changed. This older
              preparation cannot be submitted. Close it and review the current
              report.
            </Trans>
          </p>
        )}
        {!enabled && (
          <p role="status">
            <Trans>
              Current report access could not be verified. Preparation is hidden
              and kept while you reconnect.
            </Trans>
          </p>
        )}
        {!receipt && !opened && (
          <p>
            <Trans>
              This link can check an earlier report action. Unsaved preparation
              is not restored after leaving or reloading.
            </Trans>
          </p>
        )}
        {!receipt && (frozen !== null || opened === null) && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={() => void check()}
            >
              <Trans>Check saved report action</Trans>
            </StyledDeliveryButton>
            {retryAllowed && frozen !== null && !changed && !conflict && (
              <StyledDeliveryButton
                type="button"
                disabled={!enabled || commands.busy}
                onClick={() => void execute(frozen)}
              >
                <Trans>Retry exact report action</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        <StyledSeoBoundary
          hidden={!enabled || receipt !== null}
          disabled={
            !enabled || changed || conflict || frozen !== null || commands.busy
          }
          inert={!enabled || undefined}
        >
          {body &&
            opened &&
            (editable ? (
              <SeoReportForm
                access={access}
                projectId={project.id}
                body={body}
                update={setBody}
                onDenied={onDenied}
                disabled={
                  changed || conflict || frozen !== null || commands.busy
                }
                ownerName={ownerName}
                taskNames={opened.taskNames}
                onSubmit={() =>
                  void execute({
                    kind: 'SAVE',
                    input: {
                      id: reportId,
                      requestId,
                      projectId: project.id,
                      revision: opened.revision,
                      projectRevision: opened.projectRevision,
                      expectedCompanyId: opened.expectedCompanyId,
                      body: canonicalSeoBody(body),
                    },
                  })
                }
              />
            ) : (
              <StyledDeliveryStack>
                <p>
                  <Trans>
                    The exact displayed report version will be submitted or
                    reviewed. No measurement, task or client message will be
                    changed by this decision.
                  </Trans>
                </p>
                <label>
                  <Trans>Review notes</Trans>
                  <textarea
                    aria-label={t`Review notes`}
                    maxLength={2000}
                    value={note}
                    onChange={(event) => setNote(event.currentTarget.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) =>
                      setConfirmed(event.currentTarget.checked)
                    }
                  />
                  <Trans>
                    I reviewed the report evidence and this decision.
                  </Trans>
                </label>
                <StyledDeliveryButton
                  type="button"
                  data-primary="true"
                  disabled={
                    !confirmed || (mode === 'REQUEST_CHANGES' && !note.trim())
                  }
                  onClick={() =>
                    void execute({
                      kind: 'DECIDE',
                      input: {
                        id: reportId,
                        requestId,
                        revision: opened.revision,
                        action: mode,
                        note: note.trim(),
                      },
                    })
                  }
                >
                  {mode === 'SUBMIT'
                    ? t`Submit report`
                    : mode === 'APPROVE'
                      ? t`Approve report`
                      : t`Request report changes`}
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            ))}
        </StyledSeoBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
