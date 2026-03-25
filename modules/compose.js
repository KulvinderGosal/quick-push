// modules/compose.js
// Campaign composition: pre-fill, segments, scheduling, send/draft flow

import { getState, setState, on } from './state.js';
import * as api from './api.js';
import { generateNotificationCopy } from './ai.js';
import { sanitizePageData, setText, sanitizeImageUrl } from './sanitize.js';
import {
  canReadSegment, canWriteSegment, canWriteScheduleNotification,
  canWriteTimezoneNotification, canWriteMultiActionBtn,
  hasLargeImagePermission, notificationQuota
} from './permissions.js';
import { preSendCheck, recordSend, formatWait } from './safeguards.js';
import { confirm as confirmModal, alert as alertModal } from './modal.js';
import { initAccordions, lockAccordion } from './accordion.js';

// ── Constants ──────────────────────────────────────────────
const TITLE_MAX = 85;
const MESSAGE_MAX = 135;
const COUNTER_WARN = 0.8;
const COUNTER_DANGER = 0.95;
const PREFS_KEY = 'pe_compose_prefs';
const DRAFT_KEY = 'pe_compose_draft';
const DRAFT_DEBOUNCE_MS = 1500;

// ── Helpers ────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function convertTo24h(timeStr) {
  // Already 24h from <input type="time"> — return as-is
  if (!timeStr) return '00:00:00';
  const parts = timeStr.split(':');
  const h = parts[0] || '00';
  const m = parts[1] || '00';
  return `${h}:${m}:00`;
}

