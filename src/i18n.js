// UI text in English and German. The language follows the browser or phone setting
// (app.js calls setLang(pickLang(navigator.languages))) and falls back to English.
// Pure apart from the current language, so the other modules' tests run in English.

export const STRINGS = {
  en: {
    level: 'Level',
    pts: 'pts',
    install: '📲 Install app',
    enableReminders: '🔔 Turn on reminders',
    today: 'Today',
    todaySummary: '{done} of {total} done',
    nothingToday: 'Nothing scheduled today',
    badges: 'Badges',
    firstBadge: 'Hit a 3-day streak to earn your first badge.',
    badge: '{emoji} {m}-day streak',
    newHabit: 'New habit',
    editHabit: 'Edit habit',
    chooseEmoji: 'Choose emoji',
    emoji: 'Emoji',
    namePlaceholder: 'e.g. Morning run',
    habitName: 'Habit name',
    customEmojiLabel: 'Or type your own',
    customEmoji: 'Custom emoji',
    days: 'Days',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    remindAt: 'Remind me at',
    cancel: 'Cancel',
    addHabit: 'Add habit',
    saveChanges: 'Save changes',
    allHabits: 'All habits',
    noneYet: 'None yet',
    moveData: 'Move your data',
    moveIntro: 'Copy your habits, streaks and points here, then paste them into the Android app or another browser.',
    copyData: '📋 Copy my data',
    pastePlaceholder: 'Paste copied data here',
    importLabel: 'Data to import',
    replaceData: 'Replace my data with this',
    replaceConfirm: { one: 'Replace your {n} habit?', other: 'Replace your {n} habits?' },
    imported: { one: 'Imported {n} habit', other: 'Imported {n} habits' },
    copied: 'Copied. Now paste it in the other app.',
    copyByHand: 'Select and copy the text in the box.',
    confirmTitle: 'Are you sure?',
    confirmText: "Don't trick yourself. 😉",
    confirmHabit: "Did you really do {name} today? Don't trick yourself. 😉",
    notYet: 'Not yet',
    yesDone: 'Yes, I did it',
    milestoneToast: '🏆 {m}-day streak on {name}! +50 bonus',
    pointsToast: '+10 points · {streak}🔥',
    markDone: 'Mark {name} done',
    currentStreak: 'Current streak',
    edit: 'Edit {name}',
    delete: 'Delete {name}',
    deleteConfirm: 'Delete?',
    pickDay: 'Pick at least one day',
    saved: 'Saved {name}',
    installed: 'Installed! Open Habit Checker from your home screen.',
    remindersPreview: 'Reminders are off in this preview. They need the installed app.',
    remindersBlocked: 'Notifications are blocked. Allow them for this site in your browser settings to get reminders.',
    reminderTitle: '{emoji} Time for: {name}',
    reminderBody: 'Keep your streak going!',
    notData: "That doesn't look like copied Habit Checker data.",
    newerData: 'That data is from a newer version. Update this app first.',
    damagedData: 'Some habits in that data are damaged, so nothing was imported.',
    'install.ios': 'Tap the Share button (the square with an arrow, at the bottom of Safari), then "Add to Home Screen".',
    'install.edge-android': 'Tap the ≡ menu at the bottom right, swipe the panel up, then tap "Add to phone".',
    'install.samsung': 'Tap the ≡ menu at the bottom right, then "Add page to" → "Home screen".',
    'install.firefox-android': 'Tap the ⋮ menu, then "Add to Home screen".',
    'install.other': 'Open your browser menu and choose "Install app" or "Add to Home screen".',
  },
  de: {
    level: 'Level',
    pts: 'Pkt.',
    install: '📲 App installieren',
    enableReminders: '🔔 Erinnerungen einschalten',
    today: 'Heute',
    todaySummary: '{done} von {total} erledigt',
    nothingToday: 'Heute steht nichts an',
    badges: 'Abzeichen',
    firstBadge: 'Schaff eine 3-Tage-Serie für dein erstes Abzeichen.',
    badge: '{emoji} {m}-Tage-Serie',
    newHabit: 'Neue Gewohnheit',
    editHabit: 'Gewohnheit bearbeiten',
    chooseEmoji: 'Emoji auswählen',
    emoji: 'Emoji',
    namePlaceholder: 'z. B. Morgenlauf',
    habitName: 'Name der Gewohnheit',
    customEmojiLabel: 'Oder gib dein eigenes ein',
    customEmoji: 'Eigenes Emoji',
    days: 'Tage',
    weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    remindAt: 'Erinnerung um',
    cancel: 'Abbrechen',
    addHabit: 'Hinzufügen',
    saveChanges: 'Speichern',
    allHabits: 'Alle Gewohnheiten',
    noneYet: 'Noch keine',
    moveData: 'Daten übertragen',
    moveIntro: 'Kopiere hier deine Gewohnheiten, Serien und Punkte und füge sie dann in der Android-App oder einem anderen Browser ein.',
    copyData: '📋 Meine Daten kopieren',
    pastePlaceholder: 'Kopierte Daten hier einfügen',
    importLabel: 'Zu importierende Daten',
    replaceData: 'Meine Daten hiermit ersetzen',
    replaceConfirm: { one: 'Deine {n} Gewohnheit ersetzen?', other: 'Deine {n} Gewohnheiten ersetzen?' },
    imported: { one: '{n} Gewohnheit importiert', other: '{n} Gewohnheiten importiert' },
    copied: 'Kopiert. Jetzt in der anderen App einfügen.',
    copyByHand: 'Markier den Text im Feld und kopier ihn.',
    confirmTitle: 'Bist du sicher?',
    confirmText: 'Beschummel dich nicht selbst. 😉',
    confirmHabit: 'Hast du {name} heute wirklich erledigt? Beschummel dich nicht selbst. 😉',
    notYet: 'Noch nicht',
    yesDone: 'Ja, geschafft!',
    milestoneToast: '🏆 {m}-Tage-Serie bei {name}! +50 Bonus',
    pointsToast: '+10 Punkte · {streak}🔥',
    markDone: '{name} abhaken',
    currentStreak: 'Aktuelle Serie',
    edit: '{name} bearbeiten',
    delete: '{name} löschen',
    deleteConfirm: 'Löschen?',
    pickDay: 'Wähl mindestens einen Tag aus',
    saved: '{name} gespeichert',
    installed: 'Installiert! Öffne Habit Checker über deinen Startbildschirm.',
    remindersPreview: 'In dieser Vorschau sind Erinnerungen aus. Dafür brauchst du die installierte App.',
    remindersBlocked: 'Benachrichtigungen sind blockiert. Erlaube sie für diese Seite in den Browser-Einstellungen, um Erinnerungen zu bekommen.',
    reminderTitle: '{emoji} Zeit für: {name}',
    reminderBody: 'Bleib an deiner Serie dran!',
    notData: 'Das sieht nicht nach kopierten Habit-Checker-Daten aus.',
    newerData: 'Die Daten stammen aus einer neueren Version. Aktualisiere zuerst diese App.',
    damagedData: 'Einige Gewohnheiten in den Daten sind beschädigt, deshalb wurde nichts importiert.',
    'install.ios': 'Tippe auf „Teilen“ (das Quadrat mit dem Pfeil unten in Safari) und dann auf „Zum Home-Bildschirm“.',
    'install.edge-android': 'Tippe unten rechts auf das ≡-Menü, wisch das Feld nach oben und tippe auf „Zum Telefon hinzufügen“.',
    'install.samsung': 'Tippe unten rechts auf das ≡-Menü, dann auf „Seite hinzufügen zu“ → „Startbildschirm“.',
    'install.firefox-android': 'Tippe auf das ⋮-Menü und dann auf „Zum Startbildschirm hinzufügen“.',
    'install.other': 'Öffne das Menü deines Browsers und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.',
  },
};

export const LANGUAGES = Object.keys(STRINGS);
let current = 'en';

// The first of the user's preferred languages (e.g. ["de-AT", "en"]) that the app has.
export function pickLang(languages = []) {
  for (const tag of languages) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGUAGES.includes(base)) return base;
  }
  return 'en';
}

export function setLang(lang) {
  current = LANGUAGES.includes(lang) ? lang : 'en';
}

export function getLang() {
  return current;
}

// Looks up `key` in the current language (English if it's missing there) and fills in
// {placeholders} from `vars`. A `n` var picks the one/other form of plural strings.
export function t(key, vars = {}) {
  let s = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  if (typeof s === 'object' && !Array.isArray(s)) s = vars.n === 1 ? s.one : s.other;
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
