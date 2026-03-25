// modules/ai.js
// Unified AI module.
// - Notification title & message: PushEngage generative-ai endpoint (uses account AI credits)
// - CTA button text: Gemini (no PE endpoint yet)
// - Segment names: PushEngage generative-ai endpoint (uses account AI credits)
// - Insights analysis: Gemini direct (structured JSON; no PE endpoint for this)
//
// TODO: Replace the 3 separate generation calls (title, message, CTA) with a single
// PE API endpoint for full campaign copy generation. This will:
// 1. Save tokens (one call instead of three)
// 2. Produce more coherent copy (title, message, CTAs generated together)
// 3. Remove Gemini dependency for CTA generation
// Proposed endpoint: POST /sites/:id/generative-ai/campaign-copy
// Request:  { description, tone?, language?, count: 3 }
// Response: { data: { suggestions: [{ title, message, btn1, btn2 }] } }

import { getState } from './state.js';
import * as api from './api.js';

// ── Gemini (for CTA buttons + insights — structured JSON output) ───
const GEMINI_KEY = 'AIzaSyDA2hyKObcR-aryNAPciXWpDfz6HuUeIiY';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

// In-memory caches — cleared when popup closes (no persistence needed)
const _ctaCache = new Map();   // key: description+pageType+count → value: CTA array
const _insightsCache = { key: null, data: null }; // single-entry session cache

async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 600,
        responseMimeType: 'application/json'
      }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `AI error (${res.status})`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  return parseGeminiJson(text);
}

/** Parse Gemini response text that may be wrapped in code fences, use single quotes,
 *  have trailing commas, or be truncated mid-string/mid-object. */
function parseGeminiJson(text) {
  if (!text) throw new Error('Empty Gemini response');

  // Strip markdown code fences
  let cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  // Helper: try JSON.parse, unwrap object-wrapped arrays
  function tryParse(str) {
    if (!str) return null;
    try {
      const parsed = JSON.parse(str);
      if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
        for (const val of Object.values(parsed)) {
          if (Array.isArray(val)) return val;
        }
      }
      return parsed;
    } catch { return null; }
  }

  // 1. Try as-is
  let result = tryParse(cleaned);
  if (result) return result;

  // 2. Fix common Gemini issues: single quotes, trailing commas, unquoted keys
  let fixed = cleaned
    .replace(/'/g, '"')
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
  result = tryParse(fixed);
  if (result) return result;

  // 3. Extract just the array portion
  const arrMatch = fixed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    result = tryParse(arrMatch[0]);
    if (result) return result;
  }

  // 4. Handle truncated responses — trim from end and close brackets
  const base = arrMatch ? arrMatch[0] : fixed;
  for (const suffix of ['"}]', '"]', '}]', ']', '"}]}', '"]]}']) {
    let trimmed = base
      .replace(/,?\s*"[^"]*$/, '')
      .replace(/,?\s*\{[^}]*$/, '')
      .replace(/,\s*$/, '');
    result = tryParse(trimmed + suffix);
    if (result) return result;

    // Try double trimming for deeply truncated responses
    let trimmed2 = trimmed
      .replace(/,?\s*"[^"]*$/, '')
      .replace(/,?\s*\{[^}]*$/, '')
      .replace(/,\s*$/, '');
    result = tryParse(trimmed2 + suffix);
    if (result) return result;
  }

  // 5. Last resort: extract individual JSON objects via regex
  const objects = [];
  const objRegex = /\{[^{}]*(?:"[^"]*"[^{}]*)*\}/g;
  let m;
  while ((m = objRegex.exec(fixed)) !== null) {
    const obj = tryParse(m[0]);
    if (obj && typeof obj === 'object') objects.push(obj);
  }
  if (objects.length > 0) return objects;

  throw new Error('Failed to parse Gemini JSON: ' + cleaned.substring(0, 120));
}

// ── Get remaining AI credits ────────────────────────────────

export async function getRemainingCredits() {
  const user = getState('user') || {};
  const ownerId = user.owner_id || user.owner?.owner_id;
  if (!ownerId) return 0;
  try {
    const result = await api.getAiCredits(ownerId);
    return result?.data?.remaining_credit || 0;
  } catch {
    return 0;
  }
}

// ── CTA button text generation (Gemini — TODO: replace with PE API) ──

