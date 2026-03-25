# PushEngage Campaign Creator Chrome Extension — v2 Design

**Date:** 2026-03-20
**Status:** Approved for implementation planning
**Goal:** Make it faster and easier to run campaigns on the go without spending time on the dashboard

---

## Product Context

### What This Is
A Chrome extension that lets any PushEngage customer create and send push notification campaigns directly from the page they're browsing. Open the extension, see a pre-filled campaign, tweak if needed, hit Send.

### What This Is Not
- Not a replacement for the PushEngage dashboard
- Not a full campaign management tool
- Advanced features (A/B testing, recurring schedules, audience groups, mobile push settings, multi-site sending, goal tracking setup) stay in the dashboard

### Target Users
All PushEngage customers — from first-time users to power users. The extension must be approachable enough for beginners and fast enough for daily senders.

### Business Goals
1. **Reduce friction** — more customers actually send campaigns (activation/engagement)
2. **Showcase the product** — lightweight entry point that demonstrates PushEngage capabilities
3. **Differentiation** — unique feature competitors don't have

### Constraints
- Secure and lightweight for browsers
- Uses Adonis API (`/d/v1/`) for auth, campaigns, segments, analytics
- AI features powered by PushEngage AI credits (sold as part of the plan, not user-provided keys)
- No new backend endpoints required — works with existing API surface
- Must respect plan-level permissions and feature gates server-side

---

## Architecture

### Tech Stack
- Chrome Extension Manifest V3
- Vanilla JS (no framework) — keeps bundle small
- Adonis API for all backend communication
- JWT auth (Bearer token from `/d/v1/auth/login`)

### Core Files
- `manifest.json` — extension config, permissions
- `popup.html` — single-page UI
- `popup.js` — all interaction logic (to be modularized into modules/)
- `content.js` — page data extraction (title, meta, images, URL)
- `background.js` — service worker, message routing

### API Base
`https://dashboard-public-api.pushengage.com/d/v1/`

All requests authenticated with `Authorization: Bearer {jwt_token}` header.

---

## Screens & Navigation

```
Login → Compose (main) ←→ Insights
                        ←→ Segment Manager
                        ←→ Settings
```

### Screen Map

| Screen | Access | Purpose |
|--------|--------|---------|
| **Login** | On first use / logged out | JWT auth via Adonis API |
| **Compose** | Default screen | Pre-filled campaign, send in one click |
| **Insights** | User menu → Insights | Performance stats, JTBD nudges |
| **Segment Manager** | User menu → Segment Manager | Create/update segments from current page URL |
| **Settings** | User menu → Settings | Auto-extract toggle, default UTM values |

---

## Screen 1: Login

Simple email/password form. Authenticates against `POST /d/v1/auth/login`.

```
┌──────────────────────────────────┐
│                                  │
│        [PushEngage Logo]         │
│                                  │
│  Email                           │
│  [________________________]      │
│                                  │
│  Password                        │
│  [________________________]      │
│                                  │
│  [=======Log In=========]       │
│                                  │
│  ──── or ────                    │
│                                  │
│  [G] Continue with Google        │
│                                  │
│  Don't have an account?          │
│  Sign up at pushengage.com ↗     │
│                                  │
└──────────────────────────────────┘
```

**Post-login flow:**
1. API returns JWT token + user data + site list
2. If 1 site → auto-select, go to Compose
3. If 2+ sites → show site picker, then Compose
4. Token stored encrypted in `chrome.storage.local`
5. Permissions and plan data cached in memory

---

## Screen 2: Compose (Main Screen)

Single screen. Everything visible. Pre-filled from page. One tap to send.

### Layout

