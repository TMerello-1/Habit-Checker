// Bundles the app into one self-contained HTML fragment for the hosted phone preview
// (a claude.ai Artifact). Inlines styles.css, the icon, and the ES modules in
// dependency order with import/export lines stripped. Usage:
//   node tools/build-preview.mjs > dist/preview.html
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const modules = ['src/dates.js', 'src/habits.js', 'src/i18n.js', 'src/store.js', 'src/config.js', 'src/push.js', 'src/reminders.js', 'src/install.js', 'src/transfer.js', 'src/app.js'];
const js = modules
  .map((m) => read(m).replace(/^import .*;\n/gm, '').replace(/^export /gm, ''))
  .join('\n');

const body = read('index.html')
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[^>]*src="src\/app\.js"[^>]*><\/script>/, '');

const icon = `data:image/svg+xml,${encodeURIComponent(read('icons/icon.svg').replace(/<metadata>[\s\S]*?<\/metadata>/, ''))}`;

process.stdout.write(`<title>Habit Checker</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="icon" href="${icon}">
<style>
${read('styles.css')}
</style>
${body.trim()}
<script type="module">
${js.replaceAll("'icons/icon.svg'", JSON.stringify(icon))}
</script>
`);
