import React, { useEffect, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';

export type ExportFormat = 'csv' | 'json' | 'tsv';

interface ExportMenuProps {
  disabled?: boolean;
  onExport: (format: ExportFormat) => void;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ disabled = false, onExport }) => {
  useLocale();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const choose = (format: ExportFormat) => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div className="export-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="export-button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('export.title')}
        title={t('export.title')}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          className="export-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>{t('export.button')}</span>
        <span className="export-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="export-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="export-menu-item"
            onClick={() => choose('csv')}
          >
            {t('export.csv')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="export-menu-item"
            onClick={() => choose('json')}
          >
            {t('export.json')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="export-menu-item"
            onClick={() => choose('tsv')}
          >
            {t('export.copyTsv')}
          </button>
        </div>
      )}
    </div>
  );
};