```
┌──────────────────────────────────┐
│ HEADER                           │
│ [PE Logo]  [MySite.com ▾] [👤 ▾]│
│    Last: 1.2K sent · 4.1% CTR   │
│    (click to expand stats)       │
├──────────────────────────────────┤
│ COMPOSE ZONE                     │
│                                  │
│ Title ✨  [Pre-filled_________]  │
│            85 char max    42/85  │
│                                  │
│ Message ✨[Pre-filled_________]  │
│            135 char max  89/135  │
│                                  │
│ URL       [Pre-filled_________]  │
│                                  │
│ ┌────────┐ ┌──────────────────┐  │
│ │ Icon   │ │  Featured Image  │  │
│ │(site   │ │  (from page)     │  │
│ │default)│ │  Change · Remove │  │
│ └────────┘ └──────────────────┘  │
├──────────────────────────────────┤
│ OPTIONS (accordions)             │
│                                  │
│ ▸ Segments         [All Subs]   │
│ ▸ Action Buttons                │
│ ▸ UTM Parameters                │
│ ▸ Schedule         [Send Now]   │
├──────────────────────────────────┤
│ ACTION BAR (sticky bottom)       │
│                                  │
│ [Save Draft]  [===Send Now===]   │
│        Open in Dashboard ↗       │
└──────────────────────────────────┘
```

### Header

**Site selector dropdown:**
```
┌─────────────────┐
│ ● MySite.com    │  ← active
│   Blog.co       │
│   Store.io      │
│ ─────────────── │
│ + Add Site ↗    │  → opens dashboard
└─────────────────┘
```
Switching sites refreshes segments, stats, permissions, and plan data.

**User menu dropdown (Droplr-style):**
```
┌──────────────────────┐
│ user@email.com       │
│ Site: MySite.com     │
│ ──────────────────── │
│ 📊 Your Dashboard ↗  │
│ 📈 Insights           │
│ 🏷️ Segment Manager   │
│ ⚙️ Settings           │
│ Logout (red)         │
│ ──────────────────── │
│ v2.0.0               │
└──────────────────────┘
```

**Stats ticker** — one-line summary of last campaign. Click expands to:
```
┌──────────────────────────────────┐
│ Plan: Growth · Resets Apr 1      │
│                                  │
│ Notifications                    │
│ ████████████████░░░░ 38.2K / 50K │
│                                  │
│ AI Credits                       │
│ ██████░░░░░░░░░░░░░░  142 / 500  │
└──────────────────────────────────┘
```

### Compose Zone

**Pre-fill behavior on extension open:**
1. `content.js` extracts page title, meta description, canonical URL, OG image / featured image
2. Title → `notification_title` (trimmed to 85 chars)
3. Description → `notification_message` (trimmed to 135 chars)
4. URL → `notification_url`
5. OG image or first large image → `big_image` (featured image preview)
6. Site default icon → `notification_image` (from site settings API)

**AI suggestions (✨ button):**
- Costs 1 AI credit per use
- Generates 3 alternative titles or messages
- Shown as clickable chips below the field
- Click a chip to replace field content
- Hidden if plan has no AI credits or credits exhausted
- Greyed out with "Credits used up · Upgrade ↗" if exhausted mid-session

**Image handling:**
- Icon: auto-loaded from site default, non-editable in compose (set in dashboard)
- Featured Image: extracted from page, shown as preview thumbnail
- "Change" opens URL input to replace
- "Remove" clears the big_image field
- Large image requires `hasLargeImagePermission` — if not, featured image section hidden

### Options Accordions

All 4 always visible. Collapsed by default. Locked features expand to show upgrade nudge.

---

#### Segments Accordion (Expanded — Unlocked)