// Social CTA labels for btn2 ONLY — btn1 is always the page's primary action
// Priority order: youtube > instagram > facebook > twitter > tiktok > podcast > pinterest > reddit
// LinkedIn excluded — not useful for push notification CTAs
const SOCIAL_BTN2 = {
  youtube:    'Watch Video',
  instagram:  'Follow Us',
  facebook:   'Visit Facebook',
  twitter:    'See on X',
  tiktok:     'Watch on TikTok',
  spotify:    'Listen Now',
  podcast:    'Listen Now',
  soundcloud: 'Listen Now',
  pinterest:  'View Pin',
  reddit:     'Join Discussion',
};

// Priority order for social platforms (higher value = pick first)
const SOCIAL_PRIORITY = { youtube: 10, instagram: 9, facebook: 7, twitter: 6, tiktok: 5, spotify: 4, podcast: 4, soundcloud: 3, pinterest: 3, reddit: 2 };

// Page-type fallback pairs — content-aware CTAs for every detectable page type
const CTA_BY_PAGE_TYPE = {
  // Video platforms
  youtube_video:    [{ btn1: 'Watch Now', btn2: 'Watch Later' }, { btn1: 'Play Video', btn2: 'Subscribe' }],
  youtube_playlist: [{ btn1: 'Watch Playlist', btn2: 'Subscribe' }],
  youtube_channel:  [{ btn1: 'Subscribe Now', btn2: 'Watch Videos' }],
  youtube:          [{ btn1: 'Watch Now', btn2: 'Subscribe' }],
  video:            [{ btn1: 'Watch Now', btn2: 'Watch Later' }],
  // Social platforms
  instagram_post:   [{ btn1: 'View Post', btn2: 'Follow Us' }],
  instagram:        [{ btn1: 'Follow Us', btn2: 'View Profile' }],
  twitter:          [{ btn1: 'Read Thread', btn2: 'Follow Us' }],
  facebook:         [{ btn1: 'View Post', btn2: 'Like Page' }],
  linkedin:         [{ btn1: 'Read Post', btn2: 'Connect' }],
  tiktok:           [{ btn1: 'Watch Now', btn2: 'Follow Us' }],
  pinterest:        [{ btn1: 'View Pin', btn2: 'Save Pin' }],
  reddit:           [{ btn1: 'Join Discussion', btn2: 'View Comments' }],
  // Audio content
  podcast:          [{ btn1: 'Listen Now', btn2: 'Subscribe' }, { btn1: 'Play Episode', btn2: 'Save Episode' }],
  music:            [{ btn1: 'Listen Now', btn2: 'Save to Library' }, { btn1: 'Play Now', btn2: 'Share' }],
  // Learning & courses
  course:           [{ btn1: 'Start Course', btn2: 'Save for Later' }, { btn1: 'Watch Course', btn2: 'Enroll Now' }],
  // Commerce & conversion
  product:          [{ btn1: 'Shop Now', btn2: 'View Details' }, { btn1: 'Buy Now', btn2: 'Add to Cart' }],
  product_outofstock: [{ btn1: 'Join Waitlist', btn2: 'View Similar' }, { btn1: 'Notify Me', btn2: 'Browse More' }],
  product_preorder: [{ btn1: 'Pre-Order Now', btn2: 'View Details' }, { btn1: 'Reserve Yours', btn2: 'Learn More' }],
  catalogue:        [{ btn1: 'Browse Collection', btn2: 'View All' }, { btn1: 'Shop Collection', btn2: 'Filter' }],
  offer:            [{ btn1: 'Grab Deal', btn2: 'View All Deals' }, { btn1: 'Shop Sale', btn2: 'Save Now' }],
  coming_soon:      [{ btn1: 'Get Notified', btn2: 'Learn More' }, { btn1: 'Join Waitlist', btn2: 'Share' }],
  checkout:         [{ btn1: 'Complete Order', btn2: 'View Cart' }, { btn1: 'Checkout Now', btn2: 'Continue Shopping' }],
  homepage:         [{ btn1: 'Visit Site', btn2: 'Explore' }, { btn1: 'Check It Out', btn2: 'Browse' }],
  pricing:          [{ btn1: 'View Plans', btn2: 'Compare' }, { btn1: 'Get Started', btn2: 'See Pricing' }],
  // Content types
  article:          [{ btn1: 'Read Now', btn2: 'Save for Later' }, { btn1: 'Read Article', btn2: 'Bookmark' }],
  news:             [{ btn1: 'Read Now', btn2: 'Share' }, { btn1: 'Get Details', btn2: 'Save' }],
  recipe:           [{ btn1: 'View Recipe', btn2: 'Save Recipe' }, { btn1: 'Get Recipe', btn2: 'Cook Now' }],
  review:           [{ btn1: 'Read Review', btn2: 'Compare' }, { btn1: 'See Rating', btn2: 'View All' }],
  // Interactive / events
  event:            [{ btn1: 'Register Now', btn2: 'Save Date' }, { btn1: 'RSVP Now', btn2: 'View Details' }],
  gallery:          [{ btn1: 'View Gallery', btn2: 'Share' }, { btn1: 'See Photos', btn2: 'Save' }],
  profile:          [{ btn1: 'View Profile', btn2: 'Follow' }, { btn1: 'Connect', btn2: 'Message' }],
  // Utility
  download:         [{ btn1: 'Download Now', btn2: 'View Details' }, { btn1: 'Get It Free', btn2: 'Learn More' }],
  documentation:    [{ btn1: 'Read Docs', btn2: 'Bookmark' }, { btn1: 'View Guide', btn2: 'Save' }],
  job:              [{ btn1: 'Apply Now', btn2: 'Save Job' }, { btn1: 'View Role', btn2: 'Share' }],
};

