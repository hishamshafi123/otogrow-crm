import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

type PortalOpportunity = {
  id: string;
  name: string;
  stage: string;
  amountMicros: number;
  currencyCode: string;
  closeDate: string | null;
};

type PortalQuote = {
  id: string;
  quoteNumber: string | null;
  status: string;
  totalAmountMicros: number;
  currencyCode: string;
  validUntil: string | null;
};

type PortalData = {
  company: { name: string };
  opportunities: PortalOpportunity[];
  quotes: PortalQuote[];
  metrics: {
    openPipelineAmountMicros: number;
    currencyCode: string;
    dealsByStage: { stage: string; count: number }[];
    acceptedQuotesCount: number;
  };
};

type PageState = 'loading' | 'not-found' | 'ready';

const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  NEW: 'New',
  SCREENING: 'Screening',
  MEETING: 'Meeting',
  PROPOSAL: 'Proposal',
  CUSTOMER: 'Customer',
};

const formatAmount = (amountMicros: number, currencyCode: string): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMicros / 1e6);

const formatDate = (isoDate: string): string =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoDate));

const StyledPage = styled.div`
  align-items: flex-start;
  background-color: ${themeCssVariables.background.secondary};
  background-image:
    radial-gradient(
      900px 420px at 14% 0%,
      ${themeCssVariables.color.transparent.iris3},
      transparent 58%
    ),
    radial-gradient(
      760px 360px at 88% 4%,
      ${themeCssVariables.color.transparent.cyan2},
      transparent 55%
    );
  display: flex;
  flex: 1;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: 40px ${themeCssVariables.spacing[4]} 64px;
  width: 100%;
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  max-width: 780px;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledLogo = styled.img`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  box-shadow: 0 8px 20px -10px ${themeCssVariables.color.transparent.iris7};
  height: 52px;
  padding: 6px;
  width: 52px;
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: 28px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.03em;
  margin: 0;
  text-align: center;
`;

const StyledMessage = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  text-align: center;
`;

const StyledMetricCards = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledCard = styled.div`
  background-color: ${themeCssVariables.background.primary};
  background-image: radial-gradient(
    360px circle at 0% 0%,
    ${themeCssVariables.color.transparent.iris2},
    transparent 54%
  );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 1px 2px ${themeCssVariables.boxShadow.color},
    0 14px 32px -20px ${themeCssVariables.boxShadow.color};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  overflow: hidden;
  padding: 20px 22px;
  position: relative;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
  width: 100%;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    box-shadow:
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray3},
      0 18px 36px -22px ${themeCssVariables.boxShadow.color};
    transform: translateY(-1px);
  }
`;

const StyledMetricValue = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: 26px;
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.025em;
`;

const StyledMetricLabel = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const StyledSectionTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: 16px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.015em;
  margin: 0 0 4px;
`;

const StyledTable = styled.table`
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;

  th {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: ${themeCssVariables.font.weight.semiBold};
    letter-spacing: 0.06em;
    padding: 10px 8px;
    text-align: left;
    text-transform: uppercase;
  }

  td {
    border-top: 1px solid ${themeCssVariables.border.color.light};
    color: ${themeCssVariables.font.color.primary};
    font-size: ${themeCssVariables.font.size.sm};
    font-variant-numeric: tabular-nums;
    padding: 12px 8px;
  }

  tbody tr:hover td {
    background: ${themeCssVariables.background.transparent.lighter};
  }
`;

const StyledQuoteRow = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  padding: 12px 4px;

  &:first-of-type {
    border-top: none;
  }
`;

const StyledQuoteNumber = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledQuoteDetail = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  font-variant-numeric: tabular-nums;
`;

const StyledStatusBadge = styled.span<{ status: string }>`
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  padding: 3px 10px;

  ${({ status }) => {
    switch (status) {
      case 'ACCEPTED':
        return `
          background-color: ${themeCssVariables.color.transparent.jade3};
          border-color: ${themeCssVariables.color.transparent.jade6};
          color: ${themeCssVariables.color.jade11};
        `;
      case 'SENT':
        return `
          background-color: ${themeCssVariables.color.transparent.iris3};
          border-color: ${themeCssVariables.color.transparent.iris6};
          color: ${themeCssVariables.color.iris11};
        `;
      case 'REJECTED':
      case 'EXPIRED':
        return `
          background-color: ${themeCssVariables.color.transparent.red3};
          border-color: ${themeCssVariables.color.transparent.red6};
          color: ${themeCssVariables.color.red11};
        `;
      default:
        return `
          background-color: ${themeCssVariables.background.transparent.light};
          border-color: ${themeCssVariables.border.color.light};
          color: ${themeCssVariables.font.color.secondary};
        `;
    }
  }}
`;

const StyledPdfLink = styled.a`
  color: ${themeCssVariables.color.blue};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const StyledEmptyState = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
`;

