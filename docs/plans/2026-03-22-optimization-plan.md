# PushEngage Extension v2 — Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize the extension for correct dashboard URLs, reduced AI costs, and faster boot performance — without breaking any existing functionality.

**Architecture:** Surgical, sequential changes ordered from zero-risk (string replacements) to medium-risk (cross-module data flow). Each task is independently testable and reversible.

**Tech Stack:** Vanilla JS ES modules, Chrome Extension Manifest V3, Gemini 2.5 Flash API, PushEngage Dashboard API

**Verification Sources (NON-NEGOTIABLE — verify EVERY change against these):**

| Repo | Path | Purpose |
|---|---|---|
| **Frontend (Dashboard)** | `/Users/rakesh/Desktop/Rakesh's Claude/AI Onboarding/PushEngage/pushengage-app-master/` | Routes, UI components, sidebar navigation |
| **Backend (Adonis API)** | `/Users/rakesh/Desktop/Rakesh's Claude/AI Onboarding/PushEngage/pushengage-adonis-node-api-master/` | API validators, controllers, transformers, models |
| **Backend (Node services)** | `/Users/rakesh/Desktop/Rakesh's Claude/AI Onboarding/PushEngage/pushengage-node-master/` | Push delivery, notification processing |
| **Backend (PHP API)** | `/Users/rakesh/Desktop/Rakesh's Claude/AI Onboarding/PushEngage/pushengage-php-api-master/` | Legacy API endpoints |
| **Backend (SKB)** | `/Users/rakesh/Desktop/Rakesh's Claude/AI Onboarding/PushEngage/pushengage-skb-master/` | Subscriber/segment services |
| **Web SDK** | `/Users/rakesh/Desktop/Rakesh's Claude/AI Onboarding/PushEngage/pushengage-web-sdk-master/` | Client-side SDK |

**Key verification files:**
- **Frontend routes:** `pushengage-app-master/src/routes/routes.ts`
- **API validators:** `pushengage-adonis-node-api-master/app/Validators/Dashboard/Schema/Notification/index.js`
- **Notification transformer:** `pushengage-adonis-node-api-master/app/Transformers/Dashboard/Notification.js`
- **Notification model columns:** `pushengage-adonis-node-api-master/storage/Models/Notification/Notification.js`
- **Site settings service:** `pushengage-adonis-node-api-master/app/Services/Dashboard/Site/index.js`
- **UTM validators:** `pushengage-adonis-node-api-master/app/Validators/Helper.js`
- **Text limits:** `pushengage-adonis-node-api-master/storage/Limit/Text.js`

**Before implementing ANY task, verify the change against the relevant repo file.**

---

## Risk Assessment Matrix

| Task | Risk | Blast Radius | Rollback | Verification Repo |
|---|---|---|---|---|
| 1: Fix dashboard URLs | Zero | UI links only | Revert strings | `routes.ts` |
| 2: Reduce maxOutputTokens | Very Low | AI output length | Change 1 number | N/A (Gemini config) |
| 3: Trim CTA prompt | Low | CTA quality | Restore prompt text | N/A (prompt engineering) |
| 4: Add AI caching | Low | AI call frequency | Remove cache logic | N/A (client-side only) |
| 5: Parallelize selectSite | Medium | Boot sequence | Revert to sequential | Backend API validators |
| 6: Deduplicate API calls | Medium-High | Header + recommendations data | Restore separate fetches | Notification transformer |
| 7: Remove redundant auth step | Low | Startup flow | Revert popup.js | N/A |
| 8: Optimize draft cleanup | Low | Draft storage | Revert compose.js | N/A |
| 9: Flag Gemini key in docs | Zero | Docs only | N/A | N/A |

---

### Task 1: Fix ALL Broken Dashboard URLs

**Files:**
- Modify: `modules/insights.js` (5 URL fixes)
- Modify: `modules/header.js` (1 URL fix)
- Modify: `modules/recommendations.js` (6 URL fixes)
- Modify: `modules/accordion.js` (1 URL fix)
- Modify: `popup.html` (1 URL fix)

**Verification:** Read `pushengage-app-master/src/routes/routes.ts` and confirm each corrected URL matches an actual route definition.

**NOTE:** Line numbers are approximate anchors. Use the BEFORE code content as the match target, not the line number.

**Step 1: Fix insights.js URLs**

| Current (WRONG) | Correct | Route in routes.ts |
|---|---|---|
| `/subscribers` | `/audience/subscribers` | `audience.subscribers` |
| `/analytics` (3 occurrences) | `/analytics/overview` | `analytics.overview` |
| `/billing` | `/account/billing` | `account.billing` |

