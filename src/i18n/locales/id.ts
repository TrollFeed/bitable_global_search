import type { Messages } from '../messages';

export const id: Messages = {
  'app.title': 'Pencarian Global',

  'search.placeholder': 'Cari di semua tabel…',
  'search.clear': 'Hapus pencarian',
  'refresh.label': 'Segarkan indeks',
  'refresh.title': 'Segarkan indeks pencarian',

  'mode.caseSensitive.short': 'Huruf',
  'mode.caseSensitive.title': 'Cocokkan huruf besar/kecil',
  'mode.wholeWord.short': 'Kata',
  'mode.wholeWord.title': 'Cocokkan seluruh kata saja',
  'mode.fuzzy.short': 'Samar',
  'mode.fuzzy.title': 'Pencocokan samar (toleran salah ketik)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Gunakan ekspresi reguler',

  'status.loadingCache': 'Memuat dari cache…',
  'status.indexingTable': ({ table, rows }, f) =>
    `Mengindeks ${table}… (${f.number(rows)} baris)`,
  'status.indexingGeneric': ({ rows }, f) => `Mengindeks tabel… (${f.number(rows)} baris)`,
  'progress.overall': 'Progres pengindeksan',
  'progress.table': 'Progres tabel saat ini',

  'cache.loaded': ({ time }, f) => `Dimuat dari cache (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Dimuat dari cache (${f.dateTime(time)}) · memperbarui…`,
  'cache.refresh': 'Segarkan',

  'results.found': ({ matches, tables }, f) =>
    `Ditemukan ${f.number(matches)} kecocokan di ${f.number(tables)} tabel`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Menampilkan ${f.number(shown)} dari ${f.number(total)}`,
  'results.showMore': ({ count }, f) => `Tampilkan ${f.number(count)} hasil lainnya`,
  'results.none': ({ query }) => `Tidak ada hasil untuk "${query}"`,
  'results.partial': 'Masih mengindeks — hasil mungkin belum lengkap',
  'group.matches': ({ count }, f) => `${f.number(count)} kecocokan`,

  'export.button': 'Ekspor',
  'export.title': 'Ekspor hasil pencarian',
  'export.csv': 'Unduh CSV (.csv)',
  'export.json': 'Unduh JSON (.json)',
  'export.copyTsv': 'Salin untuk spreadsheet (TSV)',
  'export.col.sheet': 'Tabel',
  'export.col.field': 'Kolom',
  'export.col.recordId': 'ID Rekaman',
  'export.col.matched': 'Teks Cocok',
  'export.col.value': 'Nilai Sel',

  'index.title': 'Tabel Terindeks',
  'index.rows': ({ count }, f) => `${f.number(count)} baris`,

  'error.indexFailed': 'Gagal mengindeks tabel',
  'error.partial': ({ count, names }) =>
    `Tidak dapat membaca ${count} tabel: ${names}. Hasil mungkin belum lengkap.`,
  'error.regexInvalid': ({ reason }) => `Ekspresi reguler tidak valid: ${reason}`,
  'error.regexUnsafe':
    'Pola terlalu rumit (kuantifier bersarang dapat membekukan pencarian). Sederhanakan ekspresi.',

  'toast.linkCopied':
    'Akses baca saja — tautan ke baris yang cocok telah disalin ke papan klip.',
  'toast.linkFailed': 'Akses baca saja — tidak dapat membuka baris secara otomatis.',
  'toast.viewOpened': ({ table, field }) =>
    `Membuka "${table}". Lihat kolom "${field}".`,
  'toast.openFailed': 'Tidak dapat membuka baris tersebut.',
  'toast.exported': ({ count, format }, f) =>
    `Mengekspor ${f.number(count)} hasil sebagai ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `Menyalin ${f.number(count)} hasil ke papan klip.`,
  'toast.exportFailed': 'Tidak dapat mengekspor hasil pencarian.',

  'boundary.title': 'Terjadi kesalahan',
  'boundary.reload': 'Muat ulang',

  'checkbox.checked': 'Ya',
  'checkbox.unchecked': 'Tidak',
};
