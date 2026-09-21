import {
  parseMetaSheet,
  parseMetaSheetUrl,
} from 'src/engine/metadata-modules/meta-ads-config/utils/parse-meta-sheet.util';

describe('Meta sheet intake', () => {
  it('extracts the spreadsheet and tab from a Sheets link', () => {
    expect(
      parseMetaSheetUrl(
        'https://docs.google.com/spreadsheets/d/example_123/edit#gid=42',
      ),
    ).toEqual({ spreadsheetId: 'example_123', sheetId: 42 });
  });

  it.each([
    'http://docs.google.com/spreadsheets/d/example/edit',
    'https://evil.example/spreadsheets/d/example/edit',
    'https://docs.google.com.evil.example/spreadsheets/d/example/edit',
    'https://docs.google.com/spreadsheets/d/example/edit#gid=oops',
  ])('rejects unsupported URL %s', (url) => {
    expect(() => parseMetaSheetUrl(url)).toThrow();
  });

  it('preserves large lead IDs, phone numbers and custom answers', () => {
    const [lead] = parseMetaSheet(
      [
        ['Lead ID', 'Full Name', 'Phone Number', 'Budget'],
        ['l:12345678901234567890', 'Jane Doe', '+971501234567', '5000'],
      ],
      'Dubai campaign',
    );
    expect(lead).toMatchObject({
      id: '12345678901234567890',
      formName: 'Dubai campaign',
      fieldData: expect.arrayContaining([
        { name: 'phone_number', values: ['+971501234567'] },
        { name: 'budget', values: ['5000'] },
      ]),
    });
  });

  it('does not depend on row positions', () => {
    const header = ['id', 'email'];
    const first = ['123', 'a@example.com'];
    const second = ['456', 'b@example.com'];
    expect(parseMetaSheet([header, second, first], 'Form')).toEqual(
      parseMetaSheet([header, first, second], 'Form').reverse(),
    );
  });

  it('ignores blank and partially populated rows until contact details arrive', () => {
    expect(
      parseMetaSheet(
        [
          ['id', 'email'],
          ['', ''],
          ['123', ''],
        ],
        'Form',
      ),
    ).toEqual([]);
  });

  it('rejects missing and duplicate IDs instead of silently losing leads', () => {
    expect(() => parseMetaSheet([['name', 'email']], 'Form')).toThrow(
      'lead ID',
    );
    expect(() =>
      parseMetaSheet(
        [
          ['id', 'email'],
          ['', 'a@example.com'],
        ],
        'Form',
      ),
    ).toThrow('stable Meta lead ID');
    expect(() =>
      parseMetaSheet(
        [
          ['id', 'email'],
          ['123', 'a@example.com'],
          ['123', 'b@example.com'],
        ],
        'Form',
      ),
    ).toThrow('Duplicate');
  });
});
