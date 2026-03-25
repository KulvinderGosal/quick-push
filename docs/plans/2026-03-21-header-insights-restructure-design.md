# Header + Insights Page Restructure — Design Doc

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Header contextual nudge, Insights page restructure, JTBD+AI recommendation engine merge

---

## Problem

1. **Header metrics are redundant** — the stats ticker (Campaigns, Clicks, CTR) duplicates the Insights KPIs. Static numbers don't motivate action.
2. **Insights page is bloated** — 7 sections of data with two overlapping recommendation systems (Quick Wins + AI Insights).
3. **AI Insights feel obsolete** — they overlap with Quick Wins; both try to be "here's what to do next."
4. **Zero states are deflating** — showing `0` for metrics discourages new users instead of guiding them.

## Design Principles

- **Every zero is a door, not a wall** — empty states become opportunities and value propositions
- **Data serves recommendations** — show enough context to understand your situation, then tell you what to do about it
- **Single contextual message > static numbers** — the header motivates action, not passive observation
- **AI generates copy, JTBD engine decides what to recommend** — separation of concerns

---

## 1. Header — Contextual Motivational Nudge

Replaces the current 3-stat ticker (`Campaigns: X | Clicks: X | CTR: X%`) and its expanded panel with a **single priority-based message**.

### Priority Waterfall

The engine evaluates conditions top-to-bottom and shows the **first match**:

| Priority | Condition | Example Message | Tap Action |
|----------|-----------|-----------------|------------|
| 1 (highest) | Goal tracking enabled + revenue > 0 in period | `"$1,240 revenue from push this month — keep it going"` | Open dashboard analytics |
| 2 | New subscribers in last 7d > 0 | `"+520 new subscribers this week — send a campaign to engage them"` | Go to compose |
| 3 | Last campaign CTR > 4% | `"Last campaign hit 4.2% CTR — your audience is engaged"` | Go to compose |
| 4 | Has subscribers + no campaign in 7+ days | `"8.5K subscribers waiting — it's been 7 days since your last campaign"` | Go to compose |
| 5 | Has subscribers + sent recently + normal CTR | `"12.5K subscribers across 3 segments — try targeting one"` | Go to compose with segment picker |
| 6 (lowest) | 0 subscribers | `"Optimize your opt-in popup to start collecting subscribers"` | Open dashboard opt-in settings |

### Implementation Notes

- Single line in `header-center`, replaces `btn-stats-ticker` and `stats-expanded-panel`
- Tappable — navigates to the relevant action
- Refreshes on site change and after campaign send
- Uses data already fetched by `refreshStats()` (last 10 notifications) + subscriber count from site details + optin analytics

### Removed

- `stats-ticker` bar (3 static numbers)
- `stats-expanded-panel` (detailed breakdown)
- All associated DOM elements and CSS

---

## 2. Insights Page — Restructured to 3 Sections

Replaces the current 7-section vertical scroll with a focused, action-oriented layout.

### Section A: Account Health Snapshot

A compact row of 2-3 key numbers at the top. Provides "where do I stand" context before recommendations.

#### Slot Logic

| Slot | Has Data | Zero State (Opportunity Framing) | Tap Action |
|------|----------|----------------------------------|------------|
| 1: Subscribers | `"12.5K Subscribers"` | `"Unlimited growth potential — set up your opt-in"` | Dashboard opt-in settings |
| 2: Revenue or CTR | `"$1,240 revenue"` (if goal tracking) or `"4.2% Avg CTR"` (if campaigns) | `"Turn every notification into revenue with Goal Tracking"` or `"Your first campaign will set your CTR benchmark"` | Dashboard goal tracking or compose |
| 3: Campaign Activity | `"8 campaigns this month"` | `"Your first campaign is 2 minutes away"` | Go to compose |

#### Slot 2 Priority

1. Revenue (if goal tracking enabled and revenue > 0)
2. Avg CTR (if campaigns exist)
3. New subscribers this period (if subs but no campaigns)
4. Opportunity message (if nothing)

#### Design

- Clean, compact cards — number + label, no change indicators
- Zero-state cards are styled as opportunities (inviting, not empty)
- Each card is tappable, navigates to the action that fills the zero

### Section B: JTBD Recommendations (AI-Powered)

The heart of the page. Merged JTBD detection engine + AI-generated copy. Shows **up to 4 cards** ranked by priority score.

#### How It Works

1. **Detection engine** evaluates account state:
   - Plan tier (Free / Business / Premium / Growth)
   - Feature usage (segments, drips, chat widget, A/B tests, automations)
   - Performance metrics (CTR, revenue, subscriber growth, campaign frequency)
   - Activity recency (last campaign date, last login)

2. **Scoring** — each potential recommendation has:
   - `detect(accountState) → boolean` — is this relevant?
   - `tier` — which plans can act on this?
   - `category` — activation | optimization | multichannel | upsell
   - `impact` — priority score (higher = shown first)

