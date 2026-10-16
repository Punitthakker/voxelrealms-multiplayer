import { PRESETS, Settings, Sfx, clamp, saveSettings } from './core.js';
import { Engine } from './render.js';
import { createStore, gameStore } from './stores.js';

/* ---------- 13b. Settings: what the settings sheet shows, and how a change takes effect ---------- */
// components/playforge/settings/SettingsModal.js renders settingsStore and calls applySetting(key, value).
// openSettings() / closeSettings() drive the sheet from anywhere (game menu, home).
export const PRESET_KEYS = ['low', 'medium', 'high'];
const snapshot = () => ({
  preset: Settings.preset, dynamicRes: !!Settings.dynamicRes, showFps: !!Settings.showFps, volume: clamp(Number(Settings.volume) || 0, 0, 100),
  sensitivity: clamp(Number(Settings.sensitivity) || 1, 0.2, 2), invertY: !!Settings.invertY, bubbles: !!Settings.bubbles,
});
export const settingsStore = createStore(Object.assign({ open: false }, snapshot()));
export function openSettings() { settingsStore.set({ open: true }); }
export function closeSettings() { settingsStore.set({ open: false }); }
export const presetHelp = key => (PRESETS[key] ? PRESETS[key].help : '');

// Applies one setting right away and saves it on this device.
export function applySetting(key, value) {
  switch (key) {
    case 'preset':
      if (!PRESETS[value] || value === Settings.preset) return;
      Settings.preset = value; saveSettings(); Engine.applyPreset(); Sfx.play('click');
      break;
    case 'dynamicRes':
      Settings.dynamicRes = !!value; saveSettings(); Engine.dynScale = 1; Engine.applyPixelRatio();
      break;
    case 'showFps':
      Settings.showFps = !!value; saveSettings(); gameStore.set({ fps: '' }); // the game loop fills it in every second
      break;
    case 'invertY': case 'bubbles':
      Settings[key] = !!value; saveSettings();
      break;
    case 'volume': {
      const v = clamp(Math.round(Number(value) || 0), 0, 100); if (v === Settings.volume) return;
      Settings.volume = v; Sfx.setVolume(v); saveSettings();
      break;
    }
    case 'sensitivity': {
      const v = clamp(Math.round((Number(value) || 1) * 10) / 10, 0.2, 2); if (v === Settings.sensitivity) return;
      Settings.sensitivity = v; saveSettings();
      break;
    }
    default: return;
  }
  settingsStore.set(snapshot());
}
