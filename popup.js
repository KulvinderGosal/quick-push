/**
 * PushEngage Extension v2 — Module Orchestrator
 *
 * Entry point loaded by popup.html as an ES module.
 * Handles session restore, screen routing, dashboard login flow,
 * and initializes all feature modules.
 */

import { getState, setState, on } from './modules/state.js';
import { restoreSession, loginWithToken, logoutUser, touchActivity } from './modules/auth.js';
import { setText } from './modules/sanitize.js';
import { initHeader } from './modules/header.js';
import { fetchPageData, initCompose } from './modules/compose.js';
import { initInsights } from './modules/insights.js';
import { initSegments } from './modules/segments.js';
import { initSettings } from './modules/settings.js';

// ── DOM helpers ──────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const SCREENS = ['login', 'compose', 'insights', 'segments', 'settings'];

function showScreen(name) {
  for (const s of SCREENS) {
    const el = $(`screen-${s}`);
    if (!el) continue;
    el.classList.toggle('hidden', s !== name);
  }
}

// ── Screen routing ───────────────────────────────────────────

on('currentScreen', (screen) => {
  showScreen(screen);
});

on('loggedOut', () => {
  booted = false;
  showScreen('login');
  resetLoginUI();
});

// ── Login UI helpers ─────────────────────────────────────────

function showLoginError(msg) {
  const errorEl = $('login-error');
  if (!errorEl) return;
  // Guard against non-string messages (prevents [Object][Object])
  const text = (typeof msg === 'string') ? msg : 'Something went wrong. Please try again.';
  setText(errorEl, text);
  errorEl.classList.remove('hidden');
}

function hideLoginError() {
  const errorEl = $('login-error');
  if (errorEl) errorEl.classList.add('hidden');
}

function showLoginStatus() {
  const statusEl = $('login-status');
  const btnLogin = $('btn-login-dashboard');
  if (statusEl) statusEl.classList.remove('hidden');
  if (btnLogin) {
    btnLogin.disabled = true;
    btnLogin.style.opacity = '0.6';
  }
}

function resetLoginUI() {
  const statusEl = $('login-status');
  const btnLogin = $('btn-login-dashboard');
  if (statusEl) statusEl.classList.add('hidden');
  if (btnLogin) {
    btnLogin.disabled = false;
    btnLogin.style.opacity = '';
  }
  hideLoginError();
}

// ── Login flow (dashboard redirect) ─────────────────────────

function initLogin() {
  const btnLogin = $('btn-login-dashboard');

  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      hideLoginError();
      showLoginStatus();

      // First, try to detect an existing dashboard session
      try {
        const dashData = await getDashboardToken();
        if (dashData?.token) {
          console.info('[login] Found existing dashboard session, using it');
          await handleAuthSuccess(dashData.token, dashData.user, dashData.currentSiteId);
          return;
        }
      } catch (e) {
        console.warn('[login] Dashboard token check failed:', e.message);
      }

      // No existing session found — open dashboard login page
      try { await logoutUser(); } catch {}
      booted = false;
      chrome.runtime.sendMessage({ type: 'open-dashboard-login' });
    });
  }

  // Listen for auth success from background (in case popup stays open)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'dashboard-auth-success') {
      handleAuthSuccess(message.token, message.user, message.currentSiteId);
    }
  });
}

async function handleAuthSuccess(token, user, currentSiteId) {
  resetLoginUI();
  booted = false; // Allow re-boot if switching accounts

  if (!token) {
    showLoginError('No auth token received. Please try again.');
    return;
  }

  // Show a loading state
  const btnLogin = $('btn-login-dashboard');
  if (btnLogin) {
    btnLogin.disabled = true;
    setText(btnLogin, 'Setting up...');
  }

  try {
    const result = await loginWithToken(token, user, currentSiteId);
    const sites = result?.sites || [];

    if (sites.length > 0) {
      await bootApp();
    } else {
      resetLoginUI();
      showLoginError('No sites found for this account. Please create a site on the dashboard first.');
    }
  } catch (err) {
    resetLoginUI();
    // Ensure we always display a string, never an object
    const msg = (typeof err?.message === 'string' && err.message.length > 0)
      ? err.message
      : 'Login failed. Please try again.';
    showLoginError(msg);
  }
}

