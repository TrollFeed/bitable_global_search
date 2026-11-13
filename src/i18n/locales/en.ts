import type { Messages } from '../messages';

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const en: Messages = {
  'app.title': 'Global Search',

  'search.placeholder': 'Search all sheets...',
  'search.clear': 'Clear search',
  'refresh.label': 'Refresh index',
  'refresh.title': 'Refresh search index',

  'mode.caseSensitive.short': 'Case',
  'mode.caseSensitive.title': 'Match case',
  'mode.wholeWord.short': 'Word',
  'mode.wholeWord.title': 'Match whole words only',
  'mode.fuzzy.short': 'Fuzzy',
  'mode.fuzzy.title': 'Fuzzy match (typo-tolerant)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Use regular expression',

  'status.loadingCache': 'Loading from cache...',
  'status.indexingTable': ({ table, rows }, f) =>
    `Indexing ${table}... (${f.number(rows)} ${plural(rows, 'row', 'rows')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Indexing sheets... (${f.number(rows)} ${plural(rows, 'row', 'rows')})`,
  'progress.overall': 'Indexing progress',
  'progress.table': 'Current sheet progress',

  'cache.loaded': ({ time }, f) => `Loaded from cache (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) => `Loaded from cache (${f.dateTime(time)}) - updating...`,
  'cache.refresh': 'Refresh',

  'results.found': ({ matches, tables }, f) =>
    `Found ${f.number(matches)} ${plural(matches, 'match', 'matches')} in ${f.number(tables)} ${plural(tables, 'sheet', 'sheets')}`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Showing ${f.number(shown)} of ${f.number(total)}`,
  'results.showMore': ({ count }, f) =>
    `Show ${f.number(count)} more ${plural(count, 'result', 'results')}`,
  'results.none': ({ query }) => `No results found for "${query}"`,
  'results.partial': 'Still indexing - results may be incomplete',
  'group.matches': ({ count }, f) => `${f.number(count)} ${plural(count, 'match', 'matches')}`,

  'export.button': 'Export',
  'export.title': 'Export search results',
  'export.csv': 'Download CSV (.csv)',
  'export.json': 'Download JSON (.json)',
  'export.copyTsv': 'Copy for spreadsheet (TSV)',
  'export.col.sheet': 'Sheet',
  'export.col.field': 'Column',
  'export.col.recordId': 'Record ID',
  'export.col.matched': 'Matched Text',
  'export.col.value': 'Cell Value',

  'index.title': 'Indexed Sheets',
  'index.rows': ({ count }, f) => `${f.number(count)} ${plural(count, 'row', 'rows')}`,

  'error.indexFailed': 'Failed to index tables',
  'error.partial': ({ count, names }) =>
    `Couldn't read ${count} ${plural(count, 'sheet', 'sheets')}: ${names}. Results may be incomplete.`,
  'error.regexInvalid': ({ reason }) => `Invalid regular expression: ${reason}`,
  'error.regexUnsafe':
    'Pattern is too complex (nested quantifiers may freeze search). Simplify the expression.',

  'toast.linkCopied': 'Read-only access — link to the matching row copied to your clipboard.',
  'toast.linkFailed': 'Read-only access — could not open the row automatically.',
  'toast.viewOpened': ({ table, field }) => `Opened ${table}. Look for the "${field}" column.`,
  'toast.openFailed': 'Could not open that row.',
  'toast.exported': ({ count, format }, f) =>
    `Exported ${f.number(count)} ${plural(count, 'result', 'results')} as ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `Copied ${f.number(count)} ${plural(count, 'result', 'results')} to clipboard.`,
  'toast.exportFailed': 'Could not export search results.',

  'boundary.title': 'Something went wrong',
  'boundary.reload': 'Reload',

  'checkbox.checked': 'Yes',
  'checkbox.unchecked': 'No',
};
