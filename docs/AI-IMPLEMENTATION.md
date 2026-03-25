# AI Implementation Guide

> **SECURITY WARNING:** The Gemini API key is **hardcoded** in `modules/ai.js` line 21. Acceptable for internal beta with Google Cloud restrictions (HTTP referrer + 1000 req/day quota). MUST be proxied through `POST /sites/:id/generative-ai/campaign-copy` backend endpoint before production release. See "API Key Situation" section below.

> **For the Engineering Team** | Critical reference for maintaining and evolving the AI features

**Last Updated:** 2026-03-21 | **Files:** `modules/ai.js` (~415 lines), `modules/recommendations.js` (~382 lines)

---

## Architecture Overview

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

### Other AI Uses

| Feature | Provider | Endpoint/Model | Credits? |
|---------|----------|----------------|----------|
| Campaign titles (x3) | PushEngage API | `text-generation` type=notification_title | Yes |
| Campaign messages (x3) | PushEngage API | `text-generation` type=notification_message | Yes |
| CTA button labels (x3 pairs) | Gemini 2.5 Flash | `generateContent` | No |
| AI Insights (3-5 recommendations) | Gemini 2.5 Flash | `generateContent` | No |
| Segment name suggestions (x3) | PushEngage API | `text-generation` type=notification_title (reused) | Yes |
| JTBD recommendation copy (x4) | Gemini 2.5 Flash (via ai.js) | `generateContent` | No |

---

## Gemini Integration Details

### Model & Configuration

```javascript
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

// Generation config
{
  temperature: 0.4,          // Deterministic for structured JSON output
  maxOutputTokens: 400,      // Reduced from 2048 — covers all outputs with 43% margin
  responseMimeType: 'application/json'  // Structured JSON output
}
```

### Performance Optimizations (March 2026)

- **maxOutputTokens reduced** from 2048 to 400 — all Gemini outputs are small JSON arrays (50-280 tokens)
- **CTA prompt trimmed ~30%** — removed verbose examples Gemini already knows, kept e-commerce edge cases
- **In-memory CTA cache** — same page produces same CTAs within a popup session (keyed by description+pageType+count)
- **In-memory insights cache** — prevents re-generation on tab switches (single-entry session cache)
- **Estimated AI cost reduction:** ~50-60% per session

### CRITICAL: API Key Situation

**Current state:** The Gemini API key is **hardcoded** in `ai.js` line 21. Acceptable for internal beta.

```javascript
const GEMINI_KEY = 'AIzaSyDA2hyKObcR-aryNAPciXWpDfz6HuUeIiY';
```

**Current protections applied:**
- Google Cloud Console: HTTP referrer restriction (`chrome-extension://*`)
- Google Cloud Console: Daily quota limit (1000 requests/day)
- Key visible ONLY to team members who inspect extension source
- Push notification recipients CANNOT see or access the key

**Before production release, this MUST be:**
1. Moved to `POST /sites/:id/generative-ai/campaign-copy` backend endpoint (see TODO in ai.js lines 8-15)
2. This eliminates Gemini dependency entirely — uses PushEngage AI credits instead
3. The current key is for **internal beta only**

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

---

## CTA Generation: The Full Pipeline

This is the most complex AI feature. Here's every step, every edge case.

### Step 1: Page Data Extraction (`content.js`)

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

### Step 2: Sanitization (`sanitize.js`)

`sanitizePageData()` was a critical bug source — it originally **stripped** all AI-relevant fields (pageType, socialLinks, embeddedVideos). Now it passes them through with validation:

- `socialLinks`: Each URL validated via `sanitizeUrl()` (HTTP/HTTPS only)
- `embeddedVideos`: Sliced to 5 max, URLs validated, titles truncated to 100 chars
- `pageType`: String, max 50 chars
- `productInfo`: All fields string-cast and truncated

**If you add new fields to content.js, you MUST also add them to `sanitizePageData()` or they will be silently dropped.**

**CTA_BY_PAGE_TYPE reference note:** `video_course` has been added: `video_course → ["Watch Course / Start Learning", "Watch Now / Save for Later"]`

### Step 3: Gemini Prompt Construction

The prompt is built dynamically based on what's available:

```
Generate 3 pairs of CTA button labels for a push notification about this content:
"[title — description — url, truncated to 300 chars]"

Context:
Page type: article
Social media links on page: youtube: https://..., instagram: https://...
Embedded videos: youtube: "Video Title" → https://youtube.com/watch?v=...

IMPORTANT RULES about btn1 vs btn2:
- btn1 is ALWAYS the page's primary action (blog, product, article URL)
- btn2 is the secondary action. For 1-2 pairs, btn2 SHOULD be social
- NEVER put social media actions in btn1
- Do NOT use LinkedIn. Prioritize: YouTube > Instagram > Facebook > Twitter
- Pair 1: btn1=page action, btn2=page secondary
- Pair 2: btn1=page action, btn2=social action
- Pair 3: btn1=page action, btn2=different social OR content secondary

Rules:
- btn1 = primary page action (2-4 words)
- btn2 = secondary action (2-3 words)
- Keep labels under 20 characters each
- Be SPECIFIC: "Book Flights" not "Learn More"
- NEVER use generic labels when specific content exists

Return JSON array: [{"btn1":"...","btn2":"..."}]
```

