// The search index persists to localStorage, which doesn't exist in the Node
// test environment. Provide a minimal in-memory implementation so cache paths
// can be exercised without pulling in jsdom/happy-dom.
class LocalStorageStub {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Install unconditionally via defineProperty. We deliberately do NOT read
// globalThis.localStorage first: Node 26 exposes an experimental localStorage
// getter that emits a warning on access, so probing it would be noisy. Our
// in-memory stub also keeps behavior deterministic across Node versions.
const localStorageStub = new LocalStorageStub() as unknown as Storage;
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageStub,
    configurable: true,
    writable: true,
  });
} catch {
  (globalThis as unknown as { localStorage: Storage }).localStorage = localStorageStub;
}