```
┌──────────────────────────────────┐
│ ▾ Segments                       │
│                                  │
│  ○ All Subscribers               │
│  ● Select Segments               │
│                                  │
│  [Search segments...         🔍] │  ← if 10+ segments
│                                  │
│  ☑ Blog Readers         12.4K   │
│  ☑ Pricing Page          3.1K   │
│  ☐ Cart Abandoners       1.8K   │
│  ☐ New Users (30d)       5.2K   │
│  ☐ US Visitors           8.7K   │
│                                  │
│  2 selected · ~15.5K reach       │
│                                  │
│  ┌────────────────────────────┐  │
│  │ + Create from this URL     │  │
│  │                            │  │
│  │ Name [/pricing-page_____]  │  │
│  │ Rule [URL contains ▾]      │  │
│  │      [/pricing__________]  │  │
│  │                            │  │
│  │ [Create & Apply]           │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

- Search box appears conditionally: <10 segments = no search, 10+ = search shown
- Subscriber count shown per segment
- Estimated reach totaled at bottom
- "Create from this URL" pre-fills from current page path
- Segments fetched from `GET /d/v1/sites/:siteId/segments`
- Applied as `notification_criteria.include_segments: [id1, id2]` in campaign payload
- Requires `canReadSegment` to view, `canWriteSegment` for "Create from this URL"

#### Segments Accordion (Expanded — Locked)

```
┌──────────────────────────────────┐
│ ▸ Segments                   🔒  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Target specific audience  │  │
│  │  groups with segments      │  │
│  │                            │  │
│  │  Sends to: All Subscribers │  │
│  │                            │  │
│  │  [Upgrade to Growth ↗]     │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

---

#### Action Buttons Accordion (Expanded — Unlocked)

```
┌──────────────────────────────────┐
│ ▾ Action Buttons                 │
│                                  │
│  Button 1                        │
│  Label [Shop Now___]  12/12      │
│  URL   [https://example.com/___] │
│                                  │
│  + Add Button 2                  │
└──────────────────────────────────┘
```

- Max 2 buttons, label max 12 chars, URL max 256 chars
- Maps to `actions.action1Title`, `actions.action1Url`, etc.
- Requires `canWriteNotificationWithMultiActionBtn`

#### Action Buttons Accordion (Expanded — Locked)

```
┌──────────────────────────────────┐
│ ▸ Action Buttons             🔒  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Add clickable buttons to  │  │
│  │  your notifications        │  │
│  │                            │  │
│  │  [Upgrade to Growth ↗]     │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

---

#### UTM Parameters Accordion (Expanded — Always Unlocked)

```
┌──────────────────────────────────┐
│ ▾ UTM Parameters                 │
│                                  │
│  ☑ Enable UTM tracking           │
│                                  │
│  Source   [pushengage__________]  │
│  Medium   [push________________] │
│  Campaign [spring-sale_________] │
│  Term     [optional____________] │
│  Content  [optional____________] │
└──────────────────────────────────┘
```

- Source, Medium, Campaign required when enabled. Term, Content optional.
- Source and Medium pre-filled from Settings defaults if configured.
- Maps to `utm_params` object in campaign payload.
- Always available, no plan gate.

---

#### Schedule Accordion (Expanded — Unlocked)

```
┌──────────────────────────────────┐
│ ▾ Schedule                       │
│                                  │
│  ● Send Now                      │
│  ○ Schedule for Later            │
│                                  │
│  Date  [2026-03-21         📅]   │
│  Time  [09:00 AM           🕐]   │
│                                  │
│  ☐ Send in subscriber's         │
│    timezone                      │
└──────────────────────────────────┘
```

- Two options only: Send Now, Schedule for Later
- Date min=tomorrow, time in 12h format
- Subscriber timezone checkbox requires `canWriteTimezoneNotification`
- Maps to `status: 'scheduled'`, `valid_from: 'YYYY-MM-DD HH:mm:ss'`
- Requires `canWriteScheduleNotification`

#### Schedule Accordion (Expanded — Locked)

```
┌──────────────────────────────────┐
│ ▸ Schedule                   🔒  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Schedule campaigns for    │  │
│  │  the perfect send time     │  │
│  │                            │  │
│  │  Default: Sends immediately│  │
│  │                            │  │
│  │  [Upgrade to Growth ↗]     │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

---

### Action Bar (Sticky Bottom)

Always visible at the bottom. Label adapts:

| State | Left Button | Right Button (Primary) |
|-------|-------------|----------------------|
| Send Now selected | Save Draft | Send Now |
| Schedule selected | Save Draft | Schedule for Mar 21, 9 AM |

"Open in Dashboard ↗" link below buttons — opens `https://app.pushengage.com/campaigns` in new tab.

---

## Screen 3: Insights

Accessed from user menu. Shows performance data and actionable nudges.

### Layout

