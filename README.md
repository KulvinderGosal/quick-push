# PushEngage Campaign Creator — Chrome Extension

> Create and send push notification campaigns from any webpage, powered by AI.

A Manifest V3 Chrome extension for PushEngage users. Auto-extracts page content, generates AI-powered copy with smart CTA buttons, manages segments, and tracks campaign performance — all without opening the dashboard.

---

## Features

### Campaign Creation
- **One-click extraction** — title, description, URL, OG images pulled from current tab
- **AI Write** — generates 3 title + message + CTA button options via PushEngage API + Gemini 2.5
- **Smart CTA buttons** — context-aware labels based on page type (article, product, video) and social links found on page. btn1 = page action, btn2 = social action (YouTube, Instagram, etc.)
- **Social links picker** — dropdown in Action Buttons showing detected platforms with icons, quick-fills Button 2
- **Images** — site icon + featured image (OG tag, page images, or manual URL)
- **UTM parameters** — all 5 fields pre-filled with sensible defaults, persisted across sessions
- **Scheduling** — send now or schedule for later (with subscriber timezone option)
- **Draft auto-save** — form state saved per-URL with 1.5s debounce. Navigate to new page = fresh form. Preferences persist.

### Analytics & Insights
- **Performance stats** — campaigns sent, total clicks, avg CTR in header ticker
- **Revenue tracking** — shown for goal-tracking plans (Premium/Enterprise)
- **AI insights** — Gemini-powered recommendations based on account data, cached 7 days
- **Quick wins** — contextual action cards based on what's underutilized

### Segments
- **4 segment types** — Geographic, Device, Behavior (URL patterns), Custom
- **AI naming** — suggest segment names from URL context
- **Overlap detection** — warns when new segment overlaps existing ones
- **Quick presets** — All Subscribers, Active, New, Inactive

### Security
- **AES-GCM token encryption** — per-installation key
- **6-hour session timeout** — background alarm checks every 30 minutes, auto-logout on inactivity
- **No innerHTML** — all content rendered via `textContent`
- **Strict CSP** — `script-src 'self'; object-src 'none'`
- **Minimal permissions** — `activeTab`, `tabs`, `scripting`, `storage`, `alarms`

---

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/` and enable **Developer mode**
3. Click **Load unpacked** and select the `Campaign Creater` folder
4. The PushEngage icon appears in your toolbar

### Login
Click the extension icon, then **Login**. This opens the PushEngage dashboard — log in normally. The extension captures your session automatically. Multi-site support included via the site selector dropdown.

---

## Project Structure

```
Campaign Creater/
  popup.html             — UI shell (all screens + inline CSS)
  popup.js               — Entry point, routing, auth flow
  background.js          — Service worker (auth capture, session alarms, shortcuts)
  content.js             — Page data extraction (injected via chrome.scripting)
  manifest.json          — Manifest V3 config
  styles/theme.css       — Design tokens (navy #191A35, blue #3B43FF, gold #FFD37D)
  icons/                 — PushEngage branded icons (16/32/48/128 PNG + SVG source)
  modules/
    state.js             — Centralized state store with events
    auth.js              — Login, token encryption, session timeout, site selection
    api.js               — HTTP client (17 PushEngage API endpoints)
    ai.js                — AI integration (PushEngage API + Gemini 2.5)
    compose.js           — Campaign creation (largest module)
    header.js            — Site selector, user menu, stats ticker
    insights.js          — Analytics dashboard + AI insights
    segments.js          — Segment CRUD
    settings.js          — User preferences
    permissions.js       — Plan-based feature gating
    sanitize.js          — HTML escaping, URL validation, page data sanitization
    safeguards.js        — Rate limiting, duplicate detection
    modal.js             — Confirm/alert dialogs
    accordion.js         — Expandable sections
  docs/
    PROJECT.md           — Detailed architecture and API reference
```

---

## Development

### Making Changes

1. Edit files in `Campaign Creater/`
2. Sync to the unpacked extension directory:
   ```bash
   rsync -av --delete "Campaign Creater/" ~/Desktop/pushengage-extension-fresh/ \
     --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store'
   ```
3. Go to `chrome://extensions/` and click the reload button on PushEngage Extension
4. Open the popup to test

### Key Conventions

- **No build step** — plain ES modules, no bundler
- **No innerHTML** — use `textContent` or DOM APIs for all dynamic content
- **`sanitize.js`** — all page-extracted data runs through `sanitizePageData()` before use
- **State-driven** — `state.js` emits events; modules subscribe via `on(event, callback)`
- **Permission gating** — check `permissions.js` before showing paid features
- **Draft scoping** — drafts keyed by `pe_compose_draft_{siteId}_{urlHash}` so each page gets its own draft

### AI Integration

| Feature | Provider | Notes |
|---------|----------|-------|
| Title + message generation | PushEngage API | Uses account AI credits |
| CTA button labels | Gemini 2.5 | Free, internal key (must proxy before prod) |
| AI insights | Gemini 2.5 | Cached 7 days in chrome.storage.local |
| Segment name suggestions | PushEngage API | Reuses text-generation endpoint |

CTA generation flow: Gemini prompt includes page type + social links context. Post-processing guarantees btn1 = page action, btn2 = social when links exist. Fallback chain: Gemini → page-type CTAs → generic.

### Chrome Storage Keys

| Key | Purpose | TTL |
|-----|---------|-----|
| `pe_session` | Encrypted JWT + user + site | Persistent |
| `pe-token-key` | AES-GCM encryption key | Persistent |
| `pe_compose_prefs` | Saved compose preferences | Persistent |
| `pe_compose_draft_{siteId}_{urlHash}` | Auto-saved form state | 24 hours |
| `pe_last_activity` | Session timeout tracking | Persistent |
| `pe_ai_insights` | Cached AI insights per site | 7 days |
| `pe_settings` | User settings | Persistent |

---

## API Reference

See [docs/PROJECT.md](docs/PROJECT.md) for the full API endpoint table, response shapes, and architecture diagrams.

**Base URL:** `https://dashboard-public-api.pushengage.com/d/v1`
**Auth:** Bearer token (JWT captured from dashboard login)

---

## Known Limitations

1. **No total subscriber count API** — stats show campaign metrics, not subscriber totals
2. **Gemini key hardcoded** — must be proxied through backend before production release
3. **No A/B testing UI** — permission exists but no creation flow yet
4. **No image library picker** — only URL input and page extraction

---

## License

MIT
