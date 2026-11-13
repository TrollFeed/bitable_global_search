import React, { useState } from 'react';
import { SearchResultItem } from './SearchResultItem';
import type { SearchResult } from '../search/SearchIndex';
import { t, useLocale } from '../i18n';

interface SearchResultGroupProps {
  tableId: string;
  tableName: string;
  results: SearchResult[];
  onResultClick: (result: SearchResult) => void;
}

const SearchResultGroupView: React.FC<SearchResultGroupProps> = ({
  tableName,
  results,
  onResultClick,
}) => {
  useLocale();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="search-result-group">
      <div
        className="search-result-group-header"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">
          ▶
        </span>
        <span className="table-name">{tableName}</span>
        <span className="result-count">{t('group.matches', { count: results.length })}</span>
      </div>
      {isExpanded && (
        <div className="search-result-list">
          {results.map((result, index) => (
            <SearchResultItem
              key={`${result.recordId}-${result.fieldId}-${index}`}
              result={result}
              onClick={onResultClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SearchResultGroup = React.memo(SearchResultGroupView);
