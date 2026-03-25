// content.js
// On-demand page data extraction — injected via chrome.scripting.executeScript
// Returns sanitized page metadata

(function() {
  'use strict';

  function extract() {
    const data = {
      title: '',
      description: '',
      url: '',
      image: '',
      images: [],
      author: '',
      siteName: ''
    };

    // URL — prefer canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    data.url = canonical?.href || window.location.href;

    // Title — prefer OG, then document title
    const ogTitle = getMeta('og:title');
    data.title = ogTitle || document.title || '';

    // Description — prefer OG, then meta description
    data.description = getMeta('og:description') || getMeta('description') || getArticleExcerpt();

    // Image — prefer OG image, then first large image
    const ogImage = getMeta('og:image');
    const twitterImage = getMeta('twitter:image');
    data.image = validateImageUrl(ogImage) || validateImageUrl(twitterImage) || findFeaturedImage();

    // Author
    data.author = getMeta('author') || getJsonLdField('author') || '';

    // Site name
    data.siteName = getMeta('og:site_name') || '';

    // Product info from structured data (must run before pageType detection)
    data.productInfo = getProductInfo();

    // Page type detection — YouTube, social, video, blog, product, e-commerce, etc.
    data.pageType = detectPageType(data.url, data.productInfo);

    // OG type (video.other, article, product, etc.)
    data.ogType = getMeta('og:type') || '';

    // Video duration if available (YouTube, Vimeo, etc.)
    data.videoDuration = getMeta('video:duration') || getJsonLdField('duration') || '';

    // Social/external links found on the page
    data.socialLinks = findSocialLinks();

    // Embedded videos (YouTube iframes, video elements)
    data.embeddedVideos = findEmbeddedVideos();

    // Keywords / tags from page
    data.keywords = getMeta('keywords') || '';

    // Article publish date
    data.publishDate = getMeta('article:published_time') || getJsonLdField('datePublished') || '';

    // Collect large images
    data.images = Array.from(document.querySelectorAll('img'))
      .filter(img => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        return w >= 200 && h >= 100;
      })
      .slice(0, 8)
      .map(img => ({
        src: validateImageUrl(img.src),
        alt: (img.alt || '').substring(0, 100)
      }))
      .filter(img => img.src);

    return data;
  }

  function getMeta(name) {
    const el = document.querySelector(
      `meta[property="${name}"], meta[name="${name}"]`
    );
    return el?.getAttribute('content') || '';
  }

  function getJsonLdField(field) {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const json = JSON.parse(script.textContent);
        if (json[field]) {
          return typeof json[field] === 'string' ? json[field] : json[field]?.name || '';
        }
      }
    } catch { /* ignore parse errors */ }
    return '';
  }

  function getArticleExcerpt() {
    const selectors = ['article p', '.post-content p', '.entry-content p', 'main p', '.content p'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim().length > 30) {
        return el.textContent.trim().substring(0, 200);
      }
    }
    return '';
  }

  function findFeaturedImage() {
    const selectors = [
      'article img[src]',
      '.post-thumbnail img[src]',
      '.featured-image img[src]',
      'main img[src]'
    ];
    for (const sel of selectors) {
      const img = document.querySelector(sel);
      if (img?.src) {
        const validated = validateImageUrl(img.src);
        if (validated) return validated;
      }
    }
    return '';
  }

  function findEmbeddedVideos() {
    const videos = [];
    // YouTube iframes
    document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"], iframe[data-src*="youtube.com"]').forEach(iframe => {
      const src = iframe.src || iframe.dataset.src || '';
      if (src && videos.length < 5) {
        // Extract video ID and build watch URL
        const match = src.match(/(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        videos.push({
          platform: 'youtube',
          embedUrl: src,
          watchUrl: match ? `https://www.youtube.com/watch?v=${match[1]}` : src,
          title: iframe.title || ''
        });
      }
    });
    // Vimeo
    document.querySelectorAll('iframe[src*="vimeo.com"]').forEach(iframe => {
      if (videos.length < 5) {
        videos.push({ platform: 'vimeo', embedUrl: iframe.src, watchUrl: iframe.src, title: iframe.title || '' });
      }
    });
    // HTML5 video
    document.querySelectorAll('video[src], video source[src]').forEach(el => {
      const src = el.src || el.querySelector('source')?.src || '';
      if (src && videos.length < 5) {
        videos.push({ platform: 'html5', embedUrl: src, watchUrl: src, title: '' });
      }
    });
    return videos;
  }

  function getProductInfo() {
    // Try JSON-LD Product schema
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        const json = JSON.parse(script.textContent);
        const item = json['@type'] === 'Product' ? json : (Array.isArray(json['@graph']) ? json['@graph'].find(g => g['@type'] === 'Product') : null);
        if (item) {
          const offer = Array.isArray(item.offers) ? item.offers[0] : (item.offers || {});
          return {
            name: item.name || '',
            price: offer.price || offer.lowPrice || '',
            currency: offer.priceCurrency || '',
            availability: offer.availability || '',
            rating: item.aggregateRating?.ratingValue || ''
          };
        }
      }
    } catch {}
    // Try meta price
    const price = getMeta('product:price:amount') || getMeta('og:price:amount');
    if (price) {
      return { name: '', price, currency: getMeta('product:price:currency') || getMeta('og:price:currency') || '', availability: '', rating: '' };
    }
    return null;
  }

  function detectPageType(url, productInfo) {
    if (!url) return 'page';
    const u = url.toLowerCase();

    // ── Social platforms (exact domain matches first) ──
    if (u.includes('youtube.com/watch') || u.includes('youtu.be/')) return 'youtube_video';
    if (u.includes('youtube.com/playlist')) return 'youtube_playlist';
    if (u.includes('youtube.com/@') || u.includes('youtube.com/channel') || u.includes('youtube.com/c/')) return 'youtube_channel';
    if (u.includes('youtube.com')) return 'youtube';
    if (u.includes('vimeo.com/')) return 'video';
    if (u.includes('instagram.com/p/') || u.includes('instagram.com/reel/')) return 'instagram_post';
    if (u.includes('instagram.com/')) return 'instagram';
    if (u.includes('twitter.com/') || u.includes('x.com/')) return 'twitter';
    if (u.includes('facebook.com/') || u.includes('fb.com/')) return 'facebook';
    if (u.includes('linkedin.com/')) return 'linkedin';
    if (u.includes('tiktok.com/')) return 'tiktok';
    if (u.includes('pinterest.com/')) return 'pinterest';
    if (u.includes('reddit.com/')) return 'reddit';
    if (u.includes('/podcast') || u.includes('spotify.com/') || u.includes('anchor.fm/')) return 'podcast';
    if (u.includes('soundcloud.com/') || u.includes('music.apple.com/') || u.includes('music.amazon')) return 'music';
    if (u.includes('eventbrite.com/') || u.includes('meetup.com/') || u.includes('lu.ma/')) return 'event';

    // ── E-commerce: product availability subtypes ──
    const ogType = (getMeta('og:type') || '').toLowerCase();
    const isProduct = ogType.includes('product') || !!document.querySelector('[itemtype*="Product"]') || !!(productInfo && productInfo.price);
    if (isProduct) {
      const avail = ((productInfo && productInfo.availability) || '').toLowerCase();
      if (avail.includes('outofstock') || avail.includes('soldout') || avail.includes('discontinued'))
        return 'product_outofstock';
      if (avail.includes('preorder') || avail.includes('presale'))
        return 'product_preorder';
      return 'product';
    }

    // ── E-commerce: page-level patterns ──
    if (/\/(?:collections?|catalogue|catalog|category|shop\/?)$/i.test(u) ||
        /\/(?:products?|shop)\/?(?:\?|$)/i.test(u) ||
        document.querySelectorAll('[itemtype*="Product"]').length > 1)
      return 'catalogue';
    if (/\/(?:sale|deals?|offers?|coupons?|promotions?|clearance|black-friday|flash-sale)(?:\/|$)/i.test(u))
      return 'offer';
    if (/\/(?:coming-soon|launch|pre-launch|waitlist|notify-me)(?:\/|$)/i.test(u))
      return 'coming_soon';
    if (/\/(?:cart|checkout|basket)(?:\/|$)/i.test(u))
      return 'checkout';

    // ── Content type heuristics from meta + DOM ──
    if (ogType.includes('video')) return 'video';
    if (ogType.includes('music') || ogType.includes('song') || ogType.includes('album')) return 'music';
    if (ogType.includes('profile')) return 'profile';
    if (document.querySelector('[itemtype*="Event"]')) return 'event';
    if (document.querySelector('[itemtype*="Recipe"]') || document.querySelector('[itemtype*="recipe"]')) return 'recipe';
    if (document.querySelector('[itemtype*="Course"]') || document.querySelector('[itemtype*="course"]')) return 'course';

    // ── URL path heuristics ──
    if (/\/(?:courses?|lessons?|tutorials?|training|learn|class(?:es)?|workshop)(?:\/|$)/i.test(u) ||
        /^https?:\/\/(?:videos?|learn|academy|courses?)\./i.test(u)) return 'course';
    if (/\/(?:recipes?|cooking|cook)(?:\/|$)/i.test(u)) return 'recipe';
    if (/\/(?:events?|webinars?|conference|summit|meetups?)(?:\/|$)/i.test(u)) return 'event';
    if (/\/(?:downloads?|get|install|releases?)(?:\/|$)/i.test(u)) return 'download';
    if (/\/(?:pricing|plans|buy|checkout|order|subscribe)(?:\/|$)/i.test(u)) return 'pricing';
    if (/\/(?:gallery|photos?|portfolio|showcase)(?:\/|$)/i.test(u)) return 'gallery';
    if (/\/(?:docs?|documentation|guide|handbook|wiki|help|faq|support)(?:\/|$)/i.test(u)) return 'documentation';
    if (/\/(?:jobs?|careers?|hiring|openings|positions?)(?:\/|$)/i.test(u)) return 'job';
    if (/\/(?:news|press|announcements?)(?:\/|$)/i.test(u)) return 'news';
    if (/\/(?:reviews?|testimonials?|ratings?)(?:\/|$)/i.test(u)) return 'review';

    // ── Homepage detection (root path or exact domain) ──
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/' || parsed.pathname === '') return 'homepage';
    } catch {}

    if (ogType === 'article' || document.querySelector('article')) return 'article';
    return 'page';
  }

  function findSocialLinks() {
    const links = {};
    const anchors = document.querySelectorAll('a[href]');
    const patterns = {
      youtube: /youtube\.com|youtu\.be/,
      instagram: /instagram\.com/,
      twitter: /twitter\.com|x\.com/,
      facebook: /facebook\.com|fb\.com/,
      linkedin: /linkedin\.com/,
      tiktok: /tiktok\.com/,
      pinterest: /pinterest\.com/,
      spotify: /spotify\.com/,
      soundcloud: /soundcloud\.com/,
      podcast: /anchor\.fm|podcasts\.apple\.com|podcasts\.google\.com|overcast\.fm|pocketcasts\.com/
    };
    for (const a of anchors) {
      const href = a.href || '';
      for (const [platform, regex] of Object.entries(patterns)) {
        if (!links[platform] && regex.test(href)) {
          links[platform] = href;
        }
      }
    }
    return links;
  }

  function validateImageUrl(src) {
    if (!src) return '';
    try {
      const url = new URL(src, window.location.href);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.href;
      }
    } catch { /* invalid URL */ }
    return '';
  }

  return extract();
})();
