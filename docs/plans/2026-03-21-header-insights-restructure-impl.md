# Header + Insights Page Restructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the redundant header stats ticker with a contextual motivational nudge, restructure the Insights page from 7 sections to 3 (health snapshot + JTBD+AI recommendations + footer), and merge AI Insights into the JTBD engine.

**Architecture:** The header gets a priority-waterfall nudge system that picks the single most impactful message. The Insights page becomes a compact health snapshot (3 cards) followed by up to 4 JTBD recommendation cards with AI-generated copy. All detailed analytics move to the PushEngage dashboard via a footer link. The JTBD engine lives in a new `modules/recommendations.js` module with a catalog of detection rules, tier gates, and scoring.

**Tech Stack:** Vanilla JS (ES modules), Chrome Extension APIs (`chrome.storage.local` for caching), existing PushEngage API + Gemini for AI copy generation.

**Security note:** All dynamic text rendering uses `textContent` or the existing `setText()` sanitizer — never `innerHTML`. Bold formatting in the header nudge is achieved with a separate `<strong>` element set via `textContent`.

---

## Task 1: Strip Header Stats Ticker (HTML + CSS)

**Files:**
- Modify: `popup.html:232-292` (CSS for `.stats-ticker`, `.stats-expanded`)
- Modify: `popup.html:1638-1674` (HTML for stats ticker + expanded panel)

**Step 1: Remove the stats ticker CSS**

In `popup.html`, delete the entire CSS block from line 232 to 292 (from `/* ── STATS TICKER */` through `.stats-expanded-value { ... }`).

**Step 2: Add the contextual nudge CSS**

In `popup.html`, in the same location where the stats ticker CSS was, add:

```css
    /* ── HEADER NUDGE ─────────────────────────────────── */
    .header-nudge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-xs);
      padding: 8px var(--space-lg);
      background: linear-gradient(135deg, var(--pe-blue-light) 0%, #F0F0FF 100%);
      border-bottom: 1px solid var(--pe-gray-200);
      font-size: var(--text-xs);
      color: var(--pe-gray-700);
      cursor: pointer;
      transition: all var(--transition-fast);
      border: none;
      width: 100%;
      text-align: center;
      line-height: 1.4;
    }
    .header-nudge:hover {
      background: linear-gradient(135deg, #DEE0FF 0%, #E8E8FF 100%);
    }
    .header-nudge:focus-visible {
      outline: 2px solid var(--pe-blue);
      outline-offset: -2px;
    }
    .header-nudge-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .header-nudge-text {
      font-weight: 500;
    }
    .header-nudge-text strong {
      font-weight: 700;
      color: var(--pe-blue);
    }
    .header-nudge-arrow {
      color: var(--pe-gray-400);
      font-size: 10px;
      flex-shrink: 0;
    }
```

**Step 3: Replace the stats ticker HTML**

In `popup.html`, replace lines 1638-1674 (the `<!-- ── Stats Ticker -->` comment through the closing `</div>` of `stats-expanded-panel`) with:

```html
    <!-- ── Header Nudge ─────────────────────────────── -->
    <button
      class="header-nudge"
      id="btn-header-nudge"
      type="button"
      aria-label="Account insight. Click for action."
    >
      <span class="header-nudge-icon" id="header-nudge-icon" aria-hidden="true"></span>
      <span class="header-nudge-text" id="header-nudge-text">
        <strong id="header-nudge-highlight"></strong>
        <span id="header-nudge-message"></span>
      </span>
      <span class="header-nudge-arrow" aria-hidden="true">&rsaquo;</span>
    </button>
```

**Step 4: Commit**

```bash
git add popup.html
git commit -m "feat: replace stats ticker with header nudge markup and styles"
```

---

## Task 2: Build Header Nudge Logic in header.js

**Files:**
- Modify: `modules/header.js` (replace stats ticker logic with nudge waterfall)

**Step 1: Update DOM refs in `resolveElements()`**

In `modules/header.js`, replace the stats ticker refs (lines 36-46):

