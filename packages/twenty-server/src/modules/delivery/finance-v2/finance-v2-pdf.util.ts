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
  renderToBuffer,
} from '@react-pdf/renderer';
import {
  LIBERATION_SANS_BOLD_BASE64,
  LIBERATION_SANS_REGULAR_BASE64,
} from 'src/engine/core-modules/dpa/pdf/fonts/liberation-sans.fonts';
import { OTOGROW_LOGO_PNG_BASE64 } from 'src/modules/quoting/pdf/assets/otogrow-logo.base64';
import {
  type FinanceV2Currency,
  type FinanceV2DocumentLineItem,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

const FONT_FAMILY = 'Liberation Sans';
let fontsRegistered = false;

const registerFontsOnce = (): void => {
  if (fontsRegistered) return;
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

// Exact BigInt decimal formatter with ASCII currency code prefix so Liberation Sans
// renders every currency (including INR, AED, QAR, USD) crisply with zero missing glyphs.
const formatMoney = (amountMicros: string, currency: string): string => {
  const value = BigInt(amountMicros);
  const negative = value < BigInt('0');
  const abs = negative ? -value : value;
  const whole = abs / BigInt('1000000');
  const rawFrac = (abs % BigInt('1000000'))
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '');
  const frac = rawFrac.length < 2 ? rawFrac.padEnd(2, '0') : rawFrac;
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currency} ${wholeFormatted}.${frac}`;
};

export type FinanceV2PdfPayload = {
  kind: 'QUOTE' | 'INVOICE';
  documentNumber: string;
  statusLabel: string;
  issueDate: string;
  dueDateOrValidUntil: string | null;
  overdueDays?: number;
  companyName: string;
  legalAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyWebsite: string;
  logoDataUrl: string | null;
  bankDetails: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  currency: FinanceV2Currency;
  lineItems: FinanceV2DocumentLineItem[];
  subtotalMicros: string;
  discountTotalMicros: string;
  totalMicros: string;
  paidMicros?: string;
  notes: string;
  terms: string;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 60,
    paddingHorizontal: 48,
    fontSize: 9,
    fontFamily: FONT_FAMILY,
    lineHeight: 1.45,
    color: '#18181b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 18,
    borderBottomWidth: 1.5,
    borderBottomColor: '#e4e4e7',
    borderBottomStyle: 'solid',
    marginBottom: 20,
  },
  brandLeft: { maxWidth: '58%' },
  logo: { width: 44, height: 44, marginBottom: 6, objectFit: 'contain' },
  companyName: { fontSize: 13, fontWeight: 'bold', color: '#111827' },
  companyMeta: { fontSize: 8.5, color: '#52525b', marginTop: 2 },
  headerRight: { alignItems: 'flex-end', maxWidth: '40%' },
  docKind: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    letterSpacing: 0.5,
  },
  docNumber: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#3f3f46',
    marginTop: 3,
  },
  metaLine: { fontSize: 8.5, color: '#52525b', marginTop: 2 },
  overdueBadge: {
    marginTop: 5,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontSize: 8,
    fontWeight: 'bold',
    borderRadius: 3,
  },
  statusBadge: {
    marginTop: 5,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: '#eef2ff',
    color: '#3730a3',
    fontSize: 8,
    fontWeight: 'bold',
    borderRadius: 3,
  },
  billToBox: {
    marginBottom: 18,
    padding: 10,
    backgroundColor: '#fafafa',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#e4e4e7',
    borderStyle: 'solid',
  },
  sectionLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#71717a',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  clientName: { fontSize: 11, fontWeight: 'bold', color: '#18181b' },
  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    color: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 2,
  },
  headerCell: { fontSize: 8, fontWeight: 'bold', color: '#ffffff' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e4e4e7',
    borderBottomStyle: 'solid',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  cellDesc: { width: '46%' },
  cellQty: { width: '10%', textAlign: 'right' },
  cellRate: { width: '16%', textAlign: 'right' },
  cellDiscount: { width: '12%', textAlign: 'right' },
  cellTotal: { width: '16%', textAlign: 'right' },
  itemLabel: { fontSize: 9, fontWeight: 'bold', color: '#18181b' },
  itemDesc: { fontSize: 8, color: '#52525b', marginTop: 1 },
  totalsWrap: { alignItems: 'flex-end', marginBottom: 18 },
  totalRow: { flexDirection: 'row', marginBottom: 3 },
  totalLabel: { width: 130, textAlign: 'right', color: '#52525b', fontSize: 9 },
  totalValue: { width: 110, textAlign: 'right', fontSize: 9 },
  grandTotalRow: {
    flexDirection: 'row',
    marginTop: 4,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#18181b',
    borderTopStyle: 'solid',
  },
  grandLabel: {
    width: 130,
    textAlign: 'right',
    fontWeight: 'bold',
    fontSize: 10.5,
  },
  grandValue: {
    width: 110,
    textAlign: 'right',
    fontWeight: 'bold',
    fontSize: 10.5,
  },
  infoBlock: { marginTop: 10 },
  infoBody: { fontSize: 8.5, color: '#3f3f46' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 7.5,
    color: '#71717a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#e4e4e7',
    borderTopStyle: 'solid',
    paddingTop: 6,
  },
});

const safeLogoSrc = (logoDataUrl: string | null): string => {
  if (
    logoDataUrl &&
    /^data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(
      logoDataUrl.trim(),
    )
  ) {
    return logoDataUrl
      .trim()
      .replace(/^data:image\/jpg;base64,/, 'data:image/jpeg;base64,');
  }
  return `data:image/png;base64,${OTOGROW_LOGO_PNG_BASE64}`;
};

export const buildFinanceV2PdfDocument = (
  payload: FinanceV2PdfPayload,
): ReactElement<DocumentProps> => {
  registerFontsOnce();
  const isInvoice = payload.kind === 'INVOICE';
  const totalBig = BigInt(payload.totalMicros);
  const paidBig = BigInt(payload.paidMicros ?? '0');
  const balanceDue = totalBig > paidBig ? totalBig - paidBig : BigInt('0');
  const contactLine = [
    payload.companyEmail,
    payload.companyPhone,
    payload.companyWebsite,
  ]
    .filter((value) => value.trim().length > 0)
    .join('  •  ');

  return createElement(
    Document,
    {
      title: `${payload.kind === 'QUOTE' ? 'Quote' : 'Invoice'} ${payload.documentNumber}`,
      author: payload.companyName || 'Otogrow',
    },
    createElement(
      Page,
      { size: 'A4', style: styles.page },
      createElement(
        View,
        { style: styles.header },
        createElement(
          View,
          { style: styles.brandLeft },
          createElement(Image, {
            src: safeLogoSrc(payload.logoDataUrl),
            style: styles.logo,
          }),
          createElement(
            Text,
            { style: styles.companyName },
            payload.companyName || 'Otogrow',
          ),
          payload.legalAddress
            ? createElement(
                Text,
                { style: styles.companyMeta },
                payload.legalAddress,
              )
            : null,
          contactLine
            ? createElement(Text, { style: styles.companyMeta }, contactLine)
            : null,
        ),
        createElement(
          View,
          { style: styles.headerRight },
          createElement(
            Text,
            { style: styles.docKind },
            isInvoice ? 'INVOICE' : 'QUOTE',
          ),
          createElement(
            Text,
            { style: styles.docNumber },
            payload.documentNumber,
          ),
          createElement(
            Text,
            { style: styles.metaLine },
            `Date: ${payload.issueDate}`,
          ),
          payload.dueDateOrValidUntil
            ? createElement(
                Text,
                { style: styles.metaLine },
                `${isInvoice ? 'Due Date' : 'Valid Until'}: ${payload.dueDateOrValidUntil}`,
              )
            : null,
          createElement(
            Text,
            { style: styles.statusBadge },
            payload.statusLabel,
          ),
          isInvoice && (payload.overdueDays ?? 0) > 0
            ? createElement(
                Text,
                { style: styles.overdueBadge },
                `${payload.overdueDays} days overdue`,
              )
            : null,
        ),
      ),
      createElement(
        View,
        { style: styles.billToBox },
        createElement(
          Text,
          { style: styles.sectionLabel },
          isInvoice ? 'Bill To' : 'Prepared For',
        ),
        createElement(Text, { style: styles.clientName }, payload.clientName),
        payload.clientEmail
          ? createElement(
              Text,
              { style: styles.companyMeta },
              payload.clientEmail,
            )
          : null,
        payload.clientAddress
          ? createElement(
              Text,
              { style: styles.companyMeta },
              payload.clientAddress,
            )
          : null,
      ),
      createElement(
        View,
        { style: styles.table },
        createElement(
          View,
          { style: styles.tableHeader, fixed: true },
          createElement(
            Text,
            { style: [styles.headerCell, styles.cellDesc] },
            'Item / Service',
          ),
          createElement(
            Text,
            { style: [styles.headerCell, styles.cellQty] },
            'Qty',
          ),
          createElement(
            Text,
            { style: [styles.headerCell, styles.cellRate] },
            'Rate',
          ),
          createElement(
            Text,
            { style: [styles.headerCell, styles.cellDiscount] },
            'Disc.',
          ),
          createElement(
            Text,
            { style: [styles.headerCell, styles.cellTotal] },
            'Amount',
          ),
        ),
        ...payload.lineItems.map((item, index) =>
          createElement(
            View,
            { key: `${item.id}-${index}`, style: styles.tableRow, wrap: false },
            createElement(
              View,
              { style: styles.cellDesc },
              createElement(Text, { style: styles.itemLabel }, item.label),
              item.description
                ? createElement(
                    Text,
                    { style: styles.itemDesc },
                    item.description,
                  )
                : null,
            ),
            createElement(Text, { style: styles.cellQty }, item.quantity),
            createElement(
              Text,
              { style: styles.cellRate },
              formatMoney(item.unitPriceMicros, payload.currency),
            ),
            createElement(
              Text,
              { style: styles.cellDiscount },
              Number(item.discountPercent) > 0
                ? `${item.discountPercent}%`
                : '—',
            ),
            createElement(
              Text,
              { style: styles.cellTotal },
              formatMoney(item.lineTotalMicros, payload.currency),
            ),
          ),
        ),
      ),
      createElement(
        View,
        { style: styles.totalsWrap },
        createElement(
          View,
          { style: styles.totalRow },
          createElement(Text, { style: styles.totalLabel }, 'Subtotal'),
          createElement(
            Text,
            { style: styles.totalValue },
            formatMoney(payload.subtotalMicros, payload.currency),
          ),
        ),
        BigInt(payload.discountTotalMicros) > BigInt('0')
          ? createElement(
              View,
              { style: styles.totalRow },
              createElement(Text, { style: styles.totalLabel }, 'Discount'),
              createElement(
                Text,
                { style: styles.totalValue },
                `-${formatMoney(payload.discountTotalMicros, payload.currency)}`,
              ),
            )
          : null,
        createElement(
          View,
          { style: styles.grandTotalRow },
          createElement(Text, { style: styles.grandLabel }, 'Total'),
          createElement(
            Text,
            { style: styles.grandValue },
            formatMoney(payload.totalMicros, payload.currency),
          ),
        ),
        isInvoice && paidBig > BigInt('0')
          ? createElement(
              View,
              { style: styles.totalRow },
              createElement(Text, { style: styles.totalLabel }, 'Amount Paid'),
              createElement(
                Text,
                { style: styles.totalValue },
                formatMoney(paidBig.toString(), payload.currency),
              ),
            )
          : null,
        isInvoice && paidBig > BigInt('0')
          ? createElement(
              View,
              { style: styles.totalRow },
              createElement(Text, { style: styles.grandLabel }, 'Balance Due'),
              createElement(
                Text,
                { style: styles.grandValue },
                formatMoney(balanceDue.toString(), payload.currency),
              ),
            )
          : null,
      ),
      isInvoice && payload.bankDetails
        ? createElement(
            View,
            { style: styles.infoBlock },
            createElement(
              Text,
              { style: styles.sectionLabel },
              'Payment Instructions',
            ),
            createElement(
              Text,
              { style: styles.infoBody },
              payload.bankDetails,
            ),
          )
        : null,
      payload.notes
        ? createElement(
            View,
            { style: styles.infoBlock },
            createElement(Text, { style: styles.sectionLabel }, 'Notes'),
            createElement(Text, { style: styles.infoBody }, payload.notes),
          )
        : null,
      payload.terms
        ? createElement(
            View,
            { style: styles.infoBlock },
            createElement(
              Text,
              { style: styles.sectionLabel },
              'Terms & Conditions',
            ),
            createElement(Text, { style: styles.infoBody }, payload.terms),
          )
        : null,
      createElement(
        View,
        { style: styles.footer, fixed: true },
        createElement(Text, {}, payload.companyName || 'Otogrow'),
        createElement(
          Text,
          {},
          `${payload.documentNumber} • ${payload.currency}`,
        ),
      ),
    ),
  );
};

export const renderFinanceV2PdfBuffer = async (
  payload: FinanceV2PdfPayload,
): Promise<Buffer> => {
  try {
    return await renderToBuffer(buildFinanceV2PdfDocument(payload));
  } catch (error) {
    if (payload.logoDataUrl) {
      return renderToBuffer(
        buildFinanceV2PdfDocument({ ...payload, logoDataUrl: null }),
      );
    }
    throw error;
  }
};
