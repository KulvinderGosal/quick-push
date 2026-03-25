import { setState } from './state.js';

/**
 * Initialize the Settings screen.
 * Loads persisted settings from chrome.storage.local and wires up
 * the auto-extract toggle, default UTM inputs, and back button.
 */
export async function initSettings() {
  // ── Load stored settings ──────────────────────────────────────
  const stored = await chrome.storage.local.get('pe_settings');
  const settings = stored.pe_settings || {
    autoExtract: true,
    defaultUtmSource: '',
    defaultUtmMedium: ''
  };

  // ── DOM references ────────────────────────────────────────────
  const autoExtractCheckbox = document.getElementById('setting-auto-extract');
  const utmSourceInput      = document.getElementById('setting-utm-source');
  const utmMediumInput      = document.getElementById('setting-utm-medium');
  const backBtn             = document.getElementById('btn-back-settings');

  // ── Auto-extract toggle ───────────────────────────────────────
  if (autoExtractCheckbox) {
    autoExtractCheckbox.checked = settings.autoExtract;
    autoExtractCheckbox.addEventListener('change', () => {
      settings.autoExtract = autoExtractCheckbox.checked;
      saveSettings(settings);
    });
  }

  // ── Default UTM Source ────────────────────────────────────────
  if (utmSourceInput) {
    utmSourceInput.value = settings.defaultUtmSource;
    utmSourceInput.addEventListener('blur', () => {
      settings.defaultUtmSource = utmSourceInput.value.trim();
      saveSettings(settings);
    });
  }

  // ── Default UTM Medium ────────────────────────────────────────
  if (utmMediumInput) {
    utmMediumInput.value = settings.defaultUtmMedium;
    utmMediumInput.addEventListener('blur', () => {
      settings.defaultUtmMedium = utmMediumInput.value.trim();
      saveSettings(settings);
    });
  }

  // ── Back button ───────────────────────────────────────────────
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      setState('currentScreen', 'compose');
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────
async function saveSettings(settings) {
  await chrome.storage.local.set({ pe_settings: settings });
}
