// Friends: an anonymous profile on the friends server (FRIENDS_SERVER in config.js) and the
// list of linked friends. The recovery code that signs this device in, the private
// nicknames and a copy of the last friends list (for offline) are kept on this device under
// FRIENDS_KEY, apart from the habit state. Nicknames never leave the device.

import { FRIENDS_SERVER } from './config.js';

const FRIENDS_KEY = 'habit-checker:friends';

export const friendsEnabled = () => Boolean(FRIENDS_SERVER);

// `admin` (from GET /me) shows the feedback inbox in the ⋮ menu.
const noFriends = () => ({ code: '', me: null, admin: false, friends: [], nicknames: {}, sent: '' });

export function loadFriends() {
  try {
    return { ...noFriends(), ...JSON.parse(localStorage.getItem(FRIENDS_KEY)) };
  } catch {
    return noFriends();
  }
}

export function saveFriends(data) {
  try {
    localStorage.setItem(FRIENDS_KEY, JSON.stringify(data));
  } catch {
    // Blocked storage: the profile lasts for this session only.
  }
}

// Errors carry the HTTP status (0 when the server can't be reached) for app.js to word.
export class ServerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(method, path, { code, body } = {}) {
  const headers = {};
  if (code) headers.Authorization = `Bearer ${code}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${FRIENDS_SERVER}${path}`, { method, headers, body: body && JSON.stringify(body) });
  } catch (err) {
    throw new ServerError(0, err.message);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ServerError(res.status, data.error || `server answered ${res.status}`);
  return data;
}

export const createProfile = (name) => api('POST', '/profiles', { body: { adj: name.adj, animal: name.animal } });
export const fetchMe = (code) => api('GET', '/me', { code });
export const sendStats = (code, stats) => api('PUT', '/me/stats', { code, body: stats });
export const deleteProfile = (code) => api('DELETE', '/me', { code });
export const createInvite = (code) => api('POST', '/invites', { code });
export const previewInvite = (code, invite) => api('GET', `/invites/${encodeURIComponent(invite)}`, { code });
export const acceptInvite = (code, invite) => api('POST', `/invites/${encodeURIComponent(invite)}/accept`, { code });
export const removeFriend = (code, id) => api('DELETE', `/friends/${encodeURIComponent(id)}`, { code });
// Feedback needs no profile; reading and clearing it needs an admin profile.
export const sendFeedback = (feedback) => api('POST', '/feedback', { body: feedback });
export const fetchFeedback = (code) => api('GET', '/feedback', { code });
export const deleteFeedback = (code, id) => api('DELETE', `/feedback/${encodeURIComponent(id)}`, { code });
