// modules/recommendations.js
// JTBD Recommendation Engine — detects account state, scores recommendations,
// generates AI-powered copy for the top 4 most impactful actions.

import { getState } from './state.js';
import {
  canReadSegment, canWriteAbTest,
  canWriteScheduleNotification, hasGoalTrackingPermission
} from './permissions.js';
import * as api from './api.js';

// ── Category Icons ──────────────────────────────────────────────────────────
const CATEGORY_ICON = {
  activation:   '\u{1F680}', // rocket
  optimization: '\u{1F3AF}', // target
  multichannel: '\u{1F4AC}', // speech bubble
  upsell:       '\u{2B06}\uFE0F',  // up arrow
};

// ── Recommendation Catalog ──────────────────────────────────────────────────
// Each entry: { id, category, detect(ctx) → boolean, impact, fallback }

const CATALOG = [
  // ── Activation ──
  {
    id: 'setup_optin',
    category: 'activation',
    detect: (ctx) => ctx.subscriberCount === 0,
    impact: 98,
    fallback: {
      title: 'Set up your opt-in',
      description: 'Start collecting subscribers with a popup.',
      btnText: 'Set Up',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/design/subscription-dialogbox?utm_source=extension&utm_medium=recommendation&utm_campaign=setup-optin'
    }
  },
  {
    id: 'send_first_campaign',
    category: 'activation',
    detect: (ctx) => ctx.campaignCount === 0 && ctx.subscriberCount > 0,
    impact: 95,
    fallback: {
      title: 'Send your first campaign',
      description: 'Your subscribers are waiting. Takes 2 minutes.',
      btnText: 'Create',
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
      title: 'Improve CTR with A/B testing',
      description: 'Below 4% average. Test titles to find what works.',
      btnText: 'A/B Test',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/campaigns/notifications?utm_source=extension&utm_medium=recommendation&utm_campaign=ab-test-ctr'
    }
  },
  {
    id: 'reengage_inactive',
    category: 'optimization',
    detect: (ctx) => ctx.daysSinceLast !== null && ctx.daysSinceLast > 7 && ctx.subscriberCount > 0,
    impact: 75,
    fallback: {
      title: 'Re-engage your subscribers',
      description: 'Been quiet for a while. Send a campaign today.',
      btnText: 'Create',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'dormant_segments',
    category: 'optimization',
    detect: (ctx) => ctx.dormantSegments.length > 0 && canReadSegment(),
    impact: 65,
    fallback: {
      title: 'Target dormant segments',
      description: 'Some segments haven\'t been reached recently.',
      btnText: 'Target',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'increase_frequency',
    category: 'optimization',
    detect: (ctx) => ctx.campaignCount > 0 && ctx.campaignCount < 8 && ctx.daysSinceLast !== null && ctx.daysSinceLast <= 7,
    impact: 55,
    fallback: {
      title: 'Send more frequently',
      description: 'Top accounts send 8\u201312 campaigns/month.',
      btnText: 'Create',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'celebrate_high_ctr',
    category: 'optimization',
    detect: (ctx) => ctx.avgCtr >= 5 && ctx.campaignCount >= 3,
    impact: 50,
    fallback: {
      title: 'Great CTR \u2014 scale up!',
      description: 'Strong engagement. Increase frequency or target new segments.',
      btnText: 'Create',
      actionType: 'screen', actionTarget: 'compose'
    }
  },
  {
    id: 'schedule_peak_hours',
    category: 'optimization',
    detect: (ctx) => ctx.campaignCount >= 5 && canWriteScheduleNotification(),
    impact: 45,
    fallback: {
      title: 'Schedule for peak hours',
      description: 'Timezone delivery gets 20\u201340% more clicks.',
      btnText: 'Create',
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
      description: 'Some segments have 0 subscribers.',
      btnText: 'Manage',
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
      title: 'Add a Chat Widget',
      description: 'WhatsApp, Messenger, Instagram + 18 more channels.',
      btnText: 'Set Up',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/chat-widgets/list?utm_source=extension&utm_medium=recommendation&utm_campaign=add-chat-widget'
    }
  },
  {
    id: 'setup_drip',
    category: 'multichannel',
    detect: (ctx) => !ctx.hasDrip && ctx.subscriberCount > 100,
    impact: 58,
    fallback: {
      title: 'Set up a welcome drip',
      description: 'Automated series increase retention by 30%.',
      btnText: 'Set Up',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/campaigns/drip?utm_source=extension&utm_medium=recommendation&utm_campaign=setup-drip'
    }
  },

  // ── Upsell ──
  {
    id: 'upsell_segments',
    category: 'upsell',
    detect: (ctx) => !canReadSegment() && ctx.subscriberCount > 500,
    impact: 70,
    fallback: {
      title: 'Unlock segments',
      description: 'Targeted campaigns get 2x higher CTR.',
      btnText: 'Upgrade',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/account/billing?utm_source=extension&utm_medium=upsell&utm_campaign=unlock-segments'
    }
  },
  {
    id: 'upsell_ab_testing',
    category: 'upsell',
    detect: (ctx) => !canWriteAbTest() && ctx.campaignCount >= 5 && ctx.avgCtr < 4,
    impact: 65,
    fallback: {
      title: 'Unlock A/B testing',
      description: 'Find the best-performing titles automatically.',
      btnText: 'Upgrade',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/account/billing?utm_source=extension&utm_medium=upsell&utm_campaign=unlock-ab-testing'
    }
  },
  {
    id: 'upsell_goal_tracking',
    category: 'upsell',
    detect: (ctx) => !hasGoalTrackingPermission() && ctx.campaignCount >= 3,
    impact: 55,
    fallback: {
      title: 'Track campaign revenue',
      description: 'See how much money your notifications generate.',
      btnText: 'Upgrade',
      actionType: 'url', actionTarget: 'https://app.pushengage.com/account/billing?utm_source=extension&utm_medium=upsell&utm_campaign=unlock-goal-tracking'
    }
  },
];

// ── Account Context Builder ─────────────────────────────────────────────────

export async function buildAccountContext() {
  const siteId = getState('activeSiteId');
  if (!siteId) return null;

  const siteDetails = getState('siteDetails') || {};
  const planInfo = getState('planInfo') || {};
  const segments = getState('segmentsList') || [];
  const settings = siteDetails.settings || {};

  // Read from shared state (fetched in selectSite, deduplicates API calls)
  const notifications = getState('recentNotifications') || [];

  let totalClicks = 0, totalSent = 0, totalRevenue = 0;
  for (const n of notifications) {
    // Backend field names: sentcount, clickcount (no underscores)
    totalClicks += n.clickcount || n.click_count || n.clicks || 0;
    totalSent += n.sentcount || n.sent_count || n.sent || 0;
    const rev = n.revenue || n.notification_analytics?.revenue || 0;
    totalRevenue += Number(rev) || 0;
  }

  let daysSinceLast = null;
  if (notifications.length > 0) {
    const lastDate = notifications[0].sent_at || notifications[0].created_at;
    if (lastDate) daysSinceLast = Math.floor((Date.now() - new Date(lastDate).getTime()) / (24 * 60 * 60 * 1000));
  }

  // Find dormant segments (>500 subs, not targeted in recent notifications)
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
    subscriberCount: getState('subscriberCount') || siteDetails.subscriber_count || siteDetails.subscribers_count || 0,
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
        scored.push({ ...rec, score: rec.impact, icon: CATEGORY_ICON[rec.category] || '' });
      }
    } catch {
      // Skip broken detectors
    }
  }

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
    '- Generate a title (under 35 chars) and description (under 60 chars) for EACH recommendation\n' +
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