function showToast(message, type = 'success') {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast--${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function urlHint(url) {
  if (!url) return '';
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    // Only show hint if it's a social/external platform (not the page itself)
    const socials = ['youtube.com', 'youtu.be', 'instagram.com', 'twitter.com', 'x.com',
      'facebook.com', 'fb.com', 'linkedin.com', 'tiktok.com', 'pinterest.com',
      'spotify.com', 'anchor.fm', 'podcasts.apple.com', 'reddit.com'];
    if (socials.some(s => hostname.includes(s))) {
      const short = hostname.replace('.com', '').replace('.fm', '');
      return ' → ' + short;
    }
  } catch {}
  return '';
}

function setLoading(on) {
  const overlay = $('loading-overlay');
  if (overlay) overlay.classList.toggle('hidden', !on);
}

function updateCounter(inputEl, counterEl, max) {
  const len = (inputEl.value || '').length;
  counterEl.textContent = `${len} / ${max}`;
  counterEl.classList.remove('counter-warn', 'counter-danger');
  if (len >= max * COUNTER_DANGER) {
    counterEl.classList.add('counter-danger');
  } else if (len >= max * COUNTER_WARN) {
    counterEl.classList.add('counter-warn');
  }
}

function createSegmentItem(segment) {
  const li = document.createElement('li');
  li.className = 'segment-item';

  const label = document.createElement('label');
  label.className = 'segment-item';

  const name = segment.segment_name || segment.name || '';
  const subs = segment.subscribers || segment.subscribers_count || 0;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = segment.segment_id || segment.id;
  checkbox.setAttribute('aria-label', name);
  checkbox.dataset.subscribers = subs;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'segment-item-label';
  nameSpan.textContent = name;

  const countSpan = document.createElement('span');
  countSpan.className = 'segment-item-count';
  countSpan.textContent = subs.toLocaleString();

  label.appendChild(checkbox);
  label.appendChild(nameSpan);
  label.appendChild(countSpan);
  li.appendChild(label);

  return li;
}

// ── Compose preferences (persisted across sessions) ─────────

async function getPrefs() {
  try {
    const stored = await chrome.storage.local.get(PREFS_KEY);
    return stored[PREFS_KEY] || {};
  } catch { return {}; }
}

function saveComposePrefs() {
  const prefs = {};
  // UTM — only save the enabled toggle. Field values regenerate fresh each
  // session from AI > site API defaults > page scraping. Saving field values
  // would lock in stale defaults and override page-specific data.
  prefs.utmEnabled = $('utm-enable')?.checked || false;
  // Action buttons
  const btn1Label = ($('action-btn-1-label')?.value || '').trim();
  const btn1Url = ($('action-btn-1-url')?.value || '').trim();
  prefs.hasActionBtn1 = !!(btn1Label && btn1Url);
  if (prefs.hasActionBtn1) {
    prefs.actionBtn1Label = btn1Label;
    prefs.actionBtn1Url = btn1Url;
  }
  const group2 = $('action-btn-2-group');
  const btn2Visible = group2 && !group2.classList.contains('hidden');
  const btn2Label = ($('action-btn-2-label')?.value || '').trim();
  const btn2Url = ($('action-btn-2-url')?.value || '').trim();
  prefs.usesTwoButtons = btn2Visible && !!(btn2Label && btn2Url);
  if (prefs.usesTwoButtons) {
    prefs.actionBtn2Label = btn2Label;
    prefs.actionBtn2Url = btn2Url;
  }
  // Schedule preference
  prefs.scheduleType = getState('compose.scheduleType') || 'now';
  prefs.usesTimezone = $('schedule-subscriber-tz')?.checked || false;
  // Large image usage
  const featuredImg = $('featured-preview-img');
  prefs.usesLargeImage = featuredImg && !featuredImg.classList.contains('hidden') && !!featuredImg.src;

  chrome.storage.local.set({ [PREFS_KEY]: prefs }).catch(() => {});
}

async function restoreComposePrefs() {
  const prefs = await getPrefs();
  if (!Object.keys(prefs).length) return prefs;

  // UTM — only restore the enabled toggle. Field values are set fresh by setupUtm()
  // from AI > site API defaults > page scraping.
  const utmEnable = $('utm-enable');
  const utmFields = $('utm-fields');
  const utmSummary = $('utm-summary');
  if (utmEnable) {
    const enabled = prefs.utmEnabled !== false; // default to enabled
    utmEnable.checked = enabled;
    if (utmFields) utmFields.classList.toggle('hidden', !enabled);
    if (utmSummary) utmSummary.textContent = enabled ? 'Enabled' : 'Disabled';
    setState('compose.utmEnabled', enabled);
  }

  // Action buttons — prefill with saved values
  if (prefs.hasActionBtn1) {
    const l = $('action-btn-1-label');
    const u = $('action-btn-1-url');
    if (l) l.value = prefs.actionBtn1Label || '';
    if (u) u.value = prefs.actionBtn1Url || '';
  }
  if (prefs.usesTwoButtons) {
    const group2 = $('action-btn-2-group');
    const addBtn2 = $('btn-add-action-2');
    if (group2) group2.classList.remove('hidden');
    if (addBtn2) addBtn2.classList.add('hidden');
    const l2 = $('action-btn-2-label');
    const u2 = $('action-btn-2-url');
    if (l2) l2.value = prefs.actionBtn2Label || '';
    if (u2) u2.value = prefs.actionBtn2Url || '';
  }

  // Schedule — restore preference
  if (prefs.scheduleType === 'later') {
    const laterRadio = document.querySelector('input[name="schedule-type"][value="later"]');
    if (laterRadio) {
      laterRadio.checked = true;
      laterRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (prefs.usesTimezone) {
    const tz = $('schedule-subscriber-tz');
    if (tz) tz.checked = true;
  }

  return prefs;
}

// ── Compose draft auto-save (persisted across popup close/reopen) ──

let _draftTimer = null;

function draftKey() {
  const siteId = getState('activeSiteId');
  const pageUrl = getState('pageData')?.url || '';
  // Scope draft by site + page URL so navigating to a new page starts fresh
  const urlSlug = pageUrl ? '_' + simpleHash(pageUrl) : '';
  return siteId ? `${DRAFT_KEY}_${siteId}${urlSlug}` : DRAFT_KEY;
}

// Simple string hash for URL-scoped draft keys (not crypto, just deduplication)
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function saveDraft() {
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(() => {
    const draft = {
      title: $('campaign-title')?.value || '',
      message: $('campaign-message')?.value || '',
      url: $('campaign-url')?.value || '',
      bigImage: getState('compose.bigImage') || '',
      // Segments
      audienceType: getState('compose.audienceType') || 'all',
      selectedSegments: getState('compose.segments') || [],
      // Action buttons
      btn1Label: $('action-btn-1-label')?.value || '',
      btn1Url: $('action-btn-1-url')?.value || '',
      btn2Visible: !$('action-btn-2-group')?.classList.contains('hidden'),
      btn2Label: $('action-btn-2-label')?.value || '',
      btn2Url: $('action-btn-2-url')?.value || '',
      // UTM — save all values in draft (URL-scoped, preserves AI-generated UTM on same page)
      utmEnabled: $('utm-enable')?.checked || false,
      utmSource: $('utm-source')?.value || '',
      utmMedium: $('utm-medium')?.value || '',
      utmCampaign: $('utm-campaign')?.value || '',
      utmTerm: $('utm-term')?.value || '',
      utmContent: $('utm-content')?.value || '',
      // Schedule
      scheduleType: getState('compose.scheduleType') || 'now',
      scheduleDate: $('schedule-date')?.value || '',
      scheduleTime: $('schedule-time')?.value || '',
      timezoneSend: $('schedule-subscriber-tz')?.checked || false,
      // Metadata
      savedAt: Date.now(),
      pageUrl: getState('pageData')?.url || ''
    };
    const key = draftKey();
    chrome.storage.local.set({ [key]: draft }).catch(() => {});
    // Clean up old drafts for this site (keep only current page's draft)
    cleanOldDrafts(key);
  }, DRAFT_DEBOUNCE_MS);
}

async function cleanOldDrafts(currentKey) {
  try {
    const siteId = getState('activeSiteId');
    if (!siteId) return;
    const prefix = `${DRAFT_KEY}_${siteId}`;
    const all = await chrome.storage.local.get(null);
    const staleKeys = Object.keys(all).filter(k =>
      k.startsWith(prefix) && k !== currentKey
    );
    if (staleKeys.length > 0) {
      chrome.storage.local.remove(staleKeys).catch(() => {});
    }
  } catch {}
}

async function restoreDraft() {
  try {
    const key = draftKey();
    const stored = await chrome.storage.local.get(key);
    const draft = stored[key];
    if (!draft || !draft.savedAt) return false;

    // Only restore if draft is less than 24 hours old
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      chrome.storage.local.remove(key).catch(() => {});
      return false;
    }

    // Draft key is URL-scoped, so if we found one it's for this exact page.
    // Still require meaningful content to restore.
    const hasMeaningfulContent = (draft.title || '').trim() || (draft.message || '').trim();
    if (!hasMeaningfulContent) return false;

    // Restore form fields
    const titleInput = $('campaign-title');
    const messageInput = $('campaign-message');
    const urlInput = $('campaign-url');
    const titleCounter = $('title-counter');
    const messageCounter = $('message-counter');

    if (titleInput && draft.title) {
      titleInput.value = draft.title;
      if (titleCounter) updateCounter(titleInput, titleCounter, TITLE_MAX);
      setState('compose.title', draft.title);
    }
    if (messageInput && draft.message) {
      messageInput.value = draft.message;
      if (messageCounter) updateCounter(messageInput, messageCounter, MESSAGE_MAX);
      setState('compose.message', draft.message);
    }
    if (urlInput && draft.url) {
      urlInput.value = draft.url;
      setState('compose.url', draft.url);
    }

    // Restore big image
    if (draft.bigImage) {
      const featuredImg = $('featured-preview-img');
      const featuredPlaceholder = $('featured-placeholder');
      if (featuredImg) {
        featuredImg.src = draft.bigImage;
        featuredImg.classList.remove('hidden');
        if (featuredPlaceholder) featuredPlaceholder.classList.add('hidden');
        setState('compose.bigImage', draft.bigImage);
      }
    }

    // Restore action buttons
    if (draft.btn1Label) {
      const l = $('action-btn-1-label');
      if (l) l.value = draft.btn1Label;
    }
    if (draft.btn1Url) {
      const u = $('action-btn-1-url');
      if (u) u.value = draft.btn1Url;
    }
    if (draft.btn2Visible) {
      const group2 = $('action-btn-2-group');
      const addBtn2 = $('btn-add-action-2');
      if (group2) group2.classList.remove('hidden');
      if (addBtn2) addBtn2.classList.add('hidden');
      const l2 = $('action-btn-2-label');
      const u2 = $('action-btn-2-url');
      if (l2 && draft.btn2Label) l2.value = draft.btn2Label;
      if (u2 && draft.btn2Url) u2.value = draft.btn2Url;
    }

    // Restore UTM
    const utmEnable = $('utm-enable');
    const utmFields = $('utm-fields');
    if (utmEnable && draft.utmEnabled !== undefined) {
      utmEnable.checked = draft.utmEnabled;
      if (utmFields) utmFields.classList.toggle('hidden', !draft.utmEnabled);
      setState('compose.utmEnabled', draft.utmEnabled);
    }
    // Restore UTM field values from draft (URL-scoped, preserves AI-generated values)
    // setupUtm() already set page-scraped defaults; draft overrides only if values exist
    if (draft.utmSource) { const el = $('utm-source'); if (el) el.value = draft.utmSource; }
    if (draft.utmMedium) { const el = $('utm-medium'); if (el) el.value = draft.utmMedium; }
    if (draft.utmCampaign) { const el = $('utm-campaign'); if (el) el.value = draft.utmCampaign; }
    if (draft.utmTerm) { const el = $('utm-term'); if (el) el.value = draft.utmTerm; }
    if (draft.utmContent) { const el = $('utm-content'); if (el) el.value = draft.utmContent; }

    // Restore schedule
    if (draft.scheduleType === 'later') {
      const laterRadio = document.querySelector('input[name="schedule-type"][value="later"]');
      if (laterRadio) {
        laterRadio.checked = true;
        laterRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (draft.scheduleDate && $('schedule-date')) $('schedule-date').value = draft.scheduleDate;
      if (draft.scheduleTime && $('schedule-time')) $('schedule-time').value = draft.scheduleTime;
    }
    if (draft.timezoneSend) {
      const tz = $('schedule-subscriber-tz');
      if (tz) tz.checked = true;
    }

    // Restore segment selections (after segments render)
    if (draft.audienceType === 'select' && draft.selectedSegments?.length) {
      const selectRadio = document.querySelector('input[name="segment-target"][value="select"]');
      if (selectRadio) {
        selectRadio.checked = true;
        selectRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setState('compose.segments', draft.selectedSegments);
      // Check the segment checkboxes after a microtask (segments render async)
      setTimeout(() => {
        const segmentListEl = $('segment-list');
        if (segmentListEl) {
          draft.selectedSegments.forEach(id => {
            const cb = segmentListEl.querySelector(`input[value="${id}"]`);
            if (cb) cb.checked = true;
          });
        }
      }, 100);
    }

    return true;
  } catch {
    return false;
  }
}

function clearDraft() {
  clearTimeout(_draftTimer);
  chrome.storage.local.remove(draftKey()).catch(() => {});
}

function hookDraftAutoSave() {
  // Hook into all compose form fields for auto-save
  const fields = [
    'campaign-title', 'campaign-message', 'campaign-url',
    'action-btn-1-label', 'action-btn-1-url',
    'action-btn-2-label', 'action-btn-2-url',
    'utm-source', 'utm-medium', 'utm-campaign', 'utm-term', 'utm-content'
  ];
  fields.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', saveDraft);
  });

  // Checkboxes and radios
  const checkboxes = ['utm-enable', 'schedule-subscriber-tz'];
  checkboxes.forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', saveDraft);
  });

  document.querySelectorAll('input[name="schedule-type"]').forEach(r => {
    r.addEventListener('change', saveDraft);
  });
  document.querySelectorAll('input[name="segment-target"]').forEach(r => {
    r.addEventListener('change', saveDraft);
  });

  // Save on state changes for fields not directly tied to inputs
  on('compose.bigImage', saveDraft);
  on('compose.segments', saveDraft);
}

