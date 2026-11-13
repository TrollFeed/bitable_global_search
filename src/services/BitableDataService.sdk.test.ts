import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BitableDataService, type IndexProgress } from './BitableDataService';
import { SearchIndex } from '../search/SearchIndex';

// ---------------------------------------------------------------------------
// A mock that has the *real* SDK's shapes. The mocks in the other test file hand
// the service plain { id, name, type } field objects and a base.getBaseInfo(),
// which is why they could not see that the real SDK has neither: Field objects
// carry `id` and `type` but no `name`, and the base id comes from
// base.getSelection().
// ---------------------------------------------------------------------------

const DUE = new Date(2024, 0, 5, 12, 0).getTime();

const FIELD_METAS = [
  { id: 'fTitle', name: 'Title', type: 1, isPrimary: true, property: null },
  {
    id: 'fDue',
    name: 'Due',
    type: 5,
    isPrimary: false,
    property: { dateFormat: 'yyyy/MM/dd', displayTimeZone: false },
  },
];

interface TableSpec {
  id: string;
  name: string;
  rows: number;
  /** Make the table unreadable at this stage. */
  failOn?: 'fields' | 'records';
}

interface Options {
  tables?: TableSpec[];
  /** `null` simulates a host that cannot say which base this is. */
  baseId?: string | null;
  /** The host never serves more than this many records per page. */
  pageLimit?: number;
  /** pageToken is an opaque cursor rather than an offset. */
  opaqueTokens?: boolean;
  /** Every page also repeats the next record, as overlapping pages would. */
  overlap?: boolean;
  /** Pages wait on this before resolving. */
  gate?: Promise<void>;
  /** Text of record i in table `t`. */
  textFor?: (table: string, i: number) => string;
}

function createSdkShapedBitable(opts: Options = {}) {
  const tables = opts.tables ?? [{ id: 'tA', name: 'Sheet1', rows: 3 }];
  const textFor = opts.textFor ?? ((table, i) => `${table} 记录${i}`);

  const stats = {
    getTable: 0,
    getTableById: 0,
    getFieldList: 0,
    getFieldMetaList: 0,
    pages: [] as Array<{ table: string; token: unknown; size: number }>,
    inFlight: 0,
    maxInFlight: 0,
  };
  const permissionListeners: Array<() => void> = [];

  const makeTable = (spec: TableSpec) => ({
    // What the real getFieldList() returns: field objects with an id and a type,
    // and an async getName() — but no `name` property.
    getFieldList: vi.fn(async () => {
      stats.getFieldList++;
      return FIELD_METAS.map((m) => ({ id: m.id, type: m.type, getName: async () => m.name }));
    }),
    getFieldMetaList: vi.fn(async () => {
      stats.getFieldMetaList++;
      if (spec.failOn === 'fields') throw new Error(`no access to ${spec.name}`);
      return FIELD_METAS;
    }),
    getRecordsByPage: async ({ pageSize, pageToken }: { pageSize: number; pageToken?: unknown }) => {
      if (spec.failOn === 'records') throw new Error(`cannot read ${spec.name}`);

      let offset = 0;
      if (opts.opaqueTokens) {
        if (typeof pageToken === 'string') offset = Number(pageToken.split(':')[1]);
        else if (pageToken !== undefined && pageToken !== 0) throw new Error('opaque cursor expected');
      } else {
        offset = typeof pageToken === 'number' ? pageToken : 0;
      }

      stats.pages.push({ table: spec.id, token: pageToken, size: pageSize });
      stats.inFlight++;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      await (opts.gate ?? Promise.resolve());
      stats.inFlight--;

      const served = Math.min(pageSize, opts.pageLimit ?? pageSize);
      const n = Math.max(0, Math.min(served, spec.rows - offset));
      const upto = Math.min(spec.rows, offset + n + (opts.overlap ? 1 : 0));

      const records = [];
      for (let i = offset; i < upto; i++) {
        records.push({
          recordId: `${spec.id}-r${i}`,
          fields: { fTitle: [{ type: 'text', text: textFor(spec.name, i) }], fDue: DUE },
        });
      }

      const next = offset + n;
      return {
        total: spec.rows,
        hasMore: next < spec.rows,
        pageToken: opts.opaqueTokens ? `cursor:${next}` : next,
        records,
      };
    },
    getViewMetaList: vi.fn(async () => [{ id: 'v1', name: 'Grid', type: 1 }]),
  });

  const handles = new Map(tables.map((t) => [t.id, makeTable(t)]));
  const lookup = (id: string) => {
    const h = handles.get(id);
    if (!h) throw new Error(`no table ${id}`);
    return h;
  };

  const permission = { editable: true };

  const bitable = {
    base: {
      // No getBaseInfo: the real SDK does not have one.
      getSelection: vi.fn(async () => ({
        baseId: opts.baseId === undefined ? 'baseSDK' : opts.baseId,
        tableId: null,
        viewId: null,
        fieldId: null,
        recordId: null,
      })),
      getTableMetaList: vi.fn(async () =>
        tables.map((t) => ({ id: t.id, name: t.name, isSync: false }))
      ),
      getTableById: vi.fn(async (id: string) => {
        stats.getTableById++;
        return lookup(id);
      }),
      getTable: vi.fn(async (id: string) => {
        stats.getTable++;
        return lookup(id);
      }),
      getPermission: vi.fn(async () => permission.editable),
      onPermissionChange: vi.fn((cb: () => void) => {
        permissionListeners.push(cb);
        return () => {
          permissionListeners.splice(permissionListeners.indexOf(cb), 1);
        };
      }),
    },
    ui: {},
  };

  return {
    bitable,
    stats,
    handles,
    permission,
    firePermissionChange: () => permissionListeners.slice().forEach((cb) => cb()),
  };
}

