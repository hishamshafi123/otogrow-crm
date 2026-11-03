import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import {
  type ChangeDeliveryFinanceExportImportStatusMutation,
  type CreateDeliveryFinanceExportBatchMutation,
  type DeliveryFinanceExportBatchInput,
  type DeliveryFinanceExportImportStatusInput,
  type DeliveryFinanceExportProfileInput,
  type DeliveryFinanceExportsQuery,
  type SaveDeliveryFinanceExportProfileMutation,
} from '~/generated-metadata/graphql';
import {
  CHANGE_DELIVERY_FINANCE_EXPORT_IMPORT_STATUS,
  CREATE_DELIVERY_FINANCE_EXPORT_BATCH,
  GET_DELIVERY_FINANCE_EXPORTS,
  SAVE_DELIVERY_FINANCE_EXPORT_PROFILE,
} from '@/delivery/finance/export/delivery-finance-export.graphql';
import { type FinanceExportsSnapshot } from '@/delivery/finance/export/finance-export.types';
import { FinanceExportProfileForm } from '@/delivery/finance/export/FinanceExportProfileForm';
import { FinanceExportProfileDetails } from '@/delivery/finance/export/FinanceExportProfileDetails';
import { FinanceExportSelectionForm } from '@/delivery/finance/export/FinanceExportSelectionForm';
import { FinanceExportReview } from '@/delivery/finance/export/FinanceExportReview';
import { FinanceExportBatchDetails } from '@/delivery/finance/export/FinanceExportBatchDetails';
import { FinanceExportImportForm } from '@/delivery/finance/export/FinanceExportImportForm';
import { FinanceExportHistory } from '@/delivery/finance/export/FinanceExportHistory';
import {
  StyledExportBoundary,
  StyledExportRow,
} from '@/delivery/finance/export/financeExportStyles';
import { useFinanceExportLabels } from '@/delivery/finance/export/useFinanceExportLabels';
import {
  financeExportSelectionParams,
  readFinanceExportSelection,
} from '@/delivery/finance/export/finance-export-selection';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { StyledFinanceNavigation } from '@/delivery/finance/financeStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryFinanceExportsProps = { onChanged: () => Promise<unknown> };
export const DeliveryFinanceExports = (props: DeliveryFinanceExportsProps) => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  return (
    <ExportsWorkspace
      key={`${permission.scope}:${permission.lastVerifiedCanReadFinance}:${params.toString()}`}
      onChanged={props.onChanged}
      permission={permission}
    />
  );
};
const ExportsWorkspace = ({
  onChanged,
  permission,
}: DeliveryFinanceExportsProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  const financeLabels = useFinanceLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedSection = params.get('financeExportSection') ?? 'review';
  const section = ['profiles', 'review', 'batches'].includes(requestedSection)
    ? requestedSection
    : 'review';
  const profileId = params.get('financeExportProfile');
  const batchId = params.get('financeExportBatch');
  const query = useQuery<DeliveryFinanceExportsQuery>(
    GET_DELIVERY_FINANCE_EXPORTS,
    {
      variables: {
        input: {
          afterProfileId: params.get('financeExportProfilesAfter'),
          afterBatchId: params.get('financeExportBatchesAfter'),
          selectedProfileId: profileId,
          selectedBatchId: batchId,
          afterBatchRowKey: params.get('financeExportBatchRowsAfter'),
        },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !permission.ready || !permission.canReadFinance,
    },
  );
  const candidate = query.data?.deliveryFinanceExports;
  const available =
    permission.ready &&
    permission.canReadFinance &&
    !query.error &&
    permission.matches(candidate);
  const [lastVerified, setLastVerified] =
    useState<FinanceExportsSnapshot | null>(null);
  if (available && isDefined(candidate) && candidate !== lastVerified)
    setLastVerified(candidate);
  const retained = available && isDefined(candidate) ? candidate : lastVerified;
  const profile =
    retained?.selectedProfile?.id === profileId
      ? retained.selectedProfile
      : retained?.profiles.find((item) => item.id === profileId);
  const detail =
    retained?.selectedBatch?.batch.id === batchId
      ? retained.selectedBatch
      : null;
  const canManage =
    available && permission.canManageFinance && candidate?.canManage === true;
  const [editor, setEditor] = useState<
    'profile' | 'selection' | 'import' | null
  >(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const selection = readFinanceExportSelection(
    params,
    profile,
    financeLabels.currencies,
  );
  const selectionProvided = Object.keys(
    financeExportSelectionParams(null),
  ).some((key) => params.has(key));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveProfile] = useMutation<SaveDeliveryFinanceExportProfileMutation>(
    SAVE_DELIVERY_FINANCE_EXPORT_PROFILE,
  );
  const [createBatch] = useMutation<CreateDeliveryFinanceExportBatchMutation>(
    CREATE_DELIVERY_FINANCE_EXPORT_BATCH,
  );
  const [changeImport] =
    useMutation<ChangeDeliveryFinanceExportImportStatusMutation>(
      CHANGE_DELIVERY_FINANCE_EXPORT_IMPORT_STATUS,
    );
  const startRequest = useFinanceExportRequestGuard(
    permission.scope,
    available,
  );
  const destination = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.set('view', 'finance');
    next.set('financeView', 'exports');
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/delivery?${next}`;
  };
  const refresh = async () => {
    setError('');
    try {
      const response = await query.refetch();
      if (!permission.matches(response.data?.deliveryFinanceExports))
        throw new Error();
      return true;
    } catch {
      setError(
        t`Accounting exports could not refresh. Saved details are hidden and your draft is kept.`,
      );
      return false;
    }
  };
  const reloadEditor = async () => {
    if (await refresh()) setVersion((value) => value + 1);
  };
  const open = (next: typeof editor, id: string | null = null) =>
    requestAction(() => {
      setEditingProfileId(id);
      setVersion((value) => value + 1);
      setEditor(next);
      setError('');
    });
  const saveProfileInput = async (input: DeliveryFinanceExportProfileInput) => {
    if (!canManage || busy) return false;
    const current = startRequest();
    setBusy(true);
    setError('');
    try {
      const response = await saveProfile({ variables: { input } });
      const result = response.data?.saveDeliveryFinanceExportProfile;
      if (!current()) return false;
      if (!result) throw new Error(t`The export profile was not confirmed.`);
      setEditor(null);
      setNotice(
        result.replayed
          ? t`This profile request was already processed. Its current version is ${result.profile.revision}; review later changes in profile history.`
          : t`Export profile saved.`,
      );
      void refresh();
      navigate(
        destination({
          financeExportSection: 'profiles',
          financeExportProfile: result.profile.id,
          financeExportHistoryBefore: null,
        }),
      );
      void onChanged().catch(() => undefined);
      return true;
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error
            ? failure.message
            : t`The export profile could not be saved.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveBatchInput = async (input: DeliveryFinanceExportBatchInput) => {
    if (!available || busy) return false;
    const current = startRequest();
    setBusy(true);
    setError('');
    try {
      const response = await createBatch({ variables: { input } });
      const result = response.data?.createDeliveryFinanceExportBatch;
      if (!current()) return false;
      if (!result) throw new Error(t`The export batch was not confirmed.`);
      navigate(
        destination({
          financeExportSection: 'batches',
          financeExportBatch: result.batch.id,
          financeExportBatchRowsAfter: null,
          financeExportHistoryBefore: null,
        }),
      );
      void onChanged().catch(() => undefined);
      return true;
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error
            ? failure.message
            : t`The batch result is unconfirmed. Check the earlier request before preparing another batch.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveImportInput = async (
    input: DeliveryFinanceExportImportStatusInput,
  ) => {
    if (!canManage || busy) return false;
    const current = startRequest();
    setBusy(true);
    setError('');
    try {
      const response = await changeImport({ variables: { input } });
      const result = response.data?.changeDeliveryFinanceExportImportStatus;
      if (!current()) return false;
      if (!result)
        throw new Error(t`The manual import status was not confirmed.`);
      setEditor(null);
      setNotice(labels.status(result.batch.importStatus));
      await refresh();
      void onChanged().catch(() => undefined);
      return true;
    } catch (failure) {
      if (current())
        setError(
          failure instanceof Error
            ? failure.message
            : t`The manual import status could not be saved.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (permission.ready && !permission.canReadFinance)
    return (
      <p>
        <Trans>Finance access is required to use accounting exports.</Trans>
      </p>
    );
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <h2>
          <Trans>Accounting exports</Trans>
        </h2>
        <StyledDeliveryButton
          disabled={busy || query.loading}
          onClick={() => void refresh()}
        >
          <Trans>Refresh accounting exports</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <p>
        <Trans>
          Prepare a generic accountant CSV from actual cash or posted monthly
          results. Confirm your accountant’s template before importing it
          externally.
        </Trans>
      </p>
      <StyledFinanceNavigation aria-label={t`Accounting export sections`}>
        {[
          ['review', t`Review`],
          ['profiles', t`Profiles`],
          ['batches', t`Batch history`],
        ].map(([value, label]) => (
          <Link
            key={value}
            aria-current={section === value ? 'page' : undefined}
            to={destination({
              financeExportSection: value,
              financeExportHistoryBefore: null,
            })}
          >
            {label}
          </Link>
        ))}
      </StyledFinanceNavigation>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!permission.ready && (
        <p role="status">
          <Trans>
            Finance access could not be verified. Saved details are hidden and
            your draft is kept.
          </Trans>{' '}
          <StyledDeliveryButton
            onClick={() => void permission.refetch().catch(() => undefined)}
          >
            <Trans>Retry finance access</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      {query.error && (
        <p role="alert">
          <Trans>
            Accounting exports could not be checked. Retry before continuing;
            your draft is kept.
          </Trans>
        </p>
      )}
      {!available && !query.error && permission.ready && (
        <p role="status">
          <Trans>Loading accounting exports…</Trans>
        </p>
      )}
      {available && isDefined(candidate) && (
        <>
          {section === 'review' &&
            profile &&
            selectionProvided &&
            !selection && (
              <p role="alert">
                <Trans>
                  The export period in this link is incomplete or invalid for
                  the selected profile. Choose a currency and valid source
                  period before reviewing.
                </Trans>
              </p>
            )}
          {section !== 'batches' && (
            <>
              <label>
                <Trans>Export profile</Trans>
                <select
                  value={profileId ?? ''}
                  onChange={(event) =>
                    requestAction(() =>
                      navigate(
                        destination({
                          financeExportProfile: event.target.value || null,
                          financeExportHistoryBefore: null,
                          ...financeExportSelectionParams(null),
                        }),
                      ),
                    )
                  }
                >
                  <option value="">{t`Choose an export profile`}</option>
                  {profile &&
                    !candidate.profiles.some(
                      (item) => item.id === profile.id,
                    ) && <option value={profile.id}>{profile.name}</option>}
                  {candidate.profiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {labels.basis(item.basis)}
                      {!item.active ? ` · ${t`Inactive`}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {candidate.nextProfileId && (
                <Link
                  to={destination({
                    financeExportProfilesAfter: candidate.nextProfileId,
                  })}
                >
                  <Trans>More export profiles</Trans>
                </Link>
              )}
              {params.has('financeExportProfilesAfter') && (
                <Link to={destination({ financeExportProfilesAfter: null })}>
                  <Trans>First export profiles</Trans>
                </Link>
              )}
            </>
          )}
          {!candidate.profiles.length && !profile && section !== 'batches' && (
            <StyledDeliveryCard>
              <p>
                <Trans>
                  No export profile is available yet. A finance manager must
                  configure headers and mappings using the accountant’s sample
                  template.
                </Trans>
              </p>
              {canManage && (
                <StyledDeliveryButton onClick={() => open('profile')}>
                  <Trans>Set up an export profile</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryCard>
          )}
          {section === 'profiles' && (
            <>
              {canManage && (
                <StyledDeliveryButton onClick={() => open('profile')}>
                  <Trans>New export profile</Trans>
                </StyledDeliveryButton>
              )}
              {profile && (
                <>
                  <h3>
                    {profile.name} · {t`Version ${profile.revision}`}
                  </h3>
                  <FinanceExportProfileDetails profile={profile} />
                  {canManage && (
                    <StyledDeliveryButton
                      onClick={() => open('profile', profile.id)}
                    >
                      <Trans>Edit this export profile</Trans>
                    </StyledDeliveryButton>
                  )}
                  <h3>
                    <Trans>Profile history</Trans>
                  </h3>
                  <FinanceExportHistory
                    key={`${profile.id}:${profile.revision}`}
                    sourceType="PROFILE"
                    sourceId={profile.id}
                    enabled={available}
                  />
                </>
              )}
            </>
          )}
          {section === 'review' &&
            profile &&
            !selection &&
            editor !== 'selection' && (
              <>
                <p>
                  {profile.name} · {labels.basis(profile.basis)} ·{' '}
                  {t`Version ${profile.revision}`}
                </p>
                <FinanceExportProfileDetails profile={profile} />
                {profile.active ? (
                  <StyledDeliveryButton
                    data-primary="true"
                    onClick={() => open('selection')}
                  >
                    <Trans>Choose source period</Trans>
                  </StyledDeliveryButton>
                ) : (
                  <p>
                    <Trans>
                      This profile is inactive. Choose an active profile or ask
                      a finance manager to update it.
                    </Trans>
                  </p>
                )}
              </>
            )}
          {section === 'batches' && (
            <>
              <h3>
                <Trans>Saved batches</Trans>
              </h3>
              {!candidate.batches.length && (
                <p>
                  <Trans>No saved batches on this page.</Trans>
                </p>
              )}
              {candidate.batches.map((batch) => (
                <StyledExportRow key={batch.id}>
                  <Link
                    to={destination({
                      financeExportBatch: batch.id,
                      financeExportBatchRowsAfter: null,
                      financeExportHistoryBefore: null,
                    })}
                  >
                    {batch.profileName} · {batch.currency} ·{' '}
                    {batch.serviceMonth ??
                      `${batch.dateFrom} → ${batch.dateTo}`}
                  </Link>
                  <p>
                    {labels.basis(batch.basis)} ·{' '}
                    {labels.status(batch.importStatus)} ·{' '}
                    {new Date(batch.createdAt).toLocaleString()}
                  </p>
                </StyledExportRow>
              ))}
              <StyledDeliveryRow>
                {candidate.nextBatchId && (
                  <Link
                    to={destination({
                      financeExportBatchesAfter: candidate.nextBatchId,
                    })}
                  >
                    <Trans>Older export batches</Trans>
                  </Link>
                )}
                {params.has('financeExportBatchesAfter') && (
                  <Link to={destination({ financeExportBatchesAfter: null })}>
                    <Trans>Latest export batches</Trans>
                  </Link>
                )}
              </StyledDeliveryRow>
              {detail ? (
                <FinanceExportBatchDetails
                  key={detail.batch.id}
                  detail={detail}
                  enabled={available}
                  canManage={canManage}
                  destination={destination}
                  afterRowKey={params.get('financeExportBatchRowsAfter')}
                  onImport={() => open('import')}
                />
              ) : (
                batchId && (
                  <p>
                    <Trans>
                      The selected batch is unavailable. Choose another saved
                      batch.
                    </Trans>
                  </p>
                )
              )}
            </>
          )}
        </>
      )}
      <StyledExportBoundary hidden={!available} disabled={!available || busy}>
        {editor === 'profile' && retained && (
          <FinanceExportProfileForm
            key={version}
            initial={
              editingProfileId
                ? ((retained.selectedProfile?.id === editingProfileId
                    ? retained.selectedProfile
                    : retained.profiles.find(
                        (item) => item.id === editingProfileId,
                      )) ?? null)
                : null
            }
            allowedFields={retained.allowedFields}
            mappingScopes={retained.mappingScopes}
            projects={retained.projects}
            busy={busy}
            readOnly={!canManage}
            onSave={saveProfileInput}
            onCancel={() => setEditor(null)}
            onReload={() => void reloadEditor()}
          />
        )}
        {editor === 'selection' && profile && (
          <FinanceExportSelectionForm
            key={version}
            profile={profile}
            initial={selection}
            readOnly={!available}
            onReview={(input) => {
              navigate(
                destination({
                  financeExportSection: 'review',
                  ...financeExportSelectionParams(input),
                }),
              );
            }}
            onCancel={() => setEditor(null)}
          />
        )}
        {editor === 'import' && detail && (
          <FinanceExportImportForm
            key={version}
            batch={detail.batch}
            readOnly={!canManage}
            onSave={saveImportInput}
            onCancel={() => setEditor(null)}
            onReload={() => void reloadEditor()}
          />
        )}
      </StyledExportBoundary>
      {section === 'review' && selection && editor !== 'selection' && (
        <FinanceExportReview
          selection={selection}
          enabled={available && !busy}
          destination={destination}
          onSave={saveBatchInput}
          onCancel={() => {
            setEditor('selection');
            setVersion((value) => value + 1);
          }}
        />
      )}
    </StyledDeliveryStack>
  );
};