// ── Page data extraction (must run before other modules) ────

export async function fetchPageData() {
  let pageData = { title: '', description: '', url: '', image: '', images: [] };
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id && tab.url && !tab.url.startsWith('chrome') && !tab.url.includes('app.pushengage.com')) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      pageData = sanitizePageData(result?.result || {});
    } else if (tab?.url && !tab.url.startsWith('chrome')) {
      pageData.url = tab.url;
      pageData.title = tab.title || '';
    }
  } catch (err) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.url) { pageData.url = tab.url; pageData.title = tab.title || ''; }
    } catch {}
  }
  setState('pageData', pageData);

  // Draft cleanup runs via saveDraft() debounce — not needed on boot
  return pageData;
}

// ── Main export ────────────────────────────────────────────

export async function initCompose() {
  // pageData is already set by fetchPageData() called in bootApp()
  const pageData = getState('pageData') || { title: '', description: '', url: '', image: '', images: [] };

  // ── 2. Pre-fill form fields ─────────────────────────────
  const titleInput = $('campaign-title');
  const messageInput = $('campaign-message');
  const urlInput = $('campaign-url');
  const titleCounter = $('title-counter');
  const messageCounter = $('message-counter');
  const iconImg = $('icon-preview-img');
  const iconPlaceholder = $('icon-placeholder');
  const featuredImg = $('featured-preview-img');
  const featuredPlaceholder = $('featured-placeholder');

  if (titleInput && pageData.title) titleInput.value = pageData.title;
  if (messageInput && pageData.description) messageInput.value = pageData.description;
  if (urlInput && pageData.url) urlInput.value = pageData.url;

  // Icon from site settings
  const siteDetails = getState('siteDetails');
  const siteIcon = siteDetails?.site_image || '';
  if (siteIcon && iconImg) {
    iconImg.src = siteIcon;
    iconImg.classList.remove('hidden');
    if (iconPlaceholder) iconPlaceholder.classList.add('hidden');
  }

  // Featured image: OG image → first large page image → placeholder with prompt
  const featuredSrc = pageData.image
    || (pageData.images && pageData.images.length > 0 ? pageData.images[0].src : '');
  if (featuredSrc && featuredImg) {
    featuredImg.src = featuredSrc;
    featuredImg.classList.remove('hidden');
    if (featuredPlaceholder) featuredPlaceholder.classList.add('hidden');
    setState('compose.bigImage', featuredSrc);
    // If the image fails to load, fall back to placeholder
    featuredImg.onerror = () => {
      featuredImg.classList.add('hidden');
      if (featuredPlaceholder) {
        featuredPlaceholder.textContent = 'Image failed to load — click Change';
        featuredPlaceholder.classList.remove('hidden');
      }
      setState('compose.bigImage', '');
    };
  } else if (featuredPlaceholder) {
    featuredPlaceholder.textContent = 'No image found — click Change to add';
  }

  // ── 3. Character counters ───────────────────────────────
  if (titleInput && titleCounter) {
    updateCounter(titleInput, titleCounter, TITLE_MAX);
    titleInput.addEventListener('input', () => {
      updateCounter(titleInput, titleCounter, TITLE_MAX);
      setState('compose.title', titleInput.value);
    });
  }
  if (messageInput && messageCounter) {
    updateCounter(messageInput, messageCounter, MESSAGE_MAX);
    messageInput.addEventListener('input', () => {
      updateCounter(messageInput, messageCounter, MESSAGE_MAX);
      setState('compose.message', messageInput.value);
    });
  }
  if (urlInput) {
    urlInput.addEventListener('input', () => setState('compose.url', urlInput.value));
  }

  // ── 4. AI generate button (fills both title + message) ──
  setupAiGenerate(titleInput, titleCounter, messageInput, messageCounter);

  // ── 5. Image handling ───────────────────────────────────
  setupImageHandling(featuredImg, featuredPlaceholder);

  // ── 6. Initialize accordions ────────────────────────────
  initAccordions();

  // ── Permission gating on accordions ─────────────────────
  if (!canReadSegment()) {
    lockAccordion('segments', 'Segment targeting available on Growth plan and above.');
  }
  if (!canWriteMultiActionBtn()) {
    lockAccordion('actions', 'Action buttons available on Growth plan and above.');
  }
  if (!canWriteScheduleNotification()) {
    lockAccordion('schedule', 'Scheduled send available on Growth plan and above.');
  }
  // UTM is always unlocked — no gating

  // ── Restore saved preferences from previous sessions ────
  const prefs = await restoreComposePrefs();

  // ── 7. Segments accordion ───────────────────────────────
  if (canReadSegment()) {
    setupSegments();
  }

  // ── 8. Action Buttons accordion ─────────────────────────
  if (canWriteMultiActionBtn()) {
    setupActionButtons(prefs);
  }

  // ── 9. UTM accordion ───────────────────────────────────
  setupUtm(prefs);

  // ── 10. Schedule accordion ──────────────────────────────
  if (canWriteScheduleNotification()) {
    setupSchedule();
  }

  // ── 11 & 12. Send and Draft buttons ─────────────────────
  setupSendButton();
  setupDraftButton();

  // ── 13. Restore draft from previous popup session ──────
  // Run after all setup so restored values take precedence over defaults
  await restoreDraft();

  // ── 14. Hook auto-save on all form field changes ───────
  hookDraftAutoSave();
}

// ── AI generation ──────────────────────────────────────────

function setButtonLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.textContent = 'Generating...';
  } else {
    btn.disabled = false;
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    btn.appendChild(svg);
    btn.appendChild(document.createTextNode(' AI Write'));
  }
}

