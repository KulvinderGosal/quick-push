# PushEngage Chrome Extension — Support Documentation

**For Support Team | Internal Reference | March 2026**

---

## Extension Overview

The PushEngage Chrome Extension (v2.0.0, Manifest V3) allows users to create and send push notification campaigns directly from any webpage. It combines the PushEngage Dashboard API for campaign delivery with Google Gemini AI for intelligent content generation. An active PushEngage account is required on any plan.

---

## Installation & Setup

### Requirements

- Google Chrome browser (Chromium-based browsers such as Edge and Brave also work)
- Active PushEngage account (any plan)
- Internet connection (required for API calls and AI features)

### Installation Steps

1. Install the extension from the Chrome Web Store.
2. Pin the extension to the toolbar: click the puzzle icon in the Chrome toolbar, then click the pin icon next to PushEngage.
3. Click the extension icon, then click **Login**. This opens the PushEngage dashboard login page.
4. Log in to the PushEngage dashboard. After login, return to the extension — the session is captured automatically.
5. If the account manages multiple sites, select the appropriate site from the dropdown.

### Keyboard Shortcut

- **Windows/Linux:** Ctrl+Shift+P
- **Mac:** Cmd+Shift+P

---

## Authentication & Session

### How Authentication Works

- **Auto-detect:** If the PushEngage dashboard is already open in another tab, the extension detects your session automatically — no login needed.
- If no dashboard tab is open, clicking Login opens `app.pushengage.com/login` in a new tab.
- After the user logs in, the background script captures the JWT token from the dashboard's localStorage.
- The token is stored encrypted using AES-GCM in `chrome.storage.local`.
- Every time the extension is opened, it checks: pending auth → dashboard token → saved session.
- Sessions expire after **6 hours of inactivity** and the user is automatically logged out.
- A background check runs every **30 minutes** to validate the session.
- When a session expires, a **red badge** appears on the extension icon.
- **Signup link** redirects to the pricing page with UTM tracking. It's hidden when a PE account is already open.

### Common Auth Issues

| Issue | Cause | Solution |
|---|---|---|
| "Login" button doesn't work | Popup blocked or Chrome bug | Right-click the extension icon and try again. Or navigate manually to `app.pushengage.com/login`. |
| Login shows even when dashboard is open | Dashboard tab may be on /login or /register page | Navigate to any dashboard page (not login), then try the extension. |
| Session expired immediately after login | Clock skew or token issue | Log out, clear extension storage, then log in fresh. |
| Can't switch sites | API error during site list fetch | Log out and log back in — the site list refreshes on authentication. |
| "Unauthorized" errors mid-session | Token expired while extension was in use | Click the extension icon — it will display the login screen automatically. |
| Login loop (extension keeps asking to log in) | Cookies blocked for pushengage.com | Check Chrome cookie settings. Ensure third-party cookies are allowed for pushengage.com. |

---

## Campaign Creation Issues

| Issue | Cause | Solution |
|---|---|---|
| Fields not auto-filling | Page lacks OG meta tags, or content script permission denied | Verify "Auto-extract" is enabled in Settings. Some pages block content scripts — the user can fill fields manually. |
| Title or description blank | No OG tags or meta description on the page | User fills manually, or uses AI Write to generate content. |
| Image not loading | OG image URL is broken or CORS blocked | User can paste a different image URL into the image field. |
| "AI Write" button disabled | No content to generate from | User must fill in at least a description before AI Write becomes available. |
| AI generates poor copy | Insufficient page context extracted | Use the feedback field: type a refinement such as "make it shorter" or "more urgent" and click regenerate. |
| AI Write shows an error | AI credits exhausted or Gemini API temporarily unavailable | Check the account's AI credit balance. If credits are available, this may be a temporary API issue — advise the user to try again shortly. |
| CTA buttons say "Read More" on a video page | Older extension version or page type misdetection | Advise the user to update the extension. The current version detects 30+ page types including video, podcast, and course pages. |
| CTA buttons unavailable | Plan does not include Action Buttons | Requires Growth plan or above. The extension shows an inline upgrade prompt. |
| "Button label must be 40 characters or less" | Action button label exceeds backend limit | Shorten the button text to 40 characters or less. |
| Segments not showing | Plan does not include Segments | Requires Business plan or above. |
| Schedule option disabled | Plan does not include Scheduled Send | Requires Growth plan or above. |
| "Rate limited" error | User sent 5 or more campaigns within 10 minutes | This is an intentional safeguard. Advise the user to wait a few minutes before trying again. |
| "Duplicate campaign" warning | A campaign for the same URL was sent recently | Intentional safety check. The user can confirm to send anyway. |
| Campaign sent but no notifications received | Subscriber count is zero, or selected segments are empty | Check subscriber count in Insights. The account needs push opt-ins configured before notifications can be delivered. |

---

## AI Features

### Two AI Systems

1. **PushEngage API** — generates title options (x3) and message options (x3). Uses the customer's AI credits from their plan.
2. **Google Gemini** — generates CTA button labels based on page type detection. Free, no credits consumed.

### AI Credit Tiers

| Plan | AI Credits |
|---|---|
| Free | Limited |
| Growth | More credits |
| Premium | Unlimited |
| Business | Unlimited |
| Enterprise | Unlimited |

When AI credits are exhausted, AI Write will fail with an error. The user needs to upgrade their plan or wait for the credit refresh cycle.

### CTA Intelligence — Page Types Detected

