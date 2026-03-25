# PushEngage Campaign Creator — Feature Showcase

> **For Marketing & Sales Teams** | Internal Document | March 2026

---

## What Is It?

A Chrome extension that lets PushEngage customers create and send push notification campaigns directly from any webpage — without switching to the dashboard. It auto-fills content, generates AI-powered copy, and detects social media links to create smart CTAs.

PushEngage itself is a **multichannel engagement platform** — not just push notifications. The platform supports web push, mobile app push, chat widgets (21 channels including WhatsApp, Messenger, Instagram), drip automations, triggered campaigns (cart abandonment, price drop, back-in-stock), and visual workflow automation. The extension is the fastest entry point into this broader ecosystem.

**One-line pitch:** "Create a push campaign from any page in 30 seconds — with AI that writes your copy and knows your audience."

---

## Why This Matters

### The Problem
Customers currently need to:
1. Copy the page URL manually
2. Switch to the PushEngage dashboard
3. Paste the URL, write a title, write a message
4. Find an image, set UTM parameters
5. Configure buttons, pick segments, send

**Average time: 3-5 minutes per campaign.** Power users sending 5+ campaigns/day lose significant time.

### The Solution
With the extension:
1. Navigate to any page
2. Click the extension icon — content auto-fills
3. Click "AI Write" — title, message, and CTA buttons generated
4. Click "Send Now"

**Average time: 30 seconds.** That's a 6-10x speedup.

---

## Key Features to Highlight

### 1. AI-Powered Campaign Copy (Gemini 2.5 Flash)

**What it does:** One click generates 3 complete campaign options — each with a unique title, message, and smart CTA button pair. **Now 50-60% cheaper per session** with optimized token limits, trimmed prompts, and in-memory caching.

**What makes it different:**
- Not generic "Learn More" buttons. The AI reads the page type (blog, product, video) and social links to generate context-aware CTAs
- An article about cooking → "Get Recipe" / "Save Recipe"
- A product page → "Shop Now" / "Add to Cart" (also detects out-of-stock → "Join Waitlist" and pre-order → "Pre-Order Now")
- A page with a YouTube video → "Read Article" (btn1, links to page) / "Watch Video" (btn2, links to YouTube)
- Tone selector: Default, Urgent, Friendly, Professional, Casual, Exciting, FOMO
- Feedback loop: type "make it shorter" and regenerate
- **Smart caching:** Same page generates same CTAs instantly on repeat clicks (no additional API cost)

**Talking point:** "PushEngage is the first push notification platform with AI that generates both your copy AND your CTA strategy based on what's on the page."

### 2. Smart Social Media CTAs

**What it does:** Automatically detects YouTube, Instagram, Facebook, Twitter, TikTok, and podcast links on any page. Uses them to generate intelligent secondary CTA buttons.

**How it works:**
- Button 1 always drives to the page itself ("Read Article", "Book Now", "Shop Now")
- Button 2 drives to the social platform detected ("Watch Video" → YouTube URL, "Follow Us" → Instagram URL)
- Manual override: social links picker lets users quick-fill from detected platforms with one click

**Priority:** YouTube > Instagram > Facebook > Twitter > TikTok > Podcast

**Talking point:** "Turn every blog post into a multi-channel engagement moment. One push notification can drive traffic to your article AND your YouTube channel."

### 3. Draft Auto-Save (Never Lose Work)

**What it does:** Every form change is auto-saved (1.5 second debounce). Close the popup, reopen on the same page — your draft is exactly where you left it. Navigate to a different page — fresh form, no stale data.

**How it works:**
- Drafts are scoped per-URL — each page gets its own draft
- Preferences (UTM defaults, button settings, tone) persist across all pages
- Drafts expire after 24 hours

**Talking point:** "Accidentally closed the extension? Your campaign is still there. No more lost work."

### 4. Contextual Header Nudge (Smart Motivation)

**What it does:** Instead of static performance numbers, the header shows a single, prioritized motivational message based on the user's current situation.