function setupAiGenerate(titleInput, titleCounter, messageInput, messageCounter) {
  const btn = $('btn-ai-generate');
  if (!btn) return;

  async function runGeneration(tone, feedback) {
    const pageData = getState('pageData') || {};
    setButtonLoading(btn, true);
    document.querySelectorAll('.ai-panel').forEach(el => el.remove());

    try {
      // Append feedback to description (keep it short), pass tone as separate param
      const enrichedPageData = { ...pageData };
      if (feedback) {
        enrichedPageData.description = [pageData.description || '', feedback].filter(Boolean).join('. ').substring(0, 500);
      }
      const suggestions = await generateNotificationCopy(enrichedPageData, { tone: tone || undefined });
      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        showToast('No suggestions generated', 'error');
        return;
      }
      showAiSuggestions(suggestions, titleInput, titleCounter, messageInput, messageCounter, tone, feedback);
    } catch (err) {
      showToast(err.message || 'AI generation failed', 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  }

  btn.addEventListener('click', () => runGeneration('', ''));
  // Store for regeneration calls
  btn._runGeneration = runGeneration;
}

function showAiSuggestions(suggestions, titleInput, titleCounter, messageInput, messageCounter, currentTone, currentFeedback) {
  document.querySelectorAll('.ai-panel').forEach(el => el.remove());

  const panel = document.createElement('div');
  panel.className = 'ai-panel';

  // ── Suggestion chips ──
  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'ai-suggestions';

  suggestions.slice(0, 3).forEach((item, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ai-suggestion-chip';

    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = 'Option ' + (i + 1);
    chip.appendChild(label);

    const title = (item.title || '').substring(0, TITLE_MAX);
    const message = (item.message || '').substring(0, MESSAGE_MAX);
    const btn1Text = item.btn1 || '';
    const btn2Text = item.btn2 || '';
    const btn1TargetUrl = item.btn1Url || '';
    const btn2TargetUrl = item.btn2Url || '';
    // UTM fields come from page scraping (setupUtm), not from AI

    const titleSpan = document.createElement('span');
    titleSpan.className = 'chip-title';
    titleSpan.textContent = title;
    chip.appendChild(titleSpan);

    const msgSpan = document.createElement('span');
    msgSpan.className = 'chip-message';
    msgSpan.textContent = message;
    chip.appendChild(msgSpan);

    if (btn1Text || btn2Text) {
      const btnsSpan = document.createElement('span');
      btnsSpan.className = 'chip-buttons';

      // Show button text with URL hint (e.g. "Watch Video → youtube.com")
      const btn1Display = btn1Text + urlHint(btn1TargetUrl);
      const btn2Display = btn2Text + urlHint(btn2TargetUrl);
      btnsSpan.textContent = [btn1Display, btn2Display].filter(Boolean).join('  ·  ');
      chip.appendChild(btnsSpan);
    }

    chip.addEventListener('click', () => {
      if (titleInput) {
        titleInput.value = title;
        if (titleCounter) updateCounter(titleInput, titleCounter, TITLE_MAX);
        setState('compose.title', title);
      }
      if (messageInput) {
        messageInput.value = message;
        if (messageCounter) updateCounter(messageInput, messageCounter, MESSAGE_MAX);
        setState('compose.message', message);
      }
      // Fill action button labels + resolved URLs (YouTube, social, or page URL)
      const pageUrl = getState('pageData')?.url || '';
      const btn1LabelEl = $('action-btn-1-label');
      const btn1UrlEl = $('action-btn-1-url');
      if (btn1LabelEl && btn1Text) btn1LabelEl.value = btn1Text;
      if (btn1UrlEl) btn1UrlEl.value = btn1TargetUrl || pageUrl;

      const btn2LabelEl = $('action-btn-2-label');
      const btn2UrlEl = $('action-btn-2-url');
      if (btn2LabelEl && btn2Text) {
        btn2LabelEl.value = btn2Text;
        if (btn2UrlEl) btn2UrlEl.value = btn2TargetUrl || pageUrl;
        // Auto-show button 2 if we have text for it
        const group2 = $('action-btn-2-group');
        const addBtn2 = $('btn-add-action-2');
        if (group2) group2.classList.remove('hidden');
        if (addBtn2) addBtn2.classList.add('hidden');
      }
      // Open the action buttons accordion so user sees the filled values
      const actionsAccordion = document.querySelector('[data-accordion="actions"]');
      if (actionsAccordion && !actionsAccordion.classList.contains('accordion-open')) {
        const header = actionsAccordion.querySelector('.accordion-header');
        if (header && actionsAccordion.getAttribute('data-locked') !== 'true') header.click();
      }
      panel.remove();
      showToast('Applied title, message & button text');
    });

    chipsWrap.appendChild(chip);
  });
  panel.appendChild(chipsWrap);

  // ── Tone selector + feedback input + regenerate ──
  const controls = document.createElement('div');
  controls.className = 'ai-controls';

  const toneSelect = document.createElement('select');
  toneSelect.className = 'form-input ai-tone-select';
  toneSelect.setAttribute('aria-label', 'Tone');
  const tones = [
    ['', 'Default tone'],
    ['urgent', 'Urgent'],
    ['friendly', 'Friendly'],
    ['professional', 'Professional'],
    ['casual', 'Casual'],
    ['exciting', 'Exciting'],
    ['fomo', 'FOMO']
  ];
  tones.forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === (currentTone || '')) opt.selected = true;
    toneSelect.appendChild(opt);
  });
  controls.appendChild(toneSelect);

  const feedbackInput = document.createElement('input');
  feedbackInput.type = 'text';
  feedbackInput.className = 'form-input ai-feedback-input';
  feedbackInput.placeholder = 'Feedback: e.g. "more concise", "mention discount"';
  feedbackInput.value = currentFeedback || '';
  controls.appendChild(feedbackInput);

  const regenBtn = document.createElement('button');
  regenBtn.type = 'button';
  regenBtn.className = 'btn btn-sm btn-primary';
  regenBtn.textContent = 'Regenerate';
  regenBtn.addEventListener('click', () => {
    const btn = $('btn-ai-generate');
    if (btn?._runGeneration) {
      btn._runGeneration(toneSelect.value, feedbackInput.value.trim());
    }
  });
  controls.appendChild(regenBtn);

  panel.appendChild(controls);

  // Insert after the AI button
  const aiBtn = $('btn-ai-generate');
  if (aiBtn?.parentElement) {
    aiBtn.parentElement.insertBefore(panel, aiBtn.nextSibling);
  }
}

// ── Image handling ─────────────────────────────────────────

function setupImageHandling(featuredImg, featuredPlaceholder) {
  const changeBtn = $('btn-change-featured');
  const removeBtn = $('btn-remove-featured');

  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      // Check if URL input already exists
      const existing = changeBtn.parentElement.querySelector('.image-url-input');
      if (existing) { existing.focus(); return; }

      const input = document.createElement('input');
      input.type = 'url';
      input.className = 'form-input image-url-input';
      input.placeholder = 'https://example.com/image.png';
      input.setAttribute('aria-label', 'Featured image URL');

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const sanitized = sanitizeImageUrl(input.value);
          if (!sanitized) {
            showToast('Please enter a valid HTTPS image URL', 'error');
            return;
          }
          if (featuredImg) {
            featuredImg.src = sanitized;
            featuredImg.classList.remove('hidden');
          }
          if (featuredPlaceholder) featuredPlaceholder.classList.add('hidden');
          setState('compose.bigImage', sanitized);
          input.remove();
        } else if (e.key === 'Escape') {
          input.remove();
        }
      });

      changeBtn.parentElement.insertBefore(input, changeBtn);
      input.focus();
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      if (featuredImg) {
        featuredImg.src = '';
        featuredImg.classList.add('hidden');
      }
      if (featuredPlaceholder) featuredPlaceholder.classList.remove('hidden');
      setState('compose.bigImage', '');
    });
  }
}

