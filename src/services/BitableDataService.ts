import {
  searchIndex,
  SearchIndex,
  type IndexFieldMeta,
  type SearchIndexOptions,
} from '../search/SearchIndex';

export interface TableMeta {
  tableId: string;
  tableName: string;
}

export interface FieldMeta {
  id: string;
  name: string;
  type: number;
  isPrimary: boolean;
  /** The host's field property bag (date format, number formatter, …). */
  property?: unknown;
}

export interface RecordData {
  recordId: string;
  fields: Record<string, unknown>;
}

export interface IndexProgress {
  /** A table currently being read. */
  currentTable: string;
  /** Progress through `currentTable`, 0..1. */
  tableProgress: number;
  completedTables: number;
  totalTables: number;
  recordsIndexed: number;
  /** Progress across the whole base, 0..1. */
  overall: number;
}

export interface FailedTable {
  tableId: string;
  tableName: string;
  message: string;
}

export interface IndexResult {
  tableCount: number;
  recordCount: number;
  /** Tables that could not be read. The rest were indexed normally. */
  failedTables: FailedTable[];
  /** The finished index replaced the previous one and was written to the cache. */
  complete: boolean;
}

export interface CacheLoadResult {
  loaded: boolean;
  /** When the cached index was built. */
  cacheTime?: number;
}

export interface ServiceOptions {
  /** The index searches run against. Defaults to the shared singleton. */
  index?: SearchIndex;
  /** Index settings (checkbox labels). Applied to every index the service builds. */
  indexOptions?: SearchIndexOptions;
  /** Called when the viewer switches to a different Base inside the host. */
  onBaseChange?: (newBaseId: string) => void;
  /** Called when tables are added to or deleted from the open Base. */
  onTablesChange?: () => void;
}

/**
 * How a search result was opened.
 *  - `cell-editor`   the exact cell was focused (needs edit permission)
 *  - `record-dialog` the record card opened, scoped to the matched field
 *  - `link`          a deep link to the record was produced for the viewer
 *  - `view`          only the table view could be switched to
 *  - `failed`        nothing worked
 */
export type NavigationMode = 'cell-editor' | 'record-dialog' | 'link' | 'view' | 'failed';

export interface NavigationResult {
  ok: boolean;
  mode: NavigationMode;
  /** Present when mode is 'link'. */
  url?: string;
}

interface IndexListener {
  onProgress?: (progress: IndexProgress) => void;
  onTableComplete?: (tableName: string, recordCount: number) => void;
  onIndexUpdated?: () => void;
}

interface IndexJob {
  promise: Promise<IndexResult>;
  listeners: IndexListener[];
}

// The SDK caps a page at 200 records, so throughput comes from issuing pages
// concurrently rather than from asking for bigger ones.
const PAGE_SIZE = 200;
// Every SDK call is a postMessage round trip to the Base host. These limits
// keep several in flight without flooding the bridge.
const PAGE_CONCURRENCY = 4;
const TABLE_CONCURRENCY = 3;
// Parallel bridge traffic can drop the occasional call; one cheap retry keeps a
// transient failure from aborting the whole index.
const FETCH_RETRIES = 1;
const RETRY_DELAY_MS = 250;

// ViewType.Grid from @lark-base-open/js-sdk. Cell focus (showFieldValueEditor)
// only works within a grid view.
const VIEW_TYPE_GRID = 1;

// Mirrors PermissionEntity / OperationType from @lark-base-open/js-sdk. Kept as
// literals so this module stays free of SDK imports — the host instance is
// injected, which is what makes the service testable under Node.
const PERMISSION_ENTITY_BASE = 'Base';
const OPERATION_EDITABLE = 'editable';

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return 'Unknown error';
}

