// NOTE: this module deliberately has no imports. Keep it that way — it lets
// the index be loaded and benchmarked on its own, without the SDK or React.

export interface MatchRange {
  start: number;
  length: number;
}

export interface SearchResult {
  tableId: string;
  tableName: string;
  recordId: string;
  fieldId: string;
  fieldName: string;
  fieldType: number;
  value: string;
  matches: MatchRange[];
}

/** Options controlling how a query is matched against indexed cells. */
export interface QueryOptions {
  /** Match exact letter case and character width instead of folding. */
  caseSensitive?: boolean;
  /** Require matches to start and end on word boundaries. */
  wholeWord?: boolean;
  /** Treat the query as a regular expression. Takes precedence over `fuzzy`. */
  regex?: boolean;
  /** Typo-tolerant (Damerau-Levenshtein) and compact gapped-subsequence matching. */
  fuzzy?: boolean;
}

/** Result of a search along with corpus-wide totals before `maxResults` capping. */
export interface SearchResponse {
  results: SearchResult[];
  /** Total matching cells across all indexed tables (before `maxResults`). */
  totalMatches: number;
  /** Distinct tables represented among all matching cells. */
  totalTables: number;
  /** Present when `options.regex` is true and the pattern is invalid or unsafe. */
  regexError?: string;
}

/** Read-only summary of one indexed table. */
export interface TableSummary {
  tableId: string;
  tableName: string;
  recordCount: number;
}

/** What the index needs to know about a field. `property` is the host's field property bag. */
export interface IndexFieldMeta {
  id: string;
  name: string;
  type: number;
  property?: unknown;
}

export interface IndexRecord {
  recordId: string;
  fields: Record<string, unknown>;
}

export interface SearchIndexOptions {
  /** Text indexed for a ticked checkbox cell. */
  checkedLabel?: string;
  /** Text indexed for an explicitly unticked checkbox cell. */
  uncheckedLabel?: string;
}

type Range = { start: number; length: number };

// Cache layout is columnar so that JSON.parse allocates one flat array of cells
// per table rather than a Map-shaped tree per record.
interface CachedTable {
  id: string;
  name: string;
  /** [fieldId, fieldName, fieldType] */
  fields: Array<[string, string, number]>;
  /** Ids of records that have at least one searchable cell. */
  records: string[];
  /** Every record seen, including ones with no searchable cells. */
  recordCount: number;
  /** Flat triples: recordIndex, fieldIndex, text. */
  cells: Array<number | string>;
}

interface CachedIndexData {
  version: number;
  baseId: string;
  timestamp: number;
  userId?: string;
  checkboxLabels?: [string, string];
  tables: CachedTable[];
}

// Bumped to 5: added SEA script-continua character indexing, Object & Date-Formula
// field extraction, 1-to-1 İ/ς folding, and user/locale cache metadata.
export const CACHE_VERSION = 5;
const CACHE_KEY_PREFIX = 'bitable_global_search_cache_';
const CACHE_TTL = 24 * 60 * 60 * 1000;

// localStorage is ~5 MB per origin. Writing past it throws QuotaExceededError
// only after we have paid the full stringify cost, so estimate first and skip.
const MAX_CACHE_CHARS = 4 * 1024 * 1024;

// How many records to process between yieldToMainThread() calls.
const YIELD_BATCH_SIZE = 500;

// Wall-clock safety cap per regex search so complex alternations on very large
// bases cannot freeze the UI thread.
const REGEX_TIME_BUDGET_MS = 1500;

// Maximum skipped characters between consecutive query characters in CJK gapped
// fuzzy matching (e.g. "北大" -> "北京大学" skips 1, "서울시" -> "서울특별시" skips 2).
const MAX_CJK_GAP = 2;

const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd HH:mm';

// ---------------------------------------------------------------------------
// Character classification
// ---------------------------------------------------------------------------

const CLASS_OTHER = 0; // punctuation, whitespace, symbols — ends a word
const CLASS_WORD = 1; // letter/digit of a space-delimited script
const CLASS_CJK = 2; // letter/digit of a script written without word spaces

const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;

/**
 * Scripts that are written without spaces between words, so a phrase can start
 * mid-"word" and is indexed one character at a time. Includes CJK (Han, Kana,
 * Bopomofo, Hangul) and Southeast Asian script continua (Thai, Lao, Myanmar,
 * Khmer — Feishu supports Thai natively).
 */
function isCjkCode(code: number): boolean {
  return (
    (code >= 0x2e80 && code <= 0x9fff) || // CJK radicals .. Unified Ideographs (+ kana, bopomofo, compat jamo)
    (code >= 0xac00 && code <= 0xd7af) || // Hangul syllables
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0xa960 && code <= 0xa97f) || // Hangul Jamo Extended-A
    (code >= 0xd7b0 && code <= 0xd7ff) || // Hangul Jamo Extended-B
    (code >= 0x0e00 && code <= 0x0eff) || // Thai & Lao
    (code >= 0x1000 && code <= 0x109f) || // Myanmar
    (code >= 0x1780 && code <= 0x17ff) || // Khmer
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xff00 && code <= 0xffef) || // Halfwidth & Fullwidth Forms
    (code >= 0x1b000 && code <= 0x1b16f) || // Kana Supplement / Extended
    (code >= 0x20000 && code <= 0x323af) // CJK Unified Ideographs Extensions B..H
  );
}

let classTable: Uint8Array | null = null;

/** Class of every BMP code unit; built once, on first use. Surrogates stay 0. */
function getClassTable(): Uint8Array {
  if (classTable) return classTable;

  const table = new Uint8Array(0x10000);
  for (let c = 0; c < 0x10000; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    if (LETTER_OR_DIGIT.test(String.fromCharCode(c))) {
      table[c] = isCjkCode(c) ? CLASS_CJK : CLASS_WORD;
    }
  }

  classTable = table;
  return table;
}

function classifyAstral(codePoint: number): number {
  if (!LETTER_OR_DIGIT.test(String.fromCodePoint(codePoint))) return CLASS_OTHER;
  return isCjkCode(codePoint) ? CLASS_CJK : CLASS_WORD;
}

/** Class of the character that ends just before `pos`, surrogate-pair aware. */
function classBefore(text: string, pos: number, table: Uint8Array): number {
  const c = text.charCodeAt(pos - 1);
  if (c >= 0xdc00 && c <= 0xdfff && pos >= 2) {
    const h = text.charCodeAt(pos - 2);
    if (h >= 0xd800 && h <= 0xdbff) {
      return classifyAstral(((h - 0xd800) << 10) + (c - 0xdc00) + 0x10000);
    }
    return CLASS_OTHER;
  }
  return table[c];
}

/** Class of the character starting at `pos`, surrogate-pair aware. */
function classAt(text: string, pos: number, table: Uint8Array): number {
  const c = text.charCodeAt(pos);
  if (c >= 0xd800 && c <= 0xdbff && pos + 1 < text.length) {
    const d = text.charCodeAt(pos + 1);
    if (d >= 0xdc00 && d <= 0xdfff) {
      return classifyAstral(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000);
    }
    return CLASS_OTHER;
  }
  return table[c];
}

function isUnderscoreCode(code: number): boolean {
  return code === 0x5f || code === 0xff3f;
}

/**
 * Checks whether `[start, end)` sits on whole-word boundaries within `text`.
 *
 * - Underscore (`_`) acts as an identifier connector (`user_id` does not match
 *   whole-word `user` or `id`, while `user_id` matches `user_id`).
 * - Space-delimited words (`CLASS_WORD`) cannot border another `CLASS_WORD`,
 *   but MAY border CJK text (`"使用React开发"` matches whole-word `"React"` while
 *   rejecting `"Using ReactNative"`).
 * - CJK phrases (`CLASS_CJK`) cannot border another `CLASS_CJK` (`"水晶"` matches
 *   `"【水晶】"` and `"水晶，玛瑙"`, while rejecting `"水晶球"` and `"紫水晶"`).
 */