// ── Segments ───────────────────────────────────────────────

function setupSegments() {
  const segmentsList = getState('segmentsList') || [];
  const segmentListEl = $('segment-list');
  const segmentSearch = $('segment-search');
  const segmentSelectArea = $('segment-select-area');
  const segmentReachCount = $('segment-reach-count');
  const segmentsSummary = $('segments-summary');
  const radios = document.querySelectorAll('input[name="segment-target"]');

  // Show/hide search if 10+ segments
  if (segmentSearch) {
    segmentSearch.closest('.form-group').classList.toggle('hidden', segmentsList.length < 10);
  }

  // Populate segment list — sorted by subscribers high to low
  function renderSegments(filter = '') {
    if (!segmentListEl) return;
    segmentListEl.textContent = '';
    const lowerFilter = filter.toLowerCase();
    const filtered = segmentsList
      .filter(s => {
        const name = (s.segment_name || s.name || '').toLowerCase();
        return !lowerFilter || name.includes(lowerFilter);
      })
      .sort((a, b) => (b.subscribers || b.subscribers_count || 0) - (a.subscribers || a.subscribers_count || 0));

    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.className = 'segment-item segment-item--empty';
      li.textContent = lowerFilter ? 'No matching segments' : 'No segments available';
      segmentListEl.appendChild(li);
      return;
    }

    filtered.forEach(segment => {
      const item = createSegmentItem(segment);
      const checkbox = item.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', () => updateSegmentSelection());
      }
      segmentListEl.appendChild(item);
    });
  }

  renderSegments();

  // Search filtering
  if (segmentSearch) {
    segmentSearch.addEventListener('input', () => {
      renderSegments(segmentSearch.value);
    });
  }

  // Radio toggle: All vs Select
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      const isSelect = radio.value === 'select' && radio.checked;
      if (segmentSelectArea) {
        segmentSelectArea.classList.toggle('hidden', !isSelect);
      }
      if (segmentsSummary) {
        setText(segmentsSummary, isSelect ? 'Select Segments' : 'All Subscribers');
      }
      setState('compose.audienceType', isSelect ? 'select' : 'all');
      if (!isSelect) {
        // Clear segment selections
        segmentListEl?.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = false;
        });
        setState('compose.segments', []);
        if (segmentReachCount) setText(segmentReachCount, '--');
      }
    });
  });

  // Update selection state and reach count
  function updateSegmentSelection() {
    const checked = segmentListEl?.querySelectorAll('input[type="checkbox"]:checked') || [];
    const selectedIds = [];
    let totalReach = 0;
    checked.forEach(cb => {
      selectedIds.push(cb.value);
      totalReach += parseInt(cb.dataset.subscribers || '0', 10);
    });
    setState('compose.segments', selectedIds);
    if (segmentReachCount) {
      setText(segmentReachCount, totalReach > 0 ? totalReach.toLocaleString() : '--');
    }
  }

  // Inline create segment
  const createBtn = $('btn-create-segment-inline');
  const nameInput = $('new-segment-name');
  if (createBtn && nameInput) {
    createBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) {
        showToast('Please enter a segment name', 'error');
        return;
      }

      const siteId = getState('activeSiteId');
      const pageUrl = getState('pageData')?.url || '';
      const payload = {
        segment_name: name,
        segment_criteria: pageUrl ? {
          include: [{ rule: 'contains', value: pageUrl }],
          exclude: []
        } : undefined,
        add_segment_on_page_load: pageUrl ? 1 : 0
      };

      createBtn.disabled = true;
      try {
        const response = await api.createSegment(siteId, payload);
        const newSegment = response?.data || response || {};

        // Add to state and re-render
        const updated = [...(getState('segmentsList') || []), newSegment];
        setState('segmentsList', updated);

        // Show search if now 10+
        if (segmentSearch && updated.length >= 10) {
          segmentSearch.closest('.form-group').classList.remove('hidden');
        }

        renderSegments(segmentSearch?.value || '');

        // Auto-check the new segment
        const newId = String(newSegment.segment_id || newSegment.id);
        const newCb = segmentListEl?.querySelector(`input[value="${newId}"]`);
        if (newCb) {
          newCb.checked = true;
          updateSegmentSelection();
        }

        nameInput.value = '';
        showToast('Segment created successfully');
      } catch (err) {
        showToast(err.message || 'Failed to create segment', 'error');
      } finally {
        createBtn.disabled = false;
      }
    });
  }
}

// ── Action Buttons ─────────────────────────────────────────

function setupActionButtons(prefs = {}) {
  const addBtn2 = $('btn-add-action-2');
  const removeBtn2 = $('btn-remove-action-2');
  const group2 = $('action-btn-2-group');
  const btn1Label = $('action-btn-1-label');
  const btn1Url = $('action-btn-1-url');

  // Pre-fill from saved prefs or best-practice defaults
  if (prefs.hasActionBtn1 && btn1Label && btn1Url) {
    btn1Label.value = prefs.actionBtn1Label || '';
    btn1Url.value = prefs.actionBtn1Url || '';
  } else {
    // Best-practice default
    if (btn1Label && !btn1Label.value) btn1Label.placeholder = 'e.g. Read More';
    if (btn1Url) {
      const pageUrl = getState('pageData')?.url || '';
      if (pageUrl && !btn1Url.value) btn1Url.value = pageUrl;
    }
  }

  // If user always uses 2 buttons, auto-expand and prefill
  if (prefs.usesTwoButtons && group2 && addBtn2) {
    group2.classList.remove('hidden');
    addBtn2.classList.add('hidden');
    const l2 = $('action-btn-2-label');
    const u2 = $('action-btn-2-url');
    if (l2) l2.value = prefs.actionBtn2Label || '';
    if (u2) u2.value = prefs.actionBtn2Url || '';
  }

  if (addBtn2 && group2) {
    addBtn2.addEventListener('click', () => {
      group2.classList.remove('hidden');
      addBtn2.classList.add('hidden');
    });
  }

  if (removeBtn2 && group2 && addBtn2) {
    removeBtn2.addEventListener('click', () => {
      group2.classList.add('hidden');
      addBtn2.classList.remove('hidden');
      const label2 = $('action-btn-2-label');
      const url2 = $('action-btn-2-url');
      if (label2) label2.value = '';
      if (url2) url2.value = '';
    });
  }

  // Social links quick-fill picker
  setupSocialLinksPicker();
}

