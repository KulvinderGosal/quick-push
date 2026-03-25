// modules/header.js
// Header bar: site selector, user menu, header nudge

import { getState, setState, on } from './state.js';
import { selectSite, logoutUser } from './auth.js';
import { hasGoalTrackingPermission } from './permissions.js';
import { setText } from './sanitize.js';
import * as api from './api.js';

// ── DOM refs (resolved once on init) ────────────────────────────
let els = {};

function resolveElements() {
  els = {
    // Site selector
    siteDropdown:      document.getElementById('site-dropdown'),
    btnSiteSelector:   document.getElementById('btn-site-selector'),
    siteSelectorLabel:  document.getElementById('site-selector-label'),
    siteDropdownPanel: document.getElementById('site-dropdown-panel'),
    btnAddSite:        document.getElementById('btn-add-site'),

    // User menu
    userDropdown:      document.getElementById('user-dropdown'),
    btnUserMenu:       document.getElementById('btn-user-menu'),
    userAvatarLetter:  document.getElementById('user-avatar-letter'),
    userMenuPanel:     document.getElementById('user-menu-panel'),
    userMenuEmail:     document.getElementById('user-menu-email'),
    userMenuSite:      document.getElementById('user-menu-site'),
    linkDashboard:     document.getElementById('link-dashboard'),
    btnNavInsights:    document.getElementById('btn-nav-insights'),
    btnNavSegments:    document.getElementById('btn-nav-segments'),
    btnNavSettings:    document.getElementById('btn-nav-settings'),
    btnLogout:         document.getElementById('btn-logout'),

    // Header nudge
    btnHeaderNudge:      document.getElementById('btn-header-nudge'),
    headerNudgeIcon:     document.getElementById('header-nudge-icon'),
    headerNudgeHighlight: document.getElementById('header-nudge-highlight'),
    headerNudgeMessage:  document.getElementById('header-nudge-message'),
  };
}

// ── Dropdown helpers ────────────────────────────────────────────

function isDropdownOpen(dropdownEl) {
  return dropdownEl.getAttribute('aria-expanded') === 'true';
}

function openDropdown(dropdownEl) {
  dropdownEl.setAttribute('aria-expanded', 'true');
  const trigger = dropdownEl.querySelector('.dropdown-trigger, .avatar-btn');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  const panel = dropdownEl.querySelector('.dropdown-panel');
  if (panel) panel.classList.remove('hidden');
}

function closeDropdown(dropdownEl) {
  dropdownEl.setAttribute('aria-expanded', 'false');
  const trigger = dropdownEl.querySelector('.dropdown-trigger, .avatar-btn');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  const panel = dropdownEl.querySelector('.dropdown-panel');
  if (panel) panel.classList.add('hidden');
}

function toggleDropdown(dropdownEl) {
  if (isDropdownOpen(dropdownEl)) {
    closeDropdown(dropdownEl);
  } else {
    closeAllDropdowns();
    openDropdown(dropdownEl);
  }
}

function closeAllDropdowns() {
  if (els.siteDropdown) closeDropdown(els.siteDropdown);
  if (els.userDropdown) closeDropdown(els.userDropdown);
}

// ── Site selector ───────────────────────────────────────────────

function populateSiteSelector() {
  const panel = els.siteDropdownPanel;
  if (!panel) return;

  const sites = getState('sites') || [];
  const activeSiteId = getState('activeSiteId');

  // Remove existing site items (keep the divider and "Add Site" button at the end)
  const existingItems = panel.querySelectorAll('[data-site-id]');
  existingItems.forEach(item => item.remove());

  // Insert site items before the divider
  const divider = panel.querySelector('.dropdown-divider');
  sites.forEach(site => {
    const siteId = site.id || site.site_id;
    const siteName = site.site_name || site.name || site.url || 'Unknown site';
    const btn = document.createElement('button');
    btn.className = 'dropdown-item';
    btn.type = 'button';
    btn.setAttribute('role', 'option');
    btn.setAttribute('data-site-id', String(siteId));
    if (String(siteId) === String(activeSiteId)) {
      btn.setAttribute('aria-current', 'true');
    }
    btn.textContent = siteName;
    btn.addEventListener('click', () => {
      closeDropdown(els.siteDropdown);
      selectSite(siteId);
    });
    panel.insertBefore(btn, divider);
  });

  // Update trigger label
  updateSiteLabel();
}

