import type { Messages } from '../messages';

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const it: Messages = {
  'app.title': 'Ricerca globale',

  'search.placeholder': 'Cerca in tutte le tabelle…',
  'search.clear': 'Cancella ricerca',
  'refresh.label': 'Aggiorna indice',
  'refresh.title': 'Aggiorna indice di ricerca',

  'mode.caseSensitive.short': 'Maiusc.',
  'mode.caseSensitive.title': 'Maiuscole/minuscole',
  'mode.wholeWord.short': 'Parola',
  'mode.wholeWord.title': 'Solo parole intere',
  'mode.fuzzy.short': 'Appross.',
  'mode.fuzzy.title': 'Ricerca approssimata (tollera errori)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Usa espressione regolare',

  'status.loadingCache': 'Caricamento dalla cache…',
  'status.indexingTable': ({ table, rows }, f) =>
    `Indicizzazione di ${table}… (${f.number(rows)} ${plural(rows, 'riga', 'righe')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Indicizzazione tabelle… (${f.number(rows)} ${plural(rows, 'riga', 'righe')})`,
  'progress.overall': 'Avanzamento indicizzazione',
  'progress.table': 'Avanzamento tabella corrente',

  'cache.loaded': ({ time }, f) => `Caricato dalla cache (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Caricato dalla cache (${f.dateTime(time)}) · aggiornamento…`,
  'cache.refresh': 'Aggiorna',

  'results.found': ({ matches, tables }, f) =>
    `${f.number(matches)} ${plural(matches, 'corrispondenza trovata', 'corrispondenze trovate')} in ${f.number(tables)} ${plural(tables, 'tabella', 'tabelle')}`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Visualizzati ${f.number(shown)} di ${f.number(total)}`,
  'results.showMore': ({ count }, f) =>
    `Mostra ${plural(count, 'altro', 'altri')} ${f.number(count)} ${plural(count, 'risultato', 'risultati')}`,
  'results.none': ({ query }) => `Nessun risultato trovato per "${query}"`,
  'results.partial': 'Indicizzazione in corso — i risultati potrebbero essere incompleti',
  'group.matches': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'corrispondenza', 'corrispondenze')}`,

  'export.button': 'Esporta',
  'export.title': 'Esporta risultati di ricerca',
  'export.csv': 'Scarica CSV (.csv)',
  'export.json': 'Scarica JSON (.json)',
  'export.copyTsv': 'Copia per foglio di calcolo (TSV)',
  'export.col.sheet': 'Tabella',
  'export.col.field': 'Colonna',
  'export.col.recordId': 'ID record',
  'export.col.matched': 'Testo trovato',
  'export.col.value': 'Valore cella',

  'index.title': 'Tabelle indicizzate',
  'index.rows': ({ count }, f) => `${f.number(count)} ${plural(count, 'riga', 'righe')}`,

  'error.indexFailed': 'Impossibile indicizzare le tabelle',
  'error.partial': ({ count, names }) =>
    `Impossibile leggere ${count} ${plural(count, 'tabella', 'tabelle')}: ${names}. I risultati potrebbero essere incompleti.`,
  'error.regexInvalid': ({ reason }) => `Espressione regolare non valida: ${reason}`,
  'error.regexUnsafe':
    'Il modello è troppo complesso (i quantificatori annidati possono bloccare la ricerca). Semplifica l’espressione.',

  'toast.linkCopied':
    'Accesso in sola lettura — link alla riga corrispondente copiato negli appunti.',
  'toast.linkFailed':
    'Accesso in sola lettura — impossibile aprire automaticamente la riga.',
  'toast.viewOpened': ({ table, field }) =>
    `Aperta "${table}". Controlla la colonna "${field}".`,
  'toast.openFailed': 'Impossibile aprire questa riga.',
  'toast.exported': ({ count, format }, f) =>
    `${f.number(count)} ${plural(count, 'risultato esportato', 'risultati esportati')} come ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'risultato copiato', 'risultati copiati')} negli appunti.`,
  'toast.exportFailed': 'Impossibile esportare i risultati.',

  'boundary.title': 'Qualcosa è andato storto',
  'boundary.reload': 'Ricarica',

  'checkbox.checked': 'Sì',
  'checkbox.unchecked': 'No',
};