**Priority waterfall:**
1. Revenue earned → "$1,240 revenue from recent campaigns — keep it going"
2. Subscriber growth → "+520 new subscribers this week — send a campaign to engage them"
3. High CTR → "4.2% CTR on your last campaign — your audience is engaged"
4. Inactive (7+ days) → "8.5K subscribers waiting — it's been 7 days since your last campaign"
5. Active account → "12.5K subscribers across 3 segments — try targeting one"
6. New account → "Optimize your opt-in popup to start collecting subscribers"

**Why it matters:** Every message motivates action. Users see what to do next, not just numbers.

**Talking point:** "The extension knows where you are in your push notification journey and guides you to the next best action — automatically."

### 5. Session Security

**What it does:** 6-hour inactivity timeout with automatic logout. Background checks run every 30 minutes. Red badge indicator when session expires.

**Why it matters:** Enterprise customers require session management. This is table-stakes for security-conscious teams.

### 6. Content Extraction Engine

**What it does:** Reads 15+ data points from any page:
- Title, description, URL, OG images
- Page type (article, product, YouTube video, Instagram post, podcast, etc. — 20+ types)
- Social media links (scans all page links for YouTube, Instagram, Twitter, Facebook, etc.)
- Embedded videos (YouTube iframes, Vimeo, HTML5 video)
- Product info from JSON-LD structured data (price, currency, rating)
- Keywords, publish date, author

**Talking point:** "The extension understands the page you're on — whether it's a blog post, a product page, or a YouTube video — and tailors your campaign accordingly."

### 7. JTBD Recommendations (AI-Powered Next Steps)

**What it does:** The Insights page shows up to 4 personalized recommendation cards, each telling the user exactly what to do next to grow their push notification results.

**How it works:**
- A detection engine evaluates the user's account: subscriber count, campaign frequency, CTR, plan features, segment usage
- Recommendations are scored by impact and the top 4 are shown
- AI generates personalized copy using the user's actual numbers ("Your 2.1% CTR is below the 4% average — try A/B testing")
- Fallback: static template text if AI is unavailable

**Categories:**
- **Activation**: Set up opt-in, send first campaign
- **Optimization**: A/B test low CTR, re-engage inactive subscribers, increase frequency
- **Multichannel**: Add Chat Widget, set up welcome drip
- **Upsell**: Unlock segments, unlock A/B testing, enable Goal Tracking

**Zero-state magic:** New accounts don't see empty dashboards. Instead:
- "Unlimited growth potential — set up your opt-in"
- "Your first campaign is 2 minutes away"
- "Add a Chat Widget to your site — free to start"

**Talking point:** "PushEngage doesn't just show you data — it tells you what to do with it. Every recommendation is personalized to your account."

### 8. Smart Page-Type CTA Detection

**What it does:** The AI reads the page type (blog, product, video course, podcast, etc.) and generates contextually appropriate CTA buttons — not just generic "Read More."

**Examples:**
| Page Type | Button 1 | Button 2 |
|-----------|----------|----------|
| Blog article | Read Article | Save for Later |
| Product page | Shop Now | Add to Cart |
| Video course | Watch Course | Start Learning |
| YouTube video | Watch Now | Subscribe |
| Podcast episode | Listen Now | Subscribe |

**Why it matters:** Generic CTAs like "Learn More" get ignored. Context-aware CTAs drive 2-3x higher click-through rates.

**Talking point:** "The extension understands whether you're sharing a blog post, a product page, or a video course — and writes the perfect call-to-action automatically."

---

## Use Cases for Sales Conversations

### E-commerce / Shopify Stores
"Your team publishes 20 products a week. With the extension, each product page becomes a push campaign in 30 seconds. The AI generates 'Shop Now' and 'Add to Cart' buttons automatically. UTM parameters are pre-filled so every click is tracked in GA4."

### Content Publishers / Bloggers
"Every new blog post = one click to send a push notification. The AI reads your article and writes 3 headline options. If you have a YouTube channel linked on the page, the second button automatically says 'Watch Video' and points to your YouTube URL."

### SaaS Companies
"Your marketing team can send targeted push notifications from any landing page. Feature launch? Navigate to the feature page, click AI Write, send. The extension even detects embedded demo videos and creates 'Watch Demo' CTAs."

### Media / News Sites
"Breaking news? The journalist doesn't need dashboard access. They click the extension on the article page, AI writes the headline, they hit send. 30 seconds from publish to push."

