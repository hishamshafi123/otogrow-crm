import { useCallback, useState } from 'react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryHandoffPreviewQuery,
  type DeliveryHandoffCreateInput,
} from '~/generated-metadata/graphql';
type Source = DeliveryHandoffPreviewQuery['deliveryHandoffPreview']['source'];
type DeliveryHandoffFormProps = {
  source: Source;
  latest: Source | undefined;
  workspace: DeliveryWorkspace;
  ready: boolean;
  onSave: (input: DeliveryHandoffCreateInput) => Promise<boolean>;
  onClose: () => void;
};
const StyledHandoffFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
const StyledHandoffNotes = styled.label`
  grid-column: 1 / -1;
`;
export const DeliveryHandoffForm = ({
  source,
  latest,
  workspace,
  ready,
  onSave,
  onClose,
}: DeliveryHandoffFormProps) => {
  const { t } = useLingui();
  const { requestAction } = useDeliveryDraftGuard();
  const [opened, setOpened] = useState(source);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const [draft, setDraft] = useState({
    projectName: source.opportunityName,
    managerId: '',
    reviewerId: '',
    billing: '',
    services: '',
    contact: '',
    scheduledDate: '',
    memberIds: [] as string[],
    reviewed: false,
  });
  const [baseline, setBaseline] = useState(JSON.stringify(draft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const focusFirstField = useCallback(
    (form: HTMLFormElement | null) => form?.querySelector('input')?.focus(),
    [],
  );
  useDeliveryDraftStatus({
    dirty: JSON.stringify(draft) !== baseline,
    saving: busy,
  });
  const managers = workspace.members.filter(
    (member) => member.access === 'ADMIN' || member.access === 'MANAGER',
  );
  const services = [
    ...new Set(
      draft.services
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const valid = Boolean(
    ready &&
    draft.reviewed &&
    draft.projectName.trim() &&
    draft.managerId &&
    draft.reviewerId &&
    draft.managerId !== draft.reviewerId &&
    draft.billing &&
    services.length > 0 &&
    services.length <= 20 &&
    services.every((service) => service.length <= 100) &&
    draft.contact.trim(),
  );
  const stale = Boolean(latest && latest.fingerprint !== opened.fingerprint);
  return (
    <form
      ref={focusFirstField}
      aria-label={t`Sales to delivery handoff`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || busy || stale) return;
        setBusy(true);
        setError('');
        try {
          if (
            await onSave({
              opportunityId: opened.opportunityId,
              quoteId: opened.quoteId,
              fingerprint: opened.fingerprint,
              projectName: draft.projectName,
              managerId: draft.managerId,
              reviewerId: draft.reviewerId,
              memberIds: draft.memberIds,
              services,
              billing: draft.billing,
              contact: draft.contact,
              scheduledDate: draft.scheduledDate || null,
            })
          ) {
            setBaseline(JSON.stringify(draft));
            onClose();
          } else
            setError(
              t`Client setup was not confirmed. Your choices are preserved. Check the current source and your permissions, then retry safely.`,
            );
        } catch {
          setError(
            t`Client setup was not confirmed. Your choices are preserved. Retry safely to check whether it was created.`,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <StyledDeliveryStack>
        <h3>
          {opened.companyName} · {opened.quoteNumber}
        </h3>
        <details
          open={scopeExpanded}
          onToggle={(event) => setScopeExpanded(event.currentTarget.open)}
        >
          <summary>
            <Trans>Agreed scope imported from the accepted quote</Trans>
          </summary>
          <p style={{ whiteSpace: 'pre-wrap' }}>{opened.scope}</p>
        </details>
        <p>
          <Trans>Accepted quote total:</Trans>{' '}
          {opened.currency &&
          opened.totalAmountMicros !== null &&
          Number.isSafeInteger(Number(opened.totalAmountMicros))
            ? `${opened.currency} ${(Number(opened.totalAmountMicros) / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
            : t`Check the original quote`}
        </p>
        <p>
          <Trans>
            The quoted amount is a commercial reference. This handoff does not
            confirm payment, send a contract or start billing.
          </Trans>
        </p>
        {stale && (
          <div role="alert">
            <p>
              <Trans>
                The accepted source changed. Your delivery choices will be kept.
                Review the updated scope before continuing.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                if (latest) {
                  setOpened(latest);
                  setDraft({ ...draft, reviewed: false });
                  setScopeExpanded(true);
                  setError('');
                }
              }}
            >
              <Trans>Review updated scope</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <fieldset disabled={busy || !ready}>
          <StyledHandoffFields>
            <label>
              <Trans>Delivery project name</Trans>
              <input
                required
                maxLength={160}
                value={draft.projectName}
                onChange={(event) =>
                  setDraft({ ...draft, projectName: event.target.value })
                }
              />
            </label>
            <label>
              <Trans>Delivery setup owner</Trans>
              <select
                required
                value={draft.managerId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    managerId: event.target.value,
                    reviewerId:
                      draft.reviewerId === event.target.value
                        ? ''
                        : draft.reviewerId,
                  })
                }
              >
                <option value="">{t`Choose a delivery manager`}</option>
                {managers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Trans>Independent setup reviewer</Trans>
              <select
                required
                value={draft.reviewerId}
                onChange={(event) =>
                  setDraft({ ...draft, reviewerId: event.target.value })
                }
              >
                <option value="">{t`Choose a different reviewer`}</option>
                {managers
                  .filter((member) => member.id !== draft.managerId)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <Trans>Billing arrangement</Trans>
              <select
                required
                value={draft.billing}
                onChange={(event) =>
                  setDraft({ ...draft, billing: event.target.value })
                }
              >
                <option value="">{t`Choose the agreed arrangement`}</option>
                <option value="ONE_TIME">{t`One-time project`}</option>
                <option value="RETAINER">{t`Retainer`}</option>
              </select>
            </label>
            <label>
              <Trans>Services (comma separated)</Trans>
              <input
                required
                value={draft.services}
                maxLength={2000}
                placeholder={t`AI videos, SEO`}
                onChange={(event) =>
                  setDraft({ ...draft, services: event.target.value })
                }
              />
            </label>
            <label>
              <Trans>Setup start day (optional)</Trans>
              <input
                type="date"
                value={draft.scheduledDate}
                onChange={(event) =>
                  setDraft({ ...draft, scheduledDate: event.target.value })
                }
              />
            </label>
            <StyledHandoffNotes>
              <Trans>Client contact and coordination notes</Trans>
              <textarea
                required
                rows={3}
                value={draft.contact}
                maxLength={500}
                onChange={(event) =>
                  setDraft({ ...draft, contact: event.target.value })
                }
              />
            </StyledHandoffNotes>
          </StyledHandoffFields>
          <details>
            <summary>
              <Trans>Additional project teammates</Trans>
            </summary>
            {workspace.members
              .filter(
                (member) =>
                  ![draft.managerId, draft.reviewerId].includes(member.id),
              )
              .map((member) => (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={draft.memberIds.includes(member.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        memberIds: event.target.checked
                          ? [...draft.memberIds, member.id]
                          : draft.memberIds.filter((id) => id !== member.id),
                      })
                    }
                  />
                  {member.name}
                </label>
              ))}
          </details>
          <label>
            <input
              type="checkbox"
              checked={draft.reviewed}
              onChange={(event) =>
                setDraft({ ...draft, reviewed: event.target.checked })
              }
            />
            <Trans>I reviewed the imported scope and delivery owners.</Trans>
          </label>
        </fieldset>
        {managers.length < 2 && (
          <p role="alert">
            <Trans>
              Add a second delivery manager in People and roles for independent
              setup review.
            </Trans>
          </p>
        )}
        <p>
          <Trans>
            Creates one engagement and three setup tasks: approve brand
            onboarding, confirm billing, and plan the first delivery period.
            Quantities, production tasks and client links still need explicit
            setup.
          </Trans>
        </p>
        {error && <p role="alert">{error}</p>}
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={!valid || busy || stale}
          >
            <Trans>Create client setup</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            disabled={busy}
            onClick={() => requestAction(onClose)}
          >
            <Trans>Cancel handoff</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </form>
  );
};
