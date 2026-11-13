import React, { useMemo } from 'react';
import type { SearchResult } from '../search/SearchIndex';
import { buildPreview, type MatchRange } from '../search/preview';

interface SearchResultItemProps {
  result: SearchResult;
  onClick: (result: SearchResult) => void;
}

const VALUE_PREVIEW_LIMIT = 200;

function highlightText(text: string, matches: MatchRange[]): React.ReactNode {
  if (matches.length === 0) return text;

  const sorted = [...matches]
    .filter((m) => m.length > 0 && m.start >= 0 && m.start < text.length)
    .sort((a, b) => a.start - b.start || b.length - a.length);
  if (sorted.length === 0) return text;

  // Merge overlapping highlight spans so e.g. "ああ" in "あああ" or prefix+full
  // token matches highlight the entire matched extent without dropping tails.
  const merged: Array<{ start: number; end: number }> = [];
  for (const m of sorted) {
    const start = m.start;
    const end = Math.min(text.length, m.start + m.length);
    const prev = merged[merged.length - 1];
    if (prev && start < prev.end) {
      if (end > prev.end) prev.end = end;
    } else {
      merged.push({ start, end });
    }
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (let i = 0; i < merged.length; i++) {
    const { start, end } = merged[i];

    if (start > lastIndex) {
      parts.push(<span key={`text-${i}`}>{text.slice(lastIndex, start)}</span>);
    }

    parts.push(
      <mark key={`highlight-${i}`} className="search-highlight">
        {text.slice(start, end)}
      </mark>
    );

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push(<span key="text-end">{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

const SearchResultItemView: React.FC<SearchResultItemProps> = ({ result, onClick }) => {
  const preview = useMemo(
    () => buildPreview(result.value, result.matches, VALUE_PREVIEW_LIMIT),
    [result.value, result.matches]
  );

  return (
    <div
      className="search-result-item"
      onClick={() => onClick(result)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(result);
        }
      }}
    >
      <div className="search-result-header">
        <span className="search-result-field">{result.fieldName}</span>
      </div>
      <div className="search-result-value">
        {preview.truncatedStart && '…'}
        {highlightText(preview.text, preview.matches)}
        {preview.truncatedEnd && '…'}
      </div>
    </div>
  );
};

// Results re-render only when their own result object changes, not on every
// progress tick of the indexer.
export const SearchResultItem = React.memo(SearchResultItemView);