**The social mandate section is only included when social links or embedded videos exist.** Without it, the prompt is simpler and focused on content-type CTAs.

### Step 4: Gemini Response Parsing

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

### Step 5: Validation & Post-Processing

After parsing, results are validated:

```javascript
let valid = result
  .filter(item => item && typeof item.btn1 === 'string' && item.btn1.trim())
  .map(item => ({
    btn1: item.btn1.trim().substring(0, 25),    // Hard cap at 25 chars
    btn2: (item.btn2 || '').trim().substring(0, 25) || 'Learn More'
  }));
```

**Then `ensureSocialCta()` runs** — this is the safety net:

1. Scans all btn2 values for social keywords (watch, video, follow, subscribe, etc.)
2. If **none** contain social keywords AND social links exist on the page:
   - Replaces the **last** pair's btn2 with the highest-priority social CTA
   - e.g., YouTube found → last option gets `btn2: "Watch Video"`

**This guarantees at least 1 social CTA when social links exist, even if Gemini ignores the prompt instructions.**

### Step 6: URL Resolution

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

**Corner case:** "Follow Us" could match Instagram OR other platforms. Currently matches Instagram first due to regex order. If multiple platforms have "follow" semantics, Instagram wins.

**Corner case:** YouTube embedded videos provide a `watchUrl` (e.g., `https://youtube.com/watch?v=xxx`) extracted from the iframe `src`. This is preferred over a generic YouTube channel link from `socialLinks.youtube`.

### Step 7: Fallback Chain

When Gemini fails entirely (network error, deprecated model, quota exceeded, invalid JSON):

```
Gemini success → validate → ensure social → return
       ↓ (fail)
fallbackCta(text, pageType, socialLinks, embeddedVideos)
  1. Get content pairs from CTA_BY_PAGE_TYPE[pageType]
     e.g., article → ["Read Now / Save for Later", "Read Article / Bookmark"]
  2. If no social links → return content pairs as-is
  3. If social links exist:
     - Option 1: pure content (btn1 + btn2 both content)
     - Option 2: btn1=content, btn2=top social (YouTube > Instagram > ...)
     - Option 3: btn1=content, btn2=second social (if available)
  4. If pageType unknown → generic: "Check It Out / Learn More"
```

**LinkedIn is excluded at every level** — `getSocialPlatforms()` deletes it, Gemini prompt says "Do NOT use LinkedIn", fallback skips it. Reason: LinkedIn is not a useful CTA target for push notifications.

---

## Social Platform Priority

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

---

## AI Insights (`generateInsights`)

Separate Gemini call, used in the Insights screen. Cached 7 days in `chrome.storage.local`.

**Input:** Account metrics (plan, subscribers, campaigns sent, CTR, segments, automations, etc.)

**Output:** 3-5 JSON objects with `title`, `description`, `action`, `priority`

**Actions mapped to UI:** `send_campaign`, `create_segment`, `setup_drip`, `ab_test`, `open_dashboard`, `upgrade_plan`

**Corner case:** If the account has no campaigns or subscribers, the insights focus on growth. If active, they focus on optimization. This is prompt-driven, not code-driven.

---

## JTBD Recommendation Engine (`modules/recommendations.js`)

A separate AI feature that detects account state and generates personalized recommendations with AI-powered copy.

### Architecture

```
buildAccountContext() → scoreRecommendations(ctx) → generateRecommendationCopy() → merge
        ↓                      ↓                          ↓                        ↓
  API + state data      Top 4 by impact          Gemini AI copy (7d cache)    Fallback text
```

### How It Works

1. **Account Context**: Extracts subscriber count, campaign history (last 20), avg CTR, revenue, segment health, plan info, feature flags (chat widget, drip, etc.) from state + one API call
2. **Detection**: 14-entry catalog evaluates `detect(ctx) → boolean` for each recommendation
3. **Scoring**: Matching recommendations sorted by `impact` score (0-100), top 4 selected
4. **AI Copy**: Gemini generates personalized titles (<50 chars) and descriptions (<120 chars) using actual account numbers
5. **Merge**: AI copy overlaid on recommendations; fallback static text if AI fails

### Recommendation Catalog (14 entries)

| ID | Category | Impact | Detect Condition |
|----|----------|--------|-----------------|
| setup_optin | activation | 98 | subscriberCount === 0 |
| send_first_campaign | activation | 95 | campaignCount === 0 && subscriberCount > 0 |
| ab_test_low_ctr | optimization | 80 | avgCtr < 3% && 3+ campaigns && has A/B permission |
| reengage_inactive | optimization | 75 | 7+ days since last campaign |
| upsell_segments | upsell | 70 | No segment permission && 500+ subscribers |
| dormant_segments | optimization | 65 | Segments with 500+ subs not targeted recently |
| upsell_ab_testing | upsell | 65 | No A/B permission && CTR < 4% |
| add_chat_widget | multichannel | 60 | No chat widget configured |
| setup_drip | multichannel | 58 | No drip && 100+ subscribers |
| increase_frequency | optimization | 55 | <8 campaigns/month but active |
| upsell_goal_tracking | upsell | 55 | No goal tracking && 3+ campaigns |
| celebrate_high_ctr | optimization | 50 | CTR >= 5% |
| schedule_peak_hours | optimization | 45 | 5+ campaigns && has schedule permission |
| clean_empty_segments | optimization | 40 | Segments with 0 subscribers |