```js
    // Stats ticker — performance metrics
    btnStatsTicker:    document.getElementById('btn-stats-ticker'),
    statsCampaignsSent: document.getElementById('stats-campaigns-sent'),
    statsTotalClicks:  document.getElementById('stats-total-clicks'),
    statsAvgCtr:       document.getElementById('stats-avg-ctr'),
    statsExpandedPanel: document.getElementById('stats-expanded-panel'),
    statsDetailCampaigns: document.getElementById('stats-detail-campaigns'),
    statsDetailClicks: document.getElementById('stats-detail-clicks'),
    statsDetailCtr:    document.getElementById('stats-detail-ctr'),
    statsRevenueItem:  document.getElementById('stats-revenue-item'),
    statsDetailRevenue: document.getElementById('stats-detail-revenue'),
    statsDetailPlan:   document.getElementById('stats-detail-plan'),
```

With:

```js
    // Header nudge
    btnHeaderNudge:      document.getElementById('btn-header-nudge'),
    headerNudgeIcon:     document.getElementById('header-nudge-icon'),
    headerNudgeHighlight: document.getElementById('header-nudge-highlight'),
    headerNudgeMessage:  document.getElementById('header-nudge-message'),
```

**Step 2: Add `setState` to imports**

At line 4, change:

```js
import { getState, setState, on } from './state.js';
```

(Already imports `setState` — verify. If not, add it.)

**Step 3: Remove old functions**

Delete `formatNumber()` (lines 189-194), `refreshStats()` (lines 196-261), and `setupStatsTicker()` (lines 264-278) entirely.

**Step 4: Add the nudge waterfall**

Replace those deleted functions with:

```js
// ── Header nudge — priority waterfall ────────────────────────

async function refreshHeaderNudge() {
  const siteId = getState('activeSiteId');
  if (!siteId || !els.headerNudgeMessage) return;

  const siteDetails = getState('siteDetails') || {};
  const planInfo = getState('planInfo') || {};
  const subscriberCount = siteDetails.subscriber_count || siteDetails.total_subscribers || 0;
  const segments = getState('segmentsList') || [];
  const showRevenue = hasGoalTrackingPermission();

  // Fetch recent campaigns
  let notifications = [];
  let totalRevenue = 0;
  let totalClicks = 0;
  let totalSent = 0;
  let lastCampaignDate = null;
  let lastCampaignCtr = 0;

  try {
    const result = await api.listNotifications(siteId, {
      limit: 10, status: 'sent', order_by_desc: 'sent_at'
    });
    const data = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);
    notifications = data;

    for (const n of notifications) {
      const sent = n.sent_count || n.total_sent || 0;
      const clicks = n.click_count || n.total_clicked || 0;
      totalSent += sent;
      totalClicks += clicks;
      if (showRevenue && n.revenue != null) totalRevenue += Number(n.revenue) || 0;
    }

    if (notifications.length > 0) {
      const lastDate = notifications[0].sent_at || notifications[0].created_at;
      if (lastDate) lastCampaignDate = new Date(lastDate);
      const lastSent = notifications[0].sent_count || notifications[0].total_sent || 0;
      const lastClicks = notifications[0].click_count || notifications[0].total_clicked || 0;
      if (lastSent > 0) lastCampaignCtr = (lastClicks / lastSent) * 100;
    }
  } catch (err) {
    console.warn('Failed to fetch data for header nudge:', err.message);
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
  } catch {}

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
      message: ' revenue from push this month \u2014 keep it going',
      action: () => window.open('https://app.pushengage.com/analytics', '_blank', 'noopener')
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
      action: () => window.open('https://app.pushengage.com/design/popup-modals', '_blank', 'noopener')
    };
  }

  // Render using textContent (safe — no innerHTML)
  setText(els.headerNudgeIcon, nudge.icon);
  setText(els.headerNudgeHighlight, nudge.highlight);
  setText(els.headerNudgeMessage, nudge.message);
  els.btnHeaderNudge.onclick = nudge.action;
}
```