### Multichannel Engagement
"Your support team fields questions across WhatsApp, Messenger, and Instagram. With PushEngage's Chat Widget, one embed covers all 21 channels. Pair it with push notifications for a complete re-engagement strategy — push brings them back, chat converts them."

### Video Course / Tutorial Sites
"Every course page automatically gets 'Watch Course' and 'Start Learning' buttons instead of generic 'Read More.' The extension detects video content pages — whether it's a Teachable course, WPBeginner tutorial, or any page with /courses/ in the URL — and tailors the CTAs accordingly."

---

## Competitive Advantage

| Feature | PushEngage Extension | Competitors |
|---------|---------------------|-------------|
| AI copy generation | 3 options with tone control | None or basic |
| Smart CTA detection | Social links + page type aware | Generic "Learn More" |
| Content auto-extraction | 15+ data points from any page | Title + URL only |
| Draft auto-save | Per-URL scoped, survives popup close | None |
| Session security | 6-hour timeout with background checks | Basic or none |
| Smart contextual nudges | Priority-based motivational messages | Static numbers or none |
| JTBD recommendations | AI-powered next-best-action cards | Generic tips or none |
| Multichannel chat widget | 21 channels (WhatsApp, Messenger, Instagram DM, Telegram, etc.) | None or basic |
| Triggered campaigns | Cart abandonment, price drop, back-in-stock | Limited or none |
| Workflow automation | Visual builder with branching, A/B splits | Basic drips only |

---

## Plan Gating (Upsell Opportunities)

| Feature | Free | Growth | Premium | Business | Enterprise |
|---------|------|--------|---------|----------|------------|
| Basic campaign creation | Yes | Yes | Yes | Yes | Yes |
| AI Write (copy generation) | Limited credits | More credits | Unlimited | Unlimited | Unlimited |
| Action buttons (CTA) | No | Yes | Yes | Yes | Yes |
| Segment targeting | No | No | No | Yes | Yes |
| A/B testing | No | No | Yes | Yes | Yes |
| Triggered campaigns (cart, price drop, back-in-stock) | No | Yes | Yes | Yes | Yes |
| Schedule send | No | Yes | Yes | Yes | Yes |
| Revenue tracking | No | No | Yes | Yes | Yes |
| Subscriber timezone send | No | No | Yes | Yes | Yes |
| Chat widget premium features | No | No | Yes | Yes | Yes |

**Upsell trigger:** When a Free user tries Action Buttons or Segments, they see a tasteful upgrade nudge: "Action buttons available on Growth plan and above" with an Upgrade button.

---

## Demo Script (2 minutes)

1. **Open any blog page** (e.g., wpbeginner.com)
2. **Click extension** — show auto-filled title, description, URL, featured image
3. **Click "AI Write"** — show 3 options with different titles, messages, and CTA buttons
4. **Point out the CTA buttons**: "Notice it says 'Read Guide' for button 1 and 'Watch Video' for button 2 — it detected a YouTube link on this page"
5. **Show the social links picker** in Action Buttons: "Users can also manually pick which social platform to link"
6. **Show the header nudge**: "See how it motivates action — it says '+520 new subscribers this week — send a campaign to engage them' because this account has growth"
7. **Close and reopen the popup**: "Draft is still here — auto-saved"
8. **Navigate to a product page** and reopen: "Fresh form for the new page, but preferences like UTM are remembered"

---

## Assets Needed for Launch

- [ ] Chrome Web Store listing copy and screenshots
- [ ] Product Hunt launch copy
- [ ] Blog post: "Introducing the PushEngage Chrome Extension"
- [ ] Video walkthrough (2-3 minutes)
- [ ] Email announcement to existing customers
- [ ] In-dashboard banner linking to Chrome Web Store
- [ ] Social media posts (Twitter, LinkedIn, Facebook)
- [ ] Help docs: installation guide, feature walkthrough
- [ ] Help docs: JTBD recommendations guide (what each recommendation means)
- [ ] Video walkthrough update: show header nudge and recommendation cards

---

*Document maintained by the Product team. For technical details, see [PROJECT.md](PROJECT.md).*