const noop = () => {};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(noop);
});

describe('field metadata', () => {
  it('labels results with the field name from the meta list', async () => {
    const { bitable, stats } = createSdkShapedBitable();
    const index = new SearchIndex();
    await new BitableDataService(bitable, { index }).indexAllTables();

    const [hit] = index.search('记录');
    // With the field objects' missing `name` this used to be undefined.
    expect(hit.fieldName).toBe('Title');
    expect(stats.getFieldMetaList).toBe(1);
    expect(stats.getFieldList).toBe(0);
  });

  it('falls back to field objects (and their async getters) without a meta list', async () => {
    const { bitable, handles } = createSdkShapedBitable();
    const table = handles.get('tA') as unknown as Record<string, unknown>;
    delete table.getFieldMetaList;

    const index = new SearchIndex();
    await new BitableDataService(bitable, { index }).indexAllTables();

    expect(index.search('记录')[0].fieldName).toBe('Title');
  });

  it('formats date cells with the field’s own date format', async () => {
    const { bitable } = createSdkShapedBitable();
    const index = new SearchIndex();
    await new BitableDataService(bitable, { index }).indexAllTables();

    const [hit] = index.search('2024/01/05');
    expect(hit.fieldName).toBe('Due');
    expect(hit.value).toBe('2024/01/05');
  });
});

describe('table handles', () => {
  it('asks for tables by id instead of racing a by-name lookup', async () => {
    const { bitable, stats } = createSdkShapedBitable({
      tables: [
        { id: 'tA', name: 'A', rows: 2 },
        { id: 'tB', name: 'B', rows: 2 },
      ],
    });
    await new BitableDataService(bitable, { index: new SearchIndex() }).indexAllTables();

    expect(stats.getTable).toBe(0);
    expect(stats.getTableById).toBe(2);
  });
});