**Step 5: Update initHeader**

In `initHeader()` (line 322-331):
- Remove the `setupStatsTicker()` call
- Replace `refreshStats()` with `refreshHeaderNudge()`

In `setupStateListeners()` (line 312-318):
- Replace `refreshStats()` with `refreshHeaderNudge()`

**Step 6: Commit**

```bash
git add modules/header.js
git commit -m "feat: implement header nudge priority waterfall, remove stats ticker logic"
```

---

## Task 3: Build the JTBD Recommendation Engine

**Files:**
- Create: `modules/recommendations.js`
- Modify: `modules/ai.js` (add `generateInsightsRaw` export)
- Modify: `modules/permissions.js` (export `isPaidPlan`)

**Step 1: Create the recommendation catalog and scoring engine**

Create `modules/recommendations.js`:

```js
// modules/recommendations.js
// JTBD Recommendation Engine — detects account state, scores recommendations,
// generates AI-powered copy for the top 4 most impactful actions.

import { getState } from './state.js';
import {
  canReadSegment, canWriteAbTest,
  canWriteScheduleNotification, hasGoalTrackingPermission
} from './permissions.js';
import * as api from './api.js';

// ── Recommendation Catalog ──────────────────────────────────────────────────
// Each entry: { id, category, detect(ctx), impact, fallback }

const CATALOG = [
  // ── Activation ──
  {
    id: 'setup_optin',
    category: 'activation',
    detect: (ctx) => ctx.subscriberCount === 0,
    impact: 98,
    fallback: {
      title: 'Unlimited growth potential \u2014 set up your opt-in',
      description: 'Configure your opt-in popup to start collecting subscribers. More subscribers means more campaign reach.',
      btnText: 'Set Up Opt-in',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/design/popup-modals'
    }
  },
  {
    id: 'send_first_campaign',
    category: 'activation',
    detect: (ctx) => ctx.campaignCount === 0 && ctx.subscriberCount > 0,
    impact: 95,
    fallback: {
      title: 'Your first campaign is 2 minutes away',
      description: 'Compose and send a push notification right now. Your dashboard will light up with engagement data.',
      btnText: 'Create Campaign',
      actionType: 'screen', actionTarget: 'compose'
    }
  },

  // ── Optimization ──
  {
    id: 'ab_test_low_ctr',
    category: 'optimization',
    detect: (ctx) => ctx.avgCtr > 0 && ctx.avgCtr < 3 && ctx.campaignCount >= 3 && canWriteAbTest(),
    impact: 80,
    fallback: {
      title: 'Your CTR could be higher \u2014 try A/B testing',
      description: 'Your click-through rate is below the 4% industry average. A/B test different titles to find what resonates.',
      btnText: 'Open A/B Testing',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/notification/ab-test'
    }
  },
  {
    id: 'reengage_inactive',
    category: 'optimization',
    detect: (ctx) => ctx.daysSinceLast !== null && ctx.daysSinceLast > 7 && ctx.subscriberCount > 0,
    impact: 75,
    fallback: {
      title: 'Re-engage your subscribers',
      description: 'Subscribers lose interest when you go quiet. Send a campaign today to maintain deliverability.',
      btnText: 'Create Campaign',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'dormant_segments',
    category: 'optimization',
    detect: (ctx) => ctx.dormantSegments.length > 0 && canReadSegment(),
    impact: 65,
    fallback: {
      title: 'Re-engage dormant segments',
      description: 'You have segments with subscribers that haven\'t been targeted recently. Send them a campaign.',
      btnText: 'Target Segment',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'increase_frequency',
    category: 'optimization',
    detect: (ctx) => ctx.campaignCount > 0 && ctx.campaignCount < 8 && ctx.daysSinceLast !== null && ctx.daysSinceLast <= 7,
    impact: 55,
    fallback: {
      title: 'Increase your sending frequency',
      description: 'Top-performing accounts send 8\u201312 campaigns per month. Consistency drives engagement.',
      btnText: 'Create Campaign',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'celebrate_high_ctr',
    category: 'optimization',
    detect: (ctx) => ctx.avgCtr >= 5 && ctx.campaignCount >= 3,
    impact: 50,
    fallback: {
      title: 'Your CTR is above average \u2014 scale up!',
      description: 'Capitalize on your strong engagement by increasing frequency or targeting new segments.',
      btnText: 'Create Campaign',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'schedule_peak_hours',
    category: 'optimization',
    detect: (ctx) => ctx.campaignCount >= 5 && canWriteScheduleNotification(),
    impact: 45,
    fallback: {
      title: 'Schedule campaigns for peak hours',
      description: 'Use subscriber timezone delivery to send at the optimal local time. Peak-hour campaigns see 20\u201340% more clicks.',
      btnText: 'Create Campaign',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'clean_empty_segments',
    category: 'optimization',
    detect: (ctx) => ctx.emptySegmentCount > 0 && canReadSegment(),
    impact: 40,
    fallback: {
      title: 'Clean up empty segments',
      description: 'You have segments with 0 subscribers. Review your segmentation rules or enable auto-subscribe.',
      btnText: 'Manage Segments',
      actionType: 'screen', actionTarget: 'segments'
    }
  },

  // ── Multichannel ──
  {
    id: 'add_chat_widget',
    category: 'multichannel',
    detect: (ctx) => !ctx.hasWidget,
    impact: 60,
    fallback: {
      title: 'Add a Chat Widget to your site',
      description: 'Capture visitors on WhatsApp, Messenger, Instagram, and 18 more channels \u2014 free to start.',
      btnText: 'Set Up Chat',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/chat'
    }
  },
  {
    id: 'setup_drip',
    category: 'multichannel',
    detect: (ctx) => !ctx.hasDrip && ctx.subscriberCount > 100,
    impact: 58,
    fallback: {
      title: 'Set up a welcome drip series',
      description: 'Automated welcome series increase retention by 30%. Guide new subscribers with a drip campaign.',
      btnText: 'Go to Dashboard',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/drip'
    }
  },

  // ── Upsell ──
  {
    id: 'upsell_segments',
    category: 'upsell',
    detect: (ctx) => !canReadSegment() && ctx.subscriberCount > 500,
    impact: 70,
    fallback: {
      title: 'Unlock segments to target the right audience',
      description: 'Segmented campaigns get 2x higher CTR. Upgrade to create targeted subscriber groups.',
      btnText: 'Upgrade Plan',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/billing'
    }
  },
  {
    id: 'upsell_ab_testing',
    category: 'upsell',
    detect: (ctx) => !canWriteAbTest() && ctx.campaignCount >= 5 && ctx.avgCtr < 4,
    impact: 65,
    fallback: {
      title: 'Unlock A/B testing to improve your CTR',
      description: 'Your CTR has room to grow. A/B testing lets you find the best-performing titles automatically.',
      btnText: 'Upgrade Plan',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/billing'
    }
  },
  {
    id: 'upsell_goal_tracking',
    category: 'upsell',
    detect: (ctx) => !hasGoalTrackingPermission() && ctx.campaignCount >= 3,
    impact: 55,
    fallback: {
      title: 'Track revenue from your push notifications',
      description: 'See exactly how much money your campaigns generate. Upgrade to Premium for Goal Tracking.',
      btnText: 'Upgrade Plan',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/billing'
    }
  },
];

// ── Account Context Builder ─────────────────────────────────────────────────

function extractNotifications(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (result.data && result.data.data && Array.isArray(result.data.data)) return result.data.data;
  if (result.data && Array.isArray(result.data)) return result.data;
  return [];
}

export async function buildAccountContext() {
  const siteId = getState('activeSiteId');
  if (!siteId) return null;

  const siteDetails = getState('siteDetails') || {};
  const planInfo = getState('planInfo') || {};
  const segments = getState('segmentsList') || [];
  const settings = siteDetails.settings || {};

  let notifications = [];
  try {
    const result = await api.listNotifications(siteId, {
      limit: 20, status: 'sent', order_by_desc: 'sent_at'
    });
    notifications = extractNotifications(result);
  } catch {}

  let totalClicks = 0, totalSent = 0, totalRevenue = 0;
  for (const n of notifications) {
    totalClicks += n.click_count || n.clickcount || n.clicks || 0;
    totalSent += n.sent_count || n.sentcount || n.sent || 0;
    if (n.revenue != null) totalRevenue += Number(n.revenue) || 0;
  }

  let daysSinceLast = null;
  if (notifications.length > 0) {
    const lastDate = notifications[0].sent_at || notifications[0].created_at;
    if (lastDate) daysSinceLast = Math.floor((Date.now() - new Date(lastDate).getTime()) / (24 * 60 * 60 * 1000));
  }

  // Find dormant segments (>500 subs, not targeted recently)
  const targetedIds = new Set();
  for (const n of notifications) {
    for (const s of (n.segments || n.segment_ids || [])) {
      targetedIds.add(String(s));
    }
  }
  const dormantSegments = segments.filter(s =>
    (s.subscribers || 0) > 500 && !targetedIds.has(String(s.segment_id || s.id || ''))
  );

  const emptySegments = segments.filter(s => (s.subscribers || 0) === 0);

  return {
    subscriberCount: siteDetails.subscriber_count || siteDetails.total_subscribers || 0,
    campaignCount: notifications.length,
    avgCtr: totalSent > 0 ? (totalClicks / totalSent) * 100 : 0,
    totalClicks,
    totalRevenue,
    daysSinceLast,
    segmentCount: segments.length,
    emptySegmentCount: emptySegments.length,
    dormantSegments,
    planName: planInfo.name || 'Free',
    hasWidget: !!(settings.chat_widget || settings.chatWidget),
    hasDrip: !!(settings.welcome_notification === 1 || settings.drip_enabled),
  };
}

// ── Scoring Engine ──────────────────────────────────────────────────────────

export function scoreRecommendations(ctx) {
  const scored = [];

  for (const rec of CATALOG) {
    try {
      if (rec.detect(ctx)) {
        scored.push({ ...rec, score: rec.impact });
      }
    } catch {
      // Skip broken detectors
    }
  }

  // Sort by score descending, take top 4
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 4);
}

// ── AI Copy Generation ──────────────────────────────────────────────────────

const RECS_CACHE_KEY = 'pe_jtbd_recommendations';
const RECS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function buildAiPrompt(recommendations, ctx) {
  const recList = recommendations.map((r, i) =>
    (i + 1) + '. ID: ' + r.id + ', Category: ' + r.category + ', Fallback title: "' + r.fallback.title + '"'
  ).join('\n');

  return 'You are a push notification marketing strategist for PushEngage. Generate personalized recommendation copy for a user.\n\n' +
    'Account Data:\n' +
    '- Plan: ' + ctx.planName + '\n' +
    '- Subscribers: ' + ctx.subscriberCount + '\n' +
    '- Campaigns sent (recent): ' + ctx.campaignCount + '\n' +
    '- Average CTR: ' + ctx.avgCtr.toFixed(1) + '%\n' +
    '- Total clicks: ' + ctx.totalClicks + '\n' +
    '- Revenue: $' + ctx.totalRevenue.toFixed(0) + '\n' +
    '- Days since last campaign: ' + (ctx.daysSinceLast !== null ? ctx.daysSinceLast : 'Never sent') + '\n' +
    '- Segments: ' + ctx.segmentCount + ' (' + ctx.emptySegmentCount + ' empty)\n\n' +
    'Recommendations to personalize (in priority order):\n' + recList + '\n\n' +
    'Rules:\n' +
    '- Generate a title (under 50 chars) and description (under 120 chars) for EACH recommendation\n' +
    '- Use the account\'s actual numbers in the copy (e.g. "Your 2.1% CTR is below average" not "Your CTR is below average")\n' +
    '- Be encouraging, not pushy \u2014 frame as opportunity\n' +
    '- For zero states, frame as exciting potential, not empty metrics\n' +
    '- Keep the same order as provided\n\n' +
    'Return JSON array: [{"id":"...","title":"...","description":"..."}]';
}

export async function generateRecommendationCopy(recommendations, ctx, forceRefresh) {
  const siteId = getState('activeSiteId');
  const cacheKeyIds = recommendations.map(r => r.id).sort().join(',');

  // Check cache
  if (!forceRefresh) {
    try {
      const stored = await chrome.storage.local.get(RECS_CACHE_KEY);
      const cached = stored[RECS_CACHE_KEY];
      if (cached &&
          cached.siteId === siteId &&
          cached.recIds === cacheKeyIds &&
          (Date.now() - cached.generatedAt) < RECS_CACHE_TTL) {
        return cached.copy;
      }
    } catch {}
  }

  // Generate via AI
  try {
    const { generateInsightsRaw } = await import('./ai.js');
    const prompt = buildAiPrompt(recommendations, ctx);
    const result = await generateInsightsRaw(prompt);

    if (Array.isArray(result) && result.length > 0) {
      // Cache
      try {
        await chrome.storage.local.set({
          [RECS_CACHE_KEY]: {
            siteId,
            recIds: cacheKeyIds,
            generatedAt: Date.now(),
            copy: result
          }
        });
      } catch {}
      return result;
    }
  } catch (err) {
    console.warn('[recommendations] AI copy generation failed:', err.message);
  }

  // Fallback: return null (caller uses fallback text)
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getRecommendations(forceRefresh) {
  const ctx = await buildAccountContext();
  if (!ctx) return { recommendations: [], ctx: null };

  const scored = scoreRecommendations(ctx);
  const aiCopy = await generateRecommendationCopy(scored, ctx, forceRefresh);

  // Merge AI copy into recommendations
  const recommendations = scored.map(rec => {
    const ai = aiCopy ? aiCopy.find(c => c.id === rec.id) : null;
    return {
      ...rec,
      title: (ai && ai.title) || rec.fallback.title,
      description: (ai && ai.description) || rec.fallback.description,
      btnText: rec.fallback.btnText,
      actionType: rec.fallback.actionType,
      actionTarget: rec.fallback.actionTarget,
      aiGenerated: !!ai
    };
  });

  return { recommendations, ctx };
}
```

