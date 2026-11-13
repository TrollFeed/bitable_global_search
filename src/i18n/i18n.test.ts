import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveLocale,
  detectHostLocale,
  setLocale,
  getLocale,
  t,
  SUPPORTED_LOCALES,
  type Locale,
} from './index';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { zhTW } from './locales/zh-TW';
import { zhHK } from './locales/zh-HK';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { es } from './locales/es';
import { pt } from './locales/pt';
import { it as itLocale } from './locales/it';
import { ru } from './locales/ru';
import { id } from './locales/id';
import { vi as viLocale } from './locales/vi';
import { th } from './locales/th';
import { hi } from './locales/hi';

// Catalogues viewed as plain bags of values, for structural comparisons.
const CATALOGS = {
  en,
  zh,
  'zh-TW': zhTW,
  'zh-HK': zhHK,
  ja,
  ko,
  fr,
  de,
  es,
  pt,
  it: itLocale,
  ru,
  id,
  vi: viLocale,
  th,
  hi,
} as unknown as Record<Locale, Record<string, unknown>>;

const bag = (catalog: object) => catalog as Record<string, unknown>;

// `t` is typed per key; the sweep below calls it with data-driven keys.
const tLoose = t as unknown as (key: string, params?: unknown) => string;

beforeEach(() => {
  setLocale('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveLocale', () => {
  it.each([
    ['en', 'en'],
    ['en-US', 'en'],
    ['en_GB', 'en'],
    ['zh', 'zh'],
    ['zh-CN', 'zh'],
    ['zh_CN', 'zh'],
    ['zh-SG', 'zh'],
    ['zh-Hans', 'zh'],
    ['zh-TW', 'zh-TW'],
    ['zh_TW', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['zh-Hant-TW', 'zh-TW'],
    ['zh-HK', 'zh-HK'],
    ['zh_HK', 'zh-HK'],
    ['zh-MO', 'zh-HK'],
    ['zh-Hant-HK', 'zh-HK'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['ko', 'ko'],
    ['ko-KR', 'ko'],
    ['KO-kr', 'ko'],
    [' ja ', 'ja'],
    ['fr', 'fr'],
    ['fr-FR', 'fr'],
    ['de', 'de'],
    ['de-DE', 'de'],
    ['es', 'es'],
    ['es-ES', 'es'],
    ['pt', 'pt'],
    ['pt-BR', 'pt'],
    ['it', 'it'],
    ['it-IT', 'it'],
    ['ru', 'ru'],
    ['ru-RU', 'ru'],
    ['id', 'id'],
    ['id-ID', 'id'],
    ['vi', 'vi'],
    ['vi-VN', 'vi'],
    ['th', 'th'],
    ['th-TH', 'th'],
    ['hi', 'hi'],
    ['hi-IN', 'hi'],
  ])('%s -> %s', (tag, expected) => {
    expect(resolveLocale(tag)).toBe(expected);
  });

  it.each(['nl', 'nl-NL', 'pl', 'sv', 'ar', 'tr', 'xx', ''])(
    'falls back to English for unsupported tag %j',
    (tag) => {
      expect(resolveLocale(tag)).toBe('en');
    }
  );

  it.each([undefined, null, 42, {}, []])('falls back to English for non-string %j', (value) => {
    expect(resolveLocale(value)).toBe('en');
  });
});

describe('catalogues', () => {
  const englishKeys = Object.keys(en).sort();

  it('covers all 16 official Feishu / Lark locales', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(16);
  });

  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))(
    '%s defines exactly the keys English does',
    (locale) => {
      expect(Object.keys(CATALOGS[locale]).sort()).toEqual(englishKeys);
    }
  );

  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))(
    '%s uses the same string/function shape as English',
    (locale) => {
      for (const key of englishKeys) {
        expect(typeof CATALOGS[locale][key], `${locale}:${key}`).toBe(typeof bag(en)[key]);
      }
    }
  );

  // Every message must interpolate the values it is given and never leak a
  // placeholder, `undefined` or `[object Object]`.
  const SAMPLES: Record<string, unknown> = {
    'status.indexingTable': { table: 'TBL_NAME', rows: 4321 },
    'status.indexingGeneric': { rows: 4321 },
    'cache.loaded': { time: Date.UTC(2026, 9, 13, 12, 30) },
    'cache.updating': { time: Date.UTC(2026, 9, 13, 12, 30) },
    'results.found': { matches: 17, tables: 3 },
    'results.showingFirst': { shown: 500, total: 1234 },
    'results.showMore': { count: 250 },
    'results.none': { query: 'QUERY_TEXT' },
    'group.matches': { count: 12 },
    'index.rows': { count: 321 },
    'error.partial': { count: 2, names: 'NAME_A, NAME_B' },
    'error.regexInvalid': { reason: 'SYNTAX_REASON' },
    'toast.viewOpened': { table: 'TBL_NAME', field: 'FIELD_NAME' },
    'toast.exported': { count: 42, format: 'CSV' },
    'toast.copiedResults': { count: 42 },
  };

  describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
    it('renders every message to a clean, non-empty string', () => {
      setLocale(locale);
      for (const key of englishKeys) {
        const out = tLoose(key, SAMPLES[key]);
        expect(out, `${locale}:${key}`).toBeTypeOf('string');
        expect(out.trim(), `${locale}:${key}`).not.toBe('');
        expect(out, `${locale}:${key}`).not.toMatch(/undefined|\[object|\$\{|\{\w+\}/);
      }
    });

    it('carries its interpolated values through', () => {
      setLocale(locale);
      expect(t('status.indexingTable', { table: 'TBL_NAME', rows: 4321 })).toContain('TBL_NAME');
      expect(t('results.none', { query: 'QUERY_TEXT' })).toContain('QUERY_TEXT');
      expect(t('error.partial', { count: 2, names: 'NAME_A, NAME_B' })).toContain('NAME_A, NAME_B');
      expect(t('error.regexInvalid', { reason: 'SYNTAX_REASON' })).toContain('SYNTAX_REASON');

      const opened = t('toast.viewOpened', { table: 'TBL_NAME', field: 'FIELD_NAME' });
      expect(opened).toContain('TBL_NAME');
      expect(opened).toContain('FIELD_NAME');

      const found = t('results.found', { matches: 17, tables: 3 });
      expect(found).toContain('17');
      expect(found).toContain('3');

      const exported = t('toast.exported', { count: 42, format: 'CSV' });
      expect(exported).toContain('42');
      expect(exported).toContain('CSV');

      expect(t('toast.copiedResults', { count: 42 })).toContain('42');
    });
  });
});