// Get sorted social platforms found on page (by priority, excluding linkedin)
function getSocialPlatforms(socialLinks, embeddedVideos) {
  const sl = socialLinks || {};
  const platforms = new Set(Object.keys(sl));
  // Add YouTube from embedded videos
  if ((embeddedVideos || []).some(v => v.platform === 'youtube')) platforms.add('youtube');
  // Remove linkedin — not useful for push CTAs
  platforms.delete('linkedin');
  // Sort by priority
  return [...platforms]
    .filter(p => SOCIAL_BTN2[p])
    .sort((a, b) => (SOCIAL_PRIORITY[b] || 0) - (SOCIAL_PRIORITY[a] || 0));
}

// Infer CTA from content keywords when page type is unknown or generic
function inferCtaFromContent(text, pageType) {
  const t = ((text || '') + ' ' + (pageType || '')).toLowerCase();
  // Watch-type content
  if (/video|watch|stream|episode|webinar|tutorial|course|lesson|demo|replay|recording/i.test(t))
    return [{ btn1: 'Watch Now', btn2: 'Save for Later' }, { btn1: 'Start Watching', btn2: 'Share' }];
  // Listen-type content
  if (/podcast|listen|audio|episode|music|song|album|playlist|radio|soundcloud|spotify/i.test(t))
    return [{ btn1: 'Listen Now', btn2: 'Save Episode' }, { btn1: 'Play Now', btn2: 'Subscribe' }];
  // Out of stock / waitlist content
  if (/out of stock|sold out|unavailable|notify me|waitlist|back.?order/i.test(t))
    return [{ btn1: 'Join Waitlist', btn2: 'View Similar' }, { btn1: 'Notify Me', btn2: 'Browse More' }];
  // Pre-order / coming soon content
  if (/pre.?order|coming soon|launching|pre.?sale|reserve|pre.?launch/i.test(t))
    return [{ btn1: 'Pre-Order Now', btn2: 'Get Notified' }, { btn1: 'Reserve Yours', btn2: 'Learn More' }];
  // Sale/offer/deal content
  if (/\b\d+%\s*off|flash sale|clearance|black friday|limited time|ends today|discount|coupon|promo/i.test(t))
    return [{ btn1: 'Grab Deal', btn2: 'View All Deals' }, { btn1: 'Shop Sale', btn2: 'Save Now' }];
  // Catalogue/collection content
  if (/collection|catalogue|catalog|browse|shop all|new arrivals|best.?sellers/i.test(t))
    return [{ btn1: 'Browse Collection', btn2: 'View All' }, { btn1: 'Shop Now', btn2: 'Filter' }];
  // Buy/shop-type content (generic product)
  if (/buy|shop|price|add to cart|order now|\$\d|€\d|£\d/i.test(t))
    return [{ btn1: 'Shop Now', btn2: 'View Details' }, { btn1: 'Buy Now', btn2: 'Add to Cart' }];
  // Download-type content
  if (/download|install|get the app|free tool|template|resource|ebook|pdf|whitepaper/i.test(t))
    return [{ btn1: 'Download Now', btn2: 'View Details' }, { btn1: 'Get It Free', btn2: 'Learn More' }];
  // Event-type content
  if (/register|rsvp|event|conference|summit|webinar|workshop|meetup|attend|join us/i.test(t))
    return [{ btn1: 'Register Now', btn2: 'Save Date' }, { btn1: 'RSVP Now', btn2: 'Details' }];
  // Recipe/cook-type content
  if (/recipe|cook|bake|ingredient|serving|kitchen|meal|dish/i.test(t))
    return [{ btn1: 'View Recipe', btn2: 'Save Recipe' }, { btn1: 'Get Recipe', btn2: 'Share' }];
  // Job-type content
  if (/job|career|hiring|apply|position|role|opening|recruit/i.test(t))
    return [{ btn1: 'Apply Now', btn2: 'Save Job' }, { btn1: 'View Role', btn2: 'Share' }];
  // Signup/trial-type content
  if (/sign up|signup|get started|free trial|create account|join now/i.test(t))
    return [{ btn1: 'Get Started', btn2: 'Learn More' }, { btn1: 'Sign Up Free', btn2: 'View Plans' }];
  // Default: generic
  return [{ btn1: 'Check It Out', btn2: 'Learn More' }, { btn1: 'View Now', btn2: 'Save for Later' }];
}

