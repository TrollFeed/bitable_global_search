import type { Messages } from '../messages';

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const de: Messages = {
  'app.title': 'Globale Suche',

  'search.placeholder': 'Alle Tabellen durchsuchen…',
  'search.clear': 'Suche löschen',
  'refresh.label': 'Index aktualisieren',
  'refresh.title': 'Suchindex aktualisieren',

  'mode.caseSensitive.short': 'Groß/Klein',
  'mode.caseSensitive.title': 'Groß- und Kleinschreibung beachten',
  'mode.wholeWord.short': 'Wort',
  'mode.wholeWord.title': 'Nur ganzes Wort suchen',
  'mode.fuzzy.short': 'Unscharf',
  'mode.fuzzy.title': 'Unscharfe Suche (fehlertolerant)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Regulären Ausdruck verwenden',

  'status.loadingCache': 'Aus Zwischenspeicher laden…',
  'status.indexingTable': ({ table, rows }, f) =>
    `${table} wird indiziert… (${f.number(rows)} ${plural(rows, 'Zeile', 'Zeilen')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Tabellen werden indiziert… (${f.number(rows)} ${plural(rows, 'Zeile', 'Zeilen')})`,
  'progress.overall': 'Indizierungsfortschritt',
  'progress.table': 'Fortschritt der aktuellen Tabelle',

  'cache.loaded': ({ time }, f) => `Aus Zwischenspeicher geladen (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Aus Zwischenspeicher geladen (${f.dateTime(time)}) · wird aktualisiert…`,
  'cache.refresh': 'Aktualisieren',

  'results.found': ({ matches, tables }, f) =>
    `${f.number(matches)} ${plural(matches, 'Treffer', 'Treffer')} in ${f.number(tables)} ${plural(tables, 'Tabelle', 'Tabellen')} gefunden`,
  'results.showingFirst': ({ shown, total }, f) =>
    `${f.number(shown)} von ${f.number(total)} angezeigt`,
  'results.showMore': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'weiteres Ergebnis', 'weitere Ergebnisse')} anzeigen`,
  'results.none': ({ query }) => `Keine Ergebnisse für „${query}“ gefunden`,
  'results.partial': 'Indizierung läuft noch – Ergebnisse sind evtl. unvollständig',
  'group.matches': ({ count }, f) => `${f.number(count)} ${plural(count, 'Treffer', 'Treffer')}`,

  'export.button': 'Exportieren',
  'export.title': 'Suchergebnisse exportieren',
  'export.csv': 'CSV herunterladen (.csv)',
  'export.json': 'JSON herunterladen (.json)',
  'export.copyTsv': 'Für Tabelle kopieren (TSV)',
  'export.col.sheet': 'Tabelle',
  'export.col.field': 'Spalte',
  'export.col.recordId': 'Datensatz-ID',
  'export.col.matched': 'Gefundener Text',
  'export.col.value': 'Zellenwert',

  'index.title': 'Indizierte Tabellen',
  'index.rows': ({ count }, f) => `${f.number(count)} ${plural(count, 'Zeile', 'Zeilen')}`,

  'error.indexFailed': 'Tabellen konnten nicht indiziert werden',
  'error.partial': ({ count, names }) =>
    `${count} ${plural(count, 'Tabelle konnte', 'Tabellen konnten')} nicht gelesen werden: ${names}. Ergebnisse sind evtl. unvollständig.`,
  'error.regexInvalid': ({ reason }) => `Ungültiger regulärer Ausdruck: ${reason}`,
  'error.regexUnsafe':
    'Suchmuster zu komplex (verschachtelte Quantoren können die Suche blockieren). Bitte vereinfachen.',

  'toast.linkCopied':
    'Schreibgeschützt — Link zur passenden Zeile wurde in die Zwischenablage kopiert.',
  'toast.linkFailed': 'Schreibgeschützt — Zeile konnte nicht automatisch geöffnet werden.',
  'toast.viewOpened': ({ table, field }) =>
    `„${table}“ geöffnet. Prüfen Sie die Spalte „${field}“.`,
  'toast.openFailed': 'Diese Zeile konnte nicht geöffnet werden.',
  'toast.exported': ({ count, format }, f) =>
    `${f.number(count)} ${plural(count, 'Ergebnis', 'Ergebnisse')} als ${format} exportiert.`,
  'toast.copiedResults': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'Ergebnis', 'Ergebnisse')} in die Zwischenablage kopiert.`,
  'toast.exportFailed': 'Suchergebnisse konnten nicht exportiert werden.',

  'boundary.title': 'Etwas ist schiefgelaufen',
  'boundary.reload': 'Neu laden',

  'checkbox.checked': 'Ja',
  'checkbox.unchecked': 'Nein',
};