Note: `/design/subscription-dialogbox` at line ~47 is already correct — do NOT change it.

```javascript
// FIX 1: subscribers
// BEFORE:
subsCard.onclick = () => window.open('https://app.pushengage.com/subscribers', '_blank', 'noopener');
// AFTER:
subsCard.onclick = () => window.open('https://app.pushengage.com/audience/subscribers', '_blank', 'noopener');

// FIX 2: analytics (revenue metric card)
// BEFORE:
metricCard.onclick = () => window.open('https://app.pushengage.com/analytics', '_blank', 'noopener');
// AFTER:
metricCard.onclick = () => window.open('https://app.pushengage.com/analytics/overview', '_blank', 'noopener');

// FIX 3: billing
// BEFORE:
metricCard.onclick = () => window.open('https://app.pushengage.com/billing', '_blank', 'noopener');
// AFTER:
metricCard.onclick = () => window.open('https://app.pushengage.com/account/billing', '_blank', 'noopener');

// FIX 4: analytics (campaigns card)
// BEFORE:
campCard.onclick = () => window.open('https://app.pushengage.com/analytics', '_blank', 'noopener');
// AFTER:
campCard.onclick = () => window.open('https://app.pushengage.com/analytics/overview', '_blank', 'noopener');

// FIX 5: analytics (full analytics link)
// BEFORE:
window.open('https://app.pushengage.com/analytics', '_blank', 'noopener,noreferrer');
// AFTER:
window.open('https://app.pushengage.com/analytics/overview', '_blank', 'noopener,noreferrer');
```

**Step 2: Fix header.js URL**

```javascript
// BEFORE:
action: () => window.open('https://app.pushengage.com/analytics', '_blank', 'noopener')
// AFTER:
action: () => window.open('https://app.pushengage.com/analytics/overview', '_blank', 'noopener')
```

Note: `header.js` also has `/sites/new` — this is NOT in routes.ts but is handled by server-side routing. Leave it as-is.

**Step 3: Fix recommendations.js URLs**

| Current (WRONG) | Correct | Route in routes.ts |
|---|---|---|
| `/notification/ab-test` | `/campaigns/notifications` | `campaigns.notifications` |
| `/chat` | `/chat-widgets/list` | `chatWidget.list` |
| `/drip` | `/campaigns/drip` | `campaigns.drip` |
| `/billing` (3 occurrences) | `/account/billing` | `account.billing` |

```javascript
// FIX 1: ab-test (no such route exists)
// BEFORE:
actionType: 'url', actionTarget: 'https://app.pushengage.com/notification/ab-test'
// AFTER:
actionType: 'url', actionTarget: 'https://app.pushengage.com/campaigns/notifications'

// FIX 2: chat
// BEFORE:
actionType: 'url', actionTarget: 'https://app.pushengage.com/chat'
// AFTER:
actionType: 'url', actionTarget: 'https://app.pushengage.com/chat-widgets/list'

// FIX 3: drip
// BEFORE:
actionType: 'url', actionTarget: 'https://app.pushengage.com/drip'
// AFTER:
actionType: 'url', actionTarget: 'https://app.pushengage.com/campaigns/drip'

// FIX 4,5,6: billing (use replace_all for this string)
// BEFORE:
actionType: 'url', actionTarget: 'https://app.pushengage.com/billing'
// AFTER:
actionType: 'url', actionTarget: 'https://app.pushengage.com/account/billing'
```

**Step 4: Fix accordion.js URL**

```javascript
// BEFORE:
link.href = 'https://app.pushengage.com/settings/billing';
// AFTER:
link.href = 'https://app.pushengage.com/account/billing';
```

**Step 5: Fix popup.html URL**

```html
<!-- BEFORE: -->
href="https://app.pushengage.com/analytics"
<!-- AFTER: -->
href="https://app.pushengage.com/analytics/overview"
```

Note: `popup.html` also has two links to `https://app.pushengage.com` (root). These are correct — route `dashboard: '/'` exists.

**Step 6: Verify — grep for remaining URLs**

Run: `grep -rn 'app.pushengage.com' modules/ popup.html --include='*.js' --include='*.html'`

Confirm only these URLs remain:
- ✅ `/audience/subscribers`
- ✅ `/analytics/overview`
- ✅ `/account/billing`
- ✅ `/campaigns/notifications`
- ✅ `/chat-widgets/list`
- ✅ `/campaigns/drip`
- ✅ `/design/subscription-dialogbox`
- ✅ `/sites/new` (server-side route)
- ✅ `/` (root dashboard)
- ✅ `/login`, `/register` (auth flow)

