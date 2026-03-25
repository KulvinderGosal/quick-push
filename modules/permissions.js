// modules/permissions.js
// Feature gating based on actual PushEngage API response.
//
// owner.permissions shape (from GET /sites/:id → user.owner.permissions):
//   { segments: 1, notifications: { schedule: 1, ab: 1, timezone: 1, multi_action_btn: 1, repeat_schedule: 1 },
//     multi_sites: 1, multi_users: 1, settings: { custom_url: 1, ... }, image_library: 1, ... }
//
// Plan type (from user.owner.paymentSubscription.plan.plan_type):
//   "free" | "business" | "premium" | "enterprise"
//
// Features NOT in the permissions object (large_image, goal_tracking) are
// derived from plan_type — any paid plan gets large images, premium+ gets goal tracking.

import { getState } from './state.js';

function getPerms() {
  return getState('permissions') || {};
}

function getPlanType() {
  const info = getState('planInfo');
  return (info?.name || '').toLowerCase();
}

export function isPaidPlan() {
  const name = getPlanType();
  return name && name !== 'free';
}

// Check if a top-level section is enabled (e.g. segments: 1)
function sectionEnabled(section) {
  const val = getPerms()[section];
  if (val === undefined || val === null || val === 0) return false;
  if (typeof val !== 'object') return !!val;
  return true;
}

// Check a specific sub-permission within a section
function subPermission(section, key) {
  const val = getPerms()[section];
  if (val === undefined || val === null || val === 0) return false;
  if (typeof val !== 'object') return !!val;
  return !!val[key];
}

// ── Segment permissions ─────────────────────────────────────
export const canReadSegment = () => sectionEnabled('segments');
export const canWriteSegment = () => sectionEnabled('segments');

// ── Notification permissions (from API) ─────────────────────
export const canReadNotification = () => sectionEnabled('notifications');
export const canWriteScheduleNotification = () => subPermission('notifications', 'schedule');
export const canWriteTimezoneNotification = () => subPermission('notifications', 'timezone');
export const canWriteMultiActionBtn = () => subPermission('notifications', 'multi_action_btn');
export const canWriteAbTest = () => subPermission('notifications', 'ab');

// ── Plan-derived features (not in permissions object) ───────
// Large image: available on any paid plan (Business+)
export const hasLargeImagePermission = () => isPaidPlan();

// Goal tracking: available on Premium+ plans
export function hasGoalTrackingPermission() {
  const name = getPlanType();
  return ['premium', 'enterprise'].some(p => name.includes(p));
}

// Image library: explicit permission flag
export const hasImageLibrary = () => sectionEnabled('image_library');

// ── AI credits ──────────────────────────────────────────────
// Remaining credits are fetched on boot and stored in state
export function hasAiCredits() {
  return (getState('aiCreditsRemaining') || 0) > 0;
}

export function aiCreditsRemaining() {
  return getState('aiCreditsRemaining') || 0;
}

export function aiCreditsLow() {
  return hasAiCredits() && aiCreditsRemaining() < 100;
}

// ── Subscriber quota ────────────────────────────────────────
export function subscriberQuota() {
  const info = getState('planInfo') || {};
  return {
    limit: info.subscribersLimit || 0,
    planName: info.name || 'Free',
  };
}

// ── Notification quota (no per-notification limit in API) ───
export function notificationQuota() {
  // PushEngage bills by subscribers, not notifications.
  // Return non-exhausted state so the extension doesn't block sends.
  return {
    used: 0,
    total: 0,
    remaining: Infinity,
    exhausted: false,
    percentage: 0
  };
}

// ── Segment limit ───────────────────────────────────────────
export function segmentLimit() {
  const info = getState('planInfo') || {};
  return info.segmentLimit || 0;
}
