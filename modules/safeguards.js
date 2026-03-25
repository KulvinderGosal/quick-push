// modules/safeguards.js
import { getState, setState } from './state.js';
import { notificationQuota } from './permissions.js';

const MAX_SENDS = 5, WINDOW_MS = 600000, COOLDOWN_COUNT = 3, COOLDOWN_MS = 300000, DEDUP_MS = 3600000;

export function recordSend(title, url) {
  const sends = getState('recentSends') || [];
  sends.push({ title, url, timestamp: Date.now() });
  setState('recentSends', sends.filter(s => s.timestamp > Date.now() - DEDUP_MS));
}

export function preSendCheck(title, url, audienceSize) {
  const quota = notificationQuota();
  if (quota.exhausted) return { allowed: false, type: 'quota_exhausted', reason: `You've used all ${quota.total.toLocaleString()} notifications this month.`, quota };
  if (audienceSize > quota.remaining) return { allowed: false, type: 'quota_exceeded', reason: `Targets ${audienceSize.toLocaleString()} subs but ${quota.remaining.toLocaleString()} remaining.`, quota, audienceSize };

  const now = Date.now();
  const sends = (getState('recentSends') || []).filter(s => s.timestamp > now - WINDOW_MS);
  if (sends.length >= MAX_SENDS) {
    const waitMs = WINDOW_MS - (now - Math.min(...sends.map(s => s.timestamp)));
    return { allowed: false, type: 'rate_limited', reason: `${MAX_SENDS} campaigns in 10 minutes.`, waitMs };
  }
  if (sends.filter(s => s.timestamp > now - COOLDOWN_MS).length >= COOLDOWN_COUNT)
    return { allowed: true, type: 'cooldown', reason: "You're sending frequently. Continue?" };

  const dup = sends.find(s => s.title === title && s.url === url);
  if (dup) {
    const mins = Math.round((now - dup.timestamp) / 60000);
    return { allowed: true, type: 'duplicate', reason: `Same title+URL sent ${mins}m ago.` };
  }
  return { allowed: true, type: 'ok' };
}

export function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
