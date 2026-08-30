import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useQuoteActions } from '@/quoting/hooks/useQuoteActions';
import { type Quote } from '@/quoting/types/Quote';
import { formatQuoteCurrency } from '@/quoting/utils/formatQuoteCurrency';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { TextInput } from '@/ui/input/components/TextInput';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledTotalsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledEditorsRow = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledEditorField = styled.div`
  width: 160px;
`;

const StyledTotalRow = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  justify-content: space-between;
`;

const StyledGrandTotalRow = styled(StyledTotalRow)`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

type QuoteTotalsSectionProps = {
  quote: Quote;
  onQuoteChanged: () => void;
};

export const QuoteTotalsSection = ({
  quote,
  onQuoteChanged,
}: QuoteTotalsSectionProps) => {
  const { t } = useLingui();
  const [taxPercentDraft, setTaxPercentDraft] = useState(
    quote.taxPercent.toString(),
  );
  const [validUntilDraft, setValidUntilDraft] = useState(
    quote.validUntil ?? '',
  );

  const { updateOneRecord } = useUpdateOneRecord();
  const { recalculateTotals } = useQuoteActions({ quoteId: quote.id });
  const { enqueueErrorSnackBar } = useSnackBar();

  const updateQuote = async (
    input: Partial<Omit<Quote, 'id'>>,
  ): Promise<void> => {
    try {
      await updateOneRecord<Quote>({
        objectNameSingular: CoreObjectNameSingular.Quote,
        idToUpdate: quote.id,
        updateOneRecordInput: input,
      });

      await recalculateTotals();
      onQuoteChanged();
    } catch {
      enqueueErrorSnackBar({ message: t`Failed to update the quote` });
    }
  };

  const flushTaxPercent = () => {
    const parsedTaxPercent = Number(taxPercentDraft);

    if (
      !Number.isNaN(parsedTaxPercent) &&
      parsedTaxPercent >= 0 &&
      parsedTaxPercent !== quote.taxPercent
    ) {
      void updateQuote({ taxPercent: parsedTaxPercent });
    }
  };

  const flushValidUntil = () => {
    const validUntil = validUntilDraft.length > 0 ? validUntilDraft : null;

    if (validUntil !== quote.validUntil) {
      void updateQuote({ validUntil });
    }
  };

  return (
    <Section>
      <H2Title title={t`Totals`} />
      <StyledTotalsGrid>
        <StyledEditorsRow>
          <StyledEditorField>
            <TextInput
              label={t`Tax %`}
              value={taxPercentDraft}
              onChange={setTaxPercentDraft}
              onBlur={flushTaxPercent}
              fullWidth
            />
          </StyledEditorField>
          <StyledEditorField>
            <TextInput
              label={t`Valid until`}
              placeholder={t`YYYY-MM-DD`}
              value={validUntilDraft}
              onChange={setValidUntilDraft}
              onBlur={flushValidUntil}
              fullWidth
            />
          </StyledEditorField>
        </StyledEditorsRow>
        <StyledTotalRow>
          <span>{t`Subtotal`}</span>
          <span>{formatQuoteCurrency(quote.subtotal)}</span>
        </StyledTotalRow>
        <StyledTotalRow>
          <span>
            {t`Tax`} ({quote.taxPercent}%)
          </span>
          <span>{formatQuoteCurrency(quote.taxAmount)}</span>
        </StyledTotalRow>
        <StyledGrandTotalRow>
          <span>{t`Total`}</span>
          <span>{formatQuoteCurrency(quote.total)}</span>
        </StyledGrandTotalRow>
      </StyledTotalsGrid>
    </Section>
  );
};
