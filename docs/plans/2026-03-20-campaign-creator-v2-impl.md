# Campaign Creator v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Post-implementation:** Run superpowers:requesting-code-review to validate against PushEngage repo infrastructure compatibility.

**Goal:** Rebuild the PushEngage Campaign Creator Chrome Extension as a fast, secure, single-screen campaign tool with real Adonis API integration, insights dashboard, and segment manager.

**Architecture:** Modular vanilla JS Chrome Extension (Manifest V3). Popup is a single HTML file with JS modules loaded via ES module imports from a `modules/` directory. All API calls go through a central `api.js` module using JWT Bearer auth against the Adonis API (`/d/v1/`). State is managed in a central `state.js` store. Content extraction happens in `content.js` with full sanitization.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JS (ES modules), Adonis REST API, self-hosted Inter font, CSS custom properties for theming.

**Design Doc:** `docs/plans/2026-03-20-campaign-creator-v2-design.md`

**Compatibility Note:** This extension integrates with the existing PushEngage Adonis API at `https://dashboard-public-api.pushengage.com/d/v1/`. All endpoint paths, payload field names, and auth header formats must match the Adonis API controllers exactly. Reference repos:
- Adonis API routes: `/start/routes/dashboard/` and `/start/routes/restApi/`
- Adonis API controllers: `/app/Controllers/Http/Dashboard/` (NotificationController, SegmentController, AuthController)
- Dashboard app API calls: `/src/apis/notifications.ts`, `/src/apis/drips.ts`, `/src/apis/segments.ts`
- Dashboard types: `/src/types/campaigns.d.ts`, `/src/types/notification.d.ts`

---

## File Structure (Target)

```
Campaign Creater/
├── manifest.json              (modify)
├── popup.html                 (rewrite)
├── content.js                 (rewrite)
├── background.js              (rewrite)
├── popup.js                   (rewrite — module orchestrator)
├── fonts/
│   ├── Inter-Regular.woff2    (create)
│   ├── Inter-Medium.woff2     (create)
│   ├── Inter-SemiBold.woff2   (create)
│   └── Inter-Bold.woff2       (create)
├── icons/                     (existing)
├── modules/
│   ├── api.js                 (create — HTTP client, auth, all API calls)
│   ├── state.js               (create — central state store + event bus)
│   ├── auth.js                (create — login/logout, token encrypt/decrypt)
│   ├── permissions.js         (create — plan permissions, feature gates)
│   ├── sanitize.js            (create — HTML escaping, URL validation)
│   ├── compose.js             (create — compose screen logic)
│   ├── insights.js            (create — insights screen logic)
│   ├── segments.js            (create — segment manager screen logic)
│   ├── settings.js            (create — settings screen logic)
│   ├── header.js              (create — header, site selector, user menu, stats ticker)
│   ├── accordion.js           (create — reusable accordion component)
│   ├── modal.js               (create — confirm/alert dialogs using safe DOM methods)
│   └── safeguards.js          (create — rate limiting, duplicate detection, quota checks)
├── styles/
│   └── theme.css              (create — CSS custom properties, brand tokens)
└── docs/plans/                (existing)
```

---

## Task 1: Project Scaffold & Manifest

**Files:**
- Modify: `manifest.json`
- Create: `modules/` directory
- Create: `styles/theme.css`
- Create: `fonts/` directory (download Inter woff2 files)

**Step 1: Update manifest.json**

Replace the current manifest with a secure v2 config:

```json
{
  "manifest_version": 3,
  "name": "PushEngage Campaign Creator",
  "version": "2.0.0",
  "description": "Create and send push notification campaigns instantly from any webpage.",
  "permissions": [
    "activeTab",
    "scripting",
    "storage"
  ],
  "optional_permissions": [
    "contextMenus"
  ],
  "host_permissions": [
    "https://dashboard-public-api.pushengage.com/*",
    "https://app.pushengage.com/*"
  ],
  "optional_host_permissions": [
    "<all_urls>"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline';"
  },
  "commands": {
    "create-campaign": {
      "suggested_key": {
        "default": "Ctrl+Shift+P",
        "mac": "Command+Shift+P"
      },
      "description": "Create campaign from current page"
    }
  }
}
```

