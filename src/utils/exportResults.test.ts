import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildExportFilename,
  copyTextToClipboard,
  downloadTextFile,
  extractMatchedText,
  formatResultsAsCsv,
  formatResultsAsJson,
  formatResultsAsTsv,
  type ExportHeaders,
} from './exportResults';
import type { SearchResult } from '../search/SearchIndex';

const HEADERS: ExportHeaders = {
  sheet: 'Sheet',
  field: 'Column',
  recordId: 'Record ID',
  matched: 'Matched Text',
  value: 'Cell Value',
};

const SAMPLE_RESULTS: SearchResult[] = [
  {
    tableId: 'tbl1',
    tableName: 'Orders, 2026',
    recordId: 'rec_001',
    fieldId: 'fld1',
    fieldName: 'Summary',
    fieldType: 1,
    value: 'Client "Acme"\nLine 2\tTabbed',
    matches: [
      { start: 8, length: 4 },
      { start: 10, length: 2 }, // overlapping inside "Acme"
    ],
  },
  {
    tableId: 'tbl2',
    tableName: '多维表格',
    recordId: 'rec_002',
    fieldId: 'fld2',
    fieldName: '备注',
    fieldType: 1,
    value: '飞书全局搜索导出测试',
    matches: [
      { start: 2, length: 4 },
      { start: 6, length: 2 },
    ],
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('extractMatchedText', () => {
  it('merges overlapping spans and joins distinct matched substrings', () => {
    expect(
      extractMatchedText('apple pie and apricot', [
        { start: 0, length: 3 },
        { start: 0, length: 5 },
        { start: 14, length: 3 },
      ])
    ).toBe('apple | apr');
  });

  it('deduplicates repeated identical matches and ignores empty/out-of-bounds spans', () => {
    expect(
      extractMatchedText('foo bar foo', [
        { start: 0, length: 3 },
        { start: 8, length: 3 },
        { start: 50, length: 2 },
        { start: 2, length: 0 },
      ])
    ).toBe('foo');
  });
});

describe('formatResultsAsCsv', () => {
  it('prepends UTF-8 BOM and escapes commas, quotes, and newlines per RFC 4180', () => {
    const csv = formatResultsAsCsv(SAMPLE_RESULTS, HEADERS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    const withoutBom = csv.slice(1);
    const lines = withoutBom.split('\r\n');
    // Row 1 contains an embedded '\n', so raw split('\r\n') has header + row1 + row2 = 3 entries!
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Sheet,Column,Record ID,Matched Text,Cell Value');
    expect(lines[1]).toBe(
      '"Orders, 2026",Summary,rec_001,Acme,"Client ""Acme""\nLine 2\tTabbed"'
    );
    expect(lines[2]).toBe('多维表格,备注,rec_002,全局搜索 | 导出,飞书全局搜索导出测试');
  });
});

describe('formatResultsAsTsv', () => {
  it('omits BOM and quotes cells containing tabs, quotes, or newlines', () => {
    const tsv = formatResultsAsTsv(SAMPLE_RESULTS, HEADERS);
    expect(tsv.charCodeAt(0)).not.toBe(0xfeff);
    const lines = tsv.split('\r\n');
    expect(lines[0]).toBe('Sheet\tColumn\tRecord ID\tMatched Text\tCell Value');
    expect(lines[1]).toBe(
      'Orders, 2026\tSummary\trec_001\tAcme\t"Client ""Acme""\nLine 2\tTabbed"'
    );
  });
});

describe('formatResultsAsJson', () => {
  it('serializes structured metadata, options, and matched text cleanly', () => {
    const json = formatResultsAsJson(SAMPLE_RESULTS, {
      query: 'Acme',
      options: { caseSensitive: true, regex: false },
      totalMatches: 2,
      totalTables: 2,
      exportedAt: '2026-11-12T00:00:00.000Z',
    });
    const parsed = JSON.parse(json);
    expect(parsed.query).toBe('Acme');
    expect(parsed.exportedAt).toBe('2026-11-12T00:00:00.000Z');
    expect(parsed.options).toEqual({
      caseSensitive: true,
      wholeWord: false,
      fuzzy: false,
      regex: false,
    });
    expect(parsed.totalMatches).toBe(2);
    expect(parsed.results[0].matchedText).toBe('Acme');
    expect(parsed.results[1].matchedText).toBe('全局搜索 | 导出');
  });
});

describe('buildExportFilename', () => {
  const fixedDate = new Date(2026, 10, 12, 9, 5, 7); // 2026-11-12 09:05:07

  it('sanitizes illegal filesystem characters and Windows reserved device names', () => {
    expect(buildExportFilename('a/b\\c:d*e?"<f>|g', 'csv', fixedDate)).toBe(
      'bitable-search-a_b_c_d_e_f_g-20261112-090507.csv'
    );
    expect(buildExportFilename('CON', 'json', fixedDate)).toBe(
      'bitable-search-results-20261112-090507.json'
    );
    expect(buildExportFilename('   ...   ', 'csv', fixedDate)).toBe(
      'bitable-search-results-20261112-090507.csv'
    );
  });

  it('truncates long queries without splitting surrogate pairs', () => {
    const emojiQuery = '🚀'.repeat(40);
    const name = buildExportFilename(emojiQuery, 'csv', fixedDate);
    // Valid UTF-16: no lone surrogates
    expect(name).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(name.endsWith('-20261112-090507.csv')).toBe(true);
  });
});

describe('downloadTextFile & copyTextToClipboard', () => {
  it('creates and clicks a Blob download anchor in DOM environments', () => {
    const clickSpy = vi.fn();
    const appendSpy = vi.fn();
    const removeSpy = vi.fn();
    const createUrlSpy = vi.fn(() => 'blob:mock-url');
    const revokeUrlSpy = vi.fn();

    vi.stubGlobal('document', {
      createElement: () => ({ style: {}, click: clickSpy }),
      body: { appendChild: appendSpy, removeChild: removeSpy },
    });
    vi.stubGlobal('URL', {
      createObjectURL: createUrlSpy,
      revokeObjectURL: revokeUrlSpy,
    });

    const ok = downloadTextFile('hello', 'test.csv', 'text/csv');
    expect(ok).toBe(true);
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('uses navigator.clipboard.writeText and falls back to execCommand when blocked', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyTextToClipboard('data')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('data');

    // Simulate iframe Permissions-Policy rejection
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: async () => {
          throw new Error('Blocked by Permissions Policy');
        },
      },
    });
    const execCommand = vi.fn(() => true);
    vi.stubGlobal('document', {
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        focus: () => {},
        select: () => {},
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
      execCommand,
    });
    expect(await copyTextToClipboard('fallback-data')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
