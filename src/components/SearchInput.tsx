import React, { useEffect, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { QueryOptions } from '../search/SearchIndex';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
  options?: QueryOptions;
  onOptionsChange?: (options: QueryOptions) => void;
  hasError?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  isLoading,
  onRefresh,
  options,
  onOptionsChange,
  hasError = false,
}) => {
  useLocale();

  // What the box shows can run ahead of the query we search for: while an IME
  // is composing, the box holds pre-edit text (pinyin, kana, half-built Hangul
  // syllables) that is not a query yet. Searching it on every keystroke flashes
  // results for strings the user never meant.
  const [text, setText] = useState(value);
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow changes made from outside (the clear button, a reset).
  useEffect(() => {
    if (!composing.current) setText(value);
  }, [value]);

  const opts: QueryOptions = options ?? {};

  const clearInput = () => {
    composing.current = false;
    setText('');
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className="search-controls">
      <div className="search-input-container">
        <div className="search-input-wrapper">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={`search-input${hasError ? ' has-error' : ''}`}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            aria-invalid={hasError ? 'true' : undefined}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              const isComposing =
                composing.current || (e.nativeEvent as InputEvent).isComposing === true;
              if (!isComposing) onChange(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !composing.current && text) {
                e.preventDefault();
                clearInput();
              }
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(e) => {
              composing.current = false;
              // Browsers disagree on whether the final input event arrives before
              // or after this one, so commit here as well.
              onChange(e.currentTarget.value);
            }}
            autoFocus
          />
          {text && (
            <button
              type="button"
              className="clear-button"
              onClick={clearInput}
              aria-label={t('search.clear')}
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          className="refresh-button"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label={t('refresh.label')}
          title={t('refresh.title')}
        >
          <svg
            className={`refresh-icon ${isLoading ? 'spinning' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>

      {onOptionsChange && (
        <div className="search-options-bar" role="group">
          <button
            type="button"
            className={`option-toggle${opts.caseSensitive ? ' active' : ''}`}
            aria-pressed={Boolean(opts.caseSensitive)}
            aria-label={t('mode.caseSensitive.title')}
            title={t('mode.caseSensitive.title')}
            onClick={() =>
              onOptionsChange({ ...opts, caseSensitive: !opts.caseSensitive })
            }
          >
            <span className="option-symbol" aria-hidden="true">
              Aa
            </span>
            <span className="option-label">{t('mode.caseSensitive.short')}</span>
          </button>

          <button
            type="button"
            className={`option-toggle${opts.wholeWord ? ' active' : ''}`}
            aria-pressed={Boolean(opts.wholeWord)}
            aria-label={t('mode.wholeWord.title')}
            title={t('mode.wholeWord.title')}
            onClick={() => onOptionsChange({ ...opts, wholeWord: !opts.wholeWord })}
          >
            <span className="option-symbol" aria-hidden="true">
              ab
            </span>
            <span className="option-label">{t('mode.wholeWord.short')}</span>
          </button>

          <button
            type="button"
            className={`option-toggle${opts.fuzzy ? ' active' : ''}`}
            aria-pressed={Boolean(opts.fuzzy)}
            aria-label={t('mode.fuzzy.title')}
            title={t('mode.fuzzy.title')}
            onClick={() => {
              const nextFuzzy = !opts.fuzzy;
              onOptionsChange({
                ...opts,
                fuzzy: nextFuzzy,
                regex: nextFuzzy ? false : opts.regex,
              });
            }}
          >
            <span className="option-symbol" aria-hidden="true">
              ≈
            </span>
            <span className="option-label">{t('mode.fuzzy.short')}</span>
          </button>

          <button
            type="button"
            className={`option-toggle${opts.regex ? ' active' : ''}`}
            aria-pressed={Boolean(opts.regex)}
            aria-label={t('mode.regex.title')}
            title={t('mode.regex.title')}
            onClick={() => {
              const nextRegex = !opts.regex;
              onOptionsChange({
                ...opts,
                regex: nextRegex,
                fuzzy: nextRegex ? false : opts.fuzzy,
              });
            }}
          >
            <span className="option-symbol" aria-hidden="true">
              .*
            </span>
            <span className="option-label">{t('mode.regex.short')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
