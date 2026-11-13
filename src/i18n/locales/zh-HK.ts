import type { Messages } from '../messages';

// 繁體中文（香港）。術語沿用飛書／Lark 多維表格香港繁體介面：「數據表」、「欄」、「行」。
export const zhHK: Messages = {
  'app.title': '全局搜尋',

  'search.placeholder': '搜尋所有數據表…',
  'search.clear': '清除搜尋',
  'refresh.label': '重新整理索引',
  'refresh.title': '重新整理搜尋索引',

  'mode.caseSensitive.short': '大小寫',
  'mode.caseSensitive.title': '區分大小寫',
  'mode.wholeWord.short': '全字',
  'mode.wholeWord.title': '全字匹配',
  'mode.fuzzy.short': '模糊',
  'mode.fuzzy.title': '模糊匹配（容錯搜尋）',
  'mode.regex.short': '正則',
  'mode.regex.title': '使用正規表示式',

  'status.loadingCache': '正在從快取載入…',
  'status.indexingTable': ({ table, rows }, f) => `正在建立 ${table} 的索引…（${f.number(rows)} 行）`,
  'status.indexingGeneric': ({ rows }, f) => `正在建立數據表索引…（${f.number(rows)} 行）`,
  'progress.overall': '索引總進度',
  'progress.table': '目前數據表進度',

  'cache.loaded': ({ time }, f) => `已從快取載入（${f.dateTime(time)}）`,
  'cache.updating': ({ time }, f) => `已從快取載入（${f.dateTime(time)}）· 正在更新…`,
  'cache.refresh': '重新整理',

  'results.found': ({ matches, tables }, f) =>
    `在 ${f.number(tables)} 個數據表中找到 ${f.number(matches)} 個相符項目`,
  'results.showingFirst': ({ shown, total }, f) =>
    `顯示前 ${f.number(shown)} 項，共 ${f.number(total)} 項`,
  'results.showMore': ({ count }, f) => `再顯示 ${f.number(count)} 項結果`,
  'results.none': ({ query }) => `找不到與「${query}」相符的結果`,
  'results.partial': '仍在建立索引，結果可能不完整',
  'group.matches': ({ count }, f) => `${f.number(count)} 個相符`,

  'export.button': '匯出',
  'export.title': '匯出搜尋結果',
  'export.csv': '下載 CSV (.csv)',
  'export.json': '下載 JSON (.json)',
  'export.copyTsv': '複製為試算表內容 (TSV)',
  'export.col.sheet': '數據表',
  'export.col.field': '欄位',
  'export.col.recordId': '記錄 ID',
  'export.col.matched': '相符文字',
  'export.col.value': '儲存格內容',

  'index.title': '已建立索引的數據表',
  'index.rows': ({ count }, f) => `${f.number(count)} 行`,

  'error.indexFailed': '建立數據表索引失敗',
  'error.partial': ({ count, names }) =>
    `有 ${count} 個數據表無法讀取：${names}。搜尋結果可能不完整。`,
  'error.regexInvalid': ({ reason }) => `無效的正規表示式：${reason}`,
  'error.regexUnsafe': '正規表示式過於複雜（巢狀量詞可能導致搜尋停頓），請簡化表示式。',

  'toast.linkCopied': '目前為唯讀權限，已將相符行的連結複製到剪貼簿。',
  'toast.linkFailed': '目前為唯讀權限，無法自動開啟該行。',
  'toast.viewOpened': ({ table, field }) => `已開啟「${table}」，請查看「${field}」欄。`,
  'toast.openFailed': '無法開啟該行。',
  'toast.exported': ({ count, format }, f) => `已將 ${f.number(count)} 項結果匯出為 ${format}。`,
  'toast.copiedResults': ({ count }, f) => `已將 ${f.number(count)} 項結果複製到剪貼簿。`,
  'toast.exportFailed': '無法匯出搜尋結果。',

  'boundary.title': '發生錯誤',
  'boundary.reload': '重新載入',

  'checkbox.checked': '是',
  'checkbox.unchecked': '否',
};
