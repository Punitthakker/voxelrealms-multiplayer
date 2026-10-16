import { $, $$, Modals, PRESETS, Settings, Sfx, saveSettings } from './core.js';
import { Engine } from './render.js';

/* ---------- 13b. Settings sheet ---------- */
export function syncSettingsUI() {
  $$('#set-preset [data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === Settings.preset)));
  $('#preset-help').textContent = PRESETS[Settings.preset].help;
  $('#set-dynres').checked = Settings.dynamicRes; $('#set-fps').checked = Settings.showFps; $('#set-invert').checked = Settings.invertY;
  $('#set-bubbles').checked = Settings.bubbles;
  $('#set-vol').value = Settings.volume; $('#set-vol-v').textContent = String(Settings.volume);
  $('#set-sens').value = Settings.sensitivity; $('#set-sens-v').textContent = Number(Settings.sensitivity).toFixed(1) + '×';
}
export function openSettings() { syncSettingsUI(); Modals.open($('#settings-modal')); }
export function bindSettings() {
  $('#set-preset').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]'); if (!b || b.dataset.preset === Settings.preset) return;
    Settings.preset = b.dataset.preset; saveSettings(); syncSettingsUI(); Engine.applyPreset(); Sfx.play('click');
  });
  $('#set-dynres').addEventListener('change', e => { Settings.dynamicRes = e.target.checked; saveSettings(); Engine.dynScale = 1; Engine.applyPixelRatio(); });
  $('#set-fps').addEventListener('change', e => { Settings.showFps = e.target.checked; saveSettings(); $('#hud-fps').hidden = !Settings.showFps; });
  $('#set-invert').addEventListener('change', e => { Settings.invertY = e.target.checked; saveSettings(); });
  $('#set-bubbles').addEventListener('change', e => { Settings.bubbles = e.target.checked; saveSettings(); });
  const vol = $('#set-vol');
  vol.addEventListener('input', () => { Settings.volume = +vol.value; $('#set-vol-v').textContent = vol.value; Sfx.setVolume(Settings.volume); });
  vol.addEventListener('change', () => { saveSettings(); Sfx.play('click'); });
  const sens = $('#set-sens');
  sens.addEventListener('input', () => { Settings.sensitivity = +sens.value; $('#set-sens-v').textContent = Number(sens.value).toFixed(1) + '×'; });
  sens.addEventListener('change', saveSettings);
}