// Social platform display config: icon SVG path + default CTA label
// Social platform display config for quick-fill picker (no LinkedIn — not useful for push CTAs)
const SOCIAL_PLATFORMS = {
  youtube:   { label: 'Watch Video',      icon: 'M23.5 6.5s-.2-1.6-.9-2.3c-.9-.9-1.8-.9-2.3-.9C17.1 3 12 3 12 3s-5.1 0-8.3.3c-.5.1-1.5.1-2.3.9-.7.7-.9 2.3-.9 2.3S.2 8.4.2 10.2v1.7c0 1.9.3 3.7.3 3.7s.2 1.6.9 2.3c.9.9 2 .9 2.5 1 1.8.2 7.6.2 7.6.2s5.1 0 8.3-.3c.5-.1 1.5-.1 2.3-.9.7-.7.9-2.3.9-2.3s.3-1.9.3-3.7v-1.7c-.3-1.9-.6-3.7-.6-3.7zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z' },
  instagram: { label: 'Follow Us',        icon: 'M12 2.2c2.7 0 3 0 4.1.1 1 0 1.5.2 1.9.3.5.2.8.4 1.1.7.3.3.6.7.7 1.1.1.4.3.9.3 1.9 0 1.1.1 1.4.1 4.1s0 3-.1 4.1c0 1-.2 1.5-.3 1.9-.2.5-.4.8-.7 1.1-.3.3-.7.6-1.1.7-.4.1-.9.3-1.9.3-1.1 0-1.4.1-4.1.1s-3 0-4.1-.1c-1 0-1.5-.2-1.9-.3-.5-.2-.8-.4-1.1-.7-.3-.3-.6-.7-.7-1.1-.1-.4-.3-.9-.3-1.9 0-1.1-.1-1.4-.1-4.1s0-3 .1-4.1c0-1 .2-1.5.3-1.9.2-.5.4-.8.7-1.1.3-.3.7-.6 1.1-.7.4-.1.9-.3 1.9-.3 1.1 0 1.4-.1 4.1-.1zM12 0C9.3 0 8.9 0 7.9.1c-1.1 0-1.8.2-2.5.5-.7.3-1.3.6-1.9 1.2-.6.6-1 1.2-1.2 1.9-.3.7-.5 1.4-.5 2.5C1.7 7.1 1.7 7.5 1.7 12s0 4.9.1 5.9c0 1.1.2 1.8.5 2.5.3.7.6 1.3 1.2 1.9.6.6 1.2 1 1.9 1.2.7.3 1.4.5 2.5.5 1 .1 1.4.1 5.9.1s4.9 0 5.9-.1c1.1 0 1.8-.2 2.5-.5.7-.3 1.3-.6 1.9-1.2.6-.6 1-1.2 1.2-1.9.3-.7.5-1.4.5-2.5.1-1 .1-1.4.1-5.9s0-4.9-.1-5.9c0-1.1-.2-1.8-.5-2.5-.3-.7-.6-1.3-1.2-1.9-.6-.6-1.2-1-1.9-1.2-.7-.3-1.4-.5-2.5-.5C16.9 0 16.5 0 12 0zm0 5.8a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zM12 16a4 4 0 110-8 4 4 0 010 8zm6.4-10.8a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z' },
  facebook:  { label: 'Visit Facebook',   icon: 'M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 11 10.1 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4C19.6 23 24 18 24 12z' },
  twitter:   { label: 'See on X',         icon: 'M18.9 1h3.7l-8.1 9.2L24 23h-7.4l-5.8-7.6L4.6 23H.8l8.6-9.9L.4 1h7.6l5.3 7 6.1-7zM17.6 20.8h2L6.5 3H4.3l13.3 17.8z' },
  tiktok:    { label: 'Watch on TikTok',   icon: 'M12.5.1C13.7.1 14.9 0 16.1 0c.1 1.5.6 3 1.7 4.1 1.1 1.1 2.6 1.6 4.1 1.7v3.9c-1.4 0-2.8-.3-4-1v7.1c0 1.8-.5 3.5-1.5 5-1.6 2.3-4.3 3.7-7.1 3.7-2.4 0-4.6-.9-6.2-2.5C1.5 20.4.5 18.2.5 15.8c.1-4.4 3.6-8 8.1-8.1.5 0 1 0 1.5.1v4c-.5-.1-1-.2-1.5-.2-2.2.1-4 1.9-3.9 4.1.1 2.2 1.9 4 4.1 3.9 2.1-.1 3.8-1.8 3.9-3.9V.1h-.2z' },
  pinterest: { label: 'View Pin',          icon: 'M12 0C5.4 0 0 5.4 0 12c0 5.1 3.2 9.4 7.6 11.2-.1-.9-.2-2.4 0-3.4.2-.9 1.4-6 1.4-6s-.4-.7-.4-1.8c0-1.7 1-2.9 2.2-2.9 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.1 0 3.8-2.2 3.8-5.5 0-2.9-2.1-4.9-5-4.9-3.4 0-5.4 2.6-5.4 5.2 0 1 .4 2.1.9 2.7.1.1.1.2.1.3-.1.4-.3 1.2-.3 1.4-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.7 0-3.8 2.8-7.3 8-7.3 4.2 0 7.5 3 7.5 7 0 4.2-2.6 7.5-6.3 7.5-1.2 0-2.4-.6-2.8-1.4l-.8 2.9c-.3 1.1-.1 2.5-.5 3.5C9.6 23.8 10.8 24 12 24c6.6 0 12-5.4 12-12S18.6 0 12 0z' },
  spotify:   { label: 'Listen Now',         icon: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 17.3c-.2.3-.6.4-1 .2-2.6-1.6-5.9-2-9.8-1.1-.4.1-.7-.1-.8-.5-.1-.4.1-.7.5-.8 4.2-1 7.8-.6 10.7 1.2.4.2.5.7.4 1zm1.5-3.3c-.3.4-.8.5-1.2.3-3-1.8-7.5-2.4-11-1.3-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 4-.1.2 9.1.8 12.4 2.8.4.2.5.8.3 1.2zm.1-3.4c-3.6-2.1-9.5-2.3-12.9-1.3-.5.2-1.1-.1-1.2-.6-.2-.5.1-1.1.6-1.2 3.9-1.2 10.4-.9 14.5 1.5.5.3.6.9.3 1.4-.2.4-.8.5-1.3.2z' },
};

function setupSocialLinksPicker() {
  const picker = $('social-links-picker');
  const list = $('social-links-list');
  if (!picker || !list) return;

  const pageData = getState('pageData') || {};
  const socialLinks = pageData.socialLinks || {};
  const embeddedVideos = pageData.embeddedVideos || [];

  // Add YouTube from embedded videos if not already in socialLinks
  if (!socialLinks.youtube && embeddedVideos.some(v => v.platform === 'youtube')) {
    const ytVid = embeddedVideos.find(v => v.platform === 'youtube');
    if (ytVid?.watchUrl) socialLinks.youtube = ytVid.watchUrl;
  }

  // Filter out LinkedIn (not useful for push CTAs) and only show known platforms
  const platforms = Object.keys(socialLinks).filter(p => p !== 'linkedin' && SOCIAL_PLATFORMS[p]);
  if (platforms.length === 0) return; // No social links found — keep picker hidden

  picker.classList.remove('hidden');

  platforms.forEach(platform => {
    const config = SOCIAL_PLATFORMS[platform];
    if (!config) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'social-link-btn';
    btn.title = socialLinks[platform];

    // SVG icon
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'social-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', config.icon);
    svg.appendChild(path);
    btn.appendChild(svg);

    // Label
    const span = document.createElement('span');
    span.textContent = config.label;
    btn.appendChild(span);

    btn.addEventListener('click', () => {
      // Social always goes into Button 2 — Button 1 is the page action
      const btn2Label = $('action-btn-2-label');
      const btn2Url = $('action-btn-2-url');
      const group2 = $('action-btn-2-group');
      const addBtn2El = $('btn-add-action-2');

      if (btn2Label) {
        btn2Label.value = config.label;
        if (btn2Url) btn2Url.value = socialLinks[platform];
        // Auto-show Button 2
        if (group2) group2.classList.remove('hidden');
        if (addBtn2El) addBtn2El.classList.add('hidden');
      }
      saveDraft();
    });

    list.appendChild(btn);
  });
}

