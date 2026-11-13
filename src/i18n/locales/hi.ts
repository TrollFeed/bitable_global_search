import type { Messages } from '../messages';

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

export const hi: Messages = {
  'app.title': 'ग्लोबल खोज',

  'search.placeholder': 'सभी तालिकाओं में खोजें…',
  'search.clear': 'खोज साफ़ करें',
  'refresh.label': 'इंडेक्स रीफ़्रेश करें',
  'refresh.title': 'खोज इंडेक्स रीफ़्रेश करें',

  'mode.caseSensitive.short': 'अक्षर केस',
  'mode.caseSensitive.title': 'केस मिलान करें (बड़े/छोटे अक्षर)',
  'mode.wholeWord.short': 'पूरा शब्द',
  'mode.wholeWord.title': 'केवल पूरे शब्द का मिलान करें',
  'mode.fuzzy.short': 'अनुमानित',
  'mode.fuzzy.title': 'अनुमानित मिलान (टाइपो-सहिष्णु)',
  'mode.regex.short': 'Regex',
  'mode.regex.title': 'रेगुलर एक्सप्रेशन का उपयोग करें',

  'status.loadingCache': 'कैश से लोड हो रहा है…',
  'status.indexingTable': ({ table, rows }, f) =>
    `${table} इंडेक्स हो रहा है… (${f.number(rows)} ${plural(rows, 'पंक्ति', 'पंक्तियाँ')})`,
  'status.indexingGeneric': ({ rows }, f) =>
    `तालिकाएँ इंडेक्स हो रही हैं… (${f.number(rows)} ${plural(rows, 'पंक्ति', 'पंक्तियाँ')})`,
  'progress.overall': 'कुल इंडेक्सिंग प्रगति',
  'progress.table': 'वर्तमान तालिका प्रगति',

  'cache.loaded': ({ time }, f) => `कैश से लोड किया गया (${f.dateTime(time)})`,
  'cache.updating': ({ time }, f) =>
    `कैश से लोड किया गया (${f.dateTime(time)}) · अपडेट हो रहा है…`,
  'cache.refresh': 'रीफ़्रेश',

  'results.found': ({ matches, tables }, f) =>
    `${f.number(tables)} ${plural(tables, 'तालिका', 'तालिकाओं')} में ${f.number(matches)} मिलान मिले`,
  'results.showingFirst': ({ shown, total }, f) =>
    `${f.number(total)} में से ${f.number(shown)} दिखाए जा रहे हैं`,
  'results.showMore': ({ count }, f) =>
    `${f.number(count)} और ${plural(count, 'परिणाम', 'परिणाम')} दिखाएँ`,
  'results.none': ({ query }) => `"${query}" के लिए कोई परिणाम नहीं मिला`,
  'results.partial': 'अभी भी इंडेक्स हो रहा है — परिणाम अधूरे हो सकते हैं',
  'group.matches': ({ count }, f) => `${f.number(count)} मिलान`,

  'export.button': 'निर्यात',
  'export.title': 'खोज परिणाम निर्यात करें',
  'export.csv': 'CSV डाउनलोड करें (.csv)',
  'export.json': 'JSON डाउनलोड करें (.json)',
  'export.copyTsv': 'स्प्रेडशीट के लिए कॉपी करें (TSV)',
  'export.col.sheet': 'तालिका',
  'export.col.field': 'कॉलम',
  'export.col.recordId': 'रिकॉर्ड ID',
  'export.col.matched': 'मिला हुआ पाठ',
  'export.col.value': 'सेल मान',

  'index.title': 'इंडेक्स की गई तालिकाएँ',
  'index.rows': ({ count }, f) => `${f.number(count)} ${plural(count, 'पंक्ति', 'पंक्तियाँ')}`,

  'error.indexFailed': 'तालिकाओं को इंडेक्स करने में विफल',
  'error.partial': ({ count, names }) =>
    `${count} ${plural(count, 'तालिका', 'तालिकाएँ')} नहीं पढ़ी जा सकीं: ${names}। परिणाम अधूरे हो सकते हैं।`,
  'error.regexInvalid': ({ reason }) => `अमान्य रेगुलर एक्सप्रेशन: ${reason}`,
  'error.regexUnsafe':
    'पैटर्न बहुत जटिल है (नेस्टेड क्वांटिफ़ायर खोज को रोक सकते हैं)। कृपया एक्सप्रेशन सरल करें।',

  'toast.linkCopied':
    'केवल पढ़ने की अनुमति — मिलान वाली पंक्ति का लिंक क्लिपबोर्ड पर कॉपी किया गया।',
  'toast.linkFailed':
    'केवल पढ़ने की अनुमति — पंक्ति को स्वचालित रूप से नहीं खोला जा सका।',
  'toast.viewOpened': ({ table, field }) =>
    `"${table}" खोला गया। "${field}" कॉलम देखें।`,
  'toast.openFailed': 'उस पंक्ति को नहीं खोला जा सका।',
  'toast.exported': ({ count, format }, f) =>
    `${f.number(count)} परिणाम ${format} के रूप में निर्यात किए गए।`,
  'toast.copiedResults': ({ count }, f) =>
    `${f.number(count)} परिणाम क्लिपबोर्ड पर कॉपी किए गए।`,
  'toast.exportFailed': 'खोज परिणाम निर्यात नहीं किए जा सके।',

  'boundary.title': 'कुछ गलत हो गया',
  'boundary.reload': 'पुनः लोड करें',

  'checkbox.checked': 'हाँ',
  'checkbox.unchecked': 'नहीं',
};
