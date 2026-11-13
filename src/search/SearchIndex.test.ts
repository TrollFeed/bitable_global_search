import { describe, it, expect, beforeEach } from 'vitest';
import { searchIndex, CACHE_VERSION } from './SearchIndex';

// Field metas keyed by the numeric FieldType values from @lark-base-open/js-sdk.
const FIELDS = [
  { id: 'fTitle', name: 'Title', type: 1 }, // Text        -> [{ type:'text', text }]
  { id: 'fStatus', name: 'Status', type: 3 }, // SingleSelect -> { id, text }
  { id: 'fTags', name: 'Tags', type: 4 }, // MultiSelect  -> [{ id, text }]
  { id: 'fOwner', name: 'Owner', type: 11 }, // User        -> [{ id, name, enName }]
  { id: 'fLink', name: 'Ref', type: 18 }, // Link          -> { text, recordIds, tableId }
  { id: 'fLoc', name: 'Site', type: 22 }, // Location       -> { fullAddress, name }
  { id: 'fUrl', name: 'Homepage', type: 15 }, // Url        -> [{ type:'url', text, link }]
  { id: 'fDone', name: 'Done', type: 7 }, // Checkbox       -> boolean
];

// Records shaped exactly as getRecords() returns them: rich objects, not strings.
const RECORDS = [
  {
    recordId: 'r1',
    fields: {
      fTitle: [{ type: 'text', text: 'Quick brown fox' }],
      fStatus: { id: 'o1', text: 'In Progress' },
      fTags: [
        { id: 't1', text: 'Red' },
        { id: 't2', text: 'Urgent' },
      ],
      fOwner: [{ id: 'u1', name: 'Alice Zhang', enName: 'Alice' }],
      fLink: { text: 'Parent Task', type: 'text', recordIds: ['rX'], tableId: 'tB' },
      fLoc: { fullAddress: '123 Main Street', name: 'HQ', address: 'Main Street' },
      fUrl: [{ type: 'url', text: 'Company Docs', link: 'https://example.com/handbook' }],
      fDone: true,
    },
  },
  {
    recordId: 'r2',
    fields: {
      fTitle: [{ type: 'text', text: 'category cat' }], // prefix-collision regression case
    },
  },
  { recordId: 'r3', fields: { fTitle: [{ type: 'text', text: 'red apple pie' }] } },
  { recordId: 'r4', fields: { fTitle: [{ type: 'text', text: 'red racing car' }] } },
];

const ids = (q: string, max?: number) => searchIndex.search(q, max).map((r) => r.recordId);

beforeEach(async () => {
  searchIndex.clear();
  localStorage.clear();
  await searchIndex.addTable('tA', 'Sheet1', FIELDS, RECORDS);
});

describe('cell value extraction (root cause of empty searches)', () => {
  it.each([
    ['text', 'brown', 'r1'],
    ['single select', 'progress', 'r1'],
    ['multi select', 'urgent', 'r1'],
    ['user name', 'alice', 'r1'],
    ['link text', 'parent', 'r1'],
    ['location', 'main', 'r1'],
    ['url display text', 'docs', 'r1'],
    ['url link target', 'handbook', 'r1'],
    ['checkbox', 'yes', 'r1'],
  ])('indexes %s so "%s" finds %s', (_label, query, id) => {
    expect(ids(query)).toContain(id);
  });

  it('never indexes rich values as the literal "object" (the old bug)', () => {
    expect(searchIndex.search('object')).toHaveLength(0);
  });
});

describe('prefix-collision no longer drops matches (bug #2)', () => {
  it('finds a field where the query prefix expands to multiple terms', () => {
    // "cat" prefix-matches both "category" and "cat" in r2's title. The old
    // matchCount logic counted that as 2 tokens and filtered the row out.
    expect(ids('cat')).toContain('r2');
    expect(ids('categ')).toContain('r2');
  });
});

describe('multi-word AND semantics', () => {
  it('requires every token to be present', () => {
    const r = ids('red apple');
    expect(r).toContain('r3');
    expect(r).not.toContain('r4'); // "red racing car" lacks "apple"
  });

  it('is order-independent', () => {
    expect(ids('apple red')).toContain('r3');
  });

  it('a shared single token matches all rows that contain it', () => {
    const r = ids('red');
    expect(r).toEqual(expect.arrayContaining(['r3', 'r4']));
  });
});

describe('highlight ranges carry per-match length (bug #5)', () => {
  it('reports a single range at the right offset and length', () => {
    const [hit] = searchIndex.search('brown');
    // "Quick brown fox" -> "brown" starts at index 6, length 5
    expect(hit.matches).toEqual([{ start: 6, length: 5 }]);
  });

  it('reports one range per token with independent lengths', () => {
    const [hit] = searchIndex.search('quick fox');
    expect(hit.matches).toEqual([
      { start: 0, length: 5 },
      { start: 12, length: 3 },
    ]);
  });
});

describe('query hygiene', () => {
  it.each(['', '   ', '\t'])('returns nothing for blank query %j', (q) => {
    expect(searchIndex.search(q)).toHaveLength(0);
  });

  it('returns nothing when there is no match', () => {
    expect(searchIndex.search('zzzznotpresent')).toHaveLength(0);
  });

  it('respects the maxResults cap', () => {
    expect(searchIndex.search('red', 1).length).toBeLessThanOrEqual(1);
  });
});