Key changes from v1:
- Removed `<all_urls>` from `host_permissions` — moved to `optional_host_permissions`
- Added CSP to block inline scripts
- Removed `contextMenus` from required permissions (moved to optional)
- Removed `content_scripts` block — content script injected on-demand via `scripting.executeScript`
- Added PushEngage API domain to host_permissions

**Step 2: Create styles/theme.css**

```css
/* PushEngage Brand Tokens */
:root {
  --pe-navy: #191A35;
  --pe-blue: #3B43FF;
  --pe-blue-hover: #2F36D9;
  --pe-blue-light: #EAEBFF;
  --pe-gold: #FFD37D;
  --pe-gold-light: #FFF4DC;
  --pe-white: #FFFFFF;
  --pe-gray-50: #F9FAFB;
  --pe-gray-100: #F3F4F6;
  --pe-gray-200: #E5E7EB;
  --pe-gray-300: #D1D5DB;
  --pe-gray-400: #9CA3AF;
  --pe-gray-500: #6B7280;
  --pe-gray-600: #4B5563;
  --pe-gray-700: #374151;
  --pe-gray-800: #1F2937;
  --pe-green: #10B981;
  --pe-green-light: #D1FAE5;
  --pe-red: #EF4444;
  --pe-red-light: #FEE2E2;
  --pe-amber: #F59E0B;
  --pe-amber-light: #FEF3C7;
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 18px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 20px;
  --space-2xl: 24px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --popup-width: 420px;
  --popup-max-height: 600px;
}

@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../fonts/Inter-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('../fonts/Inter-Medium.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('../fonts/Inter-SemiBold.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../fonts/Inter-Bold.woff2') format('woff2');
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { width: var(--popup-width); font-size: var(--text-base); }
body {
  width: var(--popup-width);
  max-height: var(--popup-max-height);
  font-family: var(--font-family);
  color: var(--pe-navy);
  background: var(--pe-white);
  line-height: 1.5;
  overflow-x: hidden;
  overflow-y: auto;
}
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--pe-gray-300); border-radius: 2px; }
.hidden { display: none !important; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
```

**Step 3: Download Inter font files**

Run:
```bash
cd "Campaign Creater"
mkdir -p fonts
curl -L "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.woff2" -o fonts/Inter-Regular.woff2
curl -L "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Medium.woff2" -o fonts/Inter-Medium.woff2
curl -L "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-SemiBold.woff2" -o fonts/Inter-SemiBold.woff2
curl -L "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.woff2" -o fonts/Inter-Bold.woff2
```

If download fails, use system font fallback — the CSS already has `-apple-system, BlinkMacSystemFont` in the stack.

**Step 4: Create modules/ directory**

Run: `mkdir -p modules`

**Step 5: Commit**

```bash
git add manifest.json styles/theme.css fonts/ modules/
git commit -m "feat: scaffold v2 project structure with secure manifest and brand theme"
```

---

## Task 2: Sanitization & Security Module

**Files:**
- Create: `modules/sanitize.js`

**Step 1: Create the sanitization module**

```javascript
// modules/sanitize.js
// Security utilities for sanitizing user-controlled and page-extracted data

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

export function sanitizeUrl(src) {
  if (!src || typeof src !== 'string') return '';
  try {
    const url = new URL(src);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    return '';
  } catch { return ''; }
}

export function sanitizeImageUrl(src) {
  if (!src || typeof src !== 'string') return '';
  try {
    const url = new URL(src);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

export function truncate(str, maxLen) {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  const truncated = str.substring(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxLen * 0.7 ? truncated.substring(0, lastSpace) : truncated;
}

export function sanitizePageData(data) {
  return {
    title: truncate(data.title || '', 85),
    description: truncate(data.description || '', 135),
    url: sanitizeUrl(data.url || ''),
    image: sanitizeImageUrl(data.image || ''),
    images: (data.images || [])
      .map(img => ({ src: sanitizeImageUrl(img.src || img), alt: (img.alt || '').substring(0, 100) }))
      .filter(img => img.src),
    author: (data.author || '').substring(0, 100),
    siteName: (data.siteName || '').substring(0, 100)
  };
}

/**
 * Set text content safely on an element. Never use innerHTML with untrusted data.
 */
export function setText(el, text) {
  if (el) el.textContent = text;
}
```

**Step 2: Commit**

```bash
git add modules/sanitize.js
git commit -m "feat: add sanitization module for XSS prevention and URL validation"
```

---

## Task 3: State Management Module

