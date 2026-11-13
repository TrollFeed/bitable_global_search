import type { Messages } from '../messages';

// 한국어. 용어는 Lark Base 한국어 UI에 맞췄습니다(테이블 / 열 / 행).
export const ko: Messages = {
  'app.title': '전체 검색',

  'search.placeholder': '모든 테이블 검색…',
  'search.clear': '검색어 지우기',
  'refresh.label': '색인 새로고침',
  'refresh.title': '검색 색인 새로고침',

  'mode.caseSensitive.short': '대소문자',
  'mode.caseSensitive.title': '대소문자 구분',
  'mode.wholeWord.short': '단어 단위',
  'mode.wholeWord.title': '전체 단어 일치',
  'mode.fuzzy.short': '유사 검색',
  'mode.fuzzy.title': '유사 일치 (오타 허용)',
  'mode.regex.short': '정규식',
  'mode.regex.title': '정규 표현식 사용',

  'status.loadingCache': '캐시에서 불러오는 중…',
  'status.indexingTable': ({ table, rows }, f) => `${table} 색인 중… (${f.number(rows)}행)`,
  'status.indexingGeneric': ({ rows }, f) => `테이블 색인 중… (${f.number(rows)}행)`,
  'progress.overall': '색인 진행률',
  'progress.table': '현재 테이블 진행률',

  'cache.loaded': ({ time }, f) => `캐시에서 불러옴 (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) => `캐시에서 불러옴 (${f.dateTime(time)}) · 업데이트 중…`,
  'cache.refresh': '새로고침',

  'results.found': ({ matches, tables }, f) =>
    `${f.number(tables)}개 테이블에서 ${f.number(matches)}개의 일치 항목을 찾았습니다`,
  'results.showingFirst': ({ shown, total }, f) =>
    `전체 ${f.number(total)}개 중 ${f.number(shown)}개 표시`,
  'results.showMore': ({ count }, f) => `결과 ${f.number(count)}개 더 보기`,
  'results.none': ({ query }) => `"${query}"에 대한 검색 결과가 없습니다`,
  'results.partial': '아직 색인을 만드는 중이라 결과가 완전하지 않을 수 있습니다',
  'group.matches': ({ count }, f) => `${f.number(count)}개 일치`,

  'export.button': '내보내기',
  'export.title': '검색 결과 내보내기',
  'export.csv': 'CSV 다운로드 (.csv)',
  'export.json': 'JSON 다운로드 (.json)',
  'export.copyTsv': '스프레드시트용 복사 (TSV)',
  'export.col.sheet': '테이블',
  'export.col.field': '열',
  'export.col.recordId': '레코드 ID',
  'export.col.matched': '일치 텍스트',
  'export.col.value': '셀 값',

  'index.title': '색인된 테이블',
  'index.rows': ({ count }, f) => `${f.number(count)}행`,

  'error.indexFailed': '테이블을 색인하지 못했습니다',
  'error.partial': ({ count, names }) =>
    `테이블 ${count}개를 읽지 못했습니다: ${names}. 결과가 완전하지 않을 수 있습니다.`,
  'error.regexInvalid': ({ reason }) => `잘못된 정규 표현식: ${reason}`,
  'error.regexUnsafe':
    '정규식 패턴이 너무 복잡합니다(중첩 수량자는 검색을 멈추게 할 수 있음). 식을 단순화하세요.',

  'toast.linkCopied': '읽기 전용 권한이라 일치하는 행의 링크를 클립보드에 복사했습니다.',
  'toast.linkFailed': '읽기 전용 권한이라 해당 행을 자동으로 열 수 없습니다.',
  'toast.viewOpened': ({ table, field }) => `"${table}" 테이블을 열었습니다. "${field}" 열을 확인하세요.`,
  'toast.openFailed': '해당 행을 열 수 없습니다.',
  'toast.exported': ({ count, format }, f) =>
    `결과 ${f.number(count)}개를 ${format} 형식으로 내보냈습니다.`,
  'toast.copiedResults': ({ count }, f) =>
    `결과 ${f.number(count)}개를 클립보드에 복사했습니다.`,
  'toast.exportFailed': '검색 결과를 내보내지 못했습니다.',

  'boundary.title': '문제가 발생했습니다',
  'boundary.reload': '다시 불러오기',

  'checkbox.checked': '예',
  'checkbox.unchecked': '아니요',
};
