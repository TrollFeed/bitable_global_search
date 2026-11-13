import type { Messages } from '../messages';

export const vi: Messages = {
  'app.title': 'Tìm kiếm toàn cục',

  'search.placeholder': 'Tìm kiếm tất cả bảng…',
  'search.clear': 'Xóa tìm kiếm',
  'refresh.label': 'Làm mới chỉ mục',
  'refresh.title': 'Làm mới chỉ mục tìm kiếm',

  'mode.caseSensitive.short': 'Hoa/thường',
  'mode.caseSensitive.title': 'Phân biệt chữ hoa chữ thường',
  'mode.wholeWord.short': 'Toàn từ',
  'mode.wholeWord.title': 'Chỉ khớp toàn bộ từ',
  'mode.fuzzy.short': 'Gần đúng',
  'mode.fuzzy.title': 'Tìm kiếm gần đúng (chấp nhận lỗi gõ)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'Sử dụng biểu thức chính quy',

  'status.loadingCache': 'Đang tải từ bộ nhớ đệm…',
  'status.indexingTable': ({ table, rows }, f) =>
    `Đang lập chỉ mục ${table}… (${f.number(rows)} hàng)`,
  'status.indexingGeneric': ({ rows }, f) =>
    `Đang lập chỉ mục các bảng… (${f.number(rows)} hàng)`,
  'progress.overall': 'Tiến độ lập chỉ mục',
  'progress.table': 'Tiến độ bảng hiện tại',

  'cache.loaded': ({ time }, f) => `Đã tải từ bộ nhớ đệm (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `Đã tải từ bộ nhớ đệm (${f.dateTime(time)}) · đang cập nhật…`,
  'cache.refresh': 'Làm mới',

  'results.found': ({ matches, tables }, f) =>
    `Tìm thấy ${f.number(matches)} kết quả khớp trong ${f.number(tables)} bảng`,
  'results.showingFirst': ({ shown, total }, f) =>
    `Đang hiển thị ${f.number(shown)} / ${f.number(total)}`,
  'results.showMore': ({ count }, f) => `Hiển thị thêm ${f.number(count)} kết quả`,
  'results.none': ({ query }) => `Không tìm thấy kết quả cho "${query}"`,
  'results.partial': 'Đang lập chỉ mục — kết quả có thể chưa đầy đủ',
  'group.matches': ({ count }, f) => `${f.number(count)} kết quả khớp`,

  'export.button': 'Xuất',
  'export.title': 'Xuất kết quả tìm kiếm',
  'export.csv': 'Tải xuống CSV (.csv)',
  'export.json': 'Tải xuống JSON (.json)',
  'export.copyTsv': 'Sao chép cho bảng tính (TSV)',
  'export.col.sheet': 'Bảng',
  'export.col.field': 'Cột',
  'export.col.recordId': 'ID bản ghi',
  'export.col.matched': 'Văn bản khớp',
  'export.col.value': 'Giá trị ô',

  'index.title': 'Bảng đã lập chỉ mục',
  'index.rows': ({ count }, f) => `${f.number(count)} hàng`,

  'error.indexFailed': 'Không thể lập chỉ mục các bảng',
  'error.partial': ({ count, names }) =>
    `Không thể đọc ${count} bảng: ${names}. Kết quả có thể chưa đầy đủ.`,
  'error.regexInvalid': ({ reason }) => `Biểu thức chính quy không hợp lệ: ${reason}`,
  'error.regexUnsafe':
    'Mẫu quá phức tạp (lượng từ lồng nhau có thể làm treo tìm kiếm). Vui lòng đơn giản hóa biểu thức.',

  'toast.linkCopied':
    'Quyền chỉ đọc — đã sao chép liên kết đến hàng khớp vào bộ nhớ tạm.',
  'toast.linkFailed': 'Quyền chỉ đọc — không thể tự động mở hàng.',
  'toast.viewOpened': ({ table, field }) =>
    `Đã mở "${table}". Hãy xem cột "${field}".`,
  'toast.openFailed': 'Không thể mở hàng đó.',
  'toast.exported': ({ count, format }, f) =>
    `Đã xuất ${f.number(count)} kết quả dưới dạng ${format}.`,
  'toast.copiedResults': ({ count }, f) =>
    `Đã sao chép ${f.number(count)} kết quả vào bộ nhớ tạm.`,
  'toast.exportFailed': 'Không thể xuất kết quả tìm kiếm.',

  'boundary.title': 'Đã xảy ra lỗi',
  'boundary.reload': 'Tải lại',

  'checkbox.checked': 'Có',
  'checkbox.unchecked': 'Không',
};
