import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchIndex, CACHE_VERSION } from './SearchIndex';

const FIELD = [{ id: 'f', name: 'Text', type: 1 }];
const rec = (recordId: string, text: string) => ({
  recordId,
  fields: { f: [{ type: 'text', text }] },
});

beforeEach(() => {
  localStorage.clear();
});

describe('record de-duplication', () => {
  it('skips a record that arrives twice because pages overlapped', async () => {
    const index = new SearchIndex();
    index.beginTable('t', 'T', FIELD);

    const first = await index.addRecordBatch('t', [rec('r1', 'alpha'), rec('r2', 'beta')], FIELD);
    const second = await index.addRecordBatch('t', [rec('r2', 'beta'), rec('r3', 'gamma')], FIELD);
    index.finalizeTable('t');

    expect(first).toBe(2);
    expect(second).toBe(1);
    expect(index.search('beta')).toHaveLength(1);
    expect(index.getTableData().get('t')!.recordCount).toBe(3);
  });

  it('counts records that have no searchable cells', async () => {
    const index = new SearchIndex();
    await index.addTable('t', 'T', FIELD, [rec('r1', 'alpha'), { recordId: 'r2', fields: {} }]);
    expect(index.getTableData().get('t')!.recordCount).toBe(2);
  });
});

describe('date cells follow the field format, not the machine locale', () => {
  // Built from local components so the expectation holds in any time zone.
  const when = new Date(2024, 0, 5, 15, 4).getTime();

  async function dateIndex(format: string | undefined, type = 5) {
    const index = new SearchIndex();
    const property = format ? { dateFormat: format, displayTimeZone: false } : undefined;
    await index.addTable('t', 'T', [{ id: 'd', name: 'Due', type, property }], [
      { recordId: 'r1', fields: { d: when } },
    ]);
    return index;
  }

  it.each([
    ['yyyy/MM/dd', '2024/01/05'],
    ['yyyy-MM-dd', '2024-01-05'],
    ['yyyy/MM/dd HH:mm', '2024/01/05 15:04'],
    ['yyyy-MM-dd HH:mm', '2024-01-05 15:04'],
    ['MM/dd/yyyy', '01/05/2024'],
    ['dd/MM/yyyy', '05/01/2024'],
    ['MM-dd', '01-05'],
  ])('renders %s exactly as the grid does', async (format, expected) => {
    const index = await dateIndex(format);
    expect(index.search('2024').concat(index.search('01'))[0].value).toBe(expected);
  });

  it('falls back to an unambiguous format when the property is missing', async () => {
    const index = await dateIndex(undefined);
    expect(index.search('2024')[0].value).toBe('2024-01-05 15:04');
  });

  it('is found whichever separator the user types', async () => {
    const index = await dateIndex('yyyy/MM/dd');
    expect(index.search('2024-01-05')).toHaveLength(1);
    expect(index.search('2024/01/05')).toHaveLength(1);
    expect(index.search('01/05/2024')).toHaveLength(1);
  });

  it('applies the same format to created and modified time fields', async () => {
    for (const type of [1001, 1002]) {
      const index = await dateIndex('dd/MM/yyyy', type);
      expect(index.search('05/01/2024')[0].value).toBe('05/01/2024');
    }
  });
});

describe('checkbox labels', () => {
  const FIELDS = [{ id: 'c', name: 'Done', type: 7 }];
  const rows = [
    { recordId: 'a', fields: { c: true } },
    { recordId: 'b', fields: { c: false } },
  ];

  it('defaults to Yes / No', async () => {
    const index = new SearchIndex();
    await index.addTable('t', 'T', FIELDS, rows);
    expect(index.search('yes').map((r) => r.recordId)).toEqual(['a']);
    expect(index.search('no').map((r) => r.recordId)).toEqual(['b']);
  });

  it('indexes the labels it was given', async () => {
    const index = new SearchIndex({ checkedLabel: '是', uncheckedLabel: '否' });
    await index.addTable('t', 'T', FIELDS, rows);
    expect(index.search('是').map((r) => r.recordId)).toEqual(['a']);
    expect(index.search('否').map((r) => r.recordId)).toEqual(['b']);
    expect(index.search('yes')).toHaveLength(0);
  });

  it('applies configure() to cells indexed afterwards', async () => {
    const index = new SearchIndex();
    index.configure({ checkedLabel: 'はい' });
    await index.addTable('t', 'T', FIELDS, rows);
    expect(index.search('はい').map((r) => r.recordId)).toEqual(['a']);
  });
});

