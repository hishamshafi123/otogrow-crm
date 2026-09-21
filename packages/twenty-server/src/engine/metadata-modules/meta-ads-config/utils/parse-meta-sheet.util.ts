import { type MetaLead } from 'src/engine/metadata-modules/meta-ads-config/services/meta-graph-api.service';

export const parseMetaSheetUrl = (value: string) => {
  const url = new URL(value);
  const spreadsheetId = url.pathname.match(
    /^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/,
  )?.[1];
  const sheetId =
    new URLSearchParams(url.hash.slice(1)).get('gid') ??
    url.searchParams.get('gid') ??
    '0';

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'docs.google.com' ||
    !spreadsheetId ||
    !/^\d+$/.test(sheetId)
  ) {
    throw new Error('Enter a Google Sheets URL with a valid sheet tab.');
  }

  return { spreadsheetId, sheetId: Number(sheetId) };
};

const normalizeHeader = (header: string) =>
  header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export const parseMetaSheet = (
  rows: string[][],
  formName: string,
): MetaLead[] => {
  const headers = (rows[0] ?? []).map(normalizeHeader);
  const leadIdColumn = headers.findIndex((header) =>
    ['id', 'lead_id', 'leadgen_id'].includes(header),
  );

  if (
    leadIdColumn === -1 ||
    !headers.some((header) =>
      ['email', 'phone', 'phone_number'].includes(header),
    )
  ) {
    throw new Error(
      'The first row must contain a lead ID column (id, lead_id, or leadgen_id) and an email or phone column.',
    );
  }

  const seenIds = new Set<string>();

  return rows.slice(1).flatMap((row) => {
    if (row.every((cell) => cell.trim() === '')) return [];
    const id = row[leadIdColumn]?.trim().replace(/^l:/, '');

    if (!id) throw new Error('Every lead row must have a stable Meta lead ID.');
    if (seenIds.has(id))
      throw new Error('Duplicate Meta lead IDs found in the sheet.');
    seenIds.add(id);

    const values = new Map(
      headers.map((header, index) => [header, row[index]?.trim() ?? '']),
    );

    // An integration can append an ID before it finishes filling the answers.
    if (
      !['email', 'phone', 'phone_number'].some((header) => values.get(header))
    )
      return [];

    return [
      {
        id,
        formName,
        formId: values.get('form_id') || null,
        campaignId: values.get('campaign_id') || null,
        campaignName: values.get('campaign_name') || null,
        adsetId: values.get('adset_id') || null,
        adsetName: values.get('adset_name') || null,
        adId: values.get('ad_id') || null,
        adName: values.get('ad_name') || null,
        fieldData: headers.flatMap((name, index) =>
          name && row[index]?.trim()
            ? [{ name, values: [row[index].trim()] }]
            : [],
        ),
      },
    ];
  });
};