**Files:**
- Create: `modules/state.js`

**Step 1: Create the state store with event bus**

```javascript
// modules/state.js
// Central state store with event-driven updates

const _state = {
  token: null, user: null, sites: [], activeSiteId: null,
  siteDetails: null, permissions: {},
  planLimits: { notifications: { used: 0, total: 0 }, aiCredits: { used: 0, total: 0 } },
  compose: {
    title: '', message: '', url: '', imageUrl: '', bigImage: '',
    segments: [], audienceType: 'all', actions: [],
    utmEnabled: false,
    utmParams: { source: '', medium: '', campaign: '', term: '', content: '' },
    scheduleType: 'now', scheduleDate: '', scheduleTime: '', timezoneSend: false
  },
  pageData: null, segmentsList: [],
  currentScreen: 'login', loading: false, recentSends: []
};

const _listeners = {};

export function getState(key) {
  if (!key) return { ..._state };
  const keys = key.split('.');
  let val = _state;
  for (const k of keys) { if (val == null) return undefined; val = val[k]; }
  return val;
}

export function setState(key, value) {
  const keys = key.split('.');
  let target = _state;
  for (let i = 0; i < keys.length - 1; i++) {
    if (target[keys[i]] == null) target[keys[i]] = {};
    target = target[keys[i]];
  }
  const lastKey = keys[keys.length - 1];
  const oldValue = target[lastKey];
  target[lastKey] = value;
  emit(key, value, oldValue);
}

export function on(event, callback) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(callback);
  return () => off(event, callback);
}

export function off(event, callback) {
  if (!_listeners[event]) return;
  _listeners[event] = _listeners[event].filter(cb => cb !== callback);
}

export function emit(event, ...args) {
  (_listeners[event] || []).forEach(cb => cb(...args));
  (_listeners['*'] || []).forEach(cb => cb(event, ...args));
}

export function resetCompose() {
  setState('compose', {
    title: '', message: '', url: '', imageUrl: '', bigImage: '',
    segments: [], audienceType: 'all', actions: [],
    utmEnabled: false,
    utmParams: { source: '', medium: '', campaign: '', term: '', content: '' },
    scheduleType: 'now', scheduleDate: '', scheduleTime: '', timezoneSend: false
  });
}

export function resetAll() {
  setState('token', null); setState('user', null); setState('sites', []);
  setState('activeSiteId', null); setState('siteDetails', null);
  setState('permissions', {});
  setState('planLimits', { notifications: { used: 0, total: 0 }, aiCredits: { used: 0, total: 0 } });
  setState('segmentsList', []); setState('currentScreen', 'login');
  resetCompose();
}
```

**Step 2: Commit**

```bash
git add modules/state.js
git commit -m "feat: add central state store with event bus"
```

---

## Task 4: API Client Module

**Files:**
- Create: `modules/api.js`

**Step 1: Create the API client**

All endpoint paths and field names must match the Adonis API exactly. Reference the dashboard app's `src/apis/` directory for the correct field names and query parameter formats.

```javascript
// modules/api.js
// HTTP client for PushEngage Adonis API

import { getState } from './state.js';

const API_BASE = 'https://dashboard-public-api.pushengage.com/d/v1';

class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(method, path, body = null) {
  const token = getState('token');
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${path}`, opts);

  if (response.status === 401) throw new ApiError('Session expired. Please log in again.', 401);
  if (response.status === 403) throw new ApiError('You do not have permission for this action.', 403);

  let data;
  try { data = await response.json(); } catch {
    if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
    return null;
  }

  if (!response.ok) {
    throw new ApiError(data?.message || data?.error || `Request failed (${response.status})`, response.status, data);
  }
  return data;
}

// --- Auth ---
export async function login(email, password) { return request('POST', '/auth/login', { email, password }); }
export async function googleLogin(payload) { return request('POST', '/auth/google-login', payload); }
export async function getAuthUser() { return request('GET', '/auth'); }
export async function logout() { return request('POST', '/auth/logout'); }

// --- Sites ---
export async function listSites() { return request('GET', '/sites'); }
export async function getSiteDetails(siteId) { return request('GET', `/sites/${siteId}`); }

