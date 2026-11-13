import { describe, it, expect, beforeEach } from 'vitest';
import {
  SearchIndex,
  compileSearchRegex,
  type IndexFieldMeta,
} from './SearchIndex';

const FIELDS: IndexFieldMeta[] = [
  { id: 'fText', name: 'Text', type: 1 },
  { id: 'fNum', name: 'Num', type: 2 },
  { id: 'fCheck', name: 'Done', type: 7 },
  { id: 'fUrl', name: 'Link', type: 15 },
  {
    id: 'fFormulaDate',
    name: 'ComputedDate',
    type: 20,
    property: { formatter: 'yyyy-MM-dd', dataType: { type: 5 } },
  },
  { id: 'fObj', name: 'MetaObj', type: 25 },
];

async function buildCorpus(): Promise<SearchIndex> {
  const idx = new SearchIndex({ checkedLabel: 'Yes', uncheckedLabel: 'No' });
  await idx.addTable('t1', 'Engineering', FIELDS, [
    { recordId: 'r1', fields: { fText: 'React and TypeScript' } },
    { recordId: 'r2', fields: { fText: 'react native bridge' } },
    { recordId: 'r3', fields: { fText: 'ReactNative' } },
    { recordId: 'r4', fields: { fText: '使用React开发飞书插件' } },
    { recordId: 'r5', fields: { fText: 'cat_id = 42, cat = feline' } },
    { recordId: 'r6', fields: { fText: '水晶 和 水晶球' } },
    { recordId: 'r7', fields: { fText: '水晶球展览' } },
    { recordId: 'r8', fields: { fText: 'Configuration manager' } },
    { recordId: 'r9', fields: { fText: 'Confiuration managr' } }, // 1-edit typos
    { recordId: 'r10', fields: { fText: 'Order #INV-2026-0042 shipped' } },
    { recordId: 'r11', fields: { fText: '多维表格全局搜索插件' } },
    { recordId: 'r12', fields: { fText: '🚀 rocket launch 🚀' } },
  ]);
  return idx;
}

describe('caseSensitive mode', () => {
  it('distinguishes uppercase and lowercase Latin text when enabled', async () => {
    const idx = await buildCorpus();

    const insensitive = idx.search('React', 50, { caseSensitive: false });
    expect(insensitive.map((r) => r.recordId)).toEqual(
      expect.arrayContaining(['r1', 'r2', 'r3', 'r4'])
    );

    const sensitiveUpper = idx.search('React', 50, { caseSensitive: true });
    expect(sensitiveUpper.map((r) => r.recordId)).toEqual(
      expect.arrayContaining(['r1', 'r3', 'r4'])
    );
    expect(sensitiveUpper.map((r) => r.recordId)).not.toContain('r2');

    const sensitiveLower = idx.search('react', 50, { caseSensitive: true });
    expect(sensitiveLower.map((r) => r.recordId)).toEqual(['r2']);
  });

  it('distinguishes fullwidth from ASCII characters when caseSensitive is true', async () => {
    const idx = new SearchIndex();
    await idx.addTable('tW', 'Width', FIELDS, [
      { recordId: 'fw', fields: { fText: 'ＡＢＣ' } },
      { recordId: 'hw', fields: { fText: 'ABC' } },
    ]);

    expect(idx.search('ABC', 10, { caseSensitive: false })).toHaveLength(2);
    expect(idx.search('ABC', 10, { caseSensitive: true }).map((r) => r.recordId)).toEqual(['hw']);
    expect(idx.search('ＡＢＣ', 10, { caseSensitive: true }).map((r) => r.recordId)).toEqual(['fw']);
  });
});

describe('wholeWord mode', () => {
  it('enforces word boundaries across Latin, underscore identifiers, and CJK transitions', async () => {
    const idx = await buildCorpus();

    const reactWhole = idx.search('React', 50, { wholeWord: true });
    const ids = reactWhole.map((r) => r.recordId);
    // Matches standalone "React", lowercase "react", and "使用React开发..." (CJK<->Latin script boundary),
    // while rejecting "ReactNative".
    expect(ids).toEqual(expect.arrayContaining(['r1', 'r2', 'r4']));
    expect(ids).not.toContain('r3');

    // Underscore is an identifier connector: "cat" must NOT match "cat_id", only standalone "cat".
    const catHits = idx.search('cat', 50, { wholeWord: true });
    expect(catHits).toHaveLength(1);
    expect(catHits[0].recordId).toBe('r5');
    expect(catHits[0].matches).toEqual([{ start: 13, length: 3 }]);
  });

  it('enforces CJK run boundaries when wholeWord is enabled', async () => {
    const idx = await buildCorpus();
    const hits = idx.search('水晶', 50, { wholeWord: true });
    // r6 has standalone "水晶" before space ("水晶 和 水晶球"), whereas r7 only has "水晶球展览".
    expect(hits.map((r) => r.recordId)).toEqual(['r6']);
    expect(hits[0].matches).toEqual([{ start: 0, length: 2 }]);
  });

  it('combines caseSensitive + wholeWord accurately', async () => {
    const idx = await buildCorpus();
    const hits = idx.search('React', 50, { caseSensitive: true, wholeWord: true });
    expect(hits.map((r) => r.recordId).sort()).toEqual(['r1', 'r4']);
  });
});