**Step 7: Commit**

```bash
git add modules/insights.js modules/header.js modules/recommendations.js modules/accordion.js popup.html
git commit -m "fix: correct all dashboard redirect URLs

Verified against pushengage-app-master/src/routes/routes.ts:
- /subscribers → /audience/subscribers
- /analytics → /analytics/overview
- /billing → /account/billing
- /notification/ab-test → /campaigns/notifications
- /chat → /chat-widgets/list
- /drip → /campaigns/drip
- /settings/billing → /account/billing"
```

**Acceptance criteria:**
- Open extension → Insights tab → Click subscribers card → Opens `/audience/subscribers` (not 404)
- Click revenue/CTR card → Opens `/analytics/overview` (not 404)
- Click campaigns card → Opens `/analytics/overview` (not 404)
- Click "View Full Analytics" link → Opens `/analytics/overview` (not 404)
- Click recommendation card "Unlock segments" → Opens `/account/billing` (not 404)
- Click recommendation card "Add Chat Widget" → Opens `/chat-widgets/list` (not 404)
- Click recommendation card "Set up drip" → Opens `/campaigns/drip` (not 404)
- Click upgrade nudge in locked accordion → Opens `/account/billing` (not 404)

**Rollback:** `git revert HEAD`

---

### Task 2: Reduce Gemini maxOutputTokens

**Files:**
- Modify: `modules/ai.js` (1 line in `callGemini()`)

**Impact Analysis:**
- CTA generation returns ~50-80 tokens (3 JSON objects with btn1/btn2)
- Insights returns ~150-200 tokens (3-5 JSON objects)
- Recommendation copy returns ~200-280 tokens (4 items × title + description + JSON overhead)
- Current limit of 2048 wastes budget and can cause verbose preambles
- **Set to 400** — covers all use cases with 43% margin on the largest response (rec copy)
- `parseGeminiJson` handles truncation as safety net, but truncation means silently losing data

**Step 1: Change maxOutputTokens**

```javascript
// BEFORE:
maxOutputTokens: 2048,
// AFTER:
maxOutputTokens: 400,
```

**Step 2: Commit**

```bash
git add modules/ai.js
git commit -m "perf: reduce Gemini maxOutputTokens from 2048 to 400

All Gemini outputs are small JSON arrays (50-280 tokens).
400 gives 43% headroom above largest response (rec copy ~280 tokens).
parseGeminiJson handles truncation as safety net."
```

**Acceptance criteria:**
- Click "AI Write" → 3 suggestions appear, each with non-empty title, message, btn1, and btn2
- Go to Insights tab → Recommendations render with AI-personalized copy (not fallback text)
- Check browser console — no "Failed to parse Gemini JSON" warnings

**Rollback:** Change `400` back to `2048`

---

### Task 3: Trim CTA Prompt

**Files:**
- Modify: `modules/ai.js` (prompt text in `generateCtaButtons()`)

**Impact Analysis:**
- Current prompt is ~400 words (~550 input tokens) with verbose per-content-type examples
- Gemini 2.5 Flash already understands CTA conventions
- Keep structural rules (btn1=primary, btn2=secondary, max 20 chars)
- **Keep e-commerce edge case examples** (out of stock, pre-order) — these are non-obvious
- `fallbackCta()` covers all page types if Gemini quality degrades
- Estimated savings: ~30% input tokens per CTA call

**Step 1: Replace the prompt in generateCtaButtons()**

