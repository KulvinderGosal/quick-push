# PushEngage Chrome Extension — Project Documentation

> **SECURITY WARNING:** The Gemini API key is hardcoded in `modules/ai.js` (line 21). Acceptable for internal beta with Google Cloud restrictions applied (HTTP referrer + 1000 req/day quota). MUST be proxied through `POST /sites/:id/generative-ai/campaign-copy` backend endpoint before production release. See AI-IMPLEMENTATION.md for details.

**Version:** 2.0.0 | **Manifest:** V3 | **Last Updated:** 2026-03-22

## Overview

A Chrome extension that lets PushEngage users create push notification campaigns, manage subscriber segments, and view analytics — all from any webpage without opening the dashboard. It auto-extracts page content (title, description, images) and pre-fills campaign fields with one click.

## Architecture

```
popup.html (UI shell — all screens)
  └── popup.js (entry point — routing, auth flow, boot)
        ├── modules/state.js      (centralized state store with events)
        ├── modules/auth.js       (login, token encryption, site selection)
        ├── modules/api.js        (HTTP client — 17 PE API endpoints)
        ├── modules/header.js     (site selector, user menu, contextual nudge)
        ├── modules/compose.js    (campaign creation — the core feature)
        ├── modules/insights.js   (health snapshot, JTBD+AI recommendations)
        ├── modules/segments.js   (segment CRUD, URL patterns, presets)
        ├── modules/settings.js   (auto-extract toggle, UTM defaults)
        ├── modules/permissions.js (plan-based feature gating)
        ├── modules/ai.js         (PE API + Gemini AI integration)
        ├── modules/recommendations.js (JTBD engine — detection rules, scoring, AI copy)
        ├── modules/safeguards.js (rate limiting, duplicate detection)
        ├── modules/modal.js      (confirm/alert dialogs)
        ├── modules/accordion.js  (expandable sections)
        └── modules/sanitize.js   (HTML escaping, URL validation)

background.js (service worker — keyboard shortcuts, dashboard auth capture)
content.js    (injected page extractor — title, description, OG images)
styles/theme.css (design tokens — navy #191A35, blue #3B43FF, gold #FFD37D)
```

## Authentication Flow

1. User clicks "Login" → Extension first checks for existing dashboard token via `chrome.scripting.executeScript` on any open `app.pushengage.com` tab. If found, uses it directly (no new tab needed).
2. If no dashboard tab open, background.js opens `app.pushengage.com/login` in a new tab
3. After login, background captures JWT from dashboard `localStorage`
4. Token stored encrypted (AES-GCM) in `chrome.storage.local`
5. On extension open: check pending auth → check dashboard token → restore saved session → show login screen
6. Signup link: redirects to `pushengage.com/pricing/` with UTM params (`utm_source=extension`). Hidden when PE account is already open in Chrome.
7. Multi-site support: site selector dropdown, per-site permissions/plan loaded
8. `selectSite()` fires 5 API calls in parallel via `Promise.allSettled` (siteDetails, subscriberCount, utmSettings, segments, notifications) + 1 sequential (aiCredits, needs ownerId from siteDetails)

## Screens

### Compose (Campaign Creation)
- **Page data extraction**: title, description, URL, OG image auto-filled from current tab
- **AI Write**: Generates 3 title + 3 message options (PE API) + context-aware CTA button pairs (Gemini)
  - Tone selector: Default, Urgent, Friendly, Professional, Casual, Exciting, FOMO
  - Feedback input for regeneration refinement
- **Images**: Site icon (from settings) + featured image (OG → first large page image → placeholder)
- **Segments**: Target all subscribers or select specific segments (sorted by subscriber count)
- **Action Buttons**: Up to 2 CTA buttons with label + URL, pre-filled from saved preferences
- **UTM Parameters**: Enabled by default, pre-fills source/medium/campaign from saved prefs
- **Schedule**: Send Now or Schedule for Later (with subscriber timezone option)
- **Safeguards**: Rate limiting (5 sends / 10 min), duplicate detection, confirmation dialog
- **Preference persistence**: UTM, buttons, schedule settings saved after each send/draft

### Insights (Restructured)
- **Health Snapshot**: 3 compact cards — Subscribers, Revenue/CTR, Campaign Activity
  - Zero states framed as opportunities ("Unlimited growth potential" instead of "0")
  - Each card is tappable, navigates to the relevant action