// --- Notifications ---
// action: 'sent' | 'draft'. type: 'generic' (default) | 'ab'
export async function createNotification(siteId, payload, action = 'sent') {
  return request('POST', `/sites/${siteId}/notifications?action=${action}&type=generic`, payload);
}
export async function listNotifications(siteId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request('GET', `/sites/${siteId}/notifications${query ? '?' + query : ''}`);
}
export async function getNotification(siteId, notificationId) {
  return request('GET', `/sites/${siteId}/notifications/${notificationId}`);
}

// --- Segments ---
export async function listSegments(siteId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request('GET', `/sites/${siteId}/segments${query ? '?' + query : ''}`);
}
export async function createSegment(siteId, payload) {
  // payload: { segment_name, segment_criteria: { include: [...], exclude: [...] }, add_segment_on_page_load: 0|1 }
  return request('POST', `/sites/${siteId}/segments`, payload);
}
export async function updateSegment(siteId, segmentId, payload) {
  return request('PATCH', `/sites/${siteId}/segments/${segmentId}`, payload);
}
export async function getGeoSegments(siteId) {
  return request('GET', `/sites/${siteId}/geo-segments`);
}

// --- Analytics ---
export async function getAnalyticsSummary(siteId, startDate, endDate) {
  const params = new URLSearchParams({ start_created_at: startDate, end_created_at: endDate, expand: 'analytics_in_metadata' });
  return request('GET', `/sites/${siteId}/analytics/summary?${params}`);
}
export async function getNotificationResultSummary(siteId) {
  return request('GET', `/sites/${siteId}/analytics/notification-result/summary`);
}
export async function getNotificationResultTimeseries(siteId, startDate, endDate, groupBy = 'day') {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, group_by: groupBy });
  return request('GET', `/sites/${siteId}/analytics/notification-result/timeseries?${params}`);
}
export async function getOptinAnalytics(siteId, startDate, endDate) {
  const params = new URLSearchParams({ start_created_at: startDate, end_created_at: endDate });
  return request('GET', `/sites/${siteId}/analytics/optin?${params}`);
}

// --- AI (PushEngage AI credits) ---
export async function generateAISuggestions(siteId, type, content) {
  return request('POST', `/sites/${siteId}/ai/generate`, { type, content });
}

export { ApiError };
```

**Step 2: Commit**

```bash
git add modules/api.js
git commit -m "feat: add API client module matching Adonis endpoint structure"
```

---

## Task 5: Auth Module (Login/Logout/Token Storage)

**Files:**
- Create: `modules/auth.js`

**Step 1: Create auth module with AES-GCM encrypted token storage**

Uses Web Crypto API for encryption. Token is never stored in plaintext.

Session restore flow:
1. Read encrypted token from `chrome.storage.local`
2. Decrypt with AES-GCM key (also in chrome.storage)
3. Validate token by calling `GET /d/v1/auth`
4. If valid, restore user state and load sites
5. If invalid, clear session and show login

Login flow:
1. `POST /d/v1/auth/login` → get JWT token
2. Encrypt and store token
3. `GET /d/v1/sites` → get site list
4. If 1 site → auto-select; if 2+ → show picker
5. `selectSite()` loads site details, permissions, plan limits, segments

```javascript
// modules/auth.js
import * as api from './api.js';
import { getState, setState, resetAll, emit } from './state.js';

const STORAGE_KEY = 'pe_session';
const ENCRYPT_KEY_NAME = 'pe-token-key';

async function getEncryptionKey() {
  const stored = await chrome.storage.local.get(ENCRYPT_KEY_NAME);
  if (stored[ENCRYPT_KEY_NAME]) {
    const raw = Uint8Array.from(atob(stored[ENCRYPT_KEY_NAME]), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({ [ENCRYPT_KEY_NAME]: btoa(String.fromCharCode(...new Uint8Array(exported))) });
  return key;
}

async function encryptToken(token) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(encrypted))) };
}

async function decryptToken(stored) {
  const key = await getEncryptionKey();
  const iv = Uint8Array.from(atob(stored.iv), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(stored.data), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
}

async function saveSession() {
  const token = getState('token');
  if (!token) return;
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      token: await encryptToken(token),
      user: getState('user'),
      activeSiteId: getState('activeSiteId'),
      savedAt: Date.now()
    }
  });
}

