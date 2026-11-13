import type { Messages } from '../messages';

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const es: Messages = {
  'app.title': 'Búsqueda global',

  'search.placeholder': 'Buscar en todas las tablas…',
  'search.clear': 'Borrar búsqueda',
  'refresh.label': 'Actualizar índice',
  'refresh.title': 'Actualizar índice de búsqueda',

  'mode.caseSensitive.short': 'Mayús.',
  'mode.caseSensitive.title': 'Coincidir mayúsculas y minúsculas',
  'mode.wholeWord.short': 'Palabra',
  'mode.wholeWord.title': 'Solo palabras completas',
  'mode.fuzzy.short': 'Difusa',
  'mode.fuzzy.title': 'Búsqueda aproximada (tolera errores)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Usar expresión regular',

  'status.loadingCache': 'Cargando desde la caché…',
  'status.indexingTable': ({ table, rows }, f) =>
    `Indexando ${table}… (${f.number(rows)} ${plural(rows, 'fila', 'filas')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Indexando tablas… (${f.number(rows)} ${plural(rows, 'fila', 'filas')})`,
  'progress.overall': 'Progreso de indexación',
  'progress.table': 'Progreso de la tabla actual',

  'cache.loaded': ({ time }, f) => `Cargado desde la caché (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Cargado desde la caché (${f.dateTime(time)}) · actualizando…`,
  'cache.refresh': 'Actualizar',

  'results.found': ({ matches, tables }, f) =>
    `Se ${plural(matches, 'encontró', 'encontraron')} ${f.number(matches)} ${plural(matches, 'coincidencia', 'coincidencias')} en ${f.number(tables)} ${plural(tables, 'tabla', 'tablas')}`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Mostrando ${f.number(shown)} de ${f.number(total)}`,
  'results.showMore': ({ count }, f) =>
    `Mostrar ${f.number(count)} ${plural(count, 'resultado', 'resultados')} más`,
  'results.none': ({ query }) => `No se encontraron resultados para "${query}"`,
  'results.partial': 'Aún indexando: los resultados pueden estar incompletos',
  'group.matches': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'coincidencia', 'coincidencias')}`,

  'export.button': 'Exportar',
  'export.title': 'Exportar resultados de búsqueda',
  'export.csv': 'Descargar CSV (.csv)',
  'export.json': 'Descargar JSON (.json)',
  'export.copyTsv': 'Copiar para hoja de cálculo (TSV)',
  'export.col.sheet': 'Tabla',
  'export.col.field': 'Columna',
  'export.col.recordId': 'ID de registro',
  'export.col.matched': 'Texto coincidente',
  'export.col.value': 'Valor de celda',

  'index.title': 'Tablas indexadas',
  'index.rows': ({ count }, f) => `${f.number(count)} ${plural(count, 'fila', 'filas')}`,

  'error.indexFailed': 'Error al indexar las tablas',
  'error.partial': ({ count, names }) =>
    `No se ${plural(count, 'pudo leer', 'pudieron leer')} ${count} ${plural(count, 'tabla', 'tablas')}: ${names}. Los resultados pueden estar incompletos.`,
  'error.regexInvalid': ({ reason }) => `Expresión regular no válida: ${reason}`,
  'error.regexUnsafe':
    'El patrón es demasiado complejo (los cuantificadores anidados pueden bloquear la búsqueda). Simplifique la expresión.',

  'toast.linkCopied':
    'Acceso de solo lectura: se copió el enlace de la fila al portapapeles.',
  'toast.linkFailed':
    'Acceso de solo lectura: no se pudo abrir la fila automáticamente.',
  'toast.viewOpened': ({ table, field }) =>
    `Se abrió "${table}". Busque la columna "${field}".`,
  'toast.openFailed': 'No se pudo abrir esa fila.',
  'toast.exported': ({ count, format }, f) =>
    `Se ${plural(count, 'exportó', 'exportaron')} ${f.number(count)} ${plural(count, 'resultado', 'resultados')} como ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `Se ${plural(count, 'copió', 'copiaron')} ${f.number(count)} ${plural(count, 'resultado', 'resultados')} al portapapeles.`,
  'toast.exportFailed': 'No se pudieron exportar los resultados.',

  'boundary.title': 'Algo salió mal',
  'boundary.reload': 'Recargar',

  'checkbox.checked': 'Sí',
  'checkbox.unchecked': 'No',
};