| Page Type | Example CTAs |
|---|---|
| Blog / article | Read Article / Save for Later |
| Product (in stock) | Shop Now / Add to Cart |
| Product (out of stock) | Join Waitlist / View Similar |
| Product (pre-order) | Pre-Order Now / View Details |
| Catalogue / collection | Browse Collection / View All |
| Sale / offer | Grab Deal / View All Deals |
| Coming soon | Get Notified / Learn More |
| Checkout | Complete Order / View Cart |
| Homepage | Visit Site / Explore |
| YouTube video | Watch Now / Subscribe |
| Video course | Watch Course / Start Learning |
| Podcast | Listen Now / Subscribe |
| Music | Listen Now / Save to Library |
| Recipe | View Recipe / Save Recipe |
| Event | Register Now / Save Date |
| Download | Download Now / View Details |
| Documentation | Read Docs / Bookmark |
| Job listing | Apply Now / Save Job |
| News | Read Story / Share |
| Gallery | View Gallery / Browse |
| Pricing | View Plans / Compare |

### Social Link Detection

The extension scans the active page for links to: YouTube, Instagram, Twitter, Facebook, TikTok, LinkedIn, Pinterest, Spotify, SoundCloud, and podcast platforms.

Detection priority order: YouTube > Instagram > Facebook > Twitter > TikTok > Podcast

When a social link is detected, Button 2 is automatically linked to that platform.

### JTBD Recommendations (Insights Page)

- Displays up to 4 personalized recommendation cards based on the account's current state.
- AI generates copy using the account's actual numbers (subscriber count, campaign stats, etc.).
- Recommendations are cached for 7 days. The Refresh button forces immediate regeneration.
- Categories covered: activation, optimization, multichannel, and upsell.
- If AI generation fails, static fallback text is shown instead.

---

## Insights Page Issues

| Issue | Cause | Solution |
|---|---|---|
| Insights page shows all zeros | New account with no campaigns sent | Normal behavior. Zero states display opportunity messages rather than data. |
| Recommendations not loading | API or AI generation failure | Click Refresh. If the issue persists, check the user's internet connection. |
| "No recommendations" message | Account is performing well across all tracked metrics | This is expected positive behavior. No urgent actions are needed for the account. |
| Revenue not showing | Goal Tracking not enabled | Requires Premium plan with Goal Tracking configured in the dashboard. |
| Wrong subscriber count | Data is pulled from PushEngage API on open | Count refreshes each time the extension is opened. Direct the user to the dashboard for the authoritative number. |

---

## Draft & Storage Issues

| Issue | Cause | Solution |
|---|---|---|
| Draft not restoring | The user navigated to a different URL than where the draft was saved | Drafts are scoped per URL. The user must navigate back to the original page. |
| Draft disappeared | Expired (24-hour TTL) or browser storage was cleared | Drafts expire after 24 hours. Clearing Chrome site data also removes drafts. |
| Preferences reset | Chrome storage was cleared | UTM defaults and button preferences are stored in `chrome.storage.local`. Clearing browser data removes them. |
| Extension uses too much storage | Accumulated drafts | Old drafts auto-expire. No manual cleanup is required. |

---

## Plan Feature Gating

| Feature | Free | Growth | Premium | Business | Enterprise |
|---|---|---|---|---|---|
| Campaign creation | Yes | Yes | Yes | Yes | Yes |
| AI Write | Limited | More | Unlimited | Unlimited | Unlimited |
| Action Buttons | No | Yes | Yes | Yes | Yes |
| Segments | No | No | No | Yes | Yes |
| A/B Testing | No | No | Yes | Yes | Yes |
| Schedule Send | No | Yes | Yes | Yes | Yes |
| Revenue Tracking | No | No | Yes | Yes | Yes |
| Timezone Send | No | No | Yes | Yes | Yes |

When a user on a lower plan attempts to access a gated feature, the extension displays an inline upgrade prompt with a direct link to the billing page.

---

## Escalation Guide

### When to Escalate to Engineering

- Extension consistently fails to load (blank popup persists after refreshing)
- API returns 500 errors persistently (not a transient failure)
- AI generates harmful or inappropriate content
- Auth loop that does not resolve after clearing storage and re-logging in
- Extension crashes the Chrome tab
- Data mismatch between the extension and the dashboard that persists after a refresh

### Information to Collect Before Escalating

- Chrome version (from `chrome://version`)
- Extension version (from `chrome://extensions` — click Details next to PushEngage Extension)
- PushEngage account email and site ID
- Exact steps to reproduce the issue
- Console errors (see instructions below)
- Screenshot of the issue

### How to Access the Extension Console

1. Right-click the extension popup.
2. Click "Inspect".
3. Go to the Console tab.
4. Copy all red error messages and include them in the escalation.

---

## Storage Keys Reference

The following keys are used in `chrome.storage.local`. This information is useful when debugging storage-related issues or verifying what data the extension holds.

| Key | Description |
|---|---|
| `pe_auth_enc` | Encrypted authentication token |
| `pe_auth_iv` | Encryption initialization vector |
| `pe_session_ts` | Timestamp of last user activity |
| `pe_user_prefs` | User preferences including UTM defaults and button settings |
| `pe_draft_{hash}` | Per-URL draft data (hash derived from page URL) |
| `pe_jtbd_recommendations` | Cached JTBD recommendation copy (7-day TTL) |

### Clearing Extension Storage (Last Resort)

Use this only when other troubleshooting steps have failed.

1. Go to `chrome://extensions`.
2. Find the PushEngage Extension entry.
3. Click "Details".
4. Click "Clear data" to wipe storage while keeping the extension installed, or click "Remove" to uninstall and then reinstall from the Chrome Web Store.

Note: Clearing storage will log the user out and remove all saved drafts and preferences.

---

*PushEngage Chrome Extension v2.0.0 | Manifest V3 | Internal Support Reference*