/** Short stable hash, for deriving a cache key when the host gives no base id. */
function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export class BitableDataService {
  private bitable: any;
  private readonly live: SearchIndex;
  private indexOptions: SearchIndexOptions;
  private readonly onBaseChange?: (newBaseId: string) => void;
  private readonly onTablesChange?: () => void;
  private baseId = '';
  private cacheKey = '';
  private userId = '';
  private userIdResolved = false;
  // Whether this viewer can edit the base at all. Resolved once and reused until
  // the host reports a permission change.
  private baseEditable: boolean | null = null;
  // Visible field ids per "tableId|viewId", so opening several results from the
  // same sheet doesn't re-read the view layout every time.
  private viewFieldCache: Map<string, string[]> = new Map();
  private job: IndexJob | null = null;
  private disposers: Array<() => void> = [];

  constructor(bitableInstance: any, options: ServiceOptions = {}) {
    this.bitable = bitableInstance;
    this.live = options.index ?? searchIndex;
    this.indexOptions = options.indexOptions ?? {};
    this.onBaseChange = options.onBaseChange;
    this.onTablesChange = options.onTablesChange;
    this.live.configure(this.indexOptions);
    this.watchHostEvents();
  }

  /** Updates index configuration (e.g., localized checkbox labels) for future builds. */
  setIndexOptions(options: SearchIndexOptions): void {
    this.indexOptions = options;
    this.live.configure(this.indexOptions);
  }

  /** Releases host event subscriptions. */
  dispose(): void {
    for (const off of this.disposers.splice(0)) {
      try {
        off();
      } catch {
        // already gone
      }
    }
  }

  private watchHostEvents(): void {
    const base = this.bitable?.base;
    const register = (subscribeFn: (() => (() => void) | unknown) | undefined) => {
      if (!subscribeFn) return;
      try {
        const off = subscribeFn();
        if (typeof off === 'function') this.disposers.push(off as () => void);
      } catch {
        // Older hosts do not publish all lifecycle events.
      }
    };

    register(
      typeof base?.onPermissionChange === 'function'
        ? () =>
            base.onPermissionChange(() => {
              this.baseEditable = null;
            })
        : undefined
    );

    register(
      typeof base?.onSelectionChange === 'function'
        ? () =>
            base.onSelectionChange((event: any) => {
              const nextBaseId = event?.data?.baseId ?? event?.baseId;
              if (typeof nextBaseId === 'string' && nextBaseId) {
                if (this.baseId && nextBaseId !== this.baseId) {
                  this.baseId = nextBaseId;
                  this.cacheKey = '';
                  this.baseEditable = null;
                  this.viewFieldCache.clear();
                  this.onBaseChange?.(nextBaseId);
                } else if (!this.baseId) {
                  this.baseId = nextBaseId;
                }
              }
            })
        : undefined
    );

    register(
      typeof base?.onTableAdd === 'function'
        ? () =>
            base.onTableAdd(() => {
              this.viewFieldCache.clear();
              this.onTablesChange?.();
            })
        : undefined
    );

    register(
      typeof base?.onTableDelete === 'function'
        ? () =>
            base.onTableDelete(() => {
              this.viewFieldCache.clear();
              this.onTablesChange?.();
            })
        : undefined
    );
  }

  // -------------------------------------------------------------------------
  // Base / table metadata
  // -------------------------------------------------------------------------

  /**
   * The id of the open base.
   *
   * The SDK has no getBaseInfo(); the base id travels with the current
   * selection. A host that lacks it simply yields '' and callers fall back to a
   * key derived from the table ids.
   */
  async getBaseId(): Promise<string> {
    if (this.baseId) return this.baseId;

    const base = this.bitable?.base;
    try {
      const selection = await base?.getSelection?.();
      if (selection && typeof selection.baseId === 'string') this.baseId = selection.baseId;
    } catch (e) {
      console.warn('Failed to read the base id from the selection:', e);
    }

    if (!this.baseId && typeof base?.getBaseInfo === 'function') {
      try {
        const info = await base.getBaseInfo();
        this.baseId = info?.id || '';
      } catch (e) {
        console.warn('Failed to get base info:', e);
      }
    }

    return this.baseId;
  }

  async getAllTableMetas(): Promise<TableMeta[]> {
    const tableMetaList = await this.bitable.base.getTableMetaList();
    return tableMetaList.map((meta: any) => ({
      tableId: meta.id,
      tableName: meta.name,
    }));
  }

  /**
   * Resolves the current viewer's Base user id so shared-browser localStorage
   * caches never leak rows across accounts with different view/row permissions.
   */
  private async getUserId(): Promise<string> {
    if (this.userIdResolved) return this.userId;

    const bridge = this.bitable?.bridge;
    const fn =
      typeof bridge?.getBaseUserId === 'function'
        ? bridge.getBaseUserId
        : typeof bridge?.getUserId === 'function'
          ? bridge.getUserId
          : undefined;
    if (!fn) {
      this.userIdResolved = true;
      return '';
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const call = Promise.resolve(fn.call(bridge)).then(
        (val) => {
          if (typeof val === 'string' && val) this.userId = val;
          this.userIdResolved = true;
          return this.userId;
        },
        () => {
          this.userIdResolved = true;
          return '';
        }
      );
      const answer = await Promise.race([
        call,
        new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve(''), 400);
        }),
      ]);
      return answer;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Cache key for this base: its id, or a fingerprint of its table ids. */
  private async resolveCacheKey(tables: TableMeta[]): Promise<string> {
    if (this.cacheKey) return this.cacheKey;

    const baseId = await this.getBaseId();
    if (baseId) {
      this.cacheKey = baseId;
    } else if (tables.length > 0) {
      // Table ids are unique to a base, so their set identifies it.
      this.cacheKey = 'tables-' + hashString(tables.map((t) => t.tableId).sort().join(','));
    }
    return this.cacheKey;
  }

  private async getTableObject(tableId: string): Promise<any> {
    const base = this.bitable.base;
    // getTable(idOrName) races a by-name lookup against a by-id one on every
    // call; we always hold an id, so ask for exactly that.
    return typeof base.getTableById === 'function'
      ? base.getTableById(tableId)
      : base.getTable(tableId);
  }

  // -------------------------------------------------------------------------
  // Cache
  // -------------------------------------------------------------------------

  /**
   * Restores the previous index from localStorage so search works immediately.
   *
   * A restored index is a starting point, not the answer: callers should still
   * run indexAllTables(), which rebuilds in the background and swaps the fresh
   * index in. That is what keeps edits made since the cache was written (or in
   * another session) from going unseen for up to the cache TTL.
   */
  async tryLoadFromCache(): Promise<CacheLoadResult> {
    try {
      const tables = await this.getAllTableMetas();
      const key = await this.resolveCacheKey(tables);
      if (!key) return { loaded: false };

      const userId = await this.getUserId();
      const loaded = this.live.loadFromCache(
        key,
        tables.map((t) => t.tableId),
        userId || undefined
      );
      if (!loaded) return { loaded: false };

      // Same tables, but one may have been renamed since the cache was written.
      this.live.renameTables(new Map(tables.map((t) => [t.tableId, t.tableName])));
      return { loaded: true, cacheTime: this.live.getLoadedCacheTime() };
    } catch (e) {
      console.warn('Cache load failed, will do full index:', e);
      return { loaded: false };
    }
  }

  // -------------------------------------------------------------------------
  // Field / record reading
  // -------------------------------------------------------------------------

  async getFieldMetaList(tableId: string): Promise<FieldMeta[]> {
    const table = await this.getTableObject(tableId);
    return this.readFieldMetas(table);
  }

  /**
   * Reads a table's fields in one round trip.
   *
   * getFieldList() returns Field *objects*: they carry `id` and (on concrete
   * subclasses) `type`, but no `name` — that is an async getName() — and it
   * costs a field-exists and a field-meta call per field on top. The meta
   * list has everything, `property` included, for the price of one call.
   */
  private async readFieldMetas(table: any): Promise<FieldMeta[]> {
    if (typeof table.getFieldMetaList === 'function') {
      const metas = await table.getFieldMetaList();
      return metas.map((m: any) => ({
        id: m.id,
        name: typeof m.name === 'string' ? m.name : '',
        type: m.type,
        isPrimary: Boolean(m.isPrimary),
        property: m.property,
      }));
    }

    // Hosts without the meta list: fall back to field objects, asking each for
    // whatever it does not expose synchronously.
    const fieldList = await table.getFieldList();
    return Promise.all(
      fieldList.map(async (field: any): Promise<FieldMeta> => {
        const name =
          typeof field.name === 'string'
            ? field.name
            : await Promise.resolve(field.getName?.()).catch(() => '');
        const type =
          typeof field.type === 'number'
            ? field.type
            : await Promise.resolve(field.getType?.()).catch(() => 0);
        return {
          id: field.id,
          name: typeof name === 'string' ? name : '',
          type,
          isPrimary: Boolean(field.isPrimary),
        };
      })
    );
  }

  async getAllRecords(tableId: string): Promise<RecordData[]> {
    const table = await this.getTableObject(tableId);
    const allRecords: RecordData[] = [];
    let pageToken: unknown;
    let hasMore = true;

    while (hasMore) {
      const result = await this.fetchPage(table, pageToken, PAGE_SIZE);

      for (const record of result.records || []) {
        allRecords.push({
          recordId: record.recordId,
          fields: record.fields || {},
        });
      }

      hasMore = Boolean(result.hasMore);
      pageToken = result.pageToken;
      if (hasMore && pageToken === undefined) break;
    }

    return allRecords;
  }

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  /**
   * Reads every table and (re)builds the search index.
   *
   * - Concurrent calls share one run; later callers just subscribe to it.
   * - When the live index already has content (restored from cache, or a
   *   previous run) the new index is built on the side and swapped in only
   *   once complete, so results never blank out during a refresh.
   * - One unreadable table does not sink the run: it is reported in
   *   `failedTables` and the rest are indexed.
   *
   * Rejects only when nothing at all could be read.
   */
  indexAllTables(
    onProgress?: (progress: IndexProgress) => void,
    onTableComplete?: (tableName: string, recordCount: number) => void,
    onIndexUpdated?: () => void
  ): Promise<IndexResult> {
    const listener: IndexListener = { onProgress, onTableComplete, onIndexUpdated };

    if (this.job) {
      this.job.listeners.push(listener);
      return this.job.promise;
    }

    const listeners: IndexListener[] = [listener];
    const promise: Promise<IndexResult> = this.runIndex(listeners).finally(() => {
      if (this.job?.promise === promise) this.job = null;
    });
    this.job = { promise, listeners };
    return promise;
  }

  private async runIndex(listeners: IndexListener[]): Promise<IndexResult> {
    this.viewFieldCache.clear();
    const tables = await this.getAllTableMetas();
    const totalTables = tables.length;

    // Build beside the live index when there is something to keep showing.
    const background = this.live.hasData();
    if (!background) this.live.clear();
    const target = background ? new SearchIndex(this.indexOptions) : this.live;

    // Progress is aggregated across tables because several are read at once.
    const active = new Map<string, { name: string; done: number; total: number | null }>();
    const failedTables: FailedTable[] = [];
    let currentTableId = '';
    let completedTables = 0;
    let completedRecords = 0;

    const emit = () => {
      let inflightRecords = 0;
      let partialTables = 0;
      for (const t of active.values()) {
        inflightRecords += t.done;
        if (t.total && t.total > 0) {
          partialTables += Math.min(1, t.done / t.total);
        }
      }

      const current = active.get(currentTableId);
      const tableProgress =
        current && current.total && current.total > 0
          ? Math.min(1, current.done / current.total)
          : 0;

      const progress: IndexProgress = {
        currentTable: current?.name ?? '',
        tableProgress,
        completedTables,
        totalTables,
        recordsIndexed: completedRecords + inflightRecords,
        overall:
          totalTables === 0 ? 1 : Math.min(1, (completedTables + partialTables) / totalTables),
      };
      for (const l of listeners) l.onProgress?.(progress);
    };

    await this.mapWithConcurrency(tables, TABLE_CONCURRENCY, async (table) => {
      try {
        // One table handle: the field list comes off the same object.
        const tableObj = await this.getTableObject(table.tableId);
        const fieldMetaList = await this.readFieldMetas(tableObj);

        target.beginTable(table.tableId, table.tableName, fieldMetaList as IndexFieldMeta[]);

        active.set(table.tableId, { name: table.tableName, done: 0, total: null });
        currentTableId = table.tableId;
        emit();

        const recordCount = await this.readTableRecords(
          tableObj,
          target,
          table.tableId,
          fieldMetaList,
          (done, total) => {
            const state = active.get(table.tableId);
            if (state) {
              state.done = done;
              state.total = total;
            }
            emit();
          }
        );

        target.finalizeTable(table.tableId);

        active.delete(table.tableId);
        completedTables++;
        completedRecords += recordCount;
        if (currentTableId === table.tableId) {
          currentTableId = active.keys().next().value ?? '';
        }
        emit();

        for (const l of listeners) l.onTableComplete?.(table.tableName, recordCount);
        // A direct build is searchable as it grows; a background one is not
        // visible until the swap below.
        if (!background) for (const l of listeners) l.onIndexUpdated?.();
      } catch (e) {
        console.warn(`Could not index table "${table.tableName}":`, e);
        failedTables.push({
          tableId: table.tableId,
          tableName: table.tableName,
          message: errorMessage(e),
        });
        active.delete(table.tableId);
        completedTables++;
        if (currentTableId === table.tableId) {
          currentTableId = active.keys().next().value ?? '';
        }
        emit();
      }
    });

    if (totalTables > 0 && failedTables.length === totalTables) {
      throw new Error(failedTables[0].message);
    }

    const complete = failedTables.length === 0;

    // Finished indexes are packed before they go live: it roughly halves their
    // memory and the build is over, so nothing will be appended again.
    if (complete) target.compact();

    // A refresh that lost a table would silently shrink what is searchable;
    // keep the previous (complete) index and let the caller surface the failure.
    if (background && complete) {
      this.live.adopt(target);
      for (const l of listeners) l.onIndexUpdated?.();
    }

    if (complete) {
      const key = await this.resolveCacheKey(tables);
      const userId = await this.getUserId();
      if (key) this.live.saveToCache(key, userId || undefined);
    }

    return {
      tableCount: totalTables - failedTables.length,
      recordCount: completedRecords,
      failedTables,
      complete,
    };
  }

  /**
   * Reads and indexes every record of one table.
   *
   * getRecordsByPage takes a numeric offset as its pageToken and reports the
   * table's `total`, so after the first page every remaining page can be
   * requested at once. The deprecated getRecords, by contrast, returns an
   * opaque record-id token that makes page N+1 unknowable until page N lands —
   * which forced the whole base to be read one blocking round trip at a time.
   */
  private async readTableRecords(
    tableObj: any,
    target: SearchIndex,
    tableId: string,
    fieldMetaList: FieldMeta[],
    onBatch: (done: number, total: number | null) => void
  ): Promise<number> {
    if (typeof tableObj.getRecordsByPage !== 'function') {
      return this.readSequentially(tableObj, target, tableId, fieldMetaList, onBatch);
    }

    const first = await this.fetchPage(tableObj, 0, PAGE_SIZE);
    const firstCount = (first.records || []).length;
    let done = await this.indexPage(target, tableId, first.records, fieldMetaList);
    const total = typeof first.total === 'number' ? first.total : null;
    onBatch(done, total);

    if (!first.hasMore) return done;

    // Parallel offsets are only sound if the token really is an offset: the
    // next token must be the number of records already read. Anything else
    // (an opaque cursor, a missing total) is walked one page at a time.
    const tokenIsOffset =
      first.pageToken === undefined || first.pageToken === firstCount;
    if (total === null || firstCount === 0 || !tokenIsOffset) {
      return this.readSequentially(
        tableObj,
        target,
        tableId,
        fieldMetaList,
        onBatch,
        first.pageToken,
        done
      );
    }

    // Step by what the host actually served, not what we asked for: a host that
    // caps pages below 200 would otherwise have every other page skipped.
    const stride = firstCount;
    const offsets: number[] = [];
    for (let offset = stride; offset < total; offset += stride) {
      offsets.push(offset);
    }

    if (offsets.length === 0) {
      return first.pageToken !== undefined
        ? this.readSequentially(
            tableObj,
            target,
            tableId,
            fieldMetaList,
            onBatch,
            first.pageToken,
            done
          )
        : done;
    }

    const lastOffset = offsets[offsets.length - 1];
    let tailHasMore = false;
    let tailNextToken: unknown;

    await this.mapWithConcurrency(offsets, PAGE_CONCURRENCY, async (offset) => {
      const page = await this.fetchPage(tableObj, offset, stride);
      // Read the counter only after the await so concurrent pages cannot
      // overwrite each other's increments.
      const added = await this.indexPage(target, tableId, page.records, fieldMetaList);
      done += added;
      onBatch(done, typeof page.total === 'number' ? page.total : total);

      if (offset === lastOffset && page.hasMore && page.pageToken !== undefined) {
        tailHasMore = true;
        tailNextToken = page.pageToken;
      }
    });

    // If rows were appended while the parallel batch was in flight, walk any
    // newly added tail pages sequentially so no records are dropped.
    if (tailHasMore && tailNextToken !== undefined) {
      return this.readSequentially(
        tableObj,
        target,
        tableId,
        fieldMetaList,
        onBatch,
        tailNextToken,
        done
      );
    }

    return done;
  }

  /** Token-following fallback for hosts or APIs that cannot address pages by offset. */
  private async readSequentially(
    tableObj: any,
    target: SearchIndex,
    tableId: string,
    fieldMetaList: FieldMeta[],
    onBatch: (done: number, total: number | null) => void,
    initialToken?: unknown,
    initialDone = 0
  ): Promise<number> {
    let pageToken = initialToken;
    let done = initialDone;
    let hasMore = true;

    while (hasMore) {
      const result = await this.fetchPage(tableObj, pageToken, PAGE_SIZE);
      done += await this.indexPage(target, tableId, result.records, fieldMetaList);
      onBatch(done, typeof result.total === 'number' ? result.total : null);

      hasMore = Boolean(result.hasMore);
      pageToken = result.pageToken;
      // Defensive: a host that claims hasMore without handing back a token
      // would otherwise spin forever on the same page.
      if (hasMore && pageToken === undefined) break;
    }

    return done;
  }

  private async fetchPage(tableObj: any, pageToken: unknown, pageSize: number): Promise<any> {
    const params: Record<string, unknown> = { pageSize };
    if (pageToken !== undefined) params.pageToken = pageToken;

    const call = () =>
      typeof tableObj.getRecordsByPage === 'function'
        ? tableObj.getRecordsByPage(params)
        : tableObj.getRecords(params);

    let lastError: unknown;
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
      try {
        return await call();
      } catch (e) {
        lastError = e;
        if (attempt < FETCH_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    throw lastError;
  }

  private async indexPage(
    target: SearchIndex,
    tableId: string,
    rawRecords: any[] | undefined,
    fieldMetaList: FieldMeta[]
  ): Promise<number> {
    const records: RecordData[] = (rawRecords || []).map((r: any) => ({
      recordId: r.recordId,
      fields: r.fields || {},
    }));

    return target.addRecordBatch(tableId, records, fieldMetaList as IndexFieldMeta[]);
  }

  private async mapWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    let cursor = 0;
    let failed = false;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      // Once one item has failed the whole batch is lost; stop the other runners
      // from claiming more work instead of reading pages nobody will use.
      while (!failed && cursor < items.length) {
        try {
          await worker(items[cursor++]);
        } catch (e) {
          failed = true;
          throw e;
        }
      }
    });
    await Promise.all(runners);
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  /**
   * Resolves a grid view for the table. Cell-level focus requires a grid view,
   * so we prefer one; if the table somehow has none we fall back to its first
   * view (navigation still works, just without the cell editor).
   */
  private async getGridViewId(tableId: string): Promise<string> {
    const table = await this.getTableObject(tableId);
    const viewMetaList = await table.getViewMetaList();
    const gridView = viewMetaList.find((view: any) => view.type === VIEW_TYPE_GRID);
    return gridView?.id || viewMetaList[0]?.id || '';
  }

  /**
   * Whether this viewer can edit the base at all.
   *
   * showFieldValueEditor is a write affordance: for a viewer with read-only
   * access it does nothing, so clicking a result appeared to be broken. Asking
   * first lets us route those viewers somewhere that actually works.
   */
  async canEdit(): Promise<boolean> {
    if (this.baseEditable !== null) return this.baseEditable;

    try {
      const editable = await this.bitable.base.getPermission({
        entity: PERMISSION_ENTITY_BASE,
        type: OPERATION_EDITABLE,
      });
      this.baseEditable = Boolean(editable);
    } catch (e) {
      // Older hosts may not expose getPermission. Assume editable and let the
      // editor attempt decide — the fallback chain below still covers us.
      console.warn('Could not read base permission; assuming editable:', e);
      this.baseEditable = true;
    }

    return this.baseEditable;
  }

  async showToast(message: string, toastType: 'info' | 'success' | 'error' = 'info'): Promise<void> {
    try {
      await this.bitable.ui.showToast({ toastType, message });
    } catch (e) {
      console.warn('Could not show toast:', e);
    }
  }

  /**
   * Takes the viewer to the record that matched, by the best route their
   * permissions allow:
   *
   *   1. edit access  -> switch to the grid view and focus the exact cell
   *   2. read-only    -> open the record card, scoped to the matched field
   *   3. last resort  -> hand back a deep link to the record
   *
   * Editors keep the precise cell-level landing they had before; only viewers
   * who cannot use the editor are routed elsewhere.
   */
  async navigateToCell(
    tableId: string,
    recordId: string,
    fieldId: string
  ): Promise<NavigationResult> {
    let viewId = '';
    try {
      viewId = await this.getGridViewId(tableId);
    } catch (e) {
      console.warn('Could not resolve a view for the table:', e);
    }

    let switched = false;
    if (viewId) {
      try {
        await this.bitable.ui.switchToView(tableId, viewId);
        switched = true;
      } catch (e) {
        console.warn('Could not switch to the table view:', e);
      }
    }

    if (viewId && (await this.canEdit())) {
      try {
        // A host that cannot open the editor may resolve false rather than
        // throw, which is how this used to fail silently.
        const opened = await this.bitable.ui.showFieldValueEditor({
          tableId,
          viewId,
          recordId,
          fieldId,
        });
        if (opened !== false) return { ok: true, mode: 'cell-editor' };
      } catch (editorError) {
        // Read-only field types (formula, created time, auto number, …) can't
        // open an editor even for an editor-level user.
        console.warn('Could not focus the cell editor (field may be read-only):', editorError);
      }
    }

    // Read-only route: the record card. A viewer can't be dropped onto a single
    // cell, so show the whole row — every field visible in the grid view — which
    // is far more useful than the matched field on its own.
    try {
      const fieldIdList = viewId
        ? await this.getRowFieldIdList(tableId, viewId, fieldId)
        : undefined;

      const params: { tableId: string; recordId: string; fieldIdList?: string[] } = {
        tableId,
        recordId,
      };
      // Omitted rather than empty: that leaves the host to show its default,
      // which is the whole row.
      if (fieldIdList && fieldIdList.length > 0) params.fieldIdList = fieldIdList;

      const opened = await this.bitable.ui.showRecordDetailDialog(params);
      if (opened !== false) return { ok: true, mode: 'record-dialog' };
    } catch (e) {
      console.warn('Could not open the record detail dialog:', e);
    }

    const url = await this.getRecordUrl(tableId, viewId, recordId);
    if (url) return { ok: true, mode: 'link', url };

    if (switched) return { ok: true, mode: 'view' };

    console.error('Failed to navigate to the matched record');
    return { ok: false, mode: 'failed' };
  }

  /**
   * The fields a record card should show: everything visible in the grid view,
   * in the order the reader sees them, plus the matched field if it happens to
   * be hidden there (they clicked a result for it, so it has to be on screen).
   *
   * Returns undefined when the host can't tell us, in which case the caller
   * lets the host pick — which is still the whole row, just unfiltered.
   */
  private async getRowFieldIdList(
    tableId: string,
    viewId: string,
    matchedFieldId: string
  ): Promise<string[] | undefined> {
    const cacheKey = `${tableId}|${viewId}`;
    let fieldIds = this.viewFieldCache.get(cacheKey);

    if (!fieldIds) {
      const read = await this.readVisibleFieldIds(tableId, viewId);
      if (!read) return undefined;
      fieldIds = read;
      this.viewFieldCache.set(cacheKey, fieldIds);
    }

    return fieldIds.includes(matchedFieldId) ? fieldIds : [...fieldIds, matchedFieldId];
  }

  private async readVisibleFieldIds(
    tableId: string,
    viewId: string
  ): Promise<string[] | undefined> {
    try {
      const table = await this.getTableObject(tableId);
      if (typeof table.getViewById !== 'function') return undefined;

      const view = await table.getViewById(viewId);
      const visible: string[] = (await view.getVisibleFieldIdList()) || [];
      if (visible.length === 0) return undefined;

      // getVisibleFieldIdList isn't documented as ordered, but the view's field
      // meta list is — use it to put the columns in grid order.
      try {
        const ordered = await view.getFieldMetaList();
        const visibleSet = new Set(visible);
        const inOrder = ordered
          .map((f: any) => f.id)
          .filter((id: string) => visibleSet.has(id));
        if (inOrder.length > 0) return inOrder;
      } catch {
        // Ordering is a nicety, not a requirement.
      }

      return visible;
    } catch (e) {
      console.warn('Could not read the view field list; leaving it to the host:', e);
      return undefined;
    }
  }

  /** A deep link to the record, for viewers who can't be navigated in place. */
  private async getRecordUrl(tableId: string, viewId: string, recordId: string): Promise<string> {
    if (viewId && typeof this.bitable.bridge?.getBitableUrl === 'function') {
      try {
        const url = await this.bitable.bridge.getBitableUrl({ tableId, viewId, recordId });
        if (url) return url;
      } catch (e) {
        console.warn('Could not build a record link:', e);
      }
    }

    try {
      const table = await this.getTableObject(tableId);
      if (typeof table.getRecordShareLink === 'function') {
        return (await table.getRecordShareLink(recordId)) || '';
      }
    } catch (e) {
      console.warn('Could not build a record share link:', e);
    }

    return '';
  }
}