export async function restoreSession() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const session = stored[STORAGE_KEY];
    if (!session?.token) return false;
    setState('token', await decryptToken(session.token));
    const authData = await api.getAuthUser();
    if (!authData) { await clearSession(); return false; }
    setState('user', authData.data || authData.user || authData);
    const sitesResult = await api.listSites();
    setState('sites', sitesResult.data || sitesResult || []);
    if (session.activeSiteId) await selectSite(session.activeSiteId);
    return true;
  } catch (e) {
    console.warn('Session restore failed:', e.message);
    await clearSession();
    return false;
  }
}

export async function loginWithEmail(email, password) {
  setState('loading', true);
  try {
    const result = await api.login(email, password);
    setState('token', result.token || result.data?.token);
    setState('user', result.user || result.data?.user || result.data);
    const sitesResult = await api.listSites();
    const sites = sitesResult.data || sitesResult || [];
    setState('sites', sites);
    if (sites.length === 1) await selectSite(sites[0].id || sites[0].site_id);
    await saveSession();
    setState('loading', false);
    return { sites };
  } catch (e) { setState('loading', false); throw e; }
}

export async function selectSite(siteId) {
  setState('activeSiteId', siteId);
  setState('loading', true);
  try {
    const details = await api.getSiteDetails(siteId);
    const siteData = details.data || details;
    setState('siteDetails', siteData);
    setState('permissions', siteData.permissions || siteData.plan_permissions || {});
    const plan = siteData.plan || siteData.subscription || {};
    setState('planLimits', {
      notifications: { used: plan.notification_used || 0, total: plan.notification_limit || 0 },
      aiCredits: { used: plan.ai_credits_used || 0, total: plan.ai_credits_limit || 0 }
    });
    try {
      const segs = await api.listSegments(siteId, { limit: 100 });
      setState('segmentsList', segs.data || []);
    } catch { setState('segmentsList', []); }
    await saveSession();
    setState('loading', false);
    emit('siteChanged', siteId);
  } catch (e) { setState('loading', false); throw e; }
}

export async function logoutUser() {
  try { await api.logout(); } catch { /* clear local regardless */ }
  await clearSession();
  resetAll();
  emit('loggedOut');
}

async function clearSession() { await chrome.storage.local.remove([STORAGE_KEY]); }
```

**Step 2: Commit**

```bash
git add modules/auth.js
git commit -m "feat: add auth module with AES-GCM encrypted token storage"
```

---

## Task 6: Permissions Module

**Files:**
- Create: `modules/permissions.js`

**Step 1: Create permissions module**

Permission key names must match what the Adonis API returns in site details. The dashboard app uses both camelCase and snake_case variants — check both.

```javascript
// modules/permissions.js
import { getState } from './state.js';

function has(key) {
  const perms = getState('permissions') || {};
  return !!perms[key];
}

export const canReadSegment = () => has('canReadSegment') || has('can_read_segment');
export const canWriteSegment = () => has('canWriteSegment') || has('can_write_segment');
export const canWriteScheduleNotification = () => has('canWriteScheduleNotification') || has('can_write_schedule_notification');
export const canWriteTimezoneNotification = () => has('canWriteTimezoneNotification') || has('can_write_timezone_notification');
export const canWriteMultiActionBtn = () => has('canWriteNotificationWithMultiActionBtn') || has('can_write_notification_with_multi_action_btn');
export const hasLargeImagePermission = () => has('hasLargeImagePermission') || has('has_large_image_permission');
export const hasGoalTrackingPermission = () => has('hasGoalTrackingPermission') || has('has_goal_tracking_permission');
export const canReadNotification = () => has('canReadNotification') || has('can_read_notification');

export function hasAiCredits() { return getState('planLimits').aiCredits.total > 0; }
export function aiCreditsRemaining() {
  const l = getState('planLimits');
  return Math.max(0, l.aiCredits.total - l.aiCredits.used);
}
export function aiCreditsLow() {
  const l = getState('planLimits');
  return l.aiCredits.total > 0 && aiCreditsRemaining() < l.aiCredits.total * 0.1;
}
export function notificationQuota() {
  const l = getState('planLimits');
  return {
    used: l.notifications.used, total: l.notifications.total,
    remaining: Math.max(0, l.notifications.total - l.notifications.used),
    exhausted: l.notifications.used >= l.notifications.total,
    percentage: l.notifications.total > 0 ? Math.round((l.notifications.used / l.notifications.total) * 100) : 0
  };
}
```

**Step 2: Commit**

```bash
git add modules/permissions.js
git commit -m "feat: add permissions module for plan-based feature gating"
```

---

## Task 7: Safeguards Module

**Files:**
- Create: `modules/safeguards.js`

**Step 1: Create safeguards module**

```javascript
// modules/safeguards.js
import { getState, setState } from './state.js';
import { notificationQuota } from './permissions.js';

