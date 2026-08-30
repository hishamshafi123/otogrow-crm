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
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin-right: auto;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
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
        <StyledStatusBadge>{quote.status}</StyledStatusBadge>
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
