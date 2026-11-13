import type { Messages } from '../messages';

// 日本語。用語は Lark Base の日本語 UI に合わせています（テーブル／列／行）。
export const ja: Messages = {
  'app.title': 'グローバル検索',

  'search.placeholder': 'すべてのテーブルを検索…',
  'search.clear': '検索をクリア',
  'refresh.label': 'インデックスを更新',
  'refresh.title': '検索インデックスを更新',

  'mode.caseSensitive.short': '大小文字',
  'mode.caseSensitive.title': '大文字と小文字を区別',
  'mode.wholeWord.short': '単語単位',
  'mode.wholeWord.title': '単語単位で一致',
  'mode.fuzzy.short': 'あいまい',
  'mode.fuzzy.title': 'あいまい検索（入力ミスを許容）',
  'mode.regex.short': '正規表現',
  'mode.regex.title': '正規表現を使用',

  'status.loadingCache': 'キャッシュから読み込み中…',
  'status.indexingTable': ({ table, rows }, f) =>
    `${table} をインデックス中…（${f.number(rows)} 行）`,
  'status.indexingGeneric': ({ rows }, f) => `テーブルをインデックス中…（${f.number(rows)} 行）`,
  'progress.overall': 'インデックス作成の進捗',
  'progress.table': '現在のテーブルの進捗',

  'cache.loaded': ({ time }, f) => `キャッシュから読み込みました（${f.dateTime(time)}）`,
  'cache.updating': ({ time }, f) =>
    `キャッシュから読み込みました（${f.dateTime(time)}）・更新中…`,
  'cache.refresh': '更新',

  'results.found': ({ matches, tables }, f) =>
    `${f.number(tables)} 個のテーブルで ${f.number(matches)} 件の一致が見つかりました`,
  'results.showingFirst': ({ shown, total }, f) =>
    `${f.number(total)} 件中 ${f.number(shown)} 件を表示`,
  'results.showMore': ({ count }, f) => `さらに ${f.number(count)} 件を表示`,
  'results.none': ({ query }) => `「${query}」に一致する結果は見つかりませんでした`,
  'results.partial': 'インデックス作成中のため、結果が不完全な場合があります',
  'group.matches': ({ count }, f) => `${f.number(count)} 件`,

  'export.button': 'エクスポート',
  'export.title': '検索結果をエクスポート',
  'export.csv': 'CSV をダウンロード (.csv)',
  'export.json': 'JSON をダウンロード (.json)',
  'export.copyTsv': '表形式でコピー (TSV)',
  'export.col.sheet': 'テーブル',
  'export.col.field': '列',
  'export.col.recordId': 'レコード ID',
  'export.col.matched': '一致テキスト',
  'export.col.value': 'セルの値',

  'index.title': 'インデックス済みのテーブル',
  'index.rows': ({ count }, f) => `${f.number(count)} 行`,

  'error.indexFailed': 'テーブルのインデックスに失敗しました',
  'error.partial': ({ count, names }) =>
    `${count} 個のテーブルを読み込めませんでした: ${names}。結果が不完全な可能性があります。`,
  'error.regexInvalid': ({ reason }) => `無効な正規表現です: ${reason}`,
  'error.regexUnsafe':
    '正規表現が複雑すぎます（ネストされた量指定子は検索を停止させる恐れがあります）。式を簡略化してください。',

  'toast.linkCopied': '閲覧専用のため、該当する行へのリンクをクリップボードにコピーしました。',
  'toast.linkFailed': '閲覧専用のため、該当する行を自動的に開けませんでした。',
  'toast.viewOpened': ({ table, field }) =>
    `「${table}」を開きました。「${field}」列をご確認ください。`,
  'toast.openFailed': 'その行を開けませんでした。',
  'toast.exported': ({ count, format }, f) =>
    `${f.number(count)} 件の結果を ${format} としてエクスポートしました。`,
  'toast.copiedResults': ({ count }, f) =>
    `${f.number(count)} 件の結果をクリップボードにコピーしました。`,
  'toast.exportFailed': '検索結果をエクスポートできませんでした。',

  'boundary.title': '問題が発生しました',
  'boundary.reload': '再読み込み',

  'checkbox.checked': 'はい',
  'checkbox.unchecked': 'いいえ',
};