const MAX_SENDS = 5, WINDOW_MS = 600000, COOLDOWN_COUNT = 3, COOLDOWN_MS = 300000, DEDUP_MS = 3600000;

export function recordSend(title, url) {
  const sends = getState('recentSends') || [];
  sends.push({ title, url, timestamp: Date.now() });
  setState('recentSends', sends.filter(s => s.timestamp > Date.now() - DEDUP_MS));
}

export function preSendCheck(title, url, audienceSize) {
  const quota = notificationQuota();
  if (quota.exhausted) return { allowed: false, type: 'quota_exhausted', reason: `You've used all ${quota.total.toLocaleString()} notifications this month.`, quota };
  if (audienceSize > quota.remaining) return { allowed: false, type: 'quota_exceeded', reason: `Targets ${audienceSize.toLocaleString()} subs but ${quota.remaining.toLocaleString()} remaining.`, quota, audienceSize };

  const now = Date.now();
  const sends = (getState('recentSends') || []).filter(s => s.timestamp > now - WINDOW_MS);
  if (sends.length >= MAX_SENDS) {
    const waitMs = WINDOW_MS - (now - Math.min(...sends.map(s => s.timestamp)));
    return { allowed: false, type: 'rate_limited', reason: `${MAX_SENDS} campaigns in 10 minutes.`, waitMs };
  }
  if (sends.filter(s => s.timestamp > now - COOLDOWN_MS).length >= COOLDOWN_COUNT)
    return { allowed: true, type: 'cooldown', reason: "You're sending frequently. Continue?" };

  const dup = sends.find(s => s.title === title && s.url === url);
  if (dup) {
    const mins = Math.round((now - dup.timestamp) / 60000);
    return { allowed: true, type: 'duplicate', reason: `Same title+URL sent ${mins}m ago.` };
  }
  return { allowed: true, type: 'ok' };
}