**Step 2: Export `generateInsightsRaw` from ai.js**

In `modules/ai.js`, after the existing `generateInsights` function (around line 404), add:

```js
// Raw Gemini call for custom prompts (used by recommendations engine)
export async function generateInsightsRaw(prompt) {
  return callGemini(prompt);
}
```

**Step 3: Export `isPaidPlan` from permissions.js**

In `modules/permissions.js`, line 25, change:

```js
function isPaidPlan() {
```

To:

```js
export function isPaidPlan() {
```

**Step 4: Commit**

```bash
git add modules/recommendations.js modules/ai.js modules/permissions.js
git commit -m "feat: add JTBD recommendation engine with catalog, scoring, and AI copy generation"
```

---

## Task 4: Strip Old Insights Page HTML + Add New Layout

**Files:**
- Modify: `popup.html:1151-1230` (CSS for insight sections, KPI grid, nudge cards)
- Modify: `popup.html:2054-2233` (HTML for insights screen)

**Step 1: Replace insights section CSS**

In `popup.html`, replace the CSS from `.insight-section` through the end of the nudge/insight card styles (lines 1151 through approximately 1230) with:

```css
    .insight-section {
      padding: var(--space-md) var(--space-lg);
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }
    .insight-section + .insight-section {
      border-top: 1px solid var(--pe-gray-100);
    }
    .insight-section-title {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--pe-gray-600);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ── Health Snapshot ────────────────────────────────── */
    .health-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: var(--space-sm);
    }
    .health-card {
      padding: var(--space-md) var(--space-sm);
      background: var(--pe-gray-50);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      transition: all var(--transition-fast);
      border: 1px solid var(--pe-gray-100);
      text-align: center;
    }
    .health-card:hover {
      border-color: var(--pe-blue);
      background: var(--pe-blue-light);
    }
    .health-card-value {
      font-size: var(--text-lg);
      font-weight: 700;
      color: var(--pe-navy);
    }
    .health-card-label {
      font-size: 10px;
      color: var(--pe-gray-500);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      font-weight: 500;
    }
    .health-card--opportunity .health-card-value {
      font-size: var(--text-sm);
      color: var(--pe-blue);
      font-weight: 600;
    }
    .health-card--opportunity .health-card-label {
      color: var(--pe-gray-400);
    }

    /* ── Recommendation Cards ──────────────────────────── */
    .rec-card {
      padding: var(--space-md);
      background: var(--pe-white);
      border-radius: var(--radius-lg);
      border: 1px solid var(--pe-gray-200);
      border-left-width: 3px;
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }
    .rec-card--high { border-left-color: var(--pe-blue); }
    .rec-card--medium { border-left-color: var(--pe-gold); }
    .rec-card--low { border-left-color: var(--pe-gray-300); }
    .rec-card-title {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--pe-navy);
    }
    .rec-card-desc {
      font-size: var(--text-xs);
      color: var(--pe-gray-600);
      line-height: 1.5;
    }
    .rec-card .btn {
      align-self: flex-start;
      margin-top: var(--space-xs);
    }
```

