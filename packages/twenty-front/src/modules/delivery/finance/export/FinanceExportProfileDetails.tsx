import { Trans, useLingui } from '@lingui/react/macro';
import { type FinanceExportProfile } from '@/delivery/finance/export/finance-export.types';
import { useFinanceExportLabels } from '@/delivery/finance/export/useFinanceExportLabels';
import { StyledExportRow } from '@/delivery/finance/export/financeExportStyles';

type FinanceExportProfileDetailsProps = { profile: FinanceExportProfile };
export const FinanceExportProfileDetails = ({
  profile,
}: FinanceExportProfileDetailsProps) => {
  const { t } = useLingui();
  const labels = useFinanceExportLabels();
  return (
    <details>
      <summary>{t`Profile configuration · version ${profile.revision}`}</summary>
      <p>
        {profile.name} · {labels.basis(profile.basis)} ·{' '}
        {profile.active
          ? t`Available for new reviews`
          : t`Inactive for new reviews`}
      </p>
      <p>
        {t`Decimal places`}: {profile.precision} · {t`Date format`}:{' '}
        {profile.dateFormat} · {t`Separator`}:{' '}
        {profile.delimiter === 'COMMA'
          ? t`Comma`
          : profile.delimiter === 'SEMICOLON'
            ? t`Semicolon`
            : t`Tab`}{' '}
        ·{' '}
        {profile.includeBom
          ? t`UTF-8 with byte-order mark`
          : t`UTF-8 without byte-order mark`}
      </p>
      <ol>
        {profile.columns.map((column, index) => (
          <li key={`${index}:${column.header}`}>
            {column.header} →{' '}
            {labels.fields[column.field] ?? t`Unsupported field`}
            {column.field === 'CONSTANT' ? `: ${column.constant ?? ''}` : ''}
          </li>
        ))}
      </ol>
      <h4>
        <Trans>Account and counterparty mappings</Trans>
      </h4>
      {!profile.mappings.length && (
        <p>
          <Trans>No account mappings configured.</Trans>
        </p>
      )}
      {profile.mappings.map((mapping, index) => (
        <StyledExportRow key={`${index}:${mapping.target}:${mapping.scope}`}>
          <strong>
            {labels.targets[mapping.target] ?? t`Accounting code`}
          </strong>
          <p>
            {labels.scopes[mapping.scope] ?? t`Unsupported scope`}
            {mapping.key ? `: ${mapping.key}` : ''} → {mapping.value}
          </p>
        </StyledExportRow>
      ))}
      <p>
        <Trans>
          Matching priority: exact source, project, category, kind, currency,
          then default.
        </Trans>
      </p>
    </details>
  );
};