describe('the cache', () => {
  async function seed(opts: Options = {}) {
    const first = createSdkShapedBitable(opts);
    await new BitableDataService(first.bitable, { index: new SearchIndex() }).indexAllTables();
  }

  it('is written under the base id from the selection', async () => {
    await seed();
    expect(localStorage.getItem('bitable_global_search_cache_baseSDK')).not.toBeNull();
  });

  it('lets a later session search before reading a single record', async () => {
    await seed();

    const second = createSdkShapedBitable();
    const index = new SearchIndex();
    const restored = await new BitableDataService(second.bitable, { index }).tryLoadFromCache();

    expect(restored.loaded).toBe(true);
    expect(restored.cacheTime).toBeTypeOf('number');
    expect(index.search('记录').length).toBeGreaterThan(0);
    expect(second.stats.pages).toHaveLength(0);
  });

  it('shows a rename that happened since the cache was written', async () => {
    await seed();

    const renamed = createSdkShapedBitable({ tables: [{ id: 'tA', name: 'Renamed', rows: 3 }] });
    const index = new SearchIndex();
    await new BitableDataService(renamed.bitable, { index }).tryLoadFromCache();

    expect(index.search('记录')[0].tableName).toBe('Renamed');
  });

  it('is ignored when the set of tables has changed', async () => {
    await seed();

    const other = createSdkShapedBitable({ tables: [{ id: 'tZ', name: 'Z', rows: 1 }] });
    const index = new SearchIndex();
    const restored = await new BitableDataService(other.bitable, { index }).tryLoadFromCache();

    expect(restored.loaded).toBe(false);
    expect(index.hasData()).toBe(false);
  });

  it('is keyed by a fingerprint of the table ids when the host has no base id', async () => {
    await seed({ baseId: null });

    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    expect(keys.some((k) => k?.startsWith('bitable_global_search_cache_tables-'))).toBe(true);

    const second = createSdkShapedBitable({ baseId: null });
    const restored = await new BitableDataService(second.bitable, {
      index: new SearchIndex(),
    }).tryLoadFromCache();
    expect(restored.loaded).toBe(true);
  });
});

describe('refreshing an index that is already searchable', () => {
  it('keeps serving the old results until the new index is complete, then swaps', async () => {
    const old = createSdkShapedBitable({ textFor: (t, i) => `旧数据${i}` });
    const index = new SearchIndex();
    const service = new BitableDataService(old.bitable, { index });
    await service.indexAllTables();
    expect(index.search('旧数据')).toHaveLength(3);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = createSdkShapedBitable({ gate, textFor: (t, i) => `新数据${i}` });
    const refresher = new BitableDataService(next.bitable, { index });

    const updates = vi.fn();
    const job = refresher.indexAllTables(undefined, undefined, updates);
    await new Promise((r) => setTimeout(r, 10)); // let it reach the gated reads

    // Mid-refresh: still the old, complete index; nothing half-built is visible.
    expect(index.search('旧数据')).toHaveLength(3);
    expect(index.search('新数据')).toHaveLength(0);
    expect(updates).not.toHaveBeenCalled();

    release();
    const result = await job;

    expect(result.complete).toBe(true);
    expect(index.search('新数据')).toHaveLength(3);
    expect(index.search('旧数据')).toHaveLength(0);
    expect(updates).toHaveBeenCalled();
  });

  it('keeps the previous index (and cache) when a refresh cannot read a table', async () => {
    const old = createSdkShapedBitable({
      tables: [
        { id: 'tA', name: 'A', rows: 2 },
        { id: 'tB', name: 'B', rows: 2 },
      ],
      textFor: (t, i) => `旧${t}${i}`,
    });
    const index = new SearchIndex();
    await new BitableDataService(old.bitable, { index }).indexAllTables();
    const cached = localStorage.getItem('bitable_global_search_cache_baseSDK');

    const next = createSdkShapedBitable({
      tables: [
        { id: 'tA', name: 'A', rows: 2 },
        { id: 'tB', name: 'B', rows: 2, failOn: 'records' },
      ],
      textFor: (t, i) => `新${t}${i}`,
    });
    const result = await new BitableDataService(next.bitable, { index }).indexAllTables();

    expect(result.complete).toBe(false);
    expect(result.failedTables.map((f) => f.tableName)).toEqual(['B']);
    // Table B would have silently vanished; instead nothing changed.
    expect(index.search('旧B0')).toHaveLength(1);
    expect(index.search('新A0')).toHaveLength(0);
    expect(localStorage.getItem('bitable_global_search_cache_baseSDK')).toBe(cached);
  });
});

