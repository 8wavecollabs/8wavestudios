// Hook writer: turns a track's analysis (BPM, key, mood, energy, tags) into ranked hook options
// plus a ready-to-paste Suno "Style" prompt and lyric sheet.
const HookWriter = (() => {
  // Each theme holds rhyme families. A family's titles rhyme with its lines, so any title + lines combo lands.
  const BANK = {
    hustle: [
      { titles: ['Up all night', 'Get it right'], lines: ["They was sleepin', I was chasin' the light", "Every dollar, yeah I'm grippin' it tight", "Started with nothin', now the future look bright", "Couldn't rest until I knew it was right", "City lit up, I was workin' all night"] },
      { titles: ['Run it up', 'Never enough'], lines: ["Started from the mud, now I'm runnin' it up", "Every time they doubt me, I just double it up", "Ain't no time to stop, no I never get stuck", "Bet it on myself, I don't need no luck", "Pour another cup, then we run it up"] },
      { titles: ['No days off', 'Pay the cost'], lines: ["Every single win, yeah I paid the cost", "Learned it from the street, never took a loss", "Seven days a week, man I'm my own boss", "Burned all the bridges that I couldn't cross"] },
    ],
    money: [
      { titles: ['Count it up', 'Back it up'], lines: ["Money comin' fast, gotta count it up", "Bag so heavy, can't even pick it up", "Said I wouldn't make it, now they all shut up", "Drop it in the safe and we lock it up", "Every time I win, I just raise the cup"] },
      { titles: ['Racks on racks', 'Never look back'], lines: ["Got the racks on racks and I'm never lookin' back", "Every move I make put a bag in the black", "Came from the bottom, now I'm stayin' on track", "Tell 'em what I'm worth, I don't cut 'em no slack"] },
      { titles: ['Paid in full', 'Pockets full'], lines: ["Every single bill came paid in full", "Diamonds on me shinin', yeah they wonderful", "Walkin' in the room, I got the gravity pull", "Pockets stay heavy and my cup stay full"] },
    ],
    love: [
      { titles: ['Ride for you', 'Die for you'], lines: ["Through the highs and lows, baby, I'd ride for you", "Everything I got, I'd put it on the line for you", "Run it back a hundred times, I'd find you", "Say the word and I'll be right beside you", "Even when it's dark, I'ma shine for you"] },
      { titles: ['Only you', 'Stay true'], lines: ["Out of everybody, it was only you", "When the world was fake, you was stayin' true", "Every single night I'm still thinkin' 'bout you", "Never had a love that I could hold onto"] },
      { titles: ['Hold me close', 'Need you most'], lines: ["When it's gettin' cold, girl, hold me close", "Out of everybody, it's you I need the most", "Got me feelin' high like I'm on a coast", "Every single night, yeah you're all I host"] },
    ],
    pain: [
      { titles: ['Let it rain', 'Feel the pain'], lines: ["Lookin' at the sky and I let it rain", "Every single scar got a story and a name", "Pour another one just to numb the pain", "Lost a lot of friends but I'm still the same", "Ain't nobody 'round when I'm callin' out names"] },
      { titles: ['On my own', 'All alone'], lines: ["Had to learn it all on my own", "Every time I need 'em, they don't pick up the phone", "Built it from the ground, now I sit on the throne", "Even in a crowd, I still feel alone"] },
      { titles: ['Too far gone', 'Movin\' on'], lines: ["Told me I would change, now I'm too far gone", "Every single tear turned into a song", "Holdin' it together but it's been too long", "Gotta keep it movin', yeah I'm movin' on"] },
    ],
    flex: [
      { titles: ['Look at me now', 'Took the crown'], lines: ["Said I'd never make it, look at me now", "Everywhere I go, yeah, they know me in town", "Came from the bottom and I took the crown", "Diamonds on my neck and they weighin' me down", "Pull up to the spot and it's shut it down"] },
      { titles: ['Different breed', 'All I need'], lines: ["I'm a different breed, I'ma always lead", "Everything I got, it was all I need", "Pull up in the foreign, yeah it's top speed", "Plant another seed, watch the money feed"] },
    ],
    party: [
      { titles: ['Turn it up', 'Fill my cup'], lines: ["When the beat drop, baby, turn it up", "Shawty on the floor, tell her fill my cup", "Ain't no slowin' down, we ain't givin' up", "Everybody in here and they goin' nuts"] },
      { titles: ['All night long', 'Play my song'], lines: ["We gon' be outside all night long", "DJ in the booth, tell him play my song", "Everybody singin' and they singin' along", "Feelin' like the summer and we can't go wrong"] },
      { titles: ['Let\'s go', 'Lose control'], lines: ["When the bass hit, baby, let's go", "Everybody move, now we lose control", "Feelin' it inside, yeah it's deep in my soul", "Hands up high, yeah we're on a roll"] },
    ],
    loyalty: [
      { titles: ['Day one', 'Ride or die'], lines: ["Real ones by my side, yeah they been there since day one", "Ain't nobody switchin', we gon' finish what we done", "Bet it on the team, we gon' win it 'fore it's done", "Brothers 'til the end, yeah, we move as one"] },
      { titles: ['Who was there', 'Still right here'], lines: ["When I had nothin', tell me who was there", "Through the storm and fire, I'm still right here", "Everybody switchin', I don't even care", "Real ones stand tall, yeah we never fear"] },
    ],
    victory: [
      { titles: ['We made it', 'Can\'t fade it'], lines: ["Look at what we built, yeah, we finally made it", "Every time they hate, they can't fade it", "Worked so hard and I never once waited", "Now they want a piece but they never paid it"] },
      { titles: ['Imperator', 'Moved up greater'], lines: ["March in like an army, call me Imperator", "Every single day, yeah I'm movin' up greater", "Take it all now, I don't wait for later", "Stand above the field like a dominator"] },
    ],
  };

  const ADLIBS = {
    dark: ['(grrah)', '(yeah)', '(uh)', '(go)'],
    aggressive: ['(what)', '(yeah)', '(brr)', '(go)'],
    sad: ['(oh no)', '(woah)', '(yeah)', '(ooh)'],
    emotional: ['(ooh)', '(yeah)', '(woah)', '(oh)'],
    hype: ['(let\'s go)', '(ayy)', '(yeah)', '(woo)'],
    bouncy: ['(ayy)', '(uh huh)', '(yeah)', '(okay)'],
    smooth: ['(mm)', '(yeah)', '(ooh)', '(baby)'],
  };

  const MOOD_THEMES = {
    dark: ['victory', 'hustle', 'flex', 'loyalty'], aggressive: ['flex', 'hustle', 'money', 'loyalty'],
    sad: ['pain', 'love', 'loyalty'], emotional: ['love', 'pain', 'hustle'],
    hype: ['party', 'money', 'flex'], bouncy: ['party', 'love', 'money'], smooth: ['love', 'money', 'party'],
  };

  const syllables = (line) => line.toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z']+/).filter(Boolean)
    .reduce((n, w) => n + Math.max(1, (w.replace(/e$/, '').match(/[aeiouy]+/g) || []).length), 0);

  const tail = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, '').trim().split(' ').pop() || '';
  function rhymes(a, b) {
    const x = tail(a), y = tail(b);
    if (x === y) return 0.7; // identical word: fine in a hook, weaker than a true rhyme
    const v = (w) => (w.match(/[aeiouy]+[^aeiouy]*$/) || [w])[0];
    return v(x) === v(y) ? 1 : x.slice(-2) === y.slice(-2) ? 0.8 : 0;
  }

  // Comfortable syllables per bar for a hook at this tempo (trap tempos read half-time).
  function targetSyllables(bpm) {
    const eff = bpm >= 130 ? bpm / 2 : bpm;
    return Math.max(7, Math.min(13, Math.round((240 / eff) * 3)));
  }

  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  const STRUCTURES = {
    chant: (t, L, ad) => [`${t}, ${t.toLowerCase()} ${ad[0]}`, L[0], `${t}, ${t.toLowerCase()} ${ad[1]}`, L[1]],
    'call & response': (t, L, ad) => [L[0], `${t} ${ad[0]}`, L[1], `${t} ${ad[1]}`],
    'build to title': (t, L, ad) => [L[0], L[1], L[2] || L[0], `${t}, ${t.toLowerCase()} ${ad[2]}`],
    melodic: (t, L, ad) => [`${t} ${ad[3]}`, L[0], L[1], `Oh, ${t.toLowerCase()}`],
  };

  function generate(track, opts = {}) {
    const mood = track.mood || 'dark';
    const themes = opts.theme && opts.theme !== 'auto' ? [opts.theme] : (MOOD_THEMES[mood] || ['hustle']);
    const ad = ADLIBS[mood] || ADLIBS.dark;
    const target = targetSyllables(track.bpm || 140);
    const r = rng((opts.seed || Date.now()) ^ (track.bpm * 977));
    const custom = (opts.title || '').trim();
    const candidates = [];

    // A custom title borrows lines from any theme whose rhyme family fits it.
    const fitsCustom = (fam) => custom && fam.lines.filter((l) => rhymes(custom, l) >= 0.8).length >= 2;
    const families = themes.flatMap((theme) => BANK[theme].map((fam) => ({ theme, fam })));
    if (custom) for (const [theme, fams] of Object.entries(BANK)) for (const fam of fams)
      if (fitsCustom(fam) && !families.some((x) => x.fam === fam)) families.push({ theme, fam });

    for (const { theme, fam } of families) {
      {
        const titles = fitsCustom(fam) ? [custom, ...fam.titles] : fam.titles;
        for (const title of titles) {
          for (const [sname, build] of Object.entries(STRUCTURES)) {
            const shuffled = [...fam.lines].sort(() => r() - 0.5);
            // Lines that rhyme with the title go first
            const lines = shuffled.sort((a, b) => rhymes(title, b) - rhymes(title, a)).slice(0, 3);
            const hook = build(title, lines, ad);
            // Score: rhyme glue, syllable fit to tempo, title repetition
            const rh = (rhymes(hook[0], hook[1]) + rhymes(hook[1], hook[3]) + rhymes(hook[2], hook[3])) / 3;
            const fit = hook.reduce((a, l) => a + Math.max(0, 1 - Math.abs(syllables(l) - target) / target), 0) / hook.length;
            const rep = hook.filter((l) => l.toLowerCase().includes(title.toLowerCase())).length / 4;
            const score = Math.round(100 * (0.4 * rh + 0.4 * fit + 0.2 * Math.min(1, rep * 2)));
            candidates.push({ title, theme, structure: sname, lines: hook, score, rhyme: rh, fit, custom: title === custom });
          }
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score + (r() - 0.5) * 6);
    // Keep the best per title so options are actually different
    const seen = new Set(), out = [];
    if (custom) { const c = candidates.find((x) => x.custom); if (c) { out.push(c); seen.add(c.title); } }
    for (const c of candidates) {
      if (seen.has(c.title)) continue;
      seen.add(c.title); out.push(c);
      if (out.length >= (opts.count || 6)) break;
    }
    return out.map((h) => ({ ...h, target, suno: sunoPrompt(track, h, opts) }));
  }

  function sunoPrompt(track, hook, opts = {}) {
    const vocal = opts.vocal || (['sad', 'emotional', 'smooth'].includes(track.mood) ? 'melodic male vocals, auto-tune' : 'male rap vocals, confident delivery');
    // Suno rejects artist names in styles, so "drake"/"type beat" tags are dropped
    const tags = (track.tags || []).filter((t) => !/type|drake|future|travis|juice|wrld/i.test(t) && t !== track.mood);
    const style = [
      ...tags.slice(0, 3), `${track.mood} ${track.bpm >= 136 ? 'trap' : 'hip hop'}`, `${track.bpm} BPM`, track.key,
      vocal, 'catchy repetitive hook', track.bpm >= 136 ? 'hard 808s, rolling hi-hats' : 'punchy drums, deep bass',
    ].filter(Boolean).join(', ');
    const lyrics = `[Intro]\n${hook.lines[0].replace(/\s*\(.*?\)$/, '')} ${'(yeah)'}\n\n[Hook]\n${hook.lines.join('\n')}\n\n[Verse 1]\n(write or generate verse here)\n\n[Hook]\n${hook.lines.join('\n')}\n\n[Outro]\n${hook.title}`;
    return { style, lyrics, exclude: 'pop punk, country, acoustic, female vocals' };
  }

  return { generate, THEMES: Object.keys(BANK), targetSyllables, syllables };
})();
