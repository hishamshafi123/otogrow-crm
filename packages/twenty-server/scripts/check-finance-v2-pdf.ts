import { renderFinanceV2PdfBuffer } from 'src/modules/delivery/finance-v2/finance-v2-pdf.util';

// Real @react-pdf/renderer verification script executed via tsx inside the Finance V2 Loop Gate.
const main = async () => {
  const invoicePdf = await renderFinanceV2PdfBuffer({
    kind: 'INVOICE',
    documentNumber: 'INV-2026-0001',
    statusLabel: 'SENT',
    issueDate: '2026-11-01',
    dueDateOrValidUntil: '2026-11-17',
    overdueDays: 7,
    companyName: 'Otogrow Media LLC',
    legalAddress: 'Dubai, UAE',
    companyEmail: 'finance@otogrow.com',
    companyPhone: '+971 50 000 0000',
    companyWebsite: 'https://otogrow.com',
    logoDataUrl: null,
    bankDetails: 'IBAN: AE000000000000000000000',
    clientName: 'Acme Global',
    clientEmail: 'billing@acme.com',
    clientAddress: 'London, UK',
    currency: 'USD',
    lineItems: [
      {
        id: 'l1',
        label: 'Monthly Growth Retainer',
        description: 'Paid ads + creative studio',
        quantity: '1',
        unitPriceMicros: '4000000000',
        discountPercent: '0',
        lineTotalMicros: '4000000000',
      },
    ],
    subtotalMicros: '4000000000',
    discountTotalMicros: '0',
    totalMicros: '4000000000',
    paidMicros: '0',
    notes: 'Thank you for your business.',
    terms: '',
  });
  if (invoicePdf.subarray(0, 5).toString('utf8') !== '%PDF-' || invoicePdf.length < 1000) {
    throw new Error('Invoice PDF buffer invalid');
  }

  const quotePdf = await renderFinanceV2PdfBuffer({
    kind: 'QUOTE',
    documentNumber: 'QT-2026-0001',
    statusLabel: 'DRAFT',
    issueDate: '2026-11-24',
    dueDateOrValidUntil: '2026-12-08',
    companyName: 'Otogrow Media LLC',
    legalAddress: 'Dubai, UAE',
    companyEmail: 'finance@otogrow.com',
    companyPhone: '',
    companyWebsite: '',
    logoDataUrl: null,
    bankDetails: '',
    clientName: 'Nova Labs',
    clientEmail: 'ops@novalabs.io',
    clientAddress: '',
    currency: 'AED',
    lineItems: [
      {
        id: 'q1',
        label: 'SEO Sprint',
        description: 'Technical audit + 8 articles',
        quantity: '1',
        unitPriceMicros: '7500000000',
        discountPercent: '5',
        lineTotalMicros: '7125000000',
      },
    ],
    subtotalMicros: '7500000000',
    discountTotalMicros: '375000000',
    totalMicros: '7125000000',
    notes: 'Deliverables start upon approval.',
    terms: 'Valid for 14 days.',
  });
  if (quotePdf.subarray(0, 5).toString('utf8') !== '%PDF-' || quotePdf.length < 1000) {
    throw new Error('Quote PDF buffer invalid');
  }

  console.log(
    `PDF smoke PASS: Invoice=${invoicePdf.length} bytes, Quote=${quotePdf.length} bytes`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
