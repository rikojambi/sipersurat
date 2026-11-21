import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom 25 tidak menyediakan Blob.arrayBuffer()/text(); browser modern menyediakannya.
// Polyfill ini hanya untuk lingkungan pengujian agar kode produksi tetap memakai API standar.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    value: function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    }
  });
}
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Object.defineProperty(Blob.prototype, 'text', {
    configurable: true,
    value: function text(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    }
  });
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } })
  });
}

// fake-indexeddb memakai structuredClone global. Di jsdom, Blob tidak didukung clone bawaan
// dan berubah menjadi {}. Pertahankan referensi Blob (record bersifat immutable dalam uji)
// sambil tetap mengkloning objek/array seperti IndexedDB pada browser nyata.
const nativeStructuredClone = globalThis.structuredClone?.bind(globalThis);
function cloneForIndexedDb(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value instanceof Blob) return value;
  if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return nativeStructuredClone ? nativeStructuredClone(value) : value;
  }
  if (Array.isArray(value)) return value.map((item) => cloneForIndexedDb(item, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return seen.get(value);
    const out: Record<string, unknown> = {};
    seen.set(value, out);
    for (const [key, item] of Object.entries(value)) out[key] = cloneForIndexedDb(item, seen);
    return out;
  }
  return value;
}
globalThis.structuredClone = cloneForIndexedDb as typeof structuredClone;