```
┌──────────────────────────────────┐
│ [← Back]  Insights    [7d ▾]    │
├──────────────────────────────────┤
│                                  │
│ ── What's Working ────────────── │
│                                  │
│  📬 Campaigns Sent          14   │
│  👥 Total Reach          48.2K   │
│  👆 Avg CTR               5.3%   │
│  💰 Revenue             $4,812   │
│                                  │
│ ── Top Performing ───────────── │
│                                  │
│  🏆 "Flash Sale: 40% Off"       │
│     8.2% CTR · $1,840 rev       │
│     Mar 18 · 12.4K reach        │
│                                  │
│ ── Top Segments ─────────────── │
│                                  │
│  1. Cart Abandoners   12.1% CTR  │
│  2. Blog Readers       6.8% CTR  │
│  3. Pricing Page       5.9% CTR  │
│  4. New Users (30d)    4.2% CTR  │
│  5. US Visitors        3.8% CTR  │
│                                  │
│ ── Top Countries ────────────── │
│                                  │
│  🇺🇸 United States   18.4K  38%  │
│  🇮🇳 India           12.1K  25%  │
│  🇬🇧 United Kingdom   4.8K  10%  │
│  🇨🇦 Canada           3.2K   7%  │
│  🇦🇺 Australia         2.1K   4%  │
│     + 12 more countries          │
│                                  │
│ ── Subscriber Health ────────── │
│                                  │
│  Total Subs         52.4K        │
│  New (7d)           +1,240       │
│  Unsubs (7d)          -89        │
│  Net Growth          +1,151      │
│                                  │
│ ── Jobs To Be Done ──────────── │
│                                  │
│  💡 Cricket Lovers (2.1K subs)   │
│     No campaign in 14 days       │
│     [Send to them now →]         │
│                                  │
│  📈 Cart Abandoners: 12.1% CTR  │
│     Your best segment. Last: 3d  │
│     [Send to them now →]         │
│                                  │
│  ⚠️ 3.2K subs from Canada       │
│     No targeted campaign yet     │
│     [Create campaign →]          │
│                                  │
│  🕐 Best send time: Tue & Thu   │
│     at 10 AM (last 30 days)      │
│                                  │
│  [View Full Analytics ↗]         │
│                                  │
└──────────────────────────────────┘
```

### Time Range Selector
- Options: 7 days, 14 days, 30 days
- All sections recalculate on change

### KPI Cards
- Revenue shown only if `hasGoalTrackingPermission`
- Data from `GET /d/v1/sites/:siteId/analytics/notification-result/summary`

### Top Performing Campaign
- Highest CTR campaign in selected time range
- Revenue shown if goal tracking active
- From notification list sorted by CTR

### Top Segments
- Ranked by CTR (actionable metric, not vanity subscriber count)
- Max 5 shown
- Requires `canReadSegment` — otherwise section replaced with upgrade nudge

### Top Countries
- From geo analytics data
- Subscriber count and % of total
- "+N more" expands inline or links to dashboard

### Subscriber Health
- Net growth = new - unsubs in the time range
- Visual indicator: healthy (positive growth) / declining (negative) / stagnant (flat)

### Jobs To Be Done
Actionable nudges computed from data:

| Insight | Trigger Logic | Action |
|---------|--------------|--------|
| Dormant segment | 500+ subs, no campaign in 14+ days | "Send to them now →" pre-fills compose with segment |
| High performer | Segment CTR > 2x site average (30d) | "Send to them now →" pre-fills compose with segment |
| Untapped geo | Country 1K+ subs, 0 targeted campaigns | "Create campaign →" opens compose |
| Best send time | CTR by day-of-week + hour (30d) | Informational — no action |
| Declining engagement | CTR trending down 20%+ (14d vs prior 14d) | Informational |
| Growth spike | 2x normal new subscriber rate (7d) | "Welcome new subscribers →" pre-fills compose with new users segment |

"Send to them now →" takes user back to Compose with the relevant segment/audience pre-selected — creating a feedback loop: Insights → Action → Results → New Insights.

### Permission Gating