function fallbackCta(text, pageType, socialLinks, embeddedVideos) {
  const typePairs = CTA_BY_PAGE_TYPE[pageType] || [];
  const socialPlatforms = getSocialPlatforms(socialLinks, embeddedVideos);

  // Base content CTAs — btn1 is always page action, btn2 is page secondary
  // When no page type match, infer action verb from content keywords
  const inferredDefault = inferCtaFromContent(text, pageType);
  const contentPairs = typePairs.length > 0
    ? typePairs.slice(0, 3)
    : inferredDefault;

  // If no social links, return pure content CTAs
  if (socialPlatforms.length === 0) return contentPairs.slice(0, 3);

  // Mix: keep btn1 as content action, replace btn2 with social on 1-2 options
  const results = [];
  for (let i = 0; i < Math.min(contentPairs.length, 3); i++) {
    const pair = { ...contentPairs[i] };
    // Replace btn2 with social on options 2 and 3 (keep option 1 pure content)
    if (i > 0 && socialPlatforms[i - 1]) {
      pair.btn2 = SOCIAL_BTN2[socialPlatforms[i - 1]];
    }
    results.push(pair);
  }

  return results.slice(0, 3);
}

// Map CTA button text to the best URL from social links, embedded videos, + page URL
function resolveCtaUrl(btnText, socialLinks, pageUrl, embeddedVideos) {
  const lower = (btnText || '').toLowerCase();
  const sl = socialLinks || {};
  const vids = embeddedVideos || [];

  // YouTube/video actions — prefer embedded video watch URL, then social link
  if (/watch|play|video|subscribe|channel|course|tutorial|start learning|enroll/.test(lower)) {
    const ytVid = vids.find(v => v.platform === 'youtube');
    if (ytVid?.watchUrl) return ytVid.watchUrl;
    if (sl.youtube) return sl.youtube;
  }
  // Instagram
  if (/instagram|follow/.test(lower) && sl.instagram) return sl.instagram;
  // Twitter/X
  if (/tweet|thread|x\.com|twitter/.test(lower) && sl.twitter) return sl.twitter;
  // Facebook
  if (/facebook|like page/.test(lower) && sl.facebook) return sl.facebook;
  // TikTok
  if (/tiktok/.test(lower) && sl.tiktok) return sl.tiktok;
  // Pinterest
  if (/pin|pinterest/.test(lower) && sl.pinterest) return sl.pinterest;
  // Podcast
  if (/listen|episode|podcast|play now|save to library/.test(lower) && (sl.spotify || sl.podcast || sl.soundcloud)) return sl.spotify || sl.soundcloud || sl.podcast;
  // Reddit
  if (/reddit|discussion|upvote/.test(lower) && sl.reddit) return sl.reddit;

  // Default to page URL
  return pageUrl || '';
}

