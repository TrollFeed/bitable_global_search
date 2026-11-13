import { useSyncExternalStore } from 'react';
import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type Formatters,
  type Locale,
  type MessageKey,
  type Messages,
} from './messages';
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
import { it } from './locales/it';
import { ru } from './locales/ru';
import { id } from './locales/id';
import { vi } from './locales/vi';
import { th } from './locales/th';
import { hi } from './locales/hi';

export { FALLBACK_LOCALE, SUPPORTED_LOCALES };
export type { Locale, MessageKey, Messages, Formatters };

const CATALOGS: Record<Locale, Messages> = {
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
  it,
  ru,
  id,
  vi,
  th,
  hi,
};

// BCP-47 tag handed to Intl, so numbers and dates follow the UI language.
const INTL_TAG: Record<Locale, string> = {
  en: 'en-US',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  'zh-HK': 'zh-HK',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-BR',
  it: 'it-IT',
  ru: 'ru-RU',
  id: 'id-ID',
  vi: 'vi-VN',
  th: 'th-TH',
  hi: 'hi-IN',
};

// <html lang>. Besides accessibility, this is what makes the browser pick the
// right regional glyphs for shared Han characters (Simplified vs Taiwan/HK vs Japanese).
const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  'zh-HK': 'zh-HK',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  pt: 'pt-BR',
  it: 'it',
  ru: 'ru',
  id: 'id',
  vi: 'vi',
  th: 'th',
  hi: 'hi',
};

/**
 * Maps any language tag the host or browser might give us onto one of the 16
 * official Feishu / Lark locales. Traditional Chinese tags route to `zh-TW` or
 * `zh-HK`, Simplified Chinese to `zh`, and any unsupported language falls back
 * to English.
 */
export function resolveLocale(tag: unknown): Locale {
  if (typeof tag !== 'string') return FALLBACK_LOCALE;

  const norm = tag.trim().toLowerCase().replace(/_/g, '-');
  if (!norm) return FALLBACK_LOCALE;

  const parts = norm.split('-');
  const primary = parts[0];

  if (primary === 'zh') {
    if (parts.includes('hk') || parts.includes('mo')) return 'zh-HK';
    if (parts.includes('tw') || parts.includes('hant')) return 'zh-TW';
    return 'zh';
  }

  return (SUPPORTED_LOCALES as readonly string[]).includes(primary)
    ? (primary as Locale)
    : FALLBACK_LOCALE;
}

// ---------------------------------------------------------------------------
// Current locale
// ---------------------------------------------------------------------------

let currentLocale: Locale = FALLBACK_LOCALE;
const subscribers = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;

  if (typeof document !== 'undefined') {
    document.documentElement.lang = HTML_LANG[locale];
    document.title = t('app.title');
  }

  for (const notify of Array.from(subscribers)) notify();
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Re-renders the calling component when the locale changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface LanguageBridge {
  getLanguage?: () => Promise<unknown>;
  getLocale?: () => Promise<unknown>;
}

function browserLanguage(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.languages?.[0] || navigator.language || undefined;
}

/**
 * Works out the language the host app is displayed in.
 *
 * The Base host's own setting wins: a user can run Feishu in English on a
 * Chinese browser, and the extension should follow Feishu. The browser's
 * language is only a fallback for when the host cannot answer in time (or the
 * page is opened outside Feishu). If a slow host bridge answers after the
 * initial timeout, `onLateResolve` notifies the caller so the UI can switch to
 * the authoritative Feishu language as soon as the bridge is ready.
 */
export async function detectHostLocale(
  bitable: unknown,
  timeoutMs = 800,
  onLateResolve?: (locale: Locale) => void
): Promise<Locale> {
  const bridge = (bitable as { bridge?: LanguageBridge } | null | undefined)?.bridge;
  const deadline = Date.now() + timeoutMs;
  const minStepMs = Math.max(10, Math.floor(timeoutMs / 2));
  let hostAnswered = false;

  const ask = async (method: 'getLanguage' | 'getLocale'): Promise<string | undefined> => {
    const fn = bridge?.[method];
    if (typeof fn !== 'function') return undefined;

    const waitMs = Math.max(minStepMs, deadline - Date.now());
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const call = Promise.resolve()
      .then(() => fn.call(bridge))
      .then(
        (answer) => {
          const valid = typeof answer === 'string' && answer.trim() ? answer : undefined;
          if (valid && !hostAnswered) {
            hostAnswered = true;
            if (timedOut) onLateResolve?.(resolveLocale(valid));
          }
          return valid;
        },
        () => undefined
      );

    try {
      return await Promise.race([
        call,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve(undefined);
          }, waitMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const fromHost = (await ask('getLanguage')) ?? (await ask('getLocale'));
  return resolveLocale(fromHost ?? browserLanguage());
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const formatterCache = new Map<Locale, Formatters>();

function formattersFor(locale: Locale): Formatters {
  let cached = formatterCache.get(locale);
  if (!cached) {
    const tag = INTL_TAG[locale];
    const numberFormat = new Intl.NumberFormat(tag);
    const dateFormat = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' });
    cached = {
      number: (value) => numberFormat.format(value),
      dateTime: (timestamp) => dateFormat.format(new Date(timestamp)),
    };
    formatterCache.set(locale, cached);
  }
  return cached;
}

export function formatNumber(value: number): string {
  return formattersFor(currentLocale).number(value);
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

type ParamsOf<K extends MessageKey> = Messages[K] extends (p: infer P, ...rest: never[]) => string
  ? P
  : never;

/**
 * Looks up a message in the current locale, falling back to English for a key
 * a catalogue lacks. Messages that take parameters are called with them plus
 * the locale's formatters.
 */
export function t<K extends MessageKey>(
  key: K,
  ...args: Messages[K] extends string ? [] : [ParamsOf<K>]
): string {
  const entry = CATALOGS[currentLocale][key] ?? en[key];

  if (typeof entry === 'function') {
    return (entry as (params: unknown, f: Formatters) => string)(
      args[0],
      formattersFor(currentLocale)
    );
  }
  return entry as string;
}
