import { renderToBuffer } from '@react-pdf/renderer';

import { buildQuotePdfDocumentElement } from 'src/modules/quoting/pdf/quote-pdf-document';
import { type ResolvedQuote } from 'src/modules/quoting/types/quote.types';

// @react-pdf/renderer renders server-side via its own layout engine (no DOM/browser needed).
export const renderQuoteToPdfBuffer = (
  resolved: ResolvedQuote,
): Promise<Buffer> => renderToBuffer(buildQuotePdfDocumentElement(resolved));