function updateSiteLabel() {
  const sites = getState('sites') || [];
  const activeSiteId = getState('activeSiteId');
  const activeSite = sites.find(s => String(s.id || s.site_id) === String(activeSiteId));
  const siteName = activeSite
    ? (activeSite.site_name || activeSite.name || activeSite.url || 'Unknown site')
    : 'Select a site';
  setText(els.siteSelectorLabel, siteName);
  setText(els.userMenuSite, siteName);
}

// ── User menu ───────────────────────────────────────────────────

function setupUserMenu() {
  const user = getState('user');
  const email = user?.user_email || user?.email || '';

  // Set avatar letter
  if (els.userAvatarLetter && email) {
    setText(els.userAvatarLetter, email.charAt(0).toUpperCase());
  }

  // Set email in menu
  setText(els.userMenuEmail, email);

  // Wire up menu item clicks
  if (els.btnNavInsights) {
    els.btnNavInsights.addEventListener('click', () => {
      closeAllDropdowns();
      setState('currentScreen', 'insights');
    });
  }

  if (els.btnNavSegments) {
    els.btnNavSegments.addEventListener('click', () => {
      closeAllDropdowns();
      setState('currentScreen', 'segments');
    });
  }

  if (els.btnNavSettings) {
    els.btnNavSettings.addEventListener('click', () => {
      closeAllDropdowns();
      setState('currentScreen', 'settings');
    });
  }

  if (els.btnLogout) {
    els.btnLogout.addEventListener('click', () => {
      closeAllDropdowns();
      logoutUser();
    });
  }

  // "Add Site" opens dashboard
  if (els.btnAddSite) {
    els.btnAddSite.addEventListener('click', () => {
      closeAllDropdowns();
      window.open('https://app.pushengage.com/sites/new?utm_source=extension&utm_medium=header&utm_campaign=add-site', '_blank', 'noopener');
    });
  }
}

// ── Header nudge — priority waterfall ────────────────────────

