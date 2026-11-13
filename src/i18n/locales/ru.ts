import type { Messages } from '../messages';

function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const ru: Messages = {
  'app.title': 'Глобальный поиск',

  'search.placeholder': 'Поиск по всем таблицам…',
  'search.clear': 'Очистить поиск',
  'refresh.label': 'Обновить индекс',
  'refresh.title': 'Обновить поисковый индекс',

  'mode.caseSensitive.short': 'Регистр',
  'mode.caseSensitive.title': 'Учитывать регистр',
  'mode.wholeWord.short': 'Слово',
  'mode.wholeWord.title': 'Только слово целиком',
  'mode.fuzzy.short': 'Нечётк.',
  'mode.fuzzy.title': 'Нечёткий поиск (с учётом опечаток)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Регулярное выражение',

  'status.loadingCache': 'Загрузка из кэша…',
  'status.indexingTable': ({ table, rows }, f) =>
    `Индексация ${table}… (${f.number(rows)} ${pluralRu(rows, 'строка', 'строки', 'строк')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Индексация таблиц… (${f.number(rows)} ${pluralRu(rows, 'строка', 'строки', 'строк')})`,
  'progress.overall': 'Общий прогресс индексации',
  'progress.table': 'Прогресс текущей таблицы',

  'cache.loaded': ({ time }, f) => `Загружено из кэша (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Загружено из кэша (${f.dateTime(time)}) · обновление…`,
  'cache.refresh': 'Обновить',

  'results.found': ({ matches, tables }, f) =>
    `Найдено ${f.number(matches)} ${pluralRu(matches, 'совпадение', 'совпадения', 'совпадений')} в ${f.number(tables)} ${pluralRu(tables, 'таблице', 'таблицах', 'таблицах')}`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Показано ${f.number(shown)} из ${f.number(total)}`,
  'results.showMore': ({ count }, f) =>
    `Показать ещё ${f.number(count)} ${pluralRu(count, 'результат', 'результата', 'результатов')}`,
  'results.none': ({ query }) => `Ничего не найдено по запросу «${query}»`,
  'results.partial': 'Индексация продолжается — результаты могут быть неполными',
  'group.matches': ({ count }, f) =>
    `${f.number(count)} ${pluralRu(count, 'совпадение', 'совпадения', 'совпадений')}`,

  'export.button': 'Экспорт',
  'export.title': 'Экспортировать результаты поиска',
  'export.csv': 'Скачать CSV (.csv)',
  'export.json': 'Скачать JSON (.json)',
  'export.copyTsv': 'Копировать для таблицы (TSV)',
  'export.col.sheet': 'Таблица',
  'export.col.field': 'Столбец',
  'export.col.recordId': 'ID записи',
  'export.col.matched': 'Совпавший текст',
  'export.col.value': 'Значение ячейки',

  'index.title': 'Проиндексированные таблицы',
  'index.rows': ({ count }, f) =>
    `${f.number(count)} ${pluralRu(count, 'строка', 'строки', 'строк')}`,

  'error.indexFailed': 'Не удалось проиндексировать таблицы',
  'error.partial': ({ count, names }) =>
    `Не удалось прочитать ${count} ${pluralRu(count, 'таблицу', 'таблицы', 'таблиц')}: ${names}. Результаты могут быть неполными.`,
  'error.regexInvalid': ({ reason }) => `Некорректное регулярное выражение: ${reason}`,
  'error.regexUnsafe':
    'Шаблон слишком сложен (вложенные квантификаторы могут замедлить поиск). Упростите выражение.',

  'toast.linkCopied':
    'Доступ только для чтения — ссылка на строку скопирована в буфер обмена.',
  'toast.linkFailed':
    'Доступ только для чтения — не удалось автоматически открыть строку.',
  'toast.viewOpened': ({ table, field }) =>
    `Открыта таблица «${table}». Проверьте столбец «${field}».`,
  'toast.openFailed': 'Не удалось открыть эту строку.',
  'toast.exported': ({ count, format }, f) =>
    `Экспортировано ${f.number(count)} ${pluralRu(count, 'результат', 'результата', 'результатов')} в ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `Скопировано ${f.number(count)} ${pluralRu(count, 'результат', 'результата', 'результатов')} в буфер обмена.`,
  'toast.exportFailed': 'Не удалось экспортировать результаты поиска.',

  'boundary.title': 'Что-то пошло не так',
  'boundary.reload': 'Перезагрузить',

  'checkbox.checked': 'Да',
  'checkbox.unchecked': 'Нет',
};