| Section | Permission | If Locked |
|---------|-----------|-----------|
| KPI Cards | Always visible | Revenue hidden without goal tracking |
| Top Campaign | `canReadNotification` | Section hidden |
| Top Segments | `canReadSegment` | Replaced with upgrade nudge |
| Top Countries | Always visible | Basic geo data |
| Subscriber Health | Always visible | Basic subscriber data |
| JTBD Nudges | Adapts | Only shows nudges for accessible features |

---

## Screen 4: Segment Manager

Accessed from user menu. Create or update segments based on the current page URL.

### Layout

```
┌──────────────────────────────────┐
│ [← Back]  Segment Manager        │
├──────────────────────────────────┤
│                                  │
│ Current Page:                    │
│ ┌────────────────────────────┐   │
│ │ domainname.com/sports/     │   │
│ │ cricket/india-won-world... │   │
│ └────────────────────────────┘   │
│                                  │
│ ── Add to Existing Segment ──── │
│                                  │
│ [Search segments...          🔍] │
│                                  │
│  Sports Fans         8.2K       │
│    Rules: /sports/* (contains)   │
│    [+ Add This URL Pattern]      │
│                                  │
│  Cricket Lovers      2.1K       │
│    Rules: /cricket/* (contains)  │
│    [+ Add This URL Pattern]      │
│                                  │
│ ── Or Create New Segment ─────  │
│                                  │
│ Suggested patterns:              │
│                                  │
│  ○ Exact page                    │
│    /sports/cricket/india-won-    │
│    worldcup-2026                 │
│                                  │
│  ○ This topic (recommended)      │
│    /sports/cricket/*             │
│                                  │
│  ○ Broad category                │
│    /sports/*                     │
│                                  │
│  ○ Custom pattern                │
│    [________________________]    │
│                                  │
│  Name [Cricket Fans___________]  │
│                                  │
│  ☑ Auto-add subscribers who      │
│    visit matching pages          │
│                                  │
│  [Create Segment]                │
│                                  │
└──────────────────────────────────┘
```

### URL Pattern Intelligence
Parses the current page URL path into segments and suggests 3 levels:
- **Exact page** — `/sports/cricket/india-won-worldcup-2026` (exact match rule)
- **This topic** — `/sports/cricket/*` (contains `/sports/cricket/`)
- **Broad category** — `/sports/*` (contains `/sports/`)
- **Custom** — user types their own pattern

### Add to Existing
- Shows only segments whose existing rules overlap with the current URL path
- Shows current rules for each segment so user knows what they're adding to
- "Add This URL Pattern" adds a new include rule to the segment via `PATCH /d/v1/sites/:siteId/segments/:id`

### Create New
- Segment name auto-generated from URL path, editable
- `add_segment_on_page_load` checkbox maps to API field
- Creates via `POST /d/v1/sites/:siteId/segments`

### Permission Gating
- Entire screen requires `canWriteSegment`
- If locked, menu item shows 🔒 and opens: "Segment management available on Growth plan · Upgrade ↗"

---

## Screen 5: Settings

Accessed from user menu. Minimal configuration.

```
┌──────────────────────────────────┐
│ [← Back]  Settings               │
├──────────────────────────────────┤
│                                  │
│ Auto-extract page content   [●]  │
│ when extension opens             │
│                                  │
│ Default UTM Source               │
│ [pushengage___________________]  │
│                                  │
│ Default UTM Medium               │
│ [push_________________________]  │
│                                  │
└──────────────────────────────────┘
```

- Auto-extract toggle: if off, compose fields start empty and user fills manually
- Default UTM values pre-fill the UTM accordion every time
- Stored in `chrome.storage.local`
- No API keys, no AI configuration (AI credits are plan-managed)

---

## Abuse Prevention & Safety

### Layer 1: Accidental Send Protection

Every send requires confirmation:
```
┌──────────────────────────────────┐
│  ⚠️ Confirm Send                 │
│                                  │
│  "Spring Sale Alert"             │
│  To: Blog Readers (12.4K subs)   │
│  Schedule: Immediately           │
│                                  │
│  This will send a push           │
│  notification to 12,400          │
│  subscribers right now.          │
│                                  │
│  [Cancel]    [Confirm & Send]    │
└──────────────────────────────────┘
```
Shows title, audience size, and schedule. No exceptions.

