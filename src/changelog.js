// The "What's new" list in the Help dialog, newest first, in English and German. Pure,
// so the banner logic is tested under Node.
//
// When a change ships, add an entry at the top with the next `v`. `notable: true` also
// shows a one-time "New: …" banner to people who already use the app; keep that for
// changes they'd want to know about, not fixes.

export const CHANGELOG = [
  {
    v: 12, date: '2026-10-18', notable: true,
    en: 'A fresh layout: Today comes first, add habits with the ＋ button, tap a whole row to check it off, and tap your level to see your badges. Forgot one yesterday? You can still check it off until noon.',
    de: 'Ein frisches Layout: Heute steht oben, neue Gewohnheiten legst du mit ＋ an, eine ganze Zeile hakt ab, und ein Tipp auf dein Level zeigt deine Abzeichen. Gestern eine vergessen? Bis 12 Uhr kannst du sie noch abhaken.',
  },
  {
    v: 11, date: '2026-10-18', notable: true,
    en: 'Help and this list of what\'s new, in the ⋮ menu.',
    de: 'Hilfe und diese Liste mit Neuigkeiten, im ⋮-Menü.',
  },
  {
    v: 10, date: '2026-10-18',
    en: 'Send feedback anonymously from the ⋮ menu.',
    de: 'Sende anonym Feedback über das ⋮-Menü.',
  },
  {
    v: 9, date: '2026-10-17',
    en: 'Moving your data to another phone or browser now lives in the ⋮ menu.',
    de: 'Das Übertragen deiner Daten auf ein anderes Handy oder in einen anderen Browser findest du jetzt im ⋮-Menü.',
  },
  {
    v: 8, date: '2026-10-17',
    en: 'Friends: invite friends with an anonymous profile and see each other\'s level and best streak. Your habits stay on your phone.',
    de: 'Freunde: Lade Freunde mit einem anonymen Profil ein und seht gegenseitig Level und beste Serie. Deine Gewohnheiten bleiben auf deinem Handy.',
  },
  {
    v: 7, date: '2026-10-17',
    en: 'Private habits: their names stay hidden on the widget and in reminders.',
    de: 'Private Gewohnheiten: Ihr Name bleibt im Widget und in Erinnerungen verborgen.',
  },
  {
    v: 6, date: '2026-10-17',
    en: 'Reminders now arrive even while the app is closed.',
    de: 'Erinnerungen kommen jetzt auch, wenn die App geschlossen ist.',
  },
  {
    v: 5, date: '2026-10-17',
    en: 'The Android app offers new versions itself.',
    de: 'Die Android-App bietet neue Versionen selbst an.',
  },
  {
    v: 4, date: '2026-10-16',
    en: 'German translation, following your phone\'s language.',
    de: 'Deutsche Übersetzung, passend zur Sprache deines Handys.',
  },
  {
    v: 3, date: '2026-10-16',
    en: 'Android app with a home screen widget of today\'s open habits.',
    de: 'Android-App mit einem Widget für den Startbildschirm, das die offenen Gewohnheiten von heute zeigt.',
  },
  {
    v: 2, date: '2026-10-16',
    en: 'Dark mode, an install button, foldable sections and a "Did you really do it?" check before points.',
    de: 'Dunkler Modus, ein Installieren-Knopf, einklappbare Bereiche und eine „Wirklich geschafft?“-Frage vor den Punkten.',
  },
  {
    v: 1, date: '2026-10-16',
    en: 'Pick an emoji for each habit, and edit habits after adding them.',
    de: 'Wähle ein Emoji für jede Gewohnheit und bearbeite Gewohnheiten nachträglich.',
  },
];

export const LATEST = CHANGELOG[0].v;

// The last version shipped before the app remembered what each device had seen. People
// who already had habits then count as having seen up to here.
const BEFORE_TRACKING = 10;

// The notable change to announce in the banner, or null. `seen` is the version this
// device last caught up to (null if it never stored one). A brand-new user (no habits
// yet) gets no banner: everything is new to them anyway.
export function bannerChange(seen, hasHabits) {
  if (seen == null) {
    if (!hasHabits) return null;
    seen = BEFORE_TRACKING;
  }
  return CHANGELOG.find((c) => c.notable && c.v > seen) ?? null;
}

// The changelog grouped by date, newest first: [{ date, items: [text, …] }].
export function changesByDate(lang) {
  const groups = [];
  for (const c of CHANGELOG) {
    const text = c[lang] ?? c.en;
    if (groups.at(-1)?.date === c.date) groups.at(-1).items.push(text);
    else groups.push({ date: c.date, items: [text] });
  }
  return groups;
}
