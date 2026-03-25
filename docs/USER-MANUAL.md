# PushEngage Chrome Extension — User Manual

**Version 2.0.0** | Chrome Extension (Manifest V3)

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Creating Your First Campaign](#creating-your-first-campaign)
3. [Images](#images)
4. [Action Buttons (CTAs)](#action-buttons-ctas)
5. [Targeting Segments](#targeting-segments)
6. [UTM Parameters](#utm-parameters)
7. [Scheduling](#scheduling)
8. [Draft Auto-Save](#draft-auto-save)
9. [Insights Dashboard](#insights-dashboard)
10. [Security](#security)
11. [Keyboard Shortcuts](#keyboard-shortcuts)
12. [Multi-Site Support](#multi-site-support)
13. [Plan Features](#plan-features)
14. [Tips and Best Practices](#tips-and-best-practices)
15. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Installing from Chrome Web Store

1. Open the Chrome Web Store and search for **PushEngage**.
2. Click **Add to Chrome** on the PushEngage extension listing.
3. When prompted, click **Add extension** to confirm.
4. Chrome will install the extension and show a confirmation message.

### Pinning the Extension to Your Toolbar

After installation, the extension icon may be hidden in the Extensions menu (the puzzle piece icon in the top-right corner of Chrome).

To pin it for quick access:

1. Click the puzzle piece icon in the Chrome toolbar.
2. Find **PushEngage** in the list.
3. Click the pin icon next to it.

The PushEngage icon will now appear in your toolbar at all times.

### Logging In

1. Click the PushEngage icon in the toolbar.
2. **If your PushEngage dashboard is already open** in another tab, the extension detects your session automatically — no login needed!
3. If no dashboard tab is open, click **Log In with PushEngage** → the dashboard opens in a new tab.
4. Log in with your PushEngage credentials (including any captcha).
5. Once logged in, the extension captures your session automatically — you can close the dashboard tab.
6. Return to your browser tab and click the extension icon again to start creating campaigns.

**Don't have an account?** The "Sign up" link takes you to our pricing page to get started.

### Keyboard Shortcut

Press **Ctrl+Shift+P** (Windows/Linux) or **Cmd+Shift+P** (Mac) from any tab to open the extension instantly.

---

## Creating Your First Campaign

### Step 1 — Open the Extension on Any Page

Navigate to the webpage you want to promote — a blog post, product page, sale, video, or any other page. Then click the PushEngage icon in your toolbar (or use the keyboard shortcut).

The extension opens as a panel. It immediately reads the current page and fills in the campaign form for you.

### Step 2 — Review Auto-Extracted Content

The extension automatically pulls the following from the page:

- **Title** — The page's headline or title tag
- **Message** — The meta description or first meaningful paragraph
- **URL** — The current page URL
- **Featured image** — The Open Graph image, or the largest image found on the page

Review these fields and edit any of them directly in the form if needed.

### Step 3 — Write Your Own Title and Message

Click into the **Title** or **Message** fields to type your own copy at any time. The auto-filled values are starting points, not fixed.

- Title: Keep it under 50 characters for best display across devices.
- Message: Aim for 1–2 short sentences.

### Step 4 — Use AI Write (Optional)

Click the **AI Write** button to generate professional campaign copy in seconds.

The AI analyzes the page content and generates **3 options**, each with:

- A campaign title
- A message
- Suggested CTA buttons

**Tone selector** — Before generating, choose a tone to match your intent:

| Tone | Best for |
|---|---|
| Default | General use |
| Urgent | Flash sales, breaking news |
| Friendly | Community updates, newsletters |
| Professional | B2B, corporate announcements |
| Casual | Lifestyle, everyday content |
| Exciting | Product launches, new features |
| FOMO | Limited-time offers, exclusives |

Select a tone from the dropdown, then click **AI Write**. Pick the option that fits best, or make edits after selecting.

### Step 5 — Refine with Feedback

After AI generates options, you can type a refinement instruction in the feedback field:

- "Make it shorter"
- "Add more urgency"
- "Use simpler words"
- "Focus on the discount"

Then click **Regenerate**. The AI will produce new options based on your instruction while keeping the page context in mind.

---

## Images

### Site Icon

Your brand icon is loaded automatically from your PushEngage account settings. It appears in the notification as your sender icon and does not need to be set per campaign.

### Featured Image

The extension auto-detects the featured image in this order:

1. The page's Open Graph image (og:image meta tag)
2. The largest image found on the page

The detected image is shown in the campaign preview. You can replace it by selecting a different image from the Images section.

### Choosing a Different Image

The **Images** section in the extension shows all available images found on the current page. Click any image to use it as the campaign's featured image. The preview updates immediately.

If you do not want a featured image, you can clear the selection.

---

## Action Buttons (CTAs)

You can add up to **2 CTA buttons** to your push notification. Each button has a **label** and a **URL**.

This feature requires the **Growth plan or above**.

### AI-Generated Buttons

When you use AI Write, the extension generates context-aware buttons based on the type of page it detects:

| Page Type | Button 1 | Button 2 |
|---|---|---|
| Blog post | Read Article | Save for Later |
| Product page | Shop Now | Add to Cart |
| Video | Watch Now | Subscribe |
| Podcast | Listen Now | Subscribe |
| Recipe | View Recipe | Save Recipe |
| Event | Register Now | Save Date |
| Out of stock product | Join Waitlist | View Similar |
| Pre-order | Pre-Order Now | View Details |
| Sale or offer page | Grab Deal | View All Deals |

### Social Media Link Detection

If the page contains links to social platforms (YouTube, Instagram, Twitter, Facebook, etc.), the extension detects them and offers to use the social link as the destination for Button 2. This is useful when promoting content that lives on a social channel.

### Social Links Picker

In the CTA section, a social links picker lets you manually select from detected social URLs on the page. Click the link you want, and it will populate Button 2's URL field.

### Editing Buttons Manually

You can edit any button label or URL at any time. Click the label field or URL field for either button and type your own values. Changes are saved automatically with the rest of your draft.

---

## Targeting Segments

By default, your campaign is sent to **all subscribers**. To target a specific group, use the Segments section.

This feature requires the **Business plan or above**.

### Selecting a Segment

1. Open the **Segments** section in the extension.
2. Segments are listed sorted by subscriber count (largest first).
3. Click a segment to select it. Your campaign will only go to subscribers in that segment.

### Creating a New Segment from the Extension

If you want to target a segment based on the current page's URL:

1. In the Segments section, click **Create Segment**.
2. The extension pre-fills a URL-based rule matching the current page.
3. The AI suggests a segment name based on the page content (for example, "Blog Readers — Product Reviews").
4. Confirm or edit the name, then save.

The new segment will be available in your PushEngage account and in the extension for future campaigns.

---

## UTM Parameters

UTM tracking is **enabled by default**. When enabled, the extension appends UTM parameters to your campaign URL so you can measure performance in Google Analytics (GA4).

### Smart Auto-Fill (All 5 Fields)

All 5 UTM fields are auto-populated fresh each time you open the extension, based on the page you're viewing:

- **utm_source** — Site name from the page (e.g. `wpbeginner`, `flipkart`), or your account default
- **utm_medium** — Always `push_notification`, or your account default
- **utm_campaign** — Slugified page title (e.g. `how-to-use-all-in-one-seo`), or your account default
- **utm_term** — Page keywords or page type (e.g. `seo,wordpress` or `course`)
- **utm_content** — Shortened title slug or page type (e.g. `aioseo-101` or `product`)

When you use **AI Write** and pick a suggestion, all 5 fields upgrade to AI-optimized slugs.

**Priority chain:** AI-generated > your edits > account-level defaults (from dashboard Settings → UTM) > page-scraped values > hardcoded fallbacks.

### Editing UTM Values

You can edit any UTM field before sending. Special characters (#, ?, spaces) are automatically stripped for URL compatibility. Maximum lengths: 80 characters for source/medium/campaign/term, 120 for content. UTM field values are NOT saved across sessions — they regenerate fresh per page for accurate tracking.

### Disabling UTM Tracking

Toggle off UTM tracking to skip parameters for a specific campaign. The extension properly signals the API that UTM is disabled — no parameters are appended to the notification URL.

---

## Scheduling

### Send Now

Click **Send Now** to send the campaign immediately to the selected subscribers or segments.

### Schedule for Later

1. Click **Schedule**.
2. Pick a date and time using the date/time picker.
3. Confirm the scheduled send.

The campaign will be queued and sent at the specified time.

This feature requires the **Growth plan or above**.

### Subscriber Timezone Delivery

Enable **Subscriber Timezone** to deliver the notification at the scheduled time in each subscriber's local timezone rather than a single global time. For example, if you schedule for 10:00 AM, subscribers in New York receive it at 10:00 AM Eastern, while subscribers in London receive it at 10:00 AM GMT.

This option is available when scheduling for later and increases open rates by reaching subscribers at the right moment in their day. Technically, the extension sets `source: 'parent_sub_timezone'` in the API payload, which instructs PushEngage to respect each subscriber's stored timezone.

---

## Draft Auto-Save

The extension saves your work automatically as you type. You do not need to click a save button.

### How It Works

- Every change you make is saved after a **1.5-second pause** in typing.
- Drafts are stored **per URL** — each webpage has its own separate draft.
- If you close the extension and reopen it on the same page, your draft is restored exactly as you left it.

### Draft Scope and Expiry

- Opening the extension on a **different page** starts a fresh form for that page.
- Returning to a previous page restores that page's draft.
- Drafts expire after **24 hours** and are automatically cleared.

### Persistent Preferences

The following settings carry over across all pages and do not reset with drafts:

- UTM enabled/disabled toggle
- Tone selection
- CTA button preferences

Note: UTM field values (source, medium, campaign, term, content) are NOT persisted — they regenerate fresh per page from site defaults and page content.

---

## Insights Dashboard

Access the Insights dashboard by clicking the **lightbulb icon** at the top of the extension.

### Health Snapshot

Three cards give you a quick view of your account health:

- **Subscribers** — Your current subscriber count and recent growth
- **Revenue / CTR** — Click-through rate and revenue attribution (where available)
- **Campaign Activity** — How often you are sending and recent engagement

When metrics are zero or low, the cards show **opportunity messages** instead of empty numbers — for example, "You have not sent a campaign this month" or "Add revenue tracking to unlock this metric."

### JTBD Recommendations

The extension generates up to **4 personalized tips** based on your actual account data. These recommendations are organized into categories:

- **Getting started** — Actions to take if you are new or underutilizing core features
- **Optimization** — Ways to improve CTR, segmentation, and timing
- **Multichannel** — Tips on combining push with other channels you use
- **Upgrades** — Features available on higher plans that could help your specific situation

Example recommendations:

- "Your 2.1% CTR is below the industry average of 4%. Try A/B testing your headlines."
- "You have not used segmentation yet. Sending to targeted segments can increase CTR by up to 2x."
- "You have not sent a campaign in 14 days. Consistent sending builds subscriber habit."

### Refreshing Recommendations

Click the **Refresh** button in the Insights panel to fetch updated recommendations based on your latest account data.

---

## Security

### Inactivity Timeout

If you have not used the extension for **6 hours**, your session is automatically ended and you are logged out. This protects your account if you leave your computer unattended.

### Background Session Checks

The extension checks your session status every **30 minutes** in the background, even when the extension panel is closed. This ensures your session state stays accurate.

### Session Expired Badge

When your session expires, the extension icon shows a **red badge**. This is your signal to re-login:

1. Click the extension icon.
2. The login screen will appear.
3. Log in to restore your session. Your draft is preserved.

---

## Keyboard Shortcuts

| Action | Windows / Linux | Mac |
|---|---|---|
| Open extension and create campaign from current page | Ctrl+Shift+P | Cmd+Shift+P |

The shortcut works from any tab and opens the extension panel directly on the active page.

To view or change keyboard shortcuts, go to **chrome://extensions/shortcuts** in your browser.

---

## Multi-Site Support

If your PushEngage account manages more than one website, a **site selector dropdown** appears at the top of the extension.

- Click the dropdown to see all sites linked to your account.
- Select the site you want to send the campaign from.
- The extension reloads with that site's settings, segments, and plan features.

Each site has its own:

- Subscriber list and segments
- Plan and feature access
- Site icon and branding
- UTM account defaults

---

## Plan Features

Some features are only available on specific PushEngage plans. If you try to access a gated feature, the extension will show an upgrade prompt explaining what is required.

| Feature | Minimum Plan Required |
|---|---|
| Action Buttons (CTAs) | Growth |
| Segments | Business |
| A/B Testing | Premium |
| Schedule Send | Growth |

To upgrade your plan, visit your PushEngage dashboard at **app.pushengage.com**.

---

## Tips and Best Practices

**Send consistently.** Aim for **8 to 12 campaigns per month**. Subscribers who receive regular, relevant notifications are more likely to stay engaged. Too few campaigns leads to subscriber churn from inactivity.

**Use AI Write for speed.** When you are short on time or unsure what to write, AI Write produces professional copy in seconds. Pick the best option and make small edits rather than starting from scratch.

**Track ROI with UTM parameters.** Keep UTM tracking enabled on every campaign and connect your PushEngage account to Google Analytics 4. You will be able to see exactly how much traffic and revenue each campaign drives.

**Use subscriber timezone delivery.** When scheduling campaigns, enabling subscriber timezone delivery consistently improves open rates by reaching subscribers during their active hours rather than in the middle of their night.

**Check Insights regularly.** The Insights dashboard generates recommendations based on your real account data. Review it weekly and act on one recommendation per week to steadily improve your push notification performance.

**Match your tone to the content.** Use Urgent or FOMO tones for sales and limited-time offers. Use Friendly or Casual for community content. Use Professional for B2B audiences. The tone you choose affects the language AI uses across the title, message, and CTA buttons.

**Create segments early.** Even if you have a small subscriber list, setting up URL-based segments now means you can target more precisely as your list grows. The extension makes this easy to do without leaving your page.

---

## Troubleshooting

**"Session expired" message appears**
Your login session ended due to inactivity or a timeout. Click the extension icon and log in again. Your draft will be restored after you log back in.

**Extension panel opens but shows a blank screen**
Refresh the current browser tab and click the extension icon again. This usually happens on pages that load content dynamically and take extra time to initialize.

**AI Write button does nothing or returns an error**
Check your internet connection. AI Write uses your PushEngage credits and requires an active connection to the PushEngage API. If the issue persists, check your PushEngage account for AI credit balance.

**Draft did not restore when I reopened the extension**
Drafts are stored per URL and expire after 24 hours. If you opened the extension on a slightly different URL (for example, with different query parameters), it will not find the previous draft. Drafts also clear if browser storage is wiped.

**CTA buttons section is grayed out or not available**
Action buttons require the **Growth plan or above**. The extension will show an upgrade prompt. Visit your PushEngage dashboard to upgrade your plan.

**Segments are not showing up**
Segments require the **Business plan or above**. If you are on a qualifying plan and still do not see segments, try refreshing the extension by closing and reopening it on the same page.

**Scheduled send option is not available**
Scheduled sending requires the **Growth plan or above**. Upgrade your plan to unlock this feature.

**Site selector is not appearing**
The site selector only appears if your account has more than one site registered. If you manage a single site, it is not shown.

**Campaign was sent but I do not see it in my dashboard**
It may take a few seconds to a minute for the campaign to appear in your PushEngage dashboard. Refresh the Campaigns page. If it does not appear after a few minutes, check the extension for an error message and try resending.

---

*For additional help, visit the PushEngage Help Center at help.pushengage.com or contact support through your dashboard.*
