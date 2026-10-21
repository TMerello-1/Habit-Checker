// The "What's new" list in the Help dialog, newest first, in English and German. Pure,
// so the banner logic is tested under Node.
//
// When a change ships, add an entry at the top with the next `v`. `notable: true` also
// shows a one-time "New: …" banner to people who already use the app; keep that for
// changes they'd want to know about, not fixes.

export const CHANGELOG = [
  {
    v: 24, date: '2026-10-21', notable: true,
    en: 'Your habits now sync between devices: sign in with the same recovery code on two phones (or phone and browser), and new habits, edits and check-ins from both show up on each.',
    de: 'Deine Gewohnheiten synchronisieren sich jetzt zwischen Geräten: Melde dich mit demselben Wiederherstellungscode auf zwei Handys (oder Handy und Browser) an, und neue Gewohnheiten, Änderungen und Häkchen von beiden erscheinen auf jedem.',
  },
  {
    v: 23, date: '2026-10-21',
    en: 'Feedback you send while you have a profile now carries your profile name, so the team knows who it\'s from. Without a profile it\'s still sent, just without a name.',
    de: 'Feedback, das du mit Profil sendest, trägt jetzt deinen Profilnamen, damit das Team weiß, von wem es kommt. Ohne Profil wird es weiter gesendet, nur ohne Namen.',
  },
  {
    v: 22, date: '2026-10-21',
    en: 'My profile has "Sign out and clear this phone": it backs up, then removes your habits and profile from this phone only. Your recovery code brings everything back.',
    de: 'Mein Profil hat „Abmelden und Handy leeren“: Es sichert und entfernt dann deine Gewohnheiten und dein Profil nur von diesem Handy. Dein Wiederherstellungscode holt alles zurück.',
  },
  {
    v: 21, date: '2026-10-19',
    en: 'Switching on "Pile up missed rounds" now starts the pile at 0 that day, and earlier days keep their streak badges. The button to take back a round is now ↶.',
    de: 'Wenn du „Verpasste Runden stapeln“ einschaltest, startet der Stapel jetzt an dem Tag bei 0, und frühere Tage behalten ihre Serien-Abzeichen. Der Knopf, um eine Runde zurückzunehmen, ist jetzt ↶.',
  },
  {
    v: 20, date: '2026-10-19', notable: true,
    en: 'Pile habits: missed rounds pile up for the next day, and with a weekly or monthly target you can catch up any day before Sunday or the month\'s end and keep your streak. Turn it on when adding or editing a habit.',
    de: 'Stapel-Gewohnheiten: Verpasste Runden stapeln sich für den nächsten Tag, und mit Wochen- oder Monatsziel holst du sie an jedem Tag bis Sonntag oder Monatsende nach und behältst deine Serie. Einschalten beim Hinzufügen oder Bearbeiten einer Gewohnheit.',
  },
  {
    v: 19, date: '2026-10-19',
    en: 'My profile shows when your habits were last backed up, with a "Back up now" button.',
    de: 'Mein Profil zeigt, wann deine Gewohnheiten zuletzt gesichert wurden, mit einem Knopf „Jetzt sichern“.',
  },
  {
    v: 18, date: '2026-10-19', notable: true,
    en: 'Your recovery code now brings back your habits too: with a profile, your habits, their history and your friends\' nicknames are backed up, encrypted so only your code can read them.',
    de: 'Dein Wiederherstellungscode holt jetzt auch deine Gewohnheiten zurück: Mit Profil werden deine Gewohnheiten, ihr Verlauf und die Spitznamen deiner Freunde gesichert, verschlüsselt, sodass nur dein Code sie lesen kann.',
  },
  {
    v: 17, date: '2026-10-19', notable: true,
    en: 'Feedback gets answers: replies and reactions to what you sent show up under ⋮ → Send feedback, with a notification, and you can answer back. It all stays anonymous.',
    de: 'Feedback bekommt Antworten: Antworten und Reaktionen auf dein Feedback erscheinen unter ⋮ → Feedback senden, mit Benachrichtigung, und du kannst zurückschreiben. Alles bleibt anonym.',
  },
  {
    v: 16, date: '2026-10-19',
    en: 'Signing in with your recovery code is easier to find: it\'s in the ⋮ menu while you have no profile. On iPhone, the home screen app explains that it keeps its own data, apart from Safari.',
    de: 'Die Anmeldung mit dem Wiederherstellungscode ist leichter zu finden: Ohne Profil steht sie im ⋮-Menü. Auf dem iPhone erklärt die App auf dem Home-Bildschirm, dass sie eigene Daten hat, getrennt von Safari.',
  },
  {
    v: 15, date: '2026-10-19',
    en: 'Help explains how to get reminders on your smartwatch or fitness band.',
    de: 'Die Hilfe erklärt, wie Erinnerungen auf deine Smartwatch oder dein Fitnessband kommen.',
  },
  {
    v: 14, date: '2026-10-18',
    en: 'Invite links now open the Android app directly (after updating it). Without the app they open the web app as before.',
    de: 'Einladungslinks öffnen jetzt direkt die Android-App (nach dem Update). Ohne App öffnen sie wie bisher die Web-App.',
  },
  {
    v: 13, date: '2026-10-18',
    en: 'Fits small screens, like a flip phone\'s cover display: a slimmer header, sheets that scroll with their title in view, and the ⋮ menu always on screen.',
    de: 'Passt auf kleine Bildschirme wie das Außendisplay eines Klapphandys: schmalere Kopfzeile, Fenster, die mit sichtbarem Titel scrollen, und das ⋮-Menü immer im Bild.',
  },
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
