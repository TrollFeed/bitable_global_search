# Global Search for Feishu Bitable

A custom extension (sidebar widget) for [Feishu Bitable / Lark Base](https://www.feishu.cn/product/base) that lets you **search across every table in a base at once** and jump straight to the matching cell. Native Base search is scoped to a single table — this searches them all.

The interface is localized into **all 16 official Feishu / Lark languages** (`English`, `简体中文`, `繁體中文（台灣）`, `繁體中文（香港）`, `日本語`, `한국어`, `Français`, `Deutsch`, `Español`, `Português`, `Italiano`, `Русский`, `Bahasa Indonesia`, `Tiếng Việt`, `ไทย`, and `हिन्दी`), automatically matching Feishu's own language setting.

## Features

- 🔎 **Cross-table search** — one query scans every table/sheet in the base.
- ⚡ **Instant results** — an in-memory inverted index with prefix matching and debounced input; results update as you type, with progressive pagination (**Show more**) beyond 500 matches.
- 🎛️ **Search modes** — compose **Match Case** (`Aa`), **Match Whole Word** (`ab`, script- and identifier-aware across Latin, CJK, and `_`), **Fuzzy Match** (`≈`, Damerau-Levenshtein typo tolerance + compact CJK gapped matching), and **Regular Expression** (`.*`, with static ReDoS protection and execution time budget).
- 📤 **Results export** — export **all** matching cells (uncapped) as **CSV** (with UTF-8 BOM for Excel CJK compatibility), **JSON** (with query metadata and match offsets), or **copy as TSV** directly to the clipboard for pasting into spreadsheets.
- 中文 **CJK & Southeast Asian substring search** — Chinese, Japanese, Korean, Thai, Lao, Myanmar, and Khmer have no spaces between words, so text is indexed per character and verified against the cell. Searching `水晶球` finds it anywhere in `神奇的水晶球预测未来`, and `특별시` is found inside `서울특별시`.
- ⌨️ **IME-aware input** — while a pinyin/kana/Hangul composition is in progress the box is not searched, so you never see results for half-typed text.
- 🔤 **Width- and case-folding** — `abc` finds `ＡＢＣ` and vice versa by default (or distinguishes them when **Match Case** is active).
- 🎯 **Jump to the cell** — clicking a result switches to that table's grid view and focuses the exact matched cell (not a generic row popup).
- 👀 **Works without edit access** — viewers with read-only permission get the record card instead, showing the whole row (every field visible in the grid view, in column order), with a deep link / clipboard fallback as a last resort.
- ✨ **Match highlighting** — matched substrings are highlighted in each result (merging overlapping spans cleanly), and long cells are previewed *around* the first match rather than from their start.
- 💾 **User-scoped cache, then revalidate** — the previous index is restored from `localStorage` (isolated by Base ID, `getBaseUserId()`, and active checkbox locale) so search works immediately, while a fresh read runs in the background and swaps in atomically. Also listens for Base switches and table additions/deletions.
- 🌗 **Theme-aware** — follows Feishu Base's light/dark theme automatically.
- 🧩 **Broad field support** — text, number, select, user, date, URL, link, location, formula (including date-formatted formulas), object, and more (see below).

## Search Modes

| Toggle | Mode | Behavior |
| ------ | ---- | -------- |
| `Aa` | **Match Case** | Preserves uppercase/lowercase and full-width/half-width distinctions. |
| `ab` | **Whole Word** | Requires word boundaries on both sides. Treats `_` as an identifier character (`cat` does not match `cat_id`) while recognizing script transitions (`React` matches inside `使用React开发`, but not `ReactNative`). |
| `≈` | **Fuzzy Match** | Tolerates 1–2 character typos (insertions, deletions, substitutions, and adjacent transpositions) in Latin words and CJK phrases, plus compact CJK gapped subsequences, ranking exact matches strictly ahead of fuzzy hits. Mutually exclusive with `.*`. |
| `.*` | **Regex** | Evaluates JavaScript regular expressions (`/gmu` with `/gm` fallback for identity escapes like `\#`). Rejects nested-quantifier ReDoS patterns (`(a+)+$`) and enforces a wall-clock execution budget. Composes with `Aa` and `ab`. |

## Localization

The UI language is read from the host (`bitable.bridge.getLanguage()` / `getLocale()`), with a late-resolution callback so slow host startups still switch to Feishu's configured language once ready. Browser language is used only when running outside Feishu.

| Host tag(s) | UI Locale | Language |
| ----------- | --------- | -------- |
| `en`, `en-US`, … | `en` | English |
| `zh`, `zh-CN`, `zh-Hans`, … | `zh` | 简体中文 |
| `zh-TW`, `zh-Hant`, `zh-Hant-TW` | `zh-TW` | 繁體中文（台灣） |
| `zh-HK`, `zh-MO`, `zh-Hant-HK` | `zh-HK` | 繁體中文（香港） |
| `ja`, `ja-JP` | `ja` | 日本語 |
| `ko`, `ko-KR` | `ko` | 한국어 |
| `fr`, `fr-FR` | `fr` | Français |
| `de`, `de-DE` | `de` | Deutsch |
| `es`, `es-ES` | `es` | Español |
| `pt`, `pt-BR` | `pt` | Português |
| `it`, `it-IT` | `it` | Italiano |
| `ru`, `ru-RU` | `ru` | Русский |
| `id`, `id-ID` | `id` | Bahasa Indonesia |
| `vi`, `vi-VN` | `vi` | Tiếng Việt |
| `th`, `th-TH` | `th` | ไทย |
| `hi`, `hi-IN` | `hi` | हिन्दी |
| Anything else | `en` | English (fallback) |

### Adding or changing a language

1. Copy `src/i18n/locales/en.ts` to `src/i18n/locales/<code>.ts` and translate the values. The file is typed against the `Messages` interface, so a missing or misspelled key is a compile error.
2. Add the code to `Locale` / `SUPPORTED_LOCALES` in `src/i18n/messages.ts`, and register the catalogue, Intl tag and `<html lang>` value in `src/i18n/index.ts`.
3. `npm test` checks that every catalogue has exactly the keys English has and renders every message cleanly without placeholder leaks.

## Getting started

### Prerequisites

- Node.js 18+ (20+ to run the test suite)
- A Feishu/Lark account with access to a Base

### Install & run

```bash
npm install
npm start        # webpack dev server on http://localhost:6350
```

### Build for production

```bash
npm run build    # outputs relative-path static assets to dist/
npm run serve    # optional: serve dist/ locally on :6350 with CORS
```

### Feishu Plugin Store Publishing Checklist

1. Replace the placeholder IDs in [`app.json`](app.json) (`appId`) and [`block.json`](block.json) (`blockTypeID`, `url` using `https://`) with the credentials from your [Feishu Open Platform Console](https://open.feishu.cn/app).
2. Run `npm run typecheck && npm test && npm run build` to verify zero TypeScript errors, passing unit/fuzz tests, and clean production bundles in `dist/`.
3. Upload `dist/` via `@lark-opdev/cli` (`opdev upload`) or deploy `dist/` to an HTTPS static origin with CORS enabled (`Access-Control-Allow-Origin: *`). Production builds emit `./` relative chunk paths so CDN subpath hosting works out of the box.
4. No external network requests or third-party analytics exist in the extension — all indexing, search, caching, and CSV/JSON/TSV export run 100% locally inside the user's browser sandbox.

## Development

```bash
npm test             # run the Vitest suite once
npm run test:watch
npm run typecheck    # tsc --noEmit
```

### Project structure

```
src/
  App.tsx                     # top-level UI, search modes, pagination, export & indexing orchestration
  index.tsx                   # detects host language (with late-resolve listener), mounts React + error boundary
  components/                 # SearchInput (IME-aware + mode toggles), ExportMenu, result list, progress, error boundary
  hooks/
    useDebounce.ts
    useBitableTheme.ts        # syncs light/dark with the host
  i18n/
    messages.ts               # the Messages contract every language implements
    index.ts                  # locale resolution/detection, t(), formatters
    locales/*.ts              # all 16 Feishu/Lark language catalogues
  search/
    SearchIndex.ts            # inverted index, normal/fuzzy/regex/wholeWord/caseSensitive search, cache
                              #   (import-free on purpose: loadable without the SDK)
    preview.ts                # windows a long value around its first match
  services/
    BitableDataService.ts     # SDK access: read tables/records, user-scoped cache, lifecycle events, navigate to cell
  utils/
    exportResults.ts          # RFC-4180 CSV (UTF-8 BOM), JSON, clipboard TSV, safe filenames
```

### Supported field types

Text, Number, Single/Multi Select, Date, Checkbox, User, Phone, URL, Attachment (names), Single/Duplex Link, Lookup, Formula (including Date-formatted Formulas), Location, Group Chat, Created/Modified Time, Created/Modified User, Auto Number, Barcode, Progress, Currency, Rating, Email, Object.

## License

[MIT](LICENSE)
