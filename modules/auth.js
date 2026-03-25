// modules/auth.js
import * as api from './api.js';
import { extractNotifications } from './api.js';
import { getState, setState, resetAll, emit } from './state.js';

const STORAGE_KEY = 'pe_session';
const ENCRYPT_KEY_NAME = 'pe-token-key';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — force re-login after this
const ACTIVITY_KEY = 'pe_last_activity';

// GET /auth returns sites as an object {"84235": "site.com"} — convert to array
function parseSitesObject(sites) {
  if (Array.isArray(sites)) return sites;
  if (sites && typeof sites === 'object') {
    return Object.entries(sites).map(([id, name]) => ({ site_id: Number(id), site_name: name }));
  }
  return [];
}

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
    const stored = await chrome.storage.local.get([STORAGE_KEY, ACTIVITY_KEY]);
    const session = stored[STORAGE_KEY];
    if (!session?.token) return false;

    // Check session age — force re-login after SESSION_TTL_MS
    const sessionAge = Date.now() - (session.savedAt || 0);
    if (sessionAge > SESSION_TTL_MS) {
      console.info('Session expired after 6 hours. Please sign in again.');
      await clearSession();
      return false;
    }

    // Check last activity — if no activity for SESSION_TTL_MS, expire
    const lastActivity = stored[ACTIVITY_KEY] || session.savedAt || 0;
    if (Date.now() - lastActivity > SESSION_TTL_MS) {
      console.info('Session expired due to inactivity. Please sign in again.');
      await clearSession();
      return false;
    }

    setState('token', await decryptToken(session.token));
    // Validate session by calling GET /auth
    const authResult = await api.getAuthUser();
    const authData = authResult.data || authResult;
    const sites = parseSitesObject(authData.sites);
    if (!sites.length && !session.user) { await clearSession(); return false; }
    setState('user', authData);
    setState('sites', sites);

    // Update activity timestamp on successful restore
    touchActivity();

    if (session.activeSiteId) await selectSite(session.activeSiteId);
    return true;
  } catch (e) {
    console.warn('Session restore failed:', e.message);
    await clearSession();
    return false;
  }
}

/** Update last-activity timestamp. Called on popup open and user actions. */
export function touchActivity() {
  chrome.storage.local.set({ [ACTIVITY_KEY]: Date.now() }).catch(() => {});
}

/**
 * Login using a token captured from the PushEngage dashboard.
 * The background service worker extracts the token after the user
 * completes login on app.pushengage.com.
 *
 * @param {string} token - JWT Bearer token
 * @param {object|null} user - User object from dashboard localStorage
 * @param {number|null} currentSiteId - Site ID the user was on in the dashboard
 */
export async function loginWithToken(token, user, currentSiteId) {
  setState('loading', true);
  try {
    setState('token', token);
    if (user) setState('user', user);

    // Validate the token by calling GET /auth
    const authResult = await api.getAuthUser();
    const authData = authResult.data || authResult;
    setState('user', authData);
    const sites = parseSitesObject(authData.sites);
    setState('sites', sites);

    // Auto-select site: prefer the dashboard's active site, then first site
    if (currentSiteId && sites.some(s => s.site_id === currentSiteId)) {
      await selectSite(currentSiteId);
    } else if (sites.length > 0) {
      await selectSite(sites[0].site_id);
    }

    // saveSession() already called inside selectSite(), no need to call again
    setState('loading', false);

    // Clear the pending auth from storage
    await chrome.storage.local.remove('pe_pending_auth');

    return { sites };
  } catch (e) {
    setState('loading', false);
    const msg = typeof e?.message === 'string' ? e.message : 'Login failed. Please try again.';
    throw new Error(msg);
  }
}

export async function selectSite(siteId) {
  setState('activeSiteId', siteId);
  setState('loading', true);
  try {
    // Fire 5 independent API calls in parallel (getAiCredits depends on siteDetails, runs after)
    const [detailsResult, subCountResult, utmResult, segsResult, notifResult] = await Promise.allSettled([
      api.getSiteDetails(siteId),
      api.getActiveSubscriberCount(siteId),
      api.getUtmSettings(siteId),
      api.listSegments(siteId, { limit: 100, expand: 'subscriber_analytics' }),
      api.listNotifications(siteId, { limit: 20, status: 'sent', order_by_desc: 'sent_at', expand: 'notification_analytics' })
    ]);

    // 1. Site details — REQUIRED (throw if failed)
    if (detailsResult.status === 'rejected') throw detailsResult.reason;
    const details = detailsResult.value;
    const siteData = details.data || details;
    setState('siteDetails', siteData);

    const userInfo = details.user || {};
    const owner = userInfo.owner || {};
    const perms = owner.permissions || userInfo.permissions || {};
    setState('permissions', perms);

    const sub = owner.paymentSubscription || {};
    setState('planInfo', {
      name: sub.name || 'Free',
      currentPlan: owner.current_plan || 0,
      subscribersLimit: sub.subscribers_limit || 0,
      segmentLimit: sub.segment_limit || 0,
      notificationLimit: sub.notification_limit || 0,
      numberOfSites: sub.number_of_sites || 0,
      price: sub.price || 0,
      planMode: sub.plan_mode || '',
      isTrial: owner.is_trial || 0,
      expiryDate: owner.expiry_date || '',
      paymentStatus: owner.payment_subscription_status || '',
    });
    setState('planLimits', {
      notifications: { used: 0, total: sub.notification_limit || 0 },
      aiCredits: { used: 0, total: 0 }
    });

    // 2. AI credits — depends on ownerId from details, runs AFTER details resolve
    try {
      const ownerId = owner.owner_id || userInfo.owner_id;
      if (ownerId) {
        const credits = await api.getAiCredits(ownerId);
        setState('aiCreditsRemaining', credits?.data?.remaining_credit || 0);
      }
    } catch { setState('aiCreditsRemaining', 0); }

    // 3. Subscriber count (from parallel — graceful degradation)
    setState('subscriberCount', subCountResult.status === 'fulfilled'
      ? (subCountResult.value?.data?.count || 0) : 0);

    // 4. UTM settings (from parallel — graceful degradation)
    setState('siteUtmDefaults', utmResult.status === 'fulfilled'
      ? (utmResult.value?.data || {}) : {});

    // 5. Segments (from parallel — graceful degradation)
    if (segsResult.status === 'fulfilled') {
      setState('segmentsList', segsResult.value?.data?.data || segsResult.value?.data || []);
    } else { setState('segmentsList', []); }

    // 6. Recent notifications (shared by header + recommendations — deduplicates 2 API calls)
    setState('recentNotifications', notifResult.status === 'fulfilled'
      ? extractNotifications(notifResult.value) : []);

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

async function clearSession() { await chrome.storage.local.remove([STORAGE_KEY, ACTIVITY_KEY]); }
