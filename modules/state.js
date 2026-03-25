// modules/state.js
// Central state store with event-driven updates

const _state = {
  token: null, user: null, sites: [], activeSiteId: null,
  siteDetails: null, permissions: {},
  planInfo: { name: '', currentPlan: 0, subscribersLimit: 0, segmentLimit: 0, notificationLimit: 0 },
  planLimits: { notifications: { used: 0, total: 0 }, aiCredits: { used: 0, total: 0 } },
  compose: {
    title: '', message: '', url: '', imageUrl: '', bigImage: '',
    segments: [], audienceType: 'all', actions: [],
    utmEnabled: false,
    utmParams: { source: '', medium: '', campaign: '', term: '', content: '' },
    scheduleType: 'now', scheduleDate: '', scheduleTime: '', timezoneSend: false
  },
  pageData: null, segmentsList: [], subscriberCount: 0, aiCreditsRemaining: 0, siteUtmDefaults: {}, recentNotifications: [],
  currentScreen: 'login', loading: false, recentSends: []
};

const _listeners = {};

export function getState(key) {
  if (!key) return { ..._state };
  const keys = key.split('.');
  let val = _state;
  for (const k of keys) { if (val == null) return undefined; val = val[k]; }
  return val;
}

export function setState(key, value) {
  const keys = key.split('.');
  let target = _state;
  for (let i = 0; i < keys.length - 1; i++) {
    if (target[keys[i]] == null) target[keys[i]] = {};
    target = target[keys[i]];
  }
  const lastKey = keys[keys.length - 1];
  const oldValue = target[lastKey];
  target[lastKey] = value;
  emit(key, value, oldValue);
}

export function on(event, callback) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(callback);
  return () => off(event, callback);
}

export function off(event, callback) {
  if (!_listeners[event]) return;
  _listeners[event] = _listeners[event].filter(cb => cb !== callback);
}

export function emit(event, ...args) {
  (_listeners[event] || []).forEach(cb => cb(...args));
  (_listeners['*'] || []).forEach(cb => cb(event, ...args));
}

export function resetCompose() {
  setState('compose', {
    title: '', message: '', url: '', imageUrl: '', bigImage: '',
    segments: [], audienceType: 'all', actions: [],
    utmEnabled: false,
    utmParams: { source: '', medium: '', campaign: '', term: '', content: '' },
    scheduleType: 'now', scheduleDate: '', scheduleTime: '', timezoneSend: false
  });
}

export function resetAll() {
  setState('token', null); setState('user', null); setState('sites', []);
  setState('activeSiteId', null); setState('siteDetails', null);
  setState('permissions', {});
  setState('planInfo', { name: '', currentPlan: 0, subscribersLimit: 0, segmentLimit: 0, notificationLimit: 0 });
  setState('planLimits', { notifications: { used: 0, total: 0 }, aiCredits: { used: 0, total: 0 } });
  setState('segmentsList', []); setState('aiCreditsRemaining', 0); setState('recentNotifications', []);
  setState('currentScreen', 'login');
  resetCompose();
}