describe('failures', () => {
  it('indexes the readable tables when one cannot be read', async () => {
    const { bitable } = createSdkShapedBitable({
      tables: [
        { id: 'tA', name: 'Good', rows: 2 },
        { id: 'tB', name: 'Locked', rows: 2, failOn: 'fields' },
        { id: 'tC', name: 'AlsoGood', rows: 2 },
      ],
    });
    const index = new SearchIndex();
    const result = await new BitableDataService(bitable, { index }).indexAllTables();

    expect(result.complete).toBe(false);
    expect(result.failedTables).toEqual([
      { tableId: 'tB', tableName: 'Locked', message: 'no access to Locked' },
    ]);
    expect(index.search('Good 记录0')).toHaveLength(1);
    expect(index.search('AlsoGood 记录1')).toHaveLength(1);
    // An incomplete index must not be presented as the base's cache.
    expect(localStorage.getItem('bitable_global_search_cache_baseSDK')).toBeNull();
  });

  it('still reports progress to 100% when a table fails', async () => {
    const { bitable } = createSdkShapedBitable({
      tables: [
        { id: 'tA', name: 'Good', rows: 2 },
        { id: 'tB', name: 'Locked', rows: 2, failOn: 'fields' },
      ],
    });
    const seen: IndexProgress[] = [];
    await new BitableDataService(bitable, { index: new SearchIndex() }).indexAllTables((p) =>
      seen.push(p)
    );

    expect(seen[seen.length - 1].overall).toBe(1);
    expect(seen[seen.length - 1].completedTables).toBe(2);
  });

  it('rejects when nothing at all could be read', async () => {
    const { bitable } = createSdkShapedBitable({
      tables: [
        { id: 'tA', name: 'A', rows: 1, failOn: 'fields' },
        { id: 'tB', name: 'B', rows: 1, failOn: 'records' },
      ],
    });

    await expect(
      new BitableDataService(bitable, { index: new SearchIndex() }).indexAllTables()
    ).rejects.toThrow(/no access to A/);
  });

  it('lets a retry run after a failed run', async () => {
    const { bitable } = createSdkShapedBitable({
      tables: [{ id: 'tA', name: 'A', rows: 1, failOn: 'fields' }],
    });
    const service = new BitableDataService(bitable, { index: new SearchIndex() });

    await expect(service.indexAllTables()).rejects.toThrow();
    await expect(service.indexAllTables()).rejects.toThrow(); // not wedged on the old run
    expect(bitable.base.getTableMetaList).toHaveBeenCalledTimes(2);
  });
});

describe('concurrency', () => {
  it('shares one run between simultaneous callers', async () => {
    const { bitable, stats } = createSdkShapedBitable({ tables: [{ id: 'tA', name: 'A', rows: 5 }] });
    const service = new BitableDataService(bitable, { index: new SearchIndex() });

    const [a, b] = await Promise.all([service.indexAllTables(), service.indexAllTables()]);

    expect(a).toBe(b);
    expect(bitable.base.getTableMetaList).toHaveBeenCalledTimes(1);
    expect(stats.pages).toHaveLength(1);
  });

  it('counts every record even when pages finish within the same tick', async () => {
    // Immediately-resolving pages interleave at microtask granularity, which is
    // exactly where `done += await …` loses concurrent increments.
    const { bitable } = createSdkShapedBitable({ tables: [{ id: 'tA', name: 'A', rows: 1000 }] });
    const completed: number[] = [];
    const progress: IndexProgress[] = [];

    const result = await new BitableDataService(bitable, { index: new SearchIndex() }).indexAllTables(
      (p) => progress.push(p),
      (_name, count) => completed.push(count)
    );

    expect(completed).toEqual([1000]);
    expect(result.recordCount).toBe(1000);
    expect(progress[progress.length - 1].recordsIndexed).toBe(1000);
  });
});