function hasWordBoundary(text: string, start: number, end: number, table: Uint8Array): boolean {
  if (start >= end) return false;

  if (start > 0) {
    const prevCode = text.charCodeAt(start - 1);
    const firstCode = text.charCodeAt(start);
    const prevCls = classBefore(text, start, table);
    const firstCls = classAt(text, start, table);
    const prevConn = isUnderscoreCode(prevCode);
    const firstConn = isUnderscoreCode(firstCode);

    if (prevConn || firstConn) {
      if (prevCls !== CLASS_OTHER || prevConn) return false;
    } else if (firstCls === CLASS_WORD && prevCls === CLASS_WORD) {
      return false;
    } else if (firstCls === CLASS_CJK && prevCls === CLASS_CJK) {
      return false;
    }
  }

  if (end < text.length) {
    const lastCode = text.charCodeAt(end - 1);
    const nextCode = text.charCodeAt(end);
    const lastCls = classBefore(text, end, table);
    const nextCls = classAt(text, end, table);
    const lastConn = isUnderscoreCode(lastCode);
    const nextConn = isUnderscoreCode(nextCode);

    if (lastConn || nextConn) {
      if (nextCls !== CLASS_OTHER || nextConn) return false;
    } else if (lastCls === CLASS_WORD && nextCls === CLASS_WORD) {
      return false;
    } else if (lastCls === CLASS_CJK && nextCls === CLASS_CJK) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Case / width folding
// ---------------------------------------------------------------------------

const SPECIAL_FOLD = /[！-～\u03c2]/;
const SPECIAL_FOLD_ALL = /[！-～\u03c2]/g;

function normalizeFoldedChar(ch: string): string {
  const code = ch.charCodeAt(0);
  // Greek final sigma ς -> σ so sigma folding is context-independent.
  if (code === 0x03c2) return '\u03c3';
  return String.fromCharCode(code - 0xfee0);
}

/**
 * Lower-cases `s` and maps full-width ASCII forms (ＡＢＣ１２３) to plain ASCII.
 *
 * The result is always *exactly* as long (in UTF-16 code units) as the input,
 * and idempotent (`foldText(foldText(x)) === foldText(x)`). That lets match
 * offsets found in the folded text be applied directly to the original for
 * highlighting — plain `toLowerCase()` breaks this for `"İ"` (`\u0130`), which
 * grows to `"i\u0307"` and shifts every highlight after it.
 */
export function foldText(s: string): string {
  let t = s.toLowerCase();
  if (t.length !== s.length) {
    t = '';
    for (const ch of s) {
      if (ch === '\u0130') {
        t += 'i';
        continue;
      }
      const lower = ch.toLowerCase();
      t += lower.length === ch.length ? lower : ch;
    }
  }
  return SPECIAL_FOLD.test(t) ? t.replace(SPECIAL_FOLD_ALL, normalizeFoldedChar) : t;
}

/**
 * True when folding cannot change whether `phrase` matches: every character is
 * non-ASCII and has no case. Nothing folds *to* such a character (case mapping
 * targets are cased letters, width folding targets ASCII), so a CJK query can
 * be matched against the raw cell text and skip the fold entirely.
 */
function matchesUnfolded(phrase: string): boolean {
  for (let i = 0; i < phrase.length; i++) {
    if (phrase.charCodeAt(i) < 0x80) return false;
  }
  return phrase.toLowerCase() === phrase.toUpperCase();
}

interface RunSlice {
  start: number;
  end: number;
}

/**
 * Maximal letter/digit slices of `text`. When `keepUnderscore` is true, `_` is
 * kept inside runs that contain at least one letter or digit so identifier
 * queries like `user_id` stay intact under whole-word matching.
 */
function wordRunSlices(text: string, keepUnderscore = false): RunSlice[] {
  const table = getClassTable();
  const slices: RunSlice[] = [];
  const n = text.length;
  let start = -1;
  let hasAlphaNum = false;

  for (let i = 0; i < n; ) {
    const c = text.charCodeAt(i);
    let cls: number;
    let step = 1;

    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        cls = classifyAstral(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000);
        step = 2;
      } else {
        cls = CLASS_OTHER;
      }
    } else {
      cls = table[c];
    }

    const isConn = keepUnderscore && isUnderscoreCode(c);
    if (cls !== CLASS_OTHER || isConn) {
      if (start < 0) start = i;
      if (cls !== CLASS_OTHER) hasAlphaNum = true;
    } else if (start >= 0) {
      if (hasAlphaNum) slices.push({ start, end: i });
      start = -1;
      hasAlphaNum = false;
    }
    i += step;
  }

  if (start >= 0 && hasAlphaNum) slices.push({ start, end: n });
  return slices;
}

/** Maximal letter/digit runs of already-folded text. */
function wordRuns(folded: string): string[] {
  return wordRunSlices(folded, false).map((s) => folded.slice(s.start, s.end));
}

/**
 * Splits one letter/digit run into lookup parts: each non-CJK stretch stays a
 * string, each CJK character becomes its code point. Underscores (present when
 * `wholeWord` kept an identifier together) split adjacent stretches cleanly.
 */
function splitRun(run: string): Array<string | number> {
  const table = getClassTable();
  const parts: Array<string | number> = [];
  const n = run.length;
  let stretchStart = -1;

  for (let i = 0; i < n; ) {
    const c = run.charCodeAt(i);
    let cp = c;
    let step = 1;
    let cls: number;

    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
      const d = run.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        cp = ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000;
        step = 2;
        cls = classifyAstral(cp);
      } else {
        cls = CLASS_OTHER;
      }
    } else {
      cls = table[c];
    }

    if (cls === CLASS_CJK) {
      if (stretchStart >= 0) {
        parts.push(run.slice(stretchStart, i));
        stretchStart = -1;
      }
      parts.push(cp);
    } else if (cls === CLASS_WORD) {
      if (stretchStart < 0) stretchStart = i;
    } else if (stretchStart >= 0) {
      parts.push(run.slice(stretchStart, i));
      stretchStart = -1;
    }
    i += step;
  }

  if (stretchStart >= 0) parts.push(run.slice(stretchStart));
  return parts;
}

// ---------------------------------------------------------------------------
// Fuzzy matching helpers (Damerau-Levenshtein & bitmask filtering)
// ---------------------------------------------------------------------------

function charMask(s: string, maxLen = s.length): number {
  let mask = 0;
  const limit = Math.min(s.length, maxLen);
  for (let i = 0; i < limit; i++) {
    mask |= 1 << (s.charCodeAt(i) & 31);
  }
  return mask;
}

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function maxFuzzyEdits(codePointLength: number): number {
  if (codePointLength <= 2) return 0;
  if (codePointLength <= 4) return 1;
  return 2;
}

interface DecodedString {
  cps: number[];
  /** UTF-16 code-unit start offset for each code point, plus `text.length` sentinel at `[cps.length]`. */
  offsets: number[];
}

function decodeCodePoints(text: string): DecodedString {
  const cps: number[] = [];
  const offsets: number[] = [];
  const n = text.length;

  for (let i = 0; i < n; ) {
    offsets.push(i);
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        cps.push(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000);
        i += 2;
        continue;
      }
    }
    cps.push(c);
    i++;
  }
  offsets.push(n);
  return { cps, offsets };
}

function toCodePoints(text: string): number[] {
  const cps: number[] = [];
  const n = text.length;
  for (let i = 0; i < n; ) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        cps.push(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000);
        i += 2;
        continue;
      }
    }
    cps.push(c);
    i++;
  }
  return cps;
}

/**
 * Bounded Optimal String Alignment (Damerau-Levenshtein with adjacent
 * transpositions) between `query` and `target` (or prefixes of `target` when
 * `wholeWord` is false).
 *
 * Returns `{ edits, matchedLen }` (in code points of `target`), or `null` when
 * the minimum edit distance exceeds `maxEdits`.
 */
function fuzzyMatchCodePoints(
  query: number[],
  target: number[],
  maxEdits: number,
  wholeWord: boolean,
  preferExactLen = false
): { edits: number; matchedLen: number } | null {
  const m = query.length;
  const n = target.length;
  if (m === 0) return null;

  if (wholeWord) {
    if (Math.abs(n - m) > maxEdits) return null;
  } else {
    if (n < m - maxEdits) return null;
  }

  const limitN = wholeWord ? n : Math.min(n, m + maxEdits);
  let prev2 = new Int32Array(limitN + 1);
  let prev = new Int32Array(limitN + 1);
  let curr = new Int32Array(limitN + 1);

  for (let j = 0; j <= limitN; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const qi = query[i - 1];

    for (let j = 1; j <= limitN; j++) {
      const tj = target[j - 1];
      const cost = qi === tj ? 0 : 1;
      let val = prev[j - 1] + cost;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      if (del < val) val = del;
      if (ins < val) val = ins;

      if (i > 1 && j > 1 && qi === target[j - 2] && query[i - 2] === tj) {
        const trans = prev2[j - 2] + 1;
        if (trans < val) val = trans;
      }

      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }

    if (rowMin > maxEdits) return null;

    const tmp = prev2;
    prev2 = prev;
    prev = curr;
    curr = tmp;
  }

  if (wholeWord) {
    return prev[n] <= maxEdits ? { edits: prev[n], matchedLen: n } : null;
  }

  const minJ = Math.max(1, m - maxEdits);
  let bestEdits = maxEdits + 1;
  let bestLen = 0;

  for (let j = minJ; j <= limitN; j++) {
    const d = prev[j];
    if (d > maxEdits) continue;
    if (d < bestEdits) {
      bestEdits = d;
      bestLen = j;
    } else if (d === bestEdits) {
      if (preferExactLen) {
        if (Math.abs(j - m) < Math.abs(bestLen - m)) bestLen = j;
      } else if (j > bestLen) {
        bestLen = j;
      }
    }
  }

  return bestLen > 0 ? { edits: bestEdits, matchedLen: bestLen } : null;
}

// ---------------------------------------------------------------------------
// Regex safety & compilation
// ---------------------------------------------------------------------------

/**
 * Detects nested unbounded quantifiers — e.g. `(a+)+`, `(.*)*`, `([a-z]+){2,}` —
 * that trigger exponential backtracking (ReDoS) on non-matching cells. Bounded
 * groups such as `(\d{1,3}\.){3}\d{1,3}` or alternations `(foo|bar)+` stay
 * allowed.
 */
function hasCatastrophicBacktracking(pattern: string): boolean {
  let inCharClass = false;
  // Stack per open `(` group: whether the group body contains an unbounded quantifier.
  const groupHasUnbounded: boolean[] = [];
  // Whether the atom immediately preceding the current cursor was a `)` whose
  // group contained an unbounded quantifier.
  let prevAtomWasUnboundedGroup = false;

  const readBraceQuantifier = (
    start: number
  ): { end: number; repeatsMultiple: boolean; unbounded: boolean } | null => {
    // Expects `{m}` or `{m,}` or `{m,n}` starting at `start` (`pattern[start] === '{'`).
    let i = start + 1;
    let minStr = '';
    while (i < pattern.length && pattern[i] >= '0' && pattern[i] <= '9') {
      minStr += pattern[i++];
    }
    if (!minStr || i >= pattern.length) return null;

    if (pattern[i] === '}') {
      const exact = Number(minStr);
      return { end: i, repeatsMultiple: exact >= 2, unbounded: false };
    }
    if (pattern[i] !== ',') return null;
    i++;

    let maxStr = '';
    while (i < pattern.length && pattern[i] >= '0' && pattern[i] <= '9') {
      maxStr += pattern[i++];
    }
    if (i >= pattern.length || pattern[i] !== '}') return null;

    if (maxStr === '') {
      return { end: i, repeatsMultiple: true, unbounded: true };
    }
    const max = Number(maxStr);
    return { end: i, repeatsMultiple: max >= 2, unbounded: max >= 12 };
  };

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (ch === '\\') {
      i++;
      prevAtomWasUnboundedGroup = false;
      continue;
    }

    if (inCharClass) {
      if (ch === ']') inCharClass = false;
      continue;
    }

    if (ch === '[') {
      inCharClass = true;
      prevAtomWasUnboundedGroup = false;
      continue;
    }

    if (ch === '(') {
      groupHasUnbounded.push(false);
      prevAtomWasUnboundedGroup = false;
      continue;
    }

    if (ch === ')') {
      const innerUnbounded = groupHasUnbounded.pop() ?? false;
      if (innerUnbounded && groupHasUnbounded.length > 0) {
        groupHasUnbounded[groupHasUnbounded.length - 1] = true;
      }
      prevAtomWasUnboundedGroup = innerUnbounded;
      continue;
    }

    if (ch === '*' || ch === '+') {
      if (prevAtomWasUnboundedGroup) return true;
      if (groupHasUnbounded.length > 0) {
        groupHasUnbounded[groupHasUnbounded.length - 1] = true;
      }
      if (pattern[i + 1] === '?') i++;
      prevAtomWasUnboundedGroup = false;
      continue;
    }

    if (ch === '{') {
      const q = readBraceQuantifier(i);
      if (q) {
        if (prevAtomWasUnboundedGroup && q.repeatsMultiple) return true;
        if (q.unbounded && groupHasUnbounded.length > 0) {
          groupHasUnbounded[groupHasUnbounded.length - 1] = true;
        }
        i = q.end;
        if (pattern[i + 1] === '?') i++;
        prevAtomWasUnboundedGroup = false;
        continue;
      }
    }

    if (ch === '?') {
      prevAtomWasUnboundedGroup = false;
      continue;
    }

    prevAtomWasUnboundedGroup = false;
  }

  return false;
}

