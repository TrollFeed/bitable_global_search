import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SearchInput } from './components/SearchInput';
import { SearchResultGroup } from './components/SearchResultGroup';
import { IndexingProgress } from './components/IndexingProgress';
import { ExportMenu, type ExportFormat } from './components/ExportMenu';
import {
  searchIndex,
  type QueryOptions,
  type SearchResult,
} from './search/SearchIndex';
import { BitableDataService, type IndexProgress } from './services/BitableDataService';
import { useDebounce } from './hooks/useDebounce';
import { bitable } from '@lark-base-open/js-sdk';
import { useBitableTheme } from './hooks/useBitableTheme';
import { t, useLocale } from './i18n';
import {
  buildExportFilename,
  copyTextToClipboard,
  downloadTextFile,
  formatResultsAsCsv,
  formatResultsAsJson,
  formatResultsAsTsv,
} from './utils/exportResults';
import './App.css';

const PAGE_RESULTS = 500;
const SEARCH_DEBOUNCE_MS = 150;
// A cache this young is not worth re-reading the whole base for.
const FRESH_CACHE_MS = 60 * 1000;
// Coalesces the index-changed signal so a base with many small tables does not
// re-run the active search once per table.
const INDEX_UPDATE_THROTTLE_MS = 120;
const TABLE_EVENT_DEBOUNCE_MS = 600;

function isQueryBlank(query: string, regex?: boolean): boolean {
  return regex ? query.length === 0 : query.trim() === '';
}

interface AppState {
  /** Restoring the previous index from localStorage. */
  isLoadingCache: boolean;
  /** A read of the base is in progress. */
  isIndexing: boolean;
  /** That read refreshes an index that is already searchable. */
  isBackground: boolean;
  currentTable: string;
  tableProgress: number;
  completedTables: number;
  totalTables: number;
  overall: number;
  recordsIndexed: number;
  error: string | null;
  /** Names of tables the last run could not read. */
  failedTables: string[];
  /** Set while the searchable index came from the cache rather than a fresh read. */
  cacheTime?: number;
}

const IDLE_STATE: AppState = {
  isLoadingCache: false,
  isIndexing: false,
  isBackground: false,
  currentTable: '',
  tableProgress: 0,
  completedTables: 0,
  totalTables: 0,
  overall: 0,
  recordsIndexed: 0,
  error: null,
  failedTables: [],
};

const DEFAULT_QUERY_OPTIONS: QueryOptions = {
  caseSensitive: false,
  wholeWord: false,
  fuzzy: false,
  regex: false,
};

