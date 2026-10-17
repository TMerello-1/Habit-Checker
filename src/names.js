// Anonymous profile names: an adjective and a cute animal, plus a number when that pair is
// already taken ("Sleepy Otter 42"). The server stores only the two list positions and the
// number, so each person sees every name in their own language.
//
// Both lists are numbered by position. Only ever append to them: changing or reordering an
// entry would rename everyone who has it. Each German adjective is a stem that takes the
// ending for the animal's gender (Schläfriger Otter, Schläfrige Eule, Schläfriges Lamm).

export const ADJECTIVES = [
  ['Sleepy', 'Schläfrig'],
  ['Happy', 'Fröhlich'],
  ['Brave', 'Mutig'],
  ['Fluffy', 'Flauschig'],
  ['Tiny', 'Winzig'],
  ['Clever', 'Schlau'],
  ['Cheerful', 'Heiter'],
  ['Cozy', 'Kuschelig'],
  ['Curious', 'Neugierig'],
  ['Gentle', 'Sanft'],
  ['Jolly', 'Lustig'],
  ['Bouncy', 'Hüpfend'],
  ['Speedy', 'Flink'],
  ['Sunny', 'Sonnig'],
  ['Lucky', 'Glücklich'],
  ['Fuzzy', 'Wuschelig'],
  ['Calm', 'Ruhig'],
  ['Bold', 'Kühn'],
  ['Wise', 'Weis'],
  ['Merry', 'Munter'],
  ['Proud', 'Stolz'],
  ['Shy', 'Schüchtern'],
  ['Silly', 'Albern'],
  ['Sweet', 'Süß'],
  ['Wild', 'Wild'],
  ['Quiet', 'Leis'],
  ['Chubby', 'Pummelig'],
  ['Dreamy', 'Verträumt'],
  ['Friendly', 'Freundlich'],
  ['Giggly', 'Kichernd'],
  ['Hungry', 'Hungrig'],
  ['Lazy', 'Faul'],
  ['Mighty', 'Stark'],
  ['Royal', 'Königlich'],
  ['Plucky', 'Tapfer'],
  ['Rosy', 'Rosig'],
  ['Shiny', 'Glänzend'],
  ['Sneaky', 'Listig'],
  ['Spotty', 'Gepunktet'],
  ['Sparkly', 'Funkelnd'],
  ['Zippy', 'Flott'],
  ['Busy', 'Fleißig'],
  ['Chill', 'Lässig'],
  ['Grumpy', 'Grummelig'],
];

// [English, German, German gender: m, f or n]
export const ANIMALS = [
  ['Otter', 'Otter', 'm'],
  ['Panda', 'Panda', 'm'],
  ['Koala', 'Koala', 'm'],
  ['Fox', 'Fuchs', 'm'],
  ['Penguin', 'Pinguin', 'm'],
  ['Hedgehog', 'Igel', 'm'],
  ['Bunny', 'Hase', 'm'],
  ['Kitten', 'Kätzchen', 'n'],
  ['Puppy', 'Welpe', 'm'],
  ['Owl', 'Eule', 'f'],
  ['Duck', 'Ente', 'f'],
  ['Squirrel', 'Eichhörnchen', 'n'],
  ['Hamster', 'Hamster', 'm'],
  ['Sloth', 'Faultier', 'n'],
  ['Raccoon', 'Waschbär', 'm'],
  ['Seal', 'Robbe', 'f'],
  ['Lamb', 'Lamm', 'n'],
  ['Piglet', 'Ferkel', 'n'],
  ['Turtle', 'Schildkröte', 'f'],
  ['Dolphin', 'Delfin', 'm'],
  ['Bear', 'Bär', 'm'],
  ['Mouse', 'Maus', 'f'],
  ['Deer', 'Reh', 'n'],
  ['Alpaca', 'Alpaka', 'n'],
  ['Llama', 'Lama', 'n'],
  ['Chick', 'Küken', 'n'],
  ['Frog', 'Frosch', 'm'],
  ['Bee', 'Biene', 'f'],
  ['Ladybug', 'Marienkäfer', 'm'],
  ['Butterfly', 'Schmetterling', 'm'],
  ['Quokka', 'Quokka', 'n'],
  ['Capybara', 'Capybara', 'n'],
  ['Hippo', 'Nilpferd', 'n'],
  ['Giraffe', 'Giraffe', 'f'],
  ['Lion', 'Löwe', 'm'],
  ['Tiger', 'Tiger', 'm'],
  ['Whale', 'Wal', 'm'],
  ['Octopus', 'Krake', 'm'],
  ['Unicorn', 'Einhorn', 'n'],
  ['Dragon', 'Drache', 'm'],
  ['Kiwi', 'Kiwi', 'm'],
  ['Lemur', 'Lemur', 'm'],
  ['Badger', 'Dachs', 'm'],
  ['Beaver', 'Biber', 'm'],
  ['Goat', 'Ziege', 'f'],
  ['Pony', 'Pony', 'n'],
  ['Ferret', 'Frettchen', 'n'],
];

const ENDINGS = { m: 'er', f: 'e', n: 'es' };

// A name is { adj, animal, num }: positions in the lists above, and 0 for no number.
export function randomName(random = Math.random) {
  return { adj: Math.floor(random() * ADJECTIVES.length), animal: Math.floor(random() * ANIMALS.length), num: 0 };
}

// The name's two words in `lang`, e.g. ["Sleepy", "Otter"].
function words({ adj, animal }, lang) {
  const a = ADJECTIVES[adj];
  const b = ANIMALS[animal];
  if (!a || !b) return ['?', '?'];
  return lang === 'de' ? [a[1] + ENDINGS[b[2]], b[1]] : [a[0], b[0]];
}

export function profileName(name, lang = 'en') {
  const [a, b] = words(name, lang);
  return name.num ? `${a} ${b} ${name.num}` : `${a} ${b}`;
}

export function initials(name, lang = 'en') {
  return words(name, lang).map((w) => w[0]).join('').toUpperCase();
}
