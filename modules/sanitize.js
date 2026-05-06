// modules/sanitize.js
// Security utilities for sanitizing user-controlled and page-extracted data

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

export function sanitizeUrl(src) {
  if (!src || typeof src !== 'string') return '';
  try {
    const url = new URL(src);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    return '';
  } catch { return ''; }
}

export function sanitizeImageUrl(src) {
  if (!src || typeof src !== 'string') return '';
  try {
    const url = new URL(src);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

export function truncate(str, maxLen) {
  if (typeof str !== 'string') return '';
  const chars = [...str];
  if (chars.length <= maxLen) return str;
  const truncated = chars.slice(0, maxLen).join('');
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxLen * 0.7 ? truncated.substring(0, lastSpace) : truncated;
}

export function sanitizePageData(data) {
  const sanitized = {
    title: truncate(data.title || '', 85),
    description: truncate(data.description || '', 135),
    url: sanitizeUrl(data.url || ''),
    image: sanitizeImageUrl(data.image || ''),
    images: (data.images || [])
      .map(img => ({ src: sanitizeImageUrl(img.src || img), alt: (img.alt || '').substring(0, 100) }))
      .filter(img => img.src),
    author: (data.author || '').substring(0, 100),
    siteName: (data.siteName || '').substring(0, 100)
  };

  // Page context fields used for smart CTA generation
  if (data.pageType) sanitized.pageType = String(data.pageType).substring(0, 50);
  if (data.ogType) sanitized.ogType = String(data.ogType).substring(0, 50);
  if (data.keywords) sanitized.keywords = String(data.keywords).substring(0, 200);
  if (data.publishDate) sanitized.publishDate = String(data.publishDate).substring(0, 30);
  if (data.videoDuration) sanitized.videoDuration = String(data.videoDuration).substring(0, 20);

  // Social links — sanitize each URL
  if (data.socialLinks && typeof data.socialLinks === 'object') {
    sanitized.socialLinks = {};
    for (const [platform, url] of Object.entries(data.socialLinks)) {
      const clean = sanitizeUrl(url);
      if (clean) sanitized.socialLinks[platform.substring(0, 20)] = clean;
    }
  }

  // Embedded videos — sanitize URLs
  if (Array.isArray(data.embeddedVideos) && data.embeddedVideos.length > 0) {
    sanitized.embeddedVideos = data.embeddedVideos.slice(0, 5).map(v => ({
      platform: String(v.platform || '').substring(0, 20),
      embedUrl: sanitizeUrl(v.embedUrl || ''),
      watchUrl: sanitizeUrl(v.watchUrl || ''),
      title: String(v.title || '').substring(0, 100)
    })).filter(v => v.embedUrl || v.watchUrl);
  }

  // Product info from structured data
  if (data.productInfo && typeof data.productInfo === 'object') {
    sanitized.productInfo = {
      name: String(data.productInfo.name || '').substring(0, 100),
      price: String(data.productInfo.price || '').substring(0, 20),
      currency: String(data.productInfo.currency || '').substring(0, 10),
      availability: String(data.productInfo.availability || '').substring(0, 50),
      rating: String(data.productInfo.rating || '').substring(0, 10)
    };
  }

  return sanitized;
}

export function setText(el, text) {
  if (el) el.textContent = text;
}
