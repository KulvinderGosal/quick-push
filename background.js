// background.js
// Service worker: keyboard shortcut, extension lifecycle, and dashboard auth capture

const DASHBOARD_ORIGIN = 'https://app.pushengage.com';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const ACTIVITY_KEY = 'pe_last_activity';
const SESSION_KEY = 'pe_session';
const SESSION_CHECK_ALARM = 'pe_session_check';

// ── Keyboard shortcut ───────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'create-campaign') {
    try { chrome.action.openPopup(); } catch { /* Chrome <99 */ }
  }
});

// ── Install badge ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.action.setBadgeBackgroundColor({ color: '#3B43FF' });
});

// ── Dashboard auth capture ──────────────────────────────────────
// Flow:
// 1. Popup sends 'open-dashboard-login' message
// 2. We open app.pushengage.com/login in a new tab
// 3. User logs in (with captcha etc.) on the dashboard
// 4. Dashboard stores JWT in localStorage as __PE__token__
// 5. We detect the tab navigated away from /login, extract the token
// 6. Store in chrome.storage for the popup to pick up on next open
//    (popup is closed while user is on dashboard tab)

let authTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'open-dashboard-login') {
    openDashboardLogin();
    sendResponse({ ok: true });
    return true;
  }
});

async function openDashboardLogin() {
  // Clean up any previous monitoring
  cleanup();

  const tab = await chrome.tabs.create({ url: `${DASHBOARD_ORIGIN}/login`, active: true });
  authTabId = tab.id;

  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
}

function onTabRemoved(tabId) {
  if (tabId === authTabId) cleanup();
}

function onTabUpdated(tabId, changeInfo, tab) {
  if (tabId !== authTabId) return;
  if (changeInfo.status !== 'complete') return;

  const url = tab.url || '';

  // User navigated away from auth pages — login likely succeeded
  if (url.startsWith(DASHBOARD_ORIGIN) &&
      !url.includes('/login') &&
      !url.includes('/register') &&
      !url.includes('/forgot-password') &&
      !url.includes('/reset-password')) {
    // Small delay to let the dashboard SPA finish writing to localStorage
    setTimeout(() => extractTokenFromTab(tabId), 1500);
  }
}

async function extractTokenFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const token = localStorage.getItem('__PE__token__');
        const userRaw = localStorage.getItem('__PE__user__');
        const currentSiteRaw = localStorage.getItem('__PE__currentSite__');

        let user = null;
        try { user = JSON.parse(userRaw); } catch {}

        // __PE__currentSite__ is a string number like "12345", not a JSON object
        const currentSiteId = currentSiteRaw ? Number(currentSiteRaw) : null;

        return { token, user, currentSiteId };
      }
    });

    const data = results?.[0]?.result;

    if (!data?.token) {
      // Token not found yet — retry once after another delay
      setTimeout(() => retryExtract(tabId), 2000);
      return;
    }

    await storeAuthAndClose(data, tabId);
  } catch (e) {
    console.warn('Token extraction failed:', e.message);
  }
}

async function retryExtract(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
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
    if (data?.token) {
      await storeAuthAndClose(data, tabId);
    }
    // If still no token, give up silently — user can retry
  } catch {}
}

async function storeAuthAndClose(data, tabId) {
  // Store in chrome.storage for the popup to pick up
  // (popup is closed while user is on dashboard, so sendMessage won't work)
  await chrome.storage.local.set({
    pe_pending_auth: {
      token: data.token,
      user: data.user,
      currentSiteId: data.currentSiteId,
      capturedAt: Date.now()
    }
  });

  // Also try sending to popup in case it's somehow open
  chrome.runtime.sendMessage({
    type: 'dashboard-auth-success',
    token: data.token,
    user: data.user,
    currentSiteId: data.currentSiteId
  }).catch(() => { /* popup not open — expected */ });

  // Set badge to indicate login succeeded
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#22C55E' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000);

  // Close the dashboard tab
  try { await chrome.tabs.remove(tabId); } catch {}
  cleanup();
}

function cleanup() {
  authTabId = null;
  chrome.tabs.onUpdated.removeListener(onTabUpdated);
  chrome.tabs.onRemoved.removeListener(onTabRemoved);
}

// ── Session expiry check (alarm-based) ──────────────────────
// Runs every 30 minutes to check if the session has expired due to
// inactivity. If expired, clears session so next popup open shows login.

chrome.alarms.create(SESSION_CHECK_ALARM, { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SESSION_CHECK_ALARM) return;

  try {
    const stored = await chrome.storage.local.get([SESSION_KEY, ACTIVITY_KEY]);
    const session = stored[SESSION_KEY];
    if (!session?.token) return; // No active session

    const lastActivity = stored[ACTIVITY_KEY] || session.savedAt || 0;
    const sessionAge = Date.now() - (session.savedAt || 0);

    // Expire if inactive for 6 hours OR session is older than 6 hours
    if (Date.now() - lastActivity > SESSION_TTL_MS || sessionAge > SESSION_TTL_MS) {
      await chrome.storage.local.remove([SESSION_KEY, ACTIVITY_KEY]);
      // Set badge to indicate session expired
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    }
  } catch {}
});

// ── Activity tracking from popup ────────────────────────────
// Popup sends 'touch-activity' on open and user interactions

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'touch-activity') {
    chrome.storage.local.set({ [ACTIVITY_KEY]: Date.now() }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
});