describe('a failed batch of work', () => {
  it('stops the other runners from claiming more items', async () => {
    const { bitable } = createSdkShapedBitable();
    const service = new BitableDataService(bitable, { index: new SearchIndex() }) as unknown as {
      mapWithConcurrency(
        items: number[],
        limit: number,
        worker: (item: number) => Promise<void>
      ): Promise<void>;
    };

    const started: number[] = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    await expect(
      service.mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (item) => {
        started.push(item);
        if (item === 1) throw new Error('boom');
        await sleep(20); // still running when item 1 fails
      })
    ).rejects.toThrow('boom');

    await sleep(80);
    // The runner that finished item 0 must not go on to items 2..5.
    expect(started).toEqual([0, 1]);
  });
});

describe('paging', () => {
  it('steps by the page size the host actually served', async () => {
    // Asked for 200, served 100: a fixed 200-stride would skip every other page.
    const { bitable, stats } = createSdkShapedBitable({
      tables: [{ id: 'tA', name: 'A', rows: 450 }],
      pageLimit: 100,
    });
    const index = new SearchIndex();
    await new BitableDataService(bitable, { index }).indexAllTables();

    expect(index.getTableData().get('tA')!.recordCount).toBe(450);
    const offsets = stats.pages.map((p) => p.token ?? 0).sort((a, b) => (a as number) - (b as number));
    expect(offsets).toEqual([0, 100, 200, 300, 400]);
  });

  it('walks an opaque cursor one page at a time instead of guessing offsets', async () => {
    const { bitable, stats } = createSdkShapedBitable({
      tables: [{ id: 'tA', name: 'A', rows: 450 }],
      opaqueTokens: true,
    });
    const index = new SearchIndex();
    await new BitableDataService(bitable, { index }).indexAllTables();

    expect(index.getTableData().get('tA')!.recordCount).toBe(450);
    expect(stats.maxInFlight).toBe(1);
    expect(stats.pages.map((p) => p.token)).toEqual([0, 'cursor:200', 'cursor:400']);
  });

  it('indexes a record once when pages overlap', async () => {
    const { bitable } = createSdkShapedBitable({
      tables: [{ id: 'tA', name: 'A', rows: 450 }],
      overlap: true,
    });
    const index = new SearchIndex();
    await new BitableDataService(bitable, { index }).indexAllTables();

    expect(index.getTableData().get('tA')!.recordCount).toBe(450);
    expect(index.search('A 记录7').filter((r) => r.recordId === 'tA-r7')).toHaveLength(1);
  });
});

describe('permissions', () => {
  it('re-reads editability after the host reports a permission change', async () => {
    const { bitable, permission, firePermissionChange } = createSdkShapedBitable();
    const service = new BitableDataService(bitable, { index: new SearchIndex() });

    expect(await service.canEdit()).toBe(true);

    permission.editable = false;
    expect(await service.canEdit()).toBe(true); // cached until told otherwise

    firePermissionChange();
    expect(await service.canEdit()).toBe(false);
  });

  it('stops listening once disposed', () => {
    const { bitable } = createSdkShapedBitable();
    const service = new BitableDataService(bitable, { index: new SearchIndex() });
    expect(() => service.dispose()).not.toThrow();
  });
});

