import React from 'react';
import { t, useLocale } from '../i18n';

interface IndexingProgressProps {
  currentTable: string;
  tableProgress: number;
  completedTables: number;
  totalTables: number;
  overall: number;
  recordsIndexed: number;
}

export const IndexingProgress: React.FC<IndexingProgressProps> = ({
  currentTable,
  tableProgress,
  completedTables,
  totalTables,
  overall,
  recordsIndexed,
}) => {
  useLocale();

  // The service reports true progress now: getRecordsByPage returns each
  // table's row count, so this is no longer an estimate that jumps at the end.
  const overallProgress = Math.round(overall * 100);
  const tablePercent = Math.round(tableProgress * 100);

  return (
    <div className="indexing-progress">
      <div className="indexing-progress-header">
        <span className="indexing-text">
          {currentTable
            ? t('status.indexingTable', { table: currentTable, rows: recordsIndexed })
            : t('status.indexingGeneric', { rows: recordsIndexed })}
        </span>
        {totalTables > 0 && (
          <span className="indexing-count">
            {completedTables} / {totalTables}
          </span>
        )}
      </div>
      <div
        className="progress-bar-container"
        role="progressbar"
        aria-label={t('progress.overall')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={overallProgress}
      >
        <div className="progress-bar overall" style={{ width: `${overallProgress}%` }}></div>
      </div>
      <div
        className="progress-bar-container table-progress"
        role="progressbar"
        aria-label={t('progress.table')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={tablePercent}
      >
        <div className="progress-bar table" style={{ width: `${tablePercent}%` }}></div>
      </div>
    </div>
  );
};