export function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
```

**Step 2: Commit**

```bash
git add modules/safeguards.js
git commit -m "feat: add safeguards module for rate limiting and quota enforcement"
```

---

## Task 8: Modal & Accordion Components

**Files:**
- Create: `modules/modal.js`
- Create: `modules/accordion.js`

**Step 1: Create modal module using safe DOM methods (no innerHTML)**

```javascript
// modules/modal.js
// All content set via textContent — never innerHTML with untrusted data

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function confirm({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', confirmClass = 'btn-primary' }) {
  return new Promise(resolve => {
    const overlay = createEl('div', 'modal-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    const card = createEl('div', 'modal-card');
    card.appendChild(createEl('div', 'modal-title', title));
    card.appendChild(createEl('div', 'modal-body', body));

    const actions = createEl('div', 'modal-actions');
    const cancelBtn = createEl('button', 'btn btn-secondary', cancelText);
    cancelBtn.type = 'button';
    const confirmBtn = createEl('button', `btn ${confirmClass}`, confirmText);
    confirmBtn.type = 'button';
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);
    overlay.appendChild(card);

    const close = (result) => { overlay.remove(); resolve(result); };
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

export function alert({ title, body, okText = 'OK' }) {
  return new Promise(resolve => {
    const overlay = createEl('div', 'modal-overlay');
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    const card = createEl('div', 'modal-card');
    card.appendChild(createEl('div', 'modal-title', title));
    card.appendChild(createEl('div', 'modal-body', body));

    const actions = createEl('div', 'modal-actions');
    const okBtn = createEl('button', 'btn btn-primary', okText);
    okBtn.type = 'button';
    actions.appendChild(okBtn);
    card.appendChild(actions);
    overlay.appendChild(card);

    okBtn.addEventListener('click', () => { overlay.remove(); resolve(); });
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}
```

**Step 2: Create accordion module**

```javascript
// modules/accordion.js

export function initAccordions(container = document) {
  container.querySelectorAll('[data-accordion]').forEach(el => {
    const header = el.querySelector('.accordion-header');
    if (!header) return;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('tabindex', '0');

    const toggle = () => {
      const body = el.querySelector('.accordion-body');
      const isOpen = el.classList.contains('accordion-open');
      el.classList.toggle('accordion-open', !isOpen);
      header.setAttribute('aria-expanded', String(!isOpen));
      body.style.maxHeight = isOpen ? '0' : body.scrollHeight + 'px';
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

export function lockAccordion(name, message) {
  const el = document.querySelector(`[data-accordion="${name}"]`);
  if (!el) return;
  el.setAttribute('data-locked', 'true');
  const lock = el.querySelector('.accordion-lock');
  if (lock) lock.classList.remove('hidden');
  const body = el.querySelector('.accordion-body');
  if (!body) return;
  body.textContent = '';
  const nudge = document.createElement('div');
  nudge.className = 'upgrade-nudge';
  const msg = document.createElement('p');
  msg.textContent = message;
  nudge.appendChild(msg);
  const link = document.createElement('a');
  link.href = 'https://app.pushengage.com/settings/billing';
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'btn btn-upgrade';
  link.textContent = 'Upgrade Plan';
  nudge.appendChild(link);
  body.appendChild(nudge);
}

export function openAccordion(name) {
  const el = document.querySelector(`[data-accordion="${name}"]`);
  if (el && !el.classList.contains('accordion-open')) el.querySelector('.accordion-header')?.click();
}
```

**Step 3: Commit**

```bash
git add modules/modal.js modules/accordion.js
git commit -m "feat: add modal (safe DOM methods) and accordion components with a11y"
```

---

## Task 9: Content Script (Rewrite)

**Files:**
- Rewrite: `content.js`

**Step 1: Rewrite content.js**

On-demand extraction only (injected via `chrome.scripting.executeScript`). No auto-injection on every page. Returns sanitized data. All image URLs validated (no javascript: or data: URIs).

See full implementation in design doc. Key: this is an IIFE that returns the extracted data object. No message listeners, no global side effects.

**Step 2: Commit**

```bash
git add content.js
git commit -m "feat: rewrite content script with on-demand sanitized extraction"
```

---

## Task 10: Background Service Worker (Rewrite)

**Files:**
- Rewrite: `background.js`

**Step 1: Minimal service worker**

Only handles keyboard shortcut command. No message passing, no campaign sending logic (that's in the popup modules now).

```javascript
chrome.commands.onCommand.addListener((command) => {
  if (command === 'create-campaign') chrome.action.openPopup();
});
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.action.setBadgeBackgroundColor({ color: '#3B43FF' });
});
```

**Step 2: Commit**

```bash
git add background.js
git commit -m "feat: minimal background service worker for v2"
```

---

## Task 11: Popup HTML Shell (Rewrite)

**Files:**
- Rewrite: `popup.html`

**Step 1: Create full popup HTML**

All 5 screens as `<section>` elements. Semantic HTML throughout:
- `<form>` wrappers, `<label for="">`, `<input>` with `id`, `name`, `type`, `maxlength`, `required`
- `<fieldset>` and `<legend>` for radio groups
- `[data-accordion]` elements with `.accordion-header` and `.accordion-body`
- ARIA attributes: `aria-label`, `aria-expanded`, `aria-hidden`, `role`
- No inline `onclick` or `style` attributes
- CSS in `<style>` block references `theme.css` variables
- `<script type="module" src="popup.js"></script>` at bottom

Target: ~800-1000 lines. Write in full.

**Step 2: Commit**

```bash
git add popup.html
git commit -m "feat: semantic popup HTML with all 5 screens and a11y support"
```

---

## Task 12: Header Module

**Files:**
- Create: `modules/header.js`

Manages: site selector dropdown, user menu dropdown, stats ticker, click-outside-to-close. All DOM updates via `textContent` and `classList`. Wires up state change listeners.

**Commit:** `git commit -m "feat: header module with site selector, user menu, stats ticker"`

---

## Task 13: Compose Screen Module

**Files:**
- Create: `modules/compose.js`

The largest module. Handles:
- Page extraction via `chrome.scripting.executeScript({ target: { tabId }, func: extractFn })`
- Pre-fill all fields from sanitized page data
- Character counters (title 85, message 135)
- AI suggestion buttons (permission-gated, credit-counted)
- Segment accordion: fetch list, render with search (if 10+), "Create from URL"
- Action buttons accordion: 2 buttons max
- UTM accordion: pre-fill from settings defaults
- Schedule accordion: send now / later with date/time
- Campaign payload construction matching Adonis API field names exactly:
  - `title`, `message`, `url`, `image_url`, `big_image`
  - `notification_criteria.include_segments`
  - `actions.action1Title`, `actions.action1Url`, etc.
  - `utm_params` object
  - `status`, `valid_from`, `source: 'chrome_extension'`
- Pre-send: run `safeguards.preSendCheck()` → show appropriate modal
- Send: `api.createNotification(siteId, payload, action)`
- Post-send: `safeguards.recordSend()`, increment quota locally, show success

**Commit:** `git commit -m "feat: compose module with pre-fill, segments, scheduling, send flow"`

---

## Task 14: Insights Screen Module

**Files:**
- Create: `modules/insights.js`

Renders all Insights sections. Data fetching from analytics API endpoints. JTBD nudge computation logic. "Send to them now" wires back to compose with segment pre-selected.

**Commit:** `git commit -m "feat: insights module with KPIs, top segments, countries, JTBD nudges"`

---

## Task 15: Segment Manager Module

**Files:**
- Create: `modules/segments.js`

URL pattern intelligence, add-to-existing, create-new. All API calls via `api.createSegment` / `api.updateSegment`.

**Commit:** `git commit -m "feat: segment manager with URL pattern intelligence"`

---

## Task 16: Settings Module

**Files:**
- Create: `modules/settings.js`

Auto-extract toggle + default UTM values. Reads/writes `chrome.storage.local`.

**Commit:** `git commit -m "feat: settings module with auto-extract and default UTM"`

---

## Task 17: Main Entry Point (popup.js)

**Files:**
- Rewrite: `popup.js`

Module orchestrator: imports all modules, handles screen routing, DOMContentLoaded init, session restore → compose or login.

**Commit:** `git commit -m "feat: popup.js module orchestrator with screen routing"`

---

## Task 18: Integration Testing & Infrastructure Compatibility Review

**Files:** All files

**Step 1: Load and test in Chrome**

1. `chrome://extensions/` → Load unpacked → `Campaign Creater/`
2. Test login → site selection → compose pre-fill → send → insights → segment manager

**Step 2: Compatibility review against PushEngage repos**

Verify these match the Adonis API exactly:
- Auth header format: `Authorization: Bearer {token}` (not `api_key` or `x-pe-api-key`)
- Notification create endpoint: `POST /d/v1/sites/:siteId/notifications?action=sent&type=generic`
- Notification payload field names: `title`, `message`, `url` (NOT `notification_title`, `notification_message`, `notification_url` — check which the Adonis API expects)
- Segment create payload: `segment_name`, `segment_criteria`, `add_segment_on_page_load`
- Analytics endpoints and query param names
- Permission key names from site details response

Cross-reference with:
- Adonis controllers: `NotificationController`, `SegmentController`, `AuthController`
- Dashboard app API calls: `src/apis/notifications.ts`, `src/apis/segments.ts`
- Dashboard types: `src/types/notification.d.ts`

**Step 3: Fix any mismatches found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Campaign Creator v2 complete — all screens, API integration, safeguards"
```

---

## Task Summary

| # | Task | Key Files | Deps |
|---|------|-----------|------|
| 1 | Scaffold & manifest | manifest.json, theme.css, fonts/ | — |
| 2 | Sanitization module | modules/sanitize.js | — |
| 3 | State management | modules/state.js | — |
| 4 | API client | modules/api.js | 3 |
| 5 | Auth module | modules/auth.js | 3, 4 |
| 6 | Permissions module | modules/permissions.js | 3 |
| 7 | Safeguards module | modules/safeguards.js | 3, 6 |
| 8 | Modal + Accordion | modules/modal.js, accordion.js | — |
| 9 | Content script | content.js | — |
| 10 | Background worker | background.js | — |
| 11 | Popup HTML shell | popup.html | 1 |
| 12 | Header module | modules/header.js | 3, 5 |
| 13 | Compose module | modules/compose.js | 2-8 |
| 14 | Insights module | modules/insights.js | 3, 4, 6 |
| 15 | Segment Manager | modules/segments.js | 3, 4, 6 |
| 16 | Settings module | modules/settings.js | 3 |
| 17 | Main entry (popup.js) | popup.js | 3, 5, 8, 12-16 |
| 18 | Testing & compatibility | All | All |