### Caching Strategy

- **Key**: `pe_jtbd_recommendations` in `chrome.storage.local`
- **TTL**: 7 days
- **Scope**: Per siteId + sorted recommendation IDs
- **Invalidation**: `forceRefresh` flag (Refresh button in UI) or TTL expiry
- **What's cached**: AI-generated copy only. Detection + scoring runs fresh each time.

### AI Prompt Structure

The prompt includes:
- Account data: plan, subscribers, campaigns, CTR, revenue, days since last, segments
- Recommendation list with IDs, categories, and fallback titles
- Rules: use actual numbers, be encouraging, keep title <50 chars, description <120 chars
- Output: JSON array `[{id, title, description}]`

### Integration with Insights Page

`getRecommendations(forceRefresh)` is the public API called by `insights.js`:
1. Builds context → scores → generates AI copy
2. Merges AI copy into recommendation objects (with `aiGenerated: boolean` flag)
3. Each recommendation has: `title`, `description`, `btnText`, `actionType` ('screen' | 'url'), `actionTarget`
4. Insights page renders as cards with priority coloring (score >= 70: blue, >= 50: gold, < 50: gray)

---

## Known Issues & Technical Debt

### Must Fix Before Production

1. **Gemini API key hardcoded** — Must proxy through backend. See "API Key Situation" above.
2. **Model deprecation** — No remote config for model name. Extension update required to change models.
3. **No rate limiting on Gemini** — A user spam-clicking "AI Write" could burn through quota. Add client-side throttle (e.g., max 5 calls per minute).

### Should Fix

4. **Three separate API calls** — Title, message, CTA are generated independently. A single unified endpoint (`POST /sites/:id/generative-ai/campaign-copy`) would:
   - Save tokens (1 call vs 3)
   - Produce more coherent copy (title + message + CTA generated together)
   - Remove Gemini dependency entirely
   - Proposed schema: `{ description, tone?, language?, count: 3 }` → `{ suggestions: [{ title, message, btn1, btn2 }] }`

5. **"Follow Us" ambiguity** — resolves to Instagram by default even when the btn2 was meant for Facebook. Fix: include platform name in the CTA label or use a separate `platform` field in the CTA object.

6. **Tone parameter only affects PE API** — The `tone` selector (Urgent, Friendly, etc.) is passed to PE API for titles/messages but NOT to the Gemini CTA prompt. CTAs don't respect tone. Fix: append tone to Gemini prompt.

7. **Language parameter unused** — `language` is accepted but not passed to Gemini. CTAs are always English. Fix: add language instruction to Gemini prompt.

### Nice to Have

8. **CTA A/B data** — Track which CTA labels get more clicks to improve fallback rankings over time.
9. **Custom social priority** — Let customers reorder social platform priority in settings.
10. **Content-specific CTA templates** — For WooCommerce products, auto-detect price and generate "Get 20% Off" style CTAs.
11. **Recommendation detection is binary** — Each recommendation either fires or doesn't. Future: weighted detection that considers "how badly" the user needs this (e.g., CTR 2.9% vs 0.5% should produce different urgency).

---

## Testing Checklist

When modifying AI code, verify these scenarios:

### CTA Generation
- [ ] Blog/article page with no social links → content CTAs only ("Read Now / Save for Later")
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

### Title/Message Generation
- [ ] PE API returns 3 titles + 3 messages → all 3 options populated
- [ ] PE API fails but Gemini succeeds → CTA buttons shown, title/message show error
- [ ] Both PE API and Gemini fail → error toast shown
- [ ] Tone selector changes → affects PE API titles/messages on regenerate
- [ ] Feedback text → appended to description for PE API

### JTBD Recommendations
- [ ] Fresh account (0 subs, 0 campaigns) → setup_optin + send_first_campaign + add_chat_widget
- [ ] Active account with low CTR → ab_test_low_ctr recommendation shown
- [ ] Free plan with 500+ subs → upsell_segments recommendation
- [ ] AI copy uses actual account numbers (e.g., "Your 2.1% CTR")
- [ ] Cached copy served on revisit (< 7 days)
- [ ] Refresh button clears cache and regenerates
- [ ] AI failure → fallback static text shown (no error visible to user)
- [ ] Recommendations respect permission gates (A/B test only if canWriteAbTest())

### Insights
- [ ] Fresh account (no campaigns) → growth-focused insights
- [ ] Active account → optimization insights
- [ ] Cached insights (< 7 days) → served from cache, no API call
- [ ] Cache expired → fresh Gemini call
- [ ] Gemini fails → graceful error in insights panel

---

## File Quick Reference

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
| `generateInsightsRaw(prompt)` | ai.js (new export) | Raw Gemini call for recommendation engine |
