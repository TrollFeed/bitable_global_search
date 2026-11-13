import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchIndex, foldText, type QueryOptions } from './SearchIndex';
import { buildPreview } from './preview';

// Deterministic fuzzing: the same seed always produces the same corpus, so a
// failure is reproducible. The point is not to assert exact result sets (the
// other suites do that) but that hostile text can neither crash the tokenizer
// nor produce a result whose highlight points outside its value.

let state = 0x2f6e2b1;
const rnd = () => {
  state ^= state << 13;
  state >>>= 0;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return state / 0x100000000;
};
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const ATOMS = [
  // ASCII, mixed case, digits, punctuation, whitespace
  'apple', 'Apple', 'APPLE', 'x', 'a1', '2026', '01', 'co.uk', 'foo-bar', ' ', '  ', '\t', '\n', ',', '.', '/', '(', ')',
  // CJK, kana, Hangul
  '水晶球', '占卜', '神奇的', 'ひらがな', 'カタカナ', 'ｶﾀｶﾅ', '서울', '특별시', '대한민국',
  // full-width forms
  'ＡＢＣ', '１２３', '，', '。', '　',
  // astral: emoji and CJK Extension B
  '😀', '👍🏽', '𠮷', '𠀀',
  // characters whose case mapping is unusual
  'İstanbul', 'ß', 'ǅ', 'Σ', 'Ω', 'K',
  // combining marks, joiners, RTL
  'é', 'a‍b', 'مرحبا', 'שלום',
  // malformed UTF-16: lone surrogates
  '\ud800', '\udc00', 'a\ud83d', '\ude00b',
] as const;

const makeText = () => {
  let s = '';
  for (let n = int(0, 10); n > 0; n--) s += pick(ATOMS);
  return s;
};

const FIELDS = [
  { id: 'a', name: 'A', type: 1 },
  { id: 'b', name: 'B', type: 1 },
];

const corpus = Array.from({ length: 400 }, (_, i) => ({
  recordId: `r${i}`,
  texts: { a: makeText(), b: makeText() } as Record<string, string>,
}));

const records = corpus.map((c) => ({
  recordId: c.recordId,
  fields: {
    a: [{ type: 'text', text: c.texts.a }],
    b: [{ type: 'text', text: c.texts.b }],
  },
}));

// Queries are slices of real text (so many hit), which also means many start or
// end in the middle of a surrogate pair.
const queries: string[] = ['', ' ', '\u0000', '..', '，。', '😀', '\ud800', 'ａｂｃ'];
for (let i = 0; i < 400; i++) {
  const text = pick(corpus).texts[pick(['a', 'b'])];
  const start = int(0, Math.max(0, text.length - 1));
  queries.push(text.slice(start, start + int(1, 8)));
}
for (const atom of ATOMS) queries.push(atom, atom.toUpperCase(), atom.toLowerCase());

let index: SearchIndex;

beforeEach(async () => {
  localStorage.clear();
  index = new SearchIndex();
  await index.addTable('t', 'Fuzz', FIELDS, records);
});