// ── UTM ────────────────────────────────────────────────────

function setupUtm(prefs = {}) {
  const enableCb = $('utm-enable');
  const fieldsDiv = $('utm-fields');
  const sourceInput = $('utm-source');
  const mediumInput = $('utm-medium');
  const campaignInput = $('utm-campaign');
  const termInput = $('utm-term');
  const contentInput = $('utm-content');
  const utmSummary = $('utm-summary');

  if (!enableCb || !fieldsDiv) return;

  const pageData = getState('pageData');

  // Site-level UTM defaults from dashboard Account Settings
  // Priority: user prefs (saved locally) > site defaults (from API) > hardcoded fallbacks
  const siteUtm = getState('siteUtmDefaults') || {};

  // Restore from prefs or default to site setting or enabled
  const enabled = prefs.utmEnabled !== undefined ? prefs.utmEnabled : (siteUtm.enabled !== undefined ? siteUtm.enabled : true);
  enableCb.checked = enabled;
  fieldsDiv.classList.toggle('hidden', !enabled);
  setState('compose.utmEnabled', enabled);
  if (utmSummary) utmSummary.textContent = enabled ? 'Enabled' : 'Disabled';

  // Pre-fill all 5 UTM fields fresh each session.
  // Priority: page-scraped data (page-specific) > site API defaults (generic) > hardcoded
  // Site defaults like "PushEngage/pushnotifications/generalbroadcasts" are generic —
  // page-scraped values are always more relevant for campaign tracking.
  // AI Write overrides all when user picks a suggestion.
  const pageKeywords = (pageData?.keywords || '').trim();
  const pageTypeSlug = (pageData?.pageType || 'page').replace(/_/g, '-');
  const pageTitleSlug = pageData?.title ? slugify(pageData.title) : '';

  // Source = where traffic comes from (PushEngage), NOT the destination brand
  // Medium = channel type (push notification)
  if (sourceInput) sourceInput.value = siteUtm.utm_source || 'pushengage';
  if (mediumInput) mediumInput.value = siteUtm.utm_medium || 'push_notification';
  if (campaignInput) campaignInput.value = pageTitleSlug || siteUtm.utm_campaign || '';
  if (termInput) termInput.value = pageKeywords || pageTypeSlug || siteUtm.utm_term || '';
  if (contentInput) contentInput.value = (pageTitleSlug ? pageTitleSlug.substring(0, 30) : '') || pageTypeSlug || siteUtm.utm_content || '';

  enableCb.addEventListener('change', () => {
    const on = enableCb.checked;
    fieldsDiv.classList.toggle('hidden', !on);
    setState('compose.utmEnabled', on);
    if (utmSummary) utmSummary.textContent = on ? 'Enabled' : 'Disabled';
  });
}

// ── Schedule ───────────────────────────────────────────────

function setupSchedule() {
  const radios = document.querySelectorAll('input[name="schedule-type"]');
  const scheduleFields = $('schedule-fields');
  const scheduleSummary = $('schedule-summary');
  const dateInput = $('schedule-date');
  const timeInput = $('schedule-time');
  const tzCheckbox = $('schedule-subscriber-tz');
  const sendBtn = $('btn-send-now');

  // Hide timezone checkbox if no permission
  if (tzCheckbox && !canWriteTimezoneNotification()) {
    tzCheckbox.closest('.segment-item')?.classList.add('hidden');
  }

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      const isLater = radio.value === 'later' && radio.checked;
      if (scheduleFields) scheduleFields.classList.toggle('hidden', !isLater);
      if (scheduleSummary) {
        setText(scheduleSummary, isLater ? 'Scheduled' : 'Send Now');
      }
      if (sendBtn) {
        sendBtn.textContent = isLater ? 'Schedule' : 'Send Now';
      }
      setState('compose.scheduleType', isLater ? 'later' : 'now');
    });
  });

  if (dateInput) {
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.addEventListener('change', () => setState('compose.scheduleDate', dateInput.value));
  }

  if (timeInput) {
    timeInput.addEventListener('change', () => setState('compose.scheduleTime', timeInput.value));
  }

  if (tzCheckbox) {
    tzCheckbox.addEventListener('change', () => setState('compose.timezoneSend', tzCheckbox.checked));
  }
}

// ── Send button ────────────────────────────────────────────

function setupSendButton() {
  const sendBtn = $('btn-send-now');
  if (!sendBtn) return;

  sendBtn.addEventListener('click', async () => {
    const payload = buildPayload();
    if (!payload) return;

    const scheduleType = getState('compose.scheduleType') || 'now';
    const action = 'sent'; // query param — 'sent' for both immediate and scheduled
    const status = scheduleType === 'now' ? 'sent' : 'scheduled';
    payload.status = status;

    // Estimate audience for safeguard checks
    const audienceType = getState('compose.audienceType') || 'all';
    let estimatedAudience = 0;
    if (audienceType === 'all') {
      const siteDetails = getState('siteDetails');
      estimatedAudience = getState('subscriberCount') || siteDetails?.subscribers_count || 0;
    } else {
      const segmentListEl = $('segment-list');
      const checked = segmentListEl?.querySelectorAll('input[type="checkbox"]:checked') || [];
      checked.forEach(cb => {
        estimatedAudience += parseInt(cb.dataset.subscribers || '0', 10);
      });
    }

    // Run safeguard checks
    const check = preSendCheck(payload.notification_title, payload.notification_url, estimatedAudience);

    if (!check.allowed) {
      if (check.type === 'rate_limited') {
        await alertModal({
          title: 'Slow Down',
          body: `${check.reason} Please wait ${formatWait(check.waitMs)}.`
        });
      } else {
        await alertModal({ title: 'Cannot Send', body: check.reason });
      }
      return;
    }

    if (check.type === 'cooldown' || check.type === 'duplicate') {
      const proceed = await confirmModal({
        title: 'Are you sure?',
        body: check.reason,
        confirmText: 'Send Anyway',
        confirmClass: 'btn-primary'
      });
      if (!proceed) return;
    }

    // Build summary for confirmation
    const audienceLabel = audienceType === 'all'
      ? 'All Subscribers'
      : `${(getState('compose.segments') || []).length} segment(s)`;
    const timingLabel = scheduleType === 'now'
      ? 'Send immediately'
      : `Scheduled for ${getState('compose.scheduleDate')} ${getState('compose.scheduleTime')}`;

    const confirmed = await confirmModal({
      title: scheduleType === 'now' ? 'Send Campaign?' : 'Schedule Campaign?',
      body: `"${payload.notification_title}" to ${audienceLabel}. ${timingLabel}.`,
      confirmText: scheduleType === 'now' ? 'Send Now' : 'Schedule',
      confirmClass: 'btn-primary'
    });
    if (!confirmed) return;

    // Send
    sendBtn.disabled = true;
    setLoading(true);
    const siteId = getState('activeSiteId');
    try {
      await api.createNotification(siteId, payload, action);
      recordSend(payload.notification_title, payload.notification_url);

      // Increment quota locally
      const limits = getState('planLimits');
      limits.notifications.used += 1;
      setState('planLimits', limits);

      saveComposePrefs();
      clearDraft();
      showToast(
        scheduleType === 'now'
          ? 'Campaign sent successfully!'
          : 'Campaign scheduled successfully!'
      );
    } catch (err) {
      showToast(err.message || 'Failed to send campaign', 'error');
    } finally {
      sendBtn.disabled = false;
      setLoading(false);
    }
  });
}