describe('regex mode', () => {
  it('matches regular expressions with accurate highlight spans', async () => {
    const idx = await buildCorpus();
    const res = idx.searchWithMeta('INV-\\d{4}-\\d{4}', 50, { regex: true });
    expect(res.regexError).toBeUndefined();
    expect(res.totalMatches).toBe(1);
    expect(res.results[0].recordId).toBe('r10');
    const m = res.results[0].matches[0];
    expect(res.results[0].value.slice(m.start, m.start + m.length)).toBe('INV-2026-0042');
  });

  it('composes regex with caseSensitive and wholeWord', async () => {
    const idx = await buildCorpus();

    const insensitive = idx.search('react', 50, { regex: true, caseSensitive: false });
    expect(insensitive.length).toBeGreaterThanOrEqual(4);

    const sensitive = idx.search('react', 50, { regex: true, caseSensitive: true });
    expect(sensitive.map((r) => r.recordId)).toEqual(['r2']);

    const whole = idx.search('React\\w*', 50, { regex: true, caseSensitive: true, wholeWord: true });
    expect(whole.map((r) => r.recordId).sort()).toEqual(['r1', 'r3', 'r4']);
  });

  it('handles zero-length regex assertions without infinite loops and filters empty spans', async () => {
    const idx = await buildCorpus();
    const res = idx.searchWithMeta('^', 50, { regex: true });
    expect(res.regexError).toBeUndefined();
    // Zero-length matches produce no highlightable character span.
    expect(res.results).toEqual([]);

    // Astral plane surrogate pairs with quantifiers do not hang or split surrogates.
    const emojiRes = idx.searchWithMeta('🚀+', 50, { regex: true });
    expect(emojiRes.results.map((r) => r.recordId)).toEqual(['r12']);
    expect(emojiRes.results[0].matches).toHaveLength(2);
  });

  it('supports identity escapes like \\# via graceful non-u fallback', async () => {
    const idx = await buildCorpus();
    const res = idx.searchWithMeta('\\#INV-2026', 50, { regex: true });
    expect(res.regexError).toBeUndefined();
    expect(res.results.map((r) => r.recordId)).toEqual(['r10']);
  });

  it('reports syntax errors cleanly without throwing', async () => {
    const idx = await buildCorpus();
    const res = idx.searchWithMeta('[unclosed', 50, { regex: true });
    expect(res.results).toEqual([]);
    expect(res.totalMatches).toBe(0);
    expect(res.regexError).toBeTruthy();
  });

  it('blocks catastrophic backtracking patterns (ReDoS guard)', async () => {
    expect(compileSearchRegex('(a+)+$', false).errorKind).toBe('unsafe');
    expect(compileSearchRegex('([a-z]*)*', false).errorKind).toBe('unsafe');
    expect(compileSearchRegex('(foo|bar)+', false).errorKind).toBeUndefined();

    const idx = await buildCorpus();
    const res = idx.searchWithMeta('(a+)+$', 50, { regex: true });
    expect(res.regexError).toBe('unsafe');
    expect(res.results).toEqual([]);
  });
});

describe('fuzzy mode', () => {
  it('finds Latin words with typos (deletions, substitutions, transpositions) and ranks exact matches first', async () => {
    const idx = await buildCorpus();

    // "configuration manager" matches exact r8 AND typo'd r9 ("Confiuration managr")
    const hits = idx.search('configuration manager', 50, { fuzzy: true });
    expect(hits.map((r) => r.recordId)).toEqual(['r8', 'r9']);
    // Exact match r8 strictly outranks fuzzy match r9
    expect(hits[0].recordId).toBe('r8');

    // Transposition typo in query: "ReactNaitve" -> "ReactNative"
    const trans = idx.search('ReactNaitve', 50, { fuzzy: true });
    expect(trans.map((r) => r.recordId)).toContain('r3');
  });

  it('supports CJK typo tolerance and compact gapped subsequence matching', async () => {
    const idx = await buildCorpus();

    // Compact gapped subsequence: "全局插件" has gap 2 ("搜索") inside "全局搜索插件", which matches.
    const compact = idx.search('全局插件', 50, { fuzzy: true });
    expect(compact.map((r) => r.recordId)).toEqual(['r11']);
    const span = compact[0].matches[0];
    expect(compact[0].value.slice(span.start, span.start + span.length)).toBe('全局搜索插件');

    // 1-character typo in a 4-char CJK query: "全局搜素" (素 instead of 索) -> matches "多维表格全局搜索插件"
    const cjkTypo = idx.search('全局搜素', 50, { fuzzy: true });
    expect(cjkTypo.map((r) => r.recordId)).toContain('r11');
  });

  it('composes fuzzy with caseSensitive and wholeWord', async () => {
    const idx = await buildCorpus();
    const hits = idx.search('Confiuration', 50, {
      fuzzy: true,
      caseSensitive: true,
      wholeWord: true,
    });
    expect(hits.map((r) => r.recordId)).toEqual(expect.arrayContaining(['r8', 'r9']));

    const wrongCase = idx.search('confiuration', 50, {
      fuzzy: true,
      caseSensitive: true,
    });
    expect(wrongCase.length).toBeGreaterThanOrEqual(1);
  });
});

