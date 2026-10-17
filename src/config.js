// Address of the push server (server/ in this repo, deployed to Cloudflare Workers).
// Empty means no server: reminders then only fire while the app is open.
export const PUSH_SERVER = 'https://habit-checker-push.habits-f6268550.workers.dev';

// Address of the friends server (friends-server/ in this repo, deployed to Cloudflare
// Workers). Empty means no server: the Friends section stays hidden.
export const FRIENDS_SERVER = 'https://habit-checker-friends.habits-f6268550.workers.dev';
