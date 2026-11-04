import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import {
  useCompetitorPreparation,
  type CompetitorPreparationOptions,
} from '@/delivery/competitors/useCompetitorPreparation';
import { useCompetitorLabels } from '@/delivery/competitors/useCompetitorLabels';
import {
  competitorDestination,
  COMPETITOR_CLOSE_COMMAND,
  COMPETITOR_CLOSE_SOURCE,
} from '@/delivery/competitors/competitor-navigation';
import { CompetitorSourceForm } from '@/delivery/competitors/CompetitorSourceForm';
import { CompetitorSourceIdentity } from '@/delivery/competitors/CompetitorSourceIdentity';
import { CompetitorSourceStage } from '@/delivery/competitors/CompetitorSourceStage';
import { CompetitorSourceSummary } from '@/delivery/competitors/CompetitorSourceSummary';
import { CompetitorSourceCoverage } from '@/delivery/competitors/CompetitorSourceCoverage';
import {
  StyledCompetitorBoundary,
  StyledCompetitorForm,
} from '@/delivery/competitors/competitorStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type CompetitorCommandPanelProps = CompetitorPreparationOptions & {
  restoreLogicalFocus: () => boolean;
};
export const CompetitorCommandPanel = (
  options: CompetitorCommandPanelProps,
) => {
  const { access, project, contextScope, mode, enabled, onDenied } = options;
  const { t } = useLingui();
  const labels = useCompetitorLabels();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus(options.restoreLogicalFocus);
  const state = useCompetitorPreparation(options);
  const close = competitorDestination(
    params,
    mode === 'new' && !state.receipt
      ? COMPETITOR_CLOSE_SOURCE
      : COMPETITOR_CLOSE_COMMAND,
  );
  return (
    <section ref={focus} tabIndex={-1} aria-label={t`Source preparation`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>{state.planning ? t`Prepare source` : labels.action(mode)}</h3>
          <Link to={close}>
            <Trans>Close preparation</Trans>
          </Link>
        </StyledDeliveryRow>
        {!state.sourceAvailable && (
          <div role="alert">
            <p>
              {state.detailQuery.error
                ? t`Current source access could not be verified. Private preparation is hidden and retained while you reconnect.`
                : t`Checking the current source…`}
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || mode === 'new'}
              onClick={() => void state.detailQuery.refetch()}
            >
              <Trans>Check current source</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {state.message && <p role="alert">{state.message}</p>}
        {state.changed && !state.receipt && (
          <p role="alert">
            <Trans>
              The project, source or access changed. Review the current source
              before preparing a new request. A dispatched action must be
              checked first.
            </Trans>
          </p>
        )}
        {!state.opened && !state.receipt && (
          <p>
            <Trans>
              This link can recover a saved source action. Unsaved preparation
              is not restored after reloading or leaving.
            </Trans>
          </p>
        )}
        {!state.receipt && (state.sent || !state.opened) && (
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={
                !state.sourceAvailable || state.commands.busy || state.preparing
              }
              onClick={() => void state.check()}
            >
              <Trans>Check saved source action</Trans>
            </StyledDeliveryButton>
            {state.retry && state.frozen && (
              <StyledDeliveryButton
                type="button"
                disabled={
                  !state.sourceAvailable ||
                  state.changed ||
                  state.commands.busy ||
                  !state.confirmed ||
                  !state.canExecute ||
                  (state.planning && !state.formReady)
                }
                onClick={() => state.frozen && void state.execute(state.frozen)}
              >
                <Trans>Retry exact source action</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        <StyledCompetitorBoundary
          hidden={!state.sourceAvailable}
          disabled={
            !state.sourceAvailable || state.commands.busy || state.preparing
          }
          inert={!state.sourceAvailable || undefined}
        >
          {state.receipt ? (
            <CompetitorSourceStage
              key={`receipt:${state.receipt.requestId}`}
              label={t`Saved source action`}
              status
              restoreLogicalFocus={options.restoreLogicalFocus}
            >
              <h4>
                <Trans>Saved source action</Trans>
              </h4>
              <p>
                {labels.recorded(state.receipt.action)} ·{' '}
                {t`Configuration version ${state.receipt.version}`}
              </p>
              <p>
                {labels.status(state.receipt.status)} ·{' '}
                <Trans>Collection remains OFF.</Trans>
              </p>
              <Link
                to={competitorDestination(params, {
                  ...COMPETITOR_CLOSE_COMMAND,
                  competitorVersion: String(state.receipt.version),
                  competitorHistoryAfter: null,
                })}
              >
                <Trans>Open saved configuration</Trans>
              </Link>
            </CompetitorSourceStage>
          ) : state.opened && state.body ? (
            <StyledDeliveryStack>
              {state.planning && (
                <div hidden={state.frozen !== null || state.changed}>
                  <CompetitorSourceForm
                    access={access}
                    project={project}
                    contextScope={contextScope}
                    body={state.body}
                    update={state.setBody}
                    editing={mode === 'edit'}
                    enabled={state.sourceAvailable}
                    locked={
                      state.frozen !== null ||
                      state.changed ||
                      state.preparing ||
                      state.commands.busy ||
                      !state.canExecute
                    }
                    onDenied={onDenied}
                    onReady={state.setFormScope}
                    onSubmit={() => void state.prepare()}
                  />
                </div>
              )}
              {!state.planning && !state.frozen && !state.changed && (
                <StyledCompetitorForm
                  onSubmit={(event) => {
                    event.preventDefault();
                    void state.prepare();
                  }}
                >
                  {state.current && (
                    <CompetitorSourceIdentity source={state.current.source} />
                  )}
                  <p>
                    {mode === 'RESTORE'
                      ? state.current?.source.status === 'ARCHIVED'
                        ? t`Restore this archived source as Paused. Its configuration and history remain available; collection stays OFF.`
                        : t`Restore this paused source to the saved directory. Collection stays OFF.`
                      : mode === 'ARCHIVE'
                        ? t`Archive this source from current research while preserving its configuration and history.`
                        : t`Pause this source in the research directory. Its configuration and history are kept.`}
                  </p>
                  <label>
                    <Trans>Reason for this change</Trans>
                    <textarea
                      aria-label={t`Reason for this change`}
                      maxLength={2000}
                      required
                      rows={3}
                      value={state.note}
                      onChange={(event) =>
                        state.setNote(event.currentTarget.value)
                      }
                    />
                  </label>
                  <StyledDeliveryButton
                    type="submit"
                    disabled={!state.canExecute}
                  >
                    <Trans>Review this change</Trans>
                  </StyledDeliveryButton>
                </StyledCompetitorForm>
              )}
              {state.frozen && (
                <CompetitorSourceStage
                  key={`preview:${options.requestId}:${state.frozen.hash}`}
                  label={t`Review prepared source action`}
                  restoreLogicalFocus={options.restoreLogicalFocus}
                >
                  <h4>
                    <Trans>Review prepared source action</Trans>
                  </h4>
                  {state.planning && state.preview ? (
                    <>
                      <CompetitorSourceSummary body={state.preview.body} />
                      <CompetitorSourceCoverage
                        platform={state.preview.body.platform}
                      />
                    </>
                  ) : (
                    <>
                      {state.current && (
                        <CompetitorSourceIdentity
                          source={state.current.source}
                        />
                      )}
                      <strong>{labels.action(mode)}</strong>
                      <p>{state.note}</p>
                      <p>
                        <Trans>
                          Collection stays OFF. This change does not retrieve
                          posts or delete history.
                        </Trans>
                      </p>
                    </>
                  )}
                  {state.planning && !state.formReady && (
                    <p role="alert">
                      <Trans>
                        Current owners and reviewers must be checked again
                        before saving. Return to editing to review the selected
                        people.
                      </Trans>
                    </p>
                  )}
                  {!state.canExecute && (
                    <p role="alert">
                      <Trans>
                        This source action is no longer available under your
                        current permissions.
                      </Trans>
                    </p>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={state.confirmed}
                      disabled={state.sent}
                      onChange={(event) =>
                        state.setConfirmed(event.currentTarget.checked)
                      }
                    />{' '}
                    <Trans>
                      I checked this exact source, its people and the collection
                      limits.
                    </Trans>
                  </label>
                  <StyledDeliveryRow>
                    {!state.sent && (
                      <StyledDeliveryButton
                        type="button"
                        data-primary="true"
                        disabled={
                          !state.confirmed ||
                          state.changed ||
                          !state.canExecute ||
                          state.commands.busy ||
                          (state.planning && !state.formReady)
                        }
                        onClick={() =>
                          state.frozen && void state.execute(state.frozen)
                        }
                      >
                        {labels.action(state.planning ? 'SAVE' : mode)}
                      </StyledDeliveryButton>
                    )}
                    {!state.sent && (
                      <StyledDeliveryButton
                        type="button"
                        onClick={state.returnToEditing}
                      >
                        <Trans>Return to editing</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledDeliveryRow>
                </CompetitorSourceStage>
              )}
              {(state.changed || state.absent) &&
                project.companyId === state.opened.expectedCompanyId &&
                (!state.sent || state.absent) && (
                  <StyledDeliveryStack>
                    {state.current && (
                      <details>
                        <summary>
                          <Trans>Compare the current saved source</Trans>
                        </summary>
                        <CompetitorSourceSummary body={state.current.body} />
                      </details>
                    )}
                    <label>
                      <input
                        type="checkbox"
                        checked={state.rebaseConfirmed}
                        onChange={(event) =>
                          state.setRebaseConfirmed(event.currentTarget.checked)
                        }
                      />{' '}
                      <Trans>
                        I reviewed the current source and want to keep my
                        entered source and notes in a new request.
                      </Trans>
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      disabled={
                        !state.rebaseConfirmed ||
                        state.commands.busy ||
                        state.preparing ||
                        !state.canExecute ||
                        (mode !== 'new' && !state.current)
                      }
                      onClick={state.replace}
                    >
                      <Trans>Prepare new request with my draft</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryStack>
                )}
            </StyledDeliveryStack>
          ) : null}
        </StyledCompetitorBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