describe('translation', () => {
  it('returns the catalogue string for the current locale', () => {
    setLocale('zh');
    expect(t('app.title')).toBe('全局搜索');
    setLocale('zh-TW');
    expect(t('app.title')).toBe('全域搜尋');
    setLocale('zh-HK');
    expect(t('app.title')).toBe('全局搜尋');
    setLocale('ja');
    expect(t('app.title')).toBe('グローバル検索');
    setLocale('ko');
    expect(t('app.title')).toBe('전체 검색');
    setLocale('fr');
    expect(t('app.title')).toBe('Recherche globale');
    setLocale('ru');
    expect(t('app.title')).toBe('Глобальный поиск');
    setLocale('en');
    expect(t('app.title')).toBe('Global Search');
  });

  it('pluralises English and Russian correctly', () => {
    expect(t('results.found', { matches: 1, tables: 1 })).toBe('Found 1 match in 1 sheet');
    expect(t('results.found', { matches: 2, tables: 3 })).toBe('Found 2 matches in 3 sheets');
    expect(t('group.matches', { count: 1 })).toBe('1 match');
    expect(t('group.matches', { count: 5 })).toBe('5 matches');
    expect(t('index.rows', { count: 1 })).toBe('1 row');

    setLocale('ru');
    expect(t('group.matches', { count: 1 })).toContain('совпадение');
    expect(t('group.matches', { count: 3 })).toContain('совпадения');
    expect(t('group.matches', { count: 5 })).toContain('совпадений');
    expect(t('group.matches', { count: 11 })).toContain('совпадений');
  });

  it('formats numbers with the locale', () => {
    expect(t('index.rows', { count: 1234567 })).toBe('1,234,567 rows');
  });

  it('falls back to English for a key a catalogue lacks', () => {
    const saved = bag(zh)['app.title'];
    delete bag(zh)['app.title'];
    try {
      setLocale('zh');
      expect(t('app.title')).toBe('Global Search');
    } finally {
      bag(zh)['app.title'] = saved;
    }
  });
});