### Layer 2: Plan Limits

Notification quota fetched on login/site-switch, enforced pre-send:

| Scenario | Behavior |
|----------|----------|
| Audience < remaining quota | Normal send with confirmation |
| Audience > remaining quota | Warning with options: send to partial, narrow audience, upgrade |
| Quota fully exhausted | Block send, offer Save Draft or Upgrade |

```
Quota exceeded:
┌──────────────────────────────────┐
│  ⚠️ Plan Limit                    │
│                                  │
│  This campaign targets 12.4K     │
│  but you have 11.8K remaining.   │
│                                  │
│  [Go Back]    [Send to 11.8K]    │
└──────────────────────────────────┘

Quota exhausted:
┌──────────────────────────────────┐
│  🚫 Monthly Limit Reached        │
│                                  │
│  You've used all 50,000          │
│  notifications this month.       │
│  Resets: April 1, 2026           │
│                                  │
│  [Save as Draft]  [Upgrade ↗]    │
└──────────────────────────────────┘
```

### Layer 3: AI Credit Limits

| Credits Remaining | ✨ Button Behavior |
|-------------------|-------------------|
| Available | Works normally, 1 credit per use |
| Low (< 10%) | Amber indicator, tooltip: "12 credits left" |
| Exhausted | Greyed out, tooltip: "AI credits used up · Upgrade ↗" |
| Not in plan | Hidden entirely |

Decremented locally per call, synced with server. Server is source of truth.

### Layer 4: Rate Limiting & Duplicate Prevention

| Protection | Rule |
|-----------|------|
| Duplicate prevention | Cannot send identical title + URL within 1 hour (warning, overridable) |
| Rapid fire block | Max 5 campaigns per 10-minute window (hard block) |
| Cool-down warning | 3+ campaigns in 5 mins → "You're sending frequently. Continue?" |
| Server-side enforcement | Adonis API rate-limits regardless of client behavior |

```
Duplicate:
┌──────────────────────────────────┐
│  ⚠️ Possible Duplicate            │
│                                  │
│  A campaign with this title and  │
│  URL was sent 12 minutes ago.    │
│                                  │
│  [Go Back]    [Send Anyway]      │
└──────────────────────────────────┘

Rate limited:
┌──────────────────────────────────┐
│  ⏸️ Slow Down                     │
│                                  │
│  You've sent 5 campaigns in the  │
│  last 10 minutes.                │
│  Wait 4:32 or save as draft.     │
│                                  │
│  [Save as Draft]                 │
└──────────────────────────────────┘
```

---

## Permission Model

All features gated by plan permissions fetched from API on login/site-switch.

| Feature | Permission | If No Access |
|---------|-----------|--------------|
| Segments (view) | `canReadSegment` | Accordion expands to show upgrade nudge, sends to All |
| Segments (create) | `canWriteSegment` | "Create from URL" hidden, Segment Manager locked |
| Schedule | `canWriteScheduleNotification` | Accordion locked, sends immediately only |
| Timezone send | `canWriteTimezoneNotification` | Timezone checkbox hidden |
| Action buttons | `canWriteNotificationWithMultiActionBtn` | Accordion locked |
| Large image | `hasLargeImagePermission` | Featured image section hidden |
| Goal tracking / revenue | `hasGoalTrackingPermission` | Revenue hidden from stats and insights |
| UTM params | Always available | No gate |
| AI suggestions | Plan includes AI credits | Hidden if not in plan |

**Locked accordions** are expandable (not hidden) — user sees the feature description and upgrade link. This drives upgrade awareness without blocking the core workflow.

**Server-side enforcement** — UI gating is for UX only. The Adonis API independently rejects unauthorized actions.

**Permission caching** — fetched on login and site-switch, stored in memory. 24-hour TTL refresh.

---

## API Integration Map