3. **AI generates the copy** — instead of static template strings, the AI receives:
   - The recommendation type and category
   - The user's actual data points (subscriber count, CTR, revenue, plan, etc.)
   - Outputs: personalized title + description

4. **Rendering** — top 4 scored recommendations become cards with:
   - Priority color border (blue = high, gold = medium, gray = low)
   - AI-generated title + description
   - Action button (compose, segments, dashboard link, upgrade link)

#### Recommendation Catalog (from prior session)

Categories with example wins:

**Activation:**
- Send first campaign
- Set up opt-in popup
- Install on more pages

**Optimization:**
- A/B test low CTR (< 3%)
- Clean up empty segments
- Increase sending frequency
- Schedule at peak hours
- Re-engage dormant segments

**Multichannel:**
- Add basic Chat Widget (free)
- Add more channels to Chat Widget (Business+)
- Set up Chat Widget triggers (Premium+)
- Add chat agents + business hours (Business+)
- Enable Mobile App Push

**Upsell:**
- Upgrade to unlock segments
- Upgrade to unlock A/B testing
- Upgrade for multi-channel chat
- Upgrade for chat triggers

#### AI Integration

- AI call uses existing `generateInsights()` pattern but with structured input (recommendation type + account data)
- Results cached (7-day TTL per site, same as current AI Insights)
- Fallback: if AI call fails, use static template strings (graceful degradation)
- Refresh button available for manual re-generation

#### Fresh Account Experience

For a brand new account (0 subscribers, 0 campaigns), the entire page becomes an onboarding path:
1. **Snapshot:** Three opportunity cards instead of three zeros
2. **JTBD:** "Set up your opt-in popup" → "Send your first campaign" → "Add a Chat Widget" → "Explore segments"

### Section C: Footer

Single `"View Full Analytics →"` link to PushEngage dashboard (`https://app.pushengage.com/analytics`).

Detailed breakdowns (top campaigns, top countries, top segments, subscriber health) all live in the full dashboard — no longer duplicated in the extension.

---

## What Gets Removed

### From Header
- `btn-stats-ticker` — 3-stat ticker bar
- `stats-expanded-panel` — expanded detail panel
- All `stats-detail-*` elements
- `setupStatsTicker()` function
- Related CSS (`.stats-ticker`, `.stats-expanded`, etc.)

### From Insights Page
- **KPI cards** (4 cards: campaigns, clicks, CTR, new subs) → replaced by health snapshot
- **Top Campaign section** → dashboard
- **Top Segments section** → dashboard
- **Top Countries section** → dashboard
- **Subscriber Health section** → dashboard
- **Recommended Actions / Quick Wins** (4 nudge cards) → replaced by JTBD engine
- **AI Insights section** → merged into JTBD engine

### From insights.js
- `renderDynamicKPIs()` — replaced by health snapshot renderer
- `renderTopCampaign()` — removed (dashboard)
- `renderTopSegments()` — removed (dashboard)
- `renderTopCountries()` — removed (dashboard)
- `renderSubscriberHealth()` — removed (dashboard)
- `renderNudges()` — replaced by JTBD engine
- `renderQuickWins()` — replaced by JTBD engine
- `renderAiInsights()` — merged into JTBD engine
- `loadAiInsights()` — merged into JTBD recommendation flow
- Helper functions for removed sections (`extractGeoData`, `findDormantSegments`, `findHighPerformerSegment`, `renderBestSendTimeNudge`, `createListItem`, etc.)

---

## Data Requirements

### Existing APIs (no new endpoints needed)
- `getSiteDetails(siteId)` — subscriber count, settings, plan info
- `listNotifications(siteId)` — campaign history, CTR, clicks, revenue
- `getOptinAnalytics(siteId)` — new subscribers, unsubscriptions
- `getNotificationResultSummary(siteId)` — aggregate performance
- `generateText(siteId)` — AI text generation (repurposed for recommendation copy)
- `getAiCredits(ownerId)` — check AI credit availability

### State Dependencies
- `planInfo` — plan name, tier, subscriber limit
- `siteDetails` — subscriber count, settings (welcome notification, chat widget, etc.)
- `segmentsList` — segment count, subscriber counts per segment
- `activeSiteId` — current site

### New State Needed
- Feature usage flags (derived from site details/settings): `hasWidget`, `hasDrip`, `hasAbTest`, `hasMobileApp`, etc.
- These can be computed from existing `siteDetails.settings` — no new API calls

---

## Caching Strategy

- **Header nudge:** Computed on every site change + after campaign send (lightweight, no API call beyond what's already fetched)
- **Health snapshot:** Same data as header, rendered on Insights page load
- **JTBD recommendations:** AI-generated copy cached 7 days per site (same TTL as current AI Insights). Detection logic runs fresh each time, but if the same recommendations are selected, cached copy is reused.
