import type { Messages } from '../messages';

// Français. En français, 0 et 1 prennent le singulier.
const plural = (n: number, one: string, other: string) => (n <= 1 ? one : other);

export const fr: Messages = {
  'app.title': 'Recherche globale',

  'search.placeholder': 'Rechercher dans toutes les tables…',
  'search.clear': 'Effacer la recherche',
  'refresh.label': "Actualiser l'index",
  'refresh.title': "Actualiser l'index de recherche",

  'mode.caseSensitive.short': 'Casse',
  'mode.caseSensitive.title': 'Respecter la casse',
  'mode.wholeWord.short': 'Mot',
  'mode.wholeWord.title': 'Mot entier uniquement',
  'mode.fuzzy.short': 'Flou',
  'mode.fuzzy.title': 'Recherche approximative (tolère les fautes)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Utiliser une expression régulière',

  'status.loadingCache': 'Chargement depuis le cache…',
  'status.indexingTable': ({ table, rows }, f) =>
    `Indexation de ${table}… (${f.number(rows)} ${plural(rows, 'ligne', 'lignes')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Indexation des tables… (${f.number(rows)} ${plural(rows, 'ligne', 'lignes')})`,
  'progress.overall': "Progression de l'indexation",
  'progress.table': 'Progression de la table actuelle',

  'cache.loaded': ({ time }, f) => `Chargé depuis le cache (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Chargé depuis le cache (${f.dateTime(time)}) · mise à jour…`,
  'cache.refresh': 'Actualiser',

  'results.found': ({ matches, tables }, f) =>
    `${f.number(matches)} ${plural(matches, 'résultat trouvé', 'résultats trouvés')} dans ${f.number(tables)} ${plural(tables, 'table', 'tables')}`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Affichage de ${f.number(shown)} sur ${f.number(total)}`,
  'results.showMore': ({ count }, f) =>
    `Afficher ${f.number(count)} ${plural(count, 'résultat supplémentaire', 'résultats supplémentaires')}`,
  'results.none': ({ query }) => `Aucun résultat pour « ${query} »`,
  'results.partial': 'Indexation en cours — les résultats peuvent être incomplets',
  'group.matches': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'résultat', 'résultats')}`,

  'export.button': 'Exporter',
  'export.title': 'Exporter les résultats de recherche',
  'export.csv': 'Télécharger en CSV (.csv)',
  'export.json': 'Télécharger en JSON (.json)',
  'export.copyTsv': 'Copier pour tableur (TSV)',
  'export.col.sheet': 'Table',
  'export.col.field': 'Colonne',
  'export.col.recordId': "ID de l'enregistrement",
  'export.col.matched': 'Texte trouvé',
  'export.col.value': 'Valeur de la cellule',

  'index.title': 'Tables indexées',
  'index.rows': ({ count }, f) => `${f.number(count)} ${plural(count, 'ligne', 'lignes')}`,

  'error.indexFailed': "Échec de l'indexation des tables",
  'error.partial': ({ count, names }) =>
    `Impossible de lire ${count} ${plural(count, 'table', 'tables')} : ${names}. Les résultats peuvent être incomplets.`,
  'error.regexInvalid': ({ reason }) => `Expression régulière invalide : ${reason}`,
  'error.regexUnsafe':
    'Expression trop complexe (les quantificateurs imbriqués peuvent bloquer la recherche). Simplifiez le motif.',

  'toast.linkCopied':
    'Accès en lecture seule — le lien vers la ligne correspondante a été copié.',
  'toast.linkFailed':
    "Accès en lecture seule — impossible d'ouvrir automatiquement la ligne.",
  'toast.viewOpened': ({ table, field }) =>
    `Table « ${table} » ouverte. Consultez la colonne « ${field} ».`,
  'toast.openFailed': "Impossible d'ouvrir cette ligne.",
  'toast.exported': ({ count, format }, f) =>
    `${f.number(count)} ${plural(count, 'résultat exporté', 'résultats exportés')} au format ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'résultat copié', 'résultats copiés')} dans le presse-papiers.`,
  'toast.exportFailed': "Impossible d'exporter les résultats.",

  'boundary.title': 'Une erreur est survenue',
  'boundary.reload': 'Recharger',

  'checkbox.checked': 'Oui',
  'checkbox.unchecked': 'Non',
};
