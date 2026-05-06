// modules/api.js
// HTTP client for PushEngage Adonis API

import { getState } from './state.js';

const API_BASE = 'https://dashboard-public-api.pushengage.com/d/v1';

class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(method, path, body = null) {
  const token = getState('token');
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${path}`, opts);

  if (response.status === 401) throw new ApiError('Session expired. Please log in again.', 401);
  if (response.status === 403) throw new ApiError('You do not have permission for this action.', 403);

  let data;
  try { data = await response.json(); } catch {
    if (!response.ok) throw new ApiError(`Request failed (${response.status})`, response.status);
    return null;
  }

  if (!response.ok) {
    // Extract a readable error message string (never an object)
    let msg = `Request failed (${response.status})`;
    if (typeof data?.message === 'string') msg = data.message;
    else if (typeof data?.error === 'string') msg = data.error;
    else if (typeof data?.error?.message === 'string') msg = data.error.message;
    // Log full error details to console for debugging
    console.error('[api] Error response:', JSON.stringify(data, null, 2));
    throw new ApiError(msg, response.status, data);
  }
  return data;
}

// --- Auth ---
// GET /auth returns { status, data: { user_id, user_email, sites: {id: name}, owner, permissions, ... } }
export async function getAuthUser() { return request('GET', '/auth'); }
export async function logout() { return request('POST', '/auth/logout'); }

// --- Sites ---
// GET /sites/:id returns { status, data: { site_id, site_name, ... settings }, user: { ... permissions, owner } }
export async function getSiteDetails(siteId) { return request('GET', `/sites/${siteId}`); }

// --- Site Settings ---
// GET /sites/:id/settings/utm_settings returns { status, data: { enabled, utm_source, utm_medium, utm_campaign, utm_term, utm_content } }
export async function getUtmSettings(siteId) {
  return request('GET', `/sites/${siteId}/settings/utm_settings`);
}

// --- Subscribers ---
// GET /sites/:id/subscribers/count/active_subscriber_count returns { status, data: { count: number } }
export async function getActiveSubscriberCount(siteId) {
  return request('GET', `/sites/${siteId}/subscribers/count/active_subscriber_count`);
}

// --- Notifications ---
export async function createNotification(siteId, payload, action = 'sent') {
  return request('POST', `/sites/${siteId}/notifications?action=${action}&type=generic`, payload);
}
export async function listNotifications(siteId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request('GET', `/sites/${siteId}/notifications${query ? '?' + query : ''}`);
}
export async function getNotification(siteId, notificationId) {
  return request('GET', `/sites/${siteId}/notifications/${notificationId}`);
}

// --- Segments ---
export async function listSegments(siteId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request('GET', `/sites/${siteId}/segments${query ? '?' + query : ''}`);
}
export async function createSegment(siteId, payload) {
  return request('POST', `/sites/${siteId}/segments`, payload);
}
export async function updateSegment(siteId, segmentId, payload) {
  return request('PATCH', `/sites/${siteId}/segments/${segmentId}`, payload);
}
export async function getGeoSegments(siteId) {
  return request('GET', `/sites/${siteId}/geo-segments`);
}

// --- Analytics ---
// All analytics endpoints use start_created_at / end_created_at
export async function getAnalyticsSummary(siteId, startDate, endDate) {
  const params = new URLSearchParams({ start_created_at: startDate, end_created_at: endDate });
  return request('GET', `/sites/${siteId}/analytics/summary?${params}`);
}
export async function getNotificationResultSummary(siteId) {
  return request('GET', `/sites/${siteId}/analytics/notification-result/summary`);
}
export async function getNotificationResultTimeseries(siteId, startDate, endDate, groupBy = 'day') {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, group_by: groupBy });
  return request('GET', `/sites/${siteId}/analytics/notification-result/timeseries?${params}`);
}
export async function getOptinAnalytics(siteId, startDate, endDate) {
  const params = new URLSearchParams({ start_created_at: startDate, end_created_at: endDate });
  return request('GET', `/sites/${siteId}/analytics/optin?${params}`);
}

// --- AI (PushEngage generative AI with credit tracking) ---
// POST /sites/:id/generative-ai/text-generation
// type: 'notification_title' | 'notification_message'
// Returns { data: { generated_sentences: string[], usage: number }, meta: { credit_usage_history_id } }
export async function generateText(siteId, { type, count = 3, description, tone, language }) {
  const body = { type, count, description };
  if (tone) body.tone = tone;
  if (language) body.language = language;
  return request('POST', `/sites/${siteId}/generative-ai/text-generation`, body);
}

// GET /accounts/:ownerId/credit-usages/credits
// Returns { data: { remaining_credit: number } }
export async function getAiCredits(ownerId) {
  return request('GET', `/accounts/${ownerId}/credit-usages/credits`);
}

// --- Helpers ---
// Extract notifications array from various response shapes
export function extractNotifications(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (result.data && result.data.data && Array.isArray(result.data.data)) return result.data.data;
  if (result.data && Array.isArray(result.data)) return result.data;
  return [];
}

export { ApiError };
