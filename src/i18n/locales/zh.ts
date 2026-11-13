import type { Messages } from '../messages';

// 简体中文。术语沿用飞书多维表格中文界面的叫法：“数据表”、“列”、“行”。
export const zh: Messages = {
  'app.title': '全局搜索',

  'search.placeholder': '搜索所有数据表…',
  'search.clear': '清除搜索',
  'refresh.label': '刷新索引',
  'refresh.title': '刷新搜索索引',

  'mode.caseSensitive.short': '大小写',
  'mode.caseSensitive.title': '区分大小写',
  'mode.wholeWord.short': '全字',
  'mode.wholeWord.title': '全字匹配',
  'mode.fuzzy.short': '模糊',
  'mode.fuzzy.title': '模糊匹配（容错搜索）',
  'mode.regex.short': '正则',
  'mode.regex.title': '使用正则表达式',

  'status.loadingCache': '正在从缓存加载…',
  'status.indexingTable': ({ table, rows }, f) => `正在索引 ${table}…（${f.number(rows)} 行）`,
  'status.indexingGeneric': ({ rows }, f) => `正在索引数据表…（${f.number(rows)} 行）`,
  'progress.overall': '索引总进度',
  'progress.table': '当前数据表进度',

  'cache.loaded': ({ time }, f) => `已从缓存加载（${f.dateTime(time)}）`,
  'cache.updating': ({ time }, f) => `已从缓存加载（${f.dateTime(time)}）· 正在更新…`,
  'cache.refresh': '刷新',

  'results.found': ({ matches, tables }, f) =>
    `在 ${f.number(tables)} 个数据表中找到 ${f.number(matches)} 个匹配项`,
  'results.showingFirst': ({ shown, total }, f) =>
    `当前显示前 ${f.number(shown)} 条，共 ${f.number(total)} 条`,
  'results.showMore': ({ count }, f) => `再显示 ${f.number(count)} 条结果`,
  'results.none': ({ query }) => `未找到与“${query}”匹配的结果`,
  'results.partial': '仍在建立索引，结果可能不完整',
  'group.matches': ({ count }, f) => `${f.number(count)} 个匹配`,

  'export.button': '导出',
  'export.title': '导出搜索结果',
  'export.csv': '下载 CSV (.csv)',
  'export.json': '下载 JSON (.json)',
  'export.copyTsv': '复制为表格内容 (TSV)',
  'export.col.sheet': '数据表',
  'export.col.field': '列名',
  'export.col.recordId': '记录 ID',
  'export.col.matched': '匹配文本',
  'export.col.value': '单元格内容',

  'index.title': '已索引的数据表',
  'index.rows': ({ count }, f) => `${f.number(count)} 行`,

  'error.indexFailed': '索引数据表失败',
  'error.partial': ({ count, names }) =>
    `有 ${count} 个数据表无法读取：${names}。搜索结果可能不完整。`,
  'error.regexInvalid': ({ reason }) => `正则表达式无效：${reason}`,
  'error.regexUnsafe': '正则表达式过于复杂（嵌套量词可能导致搜索卡顿），请简化表达式。',

  'toast.linkCopied': '当前为只读权限，已将匹配行的链接复制到剪贴板。',
  'toast.linkFailed': '当前为只读权限，无法自动打开该行。',
  'toast.viewOpened': ({ table, field }) => `已打开“${table}”，请查看“${field}”列。`,
  'toast.openFailed': '无法打开该行。',
  'toast.exported': ({ count, format }, f) => `已将 ${f.number(count)} 条结果导出为 ${format}。`,
  'toast.copiedResults': ({ count }, f) => `已将 ${f.number(count)} 条结果复制到剪贴板。`,
  'toast.exportFailed': '无法导出搜索结果。',

  'boundary.title': '出了点问题',
  'boundary.reload': '重新加载',

  'checkbox.checked': '是',
  'checkbox.unchecked': '否',
};