export interface RegexValidation {
  regex: RegExp | null;
  /** `'unsafe'` when rejected for catastrophic backtracking; `'invalid'` on SyntaxError. */
  errorKind?: 'invalid' | 'unsafe';
  errorMessage?: string;
}

/** Validates and compiles a user regex pattern safely. */
export function compileSearchRegex(pattern: string, caseSensitive = false): RegexValidation {
  if (hasCatastrophicBacktracking(pattern)) {
    return {
      regex: null,
      errorKind: 'unsafe',
      errorMessage: 'Nested quantifiers can cause catastrophic backtracking',
    };
  }

  const unicodeFlags = caseSensitive ? 'gmu' : 'gimu';
  try {
    return { regex: new RegExp(pattern, unicodeFlags) };
  } catch (unicodeErr) {
    // Allow harmless identity escapes like `\#` or `\:` that `/u` rejects,
    // while still surfacing genuine syntax errors.
    const fallbackFlags = caseSensitive ? 'gm' : 'gim';
    try {
      return { regex: new RegExp(pattern, fallbackFlags) };
    } catch {
      const msg = unicodeErr instanceof Error ? unicodeErr.message : String(unicodeErr);
      return { regex: null, errorKind: 'invalid', errorMessage: msg };
    }
  }
}

// ---------------------------------------------------------------------------
// Cell value -> text
// ---------------------------------------------------------------------------

// Field types whose cells are worth searching (FieldType in the SDK).
const SEARCHABLE_TYPES = new Set<number>([
  1, // Text
  2, // Number
  3, // SingleSelect
  4, // MultiSelect
  5, // DateTime
  7, // Checkbox
  11, // User
  13, // Phone
  15, // Url
  17, // Attachment
  18, // SingleLink
  19, // Lookup
  20, // Formula
  21, // DuplexLink
  22, // Location
  23, // GroupChat
  25, // Object
  1001, // CreatedTime
  1002, // ModifiedTime
  1003, // CreatedUser
  1004, // ModifiedUser
  1005, // AutoNumber
  99001, // Barcode
  99002, // Progress
  99003, // Currency
  99004, // Rating
  99005, // Email
]);

const TYPE_CHECKBOX = 7;
const TYPE_FORMULA = 20;
const TIME_TYPES = new Set<number>([5, 1001, 1002]);

const DATE_TOKEN = /yyyy|MM|dd|HH|mm|ss/g;
// A separate, non-global copy: .test() on a /g regex carries lastIndex state.
const HAS_DATE_TOKEN = /yyyy|MM|dd|HH|mm|ss/;

/**
 * Renders a timestamp with one of the host's date patterns (yyyy/MM/dd,
 * dd/MM/yyyy HH:mm, …) so the indexed text matches what the grid shows,
 * independent of the machine's locale.
 */
function formatTimestamp(ms: number, pattern: string): string {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';

  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return pattern.replace(DATE_TOKEN, (token) => {
    switch (token) {
      case 'yyyy':
        return String(d.getFullYear());
      case 'MM':
        return pad(d.getMonth() + 1);
      case 'dd':
        return pad(d.getDate());
      case 'HH':
        return pad(d.getHours());
      case 'mm':
        return pad(d.getMinutes());
      default:
        return pad(d.getSeconds());
    }
  });
}

function dateFormatOf(fieldType: number, property: unknown): string | undefined {
  if (TIME_TYPES.has(fieldType)) {
    if (property && typeof property === 'object') {
      const format = (property as { dateFormat?: unknown }).dateFormat;
      if (typeof format === 'string' && HAS_DATE_TOKEN.test(format)) return format;
    }
    return DEFAULT_DATE_FORMAT;
  }

  // Formula fields that evaluate to dates expose their date pattern either on
  // `formatter` or on `dataType.property.dateFormat`.
  if (fieldType === TYPE_FORMULA && property && typeof property === 'object') {
    const p = property as {
      formatter?: unknown;
      dataType?: { type?: unknown; property?: { dateFormat?: unknown } };
    };
    if (typeof p.formatter === 'string' && HAS_DATE_TOKEN.test(p.formatter)) {
      return p.formatter;
    }
    const dt = p.dataType;
    if (dt && typeof dt === 'object') {
      const innerFmt = dt.property?.dateFormat;
      if (typeof innerFmt === 'string' && HAS_DATE_TOKEN.test(innerFmt)) return innerFmt;
      if (typeof dt.type === 'number' && TIME_TYPES.has(dt.type)) return DEFAULT_DATE_FORMAT;
    }
  }

  return undefined;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Recursively pulls human-readable text out of a Bitable cell value.
 *
 * getRecords() returns rich objects/arrays (IOpenCellValue), NOT plain
 * strings. Calling String() on these yields "[object Object]", which is what
 * broke search originally. This walks the structure and never returns
 * "[object Object]".
 */
function extractText(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > 8) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    // A rich-text cell is a list of segments whose *concatenation* is the
    // cell's text. Joining those with a space would split a CJK phrase that
    // straddles a segment boundary (text interrupted by a link or @mention)
    // and make it unfindable. Other arrays — multi-select options, users,
    // attachments — really are separate values, so those keep the space.
    if (isSegmentList(value)) return extractSegments(value);

    const parts: string[] = [];
    for (const v of value) {
      const text = extractText(v, depth + 1);
      if (text) parts.push(text);
    }
    return parts.join(' ');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // URL segment: index both the visible text and the link target (once if identical).
    if (typeof obj.link === 'string' && typeof obj.text === 'string') {
      return obj.link && obj.link !== obj.text ? `${obj.text} ${obj.link}`.trim() : obj.text || obj.link;
    }
    const known =
      nonEmptyString(obj.text) ??
      nonEmptyString(obj.fullAddress) ??
      nonEmptyString(obj.full_address) ??
      nonEmptyString(obj.name) ??
      nonEmptyString(obj.address) ??
      nonEmptyString(obj.enName) ??
      nonEmptyString(obj.en_name) ??
      nonEmptyString(obj.email) ??
      nonEmptyString(obj.title);
    if (known !== undefined) return known;

    // AutoNumber and similar self-calculation wrappers: { value }
    if ('value' in obj) return extractText(obj.value, depth + 1);
    return '';
  }

  return '';
}

/** IOpenSegmentType from the SDK: the pieces a rich-text cell is built from. */
function isSegmentList(value: unknown[]): boolean {
  if (value.length === 0) return false;
  for (const v of value) {
    if (typeof v !== 'object' || v === null) return false;
    const type = (v as Record<string, unknown>).type;
    if (type !== 'text' && type !== 'url' && type !== 'mention') return false;
  }
  return true;
}

/**
 * Rebuilds the visible text of a segment list verbatim, so phrases stay
 * contiguous. Link targets are appended afterwards rather than spliced
 * inline, which keeps them searchable without cutting the sentence in two.
 */