### Authentication
| Action | Endpoint | Method |
|--------|----------|--------|
| Login | `/d/v1/auth/login` | POST |
| Google login | `/d/v1/auth/google-login` | POST |
| Get current user | `/d/v1/auth` | GET |
| Logout | `/d/v1/auth/logout` | POST |

### Sites
| Action | Endpoint | Method |
|--------|----------|--------|
| List user sites | `/d/v1/sites` | GET |
| Get site details | `/d/v1/sites/:siteId` | GET |

### Campaigns
| Action | Endpoint | Method |
|--------|----------|--------|
| Create notification | `/d/v1/sites/:siteId/notifications?action=sent` | POST |
| Save draft | `/d/v1/sites/:siteId/notifications?action=draft` | POST |
| List notifications | `/d/v1/sites/:siteId/notifications` | GET |
| Get single notification | `/d/v1/sites/:siteId/notifications/:id` | GET |

### Segments
| Action | Endpoint | Method |
|--------|----------|--------|
| List segments | `/d/v1/sites/:siteId/segments` | GET |
| Create segment | `/d/v1/sites/:siteId/segments` | POST |
| Update segment | `/d/v1/sites/:siteId/segments/:id` | PATCH |

### Analytics
| Action | Endpoint | Method |
|--------|----------|--------|
| Site summary | `/d/v1/sites/:siteId/analytics/summary` | GET |
| Notification results | `/d/v1/sites/:siteId/analytics/notification-result/summary` | GET |
| Timeseries | `/d/v1/sites/:siteId/analytics/notification-result/timeseries` | GET |
| Opt-in analytics | `/d/v1/sites/:siteId/analytics/optin` | GET |

---

## Campaign Payload (Create Notification)

```json
{
  "title": "Spring Sale: 40% Off Everything",
  "message": "Limited time offer. Shop now before it's gone!",
  "url": "https://store.example.com/sale",
  "image_url": "https://cdn.example.com/icon.png",
  "big_image": "https://cdn.example.com/featured.jpg",
  "status": "sent",
  "source": "chrome_extension",
  "notification_criteria": {
    "include_segments": [12, 45]
  },
  "actions": {
    "action1Title": "Shop Now",
    "action1Url": "https://store.example.com/sale"
  },
  "utm_params": {
    "enabled": 1,
    "utm_source": "pushengage",
    "utm_medium": "push",
    "utm_campaign": "spring-sale"
  },
  "valid_from": "2026-03-21 09:00:00",
  "require_interaction": 0,
  "expiry": 2419200
}
```

---

## Security Requirements

| Concern | Approach |
|---------|---------|
| Token storage | JWT encrypted before storing in `chrome.storage.local` |
| XSS from page content | All extracted data sanitized with HTML entity escaping before DOM injection |
| Content injection | Use `textContent` for rendering, never `innerHTML` with unsanitized data |
| Image URL validation | Only allow `https://` URLs, reject `javascript:`, `data:` schemes |
| CSP | Add Content Security Policy to `manifest.json` |
| Permissions | Minimal manifest permissions; prefer `activeTab` + optional host permissions over `<all_urls>` |
| API security | All API calls over HTTPS, Bearer token in Authorization header |
| Inline handlers | Use `addEventListener` exclusively, no inline `onclick` attributes |

---

## Branding

Extension uses official PushEngage brand colors:
- **Navy:** #191A35 (primary backgrounds, text)
- **Blue:** #3B43FF (buttons, links, active states)
- **Gold:** #FFD37D (secondary accents, highlights)
- **Fonts:** Self-hosted Inter (UI) and JetBrains Mono (code/data) — no Google Fonts CDN

---

## What Lives in the Dashboard (Not in Extension)

These features are explicitly out of scope. Users access them via "Open in Dashboard ↗" links:

- A/B testing campaigns
- Recurring/repeat schedules
- Audience group creation and management
- Mobile push settings (Android/iOS specific)
- Multi-site notification sending
- Goal tracking setup and configuration
- Drip campaigns, triggered campaigns, RSS auto-push
- Subscriber management
- Widget and subscription dialog design
- Billing and plan management
- User/team management
