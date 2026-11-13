import { describe, it, expect } from 'vitest';
import { SearchIndex } from './SearchIndex';

const FIELD = [{ id: 'f', name: 'Text', type: 1 }];

async function indexOf(texts: string[]): Promise<SearchIndex> {
  const index = new SearchIndex();
  await index.addTable(
    't',
    'T',
    FIELD,
    texts.map((text, i) => ({ recordId: `r${i}`, fields: { f: [{ type: 'text', text }] } }))
  );
  return index;
}

const hits = (index: SearchIndex, query: string) => index.search(query).map((r) => r.recordId);

describe('Hangul is searched as CJK text', () => {
  // Korean glues particles and compounds onto nouns, so users search mid-word.
  const TEXTS = ['서울특별시', '서울에서 만나요', '부산광역시', '대한민국 서울', '특별한 날'];

  it('finds a syllable run inside a compound word', async () => {
    const index = await indexOf(TEXTS);
    expect(hits(index, '특별시')).toEqual(['r0']);
    expect(hits(index, '별시')).toEqual(['r0']);
    expect(hits(index, '울특')).toEqual(['r0']);
  });

  it('still finds the head of a word and words with attached particles', async () => {
    const index = await indexOf(TEXTS);
    expect(hits(index, '서울').sort()).toEqual(['r0', 'r1', 'r3']);
    expect(hits(index, '광역')).toEqual(['r2']);
  });

  it('does not match when the syllables are present but not contiguous', async () => {
    const index = await indexOf(['서울 특별 시']);
    expect(hits(index, '서울특별')).toEqual([]);
  });

  it('highlights at the real offset', async () => {
    const index = await indexOf(TEXTS);
    expect(index.search('특별시')[0].matches).toEqual([{ start: 2, length: 3 }]);
  });

  it('tolerates a half-composed jamo without matching or throwing', async () => {
    const index = await indexOf(TEXTS);
    expect(() => index.search('ㅅ')).not.toThrow();
    expect(hits(index, 'ㅅ')).toEqual([]);
  });
});

describe('full-width forms fold to ASCII', () => {
  // An IME in full-width mode types ＡＢＣ１２３; cells often hold it too.
  const TEXTS = ['ＡＢＣ商事 ２０２４', 'abc trading 2024', '１２３４５', 'ＡＢＣ，ＤＥＦ'];

  it('lets an ASCII query find full-width text', async () => {
    const index = await indexOf(TEXTS);
    expect(hits(index, 'abc').sort()).toEqual(['r0', 'r1', 'r3']);
    expect(hits(index, '12345')).toEqual(['r2']);
  });

  it('lets a full-width query find ASCII text', async () => {
    const index = await indexOf(TEXTS);
    expect(hits(index, 'ＡＢＣ').sort()).toEqual(['r0', 'r1', 'r3']);
    expect(hits(index, '２０２４').sort()).toEqual(['r0', 'r1']);
  });

  it('keeps highlight offsets in the original text', async () => {
    const index = await indexOf(TEXTS);
    const hit = index.search('2024').find((r) => r.recordId === 'r0')!;
    // "ＡＢＣ商事 " is 6 code units long.
    expect(hit.matches).toEqual([{ start: 6, length: 4 }]);
  });

  it('treats full-width punctuation as a word boundary', async () => {
    const index = await indexOf(TEXTS);
    expect(hits(index, 'def')).toEqual(['r3']);
  });
});

describe('case folding never shifts highlight offsets', () => {
  it('highlights correctly after a character whose lower-case form is longer', async () => {
    // "İ".toLowerCase() is two code units; folding must stay one-to-one.
    const text = 'İstanbul Cafe';
    const index = await indexOf([text]);

    const [hit] = index.search('cafe');
    expect(text.indexOf('Cafe')).toBe(9);
    expect(hit.matches).toEqual([{ start: 9, length: 4 }]);
  });

  it('is case-insensitive in both directions', async () => {
    const index = await indexOf(['Quick BROWN fox']);
    expect(hits(index, 'QUICK')).toEqual(['r0']);
    expect(hits(index, 'brown')).toEqual(['r0']);
  });
});

describe('characters outside the BMP', () => {
  it('indexes CJK Extension B ideographs and keeps offsets in code units', async () => {
    const text = '𠮷野家 本店'; // U+20BB7 is a surrogate pair
    const index = await indexOf([text]);

    expect(hits(index, '𠮷')).toEqual(['r0']);
    expect(hits(index, '野家')).toEqual(['r0']);
    expect(index.search('野家')[0].matches).toEqual([{ start: 2, length: 2 }]);
  });

  it('does not confuse an ideograph with its look-alike variant', async () => {
    const index = await indexOf(['𠮷野家']);
    expect(hits(index, '吉')).toEqual([]);
  });

  it('finds words after an emoji', async () => {
    const text = 'Hello 😀 world';
    const index = await indexOf([text]);
    expect(index.search('world')[0].matches).toEqual([{ start: 9, length: 5 }]);
  });
});

describe('a trailing Latin part is matched as a prefix', () => {
  it('finds 水晶ball while 水晶ba is still being typed', async () => {
    const index = await indexOf(['水晶ball', '水晶ballet', '水晶b', '水晶 ball']);
    expect(hits(index, '水晶ba').sort()).toEqual(['r0', 'r1']);
  });

  it('keeps a leading Latin part exact', async () => {
    const index = await indexOf(['ball水晶', 'ballet水晶']);
    expect(hits(index, 'ball水晶')).toEqual(['r0']);
  });
});