// Attach resolved URLs — btn1 ALWAYS gets page URL, btn2 gets social URL if applicable
function enrichCtasWithUrls(ctas, socialLinks, pageUrl, embeddedVideos) {
  return ctas.map(cta => ({
    ...cta,
    btn1Url: pageUrl, // btn1 always points to the page/blog/product
    btn2Url: resolveCtaUrl(cta.btn2, socialLinks, pageUrl, embeddedVideos)
  }));
}

async function generateCtaButtons(description, pageType, socialLinks, count = 3, embeddedVideos = [], productInfo = null) {
  // Check CTA cache (same page = same CTAs within popup session)
  const cacheKey = (description || '').substring(0, 200) + '|' + (pageType || '') + '|' + count;
  if (_ctaCache.has(cacheKey)) return _ctaCache.get(cacheKey);

  const sl = socialLinks || {};
  const hasSocial = Object.keys(sl).length > 0 || embeddedVideos.length > 0;
  const socialPlatforms = Object.keys(sl);

  // Build context about the page for smarter CTA generation
  const pageContext = [];
  if (pageType && pageType !== 'page') pageContext.push(`Page type: ${pageType.replace(/_/g, ' ')}`);

  // List social platforms (excluding linkedin) for Gemini context
  const prioritySocial = getSocialPlatforms(sl, embeddedVideos);
  if (prioritySocial.length > 0) {
    const socialDetails = prioritySocial.map(p => `${p}: ${sl[p] || '(embedded)'}`);
    pageContext.push(`Social media links on page: ${socialDetails.join(', ')}`);
  }
  if (embeddedVideos.length > 0) {
    const vids = embeddedVideos.slice(0, 3).map(v =>
      `${v.platform}${v.title ? ': "' + v.title + '"' : ''} → ${v.watchUrl || v.embedUrl}`
    );
    pageContext.push(`Embedded videos: ${vids.join(', ')}`);
  }
  // Product availability context for e-commerce
  if (productInfo) {
    const parts = [];
    if (productInfo.price) parts.push(`Price: ${productInfo.currency || '$'}${productInfo.price}`);
    if (productInfo.availability) {
      const avail = productInfo.availability.toLowerCase();
      if (avail.includes('outofstock') || avail.includes('soldout')) parts.push('Availability: OUT OF STOCK');
      else if (avail.includes('preorder')) parts.push('Availability: PRE-ORDER');
      else if (avail.includes('instock')) parts.push('Availability: In Stock');
      else parts.push(`Availability: ${productInfo.availability}`);
    }
    if (productInfo.rating) parts.push(`Rating: ${productInfo.rating}/5`);
    if (parts.length > 0) pageContext.push(`Product info: ${parts.join(', ')}`);
  }

  try {
    const socialMandate = prioritySocial.length > 0
      ? `\nIMPORTANT RULES about btn1 vs btn2:
- btn1 is ALWAYS the page's primary action (the blog URL, product page, article). Examples: "Read Article", "Book Now", "Shop Now", "Read More"
- btn2 is the secondary action. For 1-2 of the ${count} pairs, btn2 SHOULD be a social media action like "Watch Video" (YouTube), "Follow Us" (Instagram), "Listen Now" (podcast)
- NEVER put social media actions in btn1. btn1 = page action. btn2 = social/secondary.
- Do NOT use LinkedIn. Prioritize: YouTube > Instagram > Facebook > Twitter.
- Pair 1: btn1=page action, btn2=page secondary (e.g. "Book Now" / "View Details")
- Pair 2: btn1=page action, btn2=social action (e.g. "Read Article" / "Watch Video")
- Pair 3: btn1=page action, btn2=different social OR content secondary`
      : '';

    const prompt = `Generate ${count} pairs of CTA button labels for a push notification about:
"${description.substring(0, 300)}"

${pageContext.length ? 'Context:\n' + pageContext.join('\n') : ''}
${socialMandate}

Rules:
- btn1 = primary action (2-4 words, drives to page URL). Be specific to content type.
- btn2 = secondary action (2-3 words, softer alternative or social action)
- Max 20 characters each
- Match verb to content: "Watch Now" for video, "Shop Now" for products, "Read Now" for articles, "Listen Now" for audio, "Register Now" for events
- E-commerce: "Shop Now"/"Buy Now" for in-stock, "Join Waitlist"/"Notify Me" for out-of-stock, "Pre-Order Now" for pre-order
- Never use generic "Learn More" when a specific verb fits

Return JSON array: [{"btn1":"...","btn2":"..."}]`;

    let result = await callGemini(prompt);

    // Retry with simpler prompt if Gemini returned empty array
    if (Array.isArray(result) && result.length === 0) {
      console.info('[ai] Gemini returned empty CTA array, retrying with simpler prompt');
      const retryPrompt = `Generate ${count} pairs of CTA button labels for a push notification about: "${description.substring(0, 200)}"\nRules: btn1 = primary action (2-4 words), btn2 = secondary action (2-3 words), max 20 chars each.\nReturn JSON array: [{"btn1":"...","btn2":"..."}]`;
      try { result = await callGemini(retryPrompt); } catch (e) {
        console.info('[ai] CTA retry also failed:', e.message);
      }
    }

    // Validate: must be array of objects with btn1 string
    if (Array.isArray(result) && result.length > 0) {
      let valid = result
        .filter(item => item && typeof item.btn1 === 'string' && item.btn1.trim())
        .map(item => ({
          btn1: item.btn1.trim().substring(0, 25),
          btn2: (item.btn2 || '').trim().substring(0, 25) || 'Learn More'
        }));

      // POST-PROCESSING: Guarantee at least 1 social CTA when social links exist
      if (hasSocial && valid.length > 0) {
        valid = ensureSocialCta(valid, sl, embeddedVideos);
      }
      if (valid.length > 0) { _ctaCache.set(cacheKey, valid); return valid; }
    }
    console.info('[ai] Using content-aware fallback CTAs for:', pageType || 'page');
    const fb1 = fallbackCta(description, pageType, sl, embeddedVideos);
    _ctaCache.set(cacheKey, fb1);
    return fb1;
  } catch (err) {
    console.warn('[ai] Gemini CTA generation failed:', err.message);
    const fb2 = fallbackCta(description, pageType, sl, embeddedVideos);
    _ctaCache.set(cacheKey, fb2);
    return fb2;
  }
}