describe('host lifecycle, user cache isolation, and mid-scan tail rows', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('scopes cached indexes to bridge.getBaseUserId so different viewers do not share cached rows', async () => {
    const { bitable: hostAlice } = createSdkShapedBitable();
    (hostAlice as any).bridge = { getBaseUserId: async () => 'ou_alice' };

    const indexAlice = new SearchIndex();
    const svcAlice = new BitableDataService(hostAlice, { index: indexAlice });
    await svcAlice.indexAllTables();

    const { bitable: hostBob } = createSdkShapedBitable();
    (hostBob as any).bridge = { getBaseUserId: async () => 'ou_bob' };
    const indexBob = new SearchIndex();
    const svcBob = new BitableDataService(hostBob, { index: indexBob });
    expect((await svcBob.tryLoadFromCache()).loaded).toBe(false);

    const indexAliceRestore = new SearchIndex();
    const svcAliceRestore = new BitableDataService(hostAlice, { index: indexAliceRestore });
    expect((await svcAliceRestore.tryLoadFromCache()).loaded).toBe(true);
  });

  it('picks up tail rows appended after the initial page reported a smaller total', async () => {
    let totalReportedOnFirstPage = 200;
    const actualRows = 260;
    const bitable = {
      base: {
        getSelection: async () => ({ baseId: 'baseTail' }),
        getTableMetaList: async () => [{ id: 'tGrow', name: 'Growing' }],
        getTableById: async () => ({
          getFieldMetaList: async () => FIELD_METAS,
          getRecordsByPage: async ({ pageSize, pageToken = 0 }: { pageSize: number; pageToken?: number }) => {
            const offset = typeof pageToken === 'number' ? pageToken : 0;
            // Suppose 60 rows existed beyond initial total (or arrived right after page 0):
            // page 0 reports total=250, and while offset 200 is fetched, 10 more rows arrive (260 total)!
            const liveTotal = offset === 0 ? 250 : actualRows;
            void totalReportedOnFirstPage;
            const end = Math.min(liveTotal, offset + pageSize);
            const records = [];
            for (let i = offset; i < end; i++) {
              records.push({
                recordId: `r-${i}`,
                fields: { fTitle: [{ type: 'text', text: `Row ${i}` }], fDue: DUE },
              });
            }
            return {
              total: liveTotal,
              hasMore: end < actualRows,
              pageToken: end,
              records,
            };
          },
        }),
      },
    };

    const index = new SearchIndex();
    const svc = new BitableDataService(bitable, { index });
    const res = await svc.indexAllTables();
    expect(res.recordCount).toBe(260);
    expect(index.search('Row 259')).toHaveLength(1);
  });

  it('notifies onBaseChange and onTablesChange and cleans up listeners on dispose', async () => {
    let selectionCb: ((e: any) => void) | undefined;
    let tableAddCb: (() => void) | undefined;
    const offSelection = vi.fn();
    const offTableAdd = vi.fn();

    const { bitable } = createSdkShapedBitable({ baseId: 'base_1' });
    (bitable.base as any).onSelectionChange = (cb: (e: any) => void) => {
      selectionCb = cb;
      return offSelection;
    };
    (bitable.base as any).onTableAdd = (cb: () => void) => {
      tableAddCb = cb;
      return offTableAdd;
    };

    const onBaseChange = vi.fn();
    const onTablesChange = vi.fn();
    const svc = new BitableDataService(bitable, {
      index: new SearchIndex(),
      onBaseChange,
      onTablesChange,
    });

    expect(await svc.getBaseId()).toBe('base_1');
    // Same base selection does not fire onBaseChange
    selectionCb?.({ data: { baseId: 'base_1' } });
    expect(onBaseChange).not.toHaveBeenCalled();

    // Switching to another base updates baseId and notifies caller
    selectionCb?.({ data: { baseId: 'base_2' } });
    expect(onBaseChange).toHaveBeenCalledWith('base_2');
    expect(await svc.getBaseId()).toBe('base_2');

    tableAddCb?.();
    expect(onTablesChange).toHaveBeenCalledTimes(1);

    svc.dispose();
    expect(offSelection).toHaveBeenCalledTimes(1);
    expect(offTableAdd).toHaveBeenCalledTimes(1);
  });
});