async function refreshHeaderNudge() {
  const siteId = getState('activeSiteId');
  if (!siteId || !els.headerNudgeMessage) return;

  const siteDetails = getState('siteDetails') || {};
  const subscriberCount = getState('subscriberCount') || siteDetails.subscriber_count || siteDetails.subscribers_count || 0;
  const segments = getState('segmentsList') || [];
  const showRevenue = hasGoalTrackingPermission();

  // Read recent campaigns from shared state (fetched in selectSite, deduplicates API calls)
  const notifications = (getState('recentNotifications') || []).slice(0, 10);
  let totalRevenue = 0;
  let lastCampaignDate = null;
  let lastCampaignCtr = 0;

  for (const n of notifications) {
    // Revenue from notification_analytics expand
    const rev = n.revenue || n.notification_analytics?.revenue || 0;
    if (showRevenue) totalRevenue += Number(rev) || 0;
  }

  if (notifications.length > 0) {
    const lastDate = notifications[0].sent_at || notifications[0].created_at;
    if (lastDate) lastCampaignDate = new Date(lastDate);
    // Backend field names: sentcount, clickcount (no underscores)
    const lastSent = notifications[0].sentcount || notifications[0].sent_count || 0;
    const lastClicks = notifications[0].clickcount || notifications[0].click_count || 0;
    if (lastSent > 0) lastCampaignCtr = (lastClicks / lastSent) * 100;
  }

  // Fetch new subscribers (last 7 days)
  let newSubs7d = 0;
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    const optinData = await api.getOptinAnalytics(siteId,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0]
    );
    if (optinData) {
      newSubs7d = optinData.new_subscribers || optinData.total_subscriptions || 0;
      if (!newSubs7d && optinData.data && Array.isArray(optinData.data)) {
        newSubs7d = optinData.data.reduce((sum, d) => sum + (d.subscriptions || d.new_subscribers || 0), 0);
      }
    }
  } catch (err) {
    console.warn('Failed to fetch optin analytics:', err.message);
  }

  const daysSinceLast = lastCampaignDate
    ? Math.floor((Date.now() - lastCampaignDate.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const fmtNum = (n) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  };

  // Priority waterfall — first match wins
  let nudge = null;

  // P1: Revenue (goal tracking on + revenue > 0)
  if (showRevenue && totalRevenue > 0) {
    nudge = {
      icon: '\u{1F4B0}',
      highlight: '$' + totalRevenue.toFixed(0),
      message: ' revenue from recent campaigns \u2014 keep it going',
      action: () => window.open('https://app.pushengage.com/analytics/overview?utm_source=extension&utm_medium=header-nudge&utm_campaign=view-revenue', '_blank', 'noopener')
    };
  }

  // P2: Subscriber growth
  if (!nudge && newSubs7d > 0) {
    nudge = {
      icon: '\u{1F4C8}',
      highlight: '+' + fmtNum(newSubs7d),
      message: ' new subscribers this week \u2014 send a campaign to engage them',
      action: () => setState('currentScreen', 'compose')
    };
  }

  // P3: Last campaign had good CTR (> 4%)
  if (!nudge && lastCampaignCtr > 4 && notifications.length > 0) {
    nudge = {
      icon: '\u{1F3AF}',
      highlight: lastCampaignCtr.toFixed(1) + '% CTR',
      message: ' on your last campaign \u2014 your audience is engaged',
      action: () => setState('currentScreen', 'compose')
    };
  }

  // P4: Has subscribers but inactive (7+ days)
  if (!nudge && subscriberCount > 0 && daysSinceLast !== null && daysSinceLast >= 7) {
    nudge = {
      icon: '\u23F0',
      highlight: fmtNum(subscriberCount),
      message: ' subscribers waiting \u2014 it\u2019s been ' + daysSinceLast + ' days since your last campaign',
      action: () => setState('currentScreen', 'compose')
    };
  }

  // P5: Has subscribers, sent recently, normal state
  if (!nudge && subscriberCount > 0 && notifications.length > 0) {
    const segText = segments.length > 0 ? ' across ' + segments.length + ' segments' : '';
    nudge = {
      icon: '\u{1F680}',
      highlight: fmtNum(subscriberCount),
      message: ' subscribers' + segText + ' \u2014 ' + (segments.length > 0 ? 'try targeting one' : 'send your next campaign'),
      action: () => setState('currentScreen', 'compose')
    };
  }

  // P6: Zero subscribers (activation)
  if (!nudge) {
    nudge = {
      icon: '\u2728',
      highlight: '',
      message: 'Optimize your opt-in popup to start collecting subscribers',
      action: () => window.open('https://app.pushengage.com/design/subscription-dialogbox?utm_source=extension&utm_medium=header-nudge&utm_campaign=setup-optin', '_blank', 'noopener')
    };
  }

  // Render using textContent (safe — no innerHTML)
  setText(els.headerNudgeIcon, nudge.icon);
  setText(els.headerNudgeHighlight, nudge.highlight);
  setText(els.headerNudgeMessage, nudge.message);
  els.btnHeaderNudge.onclick = nudge.action;
}

// ── Click-outside handler ───────────────────────────────────────

function setupClickOutside() {
  document.addEventListener('click', (e) => {
    if (els.siteDropdown && !els.siteDropdown.contains(e.target)) {
      closeDropdown(els.siteDropdown);
    }
    if (els.userDropdown && !els.userDropdown.contains(e.target)) {
      closeDropdown(els.userDropdown);
    }
  });
}

// ── Dropdown toggle wiring ──────────────────────────────────────

function setupDropdownToggles() {
  if (els.btnSiteSelector) {
    els.btnSiteSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(els.siteDropdown);
    });
  }
  if (els.btnUserMenu) {
    els.btnUserMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(els.userDropdown);
    });
  }
}

// ── State listeners ─────────────────────────────────────────────

function setupStateListeners() {
  on('siteChanged', () => {
    populateSiteSelector();
    updateSiteLabel();
    refreshHeaderNudge();
  });
}

// ── Public API ──────────────────────────────────────────────────

export function initHeader() {
  resolveElements();
  setupDropdownToggles();
  setupClickOutside();
  populateSiteSelector();
  setupUserMenu();
  setupStateListeners();
  refreshHeaderNudge();
}