- **JTBD Recommendations**: Up to 4 AI-powered cards ranked by impact score
  - JTBD engine detects account state (plan, features, metrics, activity)
  - AI generates personalized copy using account data (Gemini, cached 7 days)
  - Fallback: static template text if AI fails
  - Categories: activation, optimization, multichannel, upsell
  - Priority coloring: blue (high), gold (medium), gray (low)
- **Footer**: "View Full Analytics →" link to PushEngage dashboard
- **Removed**: KPI cards, top campaign, top segments, top countries, subscriber health, Quick Wins, AI Insights (all moved to dashboard)

### Segments (Audience Management)
- **Segment types**: Geographic, Device, Behavior (URL patterns), Custom
- **Inline creation**: "Create from this URL" auto-fills URL criteria
- **AI naming**: Suggest segment names based on URL context (PE API)
- **Overlap detection**: Warns when new segment overlaps existing ones

### Settings
- Auto-extract toggle
- Default UTM source/medium

## API Integration

### PushEngage Dashboard API
**Base:** `https://dashboard-public-api.pushengage.com/d/v1`
**Auth:** `Bearer` token (JWT)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth` | GET | Validate session, get user & sites |
| `/auth/logout` | POST | Logout |
| `/sites/:id` | GET | Site details, permissions, plan info |
| `/sites/:id/notifications` | GET/POST | List/create notifications |
| `/sites/:id/notifications/:id` | GET | Single notification details |
| `/sites/:id/segments` | GET/POST | List/create segments |
| `/sites/:id/segments/:id` | PATCH | Update segment |
| `/sites/:id/geo-segments` | GET | Geographic segments |
| `/sites/:id/analytics/summary` | GET | Daily analytics (requires date range) |
| `/sites/:id/analytics/notification-result/summary` | GET | Notification KPIs |
| `/sites/:id/analytics/notification-result/timeseries` | GET | Charts data |
| `/sites/:id/analytics/optin` | GET | Opt-in analytics (requires date range) |
| `/sites/:id/generative-ai/text-generation` | POST | AI text generation (uses credits) |
| `/accounts/:ownerId/credit-usages/credits` | GET | Remaining AI credits |

### Google Gemini API
**Model:** `gemini-2.5-flash`
**Used for:** CTA button generation, AI insights analysis
**Key:** Hardcoded (internal dev use only — not customer-facing)
**Response format:** Structured JSON via `responseMimeType: 'application/json'`

### API Response Shapes (Key Reference)

**GET /sites/:id** returns:
```
{ status, data: { site_id, site_name, site_url, site_image, settings, ... },
  user: { user_id, user_email, permissions: {...}, owner_id,
    owner: { owner_id, current_plan, expiry_date, is_trial,
      permissions: { segments: 1, notifications: { schedule: 1, ab: 1, timezone: 1, multi_action_btn: 1 }, image_library: 1, ... },
      paymentSubscription: { name: "Enterprise plan", subscribers_limit: 251000, segment_limit: 575, ... }
    }
  }
}
```

**Segments** use `segment_name` and `subscribers` (not `name` / `subscribers_count`).

**Segments API** requires the `expand=subscriber_analytics` query parameter to return subscriber counts per segment. Without this parameter, `subscribers` will be absent from the response. The response is paginated with the shape:
```json
{ "data": { "data": [...], "total": 42, "perPage": 15, "page": 1 } }
```
The inner `data` array contains the segment objects. Use `total` and `perPage` to paginate through all segments.

**Subscriber count** is NOT available from `GET /sites/:id`. The analytics summary gives daily new subscribers only. A dedicated total subscriber count endpoint does not exist in the current API.

## AI Implementation

> **Critical reference for maintaining and evolving AI features.** Primary file: `modules/ai.js` (~405 lines)

### Architecture Overview

The extension uses **two AI providers** in parallel:

```
┌─────────────────────────────────────────────────────────┐
│                    AI Write Button                        │
│                                                           │
│  ┌─ PushEngage API (uses customer's AI credits) ──────┐  │
│  │  POST /sites/:id/generative-ai/text-generation      │  │
│  │  • type: 'notification_title'  → 3 titles           │  │
│  │  • type: 'notification_message' → 3 messages        │  │
│  │  • Accepts: tone, language, description              │  │
│  │  • Billing: Deducted from account AI credit pool     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ Google Gemini 2.5 Flash (free, hardcoded key) ────┐  │
│  │  CTA button pairs (btn1 + btn2) per suggestion      │  │
│  │  • Prompt includes page type + social links context  │  │
│  │  • Post-processed to enforce btn1/btn2 rules         │  │
│  │  • Falls back to rule-based CTAs on failure          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  All 3 calls run via Promise.allSettled() in parallel     │
│  Total latency ≈ max(title, message, CTA) not sum         │
└─────────────────────────────────────────────────────────┘
```

### AI Feature Summary

| Feature | Provider | Endpoint/Model | Credits? |
|---------|----------|----------------|----------|
| Campaign titles (x3) | PushEngage API | `text-generation` type=notification_title | Yes |
| Campaign messages (x3) | PushEngage API | `text-generation` type=notification_message | Yes |
| CTA button labels (x3 pairs) | Gemini 2.5 Flash | `generateContent` | No |
| AI Insights (3-5 recommendations) | Gemini 2.5 Flash | `generateContent` | No |
| Segment name suggestions (x3) | PushEngage API | `text-generation` type=notification_title (reused) | Yes |
| JTBD recommendation copy | Gemini 2.5 Flash | generateContent (via recommendations.js) | No |

### Gemini Model & Configuration

```javascript
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

// Generation config
{
  temperature: 0.8,          // Creative but not wild
  maxOutputTokens: 400,      // Reduced from 2048 — covers all use cases with 43% margin
  responseMimeType: 'application/json'  // Hint for structured output
}
```

### CRITICAL: API Key Situation

**Current state:** The Gemini API key is **hardcoded** in `ai.js` line 21.

**Before production release, this MUST be:**
1. Moved to a backend proxy endpoint (e.g., `POST /sites/:id/generative-ai/cta-buttons`)
2. Or rotated and served via a PushEngage API that wraps Gemini
3. The current key is for **internal development only**

**Risk if shipped as-is:** Key is visible in extension source code. Any user can extract it and use our Gemini quota.

### CRITICAL: Model Deprecation

**Gemini models get deprecated frequently.** We've already hit this:
- `gemini-2.0-flash` was retired → broke CTA generation entirely
- Updated to `gemini-2.5-flash`

**Action required:** Monitor Google's model lifecycle. When a model is deprecated, the API returns:
```
"This model models/gemini-X.X-flash is no longer available to new users."
```

The extension catches this in `generateCtaButtons()` catch block and falls back to rule-based CTAs, so it degrades gracefully. But CTAs become generic until the model is updated.

**Recommendation:** Add a config endpoint or remote config so the model name can be updated without shipping a new extension version.

### CTA Generation: The Full Pipeline

This is the most complex AI feature. Here's every step and edge case.

**Step 1: Page Data Extraction (`content.js`)**

Injected into the active tab via `chrome.scripting.executeScript`. Extracts:

| Field | Source | Used For |
|-------|--------|----------|
| `pageType` | URL patterns + DOM heuristics | CTA context (20+ types) |
| `socialLinks` | Scans all `<a>` elements for social URLs | Social CTA btn2 labels + URLs |
| `embeddedVideos` | YouTube iframes, Vimeo, HTML5 `<video>` | YouTube CTA detection |
| `productInfo` | JSON-LD Product schema, meta tags | Product-specific CTAs |
| `title`, `description` | OG tags → meta tags → DOM | Gemini prompt content |

**Page types detected:** `youtube_video`, `youtube_playlist`, `youtube_channel`, `youtube`, `video`, `video_course`, `instagram_post`, `instagram`, `twitter`, `facebook`, `linkedin`, `tiktok`, `pinterest`, `reddit`, `podcast`, `product`, `article`, `page` (default)

**Corner case:** Pages behind authentication or heavy JS frameworks may not expose OG tags or social links. The fallback chain in `content.js` handles this: OG → meta → DOM selectors → empty string.

**Step 2: Sanitization (`sanitize.js`)**

`sanitizePageData()` was a critical bug source — it originally **stripped** all AI-relevant fields (pageType, socialLinks, embeddedVideos). Now it passes them through with validation:

- `socialLinks`: Each URL validated via `sanitizeUrl()` (HTTP/HTTPS only)
- `embeddedVideos`: Sliced to 5 max, URLs validated, titles truncated to 100 chars
- `pageType`: String, max 50 chars
- `productInfo`: All fields string-cast and truncated

**If you add new fields to content.js, you MUST also add them to `sanitizePageData()` or they will be silently dropped.**

**Step 3: Gemini Prompt Construction**

The prompt is built dynamically based on what's available. It includes:
- Page content (title, description, URL — truncated to 300 chars)
- Page type context
- Social media links found on page (if any)
- Embedded video information (if any)

**Key prompt rules:**
- btn1 = ALWAYS the page's primary action (blog, product, article URL)
- btn2 = secondary action. For 1-2 pairs, btn2 SHOULD be social
- NEVER put social media actions in btn1
- Do NOT use LinkedIn. Prioritize: YouTube > Instagram > Facebook > Twitter
- Labels: btn1 = 2-4 words, btn2 = 2-3 words, under 20 characters each
- Be SPECIFIC: "Book Flights" not "Learn More"

**The social mandate section is only included when social links or embedded videos exist.** Without it, the prompt is simpler and focused on content-type CTAs.

**Step 4: Gemini Response Parsing**

**This is where most bugs have occurred.** Gemini's JSON output is unreliable despite `responseMimeType: 'application/json'`.

`parseGeminiJson(text)` handles these known issues:

| Issue | Example | Fix |
|-------|---------|-----|
| Markdown code fences | `` ```json [...] ``` `` | Strip with regex |
| Object-wrapped array | `{"suggestions": [...]}` | Extract first array-valued property |
| Extra whitespace/newlines | `\n[\n{...}\n]\n` | Trim before parse |
| JSON buried in prose | `Here are the CTAs: [...]` | Regex extract `[...]` |
| Empty response | `""` | Throw → triggers fallback |

**Corner case not yet handled:** Gemini occasionally returns truncated JSON (e.g., `[{"btn1":"Read`, cut off mid-string). This falls through to the regex extractor which also fails, triggering the fallback. This is acceptable behavior.

**Step 5: Validation & Post-Processing**

After parsing, results are validated:
- Filter: must have `btn1` as non-empty string
- Truncate: hard cap at 25 characters per button
- Default: btn2 defaults to "Learn More" if empty

**Then `ensureSocialCta()` runs** — this is the safety net:
1. Scans all btn2 values for social keywords (watch, video, follow, subscribe, etc.)
2. If **none** contain social keywords AND social links exist on the page:
   - Replaces the **last** pair's btn2 with the highest-priority social CTA
   - e.g., YouTube found → last option gets `btn2: "Watch Video"`

**This guarantees at least 1 social CTA when social links exist, even if Gemini ignores the prompt instructions.**

**Step 6: URL Resolution**

`enrichCtasWithUrls()` assigns actual URLs to each button:

**Rule: btn1 ALWAYS gets the page URL. btn2 gets the social URL if the text matches.**

`resolveCtaUrl(btnText)` maps button text to URLs via keyword matching:

| Keywords in btn2 text | Resolves to |
|----------------------|-------------|
| watch, play, video, subscribe, channel | YouTube embed watchUrl → socialLinks.youtube |
| instagram, follow | socialLinks.instagram |
| tweet, thread, twitter | socialLinks.twitter |
| facebook, like page | socialLinks.facebook |
| tiktok | socialLinks.tiktok |
| pin, pinterest | socialLinks.pinterest |
| listen, episode, podcast | socialLinks.spotify → socialLinks.podcast |
| reddit, discussion, upvote | socialLinks.reddit |
| (no match) | Page URL (fallback) |

**Corner case:** "Follow Us" could match Instagram OR other platforms. Currently matches Instagram first due to regex order.

**Corner case:** YouTube embedded videos provide a `watchUrl` (e.g., `https://youtube.com/watch?v=xxx`) extracted from the iframe `src`. This is preferred over a generic YouTube channel link from `socialLinks.youtube`.

**Step 7: Fallback Chain**

When Gemini fails entirely (network error, deprecated model, quota exceeded, invalid JSON):

```
Gemini success → validate → ensure social → return
       ↓ (fail)
fallbackCta(text, pageType, socialLinks, embeddedVideos)
  1. Get content pairs from CTA_BY_PAGE_TYPE[pageType]
     e.g., article → ["Read Now / Save for Later", "Read Article / Bookmark"]
     video_course → ["Watch Course / Start Learning", "Watch Now / Save for Later"]
  2. If no social links → return content pairs as-is
  3. If social links exist:
     - Option 1: pure content (btn1 + btn2 both content)
     - Option 2: btn1=content, btn2=top social (YouTube > Instagram > ...)
     - Option 3: btn1=content, btn2=second social (if available)
  4. If pageType unknown → generic: "Check It Out / Learn More"
```

**LinkedIn is excluded at every level** — `getSocialPlatforms()` deletes it, Gemini prompt says "Do NOT use LinkedIn", fallback skips it. Reason: LinkedIn is not a useful CTA target for push notifications.

### Social Platform Priority

Hardcoded priority order (higher number = picked first):

| Platform | Priority | btn2 Label | Rationale |
|----------|----------|------------|-----------|
| YouTube | 10 | Watch Video | Highest engagement, video content |
| Instagram | 9 | Follow Us | Visual, high engagement |
| Facebook | 7 | Visit Facebook | Large audience |
| Twitter/X | 6 | See on X | News/updates |
| TikTok | 5 | Watch on TikTok | Growing, video |
| Spotify | 4 | Listen Now | Audio content |
| Podcast | 4 | Listen Now | Audio content |
| Pinterest | 3 | View Pin | Visual discovery |
| Reddit | 2 | Join Discussion | Niche communities |
| LinkedIn | excluded | — | Not useful for push CTAs |

### AI Insights (`generateInsights`)

Separate Gemini call, used in the Insights screen. Cached 7 days in `chrome.storage.local`.

**Input:** Account metrics (plan, subscribers, campaigns sent, CTR, segments, automations, etc.)
**Output:** 3-5 JSON objects with `title`, `description`, `action`, `priority`
**Actions mapped to UI:** `send_campaign`, `create_segment`, `setup_drip`, `ab_test`, `open_dashboard`, `upgrade_plan`

**Corner case:** If the account has no campaigns or subscribers, the insights focus on growth. If active, they focus on optimization. This is prompt-driven, not code-driven.

### AI Function Reference

| Function | Location | Purpose |
|----------|----------|---------|
| `callGemini(prompt)` | ai.js:25 | Low-level Gemini API call |
| `parseGeminiJson(text)` | ai.js:48 | Robust JSON parser for Gemini output |
| `generateCtaButtons(...)` | ai.js:208 | CTA generation orchestrator |
| `ensureSocialCta(ctas, ...)` | ai.js:282 | Post-processing social guarantee |
| `fallbackCta(text, pageType, ...)` | ai.js:142 | Rule-based CTA fallback |
| `resolveCtaUrl(btnText, ...)` | ai.js:169 | Maps btn text → social URL |
| `enrichCtasWithUrls(ctas, ...)` | ai.js:200 | Attaches URLs (btn1=page, btn2=social) |
| `generateNotificationCopy(pageData)` | ai.js:300 | Main orchestrator (PE API + Gemini) |
| `generateInsights(accountData)` | ai.js:373 | AI insights for analytics screen |
| `suggestSegmentName(url, names)` | ai.js:356 | Segment name suggestions |
| `getSocialPlatforms(links, videos)` | ai.js:129 | Priority-sorted social platforms |
| `sanitizePageData(data)` | sanitize.js:35 | Whitelist + validate page data fields |
| `detectPageType(url)` | content.js:189 | URL + DOM based page type detection |
| `findSocialLinks()` | content.js:214 | Scans page `<a>` elements for social URLs |
| `findEmbeddedVideos()` | content.js:130 | Finds YouTube iframes, Vimeo, HTML5 video |
| `buildAccountContext()` | recommendations.js:203 | Extracts account state for JTBD scoring |
| `scoreRecommendations(ctx)` | recommendations.js:264 | Returns top 4 recommendations by impact |
| `generateRecommendationCopy(...)` | recommendations.js:311 | AI copy with 7-day cache |
| `getRecommendations(forceRefresh)` | recommendations.js:359 | Public API combining context + scoring + AI |

### AI Known Issues & Technical Debt

**Must Fix Before Production:**
1. **Gemini API key hardcoded** — Must proxy through backend
2. **Model deprecation** — No remote config for model name. Extension update required to change models
3. **No rate limiting on Gemini** — Spam-clicking "AI Write" could burn quota. Add client-side throttle (max 5 calls/min)

**Should Fix:**
4. **Three separate API calls** — A single unified endpoint (`POST /sites/:id/generative-ai/campaign-copy`) would save tokens, produce coherent copy, and remove Gemini dependency
5. **"Follow Us" ambiguity** — Resolves to Instagram by default. Fix: include platform name in CTA label or add `platform` field
6. **Tone parameter only affects PE API** — CTAs don't respect tone. Fix: append tone to Gemini prompt
7. **Language parameter unused** — CTAs are always English. Fix: add language instruction to Gemini prompt

**Nice to Have:**
8. **CTA A/B data** — Track which CTA labels get more clicks
9. **Custom social priority** — Let customers reorder platform priority
10. **Content-specific CTA templates** — For WooCommerce, auto-detect price for "Get 20% Off" CTAs

### AI Testing Checklist

**CTA Generation:**
- [ ] Blog/article page with no social links → content CTAs only
- [ ] Blog page with YouTube + Instagram links → Option 1 pure content, Options 2-3 have social btn2
- [ ] YouTube video page → "Watch Now / Subscribe" style CTAs
- [ ] Product page with JSON-LD → "Shop Now / Add to Cart"
- [ ] Page with only LinkedIn links → LinkedIn excluded, pure content CTAs
- [ ] Page with embedded YouTube iframe (no social links in `<a>` tags) → still detects YouTube
- [ ] Gemini returns code-fenced JSON → parsed correctly
- [ ] Gemini returns object-wrapped array → extracted correctly
- [ ] Gemini returns empty response → falls back gracefully
- [ ] Gemini model deprecated → falls back with console.warn, no user-facing error
- [ ] Gemini returns all-generic CTAs despite social links → `ensureSocialCta` injects social btn2
- [ ] btn1 URL is always page URL, never social URL
- [ ] btn2 URL resolves to correct social platform URL

**Title/Message Generation:**
- [ ] PE API returns 3 titles + 3 messages → all 3 options populated
- [ ] PE API fails but Gemini succeeds → CTA buttons shown, title/message show error
- [ ] Both PE API and Gemini fail → error toast shown
- [ ] Tone selector changes → affects PE API titles/messages on regenerate
- [ ] Feedback text → appended to description for PE API

**Insights:**
- [ ] Fresh account (no campaigns) → growth-focused insights
- [ ] Active account → optimization insights
- [ ] Cached insights (< 7 days) → served from cache, no API call
- [ ] Cache expired → fresh Gemini call
- [ ] Gemini fails → graceful error in insights panel

**Video Course & JTBD Recommendations:**
- [ ] Video course page (e.g., videos.wpbeginner.com/courses/...) → "Watch Course / Start Learning" CTAs
- [ ] Page with /tutorials/ path → detected as video_course
- [ ] JTBD recommendations render up to 4 cards with priority coloring
- [ ] Fresh account → activation recommendations (setup_optin, send_first_campaign)
- [ ] Active paid account → optimization recommendations
- [ ] Refresh button regenerates AI copy for recommendations

## Feature Detection APIs

These endpoints detect whether a feature is active on the account. Used by Quick Wins to generate data-driven recommendations.

| Feature | Endpoint | Detection Field |
|---------|----------|-----------------|
| Chat Widget | `GET /sites/:id/chat-widgets` | `total > 0` and `status === 'enabled'` |
| Drip Autoresponders | `GET /sites/:id/automation/drips` | Filter by `drip_type` ('welcome' or 'generic'), check `status === 'active'` |
| Triggered Campaigns | `GET /sites/:id/automation/triggers` | Filter by `campaign_type`: 'generic' (cart), 'browse', 'price_drop', 'inventory' |
| A/B Tests | `GET /sites/:id/notifications?type=ab` | `data.length > 0` means A/B tests exist |
| RSS Auto Push | `GET /sites/:id/automation/rss-feeds` | `total > 0` |
| Goal Tracking | `GET /sites/:id/settings?name=notification_analytics` | `notification_analytics.result.enabled === true` |
| Mobile App Push | `GET /sites/:id/settings/android_options` + `ios_options` | Non-empty config objects |
| WhatsApp Business | `GET /sites/:id/integration-credentials/whatsapp` | `wa_business_id`, `phone_number_id`, `access_token` all non-empty |
| Opt-in Popup | `GET /sites/:id/settings?name=optin_settings` | `activeOptin.https.types.length > 0` |
| Welcome Notification | `GET /sites/:id/installation-details` | `welcome_notification === true` |

### Plan-Feature Gating (from repo)

| Feature | Free | Business | Premium | Growth | Enterprise |
|---------|------|----------|---------|--------|------------|
| Push Broadcasts | Yes | Yes | Yes | Yes | Yes |
| Segments | -- | Yes | Yes | Yes | Yes |
| Action Buttons | -- | Yes | Yes | Yes | Yes |
| Scheduled Send | -- | Yes | Yes | Yes | Yes |
| RSS Auto Push | -- | Yes | Yes | Yes | Yes |
| Opt-in Analytics | -- | Yes | Yes | Yes | Yes |
| A/B Testing | -- | -- | Yes | Yes | Yes |
| Drip Autoresponder | -- | -- | Yes | Yes | Yes |
| Timezone Delivery | -- | -- | Yes | Yes | Yes |
| Goal Tracking | -- | -- | Yes | Yes | Yes |
| Triggered Campaigns | -- | -- | -- | Yes | Yes |
| Cart Abandonment | -- | -- | -- | Yes | Yes |
| WhatsApp Cart Abandonment | -- | -- | -- | Yes | Yes |
| Chat Widget (basic) | Yes | Yes | Yes | Yes | Yes |
| Chat Widget (multi-channel, agents) | -- | Yes | Yes | Yes | Yes |
| Chat Widget (triggers, timezone, multi-widget) | -- | -- | Yes | Yes | Yes |
| Mobile App Push | Yes (sub-gated) | Yes | Yes | Yes | Yes |

## Permission Gating

Permissions come from `user.owner.permissions` in `GET /sites/:id`:

| Permission Path | Feature |
|-----------------|---------|
| `permissions.segments` | Segment targeting in compose |
| `permissions.notifications.schedule` | Schedule send |
| `permissions.notifications.multi_action_btn` | Action buttons |
| `permissions.notifications.timezone` | Subscriber timezone send |
| `permissions.notifications.ab` | A/B testing |
| `permissions.image_library` | Image library access |

Plan-derived features (not in permissions object):
- **Large image**: Any paid plan (plan name ≠ 'free')
- **Goal tracking**: Premium or Enterprise plans

## State Management

Central store in `state.js` with event-driven updates:

| Key | Type | Set By |
|-----|------|--------|
| `token` | string | auth.js (login/restore) |
| `user` | object | auth.js |
| `sites` | array | auth.js |
| `activeSiteId` | number | auth.js (selectSite) |
| `siteDetails` | object | auth.js (selectSite) |
| `permissions` | object | auth.js (from API) |
| `planInfo` | object | auth.js (from paymentSubscription) |
| `pageData` | object | compose.js (fetchPageData) |
| `segmentsList` | array | auth.js (selectSite) |
| `aiCreditsRemaining` | number | auth.js (selectSite) |
| `currentScreen` | string | popup.js (routing) |
| `compose.*` | nested | compose.js (form state) |

## Chrome Storage Keys

| Key | Purpose | TTL |
|-----|---------|-----|
| `pe_session` | Encrypted token + user + site ID | Persistent |
| `pe-token-key` | AES-GCM encryption key (base64) | Persistent |
| `pe_pending_auth` | Token from dashboard login flow | 5 minutes |
| `pe_settings` | User settings (auto-extract, UTM defaults) | Persistent |
| `pe_compose_prefs` | Saved compose preferences (UTM, buttons, schedule) | Persistent |
| `pe_compose_draft_{siteId}` | Auto-saved compose form state (debounced 1.5s) | 24 hours |
| `pe_last_activity` | Timestamp of last user activity for session timeout | Persistent |
| `pe_ai_insights` | Cached AI insights per site | 7 days |
| `pe_jtbd_recommendations` | Cached AI recommendation copy per site | 7 days |

## Boot Sequence

```
DOMContentLoaded
  → initLogin() (wire up login button)
  → Check pe_pending_auth (from background login while popup was closed)
  → Check dashboard tab for fresh token (handles account switches)
  → restoreSession() from chrome.storage.local
  → tryAutoLoginFromDashboard() (last resort)
  → showScreen('login') if all fail

bootApp() (after successful auth):
  → setState('currentScreen', 'compose')
  → initHeader()
  → fetchPageData() ← runs FIRST (segments + compose need it)
  → Promise.allSettled([initCompose(), initInsights(), initSegments(), initSettings()])
```

## Session & Draft Persistence

### Session Timeout (Security)
- **TTL**: 6 hours — sessions expire after 6 hours regardless of activity
- **Inactivity timeout**: 6 hours of no popup opens → session cleared
- **Tracking**: `pe_last_activity` updated on every popup open
- **Background check**: Chrome alarm runs every 30 minutes to check session age
- **On expiry**: Session cleared, badge set to "!" (red), next popup open shows login
- **On login**: Activity timestamp reset, badge cleared

### Compose Draft Auto-Save
- **Trigger**: All form field changes (debounced 1.5 seconds)
- **Scope**: Per-site per-URL (`pe_compose_draft_{siteId}_{urlHash}`)
- **TTL**: 24 hours — stale drafts auto-deleted
- **Restore logic**: URL-scoped key, so only restores for the exact same page. Old page drafts cleaned up on navigate.
- **Cleared on**: Successful send or draft save to API
- **Fields saved**: Title, message, URL, big image, segments, action buttons, UTM (all 5), schedule, timezone

## Security

- **Token encryption**: AES-GCM with per-installation key
- **Session expiry**: 6-hour TTL with inactivity tracking (see above)
- **No innerHTML**: All user/page data rendered via `textContent`
- **HTML escaping**: `escapeHtml()` in sanitize.js
- **URL validation**: HTTP/HTTPS only, `sanitizeImageUrl()` for image URLs
- **CSP**: `script-src 'self'; object-src 'none'`
- **Minimal permissions**: `activeTab`, `tabs`, `scripting`, `storage`, `alarms`
- **Gemini key**: Internal dev use only — not customer-facing. Must be proxied through backend before production release.

## File Summary

| File | Lines | Role |
|------|-------|------|
| popup.js | 242 | Entry point, routing, auth flow |
| popup.html | ~2200 | All UI + inline CSS |
| background.js | 160 | Service worker, keyboard shortcuts, auth capture |
| content.js | 118 | Page data extraction |
| modules/compose.js | ~1100 | Campaign creation (largest module) |
| modules/insights.js | ~188 | Health snapshot + JTBD recommendation rendering |
| modules/segments.js | ~470 | Segment management |
| modules/header.js | ~370 | Navigation, site selector, contextual nudge |
| modules/ai.js | ~405 | AI integration (PE + Gemini) |
| modules/recommendations.js | ~382 | JTBD engine — catalog, scoring, AI copy generation |
| modules/auth.js | ~200 | Authentication, session, site selection |
| modules/api.js | ~120 | HTTP client |
| modules/permissions.js | ~110 | Feature gating |
| modules/state.js | ~80 | State store |
| modules/modal.js | ~65 | Dialogs |
| modules/accordion.js | ~65 | Expandable sections |
| modules/sanitize.js | ~50 | Security helpers |
| modules/safeguards.js | ~40 | Rate limiting |
| modules/settings.js | ~60 | Settings panel |
| styles/theme.css | ~100 | Design tokens |

## Known Gaps & TODOs

1. **Subscriber count**: No API endpoint returns total subscriber count. Currently shows plan limit. Need a `GET /sites/:id/subscriber-count` endpoint.
2. **Unified AI endpoint**: Replace 3 separate text-generation calls with one campaign-copy endpoint (see AI Architecture section).
3. **Gemini API key**: Hardcoded for dev. Must be proxied through PE backend before production.
4. **Analytics caching**: Insights data refetches every screen visit. Could cache 5 minutes.
5. **A/B testing**: Permission exists but no UI for creating A/B variants yet.
6. **Drip campaigns**: Quick wins reference drip but no creation flow in extension.
7. **Image library**: Permission flag exists but no picker UI — only URL input and page extraction.
8. **Video/course page type**: Added video_course detection for URLs with /courses/, /lessons/, /tutorials/, or videos.* subdomain. CTA buttons now context-aware ("Watch Course" not "Read Now").

## Deployment

The extension is loaded unpacked from `~/Desktop/pushengage-extension-fresh/`. Changes are synced via:
```bash
rsync -av --delete "/path/to/Campaign Creater/" ~/Desktop/pushengage-extension-fresh/
```
Then reload in `chrome://extensions/`.