**Step 2: Replace insights HTML**

In `popup.html`, replace the entire insights screen (lines 2054-2233, from `<section id="screen-insights"` through `</section>`) with:

```html
  <section id="screen-insights" class="screen hidden" aria-label="Insights">
    <div class="screen-header">
      <button class="btn-back" type="button" id="btn-back-insights" aria-label="Back to compose">
        <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <h2 class="screen-header-title">Insights</h2>
    </div>

    <div class="screen-scroll">

      <!-- Section A: Account Health Snapshot -->
      <div class="insight-section">
        <h3 class="insight-section-title">Your Account</h3>
        <div class="health-grid" id="health-grid">
          <div class="health-card" id="health-card-subs" role="button" tabindex="0">
            <span class="health-card-value" id="health-val-subs">--</span>
            <span class="health-card-label" id="health-lbl-subs">Subscribers</span>
          </div>
          <div class="health-card" id="health-card-metric" role="button" tabindex="0">
            <span class="health-card-value" id="health-val-metric">--</span>
            <span class="health-card-label" id="health-lbl-metric">--</span>
          </div>
          <div class="health-card" id="health-card-campaigns" role="button" tabindex="0">
            <span class="health-card-value" id="health-val-campaigns">--</span>
            <span class="health-card-label" id="health-lbl-campaigns">Campaigns</span>
          </div>
        </div>
      </div>

      <!-- Section B: JTBD Recommendations -->
      <div class="insight-section">
        <div class="insight-section-title" style="display:flex;align-items:center;justify-content:space-between;">
          Recommended For You
          <button type="button" class="btn-ai-sm" id="btn-refresh-recs" title="Refresh recommendations">Refresh</button>
        </div>
        <div id="recommendations-container">
          <div class="rec-card" style="text-align:center;color:var(--pe-gray-400);padding:20px;">
            Analyzing your account...
          </div>
        </div>
      </div>

      <!-- Section C: Footer -->
      <div class="insight-section text-center">
        <a
          class="btn-link"
          id="link-full-analytics"
          href="https://app.pushengage.com/analytics"
          target="_blank"
          rel="noopener noreferrer"
        >View Full Analytics &rarr;</a>
      </div>

    </div>
  </section>
```