describe('cache validation', () => {
  async function seeded(): Promise<SearchIndex> {
    const index = new SearchIndex();
    await index.addTable('tA', 'Alpha', FIELD, [rec('r1', 'quick brown fox'), { recordId: 'r2', fields: {} }]);
    await index.addTable('tB', '中文表', FIELD, [rec('r1', '水晶球占卜')]);
    return index;
  }

  it('round-trips names, record counts and cells', async () => {
    const source = await seeded();
    source.saveToCache('b');

    const restored = new SearchIndex();
    expect(restored.loadFromCache('b')).toBe(true);

    const tables = restored.getTableData();
    expect([...tables.keys()]).toEqual(['tA', 'tB']);
    expect(tables.get('tA')).toEqual({ tableId: 'tA', tableName: 'Alpha', recordCount: 2 });
    expect(restored.search('brown')[0].tableName).toBe('Alpha');
    expect(restored.search('水晶球')).toHaveLength(1);
  });

  it('rejects a cache whose tables differ, without rebuilding anything', async () => {
    (await seeded()).saveToCache('b');
    const live = new SearchIndex();
    await live.addTable('keep', 'Keep', FIELD, [rec('r1', 'untouched')]);

    expect(live.loadFromCache('b', ['tA', 'tOther'])).toBe(false);

    expect(localStorage.getItem('bitable_global_search_cache_b')).toBeNull();
    expect(live.search('untouched')).toHaveLength(1); // the live index survived
  });

  it('accepts a cache whose tables match, in any order', async () => {
    (await seeded()).saveToCache('b');
    expect(new SearchIndex().loadFromCache('b', ['tB', 'tA'])).toBe(true);
  });

  it('rejects a blob whose cells point outside their table', async () => {
    const blob = {
      version: CACHE_VERSION,
      baseId: 'b',
      timestamp: Date.now(),
      tables: [
        {
          id: 't',
          name: 'T',
          fields: [['f', 'Text', 1]],
          records: ['r1'],
          recordCount: 1,
          cells: [0, 0, 'fine', 7, 0, 'record index out of range'],
        },
      ],
    };
    localStorage.setItem('bitable_global_search_cache_b', JSON.stringify(blob));

    const index = new SearchIndex();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(index.loadFromCache('b')).toBe(false);
    warn.mockRestore();

    expect(index.hasData()).toBe(false); // no half-restored index left behind
    expect(localStorage.getItem('bitable_global_search_cache_b')).toBeNull();
  });

  it('survives an unparseable blob without touching the live index', async () => {
    localStorage.setItem('bitable_global_search_cache_b', '{not json');
    const live = new SearchIndex();
    await live.addTable('keep', 'Keep', FIELD, [rec('r1', 'untouched')]);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(live.loadFromCache('b')).toBe(false);
    warn.mockRestore();

    expect(live.search('untouched')).toHaveLength(1);
    expect(localStorage.getItem('bitable_global_search_cache_b')).toBeNull();
  });

  describe('housekeeping on save', () => {
    const KEY = (id: string) => `bitable_global_search_cache_${id}`;
    const blob = (timestamp: number) =>
      JSON.stringify({ version: CACHE_VERSION, baseId: 'x', timestamp, tables: [] });
    const DAY = 24 * 60 * 60 * 1000;

    it('removes other bases’ caches that outlived the TTL, and only those', async () => {
      localStorage.setItem(KEY('expired'), blob(Date.now() - 2 * DAY));
      localStorage.setItem(KEY('recent'), blob(Date.now() - 60 * 1000));
      localStorage.setItem(KEY('garbage'), 'not a cache blob');
      localStorage.setItem('someone_elses_key', 'keep me');

      const index = new SearchIndex();
      await index.addTable('t', 'T', FIELD, [rec('r1', 'alpha')]);
      index.saveToCache('mine');

      expect(localStorage.getItem(KEY('expired'))).toBeNull();
      expect(localStorage.getItem(KEY('garbage'))).toBeNull();
      expect(localStorage.getItem(KEY('recent'))).not.toBeNull();
      expect(localStorage.getItem('someone_elses_key')).toBe('keep me');
      expect(localStorage.getItem(KEY('mine'))).not.toBeNull();
    });

    it('never removes the cache it just wrote', async () => {
      const index = new SearchIndex();
      await index.addTable('t', 'T', FIELD, [rec('r1', 'alpha')]);
      index.saveToCache('mine');
      index.saveToCache('mine');

      expect(new SearchIndex().loadFromCache('mine')).toBe(true);
    });
  });

  it('does not write a blob that would exceed the quota, and says so', async () => {
    const index = new SearchIndex();
    const filler = 'x'.repeat(1000);
    const rows = Array.from({ length: 4500 }, (_, i) => rec(`r${i}`, `${filler} ${i}`));
    await index.addTable('t', 'T', FIELD, rows);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    index.saveToCache('big');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    expect(localStorage.getItem('bitable_global_search_cache_big')).toBeNull();
  });
});