export const ClientPortalPage = () => {
  const { t } = useLingui();
  const { token } = useParams<{ token: string }>();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [portalData, setPortalData] = useState<PortalData | null>(null);

  useEffect(() => {
    const fetchPortal = async () => {
      try {
        const response = await fetch(
          `${REACT_APP_SERVER_BASE_URL}/portal/${token}`,
        );

        if (!response.ok) {
          setPageState('not-found');
          return;
        }

        const data = (await response.json()) as PortalData;
        setPortalData(data);
        setPageState('ready');
      } catch {
        setPageState('not-found');
      }
    };

    fetchPortal();
  }, [token]);

  const renderContent = () => {
    if (pageState === 'loading') {
      return (
        <StyledMessage>
          <Trans>Loading…</Trans>
        </StyledMessage>
      );
    }

    if (pageState === 'not-found' || !isDefined(portalData)) {
      return (
        <>
          <StyledTitle>{t`Portal unavailable`}</StyledTitle>
          <StyledMessage>
            <Trans>This portal does not exist or is no longer active.</Trans>
          </StyledMessage>
        </>
      );
    }

    // Browser navigations to /portal/* serve the SPA (Accept-header split),
    // so the PDF is fetched as XHR and opened from a blob URL instead.
    const openQuotePdf = async (quoteId: string) => {
      const response = await fetch(
        `${REACT_APP_SERVER_BASE_URL}/portal/${token}/quotes/${quoteId}/pdf`,
      );

      if (!response.ok) {
        setPageState('not-found');
        return;
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' }),
      );

      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    };

    const { company, opportunities, quotes, metrics } = portalData;
    const stageLabel = (stage: string) =>
      OPPORTUNITY_STAGE_LABELS[stage] ?? stage;

    return (
      <>
        <StyledTitle>{company.name}</StyledTitle>
        <StyledMetricCards>
          <StyledCard>
            <StyledMetricValue>
              {formatAmount(
                metrics.openPipelineAmountMicros,
                metrics.currencyCode,
              )}
            </StyledMetricValue>
            <StyledMetricLabel>
              <Trans>Open pipeline</Trans>
            </StyledMetricLabel>
          </StyledCard>
          <StyledCard>
            <StyledMetricValue>
              {metrics.dealsByStage.length > 0
                ? metrics.dealsByStage
                    .map(({ stage, count }) => `${stageLabel(stage)}: ${count}`)
                    .join(' · ')
                : '0'}
            </StyledMetricValue>
            <StyledMetricLabel>
              <Trans>Deals by stage</Trans>
            </StyledMetricLabel>
          </StyledCard>
          <StyledCard>
            <StyledMetricValue>{metrics.acceptedQuotesCount}</StyledMetricValue>
            <StyledMetricLabel>
              <Trans>Accepted quotes</Trans>
            </StyledMetricLabel>
          </StyledCard>
        </StyledMetricCards>

        <StyledSectionTitle>
          <Trans>Opportunities</Trans>
        </StyledSectionTitle>
        <StyledCard>
          {opportunities.length === 0 ? (
            <StyledEmptyState>
              <Trans>No opportunities yet.</Trans>
            </StyledEmptyState>
          ) : (
            <StyledTable>
              <thead>
                <tr>
                  <th>
                    <Trans>Name</Trans>
                  </th>
                  <th>
                    <Trans>Stage</Trans>
                  </th>
                  <th>
                    <Trans>Amount</Trans>
                  </th>
                  <th>
                    <Trans>Close date</Trans>
                  </th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opportunity) => (
                  <tr key={opportunity.id}>
                    <td>{opportunity.name}</td>
                    <td>{stageLabel(opportunity.stage)}</td>
                    <td>
                      {formatAmount(
                        opportunity.amountMicros,
                        opportunity.currencyCode,
                      )}
                    </td>
                    <td>
                      {isNonEmptyString(opportunity.closeDate)
                        ? formatDate(opportunity.closeDate)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          )}
        </StyledCard>

        <StyledSectionTitle>
          <Trans>Quotes</Trans>
        </StyledSectionTitle>
        <StyledCard>
          {quotes.length === 0 ? (
            <StyledEmptyState>
              <Trans>No quotes yet.</Trans>
            </StyledEmptyState>
          ) : (
            quotes.map((quote) => (
              <StyledQuoteRow key={quote.id}>
                <StyledQuoteNumber>
                  {quote.quoteNumber ?? t`Draft quote`}
                </StyledQuoteNumber>
                <StyledStatusBadge status={quote.status}>
                  {quote.status}
                </StyledStatusBadge>
                <StyledQuoteDetail>
                  {formatAmount(quote.totalAmountMicros, quote.currencyCode)}
                  {isNonEmptyString(quote.validUntil)
                    ? ` · ${t`Valid until`} ${formatDate(quote.validUntil)}`
                    : ''}
                </StyledQuoteDetail>
                <StyledPdfLink onClick={() => openQuotePdf(quote.id)}>
                  <Trans>View PDF</Trans>
                </StyledPdfLink>
              </StyledQuoteRow>
            ))
          )}
        </StyledCard>
      </>
    );
  };

  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <StyledLogo
            src="/images/brand/otogrow-logo-192.png"
            alt={t`Otogrow logo`}
          />
        </StyledHeader>
        {renderContent()}
      </StyledContent>
    </StyledPage>
  );
};