// ── Auto-detect dashboard session ────────────────────────────

async function getDashboardToken() {
  const tabs = await chrome.tabs.query({ url: 'https://app.pushengage.com/*' });
  const dashTab = tabs.find(t => t.url && !t.url.includes('/login') && !t.url.includes('/register'));
  if (!dashTab) {
    console.info('[getDashboardToken] No dashboard tab found. Tabs matching query:', tabs.length);
    return null;
  }
  console.info('[getDashboardToken] Found dashboard tab:', dashTab.id, dashTab.url);

  const results = await chrome.scripting.executeScript({
    target: { tabId: dashTab.id },
    func: () => {
      const token = localStorage.getItem('__PE__token__');
      const userRaw = localStorage.getItem('__PE__user__');
      const currentSiteRaw = localStorage.getItem('__PE__currentSite__');
      let user = null;
      try { user = JSON.parse(userRaw); } catch {}
      const currentSiteId = currentSiteRaw ? Number(currentSiteRaw) : null;
      return { token, user, currentSiteId };
    }
  });

  const data = results?.[0]?.result;
  if (!data?.token) {
    console.warn('[getDashboardToken] Script ran but no token found in localStorage');
  }
  return data?.token ? data : null;
}

// ── App boot (post-auth) ─────────────────────────────────────

let booted = false;

async function bootApp() {
  if (booted) return;
  booted = true;

  setState('currentScreen', 'compose');
  showScreen('compose');

  initHeader();

  // Fetch page data FIRST — segments and compose both need it
  await fetchPageData();

  await Promise.allSettled([
    initCompose(),
    initInsights(),
    Promise.resolve(initSegments()),
    initSettings()
  ]);
}

// ── Startup ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initLogin();
  // Track activity on popup open
  touchActivity();
  // Also notify background service worker
  chrome.runtime.sendMessage({ type: 'touch-activity' }).catch(() => {});

  // 1. Check for pending auth from background (dashboard login while popup was closed)
  try {
    const stored = await chrome.storage.local.get('pe_pending_auth');
    const pending = stored.pe_pending_auth;
    if (pending?.token && (Date.now() - pending.capturedAt) < 5 * 60 * 1000) {
      await handleAuthSuccess(pending.token, pending.user, pending.currentSiteId);
      return;
    }
  } catch (e) { console.warn('[startup] pending auth check failed:', e.message); }

  // 2. Dashboard token is always freshest — check it FIRST.
  //    If the user switched accounts on the dashboard, this picks up the new token.
  try {
    const dashData = await getDashboardToken();
    if (dashData) {
      // Fresh dashboard token found — always use it to stay in sync
      await handleAuthSuccess(dashData.token, dashData.user, dashData.currentSiteId);
      return;
    }
  } catch (e) { console.warn('[startup] dashboard token check failed:', e.message); }

  // 3. Restore saved session (only if no dashboard tab found)
  try {
    const restored = await restoreSession();
    if (restored && getState('activeSiteId')) {
      await bootApp();
      // Clear any expired badge
      chrome.action.setBadgeText({ text: '' }).catch(() => {});
      return;
    }
  } catch (e) { console.warn('[startup] session restore failed:', e.message); }

  // Show/hide signup link based on whether a dashboard tab exists
  // If a PE account is open in Chrome, they don't need signup — just login
  try {
    const peTabs = await chrome.tabs.query({ url: 'https://app.pushengage.com/*' });
    const hasAccount = peTabs.some(t => t.url && !t.url.includes('/login') && !t.url.includes('/register'));
    const signupFooter = $('login-signup-footer');
    if (signupFooter) signupFooter.classList.toggle('hidden', hasAccount);
  } catch {}

  showScreen('login');
});
