import { createElement, type ReactElement } from 'react';

import {
  Document,
  type DocumentProps,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

import {
  LIBERATION_SANS_BOLD_BASE64,
  LIBERATION_SANS_REGULAR_BASE64,
} from 'src/engine/core-modules/dpa/pdf/fonts/liberation-sans.fonts';
import { OTOGROW_LOGO_PNG_BASE64 } from 'src/modules/quoting/pdf/assets/otogrow-logo.base64';
import {
  type QuotePdfLineItem,
  type ResolvedQuote,
} from 'src/modules/quoting/types/quote.types';

// createElement (not JSX) because the twenty-server swc builder has tsx disabled (syntax: 'typescript').
// Liberation Sans is embedded because react-pdf's built-in fonts only encode ASCII; currency
// formatting and accented names otherwise throw an "unsupported number" glyph-metric error.
const FONT_FAMILY = 'Liberation Sans';

let fontsRegistered = false;

const registerFontsOnce = (): void => {
  if (fontsRegistered) {
    return;
  }

  Font.register({
    family: FONT_FAMILY,
    fonts: [
      {
        src: `data:font/ttf;base64,${LIBERATION_SANS_REGULAR_BASE64}`,
        fontWeight: 'normal',
      },
      {
        src: `data:font/ttf;base64,${LIBERATION_SANS_BOLD_BASE64}`,
        fontWeight: 'bold',
      },
    ],
  });

  fontsRegistered = true;
};

const formatMoney = (amountMicros: number, currencyCode: string): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMicros / 1_000_000);

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 9,
    fontFamily: FONT_FAMILY,
    lineHeight: 1.5,
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  logo: { width: 48, height: 48 },
  headerRight: { alignItems: 'flex-end' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111111' },
  quoteNumber: { fontSize: 11, color: '#444444', marginTop: 2 },
  meta: { fontSize: 9, color: '#555555', marginTop: 2 },
  billTo: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#888888',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  customerName: { fontSize: 11, fontWeight: 'bold' },
  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    borderBottomStyle: 'solid',
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#dddddd',
    borderBottomStyle: 'solid',
    paddingVertical: 4,
  },
  cellLabel: { width: '44%' },
  cellQty: { width: '12%', textAlign: 'right' },
  cellUnitPrice: { width: '16%', textAlign: 'right' },
  cellDiscount: { width: '12%', textAlign: 'right' },
  cellLineTotal: { width: '16%', textAlign: 'right' },
  headerCell: { fontWeight: 'bold', fontSize: 8, color: '#555555' },
  lineDescription: { fontSize: 8, color: '#666666' },
  totals: { alignItems: 'flex-end', marginBottom: 24 },
  totalRow: { flexDirection: 'row', marginBottom: 2 },
  totalLabel: { width: 120, textAlign: 'right', color: '#555555' },
  totalValue: { width: 100, textAlign: 'right' },
  grandTotalLabel: { width: 120, textAlign: 'right', fontWeight: 'bold' },
  grandTotalValue: { width: 100, textAlign: 'right', fontWeight: 'bold' },
  terms: { marginTop: 8 },
  termsBody: { color: '#444444' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 56,
    right: 56,
    fontSize: 7,
    color: '#888888',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

const renderLineItem = (
  lineItem: QuotePdfLineItem,
  currencyCode: string,
  index: number,
): ReactElement =>
  createElement(
    View,
    { key: index, style: styles.tableRow, wrap: false },
    createElement(
      View,
      { style: styles.cellLabel },
      createElement(Text, {}, lineItem.label),
      lineItem.description !== null && lineItem.description !== ''
        ? createElement(
            Text,
            { style: styles.lineDescription },
            lineItem.description,
          )
        : null,
    ),
    createElement(Text, { style: styles.cellQty }, `${lineItem.quantity}`),
    createElement(
      Text,
      { style: styles.cellUnitPrice },
      formatMoney(lineItem.unitPriceAmountMicros, currencyCode),
    ),
    createElement(
      Text,
      { style: styles.cellDiscount },
      lineItem.discountPercent > 0 ? `${lineItem.discountPercent}%` : '—',
    ),
    createElement(
      Text,
      { style: styles.cellLineTotal },
      formatMoney(lineItem.lineTotalAmountMicros, currencyCode),
    ),
  );

export const buildQuotePdfDocumentElement = (
  resolved: ResolvedQuote,
): ReactElement<DocumentProps> => {
  registerFontsOnce();

  const tableHeader = createElement(
    View,
    { style: styles.tableHeader, fixed: true },
    createElement(
      Text,
      { style: [styles.cellLabel, styles.headerCell] },
      'Item',
    ),
    createElement(Text, { style: [styles.cellQty, styles.headerCell] }, 'Qty'),
    createElement(
      Text,
      { style: [styles.cellUnitPrice, styles.headerCell] },
      'Unit price',
    ),
    createElement(
      Text,
      { style: [styles.cellDiscount, styles.headerCell] },
      'Discount',
    ),
    createElement(
      Text,
      { style: [styles.cellLineTotal, styles.headerCell] },
      'Total',
    ),
  );

  const footer = createElement(
    View,
    { style: styles.footer, fixed: true },
    createElement(Text, {}, `Otogrow — ${resolved.quoteNumber}`),
    createElement(Text, {}, `Issued: ${resolved.issuedAtLabel}`),
  );

  const page = createElement(
    Page,
    { size: 'A4', style: styles.page, wrap: true },
    createElement(
      View,
      { style: styles.header },
      createElement(Image, {
        style: styles.logo,
        src: `data:image/png;base64,${OTOGROW_LOGO_PNG_BASE64}`,
      }),
      createElement(
        View,
        { style: styles.headerRight },
        createElement(Text, { style: styles.title }, 'QUOTE'),
        createElement(
          Text,
          { style: styles.quoteNumber },
          resolved.quoteNumber,
        ),
        createElement(
          Text,
          { style: styles.meta },
          `Issued: ${resolved.issuedAtLabel}`,
        ),
        resolved.validUntilLabel !== null
          ? createElement(
              Text,
              { style: styles.meta },
              `Valid until: ${resolved.validUntilLabel}`,
            )
          : null,
      ),
    ),
    resolved.customerName !== null
      ? createElement(
          View,
          { style: styles.billTo },
          createElement(Text, { style: styles.sectionLabel }, 'Bill to'),
          createElement(
            Text,
            { style: styles.customerName },
            resolved.customerName,
          ),
        )
      : null,
    createElement(
      View,
      { style: styles.table },
      tableHeader,
      ...resolved.lineItems.map((lineItem, index) =>
        renderLineItem(lineItem, resolved.currencyCode, index),
      ),
    ),
    createElement(
      View,
      { style: styles.totals },
      createElement(
        View,
        { style: styles.totalRow },
        createElement(Text, { style: styles.totalLabel }, 'Subtotal'),
        createElement(
          Text,
          { style: styles.totalValue },
          formatMoney(resolved.subtotalAmountMicros, resolved.currencyCode),
        ),
      ),
      createElement(
        View,
        { style: styles.totalRow },
        createElement(
          Text,
          { style: styles.totalLabel },
          `Tax (${resolved.taxPercent}%)`,
        ),
        createElement(
          Text,
          { style: styles.totalValue },
          formatMoney(resolved.taxAmountMicros, resolved.currencyCode),
        ),
      ),
      createElement(
        View,
        { style: styles.totalRow },
        createElement(Text, { style: styles.grandTotalLabel }, 'Total'),
        createElement(
          Text,
          { style: styles.grandTotalValue },
          formatMoney(resolved.totalAmountMicros, resolved.currencyCode),
        ),
      ),
    ),
    resolved.terms !== null && resolved.terms !== ''
      ? createElement(
          View,
          { style: styles.terms },
          createElement(
            Text,
            { style: styles.sectionLabel },
            'Terms and conditions',
          ),
          createElement(Text, { style: styles.termsBody }, resolved.terms),
        )
      : null,
    footer,
  );

  return createElement(
    Document,
    {
      title: `Quote ${resolved.quoteNumber}`,
      author: 'Otogrow',
      subject: `Quote ${resolved.quoteNumber}`,
    },
    page,
  ) as ReactElement<DocumentProps>;
};
