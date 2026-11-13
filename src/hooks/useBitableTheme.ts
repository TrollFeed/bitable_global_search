import { useEffect } from 'react';

interface ThemeBridge {
  bridge?: {
    getTheme?: () => Promise<string>;
    onThemeChange?: (callback: (ev: unknown) => void) => (() => void) | void;
  };
}

/** Pulls the theme string out of whatever shape onThemeChange hands back. */
function readTheme(ev: unknown): string | undefined {
  if (!ev || typeof ev !== 'object') return undefined;
  const e = ev as { theme?: string; data?: { theme?: string } };
  return e.data?.theme ?? e.theme;
}

function applyTheme(theme: string | undefined): void {
  const normalized = String(theme).toUpperCase() === 'DARK' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', normalized);
}

/**
 * Syncs the extension's color scheme with Feishu Base's in-app theme. Sets a
 * `data-theme` attribute on <html> that the stylesheet keys off of, and keeps
 * it updated when the user toggles the host theme. No-ops gracefully when the
 * SDK/bridge isn't available (e.g. running outside Feishu).
 */
export function useBitableTheme(bitableInstance: unknown): void {
  useEffect(() => {
    const bridge = (bitableInstance as ThemeBridge | null)?.bridge;
    if (!bridge?.getTheme) return;

    let unsubscribe: (() => void) | void;

    bridge.getTheme().then(applyTheme).catch(() => {
      /* ignore — falls back to the prefers-color-scheme default */
    });

    try {
      unsubscribe = bridge.onThemeChange?.((ev) => applyTheme(readTheme(ev)));
    } catch {
      /* onThemeChange unavailable outside the host */
    }

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [bitableInstance]);
}
