import type { Messages } from '../messages';

export const th: Messages = {
  'app.title': 'ค้นหาทั้งหมด',

  'search.placeholder': 'ค้นหาทุกตาราง…',
  'search.clear': 'ล้างการค้นหา',
  'refresh.label': 'รีเฟรชดัชนี',
  'refresh.title': 'รีเฟรชดัชนีการค้นหา',

  'mode.caseSensitive.short': 'ตัวพิมพ์',
  'mode.caseSensitive.title': 'ตรงตามตัวพิมพ์ใหญ่-เล็ก',
  'mode.wholeWord.short': 'ทั้งคำ',
  'mode.wholeWord.title': 'ตรงทั้งคำเท่านั้น',
  'mode.fuzzy.short': 'ใกล้เคียง',
  'mode.fuzzy.title': 'ค้นหาแบบใกล้เคียง (ยอมรับคำพิมพ์ผิด)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'ใช้นิพจน์ปรกติ (Regex)',

  'status.loadingCache': 'กำลังโหลดจากแคช…',
  'status.indexingTable': ({ table, rows }, f) =>
    `กำลังจัดทำดัชนี ${table}… (${f.number(rows)} แถว)`,
  'status.indexingGeneric': ({ rows }, f) =>
    `กำลังจัดทำดัชนีตาราง… (${f.number(rows)} แถว)`,
  'progress.overall': 'ความคืบหน้าการจัดทำดัชนี',
  'progress.table': 'ความคืบหน้าของตารางปัจจุบัน',

  'cache.loaded': ({ time }, f) => `โหลดจากแคชแล้ว (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `โหลดจากแคชแล้ว (${f.dateTime(time)}) · กำลังอัปเดต…`,
  'cache.refresh': 'รีเฟรช',

  'results.found': ({ matches, tables }, f) =>
    `พบ ${f.number(matches)} รายการที่ตรงกันใน ${f.number(tables)} ตาราง`,
  'results.showingFirst': ({ shown, total }, f) =>
    `แสดง ${f.number(shown)} จาก ${f.number(total)} รายการ`,
  'results.showMore': ({ count }, f) => `แสดงเพิ่มอีก ${f.number(count)} รายการ`,
  'results.none': ({ query }) => `ไม่พบผลลัพธ์สำหรับ "${query}"`,
  'results.partial': 'กำลังจัดทำดัชนี — ผลลัพธ์อาจยังไม่ครบถ้วน',
  'group.matches': ({ count }, f) => `ตรงกัน ${f.number(count)} รายการ`,

  'export.button': 'ส่งออก',
  'export.title': 'ส่งออกผลการค้นหา',
  'export.csv': 'ดาวน์โหลด CSV (.csv)',
  'export.json': 'ดาวน์โหลด JSON (.json)',
  'export.copyTsv': 'คัดลอกสำหรับสเปรดชีต (TSV)',
  'export.col.sheet': 'ตาราง',
  'export.col.field': 'คอลัมน์',
  'export.col.recordId': 'รหัสระเบียน',
  'export.col.matched': 'ข้อความที่ตรงกัน',
  'export.col.value': 'ค่าในเซลล์',

  'index.title': 'ตารางที่จัดทำดัชนีแล้ว',
  'index.rows': ({ count }, f) => `${f.number(count)} แถว`,

  'error.indexFailed': 'จัดทำดัชนีตารางไม่สำเร็จ',
  'error.partial': ({ count, names }) =>
    `ไม่สามารถอ่าน ${count} ตาราง: ${names} ผลลัพธ์อาจไม่ครบถ้วน`,
  'error.regexInvalid': ({ reason }) => `นิพจน์ปรกติไม่ถูกต้อง: ${reason}`,
  'error.regexUnsafe':
    'รูปแบบซับซ้อนเกินไป (ตัวระบุจำนวนซ้อนกันอาจทำให้การค้นหาค้าง) โปรดลดความซับซ้อน',

  'toast.linkCopied':
    'สิทธิ์อ่านอย่างเดียว — คัดลอกลิงก์ไปยังแถวที่ตรงกันแล้ว',
  'toast.linkFailed': 'สิทธิ์อ่านอย่างเดียว — ไม่สามารถเปิดแถวโดยอัตโนมัติได้',
  'toast.viewOpened': ({ table, field }) =>
    `เปิด "${table}" แล้ว โปรดดูคอลัมน์ "${field}"`,
  'toast.openFailed': 'ไม่สามารถเปิดแถวนั้นได้',
  'toast.exported': ({ count, format }, f) =>
    `ส่งออกผลลัพธ์ ${f.number(count)} รายการเป็น ${format} แล้ว`,
  'toast.copiedResults': ({ count }, f) =>
    `คัดลอกผลลัพธ์ ${f.number(count)} รายการไปยังคลิปบอร์ดแล้ว`,
  'toast.exportFailed': 'ไม่สามารถส่งออกผลการค้นหาได้',

  'boundary.title': 'เกิดข้อผิดพลาดบางอย่าง',
  'boundary.reload': 'โหลดใหม่',

  'checkbox.checked': 'ใช่',
  'checkbox.unchecked': 'ไม่ใช่',
};