// Guarantee at least 1 CTA pair has a social btn2 when social links exist
function ensureSocialCta(ctas, socialLinks, embeddedVideos) {
  const socialKeywords = /watch|video|play|subscribe|follow|instagram|youtube|facebook|twitter|tiktok|pinterest|listen|podcast|reddit|channel/i;
  // Check if any btn2 already has social text
  const hasSocialBtn2 = ctas.some(c => socialKeywords.test(c.btn2));
  if (hasSocialBtn2) return ctas;

  // No social in any btn2 — inject into the last pair's btn2
  const platforms = getSocialPlatforms(socialLinks, embeddedVideos);
  if (platforms.length > 0) {
    const injected = ctas.map(function(c) { return { ...c }; });
    injected[injected.length - 1].btn2 = SOCIAL_BTN2[platforms[0]];
    return injected;
  }
  return ctas;
}

// ── Notification copy generation (PE API — uses credits) ────

export async function generateNotificationCopy(pageData, { tone, language } = {}) {
  const siteId = getState('activeSiteId');
  if (!siteId) throw new Error('No active site');

  const description = [
    pageData.title || '',
    pageData.description || '',
    pageData.url || ''
  ].filter(Boolean).join(' — ').substring(0, 500);

  if (!description) throw new Error('No page content detected. Navigate to a webpage first.');

  const pageType = pageData.pageType || 'page';
  const socialLinks = pageData.socialLinks || {};
  const embeddedVideos = pageData.embeddedVideos || [];
  const productInfo = pageData.productInfo || null;

  // Generate titles, messages (PE API) and CTAs (Gemini) in parallel
  const [titleResult, messageResult, ctaResult] = await Promise.allSettled([
    api.generateText(siteId, { type: 'notification_title', count: 3, description, tone, language }),
    api.generateText(siteId, { type: 'notification_message', count: 3, description, tone, language }),
    generateCtaButtons(description, pageType, socialLinks, 3, embeddedVideos, productInfo)
  ]);

  const titles = titleResult.status === 'fulfilled' ? (titleResult.value?.data?.generated_sentences || []) : [];
  const messages = messageResult.status === 'fulfilled' ? (messageResult.value?.data?.generated_sentences || []) : [];
  const ctas = ctaResult.status === 'fulfilled' ? (ctaResult.value || []) : fallbackCta(description, pageType, socialLinks, embeddedVideos);

  if (titles.length === 0 && messages.length === 0) {
    const err = titleResult.reason || messageResult.reason;
    throw err instanceof Error ? err : new Error('AI generation failed');
  }

  // Enrich CTAs with resolved URLs (YouTube, Instagram, etc.)
  const pageUrl = pageData.url || '';
  const enrichedCtas = enrichCtasWithUrls(ctas, socialLinks, pageUrl, embeddedVideos);
  const defaultCta = enrichCtasWithUrls(fallbackCta(description, pageType, socialLinks, embeddedVideos), socialLinks, pageUrl, embeddedVideos);

  // Build suggestions — ensure each gets a unique CTA pair with URLs
  const suggestions = [];
  for (let i = 0; i < Math.max(titles.length, messages.length); i++) {
    const cta = enrichedCtas[i] || enrichedCtas[i % enrichedCtas.length] || defaultCta[0] || { btn1: 'Check It Out', btn2: 'Learn More' };
    suggestions.push({
      title: titles[i] || titles[0] || '',
      message: messages[i] || messages[0] || '',
      btn1: cta.btn1 || 'Check It Out',
      btn2: cta.btn2 || 'Learn More',
      btn1Url: cta.btn1Url || pageUrl,
      btn2Url: cta.btn2Url || pageUrl
    });
  }

  return suggestions;
}

