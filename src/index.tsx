import React from 'react';
import { createRoot } from 'react-dom/client';
import { bitable } from '@lark-base-open/js-sdk';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { detectHostLocale, setLocale } from './i18n';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) return;

  // Resolve the language before the first paint so the panel never flashes in
  // the wrong one. Detection is time-bounded and cannot fail, and if a slow
  // host bridge finishes booting afterwards, the callback switches the UI over.
  const initialLocale = await detectHostLocale(bitable, 800, (lateLocale) => {
    setLocale(lateLocale);
  });
  setLocale(initialLocale);

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

void bootstrap();
