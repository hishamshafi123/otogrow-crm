import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLazyQuery } from '@apollo/client/react';
import { saveAs } from 'file-saver';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFinanceExportDownloadQuery } from '~/generated-metadata/graphql';
import {
  type FinanceExportBatchDetail,
  type FinanceExportDestination,
} from '@/delivery/finance/export/finance-export.types';
import { GET_DELIVERY_FINANCE_EXPORT_DOWNLOAD } from '@/delivery/finance/export/delivery-finance-export.graphql';
import { FinanceExportProfileDetails } from '@/delivery/finance/export/FinanceExportProfileDetails';
import { FinanceExportHistory } from '@/delivery/finance/export/FinanceExportHistory';
import {
  FinanceExportExclusions,
  FinanceExportRows,
  FinanceExportTotalsView,
} from '@/delivery/finance/export/FinanceExportReviewRows';
import { useFinanceExportLabels } from '@/delivery/finance/export/useFinanceExportLabels';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type FinanceExportBatchDetailsProps = {
  detail: FinanceExportBatchDetail;
  destination: FinanceExportDestination;
  afterRowKey: string | null;
  enabled: boolean;
  canManage: boolean;
  onImport: () => void;
};
export const FinanceExportBatchDetails = ({
  detail,
  destination,
  afterRowKey,
  enabled,
  canManage,
  onImport,
}: FinanceExportBatchDetailsProps) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  const permission = useWorkflowAccess();
  const { batch } = detail;
  const [exclusionPage, setExclusionPage] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [download, downloadState] =
    useLazyQuery<DeliveryFinanceExportDownloadQuery>(
      GET_DELIVERY_FINANCE_EXPORT_DOWNLOAD,
      { fetchPolicy: 'no-cache' },
    );
  const available = enabled && permission.ready && permission.canReadFinance;
  const startRequest = useFinanceExportRequestGuard(
    `${permission.scope}:${batch.id}`,
    available,
  );
  const downloadBatch = async () => {
    if (!available || downloadState.loading) return;
    const current = startRequest();
    setError('');
    setNotice('');
    try {
      const response = await download({
        variables: { input: { batchId: batch.id }, identity: permission.scope },
      });
      const result = response.data?.deliveryFinanceExportDownload;
      if (!current()) return;
      if (
        !permission.matches(result) ||
        result?.batchId !== batch.id ||
        result.checksum !== batch.checksum ||
        result.byteLength !== batch.byteLength ||
        result.encoding !== 'UTF-8' ||
        result.mimeType !== 'text/csv;charset=utf-8'
      )
        throw new Error();
      const blob = new Blob([result.csv], { type: result.mimeType });
      if (blob.size !== result.byteLength) throw new Error();
      saveAs(blob, result.fileName);
      setNotice(
        t`The saved CSV was downloaded. External import is still a separate manual step.`,
      );
    } catch {
      if (current())
        setError(
          t`The saved CSV could not be verified or downloaded. Retry this same batch; no new export is needed.`,
        );
    }
  };
  if (!available) return null;
  return (
    <StyledDeliveryStack>
      <h3>
        <Trans>Saved export batch</Trans>
      </h3>
      <p>
        {batch.profileName} · {t`Profile version ${batch.profileRevision}`} ·{' '}
        {labels.basis(batch.basis)} · {batch.currency}
      </p>
      <p>
        {batch.serviceMonth
          ? `${t`Service month`}: ${batch.serviceMonth} · ${t`Accounting date`}: ${batch.accountingDate}`
          : `${batch.dateFrom} → ${batch.dateTo}`}
      </p>
      <p>
        {batch.createdByName} · {new Date(batch.createdAt).toLocaleString()}
      </p>
      <FinanceExportTotalsView
        totals={batch.totals}
        currency={batch.currency}
        basis={batch.basis}
      />
      <p>
        <strong>{labels.status(batch.importStatus)}</strong>
        {batch.importChangedAt
          ? ` · ${batch.importChangedByName ?? t`Recorded team member`} · ${new Date(batch.importChangedAt).toLocaleString()}`
          : ''}
      </p>
      {batch.importReference && (
        <p>
          {t`External import reference`}: {batch.importReference}
        </p>
      )}
      {batch.importEvidenceUrl &&
        /^https?:\/\//i.test(batch.importEvidenceUrl) && (
          <a href={batch.importEvidenceUrl} target="_blank" rel="noreferrer">
            <Trans>Manual import evidence</Trans>
          </a>
        )}
      {batch.reexportReason && (
        <p>
          {t`Reason for re-export`}: {batch.reexportReason}
        </p>
      )}
      {detail.currentWarnings.map((code) => (
        <p key={code} role="status">
          {labels.issue(code)}
        </p>
      ))}
      <p>
        <Trans>
          The saved file and exported source versions never change. Current
          source status is shown for review; later corrections require a
          separate accountant decision.
        </Trans>
      </p>
      <StyledDeliveryRow>
        <StyledDeliveryButton
          data-primary="true"
          disabled={downloadState.loading}
          onClick={() => void downloadBatch()}
        >
          <Trans>Download saved CSV</Trans>
        </StyledDeliveryButton>
        {canManage && (
          <StyledDeliveryButton onClick={onImport}>
            {batch.importStatus === 'CONFIRMED'
              ? t`Reverse manual import confirmation`
              : t`Record manual import`}
          </StyledDeliveryButton>
        )}
      </StyledDeliveryRow>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <details>
        <summary>
          <Trans>File identity</Trans>
        </summary>
        <p>
          {t`Batch ID`}: {batch.id}
        </p>
        <p>SHA-256: {batch.checksum}</p>
        <p>
          {t`UTF-8 bytes`}: {batch.byteLength}
        </p>
      </details>
      <FinanceExportProfileDetails profile={detail.profile} />
      <FinanceExportRows
        rows={detail.rows}
        profile={detail.profile}
        basis={batch.basis}
        destination={destination}
        historical
      />
      <StyledDeliveryRow>
        {detail.nextRowKey && (
          <Link
            to={destination({ financeExportBatchRowsAfter: detail.nextRowKey })}
          >
            <Trans>More saved rows</Trans>
          </Link>
        )}
        {afterRowKey && (
          <Link to={destination({ financeExportBatchRowsAfter: null })}>
            <Trans>First saved rows</Trans>
          </Link>
        )}
      </StyledDeliveryRow>
      <FinanceExportExclusions
        exclusions={detail.exclusions.slice(
          exclusionPage * 50,
          (exclusionPage + 1) * 50,
        )}
        basis={batch.basis}
        currency={batch.currency}
        serviceMonth={batch.serviceMonth}
      />
      <StyledDeliveryRow>
        {(exclusionPage + 1) * 50 < detail.exclusions.length && (
          <StyledDeliveryButton
            onClick={() => setExclusionPage((page) => page + 1)}
          >
            <Trans>More saved exclusions</Trans>
          </StyledDeliveryButton>
        )}
        {exclusionPage > 0 && (
          <StyledDeliveryButton onClick={() => setExclusionPage(0)}>
            <Trans>First saved exclusions</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryRow>
      <h3>
        <Trans>Batch history</Trans>
      </h3>
      <FinanceExportHistory
        key={`${batch.id}:${batch.revision}`}
        sourceType="BATCH"
        sourceId={batch.id}
        enabled={available}
      />
    </StyledDeliveryStack>
  );
};