Find the prompt template (starts with `` `Generate ${count} pairs`` ) and replace with:

```javascript
    const prompt = `Generate ${count} pairs of CTA button labels for a push notification about:
"${description.substring(0, 300)}"

${pageContext.length ? 'Context:\n' + pageContext.join('\n') : ''}
${socialMandate}

Rules:
- btn1 = primary action (2-4 words, drives to page URL). Be specific to content type.
- btn2 = secondary action (2-3 words, softer alternative or social action)
- Max 20 characters each
- Match verb to content: "Watch Now" for video, "Shop Now" for products, "Read Now" for articles, "Listen Now" for audio, "Register Now" for events
- E-commerce specifics: "Shop Now"/"Buy Now" for in-stock, "Join Waitlist"/"Notify Me" for out-of-stock, "Pre-Order Now" for pre-order
- Never use generic "Learn More" when a specific verb fits

Return JSON array: [{"btn1":"...","btn2":"..."}]`;
```

**Step 2: Commit**

```bash
git add modules/ai.js
git commit -m "perf: trim CTA prompt to reduce input tokens ~30%

Removed verbose per-content-type examples Gemini already knows.
Kept structural rules, content-verb hints, and e-commerce edge cases
(out-of-stock, pre-order). fallbackCta() handles quality degradation."
```

**Acceptance criteria:**
- Click "AI Write" on an article page → CTAs use "Read Now" / "Read Article" (not generic)
- Click "AI Write" on a product page → CTAs use "Shop Now" / "Buy Now" (not generic)
- Click "AI Write" on a video page → CTAs use "Watch Now" (not "Read Now")
- If social links exist → At least one suggestion has a social btn2

**Rollback:** Restore original prompt from git history

---

### Task 4: Add AI Response Caching

**Files:**
- Modify: `modules/ai.js` (add cache object + lookup in `generateCtaButtons` and `generateInsights`)

**Impact Analysis:**
- CTA cache: Same page → same CTAs. Keyed by `description + pageType`. In-memory only (cleared on popup close).
- Insights cache: Account data changes slowly. Single-entry session cache. Prevents re-generation on tab switches.
- Both caches are in-memory — no chrome.storage needed, no persistence.
- Refresh button and new page visits bypass cache naturally.

**Step 1: Add in-memory cache at top of ai.js**

After the `GEMINI_URL` constant, add:
```javascript
// In-memory caches — cleared when popup closes (no persistence needed)
const _ctaCache = new Map();   // key: description+pageType → value: CTA array
const _insightsCache = { key: null, data: null }; // single-entry session cache
```

**Step 2: Add cache lookup in generateCtaButtons()**

At the START of `generateCtaButtons()`, before any other logic:
```javascript
  // Check CTA cache (same page = same CTAs within popup session)
  const cacheKey = (description || '').substring(0, 200) + '|' + (pageType || '') + '|' + count;
  if (_ctaCache.has(cacheKey)) {
    return _ctaCache.get(cacheKey);
  }
```

Before EVERY return statement in `generateCtaButtons()` that returns valid CTAs, store in cache:
```javascript
  _ctaCache.set(cacheKey, resultArray);
```

This applies to:
- The `return valid;` path (Gemini success)
- The `return fallbackCta(...)` path in the catch block
- The `return fallbackCta(...)` path for invalid Gemini responses

**Step 3: Add cache lookup in generateInsights()**

At the START of `generateInsights()`:
```javascript
  // Session cache — insights don't change within a popup session
  const insightsCacheKey = JSON.stringify(accountData);
  if (_insightsCache.key === insightsCacheKey && _insightsCache.data) {
    return _insightsCache.data;
  }
```

Note: `generateInsights()` has no post-processing after `callGemini()` — the `callGemini` result is returned directly. So caching the final return value is correct.

Before the return:
```javascript
  const result = await callGemini(prompt);
  _insightsCache.key = insightsCacheKey;
  _insightsCache.data = result;
  return result;
```

**Step 4: Commit**

```bash
git add modules/ai.js
git commit -m "perf: add in-memory caching for Gemini CTA and insights calls

CTA cache: keyed by description+pageType, avoids repeat calls on same page.
Insights cache: single-entry session cache, avoids re-generation on tab switches.
Both cleared when popup closes. No persistent storage needed."
```

**Acceptance criteria:**
- Click "AI Write" → suggestions appear (first call, network request fires)
- Click "AI Write" again on SAME page → suggestions appear INSTANTLY (no network request — check Network tab)
- Switch to Insights → recs render → switch to Compose → switch back to Insights → NO second Gemini call (check Network tab)
- Navigate to a DIFFERENT page → Click "AI Write" → new suggestions (cache miss, new call)

**Rollback:** Remove cache variables and all cache lookup/store code

---

### Task 5: Parallelize selectSite() API Calls

**Files:**
- Modify: `modules/auth.js` (refactor `selectSite()`)

**Verification:** Before implementing, read these backend files to confirm API response shapes:
- `pushengage-adonis-node-api-master/app/Controllers/Http/Dashboard/Site/index.js` — GET /sites/:id response
- `pushengage-adonis-node-api-master/app/Services/Dashboard/Site/index.js` — appSetting service
- `pushengage-adonis-node-api-master/storage/Limit/Text.js` — UTM field limits

**Impact Analysis:**
- Currently 5 sequential API calls in `selectSite()`
- `getAiCredits` DEPENDS on `ownerId` from `getSiteDetails` response — cannot be parallelized with it
- The other 4 calls (getSiteDetails, getSubscriberCount, getUtmSettings, listSegments) are fully independent
- Estimated savings: ~800ms on 200ms round-trip connections

**Step 1: Refactor selectSite() to use Promise.allSettled**

Replace the entire try block inside `selectSite()`:

```javascript
export async function selectSite(siteId) {
  setState('activeSiteId', siteId);
  setState('loading', true);
  try {
    // Fire 4 independent API calls in parallel
    const [detailsResult, subCountResult, utmResult, segsResult] = await Promise.allSettled([
      api.getSiteDetails(siteId),
      api.getActiveSubscriberCount(siteId),
      api.getUtmSettings(siteId),
      api.listSegments(siteId, { limit: 100, expand: 'subscriber_analytics' })
    ]);

    // 1. Site details — REQUIRED (throw if failed, everything depends on this)
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

    // 2. AI credits — depends on ownerId from details, so runs AFTER details resolve
    try {
      const ownerId = owner.owner_id || userInfo.owner_id;
      if (ownerId) {
        const credits = await api.getAiCredits(ownerId);
        setState('aiCreditsRemaining', credits?.data?.remaining_credit || 0);
      }
    } catch { setState('aiCreditsRemaining', 0); }

    // 3. Subscriber count (from parallel — graceful degradation)
    if (subCountResult.status === 'fulfilled') {
      setState('subscriberCount', subCountResult.value?.data?.count || 0);
    } else {
      setState('subscriberCount', 0);
    }

    // 4. UTM settings (from parallel — graceful degradation)
    if (utmResult.status === 'fulfilled') {
      setState('siteUtmDefaults', utmResult.value?.data || {});
    } else {
      setState('siteUtmDefaults', {});
    }

    // 5. Segments (from parallel — graceful degradation)
    if (segsResult.status === 'fulfilled') {
      const segData = segsResult.value?.data?.data || segsResult.value?.data || [];
      setState('segmentsList', segData);
    } else {
      setState('segmentsList', []);
    }

    await saveSession();
    setState('loading', false);
    emit('siteChanged', siteId);
  } catch (e) { setState('loading', false); throw e; }
}
```

**Step 2: Commit**

```bash
git add modules/auth.js
git commit -m "perf: parallelize selectSite() API calls

4 independent calls (siteDetails, subscriberCount, utmSettings,
segments) now fire via Promise.allSettled instead of sequentially.
getAiCredits waits for siteDetails (needs ownerId from response).
Saves ~800ms on boot with 200ms round-trips.
getSiteDetails failure throws; others degrade gracefully to defaults."
```

**Acceptance criteria:**
- Open extension → Boots noticeably faster
- Subscriber count displays correctly in header
- UTM fields pre-fill with site defaults (not hardcoded)
- Segments appear in compose dropdown and segments tab
- Plan name displays correctly
- Switch sites → All data updates correctly for new site

**Rollback:** `git revert HEAD` — restores sequential calls

---

### Task 6: Deduplicate listNotifications Across Modules

**Files:**
- Modify: `modules/state.js` (add `recentNotifications: []`)
- Modify: `modules/auth.js` (add notification fetch to parallel batch)
- Modify: `modules/header.js` (read from state instead of API call)
- Modify: `modules/recommendations.js` (read from state instead of API call)

**Verification:** Before implementing, read these files to confirm response shape and field names:
- `pushengage-adonis-node-api-master/app/Transformers/Dashboard/Notification.js` — response field names
- `modules/api.js` → `extractNotifications()` function — canonical response parsing

**CRITICAL:** The shared fetch MUST include `order_by_desc: 'sent_at'` because both header.js and recommendations.js rely on `notifications[0]` being the most recent campaign for `lastCampaignDate` and `daysSinceLast` calculations.

**CRITICAL:** Use the existing `extractNotifications()` helper from `api.js` to parse the response. Do NOT re-implement extraction logic inline — this ensures one source of truth.

**Step 1: Add recentNotifications to state.js**

In `_state` initial object, add after `siteUtmDefaults`:
```javascript
siteUtmDefaults: {}, recentNotifications: [],
```

In `resetAll()`, add:
```javascript
setState('recentNotifications', []);
```

**Step 2: Add notification fetch to selectSite() parallel batch (auth.js)**

Add to the `Promise.allSettled` array (from Task 5):
```javascript
api.listNotifications(siteId, { limit: 20, status: 'sent', order_by_desc: 'sent_at', expand: 'notification_analytics' })
```

Add import at top of auth.js:
```javascript
import { extractNotifications } from './api.js';  // if not already imported
```

Process the result using `extractNotifications()`:
```javascript
// 6. Recent notifications (from parallel, shared by header + recommendations)
if (notifResult.status === 'fulfilled') {
  setState('recentNotifications', extractNotifications(notifResult.value));
} else {
  setState('recentNotifications', []);
}
```

**Step 3: Update header.js — read from state**

In `refreshHeaderNudge()`, replace:
```javascript
// BEFORE:
const result = await api.listNotifications(siteId, {
  limit: 10, status: 'sent', order_by_desc: 'sent_at', expand: 'notification_analytics'
});
notifications = extractNotifications(result);
```

With:
```javascript
// AFTER:
notifications = (getState('recentNotifications') || []).slice(0, 10);
```

Remove the `api.listNotifications` call and the `extractNotifications` wrapping (data is already extracted when stored in state).

**Step 4: Update recommendations.js — read from state**

In `buildAccountContext()`, replace:
```javascript
// BEFORE:
const result = await api.listNotifications(siteId, {
  limit: 20, status: 'sent', order_by_desc: 'sent_at', expand: 'notification_analytics'
});
notifications = extractNotifications(result);
```

With:
```javascript
// AFTER:
notifications = getState('recentNotifications') || [];
```

Remove the `api.listNotifications` call AND the `extractNotifications` wrapping.

**Step 5: Commit**

```bash
git add modules/state.js modules/auth.js modules/header.js modules/recommendations.js
git commit -m "perf: deduplicate listNotifications — fetch once, share via state

Notifications (20, sorted by sent_at desc) fetched once in selectSite()
parallel batch, stored in state as recentNotifications.
Header uses first 10, recommendations use all 20.
Uses extractNotifications() from api.js for consistent response parsing.
Saves 2 HTTP requests per boot."
```

**Acceptance criteria:**
- Header nudge shows correct most-recent campaign date (verify against dashboard)
- Header nudge shows correct last campaign CTR (verify against dashboard)
- Header nudge priority waterfall works: revenue > growth > campaigns > optimize > zero-state
- Recommendations in Insights tab render correctly with campaign metrics
- `daysSinceLast` is correct (notifications[0] is truly the most recent)
- Check Network tab — only ONE `/notifications` request per popup open (not 3)

**Rollback:** `git revert HEAD` — restores separate API calls in header.js and recommendations.js

---

### Task 7: Remove Redundant Auth Step 4

**Files:**
- Modify: `popup.js` (remove `tryAutoLoginFromDashboard()` step 4)

**Impact Analysis:**
- Startup step 4 calls `tryAutoLoginFromDashboard()` which is identical to step 2 (`getDashboardToken()` → `handleAuthSuccess()`)
- If step 2 failed to find a dashboard token, step 4 will fail for the same reason
- Removing it saves a wasted `chrome.tabs.query` + `chrome.scripting.executeScript` attempt
- Steps 1-3 cover all login scenarios: pending auth → dashboard token → saved session

**Step 1: Remove step 4**

Find and remove:
```javascript
  // 4. Last try: auto-detect dashboard (if step 2 failed for any reason)
  try {
    const loggedIn = await tryAutoLoginFromDashboard();
    if (loggedIn) return;
  } catch (e) { console.warn('[startup] auto-login failed:', e.message); }
```

**Step 2: Commit**

```bash
git add popup.js
git commit -m "perf: remove redundant auth step 4 (identical to step 2)

tryAutoLoginFromDashboard() was a duplicate of getDashboardToken()
called in step 2. If step 2 can't find a dashboard token, step 4
won't either. Steps 1-3 cover all login scenarios."
```

**Acceptance criteria:**
- Dashboard tab open → Extension auto-logs in (step 2)
- Dashboard tab closed, saved session exists → Extension restores session (step 3)
- No session, no dashboard → Shows login screen
- Console shows NO "[startup] auto-login failed" message (step 4 is gone)

**Rollback:** `git revert HEAD`

---

### Task 8: Optimize Draft Cleanup Storage

**Files:**
- Modify: `modules/compose.js` (change when `cleanOldDrafts` runs)

**Impact Analysis:**
- `chrome.storage.local.get(null)` reads ENTIRE storage into memory
- Called in `fetchPageData()` (~line 489) on every boot, and in `saveDraft()` debounced on keystrokes
- The boot-time call in `fetchPageData()` is the offender — runs before the user does anything
- Fix: Move the cleanup out of `fetchPageData()` and into `saveDraft()` only (already debounced at 1.5s)

**Step 1: Remove cleanOldDrafts from fetchPageData()**

In `fetchPageData()`, find the block that calls `chrome.storage.local.get(null)` for draft cleanup and remove it. The cleanup already runs in `saveDraft()` via the debounce — no need to also run it on boot.

Find and remove from `fetchPageData()`:
```javascript
  // Clear any draft from a different page (draft is now URL-scoped)
  try {
    const siteId = getState('activeSiteId');
    if (siteId && pageData.url) {
      const currentKey = `${DRAFT_KEY}_${siteId}_${simpleHash(pageData.url)}`;
      const all = await chrome.storage.local.get(null);
      const prefix = `${DRAFT_KEY}_${siteId}`;
      const staleKeys = Object.keys(all).filter(k => k.startsWith(prefix) && k !== currentKey);
      if (staleKeys.length > 0) chrome.storage.local.remove(staleKeys).catch(() => {});
    }
  } catch {}
```

**Step 2: Commit**

```bash
git add modules/compose.js
git commit -m "perf: remove boot-time draft cleanup (already runs on save)

Removed chrome.storage.local.get(null) call from fetchPageData().
Draft cleanup already runs in saveDraft() via debounce.
Eliminates full-storage read on every popup open."
```

**Acceptance criteria:**
- Open extension → compose form loads (no change in behavior)
- Type in title field → wait 2s → draft auto-saves (cleanup runs via saveDraft)
- Close/reopen extension on same page → draft restores correctly
- Navigate to different page → old draft is cleaned on next save

**Rollback:** `git revert HEAD`

---

### Task 9: Flag Gemini API Key in Documentation

**Files:**
- Modify: `docs/INTERNAL-TEAM-GUIDE.md`

**Step 1: Add security note**

Add a section to the internal team guide:
```markdown
## ⚠️ Security Note: Gemini API Key

The Gemini API key in `modules/ai.js` is hardcoded for the internal beta.
This is acceptable for internal team testing but MUST be moved to a backend
proxy before any public release.

**For now:** Apply these Google Cloud Console restrictions:
- HTTP referrer: `chrome-extension://YOUR_EXTENSION_ID/*`
- Daily quota: 1000 requests/day

**Before public release:** Replace with `POST /sites/:id/generative-ai/campaign-copy`
backend endpoint (see TODO in ai.js lines 8-15).

**Who can see the key:** Only team members who inspect the extension source.
Push notification recipients CANNOT see or access the key.
```

**Step 2: Commit**

```bash
git add docs/
git commit -m "docs: flag Gemini API key as internal-beta-only

Added security notes about hardcoded Gemini key.
Must be moved to backend proxy before public release."
```

---

### Task 10: Fix Pre-Existing Notification Field Name Mismatches

**Files:**
- Modify: `modules/header.js` (fix field names in refreshHeaderNudge)
- Modify: `modules/recommendations.js` (fix field names in buildAccountContext)

**Verification:** Read the notification transformer to confirm correct field names:
- `pushengage-adonis-node-api-master/app/Transformers/Dashboard/Notification.js`
- `pushengage-adonis-node-api-master/storage/Models/Notification/Notification.js` (column constants)

**Impact Analysis — CRITICAL PRE-EXISTING BUGS discovered during Task 6 verification:**

The code review found that header.js and recommendations.js read notification fields using WRONG names. These bugs exist TODAY and cause:
- Header nudge CTR is always 0 (revenue nudge never fires)
- Dormant segment detection never works

| Frontend reads | Backend field | Status |
|---|---|---|
| `sent_count` (underscore) | `sentcount` (no underscore) | ❌ WRONG |
| `click_count` (underscore) | `clickcount` (no underscore) | ❌ WRONG |
| `total_sent`, `total_clicked` | Don't exist in API response | ❌ WRONG |
| `revenue` (on notification obj) | Not a notification field | ❌ WRONG |

**Step 1: Fix header.js field names**

In `refreshHeaderNudge()`, find the notification field reads:

```javascript
// BEFORE (lines ~211-212):
const lastSent = notifications[0].sent_count || notifications[0].total_sent || 0;
const lastClicks = notifications[0].click_count || notifications[0].total_clicked || 0;

// AFTER:
const lastSent = notifications[0].sentcount || notifications[0].sent_count || 0;
const lastClicks = notifications[0].clickcount || notifications[0].click_count || 0;
```

Also fix the revenue field read:
```javascript
// BEFORE (line ~205):
if (showRevenue && n.revenue != null) totalRevenue += Number(n.revenue) || 0;

// AFTER — revenue comes from notification_analytics expand, not a top-level field
// Check for analytics sub-object or common field names
if (showRevenue) {
  const rev = n.revenue || n.notification_analytics?.revenue || 0;
  totalRevenue += Number(rev) || 0;
}
```

**Step 2: Fix recommendations.js field names**

In `buildAccountContext()`:

```javascript
// BEFORE (lines ~223-224):
totalClicks += n.click_count || n.clickcount || n.clicks || 0;
totalSent += n.sent_count || n.sentcount || n.sent || 0;

// AFTER — put the correct field name FIRST:
totalClicks += n.clickcount || n.click_count || n.clicks || 0;
totalSent += n.sentcount || n.sent_count || n.sent || 0;
```

**Step 3: Commit**

```bash
git add modules/header.js modules/recommendations.js
git commit -m "fix: correct notification field names to match backend API

Backend transformer returns 'sentcount' and 'clickcount' (no underscores).
Header.js and recommendations.js were reading 'sent_count' and 'click_count'
which were always undefined, causing CTR to always be 0.

Verified against pushengage-adonis-node-api-master/app/Transformers/Dashboard/Notification.js"
```

**Acceptance criteria:**
- Header nudge shows actual CTR (not always 0%) for accounts with campaigns
- If CTR > 4%, header shows "Great CTR" nudge instead of "Send a campaign"
- Recommendations correctly calculate avgCtr and daysSinceLast

**Rollback:** `git revert HEAD`

---

## Feature Impact Assessment

| Feature | Touched by Plan? | Tasks | Verified Against |
|---|---|---|---|
| **Send Now** (`source: 'Dashboard'`) | ❌ No | — | Backend Joi validators |
| **Schedule** (`valid_from`) | ❌ No | — | Backend Joi validators |
| **Timezone** (`source: 'parent_sub_timezone'`) | ❌ No | — | Backend Joi validators |
| **UTM params** (enabled, strip, defaults) | ❌ No | — | Backend Helper.js |
| **Segments** (compose dropdown) | ✅ Task 5 changes fetch timing | 5 | Backend segments controller |
| **Segments** (management tab) | ❌ No (NOT deduplicated) | — | N/A |
| **Action buttons** (label, url) | ❌ No | — | N/A |
| **CTA generation quality** | ✅ Tasks 2-4 | 2,3,4 | Fallback CTA catalog |
| **Page type detection** | ❌ No | — | N/A |
| **Social link detection** | ❌ No | — | N/A |
| **Social link interaction** (btn2 auto-fill) | ❌ No | — | N/A |
| **Content extraction** (content.js) | ❌ No | — | N/A |
| **Header nudge** | ✅ Task 6 changes data source | 6 | Notification transformer |
| **Recommendations** | ✅ Task 6 changes data source | 6 | Notification transformer |
| **Dashboard redirects** | ✅ Task 1 fixes all URLs | 1 | routes.ts |
| **Login/auth flow** | ✅ Task 7 removes step 4 | 7 | N/A |

## Overall Project Impact

- **Boot time:** ~1-1.5s faster (parallel API + dedup)
- **AI cost:** ~50-60% reduction per session (caching + lower maxTokens + trimmed prompt)
- **API calls per boot:** 10-12 → 7 (dedup + parallel)
- **Correctness:** 6 broken dashboard links fixed → 0 broken
- **Code size:** Net ~20 lines added (caching), ~30 lines removed (cleanup)

## Known Existing Limitations (NOT addressed by this plan)

1. **Both action buttons point to same URL** when no social links exist — btn2 has no alternate destination
2. **Content.js depends on page DOM being ready** — heavy JS-rendered pages (Flipkart) may have incomplete data
3. **Gemini API key is hardcoded** — acceptable for internal beta, must move to backend before public release
4. **`inferCtaFromContent` relies on English keywords** — non-English product pages get generic CTAs
5. **`revenue` on notifications** — may not be a top-level field. Revenue-based header nudge depends on backend returning revenue in notification analytics expand. Needs verification with live API response.
6. **Dormant segment detection** — `n.segments` / `n.segment_ids` are nested inside `notification_criteria`, not top-level. The detection in `buildAccountContext()` likely never finds targeted segments. Needs a separate fix to read `n.notification_criteria.include_segments`.