**Step 3: Commit**

```bash
git add popup.html
git commit -m "feat: replace insights page HTML/CSS with health snapshot + recommendation cards layout"
```

---

## Task 5: Rewrite insights.js

**Files:**
- Modify: `modules/insights.js` (complete rewrite)

**Step 1: Replace entire file contents**

Replace the entire contents of `modules/insights.js` with:

```js
// modules/insights.js
// Insights screen: Account Health Snapshot + JTBD Recommendations (AI-powered)

import { getState, setState } from './state.js';
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
    subsCard.onclick = () => window.open('https://app.pushengage.com/subscribers', '_blank', 'noopener');
  } else {
    setText(subsVal, 'Unlimited growth potential');
    setText(subsLbl, 'Set up your opt-in');
    subsCard.classList.add('health-card--opportunity');
    subsCard.onclick = () => window.open('https://app.pushengage.com/design/popup-modals', '_blank', 'noopener');
  }

  // Slot 2: Revenue > CTR > Opportunity
  if (hasGoalTrackingPermission() && ctx.totalRevenue > 0) {
    setText(metricVal, '$' + ctx.totalRevenue.toFixed(0));
    setText(metricLbl, 'Revenue (30d)');
    metricCard.classList.remove('health-card--opportunity');
    metricCard.onclick = () => window.open('https://app.pushengage.com/analytics', '_blank', 'noopener');
  } else if (ctx.campaignCount > 0 && ctx.avgCtr > 0) {
    setText(metricVal, fmtPct(ctx.avgCtr));
    setText(metricLbl, 'Avg CTR');
    metricCard.classList.remove('health-card--opportunity');
    metricCard.onclick = () => setState('currentScreen', 'compose');
  } else if (!hasGoalTrackingPermission() && ctx.campaignCount >= 3) {
    setText(metricVal, 'Turn notifications into revenue');
    setText(metricLbl, 'Goal Tracking');
    metricCard.classList.add('health-card--opportunity');
    metricCard.onclick = () => window.open('https://app.pushengage.com/billing', '_blank', 'noopener');
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
    campCard.onclick = () => window.open('https://app.pushengage.com/analytics', '_blank', 'noopener');
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

    const title = document.createElement('div');
    title.className = 'rec-card-title';
    title.textContent = rec.title;
    card.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'rec-card-desc';
    desc.textContent = rec.description;
    card.appendChild(desc);

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
      window.open('https://app.pushengage.com/analytics', '_blank', 'noopener,noreferrer');
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
```

