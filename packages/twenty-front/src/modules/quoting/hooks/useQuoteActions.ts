import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GENERATE_QUOTE_PDF } from '@/quoting/graphql/mutations/generateQuotePdf';
import { RECALCULATE_QUOTE_TOTALS } from '@/quoting/graphql/mutations/recalculateQuoteTotals';
import { UPDATE_QUOTE_STATUS } from '@/quoting/graphql/mutations/updateQuoteStatus';
import { type QuoteStatus } from '@/quoting/types/Quote';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Quoting mutations are core-schema (@CoreResolver) operations, so they must
// go through the core Apollo client — the default client targets /metadata.
export const useQuoteActions = ({ quoteId }: { quoteId: string }) => {
  const apolloCoreClient = useApolloCoreClient();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const recalculateTotals = async (): Promise<boolean> => {
    try {
      await apolloCoreClient.mutate<{ recalculateQuoteTotals: boolean }>({
        mutation: RECALCULATE_QUOTE_TOTALS,
        variables: { quoteId },
      });

      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return false;
    }
  };

  const generatePdf = async (): Promise<boolean> => {
    setIsGeneratingPdf(true);

    try {
      const result = await apolloCoreClient.mutate<{
        generateQuotePdf: string;
      }>({
        mutation: GENERATE_QUOTE_PDF,
        variables: { quoteId },
      });
      const pdfUrl = result.data?.generateQuotePdf;

      if (typeof pdfUrl !== 'string' || pdfUrl.length === 0) {
        throw new Error('No PDF URL returned');
      }

      window.open(pdfUrl, '_blank', 'noopener,noreferrer');

      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return false;
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const updateStatus = async (status: QuoteStatus): Promise<boolean> => {
    setIsUpdatingStatus(true);

    try {
      await apolloCoreClient.mutate<{ updateQuoteStatus: boolean }>({
        mutation: UPDATE_QUOTE_STATUS,
        variables: { quoteId, status },
      });

      enqueueSuccessSnackBar({ message: t`Quote status updated` });

      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return false;
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return {
    recalculateTotals,
    generatePdf,
    updateStatus,
    isGeneratingPdf,
    isUpdatingStatus,
  };
};