// ── Segment name suggestion (PE API — uses credits) ─────────

export async function suggestSegmentName(url, existingNames) {
  const siteId = getState('activeSiteId');
  if (!siteId) throw new Error('No active site');

  const description = `Suggest segment names for subscribers visiting: ${url}. Existing names: ${existingNames.join(', ') || 'none'}`;

  const result = await api.generateText(siteId, {
    type: 'notification_title', // Reuse title type for short text generation
    count: 3,
    description
  });

  return result?.data?.generated_sentences || [];
}

// ── AI-powered insights (Gemini — needs structured JSON) ────

export async function generateInsights(accountData) {
  // Session cache — insights don't change within a popup session
  const insightsCacheKey = JSON.stringify(accountData);
  if (_insightsCache.key === insightsCacheKey && _insightsCache.data) {
    return _insightsCache.data;
  }

  const prompt = `You are a push notification marketing strategist for PushEngage. Analyze this account data and provide actionable insights.

Account Data:
- Plan: ${accountData.planName || 'Unknown'}
- Total Subscribers: ${accountData.subscribers || 0}
- Subscriber Limit: ${accountData.subscriberLimit || 'Unknown'}
- Campaigns Sent (last 30 days): ${accountData.campaignsSent || 0}
- Total Clicks (last 30 days): ${accountData.totalClicks || 0}
- Average CTR: ${accountData.avgCtr || '0'}%
- Top Campaign Title: ${accountData.topCampaignTitle || 'None'}
- Top Campaign CTR: ${accountData.topCampaignCtr || '0'}%
- Active Segments: ${accountData.segmentCount || 0}
- Segments with 0 subscribers: ${accountData.emptySegments || 0}
- Has welcome drip: ${accountData.hasAutomations ? 'Yes' : 'No'}
- Last campaign date: ${accountData.lastCampaignDate || 'Never'}
- Days since last campaign: ${accountData.daysSinceLastCampaign ?? 'N/A'}

Rules:
- Generate 3-5 specific, actionable insights
- Each insight needs a clear action the user can take NOW
- Prioritize high-impact actions: more sends, better targeting, higher CTR
- If few subscribers/campaigns, focus on growth
- If active account, focus on optimization
- Be specific with numbers ("Your 2.3% CTR is below the 4% average")
- Drive users toward PushEngage features they're not using
- Keep titles under 50 chars, descriptions under 120 chars

Return JSON array:
[{"title":"...","description":"...","action":"send_campaign|create_segment|setup_drip|ab_test|open_dashboard|upgrade_plan","priority":"high|medium|low"}]`;

  const result = await callGemini(prompt);
  _insightsCache.key = insightsCacheKey;
  _insightsCache.data = result;
  return result;
}

// Raw Gemini call for custom prompts (used by recommendations engine)
export async function generateInsightsRaw(prompt) {
  return callGemini(prompt);
}
