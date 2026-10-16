'use client';
import { useSyncExternalStore } from 'react';

// Subscribes a component to an engine store (playforge/engine/stores.js).
// selector must return a value that only changes when the store changes (a slice or a primitive),
// never a freshly built object or array.
const noop = () => () => {};
export function useStore(store, selector) {
  const get = () => (store ? (selector ? selector(store.get()) : store.get()) : undefined);
  return useSyncExternalStore(store ? store.subscribe : noop, get, get);
}