describe('cache persistence', () => {
  it('round-trips the index through localStorage', () => {
    searchIndex.saveToCache('base1');
    searchIndex.clear();
    expect(searchIndex.search('brown')).toHaveLength(0); // gone after clear

    expect(searchIndex.loadFromCache('base1')).toBe(true);
    expect(ids('brown')).toContain('r1'); // searchable again after reload
    expect(searchIndex.getLoadedCacheTime()).toBeTypeOf('number');
  });

  it('rejects and clears caches from an older CACHE_VERSION', () => {
    // This is what auto-recovers users stuck with the old "[object Object]" index.
    const key = 'bitable_global_search_cache_legacy';
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, baseId: 'legacy', timestamp: Date.now(), tableData: [], invertedIndex: [] })
    );
    expect(searchIndex.loadFromCache('legacy')).toBe(false);
    expect(localStorage.getItem(key)).toBeNull(); // stale blob purged
  });

  it('rejects caches older than the TTL', () => {
    const key = 'bitable_global_search_cache_stale';
    const dayAndOneHour = 25 * 60 * 60 * 1000;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: CACHE_VERSION,
        baseId: 'stale',
        timestamp: Date.now() - dayAndOneHour,
        tableData: [],
        invertedIndex: [],
      })
    );
    expect(searchIndex.loadFromCache('stale')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CJK recall. Chinese has no word delimiters, so an entire phrase used to be
// indexed as one term that only the prefix search could reach: searching 水晶球
// found it in 水晶球占卜 but missed it in 神奇的水晶球预测未来.
// ---------------------------------------------------------------------------
describe('CJK substring recall', () => {
  const CJK_FIELDS = [
    { id: 'fName', name: '名称', type: 1 },
    { id: 'fNote', name: '备注', type: 1 },
  ];
  const CJK_RECORDS = [
    { recordId: 'c1', fields: { fName: [{ type: 'text', text: '水晶球' }] } },
    { recordId: 'c2', fields: { fName: [{ type: 'text', text: '水晶球占卜' }] } },
    { recordId: 'c3', fields: { fName: [{ type: 'text', text: '这是一个水晶球' }] } },
    { recordId: 'c4', fields: { fName: [{ type: 'text', text: '神奇的水晶球预测未来' }] } },
    { recordId: 'c5', fields: { fName: [{ type: 'text', text: '大型水晶球摆件' }] } },
    { recordId: 'c6', fields: { fName: [{ type: 'text', text: '占卜用水晶球，很漂亮' }] } },
    { recordId: 'c7', fields: { fName: [{ type: 'text', text: 'Crystal水晶球 ball' }] } },
    // Contains every character of the query but never the phrase itself.
    { recordId: 'c8', fields: { fName: [{ type: 'text', text: '球晶水分开的' }] } },
    // Splits the phrase across two cells of the same row.
    { recordId: 'c9', fields: { fName: [{ type: 'text', text: '水晶' }], fNote: [{ type: 'text', text: '球' }] } },
  ];

  beforeEach(async () => {
    searchIndex.clear();
    await searchIndex.addTable('tCJK', '中文表', CJK_FIELDS, CJK_RECORDS);
  });

  it('finds the phrase wherever it sits inside a Chinese compound', () => {
    expect(ids('水晶球').sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  });

  it('does not match a cell that merely contains the same characters', () => {
    expect(ids('水晶球')).not.toContain('c8');
    expect(ids('水晶球')).not.toContain('c9');
  });

  it('matches a single Chinese character', () => {
    expect(ids('球').sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);
  });

  it('matches a Chinese phrase butted against Latin text', () => {
    expect(ids('crystal')).toEqual(['c7']);
  });

  it('highlights the phrase at its real offset, not the start of the cell', () => {
    const hit = searchIndex.search('水晶球').find((r) => r.recordId === 'c4')!;
    expect(hit.matches).toEqual([{ start: '神奇的'.length, length: 3 }]);
  });

  it('survives a cache round trip', () => {
    searchIndex.saveToCache('cjkbase');
    searchIndex.clear();
    expect(searchIndex.loadFromCache('cjkbase')).toBe(true);
    expect(ids('水晶球').sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
  });
});

describe('numeric field types are searchable', () => {
  it.each([
    ['currency', 99003, 8888, '8888'],
    ['progress', 99002, 0.75, '0.75'],
    ['rating', 99004, 5, '5'],
  ])('indexes %s cells', async (_label, type, raw, query) => {
    searchIndex.clear();
    await searchIndex.addTable('tNum', 'Nums', [{ id: 'fN', name: 'N', type: type as number }], [
      { recordId: 'n1', fields: { fN: raw } },
    ]);
    expect(searchIndex.search(query as string).map((r) => r.recordId)).toEqual(['n1']);
  });
});

describe('result cap is applied after match verification', () => {
  it('returns the full cap when enough genuine matches exist', async () => {
    searchIndex.clear();
    const rows = Array.from({ length: 50 }, (_, i) => ({
      recordId: `p${i}`,
      // Every cell contains the phrase, plus filler that used to outrank it.
      fields: { fT: [{ type: 'text', text: `填充内容${i} 水晶球` }] },
    }));
    await searchIndex.addTable('tCap', 'Cap', [{ id: 'fT', name: 'T', type: 1 }], rows);
    expect(searchIndex.search('水晶球', 10)).toHaveLength(10);
    expect(searchIndex.search('水晶球', 500)).toHaveLength(50);
  });
});
