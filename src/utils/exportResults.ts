import type { MatchRange, QueryOptions, SearchResult } from '../search/SearchIndex';

export interface ExportHeaders {
  sheet: string;
  field: string;
  recordId: string;
  matched: string;
  value: string;
}

export interface ExportMeta {
  query: string;
  options: QueryOptions;
  totalMatches: number;
  totalTables: number;
  exportedAt?: string;
}

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Extracts distinct matched substrings from `value` in order of appearance,
 * merging overlapping match spans so characters are never duplicated.
 */
export function extractMatchedText(value: string, matches: MatchRange[]): string {
  if (!value || !matches || matches.length === 0) return '';

  const valid = matches
    .filter((m) => m.length > 0 && m.start >= 0 && m.start < value.length)
    .map((m) => ({
      start: m.start,
      end: Math.min(value.length, m.start + m.length),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  if (valid.length === 0) return '';

  const merged: Array<{ start: number; end: number }> = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = valid[i];
    if (curr.start < prev.end) {
      if (curr.end > prev.end) prev.end = curr.end;
    } else {
      merged.push(curr);
    }
  }

  const seen = new Set<string>();
  const parts: string[] = [];
  for (const span of merged) {
    const piece = value.slice(span.start, span.end);
    if (piece && !seen.has(piece)) {
      seen.add(piece);
      parts.push(piece);
    }
  }
  return parts.join(' | ');
}

function escapeCsvCell(cell: string): string {
  if (/[",\r\n]/.test(cell) || /^\s|\s$/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function escapeTsvCell(cell: string): string {
  if (/[\t"\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Formats search results as RFC-4180 CSV with a leading UTF-8 BOM (`\uFEFF`)
 * so Excel opens CJK, Cyrillic, Thai, and Indic characters cleanly.
 */
export function formatResultsAsCsv(results: SearchResult[], headers: ExportHeaders): string {
  const rows: string[] = [
    [headers.sheet, headers.field, headers.recordId, headers.matched, headers.value]
      .map(escapeCsvCell)
      .join(','),
  ];

  for (const r of results) {
    const matched = extractMatchedText(r.value, r.matches);
    rows.push(
      [r.tableName, r.fieldName, r.recordId, matched, r.value].map(escapeCsvCell).join(',')
    );
  }

  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Formats search results as tab-separated values (no BOM) ready to paste
 * directly into Feishu Sheets, Bitable, Excel, or Google Sheets.
 */
export function formatResultsAsTsv(results: SearchResult[], headers: ExportHeaders): string {
  const rows: string[] = [
    [headers.sheet, headers.field, headers.recordId, headers.matched, headers.value]
      .map(escapeTsvCell)
      .join('\t'),
  ];

  for (const r of results) {
    const matched = extractMatchedText(r.value, r.matches);
    rows.push(
      [r.tableName, r.fieldName, r.recordId, matched, r.value].map(escapeTsvCell).join('\t')
    );
  }

  return rows.join('\r\n');
}

/** Formats search results and query metadata as indented JSON. */
export function formatResultsAsJson(results: SearchResult[], meta: ExportMeta): string {
  const payload = {
    query: meta.query,
    exportedAt: meta.exportedAt ?? new Date().toISOString(),
    options: {
      caseSensitive: Boolean(meta.options.caseSensitive),
      wholeWord: Boolean(meta.options.wholeWord),
      fuzzy: Boolean(meta.options.fuzzy),
      regex: Boolean(meta.options.regex),
    },
    totalMatches: meta.totalMatches,
    totalTables: meta.totalTables,
    results: results.map((r) => ({
      tableId: r.tableId,
      tableName: r.tableName,
      fieldId: r.fieldId,
      fieldName: r.fieldName,
      recordId: r.recordId,
      matchedText: extractMatchedText(r.value, r.matches),
      value: r.value,
      matches: r.matches.map((m) => ({ start: m.start, length: m.length })),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

/** Builds a cross-platform safe download filename without splitting surrogate pairs. */
export function buildExportFilename(
  query: string,
  ext: 'csv' | 'json',
  now: Date = new Date()
): string {
  const cleaned = query
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');

  const cps = Array.from(cleaned);
  let slug = cps.slice(0, 32).join('').replace(/[._]+$/g, '');
  if (!slug || WINDOWS_RESERVED_NAME.test(slug)) {
    slug = 'results';
  }

  const stamp =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-` +
    `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

  return `bitable-search-${slug}-${stamp}.${ext}`;
}

/** Triggers a browser file download via Blob URL. */
export function downloadTextFile(content: string, filename: string, mimeType: string): boolean {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return false;
  }
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies text to the clipboard, falling back to a temporary `<textarea>` when
 * iframe Permissions-Policy blocks `navigator.clipboard.writeText`.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback for sandboxed iframes.
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(copied);
  } catch {
    return false;
  }
}