describe('searchWithMeta, cell edge cases, and cache isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports accurate totalMatches and totalTables even when maxResults caps the returned slice', async () => {
    const idx = new SearchIndex();
    const rowsA = Array.from({ length: 12 }, (_, i) => ({
      recordId: `a-${i}`,
      fields: { fText: `alpha item ${i}` },
    }));
    const rowsB = Array.from({ length: 8 }, (_, i) => ({
      recordId: `b-${i}`,
      fields: { fText: `alpha row ${i}` },
    }));
    await idx.addTable('tA', 'SheetA', FIELDS, rowsA);
    await idx.addTable('tB', 'SheetB', FIELDS, rowsB);

    const meta = idx.searchWithMeta('alpha', 5);
    expect(meta.results).toHaveLength(5);
    expect(meta.totalMatches).toBe(20);
    expect(meta.totalTables).toBe(2);
  });

  it('extracts FieldType.Object (25), formats Date-Formula (20), deduplicates identical URL text, and skips NaN/Infinity', async () => {
    const ts = Date.UTC(2026, 4, 15, 0, 0, 0);
    const idx = new SearchIndex();
    await idx.addTable('tEdge', 'Edges', FIELDS, [
      {
        recordId: 'rEdge',
        fields: {
          fNum: Number.NaN,
          fUrl: [{ text: 'https://feishu.cn', link: 'https://feishu.cn' }],
          fFormulaDate: ts,
          fObj: { title: 'JsonPayloadAlpha' },
        },
      },
      {
        recordId: 'rInf',
        fields: { fNum: Number.POSITIVE_INFINITY },
      },
    ]);

    expect(idx.search('NaN')).toHaveLength(0);
    expect(idx.search('Infinity')).toHaveLength(0);

    const urlHit = idx.search('feishu.cn');
    expect(urlHit).toHaveLength(1);
    expect(urlHit[0].value).toBe('https://feishu.cn');

    const dateHit = idx.search('2026-05');
    expect(dateHit).toHaveLength(1);
    expect(dateHit[0].fieldId).toBe('fFormulaDate');

    const objHit = idx.search('JsonPayloadAlpha');
    expect(objHit).toHaveLength(1);
    expect(objHit[0].fieldId).toBe('fObj');
  });

  it('isolates cached indexes across different userIds, anonymous callers, and checkbox label locales', async () => {
    const writer = new SearchIndex({ checkedLabel: 'Yes', uncheckedLabel: 'No' });
    await writer.addTable('t1', 'Tasks', FIELDS, [
      { recordId: 'r1', fields: { fCheck: true, fText: 'Confidential row' } },
    ]);
    writer.saveToCache('baseShared', 'user-alice');

    // Different user on the same browser must NOT load Alice's cached rows.
    const bobReader = new SearchIndex({ checkedLabel: 'Yes', uncheckedLabel: 'No' });
    expect(bobReader.loadFromCache('baseShared', ['t1'], 'user-bob')).toBe(false);

    // Anonymous / unresolved user must NOT load Alice's user-scoped cache either.
    const anonReader = new SearchIndex({ checkedLabel: 'Yes', uncheckedLabel: 'No' });
    expect(anonReader.loadFromCache('baseShared', ['t1'], undefined)).toBe(false);

    // Same user with different UI locale checkbox labels invalidates stale checkbox text.
    const zhReader = new SearchIndex({ checkedLabel: '是', uncheckedLabel: '否' });
    expect(zhReader.loadFromCache('baseShared', ['t1'], 'user-alice')).toBe(false);

    // Same user and matching checkbox labels still restores cleanly (failed reads did not destroy it).
    const aliceReader = new SearchIndex({ checkedLabel: 'Yes', uncheckedLabel: 'No' });
    expect(aliceReader.loadFromCache('baseShared', ['t1'], 'user-alice')).toBe(true);
    expect(aliceReader.search('Confidential')).toHaveLength(1);
  });
});