describe('hostile text', () => {
  it('indexes without throwing and counts every record', () => {
    expect(index.getTableData().get('t')!.recordCount).toBe(corpus.length);
  });

  it('answers every query without throwing, within the cap', () => {
    for (const q of queries) {
      const results = index.search(q, 25);
      expect(results.length, JSON.stringify(q)).toBeLessThanOrEqual(25);
    }
  });

  it('only ever highlights inside the value, in order, without overlap', () => {
    const textOf = new Map<string, string>();
    for (const c of corpus) {
      textOf.set(`${c.recordId}|a`, c.texts.a);
      textOf.set(`${c.recordId}|b`, c.texts.b);
    }

    let checked = 0;
    for (const q of queries) {
      // The units a highlight is allowed to cover: the query's letter/digit runs.
      const phrases = new Set(foldText(q).match(/[\p{L}\p{N}]+/gu) ?? []);

      for (const r of index.search(q, 100)) {
        const label = `${JSON.stringify(q)} -> ${r.recordId}/${r.fieldId}`;
        // Folded as a whole: case mapping is context-sensitive (a final Σ becomes
        // ς), so a slice must be taken from the folded text, not folded alone.
        const foldedValue = foldText(r.value);

        // The result carries the cell's original text, untouched by folding.
        expect(r.value, label).toBe(textOf.get(`${r.recordId}|${r.fieldId}`));
        expect(r.matches.length, label).toBeGreaterThan(0);

        let previousStart = -1;
        for (const m of r.matches) {
          expect(m.length, label).toBeGreaterThan(0);
          expect(m.start, label).toBeGreaterThanOrEqual(0);
          expect(m.start + m.length, label).toBeLessThanOrEqual(r.value.length);
          expect(m.start, label).toBeGreaterThanOrEqual(previousStart);
          previousStart = m.start;

          // Alignment: the highlighted slice of the *original* text is the
          // query phrase (up to case/width). A fold that changed the text's
          // length would shift this off by however many units it grew.
          expect(foldedValue.length, label).toBe(r.value.length);
          const covered = foldedValue.slice(m.start, m.start + m.length);
          expect(phrases.has(covered), `${label}: highlighted ${JSON.stringify(covered)}`).toBe(true);
        }
        checked++;
      }
    }

    // Guard against a corpus so hostile that nothing was ever verified.
    expect(checked).toBeGreaterThan(200);
  });

  it('returns identical results after a cache round trip', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    index.saveToCache('fuzz');
    warn.mockRestore();

    const restored = new SearchIndex();
    expect(restored.loadFromCache('fuzz')).toBe(true);

    for (const q of queries) {
      expect(restored.search(q, 100), JSON.stringify(q)).toEqual(index.search(q, 100));
    }
  });

  it('is deterministic: asking twice gives the same answer', () => {
    for (const q of queries.slice(0, 120)) {
      expect(index.search(q, 100), JSON.stringify(q)).toEqual(index.search(q, 100));
    }
  });

  it('maintains valid highlight bounds across all search mode combinations on hostile text', () => {
    const modeCombos: QueryOptions[] = [
      { caseSensitive: true },
      { wholeWord: true },
      { caseSensitive: true, wholeWord: true },
      { fuzzy: true },
      { fuzzy: true, caseSensitive: true, wholeWord: true },
      { regex: true },
      { regex: true, caseSensitive: true, wholeWord: true },
    ];

    for (const opts of modeCombos) {
      for (const q of queries.slice(0, 120)) {
        const meta = index.searchWithMeta(q, 25, opts);
        expect(meta.results.length).toBeLessThanOrEqual(25);
        expect(meta.totalMatches).toBeGreaterThanOrEqual(meta.results.length);

        for (const r of meta.results) {
          expect(r.matches.length).toBeGreaterThan(0);
          let prevStart = -1;
          for (const m of r.matches) {
            expect(m.length).toBeGreaterThan(0);
            expect(m.start).toBeGreaterThanOrEqual(0);
            expect(m.start + m.length).toBeLessThanOrEqual(r.value.length);
            expect(m.start).toBeGreaterThanOrEqual(prevStart);
            prevStart = m.start;
          }

          const preview = buildPreview(r.value, r.matches, 200);
          for (const pm of preview.matches) {
            expect(pm.length).toBeGreaterThan(0);
            expect(pm.start).toBeGreaterThanOrEqual(0);
            expect(pm.start + pm.length).toBeLessThanOrEqual(preview.text.length);
          }
        }
      }
    }
  });
});

describe('degenerate cells', () => {
  it('copes with an enormous single cell', async () => {
    const big = new SearchIndex();
    const text = ('水晶球 apple ' + '填'.repeat(50)).repeat(2000);
    await big.addTable('t', 'T', FIELDS, [{ recordId: 'r', fields: { a: [{ type: 'text', text }] } }]);

    const [hit] = big.search('水晶球');
    expect(hit.matches).toHaveLength(2000);
    expect(big.search('apple')).toHaveLength(1);
  });

  it('ignores cells with nothing searchable in them', async () => {
    const idx = new SearchIndex();
    await idx.addTable('t', 'T', FIELDS, [
      { recordId: 'r1', fields: { a: [{ type: 'text', text: '— … ！？ 😀' }] } },
      { recordId: 'r2', fields: { a: [{ type: 'text', text: 'real' }] } },
    ]);

    expect(idx.search('real')).toHaveLength(1);
    expect(idx.getTableData().get('t')!.recordCount).toBe(2);
  });

  it('tolerates cell values of unexpected shape', async () => {
    const idx = new SearchIndex();
    const weird: unknown[] = [
      null,
      undefined,
      NaN,
      Infinity,
      {},
      [],
      [[]],
      [null, undefined],
      { value: { value: { value: 'deep' } } },
      [{ type: 'text' }],
      [{ type: 'text', text: 42 }],
      { text: ['not', 'a', 'string'] },
      Symbol.iterator.toString(),
    ];

    await expect(
      idx.addTable(
        't',
        'T',
        FIELDS,
        weird.map((v, i) => ({ recordId: `w${i}`, fields: { a: v, b: v } }))
      )
    ).resolves.toBeUndefined();

    expect(idx.search('deep').map((r) => r.recordId)).toEqual(['w8', 'w8']);
  });
});
