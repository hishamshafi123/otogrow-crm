import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { GET_CLIENT_DIRECTORY_CANDIDATES } from '@/delivery/client-workspace/client-hub.graphql';
import {
  type ClientDirectoryCandidatesSnapshot,
  type ClientRosterUpdateInput,
} from '@/delivery/client-workspace/client-hub.types';
import {
  StyledClientFilterPill,
  StyledClientFilterPills,
  StyledClientTag,
  StyledRosterCandidateInfo,
  StyledRosterCandidateList,
  StyledRosterCandidateRow,
  StyledRosterModalDialog,
  StyledRosterModalFooter,
  StyledRosterModalHeader,
  StyledRosterModalOverlay,
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type CandidateFilter = 'all' | 'selected' | 'unselected';

type ClientRosterPickerModalProps = {
  open: boolean;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (input: ClientRosterUpdateInput) => Promise<boolean>;
};

export const ClientRosterPickerModal = ({
  open,
  saving,
  saveError,
  onClose,
  onSave,
}: ClientRosterPickerModalProps) => {
  const { t } = useLingui();
  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [filter, setFilter] = useState<CandidateFilter>('all');
  const [pendingOverrides, setPendingOverrides] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  const query = useQuery<{
    deliveryClientDirectoryCandidates: ClientDirectoryCandidatesSnapshot;
  }>(GET_CLIENT_DIRECTORY_CANDIDATES, {
    variables: { search: submittedSearch },
    fetchPolicy: 'network-only',
    skip: !open,
  });

  const snapshot = query.data?.deliveryClientDirectoryCandidates;
  const companies = useMemo(
    () => snapshot?.companies ?? [],
    [snapshot?.companies],
  );

  const baselineMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const company of companies) {
      map.set(company.id, company.isClient);
    }
    return map;
  }, [companies]);

  const isSelected = (id: string) =>
    id in pendingOverrides
      ? pendingOverrides[id]
      : (baselineMap.get(id) ?? false);

  const toggleCompany = (id: string, currentlySelected: boolean) => {
    const baseline = baselineMap.get(id);
    const nextValue = !currentlySelected;
    setPendingOverrides((previous) => {
      const next = { ...previous };
      if (baseline !== undefined && nextValue === baseline) {
        delete next[id];
      } else {
        next[id] = nextValue;
      }
      return next;
    });
  };

  const addIds = useMemo(
    () =>
      Object.entries(pendingOverrides)
        .filter(([, value]) => value)
        .map(([id]) => id),
    [pendingOverrides],
  );
  const removeIds = useMemo(
    () =>
      Object.entries(pendingOverrides)
        .filter(([, value]) => !value)
        .map(([id]) => id),
    [pendingOverrides],
  );
  const hasChanges = addIds.length > 0 || removeIds.length > 0;

  const visibleCompanies = useMemo(() => {
    return companies.filter((company) => {
      const selected =
        company.id in pendingOverrides
          ? pendingOverrides[company.id]
          : (baselineMap.get(company.id) ?? false);
      if (filter === 'selected') return selected;
      if (filter === 'unselected') return !selected;
      return true;
    });
  }, [baselineMap, companies, filter, pendingOverrides]);

  if (!open) return null;

  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }
    const ok = await onSave({ action: 'set', addIds, removeIds });
    if (ok) {
      setPendingOverrides({});
      onClose();
    }
  };

  return (
    <StyledRosterModalOverlay
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <StyledRosterModalDialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-roster-modal-title"
      >
        <StyledRosterModalHeader>
          <div>
            <h2 id="client-roster-modal-title">
              <Trans>Select your clients from CRM</Trans>
            </h2>
            <p>
              <Trans>
                Pick only the companies that are real agency clients. Companies
                synced from Gmail stay hidden from your Clients view and
                dropdowns unless you check them here.
              </Trans>
            </p>
          </div>
          <StyledDeliveryButton
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            <Trans>Close</Trans>
          </StyledDeliveryButton>
        </StyledRosterModalHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedSearch(searchInput.trim());
          }}
        >
          <StyledDeliveryRow>
            <input
              aria-label={t`Search CRM companies`}
              value={searchInput}
              maxLength={160}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t`Search CRM companies by name…`}
              style={{ flex: 1 }}
            />
            <StyledDeliveryButton type="submit" disabled={query.loading}>
              <Trans>Search</Trans>
            </StyledDeliveryButton>
            {submittedSearch && (
              <StyledDeliveryButton
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSubmittedSearch('');
                }}
              >
                <Trans>Clear</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </form>

        <StyledClientFilterPills>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            <Trans>All CRM companies</Trans>
          </StyledClientFilterPill>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'selected'}
            onClick={() => setFilter('selected')}
          >
            <Trans>Marked as clients</Trans>
          </StyledClientFilterPill>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'unselected'}
            onClick={() => setFilter('unselected')}
          >
            <Trans>Not clients</Trans>
          </StyledClientFilterPill>
        </StyledClientFilterPills>

        {saveError && <p role="alert">{saveError}</p>}
        {query.error && (
          <p role="alert">
            <Trans>
              Could not load CRM companies. Check your CRM permissions and try
              again.
            </Trans>
          </p>
        )}

        <StyledRosterCandidateList aria-label={t`CRM companies`}>
          {query.loading && (
            <p role="status">
              <Trans>Loading CRM companies…</Trans>
            </p>
          )}
          {!query.loading &&
            visibleCompanies.map((company) => {
              const checked = isSelected(company.id);
              return (
                <StyledRosterCandidateRow
                  key={company.id}
                  data-selected={checked}
                >
                  <StyledRosterCandidateInfo>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={() => toggleCompany(company.id, checked)}
                    />
                    <div>
                      <strong>{company.name}</strong>
                      {company.domainName && (
                        <small>{company.domainName}</small>
                      )}
                    </div>
                  </StyledRosterCandidateInfo>
                  <StyledDeliveryRow>
                    {company.projectsCount > 0 && (
                      <StyledClientTag data-tone="cyan">
                        {company.projectsCount === 1
                          ? t`1 project`
                          : t`${company.projectsCount} projects`}
                      </StyledClientTag>
                    )}
                    {checked && (
                      <StyledClientTag data-tone="iris">
                        <Trans>Client</Trans>
                      </StyledClientTag>
                    )}
                  </StyledDeliveryRow>
                </StyledRosterCandidateRow>
              );
            })}
          {!query.loading && !visibleCompanies.length && (
            <StyledDeliveryStack>
              <p>
                <Trans>No matching CRM companies found.</Trans>
              </p>
            </StyledDeliveryStack>
          )}
        </StyledRosterCandidateList>

        {snapshot?.hasMore && (
          <small>
            <Trans>
              Showing the first 100 matching CRM companies. Use search above to
              find a specific company.
            </Trans>
          </small>
        )}

        <StyledRosterModalFooter>
          <div>
            {hasChanges ? (
              <small>
                {addIds.length > 0 && t`+${addIds.length} marked as client`}
                {addIds.length > 0 && removeIds.length > 0 ? ' · ' : ''}
                {removeIds.length > 0 && t`-${removeIds.length} removed`}
              </small>
            ) : (
              <Link to="/delivery?view=onboarding" onClick={onClose}>
                <Trans>+ Create a brand-new client instead</Trans>
              </Link>
            )}
          </div>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={saving}
              onClick={onClose}
            >
              <Trans>Cancel</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              data-primary="true"
              disabled={saving || !hasChanges}
              onClick={() => void handleSave()}
            >
              {saving ? t`Saving…` : t`Save client list`}
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledRosterModalFooter>
      </StyledRosterModalDialog>
    </StyledRosterModalOverlay>
  );
};