function extractSegments(segments: unknown[]): string {
  let text = '';
  const linkTargets: string[] = [];

  for (const segment of segments) {
    const seg = segment as Record<string, unknown>;

    if (typeof seg.text === 'string' && seg.text) text += seg.text;
    else if (typeof seg.name === 'string' && seg.name) text += seg.name;
    else if (typeof seg.enName === 'string' && seg.enName) text += seg.enName;
    else if (typeof seg.en_name === 'string' && seg.en_name) text += seg.en_name;

    if (typeof seg.link === 'string' && seg.link && seg.link !== seg.text) {
      linkTargets.push(seg.link);
    }
  }

  return linkTargets.length > 0 ? `${text} ${linkTargets.join(' ')}`.trim() : text;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

interface TableState {
  tableId: string;
  tableName: string;
  fieldIds: string[];
  fieldNames: string[];
  fieldTypes: number[];
  fieldIndex: Map<string, number>;
  /** Per field index: date pattern, for time-like and date-formula fields. */
  fieldDateFormats: Array<string | undefined>;
  /** Ids of records that have at least one indexed cell. */
  recordIds: string[];
  /** Every record seen, to drop duplicates when pages overlap. Freed on finalize. */
  seen: Set<string> | null;
  recordCount: number;
  /** Set when beginTable() replaced this table; its cells are ignored. */
  dead: boolean;
}

/**
 * A posting list: ascending, duplicate-free cell ids. Lists are plain arrays
 * while an index is being built (they only ever grow) and long ones become
 * Uint32Arrays once it is complete — see SearchIndex.compact().
 */
type Postings = number[] | Uint32Array;

// Below this length a typed array's fixed object overhead outweighs the 4 bytes
// per entry it saves over a plain array's 8.
const COMPACT_MIN_LENGTH = 32;

interface IndexState {
  // Integer cell ids rather than {tableId, recordId, fieldId} objects keep the
  // index small enough to afford one posting per CJK character.
  latin: Map<string, Postings>;
  cjk: Map<number, Postings>;

  // Parallel arrays describing each cell.
  cellTable: number[];
  cellRecord: number[];
  cellField: number[];
  cellText: string[];

  tables: Map<string, TableState>;
  tableList: TableState[];

  // Sorted view of the latin keys, built lazily for prefix search.
  sortedTerms: string[] | null;
}

function newState(): IndexState {
  return {
    latin: new Map(),
    cjk: new Map(),
    cellTable: [],
    cellRecord: [],
    cellField: [],
    cellText: [],
    tables: new Map(),
    tableList: [],
    sortedTerms: null,
  };
}

const EMPTY: number[] = [];

// Ranking packs (rankScore, cellId) into one double so the whole candidate
// list can be ordered with a native numeric sort: 2^20 * 2^32 = 2^52 < 2^53.
const MAX_RANK_COUNT = 0xfffff;
const CELL_ID_RADIX = 4294967296;

// In fuzzy mode the 20-bit rankScore reserves the top 2 bits for match tier
// (2 = exact/prefix, 1 = <=1 edit, 0 = 2 edits / gapped subsequence) and the
// low 18 bits for match count, so exact hits always outrank approximate ones.
const FUZZY_TIER_SHIFT = 0x40000;
const FUZZY_MAX_COUNT = 0x3ffff;

function sortAndDedupRanges(ranges: Range[]): void {
  if (ranges.length <= 1) return;
  ranges.sort((a, b) => a.start - b.start || b.length - a.length);
  let w = 1;
  for (let r = 1; r < ranges.length; r++) {
    const prev = ranges[w - 1];
    const curr = ranges[r];
    if (curr.start !== prev.start || curr.length !== prev.length) {
      ranges[w++] = curr;
    }
  }
  ranges.length = w;
}

export class SearchIndex {
  private s: IndexState = newState();
  private checkedLabel: string;
  private uncheckedLabel: string;
  private cacheTime: number | undefined;

  constructor(options: SearchIndexOptions = {}) {
    this.checkedLabel = options.checkedLabel ?? 'Yes';
    this.uncheckedLabel = options.uncheckedLabel ?? 'No';
  }

  /** Changes how cells are rendered to text. Affects cells indexed from now on. */
  configure(options: SearchIndexOptions): void {
    if (options.checkedLabel !== undefined) this.checkedLabel = options.checkedLabel;
    if (options.uncheckedLabel !== undefined) this.uncheckedLabel = options.uncheckedLabel;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  clear(): void {
    this.s = newState();
    this.cacheTime = undefined;
  }

  /** True once any live table has been started — i.e. there is something to search. */
  hasData(): boolean {
    return this.s.tableList.some((t) => !t.dead);
  }

  /**
   * Takes over `other`'s contents and leaves it empty. This is how a freshly
   * built index replaces the live one in a single step, so a refresh never
   * shows a half-built index.
   */
  adopt(other: SearchIndex): void {
    if (other === this) return;
    this.s = other.s;
    this.cacheTime = other.cacheTime;
    other.s = newState();
    other.cacheTime = undefined;
  }

  /** Summaries of every indexed table, in indexing order. */
  getTableData(): Map<string, TableSummary> {
    const out = new Map<string, TableSummary>();
    for (const t of this.s.tableList) {
      if (t.dead) continue;
      out.set(t.tableId, {
        tableId: t.tableId,
        tableName: t.tableName,
        recordCount: t.recordCount,
      });
    }
    return out;
  }

  /** Applies current table names (a rename since the index was built). */
  renameTables(names: Map<string, string>): void {
    for (const t of this.s.tableList) {
      const name = names.get(t.tableId);
      if (name !== undefined) t.tableName = name;
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Timestamp of the cache this index was last restored from, if any. */
  getLoadedCacheTime(): number | undefined {
    return this.cacheTime;
  }

  saveToCache(baseId: string, userId?: string): void {
    try {
      const cacheKey = CACHE_KEY_PREFIX + baseId;
      const s = this.s;

      // Estimate before paying for JSON.stringify of something we then discard.
      let estimate = 256;
      for (let i = 0; i < s.cellText.length; i++) {
        if (s.tableList[s.cellTable[i]].dead) continue;
        estimate += s.cellText[i].length + 16;
      }
      if (estimate > MAX_CACHE_CHARS) {
        this.clearCache(baseId);
        console.warn(
          `Index too large to cache (~${Math.round(estimate / 1024)} KB); ` +
            'it will be rebuilt on next open.'
        );
        return;
      }

      const perTable: Array<Array<number | string>> = s.tableList.map(() => []);
      for (let id = 0; id < s.cellText.length; id++) {
        const tblIdx = s.cellTable[id];
        if (s.tableList[tblIdx].dead) continue;
        perTable[tblIdx].push(s.cellRecord[id], s.cellField[id], s.cellText[id]);
      }

      const tables: CachedTable[] = [];
      s.tableList.forEach((t, idx) => {
        if (t.dead) return;
        tables.push({
          id: t.tableId,
          name: t.tableName,
          fields: t.fieldIds.map((id, i) => [id, t.fieldNames[i], t.fieldTypes[i]]),
          records: t.recordIds,
          recordCount: t.recordCount,
          cells: perTable[idx],
        });
      });

      const data: CachedIndexData = {
        version: CACHE_VERSION,
        baseId,
        timestamp: Date.now(),
        ...(userId ? { userId } : {}),
        checkboxLabels: [this.checkedLabel, this.uncheckedLabel],
        tables,
      };

      // Only the extracted cell text is persisted. The inverted index is
      // rebuilt on load because serializing it roughly 6x'd the payload and
      // pushed ordinary bases past the localStorage quota.
      const payload = JSON.stringify(data);

      if (payload.length > MAX_CACHE_CHARS) {
        this.clearCache(baseId);
        console.warn(
          `Index too large to cache (${Math.round(payload.length / 1024)} KB); ` +
            'it will be rebuilt on next open.'
        );
        return;
      }

      localStorage.setItem(cacheKey, payload);
      this.pruneExpiredCaches(cacheKey);
    } catch (e) {
      // Leave no half-written blob behind for the next load to trip over.
      this.clearCache(baseId);
      console.warn('Failed to save index to cache:', e);
    }
  }

  /**
   * Removes other bases' caches that have outlived the TTL.
   */
  private pruneExpiredCaches(keepKey: string): void {
    try {
      const expired: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key === keepKey || !key.startsWith(CACHE_KEY_PREFIX)) continue;

        const head = (localStorage.getItem(key) ?? '').slice(0, 300);
        const match = /"timestamp":(\d+)/.exec(head);
        if (!match || Date.now() - Number(match[1]) > CACHE_TTL) expired.push(key);
      }

      for (const key of expired) localStorage.removeItem(key);
    } catch {
      // Housekeeping only; never let it fail a save.
    }
  }

  /**
   * Restores the index from localStorage.
   *
   * Rejects caches from another user (`expectedUserId`), another UI language's
   * checkbox labels, or a changed set of tables (`expectedTableIds`) *before*
   * rebuilding the inverted index.
   */
  loadFromCache(baseId: string, expectedTableIds?: string[], expectedUserId?: string): boolean {
    let restoring = false;

    try {
      const cacheKey = CACHE_KEY_PREFIX + baseId;
      const cachedStr = localStorage.getItem(cacheKey);
      if (!cachedStr) return false;

      const data = JSON.parse(cachedStr) as CachedIndexData;

      if (!data || data.version !== CACHE_VERSION || !Array.isArray(data.tables)) {
        this.clearCache(baseId);
        return false;
      }

      if (typeof data.timestamp !== 'number' || Date.now() - data.timestamp > CACHE_TTL) {
        this.clearCache(baseId);
        return false;
      }

      // Never serve another user's cached cells on a shared browser profile.
      if ((data.userId ?? '') !== (expectedUserId ?? '')) {
        return false;
      }

      // If the UI language changed since the cache was saved, checkbox cells
      // carry the old language's Yes/No words — rebuild cleanly.
      if (
        Array.isArray(data.checkboxLabels) &&
        data.checkboxLabels.length === 2 &&
        (data.checkboxLabels[0] !== this.checkedLabel ||
          data.checkboxLabels[1] !== this.uncheckedLabel)
      ) {
        return false;
      }

      if (expectedTableIds) {
        const cached = new Set(data.tables.map((t) => t.id));
        const same =
          cached.size === expectedTableIds.length && expectedTableIds.every((id) => cached.has(id));
        if (!same) {
          this.clearCache(baseId);
          return false;
        }
      }

      restoring = true;
      this.clear();

      for (const table of data.tables) {
        this.beginTable(
          table.id,
          table.name,
          table.fields.map(([id, name, type]) => ({ id, name, type }))
        );

        const state = this.s.tables.get(table.id)!;
        state.recordIds = table.records.slice();
        state.recordCount = table.recordCount;
        state.seen = null;

        const tableIdx = this.s.tableList.indexOf(state);
        const recordTotal = state.recordIds.length;
        const fieldTotal = state.fieldIds.length;
        const cells = table.cells;

        for (let i = 0; i + 2 < cells.length; i += 3) {
          const recordIdx = cells[i];
          const fieldIdx = cells[i + 1];
          const text = cells[i + 2];

          if (
            typeof text !== 'string' ||
            !Number.isInteger(recordIdx) ||
            !Number.isInteger(fieldIdx) ||
            (recordIdx as number) < 0 ||
            (recordIdx as number) >= recordTotal ||
            (fieldIdx as number) < 0 ||
            (fieldIdx as number) >= fieldTotal
          ) {
            throw new Error('Malformed index cache');
          }

          this.addCell(tableIdx, recordIdx as number, fieldIdx as number, text);
        }
      }

      this.compact();
      this.cacheTime = data.timestamp;
      return true;
    } catch (e) {
      if (restoring) this.clear();
      this.clearCache(baseId);
      console.warn('Failed to load index from cache:', e);
      return false;
    }
  }

  clearCache(baseId: string): void {
    try {
      localStorage.removeItem(CACHE_KEY_PREFIX + baseId);
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }
  }

  // -------------------------------------------------------------------------
  // Building
  // -------------------------------------------------------------------------

  /**
   * Begin incremental indexing for a table. Call addRecordBatch() one or more
   * times, then finalizeTable() when all batches have been indexed.
   */
  beginTable(tableId: string, tableName: string, fieldMetaList: IndexFieldMeta[]): void {
    const previous = this.s.tables.get(tableId);
    if (previous) previous.dead = true;

    const state: TableState = {
      tableId,
      tableName,
      fieldIds: [],
      fieldNames: [],
      fieldTypes: [],
      fieldIndex: new Map(),
      fieldDateFormats: [],
      recordIds: [],
      seen: new Set(),
      recordCount: 0,
      dead: false,
    };

    for (const f of fieldMetaList) this.registerField(state, f);

    this.s.tables.set(tableId, state);
    this.s.tableList.push(state);
    this.s.sortedTerms = null;
  }

  private registerField(table: TableState, f: IndexFieldMeta): number {
    const existing = table.fieldIndex.get(f.id);
    if (existing !== undefined) return existing;

    const index = table.fieldIds.length;
    table.fieldIds.push(f.id);
    table.fieldNames.push(f.name);
    table.fieldTypes.push(f.type);
    table.fieldDateFormats.push(dateFormatOf(f.type, f.property));
    table.fieldIndex.set(f.id, index);
    return index;
  }

  /**
   * Index a batch of records for a table that was started with beginTable().
   * Returns the number of *new* records indexed; a record id already seen in
   * this table (pages can overlap while the base is being edited) is skipped.
   */
  async addRecordBatch(
    tableId: string,
    recordList: IndexRecord[],
    fieldMetaList: IndexFieldMeta[],
    onProgress?: (progress: number) => void
  ): Promise<number> {
    const table = this.s.tables.get(tableId);
    if (!table) return 0;
    if (!table.seen) table.seen = new Set(table.recordIds);

    const tableIdx = this.s.tableList.indexOf(table);
    const searchable: Array<{ id: string; index: number; type: number }> = [];
    for (const f of fieldMetaList) {
      if (SEARCHABLE_TYPES.has(f.type)) {
        searchable.push({ id: f.id, index: this.registerField(table, f), type: f.type });
      }
    }

    let processed = 0;

    for (const record of recordList) {
      if (table.seen.has(record.recordId)) continue;
      table.seen.add(record.recordId);
      table.recordCount++;

      let recordIdx = -1;
      for (const field of searchable) {
        const text = this.valueToString(record.fields[field.id], field.type, table, field.index);
        if (!text) continue;

        if (recordIdx < 0) {
          recordIdx = table.recordIds.length;
          table.recordIds.push(record.recordId);
        }
        this.addCell(tableIdx, recordIdx, field.index, text);
      }

      processed++;

      if (onProgress && processed % YIELD_BATCH_SIZE === 0) {
        onProgress(processed / recordList.length);
        await this.yieldToMainThread();
      }
    }

    this.s.sortedTerms = null;
    return processed;
  }

  /** Finalize a table after all batches have been indexed via addRecordBatch(). */
  finalizeTable(tableId: string): void {
    const table = this.s.tables.get(tableId);
    if (table) table.seen = null;
    this.s.sortedTerms = null;
  }

  async addTable(
    tableId: string,
    tableName: string,
    fieldMetaList: IndexFieldMeta[],
    recordList: IndexRecord[],
    onProgress?: (progress: number) => void
  ): Promise<void> {
    this.beginTable(tableId, tableName, fieldMetaList);
    await this.addRecordBatch(tableId, recordList, fieldMetaList, onProgress);
    this.finalizeTable(tableId);
  }

  private valueToString(
    value: unknown,
    fieldType: number,
    table: TableState,
    fieldIndex: number
  ): string {
    if (value === null || value === undefined) return '';

    if (fieldType === TYPE_CHECKBOX) {
      return value ? this.checkedLabel : this.uncheckedLabel;
    }

    const datePattern = table.fieldDateFormats[fieldIndex];
    if (datePattern !== undefined) {
      if (typeof value === 'number') {
        return formatTimestamp(value, datePattern);
      }
      // Date-valued formulas can also arrive wrapped as single-element number arrays.
      if (
        fieldType === TYPE_FORMULA &&
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === 'number')
      ) {
        return value
          .map((v) => formatTimestamp(v as number, datePattern))
          .filter(Boolean)
          .join(' ');
      }
    }

    return extractText(value);
  }

  /** Stores a cell and posts its terms. Cells with no searchable term are dropped. */
  private addCell(tableIdx: number, recordIdx: number, fieldIdx: number, text: string): void {
    const s = this.s;
    const cellId = s.cellText.length;
    const folded = foldText(text);
    const table = getClassTable();
    const n = folded.length;

    let any = false;
    let stretchStart = -1;

    for (let i = 0; i < n; ) {
      const c = folded.charCodeAt(i);
      let cp = c;
      let step = 1;
      let cls: number;

      if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
        const d = folded.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          cp = ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000;
          step = 2;
          cls = classifyAstral(cp);
        } else {
          cls = CLASS_OTHER;
        }
      } else {
        cls = table[c];
      }

      if (cls === CLASS_WORD) {
        if (stretchStart < 0) stretchStart = i;
      } else {
        if (stretchStart >= 0) {
          this.postLatin(folded.slice(stretchStart, i), cellId);
          stretchStart = -1;
          any = true;
        }
        if (cls === CLASS_CJK) {
          this.postCjk(cp, cellId);
          any = true;
        }
      }
      i += step;
    }

    if (stretchStart >= 0) {
      this.postLatin(folded.slice(stretchStart), cellId);
      any = true;
    }

    // Even a cell with only punctuation/symbols is skipped for inverted-index
    // memory compactness (regex searches scan indexed cells).
    if (!any) return;

    s.cellTable.push(tableIdx);
    s.cellRecord.push(recordIdx);
    s.cellField.push(fieldIdx);
    s.cellText.push(text);
  }

  private postLatin(term: string, cellId: number): void {
    const postings = this.s.latin.get(term);
    if (postings === undefined) {
      this.s.latin.set(term, [cellId]);
    } else if (postings[postings.length - 1] !== cellId) {
      this.growable(this.s.latin, term, postings).push(cellId);
    }
  }

  private postCjk(code: number, cellId: number): void {
    const postings = this.s.cjk.get(code);
    if (postings === undefined) {
      this.s.cjk.set(code, [cellId]);
    } else if (postings[postings.length - 1] !== cellId) {
      this.growable(this.s.cjk, code, postings).push(cellId);
    }
  }

  private growable<K>(map: Map<K, Postings>, key: K, postings: Postings): number[] {
    if (Array.isArray(postings)) return postings;
    const thawed = Array.from(postings);
    map.set(key, thawed);
    return thawed;
  }

  /**
   * Packs long posting lists into typed arrays: half the memory (4 bytes per
   * entry instead of 8) with no cost to search.
   */
  compact(): void {
    const pack = <K,>(map: Map<K, Postings>) => {
      for (const [key, list] of map) {
        if (Array.isArray(list) && list.length >= COMPACT_MIN_LENGTH) {
          map.set(key, Uint32Array.from(list));
        }
      }
    };

    pack(this.s.latin);
    pack(this.s.cjk);
  }

  // -------------------------------------------------------------------------
  // Searching
  // -------------------------------------------------------------------------

  search(query: string, maxResults = 200, options?: QueryOptions): SearchResult[] {
    return this.searchWithMeta(query, maxResults, options).results;
  }

  searchWithMeta(query: string, maxResults = 200, options: QueryOptions = {}): SearchResponse {
    const caseSensitive = Boolean(options.caseSensitive);
    const wholeWord = Boolean(options.wholeWord);
    const useRegex = Boolean(options.regex);
    const useFuzzy = !useRegex && Boolean(options.fuzzy);

    if (useRegex) {
      if (query.length === 0) return { results: [], totalMatches: 0, totalTables: 0 };
      return this.searchRegex(query, maxResults, caseSensitive, wholeWord);
    }

    if (!query.trim()) {
      return { results: [], totalMatches: 0, totalTables: 0 };
    }

    if (useFuzzy) {
      return this.searchFuzzy(query, maxResults, caseSensitive, wholeWord);
    }

    return this.searchLiteral(query, maxResults, caseSensitive, wholeWord);
  }

  // -------------------------------------------------------------------------
  // Mode 1: Literal / Prefix / Case-Sensitive / Whole-Word
  // -------------------------------------------------------------------------

  private extractQueryPairs(
    query: string,
    caseSensitive: boolean,
    wholeWord: boolean
  ): { foldedPhrases: string[]; matchPhrases: string[] } {
    const foldedQuery = foldText(query);
    const slices = wordRunSlices(foldedQuery, wholeWord);
    const seen = new Set<string>();
    const foldedPhrases: string[] = [];
    const matchPhrases: string[] = [];

    for (const { start, end } of slices) {
      const matchPhrase = caseSensitive ? query.slice(start, end) : foldedQuery.slice(start, end);
      if (!seen.has(matchPhrase)) {
        seen.add(matchPhrase);
        foldedPhrases.push(foldedQuery.slice(start, end));
        matchPhrases.push(matchPhrase);
      }
    }

    return { foldedPhrases, matchPhrases };
  }

  private searchLiteral(
    query: string,
    maxResults: number,
    caseSensitive: boolean,
    wholeWord: boolean
  ): SearchResponse {
    const { foldedPhrases, matchPhrases } = this.extractQueryPairs(query, caseSensitive, wholeWord);
    if (matchPhrases.length === 0) {
      return { results: [], totalMatches: 0, totalTables: 0 };
    }

    // AND across phrases, evaluated on the inverted index's folded posting
    // lists — a guaranteed superset of case-sensitive and whole-word hits.
    const lists: ArrayLike<number>[] = [];
    for (const fp of foldedPhrases) {
      const postings = this.lookupPhrase(fp, wholeWord);
      if (postings.length === 0) return { results: [], totalMatches: 0, totalTables: 0 };
      lists.push(postings);
    }
    lists.sort((a, b) => a.length - b.length);

    let candidates: ArrayLike<number> = lists[0];
    for (let i = 1; i < lists.length && candidates.length > 0; i++) {
      candidates = this.intersectSorted(candidates, lists[i]);
    }
    if (candidates.length === 0) {
      return { results: [], totalMatches: 0, totalTables: 0 };
    }

    const s = this.s;
    const table = getClassTable();
    const startsCjk = matchPhrases.map((p) => this.startsWithCjk(p, table));
    const needsFold = !caseSensitive && !matchPhrases.every(matchesUnfolded);

    const keys = new Float64Array(candidates.length);
    const matchedTables = new Set<number>();
    let kept = 0;

    // Fast path for the hottest CJK query: a single character without wholeWord.
    const singleUnit =
      !wholeWord &&
      matchPhrases.length === 1 &&
      matchPhrases[0].length === 1 &&
      startsCjk[0] &&
      !needsFold
        ? matchPhrases[0].charCodeAt(0)
        : -1;

    for (let i = 0; i < candidates.length; i++) {
      const cellId = candidates[i];
      const tblIdx = s.cellTable[cellId];
      if (s.tableList[tblIdx].dead) continue;

      const text = s.cellText[cellId];
      let count: number;

      if (singleUnit >= 0) {
        count = 0;
        for (let p = 0, len = text.length; p < len; p++) {
          if (text.charCodeAt(p) === singleUnit) count++;
        }
      } else {
        count = this.scanMatches(
          needsFold ? foldText(text) : text,
          matchPhrases,
          startsCjk,
          wholeWord,
          null
        );
      }
      if (count === 0) continue;

      matchedTables.add(tblIdx);
      keys[kept++] = (MAX_RANK_COUNT - Math.min(count, MAX_RANK_COUNT)) * CELL_ID_RADIX + cellId;
    }

    if (kept === 0) return { results: [], totalMatches: 0, totalTables: 0 };

    const ranked = keys.subarray(0, kept).sort();
    const limit = Math.max(0, Math.min(kept, maxResults));
    const results: SearchResult[] = [];

    for (let k = 0; k < limit; k++) {
      const key = ranked[k];
      const cellId = key - Math.floor(key / CELL_ID_RADIX) * CELL_ID_RADIX;
      const text = s.cellText[cellId];
      const owner = s.tableList[s.cellTable[cellId]];
      const fieldIdx = s.cellField[cellId];

      const matches: Range[] = [];
      this.scanMatches(
        needsFold ? foldText(text) : text,
        matchPhrases,
        startsCjk,
        wholeWord,
        matches
      );

      results.push({
        tableId: owner.tableId,
        tableName: owner.tableName,
        recordId: owner.recordIds[s.cellRecord[cellId]],
        fieldId: owner.fieldIds[fieldIdx],
        fieldName: owner.fieldNames[fieldIdx],
        fieldType: owner.fieldTypes[fieldIdx],
        value: text,
        matches,
      });
    }

    return {
      results,
      totalMatches: kept,
      totalTables: matchedTables.size,
    };
  }

  // -------------------------------------------------------------------------
  // Mode 2: Regular Expression
  // -------------------------------------------------------------------------

  private searchRegex(
    pattern: string,
    maxResults: number,
    caseSensitive: boolean,
    wholeWord: boolean
  ): SearchResponse {
    const compiled = compileSearchRegex(pattern, caseSensitive);
    if (!compiled.regex) {
      return {
        results: [],
        totalMatches: 0,
        totalTables: 0,
        regexError:
          compiled.errorKind === 'unsafe'
            ? 'unsafe'
            : compiled.errorMessage || 'Invalid regular expression',
      };
    }

    const regex = compiled.regex;
    const s = this.s;
    const table = getClassTable();
    const totalCells = s.cellText.length;
    const keys: number[] = [];
    const matchedTables = new Set<number>();
    const deadline = Date.now() + REGEX_TIME_BUDGET_MS;

    for (let cellId = 0; cellId < totalCells; cellId++) {
      if ((cellId & 127) === 127 && Date.now() > deadline) {
        break;
      }

      const tblIdx = s.cellTable[cellId];
      if (s.tableList[tblIdx].dead) continue;

      const text = s.cellText[cellId];
      const count = this.scanRegexCell(text, regex, wholeWord, table, null);
      if (count === 0) continue;

      matchedTables.add(tblIdx);
      keys.push((MAX_RANK_COUNT - Math.min(count, MAX_RANK_COUNT)) * CELL_ID_RADIX + cellId);
    }

    const kept = keys.length;
    if (kept === 0) return { results: [], totalMatches: 0, totalTables: 0 };

    const ranked = Float64Array.from(keys).sort();
    const limit = Math.max(0, Math.min(kept, maxResults));
    const results: SearchResult[] = [];

    for (let k = 0; k < limit; k++) {
      const key = ranked[k];
      const cellId = key - Math.floor(key / CELL_ID_RADIX) * CELL_ID_RADIX;
      const text = s.cellText[cellId];
      const owner = s.tableList[s.cellTable[cellId]];
      const fieldIdx = s.cellField[cellId];

      const matches: Range[] = [];
      this.scanRegexCell(text, regex, wholeWord, table, matches);

      results.push({
        tableId: owner.tableId,
        tableName: owner.tableName,
        recordId: owner.recordIds[s.cellRecord[cellId]],
        fieldId: owner.fieldIds[fieldIdx],
        fieldName: owner.fieldNames[fieldIdx],
        fieldType: owner.fieldTypes[fieldIdx],
        value: text,
        matches,
      });
    }

    return {
      results,
      totalMatches: kept,
      totalTables: matchedTables.size,
    };
  }

  private scanRegexCell(
    text: string,
    regex: RegExp,
    wholeWord: boolean,
    table: Uint8Array,
    out: Range[] | null
  ): number {
    regex.lastIndex = 0;
    let count = 0;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(text)) !== null) {
      const pos = m.index;
      const len = m[0].length;

      // Guard against zero-length matches (`^`, `a*`, lookaheads) spinning forever.
      if (len === 0) {
        if (pos >= text.length) break;
        const c = text.charCodeAt(pos);
        const step =
          c >= 0xd800 &&
          c <= 0xdbff &&
          pos + 1 < text.length &&
          text.charCodeAt(pos + 1) >= 0xdc00 &&
          text.charCodeAt(pos + 1) <= 0xdfff
            ? 2
            : 1;
        regex.lastIndex = pos + step;
        continue;
      }

      if (!wholeWord || hasWordBoundary(text, pos, pos + len, table)) {
        count++;
        if (out) out.push({ start: pos, length: len });
      }
    }

    if (out && out.length > 1) sortAndDedupRanges(out);
    return count;
  }

  // -------------------------------------------------------------------------
  // Mode 3: Fuzzy Match (Damerau-Levenshtein + CJK gapped/edit matching)
  // -------------------------------------------------------------------------

  private searchFuzzy(
    query: string,
    maxResults: number,
    caseSensitive: boolean,
    wholeWord: boolean
  ): SearchResponse {
    const { foldedPhrases, matchPhrases } = this.extractQueryPairs(query, caseSensitive, wholeWord);
    if (matchPhrases.length === 0) {
      return { results: [], totalMatches: 0, totalTables: 0 };
    }

    const lists: ArrayLike<number>[] = [];
    for (const fp of foldedPhrases) {
      const postings = this.lookupFuzzyPhrase(fp, wholeWord);
      if (postings.length === 0) return { results: [], totalMatches: 0, totalTables: 0 };
      lists.push(postings);
    }
    lists.sort((a, b) => a.length - b.length);

    let candidates: ArrayLike<number> = lists[0];
    for (let i = 1; i < lists.length && candidates.length > 0; i++) {
      candidates = this.intersectSorted(candidates, lists[i]);
    }
    if (candidates.length === 0) {
      return { results: [], totalMatches: 0, totalTables: 0 };
    }

    const s = this.s;
    const table = getClassTable();
    const needsFold = !caseSensitive && !matchPhrases.every(matchesUnfolded);
    const specs = matchPhrases.map((p) => {
      const cps = toCodePoints(p);
      const hasCjk = this.containsCjk(p, table);
      return {
        phrase: p,
        cps,
        hasCjk,
        startsCjk: this.startsWithCjk(p, table),
        maxEdits: maxFuzzyEdits(cps.length),
      };
    });

    const keys = new Float64Array(candidates.length);
    const matchedTables = new Set<number>();
    let kept = 0;

    for (let i = 0; i < candidates.length; i++) {
      const cellId = candidates[i];
      const tblIdx = s.cellTable[cellId];
      if (s.tableList[tblIdx].dead) continue;

      const text = s.cellText[cellId];
      const scanText = needsFold ? foldText(text) : text;
      const hit = this.scanFuzzyCell(scanText, specs, wholeWord, table, null);
      if (!hit) continue;

      matchedTables.add(tblIdx);
      const rankBucket = hit.tier * FUZZY_TIER_SHIFT + Math.min(hit.count, FUZZY_MAX_COUNT);
      keys[kept++] = (MAX_RANK_COUNT - rankBucket) * CELL_ID_RADIX + cellId;
    }

    if (kept === 0) return { results: [], totalMatches: 0, totalTables: 0 };

    const ranked = keys.subarray(0, kept).sort();
    const limit = Math.max(0, Math.min(kept, maxResults));
    const results: SearchResult[] = [];

    for (let k = 0; k < limit; k++) {
      const key = ranked[k];
      const cellId = key - Math.floor(key / CELL_ID_RADIX) * CELL_ID_RADIX;
      const text = s.cellText[cellId];
      const owner = s.tableList[s.cellTable[cellId]];
      const fieldIdx = s.cellField[cellId];

      const matches: Range[] = [];
      this.scanFuzzyCell(needsFold ? foldText(text) : text, specs, wholeWord, table, matches);

      results.push({
        tableId: owner.tableId,
        tableName: owner.tableName,
        recordId: owner.recordIds[s.cellRecord[cellId]],
        fieldId: owner.fieldIds[fieldIdx],
        fieldName: owner.fieldNames[fieldIdx],
        fieldType: owner.fieldTypes[fieldIdx],
        value: text,
        matches,
      });
    }

    return {
      results,
      totalMatches: kept,
      totalTables: matchedTables.size,
    };
  }

  /**
   * Retrieves candidate cell ids for one folded query phrase under fuzzy rules,
   * using the inverted index rather than scanning every cell in the base.
   */
  private lookupFuzzyPhrase(phrase: string, wholeWord: boolean): ArrayLike<number> {
    const parts = splitRun(phrase);
    if (parts.length === 0) return EMPTY;

    // Pure single Latin word: scan the unique term dictionary with length +
    // 32-bit character-mask prefiltering, then union matching posting lists.
    if (parts.length === 1 && typeof parts[0] === 'string' && !phrase.includes('_')) {
      return this.getFuzzyLatinPostings(parts[0], wholeWord);
    }

    // Phrase with CJK (or compound parts):
    // - Exact/gapped matches contain *all* parts.
    // - A phrase of >=3 parts with <=1 edit can miss at most 1 part (by the
    //   pigeonhole principle, >= m-1 parts must still appear in the cell).
    const partLists: Array<ArrayLike<number>> = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let postings: ArrayLike<number> | undefined;
      if (typeof part === 'number') {
        postings = this.s.cjk.get(part);
      } else {
        postings = this.getFuzzyLatinPostings(part, wholeWord);
      }
      partLists.push(postings ?? EMPTY);
    }

    const totalParts = partLists.length;
    const allowMissingOne = totalParts >= 3;

    if (!allowMissingOne) {
      for (const l of partLists) if (l.length === 0) return EMPTY;
      const sorted = partLists.slice().sort((a, b) => a.length - b.length);
      let ids: ArrayLike<number> = sorted[0];
      for (let i = 1; i < sorted.length && ids.length > 0; i++) {
        ids = this.intersectSorted(ids, sorted[i]);
      }
      return ids;
    }

    // Pick up to 5 rarest parts (keeps leave-one-out intersections tiny even on
    // very long CJK sentences while remaining a mathematical superset for <=1
    // edit when totalParts <= 5; for >=5 parts with <=2 edits, picking 5 parts
    // and requiring >= 3 of 5 still holds by pigeonhole: 5 - 2 = 3!).
    const cpsCount = toCodePoints(phrase).length;
    const maxEdits = maxFuzzyEdits(cpsCount);
    const sampleSize = Math.min(totalParts, maxEdits === 2 ? 5 : 4);
    const sampled = partLists
      .slice()
      .sort((a, b) => a.length - b.length)
      .slice(0, sampleSize);

    // Must match at least `required = sampleSize - maxEdits` of the sampled lists.
    const required = Math.max(1, sampleSize - maxEdits);
    return this.atLeastKOfN(sampled, required);
  }

  /** Cell ids that appear in at least `k` of the sorted posting `lists`. */
  private atLeastKOfN(lists: ArrayLike<number>[], k: number): ArrayLike<number> {
    const nonEmpty = lists.filter((l) => l.length > 0);
    if (nonEmpty.length < k) return EMPTY;

    if (k === nonEmpty.length) {
      let acc = nonEmpty[0];
      for (let i = 1; i < nonEmpty.length && acc.length > 0; i++) {
        acc = this.intersectSorted(acc, nonEmpty[i]);
      }
      return acc;
    }

    // Total elements across the sampled rarest lists: pack, sort once, and emit
    // cell ids whose multiplicity >= k. Fast, exact, zero combinatorial blowup!
    let total = 0;
    for (const l of nonEmpty) total += l.length;
    if (total === 0) return EMPTY;

    const merged = new Uint32Array(total);
    let offset = 0;
    for (const l of nonEmpty) {
      merged.set(l, offset);
      offset += l.length;
    }
    merged.sort();

    const out: number[] = [];
    let i = 0;
    while (i < merged.length) {
      const id = merged[i];
      let run = 1;
      while (i + run < merged.length && merged[i + run] === id) run++;
      if (run >= k) out.push(id);
      i += run;
    }
    return out;
  }

  private getFuzzyLatinPostings(word: string, wholeWord: boolean): ArrayLike<number> {
    const qCps = toCodePoints(word);
    const maxEdits = maxFuzzyEdits(qCps.length);

    if (maxEdits === 0) {
      if (wholeWord) return this.s.latin.get(word) ?? EMPTY;
      return this.getPrefixPostings(word);
    }

    const qLen = qCps.length;
    const qMask = charMask(word);
    const matchedLists: Postings[] = [];
    let total = 0;

    for (const [term, postings] of this.s.latin) {
      if (wholeWord) {
        if (Math.abs(term.length - word.length) > maxEdits * 2) continue;
        if (popcount32(qMask & ~charMask(term)) > maxEdits) continue;
      } else {
        if (term.length < qLen - maxEdits) continue;
        if (term.startsWith(word)) {
          matchedLists.push(postings);
          total += postings.length;
          continue;
        }
        if (popcount32(qMask & ~charMask(term, (qLen + maxEdits) * 2)) > maxEdits) continue;
      }

      const tCps = toCodePoints(term);
      if (fuzzyMatchCodePoints(qCps, tCps, maxEdits, wholeWord) !== null) {
        matchedLists.push(postings);
        total += postings.length;
      }
    }

    if (matchedLists.length === 0) return EMPTY;
    if (matchedLists.length === 1) return matchedLists[0];

    const merged = new Uint32Array(total);
    let offset = 0;
    for (const list of matchedLists) {
      merged.set(list, offset);
      offset += list.length;
    }
    merged.sort();

    let w = 0;
    for (let r = 0; r < merged.length; r++) {
      if (r === 0 || merged[r] !== merged[r - 1]) merged[w++] = merged[r];
    }
    return merged.subarray(0, w);
  }

  private scanFuzzyCell(
    text: string,
    specs: Array<{
      phrase: string;
      cps: number[];
      hasCjk: boolean;
      startsCjk: boolean;
      maxEdits: number;
    }>,
    wholeWord: boolean,
    table: Uint8Array,
    out: Range[] | null
  ): { tier: number; count: number } | null {
    let worstPhraseTier = 2;
    let totalCount = 0;
    let decodedCache: DecodedString | null = null;
    let wordSlicesCache: RunSlice[] | null = null;

    for (let p = 0; p < specs.length; p++) {
      const spec = specs[p];
      let phraseBestTier = -1;
      let phraseCount = 0;

      // Step 1: check exact / prefix matches first (tier 2 — highest priority).
      let pos = text.indexOf(spec.phrase);
      while (pos !== -1) {
        const end = pos + spec.phrase.length;
        const ok = wholeWord
          ? hasWordBoundary(text, pos, end, table)
          : pos === 0 || spec.startsCjk || classBefore(text, pos, table) !== CLASS_WORD;
        if (ok) {
          phraseBestTier = 2;
          phraseCount++;
          if (out) out.push({ start: pos, length: spec.phrase.length });
        }
        pos = text.indexOf(spec.phrase, pos + 1);
      }

      // Step 2: if not pure-exact (or to also highlight fuzzy hits when none
      // matched literally), check approximate word / CJK matches.
      if (phraseCount === 0) {
        if (!spec.hasCjk && !spec.phrase.includes('_')) {
          if (spec.maxEdits > 0) {
            if (!wordSlicesCache) wordSlicesCache = this.extractWordSpans(text, table);
            for (const span of wordSlicesCache) {
              if (wholeWord && !hasWordBoundary(text, span.start, span.end, table)) continue;
              const wordStr = text.slice(span.start, span.end);
              const decodedWord = decodeCodePoints(wordStr);
              const m = fuzzyMatchCodePoints(
                spec.cps,
                decodedWord.cps,
                spec.maxEdits,
                wholeWord
              );
              if (m !== null) {
                const t = m.edits <= 1 ? 1 : 0;
                if (t > phraseBestTier) phraseBestTier = t;
                phraseCount++;
                if (out) {
                  out.push({
                    start: span.start,
                    length: decodedWord.offsets[m.matchedLen],
                  });
                }
              }
            }
          }
        } else {
          // CJK or underscore-compound fuzzy scan
          if (!decodedCache) decodedCache = decodeCodePoints(text);
          const cjkHit = this.scanFuzzyCjkPhrase(spec.cps, spec.maxEdits, text, decodedCache, wholeWord, table, out);
          if (cjkHit) {
            phraseBestTier = cjkHit.tier;
            phraseCount += cjkHit.count;
          }
        }
      }

      if (phraseCount === 0 || phraseBestTier < 0) {
        if (out) out.length = 0;
        return null;
      }

      if (phraseBestTier < worstPhraseTier) worstPhraseTier = phraseBestTier;
      totalCount += phraseCount;
    }

    if (out && out.length > 1) sortAndDedupRanges(out);
    return { tier: worstPhraseTier, count: totalCount };
  }

  /** Maximal `CLASS_WORD` spans within `text`. */
  private extractWordSpans(text: string, table: Uint8Array): RunSlice[] {
    const spans: RunSlice[] = [];
    const n = text.length;
    let start = -1;

    for (let i = 0; i < n; ) {
      const c = text.charCodeAt(i);
      let step = 1;
      let cls: number;
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
        const d = text.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          cls = classifyAstral(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000);
          step = 2;
        } else {
          cls = CLASS_OTHER;
        }
      } else {
        cls = table[c];
      }

      if (cls === CLASS_WORD) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        spans.push({ start, end: i });
        start = -1;
      }
      i += step;
    }

    if (start >= 0) spans.push({ start, end: n });
    return spans;
  }

  private scanFuzzyCjkPhrase(
    qCps: number[],
    maxEdits: number,
    text: string,
    decoded: DecodedString,
    wholeWord: boolean,
    table: Uint8Array,
    out: Range[] | null
  ): { tier: number; count: number } | null {
    const { cps, offsets } = decoded;
    const n = cps.length;
    const m = qCps.length;
    if (n === 0 || m === 0) return null;

    // 1. Edit-distance window scan (for phrases of length >= 3, where maxEdits >= 1).
    if (maxEdits > 0) {
      let bestTier = -1;
      let count = 0;
      let nextAllowedStart = 0;

      if (wholeWord) {
        // Check maximal whole-word runs in `decoded`.
        let i = 0;
        while (i < n) {
          const uStart = offsets[i];
          if (classAt(text, uStart, table) === CLASS_OTHER && !isUnderscoreCode(cps[i])) {
            i++;
            continue;
          }
          let j = i + 1;
          while (j < n && !hasWordBoundary(text, uStart, offsets[j], table)) j++;
          const uEnd = offsets[j];
          if (hasWordBoundary(text, uStart, uEnd, table)) {
            const match = fuzzyMatchCodePoints(qCps, cps.slice(i, j), maxEdits, true);
            if (match !== null) {
              const t = match.edits <= 1 ? 1 : 0;
              if (t > bestTier) bestTier = t;
              count++;
              if (out) out.push({ start: uStart, length: uEnd - uStart });
            }
          }
          i = j;
        }
      } else {
        const qSet = new Set(qCps);
        const maxWin = m + maxEdits;

        for (let i = 0; i < n; i++) {
          if (i < nextAllowedStart) continue;
          // At least one of the first `maxEdits + 1` code points of a valid
          // window must belong to `qSet`; skip dead regions cheaply.
          let nearHit = false;
          for (let look = 0; look <= maxEdits && i + look < n; look++) {
            if (qSet.has(cps[i + look])) {
              nearHit = true;
              break;
            }
          }
          if (!nearHit) continue;

          // Ensure window doesn't open or close on whitespace/punctuation.
          if (classAt(text, offsets[i], table) === CLASS_OTHER && !isUnderscoreCode(cps[i])) {
            continue;
          }

          const sliceEnd = Math.min(n, i + maxWin);
          const windowCps = cps.slice(i, sliceEnd);
          const match = fuzzyMatchCodePoints(qCps, windowCps, maxEdits, false, true);
          if (match !== null) {
            const uStart = offsets[i];
            const uEnd = offsets[i + match.matchedLen];
            // Trim any trailing punctuation included by insertion budget.
            if (classBefore(text, uEnd, table) === CLASS_OTHER && !isUnderscoreCode(text.charCodeAt(uEnd - 1))) {
              continue;
            }
            const t = match.edits <= 1 ? 1 : 0;
            if (t > bestTier) bestTier = t;
            count++;
            if (out) out.push({ start: uStart, length: uEnd - uStart });
            nextAllowedStart = i + match.matchedLen;
          }
        }
      }

      if (count > 0) return { tier: bestTier, count };
    }

    // 2. Compact gapped subsequence (when !wholeWord and length >= 2, e.g.
    //    "北大" -> "北京大学", "서울시" -> "서울특별시"). Gaps cannot cross punctuation/spaces.
    if (!wholeWord && m >= 2) {
      let count = 0;
      let i = 0;
      while (i <= n - m) {
        if (cps[i] !== qCps[0]) {
          i++;
          continue;
        }
        const endCp = this.matchGappedFrom(qCps, cps, offsets, text, i, table);
        if (endCp > i) {
          count++;
          if (out) {
            out.push({
              start: offsets[i],
              length: offsets[endCp] - offsets[i],
            });
          }
          i = endCp;
        } else {
          i++;
        }
      }
      if (count > 0) return { tier: 0, count };
    }

    return null;
  }

  /**
   * Attempts to match `qCps[0..m)` starting at `cps[startIdx]` with at most
   * `MAX_CJK_GAP` contiguous word/CJK characters skipped between consecutive
   * query characters. Returns the exclusive end code-point index, or -1.
   */
  private matchGappedFrom(
    qCps: number[],
    cps: number[],
    offsets: number[],
    text: string,
    startIdx: number,
    table: Uint8Array
  ): number {
    let pos = startIdx;
    for (let k = 1; k < qCps.length; k++) {
      const target = qCps[k];
      let foundAt = -1;
      const limit = Math.min(cps.length - 1, pos + 1 + MAX_CJK_GAP);

      for (let cand = pos + 1; cand <= limit; cand++) {
        // Every skipped character before `cand` (and `cand` itself) must be a
        // word/CJK character — never jump across spaces, commas or periods.
        const cls = classAt(text, offsets[cand], table);
        if (cls === CLASS_OTHER) break;
        if (cps[cand] === target) {
          foundAt = cand;
          break;
        }
      }

      if (foundAt < 0) return -1;
      pos = foundAt;
    }
    return pos + 1;
  }

  // -------------------------------------------------------------------------
  // Shared index lookup & scan primitives
  // -------------------------------------------------------------------------

  private startsWithCjk(phrase: string, table: Uint8Array): boolean {
    const c = phrase.charCodeAt(0);
    if (c >= 0xd800 && c <= 0xdbff && phrase.length > 1) {
      const d = phrase.charCodeAt(1);
      return classifyAstral(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000) === CLASS_CJK;
    }
    return table[c] === CLASS_CJK;
  }

  private containsCjk(phrase: string, table: Uint8Array): boolean {
    for (let i = 0; i < phrase.length; ) {
      const c = phrase.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < phrase.length) {
        const d = phrase.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          if (classifyAstral(((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000) === CLASS_CJK) {
            return true;
          }
          i += 2;
          continue;
        }
      }
      if (table[c] === CLASS_CJK) return true;
      i++;
    }
    return false;
  }

  /**
   * Cell ids that could contain `phrase`. When `wholeWord` is false, a trailing
   * non-CJK part uses prefix lookup so typing "app" or "水晶ba" surfaces words
   * mid-typing; when `wholeWord` is true, non-CJK parts require exact terms.
   */
  private lookupPhrase(phrase: string, wholeWord = false): ArrayLike<number> {
    const parts = splitRun(phrase);
    if (parts.length === 0) return EMPTY;

    const lists: ArrayLike<number>[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let postings: ArrayLike<number> | undefined;

      if (typeof part === 'number') {
        postings = this.s.cjk.get(part);
      } else if (!wholeWord && i === parts.length - 1) {
        postings = this.getPrefixPostings(part);
      } else {
        postings = this.s.latin.get(part);
      }

      if (!postings || postings.length === 0) return EMPTY;
      lists.push(postings);
    }

    if (lists.length === 1) return lists[0];

    lists.sort((a, b) => a.length - b.length);
    let ids: ArrayLike<number> = lists[0];
    for (let i = 1; i < lists.length && ids.length > 0; i++) {
      ids = this.intersectSorted(ids, lists[i]);
    }
    return ids;
  }

  private getSortedTerms(): string[] {
    if (this.s.sortedTerms === null) {
      this.s.sortedTerms = Array.from(this.s.latin.keys()).sort();
    }
    return this.s.sortedTerms;
  }

  private lowerBound(terms: string[], target: string): number {
    let lo = 0;
    let hi = terms.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (terms[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private getPrefixPostings(prefix: string): ArrayLike<number> {
    const terms = this.getSortedTerms();
    const lists: Postings[] = [];
    let total = 0;

    for (let i = this.lowerBound(terms, prefix); i < terms.length; i++) {
      const term = terms[i];
      if (!term.startsWith(prefix)) break;
      const postings = this.s.latin.get(term);
      if (postings) {
        lists.push(postings);
        total += postings.length;
      }
    }

    if (lists.length === 0) return EMPTY;
    if (lists.length === 1) return lists[0];

    const merged = new Uint32Array(total);
    let offset = 0;
    for (const list of lists) {
      merged.set(list, offset);
      offset += list.length;
    }
    merged.sort();

    let w = 0;
    for (let r = 0; r < merged.length; r++) {
      if (r === 0 || merged[r] !== merged[r - 1]) merged[w++] = merged[r];
    }
    return merged.subarray(0, w);
  }

  private intersectSorted(a: ArrayLike<number>, b: ArrayLike<number>): ArrayLike<number> {
    const out: number[] = [];
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
      const x = a[i];
      const y = b[j];
      if (x === y) {
        out.push(x);
        i++;
        j++;
      } else if (x < y) {
        i++;
      } else {
        j++;
      }
    }

    return out;
  }

  /**
   * Counts the places every phrase occurs in `text`, optionally collecting
   * them. Returns 0 unless *every* phrase has at least one valid occurrence.
   */
  private scanMatches(
    text: string,
    phrases: string[],
    startsCjk: boolean[],
    wholeWord: boolean,
    out: Range[] | null
  ): number {
    const table = getClassTable();
    let total = 0;

    for (let p = 0; p < phrases.length; p++) {
      const token = phrases[p];
      let found = 0;
      let pos = text.indexOf(token);

      while (pos !== -1) {
        const valid = wholeWord
          ? hasWordBoundary(text, pos, pos + token.length, table)
          : pos === 0 || startsCjk[p] || classBefore(text, pos, table) !== CLASS_WORD;

        if (valid) {
          found++;
          if (out) out.push({ start: pos, length: token.length });
        }
        pos = text.indexOf(token, pos + 1);
      }

      if (found === 0) {
        if (out) out.length = 0;
        return 0;
      }
      total += found;
    }

    if (out && out.length > 1) sortAndDedupRanges(out);
    return total;
  }

  private yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  groupByTable(results: SearchResult[]): Map<string, SearchResult[]> {
    const grouped = new Map<string, SearchResult[]>();

    for (const result of results) {
      const existing = grouped.get(result.tableId);
      if (existing) {
        existing.push(result);
      } else {
        grouped.set(result.tableId, [result]);
      }
    }

    return grouped;
  }
}

export const searchIndex = new SearchIndex();
