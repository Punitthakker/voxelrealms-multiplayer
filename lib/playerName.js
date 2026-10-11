'use client';
// The player's display name, remembered per browser.
const KEY = 'voxelrealms:name';

export function loadName() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function storeName(name) {
  try { localStorage.setItem(KEY, name); } catch {}
}
