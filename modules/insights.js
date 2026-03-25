// modules/insights.js
// Insights screen: Account Health Snapshot + JTBD Recommendations (AI-powered)

import { setState } from './state.js';
import { setText } from './sanitize.js';
import { hasGoalTrackingPermission } from './permissions.js';
import { getRecommendations } from './recommendations.js';

// ── Number formatting ───────────────────────────────────────────────────────
function fmtNum(n) {
  if (n == null || isNaN(n) || n < 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtPct(n) {
  if (n == null || isNaN(n) || n < 0) return '0%';
  return n.toFixed(1) + '%';
}

// ── Health Snapshot ─────────────────────────────────────────────────────────

function renderHealthSnapshot(ctx) {
  const subsVal = document.getElementById('health-val-subs');
  const subsLbl = document.getElementById('health-lbl-subs');
  const subsCard = document.getElementById('health-card-subs');

  const metricVal = document.getElementById('health-val-metric');
  const metricLbl = document.getElementById('health-lbl-metric');
  const metricCard = document.getElementById('health-card-metric');

  const campVal = document.getElementById('health-val-campaigns');
  const campLbl = document.getElementById('health-lbl-campaigns');
  const campCard = document.getElementById('health-card-campaigns');

  // Slot 1: Subscribers
  if (ctx.subscriberCount > 0) {
    setText(subsVal, fmtNum(ctx.subscriberCount));
    setText(subsLbl, 'Subscribers');
    subsCard.classList.remove('health-card--opportunity');
    subsCard.onclick = () => window.open('https://app.pushengage.com/audience/subscribers?utm_source=extension&utm_medium=insights&utm_campaign=view-subscribers', '_blank', 'noopener');
  } else {
    setText(subsVal, 'Unlimited growth potential');
    setText(subsLbl, 'Set up your opt-in');
    subsCard.classList.add('health-card--opportunity');
    subsCard.onclick = () => window.open('https://app.pushengage.com/design/subscription-dialogbox?utm_source=extension&utm_medium=insights&utm_campaign=setup-optin-zero', '_blank', 'noopener');
  }

  // Slot 2: Revenue > CTR > Opportunity
  if (hasGoalTrackingPermission() && ctx.totalRevenue > 0) {
    setText(metricVal, '$' + ctx.totalRevenue.toFixed(0));
    setText(metricLbl, 'Revenue (30d)');
    metricCard.classList.remove('health-card--opportunity');
    metricCard.onclick = () => window.open('https://app.pushengage.com/analytics/overview?utm_source=extension&utm_medium=insights&utm_campaign=view-revenue', '_blank', 'noopener');
  } else if (ctx.campaignCount > 0 && ctx.avgCtr > 0) {
    setText(metricVal, fmtPct(ctx.avgCtr));
    setText(metricLbl, 'Avg CTR');
    metricCard.classList.remove('health-card--opportunity');
    metricCard.onclick = () => setState('currentScreen', 'compose');
  } else if (!hasGoalTrackingPermission() && ctx.campaignCount >= 3) {
    setText(metricVal, 'Turn notifications into revenue');
    setText(metricLbl, 'Goal Tracking');
    metricCard.classList.add('health-card--opportunity');
    metricCard.onclick = () => window.open('https://app.pushengage.com/account/billing?utm_source=extension&utm_medium=insights&utm_campaign=upsell-goal-tracking', '_blank', 'noopener');
  } else {
    setText(metricVal, 'Set your CTR benchmark');
    setText(metricLbl, 'Send a campaign');
    metricCard.classList.add('health-card--opportunity');
    metricCard.onclick = () => setState('currentScreen', 'compose');
  }

  // Slot 3: Campaign Activity
  if (ctx.campaignCount > 0) {
    setText(campVal, String(ctx.campaignCount));
    setText(campLbl, 'Campaigns (30d)');
    campCard.classList.remove('health-card--opportunity');
    campCard.onclick = () => window.open('https://app.pushengage.com/analytics/overview?utm_source=extension&utm_medium=insights&utm_campaign=view-campaigns', '_blank', 'noopener');
  } else {
    setText(campVal, '2 minutes away');
    setText(campLbl, 'Your first campaign');
    campCard.classList.add('health-card--opportunity');
    campCard.onclick = () => setState('currentScreen', 'compose');
  }
}

// ── Recommendation Cards ────────────────────────────────────────────────────

function renderRecommendations(recommendations) {
  const container = document.getElementById('recommendations-container');
  if (!container) return;

  // Clear existing content
  while (container.firstChild) container.removeChild(container.firstChild);

  if (!recommendations || recommendations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'rec-card';
    empty.style.cssText = 'text-align:center;color:var(--pe-gray-400);padding:20px;';
    empty.textContent = 'No recommendations right now \u2014 you\'re doing great!';
    container.appendChild(empty);
    return;
  }

  for (const rec of recommendations) {
    const card = document.createElement('div');
    const priority = rec.score >= 70 ? 'high' : rec.score >= 50 ? 'medium' : 'low';
    card.className = 'rec-card rec-card--' + priority;

    const icon = document.createElement('span');
    icon.className = 'rec-card-icon';
    icon.textContent = rec.icon || '';
    card.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'rec-card-body';

    const title = document.createElement('div');
    title.className = 'rec-card-title';
    title.textContent = rec.title;
    body.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'rec-card-desc';
    desc.textContent = rec.description;
    body.appendChild(desc);

    card.appendChild(body);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-primary';
    btn.textContent = rec.btnText;
    btn.addEventListener('click', () => {
      if (rec.actionType === 'screen') {
        setState('currentScreen', rec.actionTarget);
      } else if (rec.actionType === 'url') {
        window.open(rec.actionTarget, '_blank', 'noopener,noreferrer');
      }
    });
    card.appendChild(btn);

    container.appendChild(card);
  }
}

function setLoadingState(loading) {
  const container = document.getElementById('recommendations-container');
  if (container) container.style.opacity = loading ? '0.5' : '1';
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function initInsights() {
  const backBtn = document.getElementById('btn-back-insights');
  const fullAnalyticsLink = document.getElementById('link-full-analytics');
  const refreshBtn = document.getElementById('btn-refresh-recs');

  if (backBtn) {
    backBtn.addEventListener('click', () => setState('currentScreen', 'compose'));
  }

  if (fullAnalyticsLink) {
    fullAnalyticsLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.open('https://app.pushengage.com/analytics/overview?utm_source=extension&utm_medium=insights&utm_campaign=full-analytics', '_blank', 'noopener,noreferrer');
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '...';
      try {
        await loadAndRender(true);
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
      }
    });
  }

  await loadAndRender(false);
}

async function loadAndRender(forceRefresh) {
  setLoadingState(true);
  try {
    const { recommendations, ctx } = await getRecommendations(forceRefresh);
    if (ctx) renderHealthSnapshot(ctx);
    renderRecommendations(recommendations);
  } catch (err) {
    console.error('[insights] Failed to load insights:', err);
  } finally {
    setLoadingState(false);
  }
}