const App: React.FC = () => {
  const locale = useLocale();

  const [searchQuery, setSearchQuery] = useState('');
  const [queryOptions, setQueryOptions] = useState<QueryOptions>(DEFAULT_QUERY_OPTIONS);
  const [displayLimit, setDisplayLimit] = useState(PAGE_RESULTS);
  const [indexVersion, setIndexVersion] = useState(0);
  const [appState, setAppState] = useState<AppState>(IDLE_STATE);

  useBitableTheme(bitable);

  const debouncedQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // -- index change signal ---------------------------------------------------

  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startIndexingRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});

  const markIndexChanged = useCallback((immediate = false) => {
    if (immediate) {
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
        updateTimer.current = null;
      }
      setIndexVersion((v) => v + 1);
      return;
    }
    if (updateTimer.current) return;
    updateTimer.current = setTimeout(() => {
      updateTimer.current = null;
      setIndexVersion((v) => v + 1);
    }, INDEX_UPDATE_THROTTLE_MS);
  }, []);

  const dataService = useMemo(
    () =>
      new BitableDataService(bitable, {
        // Checkbox cells are indexed as words; make them the words this UI uses.
        indexOptions: {
          checkedLabel: t('checkbox.checked'),
          uncheckedLabel: t('checkbox.unchecked'),
        },
        onBaseChange: () => {
          searchIndex.clear();
          markIndexChanged(true);
          void startIndexingRef.current(false);
        },
        onTablesChange: () => {
          if (tableChangeTimer.current) clearTimeout(tableChangeTimer.current);
          tableChangeTimer.current = setTimeout(() => {
            tableChangeTimer.current = null;
            void startIndexingRef.current(true);
          }, TABLE_EVENT_DEBOUNCE_MS);
        },
      }),
    [markIndexChanged]
  );

  useEffect(
    () => () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
      if (tableChangeTimer.current) clearTimeout(tableChangeTimer.current);
      dataService.dispose();
    },
    [dataService]
  );

  // -- indexing --------------------------------------------------------------

  const runningRef = useRef(false);
  const pendingRunRef = useRef<{ forceRefresh: boolean } | null>(null);

  const startIndexing = useCallback(
    async (forceRefresh = false) => {
      if (runningRef.current) {
        pendingRunRef.current = {
          forceRefresh: Boolean(pendingRunRef.current?.forceRefresh || forceRefresh),
        };
        return;
      }
      runningRef.current = true;

      try {
        let cacheTime: number | undefined;

        if (!forceRefresh) {
          setAppState({ ...IDLE_STATE, isLoadingCache: true });

          const restored = await dataService.tryLoadFromCache();
          if (restored.loaded) {
            cacheTime = restored.cacheTime;
            markIndexChanged(true);
          }
        }

        // A very recent cache is as good as a read: show it and stop.
        if (cacheTime !== undefined && Date.now() - cacheTime < FRESH_CACHE_MS) {
          setAppState({ ...IDLE_STATE, cacheTime });
          return;
        }

        setAppState({
          ...IDLE_STATE,
          isIndexing: true,
          isBackground: searchIndex.hasData(),
          cacheTime,
        });

        try {
          const result = await dataService.indexAllTables(
            (progress: IndexProgress) => {
              setAppState((prev) => ({
                ...prev,
                currentTable: progress.currentTable,
                tableProgress: progress.tableProgress,
                completedTables: progress.completedTables,
                totalTables: progress.totalTables,
                overall: progress.overall,
                recordsIndexed: progress.recordsIndexed,
              }));
            },
            undefined,
            () => markIndexChanged()
          );

          setAppState((prev) => ({
            ...prev,
            failedTables: result.failedTables.map((f) => f.tableName),
            // A finished refresh replaced the cached index; it is fresh now.
            cacheTime: result.complete ? undefined : prev.cacheTime,
          }));
        } catch (error) {
          setAppState((prev) => ({
            ...prev,
            error:
              error instanceof Error && error.message
                ? error.message
                : t('error.indexFailed'),
          }));
        } finally {
          setAppState((prev) => ({
            ...prev,
            isIndexing: false,
            isBackground: false,
          }));
          markIndexChanged(true);
        }
      } finally {
        runningRef.current = false;
        const queued = pendingRunRef.current;
        pendingRunRef.current = null;
        if (queued) {
          void startIndexing(queued.forceRefresh);
        }
      }
    },
    [dataService, markIndexChanged]
  );

  startIndexingRef.current = startIndexing;

  useEffect(() => {
    void startIndexing();
  }, [startIndexing]);

  // Keep checkbox indexing labels synchronized if a slow Feishu bridge resolves
  // its language after initial boot.
  const prevLocaleRef = useRef(locale);
  useEffect(() => {
    dataService.setIndexOptions({
      checkedLabel: t('checkbox.checked'),
      uncheckedLabel: t('checkbox.unchecked'),
    });
    if (prevLocaleRef.current !== locale) {
      prevLocaleRef.current = locale;
      void startIndexing(true);
    }
  }, [locale, dataService, startIndexing]);

  // -- query & search --------------------------------------------------------

  const handleQueryChange = useCallback((next: string) => {
    setSearchQuery(next);
    setDisplayLimit(PAGE_RESULTS);
  }, []);

  const handleOptionsChange = useCallback((next: QueryOptions) => {
    setQueryOptions(next);
    setDisplayLimit(PAGE_RESULTS);
  }, []);

  const hasLiveQuery = !isQueryBlank(searchQuery, queryOptions.regex);
  const effectiveQuery = hasLiveQuery ? debouncedQuery : '';
  const hasExecutedQuery = hasLiveQuery && !isQueryBlank(effectiveQuery, queryOptions.regex);

  // Computed synchronously instep with effectiveQuery, queryOptions, and
  // indexVersion so results and empty-state banners never render out of phase.
  const searchResponse = useMemo(() => {
    if (!hasExecutedQuery) {
      return { results: [] as SearchResult[], totalMatches: 0, totalTables: 0 };
    }
    return searchIndex.searchWithMeta(effectiveQuery, displayLimit, queryOptions);
  }, [hasExecutedQuery, effectiveQuery, displayLimit, queryOptions, indexVersion]);

  const searchResults = searchResponse.results;
  const totalMatches = searchResponse.totalMatches;
  const totalTables = searchResponse.totalTables;
  const regexError = searchResponse.regexError;

  // -- export ----------------------------------------------------------------

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!hasExecutedQuery || totalMatches === 0) return;

      const allResults =
        totalMatches > searchResults.length
          ? searchIndex.searchWithMeta(effectiveQuery, Number.MAX_SAFE_INTEGER, queryOptions)
              .results
          : searchResults;

      const headers = {
        sheet: t('export.col.sheet'),
        field: t('export.col.field'),
        recordId: t('export.col.recordId'),
        matched: t('export.col.matched'),
        value: t('export.col.value'),
      };

      if (format === 'tsv') {
        const tsv = formatResultsAsTsv(allResults, headers);
        const ok = await copyTextToClipboard(tsv);
        await dataService.showToast(
          ok
            ? t('toast.copiedResults', { count: allResults.length })
            : t('toast.exportFailed'),
          ok ? 'success' : 'error'
        );
        return;
      }

      if (format === 'csv') {
        const csv = formatResultsAsCsv(allResults, headers);
        const filename = buildExportFilename(effectiveQuery, 'csv');
        const ok = downloadTextFile(csv, filename, 'text/csv;charset=utf-8');
        await dataService.showToast(
          ok
            ? t('toast.exported', { count: allResults.length, format: 'CSV' })
            : t('toast.exportFailed'),
          ok ? 'success' : 'error'
        );
        return;
      }

      const json = formatResultsAsJson(allResults, {
        query: effectiveQuery,
        options: queryOptions,
        totalMatches: allResults.length,
        totalTables,
      });
      const filename = buildExportFilename(effectiveQuery, 'json');
      const ok = downloadTextFile(json, filename, 'application/json;charset=utf-8');
      await dataService.showToast(
        ok
          ? t('toast.exported', { count: allResults.length, format: 'JSON' })
          : t('toast.exportFailed'),
        ok ? 'success' : 'error'
      );
    },
    [
      dataService,
      effectiveQuery,
      hasExecutedQuery,
      queryOptions,
      searchResults,
      totalMatches,
      totalTables,
    ]
  );

  // -- navigation ------------------------------------------------------------

  const handleResultClick = useCallback(
    async (result: SearchResult) => {
      try {
        const nav = await dataService.navigateToCell(
          result.tableId,
          result.recordId,
          result.fieldId
        );

        switch (nav.mode) {
          case 'cell-editor':
          case 'record-dialog':
            // The cell editor / record card is its own confirmation.
            break;
          case 'link': {
            // Read-only viewers can't be navigated in place, so open the record
            // for them; if the host blocks the popup, leave it on the clipboard.
            //
            // 'noopener' is deliberately not passed as a window feature: with it
            // window.open() always returns null, which made every successful
            // open look like a blocked popup. The opener is cleared by hand.
            const url = nav.url ?? '';
            const opened = url ? window.open(url, '_blank') : null;
            if (opened) {
              try {
                opened.opener = null;
              } catch {
                // Cross-origin window; nothing to clear.
              }
              break;
            }
            const copied = url ? await copyTextToClipboard(url) : false;
            await dataService.showToast(
              copied ? t('toast.linkCopied') : t('toast.linkFailed'),
              copied ? 'info' : 'error'
            );
            break;
          }
          case 'view':
            await dataService.showToast(
              t('toast.viewOpened', { table: result.tableName, field: result.fieldName })
            );
            break;
          default:
            await dataService.showToast(t('toast.openFailed'), 'error');
        }
      } catch (error) {
        console.error('Error navigating to cell:', error);
      }
    },
    [dataService]
  );

  // -- derived view state ----------------------------------------------------

  const groupedResults = useMemo(() => searchIndex.groupByTable(searchResults), [searchResults]);

  // The sheet list follows the index, so it is right after a cache restore, a
  // refresh and a partial failure alike. indexVersion is the signal that the
  // index content changed; the index itself is not React state.
  const indexedTables = useMemo(
    () => Array.from(searchIndex.getTableData().values()),
    [indexVersion]
  );

  const isBusy = appState.isIndexing || appState.isLoadingCache;
  // The index is still being filled, so what is shown may be missing sheets.
  const isPartial = appState.isIndexing && !appState.isBackground;
  const cacheTime = appState.cacheTime;
  const remainingResults = Math.max(0, totalMatches - searchResults.length);

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-title">{t('app.title')}</h1>
        <SearchInput
          value={searchQuery}
          onChange={handleQueryChange}
          isLoading={isBusy}
          onRefresh={() => void startIndexing(true)}
          options={queryOptions}
          onOptionsChange={handleOptionsChange}
          hasError={Boolean(hasExecutedQuery && regexError)}
        />
      </div>

      {appState.isLoadingCache && (
        <div className="indexing-progress">
          <div className="indexing-progress-header">
            <span className="indexing-text">{t('status.loadingCache')}</span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar overall" style={{ width: '60%' }}></div>
          </div>
        </div>
      )}

      {appState.isIndexing && cacheTime === undefined && (
        <IndexingProgress
          currentTable={appState.currentTable}
          tableProgress={appState.tableProgress}
          completedTables={appState.completedTables}
          totalTables={appState.totalTables}
          overall={appState.overall}
          recordsIndexed={appState.recordsIndexed}
        />
      )}

      {appState.error && <div className="error-message">{appState.error}</div>}

      {appState.failedTables.length > 0 && (
        <div className="error-message">
          {t('error.partial', {
            count: appState.failedTables.length,
            names: appState.failedTables.join(', '),
          })}
        </div>
      )}

      {hasExecutedQuery && regexError && (
        <div className="regex-error-banner" role="alert">
          {regexError === 'unsafe'
            ? t('error.regexUnsafe')
            : t('error.regexInvalid', { reason: regexError })}
        </div>
      )}

      {cacheTime !== undefined && (
        <div className="cache-info">
          <span>
            {appState.isIndexing
              ? t('cache.updating', { time: cacheTime })
              : t('cache.loaded', { time: cacheTime })}
          </span>
          {appState.isIndexing ? (
            appState.totalTables > 0 && (
              <span className="indexing-count">
                {appState.completedTables} / {appState.totalTables}
              </span>
            )
          ) : (
            <button
              type="button"
              className="refresh-cache-button"
              onClick={() => void startIndexing(true)}
            >
              {t('cache.refresh')}
            </button>
          )}
        </div>
      )}

      <div className="search-results-container">
        {hasExecutedQuery && !appState.isLoadingCache && !regexError && (
          <div className="results-summary-row">
            <div className="results-summary">
              {totalMatches > 0 ? (
                <span>
                  {t('results.found', { matches: totalMatches, tables: totalTables })}
                  {remainingResults > 0 && (
                    <span className="partial-note">
                      {' · '}
                      {t('results.showingFirst', {
                        shown: searchResults.length,
                        total: totalMatches,
                      })}
                    </span>
                  )}
                  {isPartial && <span className="partial-note"> · {t('results.partial')}</span>}
                </span>
              ) : isPartial ? (
                <span className="no-results">{t('results.partial')}</span>
              ) : (
                <span className="no-results">
                  {t('results.none', { query: effectiveQuery })}
                </span>
              )}
            </div>

            {totalMatches > 0 && <ExportMenu onExport={(fmt) => void handleExport(fmt)} />}
          </div>
        )}

        <div className="results-list">
          {hasExecutedQuery &&
            !regexError &&
            Array.from(groupedResults.entries()).map(([tableId, results]) => {
              const tableName = results[0]?.tableName || tableId;
              return (
                <SearchResultGroup
                  key={tableId}
                  tableId={tableId}
                  tableName={tableName}
                  results={results}
                  onResultClick={handleResultClick}
                />
              );
            })}

          {hasExecutedQuery && !regexError && remainingResults > 0 && (
            <button
              type="button"
              className="show-more-button"
              onClick={() => setDisplayLimit((prev) => prev + PAGE_RESULTS)}
            >
              {t('results.showMore', { count: Math.min(PAGE_RESULTS, remainingResults) })}
            </button>
          )}
        </div>

        {!hasLiveQuery && !appState.isLoadingCache && indexedTables.length > 0 && (
          <div className="index-info">
            <h3>{t('index.title')}</h3>
            <ul>
              {indexedTables.map((table) => (
                <li key={table.tableId}>
                  <span className="table-name">{table.tableName}</span>
                  <span className="record-count">
                    {t('index.rows', { count: table.recordCount })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
