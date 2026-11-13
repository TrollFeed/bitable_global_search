import type { Messages } from '../messages';

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const pt: Messages = {
  'app.title': 'Pesquisa global',

  'search.placeholder': 'Pesquisar em todas as tabelas…',
  'search.clear': 'Limpar pesquisa',
  'refresh.label': 'Atualizar índice',
  'refresh.title': 'Atualizar índice de pesquisa',

  'mode.caseSensitive.short': 'Maiúsc.',
  'mode.caseSensitive.title': 'Diferenciar maiúsculas e minúsculas',
  'mode.wholeWord.short': 'Palavra',
  'mode.wholeWord.title': 'Apenas palavras inteiras',
  'mode.fuzzy.short': 'Aprox.',
  'mode.fuzzy.title': 'Correspondência aproximada (tolera erros)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Usar expressão regular',

  'status.loadingCache': 'Carregando do cache…',
  'status.indexingTable': ({ table, rows }, f) =>
    `Indexando ${table}… (${f.number(rows)} ${plural(rows, 'linha', 'linhas')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Indexando tabelas… (${f.number(rows)} ${plural(rows, 'linha', 'linhas')})`,
  'progress.overall': 'Progresso da indexação',
  'progress.table': 'Progresso da tabela atual',

  'cache.loaded': ({ time }, f) => `Carregado do cache (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Carregado do cache (${f.dateTime(time)}) · atualizando…`,
  'cache.refresh': 'Atualizar',

  'results.found': ({ matches, tables }, f) =>
    `${f.number(matches)} ${plural(matches, 'correspondência encontrada', 'correspondências encontradas')} em ${f.number(tables)} ${plural(tables, 'tabela', 'tabelas')}`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Exibindo ${f.number(shown)} de ${f.number(total)}`,
  'results.showMore': ({ count }, f) =>
    `Mostrar mais ${f.number(count)} ${plural(count, 'resultado', 'resultados')}`,
  'results.none': ({ query }) => `Nenhum resultado encontrado para "${query}"`,
  'results.partial': 'Ainda indexando — os resultados podem estar incompletos',
  'group.matches': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'correspondência', 'correspondências')}`,

  'export.button': 'Exportar',
  'export.title': 'Exportar resultados da pesquisa',
  'export.csv': 'Baixar CSV (.csv)',
  'export.json': 'Baixar JSON (.json)',
  'export.copyTsv': 'Copiar para planilha (TSV)',
  'export.col.sheet': 'Tabela',
  'export.col.field': 'Coluna',
  'export.col.recordId': 'ID do registro',
  'export.col.matched': 'Texto correspondente',
  'export.col.value': 'Valor da célula',

  'index.title': 'Tabelas indexadas',
  'index.rows': ({ count }, f) => `${f.number(count)} ${plural(count, 'linha', 'linhas')}`,

  'error.indexFailed': 'Falha ao indexar as tabelas',
  'error.partial': ({ count, names }) =>
    `Não foi possível ler ${count} ${plural(count, 'tabela', 'tabelas')}: ${names}. Os resultados podem estar incompletos.`,
  'error.regexInvalid': ({ reason }) => `Expressão regular inválida: ${reason}`,
  'error.regexUnsafe':
    'O padrão é muito complexo (quantificadores aninhados podem travar a pesquisa). Simplifique a expressão.',

  'toast.linkCopied':
    'Acesso somente leitura — o link para a linha correspondente foi copiado.',
  'toast.linkFailed':
    'Acesso somente leitura — não foi possível abrir a linha automaticamente.',
  'toast.viewOpened': ({ table, field }) =>
    `Tabela "${table}" aberta. Procure a coluna "${field}".`,
  'toast.openFailed': 'Não foi possível abrir essa linha.',
  'toast.exported': ({ count, format }, f) =>
    `${f.number(count)} ${plural(count, 'resultado exportado', 'resultados exportados')} como ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `${f.number(count)} ${plural(count, 'resultado copiado', 'resultados copiados')} para a área de transferência.`,
  'toast.exportFailed': 'Não foi possível exportar os resultados.',

  'boundary.title': 'Algo deu errado',
  'boundary.reload': 'Recarregar',

  'checkbox.checked': 'Sim',
  'checkbox.unchecked': 'Não',
};