// ── Draft button ───────────────────────────────────────────

function setupDraftButton() {
  const draftBtn = $('btn-save-draft');
  if (!draftBtn) return;

  draftBtn.addEventListener('click', async () => {
    const payload = buildPayload();
    if (!payload) return;

    // Backend uses query param action=draft, not body status='draft'
    // Status must be 'sent' or 'scheduled' per backend Joi validation
    payload.status = 'sent';

    draftBtn.disabled = true;
    setLoading(true);
    const siteId = getState('activeSiteId');
    try {
      await api.createNotification(siteId, payload, 'draft');
      saveComposePrefs();
      clearDraft();
      showToast('Draft saved successfully!');
    } catch (err) {
      showToast(err.message || 'Failed to save draft', 'error');
    } finally {
      draftBtn.disabled = false;
      setLoading(false);
    }
  });
}

// ── Payload builder ────────────────────────────────────────

function buildPayload() {
  const titleInput = $('campaign-title');
  const messageInput = $('campaign-message');
  const urlInput = $('campaign-url');

  const title = (titleInput?.value || '').trim();
  const message = (messageInput?.value || '').trim();
  const url = (urlInput?.value || '').trim();

  // Validate required fields
  if (!title) {
    showToast('Title is required', 'error');
    titleInput?.focus();
    return null;
  }
  if (!message) {
    showToast('Message is required', 'error');
    messageInput?.focus();
    return null;
  }
  if (!url) {
    showToast('URL is required', 'error');
    urlInput?.focus();
    return null;
  }

  // Backend length limits
  if (title.length > 85) {
    showToast('Title must be 85 characters or less', 'error');
    titleInput?.focus();
    return null;
  }
  if (message.length > 135) {
    showToast('Message must be 135 characters or less', 'error');
    messageInput?.focus();
    return null;
  }
  if (url.length > 1600) {
    showToast('URL is too long (max 1600 characters)', 'error');
    urlInput?.focus();
    return null;
  }

  // Icon and big image
  const iconImg = $('icon-preview-img');
  const featuredImg = $('featured-preview-img');
  const iconUrl = iconImg && !iconImg.classList.contains('hidden') ? iconImg.src : undefined;
  const bigImageUrl = featuredImg && !featuredImg.classList.contains('hidden') ? featuredImg.src : undefined;

  const payload = {
    notification_title: title,
    notification_message: message,
    notification_url: url,
    notification_image: iconUrl || undefined,
    big_image: bigImageUrl || undefined,
    source: 'Dashboard',
    status: 'sent'
  };

  // Segments
  const audienceType = getState('compose.audienceType') || 'all';
  const selectedSegments = getState('compose.segments') || [];
  if (audienceType === 'select' && selectedSegments.length > 0) {
    payload.notification_criteria = { include_segments: { segments: selectedSegments.map(Number) } };
  }

  // Action buttons
  const action1Label = ($('action-btn-1-label')?.value || '').trim();
  const action1Url = ($('action-btn-1-url')?.value || '').trim();
  if (action1Label && action1Url) {
    if (action1Label.length > 40) {
      showToast('Button 1 label must be 40 characters or less', 'error');
      return null;
    }
    if (action1Url.length > 256) {
      showToast('Button 1 URL is too long (max 256 characters)', 'error');
      return null;
    }
    payload.actions = [{ label: action1Label, url: action1Url }];

    const group2 = $('action-btn-2-group');
    if (group2 && !group2.classList.contains('hidden')) {
      const action2Label = ($('action-btn-2-label')?.value || '').trim();
      const action2Url = ($('action-btn-2-url')?.value || '').trim();
      if (action2Label && action2Url) {
        if (action2Label.length > 40) {
          showToast('Button 2 label must be 40 characters or less', 'error');
          return null;
        }
        if (action2Url.length > 256) {
          showToast('Button 2 URL is too long (max 256 characters)', 'error');
          return null;
        }
        payload.actions.push({ label: action2Label, url: action2Url });
      }
    }
  }

  // UTM — backend requires `enabled` (boolean) and conditionally validates fields
  // Backend Joi strips #, ?, and spaces from all UTM string fields
  // Priority: user input > site-level defaults (from dashboard settings) > omit
  const stripUtm = (v) => (v || '').trim().replace(/[#? ]/g, '');
  const siteUtm = getState('siteUtmDefaults') || {};
  const utmEnabled = $('utm-enable')?.checked || false;
  if (utmEnabled) {
    // User input overrides; if empty, fall back to site-level defaults
    const utmSource = stripUtm($('utm-source')?.value) || stripUtm(siteUtm.utm_source);
    const utmMedium = stripUtm($('utm-medium')?.value) || stripUtm(siteUtm.utm_medium);
    const utmCampaign = stripUtm($('utm-campaign')?.value) || stripUtm(siteUtm.utm_campaign);
    const utmTerm = stripUtm($('utm-term')?.value) || stripUtm(siteUtm.utm_term);
    const utmContent = stripUtm($('utm-content')?.value) || stripUtm(siteUtm.utm_content);

    // Backend limits: source/medium/campaign/term max 80, content max 120
    if (utmSource.length > 80 || utmMedium.length > 80 || utmCampaign.length > 80 || utmTerm.length > 80) {
      showToast('UTM fields must be 80 characters or less', 'error');
      return null;
    }
    if (utmContent.length > 120) {
      showToast('UTM Content must be 120 characters or less', 'error');
      return null;
    }

    // Backend Joi.string() rejects empty strings — omit empty fields
    const utmParams = { enabled: true };
    if (utmSource) utmParams.utm_source = utmSource;
    if (utmMedium) utmParams.utm_medium = utmMedium;
    if (utmCampaign) utmParams.utm_campaign = utmCampaign;
    if (utmTerm) utmParams.utm_term = utmTerm;
    if (utmContent) utmParams.utm_content = utmContent;
    payload.utm_params = utmParams;
  } else {
    // Always send utm_params — backend expects `enabled` field
    payload.utm_params = { enabled: false };
  }

  // Schedule
  const scheduleType = getState('compose.scheduleType') || 'now';
  if (scheduleType === 'later') {
    const scheduleDate = ($('schedule-date')?.value || '').trim();
    const scheduleTime = ($('schedule-time')?.value || '').trim();
    if (!scheduleDate || !scheduleTime) {
      showToast('Please select a date and time for scheduling', 'error');
      return null;
    }
    payload.valid_from = `${scheduleDate} ${convertTo24h(scheduleTime)}`;

    // Timezone delivery: backend uses source field, not a separate boolean
    const tzCheckbox = $('schedule-subscriber-tz');
    if (tzCheckbox?.checked) {
      payload.source = 'parent_sub_timezone';
    }
  }

  return payload;
}