describe('setLocale', () => {
  it('keeps <html lang> and the page title in step across scripts', () => {
    const doc = { documentElement: { lang: 'en' }, title: '' };
    vi.stubGlobal('document', doc);

    setLocale('ja');
    expect(doc.documentElement.lang).toBe('ja');
    expect(doc.title).toBe('グローバル検索');

    setLocale('zh');
    expect(doc.documentElement.lang).toBe('zh-CN');
    expect(getLocale()).toBe('zh');

    setLocale('zh-TW');
    expect(doc.documentElement.lang).toBe('zh-TW');
    expect(doc.title).toBe('全域搜尋');

    setLocale('zh-HK');
    expect(doc.documentElement.lang).toBe('zh-HK');
  });
});

describe('detectHostLocale', () => {
  const bridge = (impl: object) => ({ bridge: impl });

  it('follows the language the host reports across Feishu locales', async () => {
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'ja' }))).toBe('ja');
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'zh-TW' }))).toBe('zh-TW');
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'zh-HK' }))).toBe('zh-HK');
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'ko' }))).toBe('ko');
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'fr' }))).toBe('fr');
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'th' }))).toBe('th');
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'hi' }))).toBe('hi');
  });

  it('uses English when the host reports a language we do not translate', async () => {
    vi.stubGlobal('navigator', { languages: ['ja-JP'], language: 'ja-JP' });
    // The host spoke: do not second-guess it with the browser's language.
    expect(await detectHostLocale(bridge({ getLanguage: async () => 'nl' }))).toBe('en');
  });

  it('asks for the locale when the language call fails', async () => {
    const host = bridge({
      getLanguage: async () => {
        throw new Error('nope');
      },
      getLocale: async () => 'ko-KR',
    });
    expect(await detectHostLocale(host)).toBe('ko');
  });

  it('falls back to the browser language when the host has nothing to say', async () => {
    vi.stubGlobal('navigator', { languages: ['zh-CN', 'en'], language: 'zh-CN' });
    expect(await detectHostLocale(bridge({}))).toBe('zh');
    expect(await detectHostLocale(undefined)).toBe('zh');
  });

  it('does not wait forever on a host that never answers', async () => {
    vi.stubGlobal('navigator', { languages: ['ja'], language: 'ja' });
    const silent = bridge({ getLanguage: () => new Promise(() => {}) });

    const started = Date.now();
    const locale = await detectHostLocale(silent, 40);

    expect(locale).toBe('ja');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('notifies onLateResolve if a slow host bridge answers after the initial timeout', async () => {
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });

    let finishHost!: (lang: string) => void;
    const slowHost = bridge({
      getLanguage: () =>
        new Promise<string>((resolve) => {
          finishHost = resolve;
        }),
    });

    const lateSpy = vi.fn();
    const initial = await detectHostLocale(slowHost, 20, lateSpy);
    expect(initial).toBe('en');
    expect(lateSpy).not.toHaveBeenCalled();

    finishHost('zh-TW');
    await new Promise((r) => setTimeout(r, 10));
    expect(lateSpy).toHaveBeenCalledTimes(1);
    expect(lateSpy).toHaveBeenCalledWith('zh-TW');
  });
});
