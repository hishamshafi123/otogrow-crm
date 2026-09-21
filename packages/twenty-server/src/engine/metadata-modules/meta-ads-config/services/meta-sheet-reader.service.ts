import { BadRequestException, Injectable } from '@nestjs/common';

import { google } from 'googleapis';

import { parseMetaSheet } from 'src/engine/metadata-modules/meta-ads-config/utils/parse-meta-sheet.util';

@Injectable()
export class MetaSheetReaderService {
  async read(
    {
      spreadsheetId,
      sheetId,
      name,
    }: { spreadsheetId: string; sheetId: number; name: string },
    credentialsJson: string,
  ) {
    let credentials: { client_email: string; private_key: string };

    try {
      const value: unknown = JSON.parse(credentialsJson);

      if (
        typeof value !== 'object' ||
        value === null ||
        !('client_email' in value) ||
        !('private_key' in value) ||
        typeof value.client_email !== 'string' ||
        !value.client_email.endsWith('.iam.gserviceaccount.com') ||
        typeof value.private_key !== 'string' ||
        !value.private_key.includes('BEGIN PRIVATE KEY')
      ) {
        throw new Error('Invalid credentials');
      }
      credentials = {
        client_email: value.client_email,
        private_key: value.private_key,
      };
    } catch {
      throw new BadRequestException(
        'Enter a valid Google service account JSON key.',
      );
    }

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      const spreadsheet = await sheets.spreadsheets.get(
        { spreadsheetId, fields: 'sheets.properties' },
        { timeout: 15000 },
      );
      const tab = spreadsheet.data.sheets?.find(
        (sheet) => sheet.properties?.sheetId === sheetId,
      )?.properties;

      if (!tab?.title)
        throw new BadRequestException('The linked sheet tab no longer exists.');
      if ((tab.gridProperties?.rowCount ?? 0) > 50000)
        throw new BadRequestException(
          'Use a sheet tab with at most 50,000 rows.',
        );

      const response = await sheets.spreadsheets.values.get(
        {
          spreadsheetId,
          range: `'${tab.title.replace(/'/g, "''")}'!A1:ZZ50000`,
          valueRenderOption: 'FORMATTED_VALUE',
        },
        { timeout: 15000 },
      );
      const values: unknown = response.data.values ?? [];

      if (
        !Array.isArray(values) ||
        !values.every(
          (row): row is (string | number | boolean | null)[] =>
            Array.isArray(row) &&
            row.every(
              (cell) =>
                cell === null ||
                ['string', 'number', 'boolean'].includes(typeof cell),
            ),
        )
      ) {
        throw new BadRequestException(
          'The sheet contains unsupported cell values.',
        );
      }
      try {
        return parseMetaSheet(
          values.map((row) =>
            row.map((cell) => (cell === null ? '' : String(cell))),
          ),
          name,
        );
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid lead sheet.',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // Google errors can include request headers or credentials.
      throw new BadRequestException(
        'Cannot read the sheet. Enable the Google Sheets API and share the sheet with the service account email as a Viewer, then retry.',
      );
    }
  }
}