**Step 2: Commit**

```bash
git add modules/insights.js
git commit -m "feat: rewrite insights.js with health snapshot and JTBD recommendation rendering"
```

---

## Task 6: Smoke Test and Edge Cases

**Step 1: Manual testing checklist**

Load the extension in Chrome (`chrome://extensions` > Load unpacked) and verify:

- [ ] Header shows contextual nudge message instead of stats ticker
- [ ] Clicking the nudge navigates to the correct action
- [ ] Insights page shows 3 health snapshot cards
- [ ] Zero-state cards show opportunity text (not "0" or "--")
- [ ] Recommendation cards render (up to 4)
- [ ] Refresh button regenerates recommendations
- [ ] "View Full Analytics" link works
- [ ] Back button returns to compose screen
- [ ] Site switching updates both header nudge and insights
- [ ] No console errors on any screen

**Step 2: Test with different account states**

- Fresh account (0 subs, 0 campaigns): all opportunity cards + activation recommendations
- Active account: real numbers in snapshot + optimization/multichannel recommendations
- Paid account with goal tracking: revenue in header nudge + health snapshot

**Step 3: Fix any issues found, then commit**

```bash
git add -A
git commit -m "chore: smoke test fixes for header nudge and insights restructure"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Strip stats ticker HTML/CSS, add nudge markup | `popup.html` |
| 2 | Header nudge waterfall logic | `modules/header.js` |
| 3 | JTBD recommendation engine | `modules/recommendations.js`, `modules/ai.js`, `modules/permissions.js` |
| 4 | New insights page HTML/CSS | `popup.html` |
| 5 | Rewrite insights.js | `modules/insights.js` |
| 6 | Smoke test + edge case fixes | All files |
