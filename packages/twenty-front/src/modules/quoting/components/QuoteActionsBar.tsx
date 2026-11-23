import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';

import { useQuoteActions } from '@/quoting/hooks/useQuoteActions';
import { type Quote, type QuoteStatus } from '@/quoting/types/Quote';
import { IconCheck, IconDownload, IconSend, IconX } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledActionsRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStatusBadge = styled.span`
  background-color: ${themeCssVariables.background.tertiary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11.5px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.05em;
  margin-right: auto;
  padding: 4px 12px;
  text-transform: uppercase;

  &[data-status='SENT'] {
    background-color: ${themeCssVariables.color.transparent.iris3};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
  }

  &[data-status='ACCEPTED'] {
    background-color: ${themeCssVariables.color.transparent.jade3};
    border-color: ${themeCssVariables.color.transparent.jade6};
    color: ${themeCssVariables.color.jade11};
  }

  &[data-status='REJECTED'],
  &[data-status='EXPIRED'] {
    background-color: ${themeCssVariables.color.transparent.red3};
    border-color: ${themeCssVariables.color.transparent.red6};
    color: ${themeCssVariables.color.red11};
  }
`;

type QuoteActionsBarProps = {
  quote: Quote;
  onQuoteChanged: () => void;
};

export const QuoteActionsBar = ({
  quote,
  onQuoteChanged,
}: QuoteActionsBarProps) => {
  const { t } = useLingui();
  const { generatePdf, updateStatus, isGeneratingPdf, isUpdatingStatus } =
    useQuoteActions({ quoteId: quote.id });

  const handleStatusChange = async (status: QuoteStatus) => {
    if (await updateStatus(status)) {
      onQuoteChanged();
    }
  };

  const handleGeneratePdf = async () => {
    if (await generatePdf()) {
      onQuoteChanged();
    }
  };

  return (
    <Section>
      <H2Title
        title={
          quote.quoteNumber !== null ? t`Quote ${quote.quoteNumber}` : t`Quote`
        }
      />
      <StyledActionsRow>
        <StyledStatusBadge data-status={quote.status}>
          {quote.status}
        </StyledStatusBadge>
        {quote.status !== 'SENT' && (
          <Button
            Icon={IconSend}
            title={t`Mark as sent`}
            variant="secondary"
            disabled={isUpdatingStatus}
            onClick={() => handleStatusChange('SENT')}
          />
        )}
        {quote.status !== 'ACCEPTED' && (
          <Button
            Icon={IconCheck}
            title={t`Mark as accepted`}
            variant="secondary"
            accent="green"
            disabled={isUpdatingStatus}
            onClick={() => handleStatusChange('ACCEPTED')}
          />
        )}
        {quote.status !== 'REJECTED' && (
          <Button
            Icon={IconX}
            title={t`Mark as rejected`}
            variant="secondary"
            accent="danger"
            disabled={isUpdatingStatus}
            onClick={() => handleStatusChange('REJECTED')}
          />
        )}
        <Button
          Icon={IconDownload}
          title={t`Generate PDF`}
          variant="primary"
          disabled={isGeneratingPdf}
          onClick={handleGeneratePdf}
        />
      </StyledActionsRow>
    </Section>
  );
};