describe('adopt and rename', () => {
  it('moves a freshly built index into place and empties the source', async () => {
    const live = new SearchIndex();
    await live.addTable('t', 'Old', FIELD, [rec('r1', 'alpha')]);

    const fresh = new SearchIndex();
    await fresh.addTable('t', 'New', FIELD, [rec('r1', 'beta')]);

    live.adopt(fresh);

    expect(live.search('beta')).toHaveLength(1);
    expect(live.search('alpha')).toHaveLength(0);
    expect(live.getTableData().get('t')!.tableName).toBe('New');
    expect(fresh.hasData()).toBe(false);
  });

  it('keeps its own checkbox labels when adopting', async () => {
    const live = new SearchIndex({ checkedLabel: '是' });
    live.adopt(new SearchIndex());
    await live.addTable('t', 'T', [{ id: 'c', name: 'Done', type: 7 }], [
      { recordId: 'a', fields: { c: true } },
    ]);
    expect(live.search('是')).toHaveLength(1);
  });

  it('applies a table rename to existing results', async () => {
    const index = new SearchIndex();
    await index.addTable('t', 'Old name', FIELD, [rec('r1', 'alpha')]);

    index.renameTables(new Map([['t', 'New name']]));

    expect(index.search('alpha')[0].tableName).toBe('New name');
  });
});

describe('compact()', () => {
  // Enough rows that the common terms' posting lists pass the packing threshold.
  const rows = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      rec(`${prefix}${i}`, `cat ${i % 7 === 0 ? 'car' : 'cab'} 水晶球 item${i}`)
    );

  const QUERIES = ['cat', 'ca', 'car', 'cab item3', '水晶球', '水', '晶球', 'item12', 'zzz', 'cat 水晶'];
  const answers = (index: SearchIndex) => QUERIES.map((q) => index.search(q, 1000));

  async function built(n = 150) {
    const index = new SearchIndex();
    await index.addTable('t', 'T', FIELD, rows('r', n));
    return index;
  }

  it('does not change what any query returns', async () => {
    const index = await built();
    const before = answers(index);

    index.compact();

    expect(answers(index)).toEqual(before);
    expect(before.some((r) => r.length > 100)).toBe(true); // the lists really were long
  });

  it('is safe to call repeatedly', async () => {
    const index = await built();
    const before = answers(index);

    index.compact();
    index.compact();

    expect(answers(index)).toEqual(before);
  });

  it('keeps accepting records after it has run', async () => {
    const index = await built();
    index.compact();

    // Appends to lists that are now typed arrays.
    index.beginTable('t2', 'Second', FIELD);
    await index.addRecordBatch('t2', rows('s', 50), FIELD);
    index.finalizeTable('t2');

    const results = index.search('cat', 1000);
    expect(results).toHaveLength(200);
    expect(results.filter((r) => r.tableId === 't2')).toHaveLength(50);
    // Still sorted and duplicate-free: no record appears twice.
    const keys = results.map((r) => `${r.tableId}/${r.recordId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches a fresh build when records are added both before and after', async () => {
    const staged = new SearchIndex();
    await staged.addTable('a', 'A', FIELD, rows('a', 120));
    staged.compact();
    await staged.addTable('b', 'B', FIELD, rows('b', 120));

    const whole = new SearchIndex();
    await whole.addTable('a', 'A', FIELD, rows('a', 120));
    await whole.addTable('b', 'B', FIELD, rows('b', 120));

    expect(answers(staged)).toEqual(answers(whole));
  });

  it('merges prefix matches across packed lists', async () => {
    const index = await built();
    index.compact();

    // "ca" spans the packed lists for cat, car and cab.
    const ids = index.search('ca', 1000).map((r) => r.recordId);
    expect(ids).toHaveLength(150);
    expect(new Set(ids).size).toBe(150);
  });

  it('is applied by a cache restore, which can still be appended to', async () => {
    const source = await built();
    source.saveToCache('c');

    const restored = new SearchIndex();
    expect(restored.loadFromCache('c')).toBe(true);
    expect(restored.search('cat', 1000)).toHaveLength(150);

    await restored.addTable('late', 'Late', FIELD, rows('l', 40));
    expect(restored.search('cat', 1000)).toHaveLength(190);
  });
});

describe('re-beginning a table', () => {
  it('replaces the earlier cells instead of returning them twice', async () => {
    const index = new SearchIndex();
    await index.addTable('t', 'T', FIELD, [rec('r1', 'alpha')]);
    await index.addTable('t', 'T', FIELD, [rec('r1', 'alpha')]);

    expect(index.search('alpha')).toHaveLength(1);
  });
});

describe('ranking and capping', () => {
  it('orders by match count and keeps index order for ties', async () => {
    const index = new SearchIndex();
    await index.addTable('t', 'T', FIELD, [
      rec('one', 'cat'),
      rec('three', 'cat cat cat'),
      rec('two', 'cat cat'),
      rec('one-b', 'cat'),
    ]);

    expect(index.search('cat').map((r) => r.recordId)).toEqual(['three', 'two', 'one', 'one-b']);
  });

  it('applies the cap after ranking, so the best results survive it', async () => {
    const index = new SearchIndex();
    await index.addTable('t', 'T', FIELD, [
      rec('weak1', 'cat'),
      rec('weak2', 'cat'),
      rec('strong', 'cat cat cat cat'),
    ]);

    expect(index.search('cat', 1).map((r) => r.recordId)).toEqual(['strong']);
  });
});
