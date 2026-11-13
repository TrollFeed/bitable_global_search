export interface MatchRange {
  start: number;
  length: number;
}

export interface Preview {
  text: string;
  /** Match ranges relative to `text`. */
  matches: MatchRange[];
  /** Characters were cut from the front. */
  truncatedStart: boolean;
  /** Characters were cut from the end. */
  truncatedEnd: boolean;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Cuts a long cell value down to `limit` characters *around the first match*.
 *
 * Showing the head of the cell is wrong for search results: the match is often
 * far past it, which left a result with nothing highlighted and no hint of why
 * it matched. The window keeps `lead` characters of context before the first
 * match, and never splits a surrogate pair (which renders as "�").
 */
export function buildPreview(
  value: string,
  matches: MatchRange[],
  limit = 200,
  lead = 40
): Preview {
  if (value.length <= limit) {
    return { text: value, matches, truncatedStart: false, truncatedEnd: false };
  }

  let anchor = 0;
  if (matches.length > 0) {
    anchor = matches.reduce((min, m) => Math.min(min, m.start), matches[0].start);
  }

  let start = Math.max(0, anchor - lead);
  // Don't open on the second half of a pair.
  if (start > 0 && isLowSurrogate(value.charCodeAt(start))) start++;

  let end = Math.min(value.length, start + limit);
  // Don't close on the first half of a pair.
  if (end < value.length && isHighSurrogate(value.charCodeAt(end - 1))) end--;

  const text = value.slice(start, end);
  const clipped: MatchRange[] = [];

  for (const m of matches) {
    const from = Math.max(0, m.start - start);
    const to = Math.min(text.length, m.start + m.length - start);
    if (to > from) clipped.push({ start: from, length: to - from });
  }

  return {
    text,
    matches: clipped,
    truncatedStart: start > 0,
    truncatedEnd: end < value.length,
  };
}
