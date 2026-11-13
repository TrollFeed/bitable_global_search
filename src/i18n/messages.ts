/** Languages the UI is translated into (all 16 official Feishu / Lark locales). Anything else falls back to English. */
export type Locale =
  | 'en'
  | 'zh'
  | 'zh-TW'
  | 'zh-HK'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'pt'
  | 'it'
  | 'ru'
  | 'id'
  | 'vi'
  | 'th'
  | 'hi';

export const SUPPORTED_LOCALES: readonly Locale[] = [
  'en',
  'zh',
  'zh-TW',
  'zh-HK',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'pt',
  'it',
  'ru',
  'id',
  'vi',
  'th',
  'hi',
];

export const FALLBACK_LOCALE: Locale = 'en';

/** Locale-aware formatting handed to message functions, so numbers and dates match the UI language. */
export interface Formatters {
  number(value: number): string;
  dateTime(timestamp: number): string;
}

/**
 * Every user-visible string. English is the source of truth: the other locale
 * files are typed against this interface, so a missing or misspelled key is a
 * compile error rather than a blank label at runtime.
 *
 * Plain strings are used where there is nothing to interpolate; functions are
 * used where a language needs to choose a plural form or reorder its words.
 */
export interface Messages {
  'app.title': string;

  'search.placeholder': string;
  'search.clear': string;
  'refresh.label': string;
  'refresh.title': string;

  'mode.caseSensitive.short': string;
  'mode.caseSensitive.title': string;
  'mode.wholeWord.short': string;
  'mode.wholeWord.title': string;
  'mode.fuzzy.short': string;
  'mode.fuzzy.title': string;
  'mode.regex.short': string;
  'mode.regex.title': string;

  'status.loadingCache': string;
  /** `table` is the sheet currently being read, `rows` the running total. */
  'status.indexingTable': (p: { table: string; rows: number }, f: Formatters) => string;
  'status.indexingGeneric': (p: { rows: number }, f: Formatters) => string;
  'progress.overall': string;
  'progress.table': string;

  'cache.loaded': (p: { time: number }, f: Formatters) => string;
  'cache.updating': (p: { time: number }, f: Formatters) => string;
  'cache.refresh': string;

  'results.found': (p: { matches: number; tables: number }, f: Formatters) => string;
  'results.showingFirst': (p: { shown: number; total: number }, f: Formatters) => string;
  'results.showMore': (p: { count: number }, f: Formatters) => string;
  'results.none': (p: { query: string }) => string;
  'results.partial': string;
  'group.matches': (p: { count: number }, f: Formatters) => string;

  'export.button': string;
  'export.title': string;
  'export.csv': string;
  'export.json': string;
  'export.copyTsv': string;
  'export.col.sheet': string;
  'export.col.field': string;
  'export.col.recordId': string;
  'export.col.matched': string;
  'export.col.value': string;

  'index.title': string;
  'index.rows': (p: { count: number }, f: Formatters) => string;

  'error.indexFailed': string;
  'error.partial': (p: { count: number; names: string }, f: Formatters) => string;
  'error.regexInvalid': (p: { reason: string }) => string;
  'error.regexUnsafe': string;

  'toast.linkCopied': string;
  'toast.linkFailed': string;
  'toast.viewOpened': (p: { table: string; field: string }) => string;
  'toast.openFailed': string;
  'toast.exported': (p: { count: number; format: string }, f: Formatters) => string;
  'toast.copiedResults': (p: { count: number }, f: Formatters) => string;
  'toast.exportFailed': string;

  'boundary.title': string;
  'boundary.reload': string;

  /** Text indexed for a ticked / unticked checkbox cell. */
  'checkbox.checked': string;
  'checkbox.unchecked': string;
}

export type MessageKey = keyof Messages;
