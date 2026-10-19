/* ==========================================================================
   LIFE XP - script.js
   --------------------------------------------------------------------------
   How this file is organised (top to bottom):
     1.  Configuration      - ranks, stats, achievements, default quests...
     2.  Date helpers       - local calendar dates (YYYY-MM-DD)
     3.  XP & level maths   - pure functions, no side effects
     4.  State & storage    - ONE central state object saved to localStorage
     5.  Game logic         - complete quests, streaks, achievements, rewards
     6.  UI helpers         - safe DOM builder, toasts, dialogs, sounds, bars
     7.  Views              - Dashboard, Quests, Stats, Achievements, Rewards, Settings
     8.  Events             - ONE set of listeners (event delegation)
     9.  Start-up
   Rule of thumb: sections 1-5 never touch the page; sections 6-9 never
   change game rules. User-entered text is only ever added with textContent,
   so it cannot inject HTML.
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     1. CONFIGURATION  (edit these to customise the game)
     ====================================================================== */
  const STORAGE_KEY = 'lifexp.save';   // the localStorage key
  const SCHEMA_VERSION = 1;            // bump when the saved data shape changes
  const MAX_XP = 1000;                 // biggest XP a quest may give
  const MAX_REWARD_COST = 10000;       // biggest price a reward may have
  const MAX_STAT_REWARD = 10;          // biggest stat bonus on one quest
  const MAX_ACTIVITY = 500;            // activity entries kept (completions are never trimmed)
  const NAME_MAX = 20;
  const STAT_TIER = 10;                // every 10 stat points = +1 stat level

  const CATEGORIES = [
    { name: 'Fitness', icon: '💪' },
    { name: 'Learning', icon: '📚' },
    { name: 'Productivity', icon: '⚡' },
    { name: 'Health', icon: '💧' },
    { name: 'Creativity', icon: '🎨' },
    { name: 'Social', icon: '🤝' },
    { name: 'Personal', icon: '🌟' }
  ];
  const CATEGORY_NAMES = CATEGORIES.map(c => c.name);

  // Default XP for each difficulty. "order" is used for sorting.
  const DIFFICULTIES = {
    easy:   { label: 'Easy',   xp: 10,  order: 1 },
    medium: { label: 'Medium', xp: 25,  order: 2 },
    hard:   { label: 'Hard',   xp: 50,  order: 3 },
    epic:   { label: 'Epic',   xp: 100, order: 4 }
  };

  // The five player stats and which quest categories feed them.
  const STATS = [
    { key: 'strength',     name: 'Strength',     icon: '💪', cats: ['Fitness', 'Health'],        desc: 'Physical power, energy and healthy habits.' },
    { key: 'intelligence', name: 'Intelligence', icon: '🧠', cats: ['Learning'],                 desc: 'Knowledge, study and understanding new things.' },
    { key: 'discipline',   name: 'Discipline',   icon: '🛡️', cats: ['Productivity', 'Personal'], desc: 'Focus, consistency and finishing what you start.' },
    { key: 'creativity',   name: 'Creativity',   icon: '🎨', cats: ['Creativity'],               desc: 'Imagination, practice and making new things.' },
    { key: 'social',       name: 'Social',       icon: '🤝', cats: ['Social'],                   desc: 'Kindness, teamwork and connecting with people.' }
  ];
  const STAT_KEYS = STATS.map(s => s.key);
  const STAT_BY_KEY = {};
  STATS.forEach(s => { STAT_BY_KEY[s.key] = s; });

  // Ranks, from lowest to highest. "min" is the first level of the rank.
  const RANKS = [
    { min: 1,   name: 'Beginner',    icon: '🌱', color: '#94A3B8' },
    { min: 5,   name: 'Novice',      icon: '🛡️', color: '#5EEAD4' },
    { min: 10,  name: 'Adventurer',  icon: '🧭', color: '#55D6FF' },
    { min: 20,  name: 'Elite',       icon: '⚔️', color: '#A78BFA' },
    { min: 35,  name: 'Master',      icon: '🔮', color: '#C084FC' },
    { min: 50,  name: 'Grandmaster', icon: '👑', color: '#F5C451' },
    { min: 75,  name: 'Legend',      icon: '🐉', color: '#FB923C' },
    { min: 100, name: 'Mythic',      icon: '🌌', color: '#F472B6' }
  ];

  // Achievements. "key" names a value from buildAchievementContext(); the
  // achievement unlocks when that value reaches "max".
  const ACHIEVEMENTS = [
    { id: 'first-steps',    icon: '👣', title: 'First Steps',     desc: 'Complete your first quest.',         key: 'completed',     max: 1,   unit: 'quest' },
    { id: 'getting-stronger', icon: '💪', title: 'Getting Stronger', desc: 'Complete 10 quests.',             key: 'completed',     max: 10,  unit: 'quests' },
    { id: 'dedicated',      icon: '🎯', title: 'Dedicated',       desc: 'Complete 50 quests.',                key: 'completed',     max: 50,  unit: 'quests' },
    { id: 'century-club',   icon: '💯', title: 'Century Club',    desc: 'Earn 100 lifetime XP.',              key: 'lifetimeXp',    max: 100, unit: 'XP' },
    { id: 'level-up',       icon: '⬆️', title: 'Level Up',        desc: 'Reach Level 5.',                     key: 'level',         max: 5,   unit: 'level' },
    { id: 'rising-star',    icon: '🌟', title: 'Rising Star',     desc: 'Reach Level 10.',                    key: 'level',         max: 10,  unit: 'level' },
    { id: 'on-fire',        icon: '🔥', title: 'On Fire',         desc: 'Maintain a 3-day streak.',           key: 'longestStreak', max: 3,   unit: 'days' },
    { id: 'week-warrior',   icon: '🗓️', title: 'Week Warrior',    desc: 'Maintain a 7-day streak.',           key: 'longestStreak', max: 7,   unit: 'days' },
    { id: 'early-bird',     icon: '🌅', title: 'Early Bird',      desc: 'Complete a quest before 9 AM.',      key: 'early',         max: 1,   unit: '' },
    { id: 'hard-worker',    icon: '🐲', title: 'Hard Worker',     desc: 'Complete an Epic quest.',            key: 'epic',          max: 1,   unit: '' }
  ];

  const REWARD_CATEGORIES = ['Entertainment', 'Gaming', 'Food', 'Relaxation', 'Activity', 'Other'];

  const MOTIVATION = [
    'Small steps every day add up to huge levels.',
    'You do not have to be perfect. You just have to show up.',
    'One quest at a time. That is how legends are made.',
    'Future you is cheering for the quest you do today.',
    'Consistency beats intensity. Keep that streak alive!',
    'Every XP point is proof that you showed up.',
    'Hard quests make strong heroes. You have got this.',
    'Start with the easiest quest. Momentum will do the rest.',
    'Progress, not perfection.',
    'Rest is part of the journey too. Then back to the quest board!',
    'Your only rival is who you were yesterday.',
    'Great adventurers begin with a single step.'
  ];

  // Example quests created on first launch. type: "daily" repeats every day,
  // "oneoff" can only be completed once. Fields: id, title, description,
  // category, difficulty, xp, stat, statReward, target, type.
  function makeDefaultQuests() {
    const defs = [
      ['q-water',     'Drink a glass of water',     'A tiny first win: pour a glass and drink it.',                  'Health',       'easy',   10,  'strength',     1, '1 glass',    'daily'],
      ['q-read',      'Read for 20 minutes',        'Read a book, article or manual.',                               'Learning',     'easy',   10,  'intelligence', 1, '20 minutes', 'daily'],
      ['q-homework',  'Complete homework',          'Finish your homework or study tasks for today.',                'Learning',     'medium', 25,  'intelligence', 2, '',           'daily'],
      ['q-exercise',  'Exercise for 20 minutes',    'Walk, run, stretch or lift. Anything that gets you moving.',    'Fitness',      'medium', 25,  'strength',     2, '20 minutes', 'daily'],
      ['q-clean',     'Clean your room',            'Tidy your space and put things back where they belong.',        'Personal',     'easy',   10,  'discipline',   1, '',           'daily'],
      ['q-learn',     'Learn something new',        'Watch, read or try something you did not know yesterday.',      'Learning',     'easy',   10,  'intelligence', 1, '',           'daily'],
      ['q-practise',  'Practise a skill',           'Focused time on an instrument, sport, language or craft.',      'Creativity',   'medium', 25,  'creativity',   2, '',           'daily'],
      ['q-help',      'Help someone',               'Do something kind or useful for another person.',               'Social',       'medium', 25,  'social',       2, '',           'daily'],
      ['q-important', 'Finish an important task',   'Complete the one thing you have been putting off.',             'Productivity', 'hard',   50,  'discipline',   3, '',           'daily'],
      ['q-epic',      'Reach a big personal goal',  'Finish a major project or milestone you have worked hard on.',  'Personal',     'epic',   100, 'discipline',   5, '',           'oneoff']
    ];
    const t = clock().getTime();
    return defs.map((d, i) => ({
      id: d[0], title: d[1], description: d[2], category: d[3], difficulty: d[4], xp: d[5],
      stat: d[6], statReward: d[7], target: d[8], type: d[9],
      custom: false, createdAt: t - i * 1000   // first in the list counts as the newest
    }));
  }

  function makeDefaultRewards() {
    const t = clock().getTime();
    const defs = [
      ['r-episode', 'Watch an episode of a favourite show', 'Press play and enjoy, guilt free.',          100, 'Entertainment'],
      ['r-gaming',  'Enjoy 30 minutes of gaming',           'Thirty minutes of pure fun.',                150, 'Gaming'],
      ['r-relax',   'Have a guilt-free relaxation break',   'Put your feet up. You earned it.',           200, 'Relaxation'],
      ['r-weekend', 'Choose a weekend activity',            'You pick what the family or friends do.',    500, 'Activity']
    ];
    return defs.map((d, i) => ({
      id: d[0], title: d[1], description: d[2], cost: d[3], category: d[4], custom: false, createdAt: t - i * 1000
    }));
  }

  /* ======================================================================
     2. DATE HELPERS - everything uses the player's LOCAL calendar date
     ====================================================================== */
  let clock = () => new Date();   // can be replaced by the self-tests

  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) {
    d = d || clock();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function isValidKey(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function parseKey(key) {
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function addDays(key, n) {
    const d = parseKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }
  // A whole-number day count so "consecutive days" is simple to test.
  function dayNumber(key) {
    const p = key.split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  }

  /* ======================================================================
     3. XP & LEVEL MATHS  (pure functions)
     Rule: XP needed to go from level L to L+1 = 100 + (L - 1) * 50
     ====================================================================== */
  function xpForNextLevel(level) { return 100 + (level - 1) * 50; }

  // Total XP you must have to REACH a level. Level 1 = 0, Level 2 = 100,
  // Level 3 = 250, Level 4 = 450 ... (sum of the steps, in closed form).
  function totalXpForLevel(level) {
    const n = Math.max(1, Math.floor(level)) - 1;
    return 100 * n + 25 * n * (n - 1);
  }

  // Level is always CALCULATED from lifetime XP, never stored.
  function levelFromXp(xp) {
    xp = Math.max(0, Math.floor(Number(xp) || 0));
    let level = Math.floor((-75 + Math.sqrt(5625 + 100 * xp)) / 50) + 1;  // quadratic estimate
    while (totalXpForLevel(level + 1) <= xp) level++;                      // fix rounding either way
    while (level > 1 && totalXpForLevel(level) > xp) level--;
    return Math.max(1, level);
  }

  function levelProgress(xp) {
    xp = Math.max(0, Math.floor(Number(xp) || 0));
    const level = levelFromXp(xp);
    const into = xp - totalXpForLevel(level);
    const needed = xpForNextLevel(level);
    return { level: level, into: into, needed: needed, remaining: needed - into, pct: (into / needed) * 100 };
  }

  function getRank(level) {
    let found = RANKS[0];
    RANKS.forEach(r => { if (level >= r.min) found = r; });
    return found;
  }

  function statTier(value) {
    return { level: Math.floor(value / STAT_TIER) + 1, into: value % STAT_TIER, pct: (value % STAT_TIER) * (100 / STAT_TIER) };
  }

  /* Streaks are recalculated from a list of local date keys.
     current = consecutive days ending today (or yesterday, because today
     is not over yet). longest = best run ever. */
  function computeStreaks(keys, today) {
    const nums = Array.from(new Set(keys.map(dayNumber))).sort((a, b) => a - b);
    let longest = 0, run = 0, prev = null;
    nums.forEach(n => {
      run = (prev !== null && n === prev + 1) ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = n;
    });
    const have = new Set(nums);
    const t = dayNumber(today);
    let cursor = have.has(t) ? t : (have.has(t - 1) ? t - 1 : null);
    let current = 0;
    while (cursor !== null && have.has(cursor)) { current++; cursor--; }
    return { current: current, longest: longest };
  }

  /* ======================================================================
     4. STATE & STORAGE
     One central object, saved after every important change.
     ====================================================================== */
  let state = null;
  let storageOk = true;       // false if the browser blocks localStorage
  let saveWarned = false;
  let loadNotice = '';        // shown once if saved data could not be read

  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function defaultState() {
    const stats = {};
    STAT_KEYS.forEach(k => { stats[k] = 0; });
    return {
      version: SCHEMA_VERSION,
      profile: { name: 'Player', createdAt: clock().getTime() },
      lifetimeXp: 0,          // decides level and rank, NEVER goes down
      spendableXp: 0,         // the rewards wallet
      stats: stats,
      quests: makeDefaultQuests(),
      completions: [],        // every quest completion ever (powers streaks + daily history)
      achievements: {},       // id -> unlock timestamp
      rewards: makeDefaultRewards(),
      claims: [],             // rewards claimed (the "transactions")
      activity: [],           // chronological log; shown newest first
      settings: { sound: true, animations: true, reducedEffects: false },
      meta: { welcomeDismissed: false }
    };
  }

  /* ---- Validation helpers used when loading or importing data ---- */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function toInt(v, min, max, fallback) {
    const n = Number(v);
    if (typeof v === 'boolean' || v === null || v === '' || !Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }
  function toStr(v, max, fallback) {
    if (typeof v !== 'string') return fallback === undefined ? '' : fallback;
    return v.trim().slice(0, max);
  }
  function toBool(v, fallback) { return typeof v === 'boolean' ? v : fallback; }
  const MAX_TS = 4102444800000;  // year 2100: keeps every date valid

  // When the saved shape changes in a future version, add a step here that
  // upgrades old data one version at a time.
  function migrate(raw) {
    return raw;   // version 1 is the first version, so nothing to convert yet
  }

  // Turns untrusted data (saved or imported) into a clean state object,
  // or throws an Error with a friendly message.
  function normalizeState(raw) {
    if (isObj(raw) && raw.app === 'LIFE XP' && isObj(raw.data)) raw = raw.data;   // exported wrapper
    if (!isObj(raw)) throw new Error('This file does not look like a LIFE XP backup.');
    if (!Number.isInteger(raw.version) || raw.version < 1) throw new Error('This backup has no valid version number.');
    if (raw.version > SCHEMA_VERSION) throw new Error('This backup was made by a newer version of LIFE XP.');
    raw = migrate(raw);
    if (!isObj(raw.profile) || typeof raw.lifetimeXp !== 'number' || !isObj(raw.stats) ||
        !Array.isArray(raw.quests) || !Array.isArray(raw.completions)) {
      throw new Error('This backup is missing required progress data.');
    }

    const now = clock().getTime();
    const base = defaultState();
    const out = {
      version: SCHEMA_VERSION,
      profile: { name: toStr(raw.profile.name, NAME_MAX) || 'Player', createdAt: toInt(raw.profile.createdAt, 0, MAX_TS, now) },
      lifetimeXp: toInt(raw.lifetimeXp, 0, 1000000000, 0),
      spendableXp: 0,
      stats: {},
      quests: [], completions: [], achievements: {}, rewards: [], claims: [], activity: [],
      settings: {}, meta: {}
    };
    out.spendableXp = toInt(raw.spendableXp, 0, out.lifetimeXp, 0);   // can never exceed lifetime XP
    STAT_KEYS.forEach(k => { out.stats[k] = toInt(raw.stats[k], 0, 100000, 0); });

    const questIds = new Set();
    raw.quests.slice(0, 1000).forEach(q => {
      if (!isObj(q)) return;
      const title = toStr(q.title, 60);
      if (!title) return;
      let id = toStr(q.id, 60) || uid('q');
      if (questIds.has(id)) id = uid('q');
      questIds.add(id);
      const stat = STAT_KEYS.indexOf(q.stat) >= 0 ? q.stat : '';
      const reward = stat ? toInt(q.statReward, 1, MAX_STAT_REWARD, 1) : 0;
      out.quests.push({
        id: id, title: title,
        description: toStr(q.description, 200),
        category: CATEGORY_NAMES.indexOf(q.category) >= 0 ? q.category : 'Personal',
        difficulty: DIFFICULTIES[q.difficulty] ? q.difficulty : 'medium',
        xp: toInt(q.xp, 1, MAX_XP, DIFFICULTIES[q.difficulty] ? DIFFICULTIES[q.difficulty].xp : 25),
        stat: stat, statReward: reward,
        target: toStr(q.target, 40),
        type: q.type === 'oneoff' ? 'oneoff' : 'daily',
        custom: toBool(q.custom, true),
        createdAt: toInt(q.createdAt, 0, MAX_TS, now)
      });
    });

    raw.completions.slice(0, 100000).forEach(c => {
      if (!isObj(c) || !isValidKey(c.dateKey) || typeof c.ts !== 'number' || !Number.isFinite(c.ts)) return;
      const ts = toInt(c.ts, 0, MAX_TS, now);
      out.completions.push({
        id: toStr(c.id, 60) || uid('c'),
        questId: toStr(c.questId, 60),
        title: toStr(c.title, 60, 'Quest'),
        category: CATEGORY_NAMES.indexOf(c.category) >= 0 ? c.category : 'Personal',
        difficulty: DIFFICULTIES[c.difficulty] ? c.difficulty : 'medium',
        xp: toInt(c.xp, 0, MAX_XP, 0),
        stat: STAT_KEYS.indexOf(c.stat) >= 0 ? c.stat : '',
        statReward: toInt(c.statReward, 0, MAX_STAT_REWARD, 0),
        dateKey: c.dateKey, ts: ts,
        hour: toInt(c.hour, 0, 23, new Date(ts).getHours())
      });
    });

    if (isObj(raw.achievements)) {
      ACHIEVEMENTS.forEach(a => {
        const ts = raw.achievements[a.id];
        if (typeof ts === 'number' && Number.isFinite(ts)) out.achievements[a.id] = toInt(ts, 0, MAX_TS, now);
      });
    }

    const rewardIds = new Set();
    (Array.isArray(raw.rewards) ? raw.rewards : base.rewards).slice(0, 500).forEach(r => {
      if (!isObj(r)) return;
      const title = toStr(r.title, 60);
      if (!title) return;
      let id = toStr(r.id, 60) || uid('r');
      if (rewardIds.has(id)) id = uid('r');
      rewardIds.add(id);
      out.rewards.push({
        id: id, title: title,
        description: toStr(r.description, 200),
        cost: toInt(r.cost, 1, MAX_REWARD_COST, 100),
        category: REWARD_CATEGORIES.indexOf(r.category) >= 0 ? r.category : '',
        custom: toBool(r.custom, true),
        createdAt: toInt(r.createdAt, 0, MAX_TS, now)
      });
    });

    if (Array.isArray(raw.claims)) {
      raw.claims.slice(0, 5000).forEach(c => {
        if (!isObj(c) || typeof c.ts !== 'number') return;
        out.claims.push({
          id: toStr(c.id, 60) || uid('cl'), rewardId: toStr(c.rewardId, 60),
          title: toStr(c.title, 60, 'Reward'), cost: toInt(c.cost, 0, MAX_REWARD_COST, 0),
          ts: toInt(c.ts, 0, MAX_TS, now)
        });
      });
    }

    const types = ['quest', 'reward', 'achievement', 'levelup', 'stat'];
    if (Array.isArray(raw.activity)) {
      raw.activity.forEach(a => {
        if (!isObj(a) || types.indexOf(a.type) < 0 || typeof a.ts !== 'number') return;
        out.activity.push({
          id: toStr(a.id, 60) || uid('a'), type: a.type, text: toStr(a.text, 200),
          xp: (typeof a.xp === 'number' && Number.isFinite(a.xp)) ? Math.trunc(a.xp) : null,
          ts: toInt(a.ts, 0, MAX_TS, now)
        });
      });
      out.activity.sort((x, y) => x.ts - y.ts);          // stable, keeps same-time order
      out.activity = out.activity.slice(-MAX_ACTIVITY);
    }

    const s = isObj(raw.settings) ? raw.settings : {};
    out.settings = {
      sound: toBool(s.sound, true),
      animations: toBool(s.animations, true),
      reducedEffects: toBool(s.reducedEffects, false)
    };
    out.meta = { welcomeDismissed: isObj(raw.meta) ? toBool(raw.meta.welcomeDismissed, false) : false };
    return out;
  }

  function loadState() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageOk = false;     // private mode or blocked storage: the app still works, just not saved
    }
    if (raw) {
      try {
        state = normalizeState(JSON.parse(raw));
        return;
      } catch (err) {
        // Never silently destroy data: keep a copy of what we could not read.
        try { window.localStorage.setItem(STORAGE_KEY + '.unreadable-' + Date.now(), raw); } catch (e) { /* storage full */ }
        loadNotice = 'Your saved data could not be read, so a fresh game was started. A copy of the old data was kept in this browser.';
      }
    }
    state = defaultState();
    saveState();
  }

  function saveState() {
    if (!storageOk) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (!saveWarned) {
        saveWarned = true;
        toast('Could not save your progress (browser storage is full or blocked). Export a backup from Settings.', 'error');
      }
      return false;
    }
  }

  /* ======================================================================
     5. GAME LOGIC  (changes state, never touches the page)
     ====================================================================== */
  function logActivity(type, text, xp, when) {
    state.activity.push({ id: uid('a'), type: type, text: text, xp: xp === undefined ? null : xp, ts: (when || clock()).getTime() });
    if (state.activity.length > MAX_ACTIVITY) state.activity = state.activity.slice(-MAX_ACTIVITY);
  }

  // A quest counts as done if a completion record exists:
  // daily quests -> one for today's date, one-time quests -> any date.
  function isQuestDone(q, today) {
    return state.completions.some(c => c.questId === q.id && (q.type === 'daily' ? c.dateKey === today : true));
  }

  function getStreaks() {
    return computeStreaks(state.completions.map(c => c.dateKey), dateKey());
  }

  function completionsByDate() {
    const map = {};
    state.completions.forEach(c => {
      if (!map[c.dateKey]) map[c.dateKey] = { count: 0, xp: 0 };
      map[c.dateKey].count++;
      map[c.dateKey].xp += c.xp;
    });
    return map;
  }

  function buildAchievementContext() {
    const streaks = getStreaks();
    return {
      completed: state.completions.length,
      lifetimeXp: state.lifetimeXp,
      level: levelFromXp(state.lifetimeXp),
      longestStreak: streaks.longest,
      early: state.completions.some(c => c.hour < 9) ? 1 : 0,
      epic: state.completions.some(c => c.difficulty === 'epic') ? 1 : 0
    };
  }

  // Runs after a quest is completed. Each achievement can only unlock once.
  function checkAchievements(when) {
    const ctx = buildAchievementContext();
    const unlocked = [];
    ACHIEVEMENTS.forEach(a => {
      if (state.achievements[a.id]) return;
      if (ctx[a.key] >= a.max) {
        state.achievements[a.id] = when.getTime();
        logActivity('achievement', 'Unlocked "' + a.title + '"', null, when);
        unlocked.push(a);
      }
    });
    return unlocked;
  }

  // The heart of the game. Returns {ok:false} if the quest cannot be completed,
  // so XP can only ever be awarded once per quest (per day for daily quests).
  function completeQuest(id) {
    const quest = state.quests.find(q => q.id === id);
    if (!quest) return { ok: false, reason: 'missing' };
    const today = dateKey();
    if (isQuestDone(quest, today)) return { ok: false, reason: 'already' };

    const when = clock();
    const levelBefore = levelFromXp(state.lifetimeXp);
    const rankBefore = getRank(levelBefore);
    const statGain = (quest.stat && quest.statReward > 0) ? quest.statReward : 0;

    state.completions.push({
      id: uid('c'), questId: quest.id, title: quest.title, category: quest.category,
      difficulty: quest.difficulty, xp: quest.xp, stat: statGain ? quest.stat : '', statReward: statGain,
      dateKey: today, ts: when.getTime(), hour: when.getHours()
    });
    state.lifetimeXp += quest.xp;
    state.spendableXp += quest.xp;
    logActivity('quest', 'Completed "' + quest.title + '"', quest.xp, when);

    if (statGain) {
      state.stats[quest.stat] += statGain;
      logActivity('stat', '+' + statGain + ' ' + STAT_BY_KEY[quest.stat].name + ' (now ' + state.stats[quest.stat] + ')', null, when);
    }

    const levelAfter = levelFromXp(state.lifetimeXp);
    const rankAfter = getRank(levelAfter);
    const levelsGained = levelAfter - levelBefore;
    if (levelsGained > 0) {
      let text = 'Reached Level ' + levelAfter + (levelsGained > 1 ? ' (+' + levelsGained + ' levels)' : '');
      if (rankAfter.name !== rankBefore.name) text += ' and the rank ' + rankAfter.name;
      logActivity('levelup', text, null, when);
    }

    const unlocked = checkAchievements(when);
    return {
      ok: true, quest: quest, xp: quest.xp, statGain: statGain,
      levelBefore: levelBefore, levelAfter: levelAfter, levelsGained: levelsGained,
      rankAfter: rankAfter, rankChanged: rankAfter.name !== rankBefore.name, unlocked: unlocked
    };
  }

  /* ---- Input validation for the quest and reward forms ---- */
  function validateQuestInput(v) {
    const errors = {};
    const title = String(v.title || '').trim();
    if (!title) errors.title = 'Please give your quest a title.';
    else if (title.length > 60) errors.title = 'Keep the title to 60 characters or fewer.';

    const description = String(v.description || '').trim();
    if (description.length > 200) errors.description = 'Keep the description to 200 characters or fewer.';

    if (CATEGORY_NAMES.indexOf(v.category) < 0) errors.category = 'Choose a category.';
    if (!DIFFICULTIES[v.difficulty]) errors.difficulty = 'Choose a difficulty.';
    if (v.type !== 'daily' && v.type !== 'oneoff') errors.type = 'Choose a quest type.';

    const xpText = String(v.xp === undefined ? '' : v.xp).trim();
    const xp = Number(xpText);
    if (!/^\d+$/.test(xpText) || xp < 1 || xp > MAX_XP) errors.xp = 'XP must be a whole number from 1 to ' + MAX_XP + '.';

    const stat = String(v.stat || '');
    let statReward = 0;
    if (stat) {
      if (STAT_KEYS.indexOf(stat) < 0) {
        errors.stat = 'Choose one of the five stats.';
      } else {
        const rText = String(v.statReward === undefined ? '' : v.statReward).trim();
        statReward = Number(rText);
        if (!/^\d+$/.test(rText) || statReward < 1 || statReward > MAX_STAT_REWARD) {
          errors.statReward = 'Stat points must be a whole number from 1 to ' + MAX_STAT_REWARD + '.';
        }
      }
    }

    const target = String(v.target || '').trim();
    if (target.length > 40) errors.target = 'Keep the target to 40 characters or fewer.';

    return {
      errors: errors,
      value: {
        title: title, description: description, category: v.category, difficulty: v.difficulty, type: v.type,
        xp: xp, stat: stat, statReward: stat ? statReward : 0, target: target
      }
    };
  }

  function addQuest(value) {
    const quest = {
      id: uid('q'), title: value.title, description: value.description, category: value.category,
      difficulty: value.difficulty, xp: value.xp, stat: value.stat, statReward: value.statReward,
      target: value.target, type: value.type, custom: true, createdAt: clock().getTime()
    };
    state.quests.push(quest);
    return quest;
  }

  function deleteQuest(id) {
    const q = state.quests.find(x => x.id === id);
    if (!q || !q.custom) return false;
    state.quests = state.quests.filter(x => x.id !== id);   // completion history is kept
    return true;
  }

  function validateRewardInput(v) {
    const errors = {};
    const title = String(v.title || '').trim();
    if (!title) errors.title = 'Please give your reward a title.';
    else if (title.length > 60) errors.title = 'Keep the title to 60 characters or fewer.';
    const description = String(v.description || '').trim();
    if (description.length > 200) errors.description = 'Keep the description to 200 characters or fewer.';
    const costText = String(v.cost === undefined ? '' : v.cost).trim();
    const cost = Number(costText);
    if (!/^\d+$/.test(costText) || cost < 1 || cost > MAX_REWARD_COST) errors.cost = 'Cost must be a whole number from 1 to ' + MAX_REWARD_COST + ' XP.';
    const category = String(v.category || '');
    if (category && REWARD_CATEGORIES.indexOf(category) < 0) errors.category = 'Choose a category from the list.';
    return { errors: errors, value: { title: title, description: description, cost: cost, category: category } };
  }

  function addReward(value) {
    const reward = {
      id: uid('r'), title: value.title, description: value.description, cost: value.cost,
      category: value.category, custom: true, createdAt: clock().getTime()
    };
    state.rewards.push(reward);
    return reward;
  }

  function deleteReward(id) {
    const r = state.rewards.find(x => x.id === id);
    if (!r || !r.custom) return false;
    state.rewards = state.rewards.filter(x => x.id !== id);
    return true;
  }

  // Spends SPENDABLE xp only. Lifetime XP (and so the level) is never touched.
  function claimReward(id) {
    const reward = state.rewards.find(r => r.id === id);
    if (!reward) return { ok: false, reason: 'missing' };
    if (!Number.isFinite(state.spendableXp) || state.spendableXp < reward.cost) return { ok: false, reason: 'funds', need: reward.cost - state.spendableXp };
    const when = clock();
    state.spendableXp -= reward.cost;
    state.claims.push({ id: uid('cl'), rewardId: reward.id, title: reward.title, cost: reward.cost, ts: when.getTime() });
    logActivity('reward', 'Claimed "' + reward.title + '"', -reward.cost, when);
    return { ok: true, reward: reward };
  }

  function xpOnDate(key) {
    return state.completions.reduce((sum, c) => sum + (c.dateKey === key ? c.xp : 0), 0);
  }

  // Built-in checks for the formulas. Run them from Settings or the browser
  // console with LifeXP.runSelfTests().
  function runSelfTests() {
    const results = [];
    const check = (name, cond) => results.push({ name: name, pass: !!cond });

    check('0 XP is Level 1', levelFromXp(0) === 1);
    check('99 XP is still Level 1', levelFromXp(99) === 1);
    check('exactly 100 XP is Level 2', levelFromXp(100) === 2);
    check('249 XP is still Level 2', levelFromXp(249) === 2);
    check('exactly 250 XP is Level 3', levelFromXp(250) === 3);
    check('449 XP is Level 3, 450 XP is Level 4', levelFromXp(449) === 3 && levelFromXp(450) === 4);
    check('thresholds for levels 2, 3, 4 are 100, 250, 450',
      totalXpForLevel(2) === 100 && totalXpForLevel(3) === 250 && totalXpForLevel(4) === 450);
    check('steps between levels grow by 50 XP',
      xpForNextLevel(1) === 100 && xpForNextLevel(2) === 150 && xpForNextLevel(3) === 200);
    check('1000 XP is Level 6 (several levels at once)', levelFromXp(1000) === 6);

    let boundariesOk = true;
    for (let L = 2; L <= 300; L++) {
      if (levelFromXp(totalXpForLevel(L)) !== L || levelFromXp(totalXpForLevel(L) - 1) !== L - 1) boundariesOk = false;
    }
    check('every level boundary from 2 to 300 is exact', boundariesOk);

    const p = levelProgress(250);
    check('progress at exactly 250 XP is 0 of 200 into Level 3', p.level === 3 && p.into === 0 && p.needed === 200 && p.remaining === 200);
    const p2 = levelProgress(249);
    check('progress at 249 XP is 149 of 150 into Level 2', p2.level === 2 && p2.into === 149 && p2.remaining === 1);

    const rankCases = [[1, 'Beginner'], [4, 'Beginner'], [5, 'Novice'], [9, 'Novice'], [10, 'Adventurer'], [19, 'Adventurer'],
      [20, 'Elite'], [34, 'Elite'], [35, 'Master'], [49, 'Master'], [50, 'Grandmaster'], [74, 'Grandmaster'],
      [75, 'Legend'], [99, 'Legend'], [100, 'Mythic'], [250, 'Mythic']];
    check('ranks change at exactly the right levels', rankCases.every(c => getRank(c[0]).name === c[1]));

    const s1 = computeStreaks(['2026-03-01', '2026-03-02', '2026-03-03'], '2026-03-03');
    check('3 consecutive days = streak 3', s1.current === 3 && s1.longest === 3);
    const s2 = computeStreaks(['2026-03-01', '2026-03-01', '2026-03-01'], '2026-03-01');
    check('many quests on one day = streak 1', s2.current === 1 && s2.longest === 1);
    const s3 = computeStreaks(['2026-03-01', '2026-03-02', '2026-03-03'], '2026-03-04');
    check('streak is still alive the day after (today not over yet)', s3.current === 3);
    const s4 = computeStreaks(['2026-03-01', '2026-03-02', '2026-03-03'], '2026-03-05');
    check('missing a whole day resets the current streak but keeps the best', s4.current === 0 && s4.longest === 3);
    const s5 = computeStreaks(['2026-02-28', '2026-03-01', '2026-03-02'], '2026-03-02');
    check('streaks work across month ends', s5.current === 3);
    check('addDays handles month and year ends', addDays('2026-12-31', 1) === '2027-01-01' && addDays('2026-03-01', -1) === '2026-02-28');
    return results;
  }

  /* ======================================================================
     6. UI HELPERS
     ====================================================================== */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmt = n => Number(n).toLocaleString();

  // Builds an element safely. Text goes in via textContent / text nodes,
  // so anything the user types can never become HTML.
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(k => {
        const v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (let i = 2; i < arguments.length; i++) appendKid(el, arguments[i]);
    return el;
  }
  function appendKid(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(k => appendKid(el, k)); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  function fmtDateTime(ts) {
    try { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function fmtDay(key) {
    return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function animationsOn() {
    if (!state.settings.animations) return false;
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) { /* ignore */ }
    return true;
  }
  function applySettings() {
    document.body.classList.toggle('no-anim', !state.settings.animations);
    document.body.classList.toggle('reduced-fx', !!state.settings.reducedEffects);
  }

  /* ---- Double-click guard: ignore the same action twice within a moment ---- */
  const lastFired = {};
  function guard(key, ms) {
    const now = Date.now();
    if (lastFired[key] && now - lastFired[key] < ms) return false;
    lastFired[key] = now;
    return true;
  }

  /* ---- Sound effects (tiny beeps made with the browser's audio engine) ---- */
  let audioCtx = null;
  const SOUNDS = {
    xp: [[660, 0.08], [880, 0.12]],
    achievement: [[784, 0.1], [988, 0.1], [1319, 0.22]],
    levelup: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]],
    reward: [[880, 0.08], [660, 0.14]],
    error: [[220, 0.18]]
  };
  function playSound(kind) {
    if (!state.settings.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      let t = audioCtx.currentTime;
      (SOUNDS[kind] || []).forEach(n => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = n[0];
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + n[1]);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + n[1] + 0.02);
        t += n[1];
      });
    } catch (e) { /* sound is a bonus; never break the app */ }
  }

  /* ---- Toast notifications ---- */
  function toast(message, kind) {
    kind = kind || 'info';
    const box = $('#toasts');
    if (!box) return;
    const icons = { xp: '✨', success: '✅', achievement: '🏆', warn: '⚠️', error: '⛔', info: 'ℹ️' };
    const t = h('div', { class: 'toast toast-' + kind, role: kind === 'error' ? 'alert' : null },
      h('span', { 'aria-hidden': 'true', text: icons[kind] || icons.info }),
      h('span', { text: message }));
    box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, kind === 'achievement' ? 5000 : 3600);
  }

  function floatText(fromRect, text) {
    if (!animationsOn() || !fromRect) return;
    const n = h('div', { class: 'float-xp', 'aria-hidden': 'true', text: text });
    n.style.left = (fromRect.left + fromRect.width / 2) + 'px';
    n.style.top = fromRect.top + 'px';
    document.body.appendChild(n);
    setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, 1100);
  }

  /* ---- Progress bars that animate from their previous value ---- */
  const barMemory = {};
  let pendingBars = [];
  function bar(key, pct, extraClass, label) {
    pct = Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
    const fill = h('i');
    const prev = barMemory[key];
    if (!animationsOn()) {
      fill.style.width = pct + '%';
      barMemory[key] = pct;
    } else {
      const start = prev === undefined ? 0 : prev;
      fill.style.width = start + '%';
      pendingBars.push({ fill: fill, key: key, pct: pct, start: start });
    }
    return h('div', {
      class: 'bar ' + (extraClass || ''), role: 'progressbar', 'aria-label': label || 'Progress',
      'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct)
    }, fill);
  }
  function applyBars() {
    const list = pendingBars;
    pendingBars = [];
    if (!list.length) return;
    const raf = window.requestAnimationFrame || (f => setTimeout(f, 16));
    raf(() => raf(() => {
      list.forEach(b => {
        if (b.pct < b.start) {                    // bar went backwards (new level): snap, don't slide back
          b.fill.style.transition = 'none';
        }
        b.fill.style.width = b.pct + '%';
        barMemory[b.key] = b.pct;
      });
    }));
  }

  /* ---- Dialogs (one at a time) ---- */
  let modalState = null;

  function focusables(root) {
    return $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
      .filter(el => !el.hidden);
  }

  function openModal(opts) {
    closeModal();
    const titleId = 'modal-title';
    const dlg = h('div', { class: 'modal ' + (opts.className || ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      opts.hideHead ? null : h('div', { class: 'modal-head' },
        h('h2', { id: titleId, text: opts.title }),
        h('button', { type: 'button', class: 'icon-btn', 'data-action': 'close-modal', 'aria-label': 'Close dialog', text: '✕' })),
      opts.content);
    const backdrop = h('div', { class: 'backdrop', 'data-action': 'backdrop' }, dlg);
    modalState = { opener: document.activeElement, onDismiss: opts.onDismiss || null, node: backdrop, dlg: dlg };
    $('#modal-root').appendChild(backdrop);
    const first = opts.focusSelector ? $(opts.focusSelector, dlg) : focusables(dlg).filter(el => el.getAttribute('data-action') !== 'close-modal')[0];
    (first || dlg).focus();
    return dlg;
  }
  function closeModal() {
    if (!modalState) return;
    const s = modalState;
    modalState = null;
    if (s.node.parentNode) s.node.parentNode.removeChild(s.node);
    if (s.opener && document.body.contains(s.opener) && typeof s.opener.focus === 'function') s.opener.focus();
  }
  // Closing without choosing (Escape, X, clicking outside) counts as "cancel".
  function dismissModal() {
    const s = modalState;
    closeModal();
    if (s && s.onDismiss) s.onDismiss();
  }

  function confirmDialog(opts) {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (settled) return; settled = true; closeModal(); resolve(value); };
      const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost', text: opts.cancelText || 'Cancel' });
      const okBtn = h('button', { type: 'button', class: 'btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary'), text: opts.confirmText || 'Confirm' });
      cancelBtn.addEventListener('click', () => finish(false));
      okBtn.addEventListener('click', () => finish(true));
      const content = h('div', null,
        h('p', { text: opts.message }),
        opts.detail ? h('p', { class: 'muted small', text: opts.detail, style: 'margin-top:8px' }) : null,
        h('div', { class: 'modal-actions' }, cancelBtn, okBtn));
      openModal({ title: opts.title, content: content, className: opts.danger ? 'danger' : '', onDismiss: () => finish(false), focusSelector: opts.danger ? null : null });
      cancelBtn.focus();   // the safe choice has focus first
    });
  }

  function showLevelUp(result) {
    const rank = result.rankAfter;
    const content = h('div', null,
      h('div', { class: 'lu-title', text: 'LEVEL UP!' }),
      h('div', { class: 'lu-level', text: 'Level ' + result.levelAfter }),
      result.levelsGained > 1
        ? h('div', { class: 'lu-gain', text: '+' + result.levelsGained + ' levels gained!' })
        : h('div', { class: 'lu-gain', text: 'You gained a level!' }),
      h('div', { class: 'lu-rank', style: '--rank-color:' + rank.color, text: rank.icon + ' ' + rank.name + (result.rankChanged ? ' - new rank!' : '') }),
      h('button', { type: 'button', class: 'btn btn-gold', 'data-action': 'close-modal', text: 'Continue' }));
    openModal({ title: 'Level up', hideHead: true, className: 'levelup', content: content });
    $('#modal-root .modal').setAttribute('aria-label', 'Level up! You reached level ' + result.levelAfter);
    $('#modal-root .modal').removeAttribute('aria-labelledby');
  }

  /* ======================================================================
     7. VIEWS
     ====================================================================== */
  const ROUTES = ['dashboard', 'quests', 'stats', 'achievements', 'rewards', 'settings'];

  // UI-only state (not saved): filters, current page, etc.
  const ui = {
    route: 'dashboard', q: '', status: 'all', cat: 'all', diff: 'all', sort: 'recent',
    affordableOnly: false, activityFilter: 'all', activityLimit: 50,
    motivation: 0, justLeveled: false, day: '', testResults: null
  };

  function pickMotivation() { return Math.floor(Math.random() * MOTIVATION.length); }
  function categoryInfo(name) { return CATEGORIES.find(c => c.name === name) || CATEGORIES[6]; }

  /* ---- Header + navigation (the static parts of index.html) ---- */
  function renderHeader() {
    const lp = levelProgress(state.lifetimeXp);
    const rank = getRank(lp.level);
    $('#hdr-level').textContent = 'LV ' + lp.level;
    $('#hdr-rank-icon').textContent = rank.icon;
    $('#hdr-rank-name').textContent = rank.name;
    $('#hdr-rank').style.setProperty('--rank-color', rank.color);
    $('#hdr-rank').setAttribute('title', 'Player rank: ' + rank.name);
    $('#hdr-xp').textContent = fmt(state.lifetimeXp) + ' XP';
    $('#hdr-settings').classList.toggle('active', ui.route === 'settings');
  }
  function renderNav() {
    $$('.nav-link').forEach(a => {
      const on = a.getAttribute('data-route') === ui.route;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ---- Small shared builders ---- */
  function pageHead(title, subtitle, action) {
    return h('div', { class: 'page-head' },
      h('div', null, h('h1', { text: title }), subtitle ? h('p', { text: subtitle }) : null),
      action || null);
  }

  function emptyState(icon, title, text, button) {
    return h('div', { class: 'empty' },
      h('div', { class: 'big', 'aria-hidden': 'true', text: icon }),
      h('h3', { text: title }),
      h('p', { text: text }),
      button || null);
  }

  function weekStrip() {
    const today = dateKey();
    const byDate = completionsByDate();
    const keys = [];
    for (let i = 6; i >= 0; i--) keys.push(addDays(today, -i));
    return h('div', { class: 'week', role: 'list', 'aria-label': 'Activity over the last seven days' },
      keys.map(k => {
        const info = byDate[k];
        const d = parseKey(k);
        const label = fmtDay(k) + ': ' + (info ? info.count + (info.count === 1 ? ' quest' : ' quests') + ' completed' : 'no quests');
        return h('div', { class: 'day' + (info ? ' on' : '') + (k === today ? ' today' : ''), role: 'listitem', title: label, 'aria-label': label },
          h('span', { text: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3) }),
          h('b', { text: d.getDate() }),
          h('span', { class: 'mark', 'aria-hidden': 'true', text: info ? '🔥' : '' }));
      }));
  }

  function questCard(q, compact) {
    const today = dateKey();
    const done = isQuestDone(q, today);
    const d = DIFFICULTIES[q.difficulty];
    const cat = categoryInfo(q.category);
    const stat = q.stat ? STAT_BY_KEY[q.stat] : null;

    const completeEl = done
      ? h('span', { class: 'done-pill', text: q.type === 'daily' ? '✓ Done today' : '✓ Completed' })
      : h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-action': 'complete', 'data-id': q.id,
          'data-fk': 'complete:' + q.id, 'aria-label': 'Complete quest: ' + q.title, text: 'Complete' });
    const deleteEl = (q.custom && !compact)
      ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-danger-text', 'data-action': 'delete-quest', 'data-id': q.id,
          'data-fk': 'delete:' + q.id, 'aria-label': 'Delete quest: ' + q.title, text: 'Delete' })
      : null;

    const meta = h('div', { class: 'meta' },
      h('span', { class: 'tag xp', text: '+' + fmt(q.xp) + ' XP' }),
      stat ? h('span', { class: 'tag stat', text: '+' + q.statReward + ' ' + stat.icon + ' ' + stat.name }) : null,
      h('span', { class: 'tag', text: q.type === 'daily' ? '🔁 Daily' : '⭐ One-time' }),
      q.target ? h('span', { class: 'tag', text: '🎯 ' + q.target }) : null,
      compact ? h('span', { class: 'badge d-' + q.difficulty, text: d.label }) : null);

    const actions = h('div', { class: 'quest-actions' }, completeEl, deleteEl);

    if (compact) {
      return h('li', { class: 'quest compact' + (done ? ' done' : ''), 'data-card': q.id, tabindex: '-1' },
        h('div', { class: 'q-main' }, h('h3', { text: (done ? '✓ ' : '') + q.title }), meta),
        actions);
    }
    return h('li', { class: 'quest' + (done ? ' done' : ''), 'data-card': q.id, tabindex: '-1' },
      h('div', { class: 'quest-head' },
        h('span', { class: 'cat', text: cat.icon + ' ' + q.category }),
        h('span', { class: 'badge d-' + q.difficulty, text: d.label })),
      h('h3', { text: (done ? '✓ ' : '') + q.title }),
      q.description ? h('p', { class: 'desc', text: q.description }) : null,
      meta,
      actions);
  }

  const ACTIVITY_ICONS = { quest: '✅', reward: '🎁', achievement: '🏆', levelup: '⬆️', stat: '📈' };
  const ACTIVITY_LABELS = { quest: 'Quest completed', reward: 'Reward claimed', achievement: 'Achievement unlocked', levelup: 'Level up', stat: 'Stat improved' };

  function activityItem(a) {
    const amount = a.xp === null ? null : ((a.xp > 0 ? '+' : '') + fmt(a.xp) + ' XP');
    return h('li', { class: 'act act-' + a.type },
      h('span', { class: 'act-icon', 'aria-hidden': 'true', text: ACTIVITY_ICONS[a.type] }),
      h('div', { class: 'act-body' },
        h('div', { class: 'act-type', text: ACTIVITY_LABELS[a.type] }),
        h('div', { class: 'act-text', text: a.text })),
      h('div', { class: 'act-side' },
        amount ? h('span', { class: 'act-xp ' + (a.xp < 0 ? 'neg' : 'pos'), text: amount + (a.xp < 0 ? ' spent' : '') }) : null,
        h('time', { datetime: new Date(a.ts).toISOString(), text: fmtDateTime(a.ts) })));
  }

  function activityList(entries) {
    return h('ul', { class: 'acts' }, entries.map(activityItem));
  }

  function newestFirst(list) { return list.slice().reverse(); }

  /* ---------------- DASHBOARD ---------------- */
  function viewDashboard() {
    const today = dateKey();
    const lp = levelProgress(state.lifetimeXp);
    const rank = getRank(lp.level);
    const streaks = getStreaks();
    const daily = state.quests.filter(q => q.type === 'daily');
    const doneCount = daily.filter(q => isQuestDone(q, today)).length;
    const pct = daily.length ? Math.round((doneCount / daily.length) * 100) : 0;
    const affordable = state.rewards.filter(r => r.cost <= state.spendableXp).length;

    // A. Player status card
    const player = h('section', { class: 'card player span-8' + (ui.justLeveled ? ' levelup-pulse' : ''), 'aria-label': 'Player status' },
      h('div', { class: 'player-top', style: '--rank-color:' + rank.color },
        h('div', { class: 'avatar', 'aria-hidden': 'true', text: rank.icon }),
        h('div', { class: 'player-id' },
          h('h2', { text: state.profile.name }),
          h('div', { class: 'rank-line' }, h('span', { class: 'level-badge', text: 'Level ' + lp.level }), rank.name)),
        h('div', { class: 'streak-chip', title: 'Longest streak: ' + streaks.longest + ' days' }, h('span', { 'aria-hidden': 'true', text: '🔥' }),
          h('span', { text: streaks.current + (streaks.current === 1 ? ' day streak' : ' day streak') }))),
      h('div', { class: 'balances' },
        h('div', { class: 'balance life' }, h('div', { class: 'num', text: fmt(state.lifetimeXp) }), h('div', { class: 'cap', text: 'Lifetime XP (sets your level)' })),
        h('div', { class: 'balance spend' }, h('div', { class: 'num', text: fmt(state.spendableXp) }), h('div', { class: 'cap', text: 'Spendable XP (for rewards)' }))),
      h('div', null,
        h('div', { class: 'xp-meta' },
          h('span', { text: 'Level ' + lp.level + ' → ' + (lp.level + 1) }),
          h('span', { text: fmt(lp.into) + ' / ' + fmt(lp.needed) + ' XP' })),
        bar('xp', lp.pct, 'xp', 'XP progress to next level'),
        h('p', { class: 'muted small', style: 'margin-top:6px', text: fmt(lp.remaining) + ' XP to reach Level ' + (lp.level + 1) })));

    // B. Daily progress
    const ring = h('div', { class: 'ring', role: 'img', 'aria-label': pct + ' percent of daily quests complete' }, h('span', { text: pct + '%' }));
    ring.style.setProperty('--pct', pct);
    const progress = h('section', { class: 'card progress-card span-4', 'aria-label': 'Daily progress' },
      h('h2', { class: 'small muted', text: 'DAILY PROGRESS' }),
      ring,
      h('div', { class: 'progress-facts' },
        h('span', null, h('strong', { text: doneCount }), ' of ', h('strong', { text: daily.length }), ' daily quests done'),
        h('span', null, h('strong', { text: '+' + fmt(xpOnDate(today)) }), ' XP earned today')),
      weekStrip());

    // C. Daily quests
    // Order stays fixed (completed quests do not jump around), so a quick
    // double-tap can never land on a different quest's Complete button.
    const dailyCard = h('section', { class: 'card span-8', 'aria-label': 'Daily quests' },
      h('div', { class: 'card-title' }, h('h2', { text: "📜 Today's Quests" }), h('a', { href: '#quests', text: 'View all →' })),
      daily.length
        ? h('ul', { class: 'quest-list-stack' }, daily.slice(0, 10).map(q => questCard(q, true)))
        : emptyState('📜', 'No daily quests yet', 'Create a daily quest and it will show up here every day.',
            h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'new-quest', text: '＋ New quest' })));

    // D. Stats preview
    const statsCard = h('section', { class: 'card span-4', 'aria-label': 'Player stats' },
      h('div', { class: 'card-title' }, h('h2', { text: '📊 Player Stats' }), h('a', { href: '#stats', text: 'Details →' })),
      h('div', { class: 'mini-stats' }, STATS.map(s => {
        const v = state.stats[s.key];
        return h('div', { class: 'mini-stat' },
          h('div', { class: 'top' }, h('span', { text: s.icon + ' ' + s.name }), h('span', { class: 'num', text: v })),
          bar('dstat:' + s.key, statTier(v).pct, 'thin', s.name + ' progress'));
      })));

    // E. Recent activity
    const recent = newestFirst(state.activity).slice(0, 6);
    const activityCard = h('section', { class: 'card span-8', 'aria-label': 'Recent activity' },
      h('div', { class: 'card-title' }, h('h2', { text: '🕑 Recent Activity' }), h('a', { href: '#stats', text: 'Full history →' })),
      recent.length ? activityList(recent) : emptyState('🕑', 'Nothing here yet', 'Complete your first quest and it will appear here.'));

    // F. Quick actions
    const quick = h('section', { class: 'card span-4', 'aria-label': 'Quick actions' },
      h('div', { class: 'card-title' }, h('h2', { text: '⚡ Quick Actions' })),
      h('div', { class: 'quick' },
        h('button', { type: 'button', class: 'btn', 'data-action': 'new-quest', text: '＋ Add a quest' }),
        h('a', { class: 'btn', href: '#quests', text: '📜 View all quests' }),
        h('button', { type: 'button', class: 'btn', 'data-action': 'claim-rewards', text: '🎁 Claim rewards' + (affordable ? ' (' + affordable + ')' : '') }),
        h('a', { class: 'btn', href: '#achievements', text: '🏆 View achievements' })));

    // G. Motivation
    const motivation = h('section', { class: 'card motivation span-12', 'aria-label': 'Daily motivation' },
      h('span', { class: 'mot-icon', 'aria-hidden': 'true', text: '💬' }),
      h('p', { text: MOTIVATION[ui.motivation] }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-action': 'new-motivation', 'aria-label': 'Show another motivational message', text: 'Another' }));

    const welcome = state.meta.welcomeDismissed ? null : h('section', { class: 'card welcome span-12', 'aria-label': 'Welcome' },
      h('h2', { text: '👋 Welcome to LIFE XP, ' + state.profile.name + '!' }),
      h('p', { text: 'Turn real life into a game. Here is how it works:' }),
      h('ul', null,
        h('li', { text: 'Complete real-life quests (read, exercise, study, help someone) and tap Complete to earn XP.' }),
        h('li', { text: 'XP raises your level and stats. Daily quests come back every morning.' }),
        h('li', { text: 'Spend XP on rewards you create yourself in the Rewards shop.' }),
        h('li', { text: 'Start easy: try "Drink a glass of water" below for a quick first win.' })),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-gold', 'data-action': 'dismiss-welcome', text: "Got it, let's go!" }),
        h('a', { class: 'btn', href: '#quests', text: 'Browse all quests' })));

    return h('div', { class: 'dash' }, welcome, motivation, player, progress, dailyCard, statsCard, activityCard, quick);
  }

  /* ---------------- QUESTS ---------------- */
  function filteredQuests() {
    const today = dateKey();
    const q = ui.q.trim().toLowerCase();
    const list = state.quests.filter(x => {
      if (q && x.title.toLowerCase().indexOf(q) < 0) return false;
      if (ui.cat !== 'all' && x.category !== ui.cat) return false;
      if (ui.diff !== 'all' && x.difficulty !== ui.diff) return false;
      const done = isQuestDone(x, today);
      if (ui.status === 'active' && done) return false;
      if (ui.status === 'completed' && !done) return false;
      return true;
    });
    const sorters = {
      recent: (a, b) => b.createdAt - a.createdAt,
      high: (a, b) => b.xp - a.xp,
      low: (a, b) => a.xp - b.xp,
      difficulty: (a, b) => DIFFICULTIES[b.difficulty].order - DIFFICULTIES[a.difficulty].order || b.xp - a.xp
    };
    return list.sort(sorters[ui.sort] || sorters.recent);
  }

  function questListNode() {
    const list = filteredQuests();
    const countText = 'Showing ' + list.length + ' of ' + state.quests.length + (state.quests.length === 1 ? ' quest' : ' quests');
    const counter = $('#quest-count');
    if (counter) counter.textContent = countText;
    if (!state.quests.length) {
      return emptyState('📜', 'Your quest board is empty', 'Create your first quest to start earning XP.',
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'new-quest', text: '＋ New quest' }));
    }
    if (!list.length) {
      return emptyState('🔍', 'No quests match', 'Try a different search or clear the filters.',
        h('button', { type: 'button', class: 'btn', 'data-action': 'clear-filters', text: 'Clear filters' }));
    }
    return h('ul', { class: 'quest-grid' }, list.map(q => questCard(q, false)));
  }

  function updateQuestList() {
    const host = $('#quest-list');
    if (host) host.replaceChildren(questListNode());
    $$('[data-action="set-status"]').forEach(b => {
      const on = b.getAttribute('data-value') === ui.status;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function option(value, label, selected) { return h('option', { value: value, selected: selected }, label); }

  function viewQuests() {
    const tabs = [['all', 'All'], ['active', 'Active'], ['completed', 'Completed']];
    const toolbar = h('div', { class: 'toolbar', role: 'search' },
      h('div', { class: 't-search field' },
        h('label', { for: 'f-search', class: 'label', text: 'Search quests' }),
        h('input', { type: 'search', id: 'f-search', 'data-filter': 'q', placeholder: 'Search by title…', value: ui.q, autocomplete: 'off', maxlength: 60 })),
      h('div', { class: 'field' },
        h('label', { for: 'f-cat', class: 'label', text: 'Category' }),
        h('select', { id: 'f-cat', 'data-filter': 'cat' }, option('all', 'All categories', ui.cat === 'all'), CATEGORIES.map(c => option(c.name, c.icon + ' ' + c.name, ui.cat === c.name)))),
      h('div', { class: 'field' },
        h('label', { for: 'f-diff', class: 'label', text: 'Difficulty' }),
        h('select', { id: 'f-diff', 'data-filter': 'diff' }, option('all', 'All difficulties', ui.diff === 'all'),
          Object.keys(DIFFICULTIES).map(k => option(k, DIFFICULTIES[k].label, ui.diff === k)))),
      h('div', { class: 'field' },
        h('label', { for: 'f-sort', class: 'label', text: 'Sort by' }),
        h('select', { id: 'f-sort', 'data-filter': 'sort' },
          option('recent', 'Recently added', ui.sort === 'recent'), option('high', 'Highest XP', ui.sort === 'high'),
          option('low', 'Lowest XP', ui.sort === 'low'), option('difficulty', 'Difficulty (hardest first)', ui.sort === 'difficulty'))),
      h('div', { class: 't-tabs tabs', role: 'group', 'aria-label': 'Filter by status' },
        tabs.map(t => h('button', { type: 'button', class: 'tab' + (ui.status === t[0] ? ' on' : ''), 'data-action': 'set-status', 'data-value': t[0],
          'aria-pressed': String(ui.status === t[0]), text: t[1] }))));

    const wrap = h('div', { class: 'page' },
      pageHead('Quests', 'Complete quests to earn XP. Daily quests come back every new day.',
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'new-quest', text: '＋ New quest' })),
      toolbar,
      h('p', { class: 'muted small', id: 'quest-count', 'aria-live': 'polite' }),
      h('div', { id: 'quest-list' }));
    // The list is filled after the wrapper is in the page so the counter can be updated.
    wrap._afterMount = updateQuestList;
    return wrap;
  }

  /* ---------------- STATS ---------------- */
  function viewStats() {
    const today = dateKey();
    const streaks = getStreaks();
    const byDate = completionsByDate();

    const statCards = STATS.map(s => {
      const v = state.stats[s.key];
      const t = statTier(v);
      return h('article', { class: 'card stat-card' },
        h('div', { class: 'top' }, h('span', { class: 'ico', 'aria-hidden': 'true', text: s.icon }), h('h3', { text: s.name }), h('span', { class: 'val', text: v })),
        bar('stat:' + s.key, t.pct, '', s.name + ' progress to next stat level'),
        h('div', { class: 'tier' }, h('span', { text: 'Stat level ' + t.level }), h('span', { text: t.into + ' / ' + STAT_TIER + ' to next' })),
        h('p', { text: s.desc }),
        h('p', { class: 'small' }, h('strong', { text: 'Fed by: ' }), s.cats.map(c => categoryInfo(c).icon + ' ' + c).join(', ')));
    });

    // Last 7 days XP chart (real data from your completion history)
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
    const maxXp = Math.max(1, ...days.map(k => byDate[k] ? byDate[k].xp : 0));
    const chart = h('div', { class: 'chart', role: 'img', 'aria-label': 'XP earned each day over the last seven days: ' +
      days.map(k => fmtDay(k) + ' ' + (byDate[k] ? byDate[k].xp : 0)).join(', ') },
      days.map(k => {
        const xp = byDate[k] ? byDate[k].xp : 0;
        const col = h('div', { class: 'col' + (k === today ? ' today' : '') },
          h('span', { class: 'v', text: xp ? xp : '' }),
          h('div', { class: 'b' }),
          h('span', { class: 'l', text: parseKey(k).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3) }));
        col.querySelector('.b').style.height = Math.max(2, Math.round((xp / maxXp) * 100)) + '%';
        return col;
      }));

    const streakCard = h('section', { class: 'card', 'aria-label': 'Streaks' },
      h('div', { class: 'card-title' }, h('h2', { text: '🔥 Streak' })),
      h('div', { class: 'streak-big' },
        h('div', { class: 'balance' }, h('div', { class: 'num', text: '🔥 ' + streaks.current }), h('div', { class: 'cap', text: 'Current streak (days)' })),
        h('div', { class: 'balance' }, h('div', { class: 'num', text: '🏅 ' + streaks.longest }), h('div', { class: 'cap', text: 'Longest streak (days)' }))),
      weekStrip(),
      h('p', { class: 'muted small', style: 'margin-top:10px', text: 'Complete at least one quest each day to keep your streak. Missing a whole day resets it.' }));

    const chartCard = h('section', { class: 'card', 'aria-label': 'XP over the last 7 days' },
      h('div', { class: 'card-title' }, h('h2', { text: '📈 XP Last 7 Days' })), chart);

    // Recent stat improvements
    const statLog = newestFirst(state.activity.filter(a => a.type === 'stat')).slice(0, 6);
    const improvements = h('section', { class: 'card', 'aria-label': 'Recent stat improvements' },
      h('div', { class: 'card-title' }, h('h2', { text: '✨ Recent Stat Improvements' })),
      statLog.length ? activityList(statLog) : emptyState('📈', 'No stat gains yet', 'Complete a quest that has a stat reward to grow a stat.'));

    // Full activity history with filter
    const filters = [['all', 'Everything'], ['quest', 'Quests'], ['reward', 'Rewards'], ['achievement', 'Achievements'], ['levelup', 'Level-ups'], ['stat', 'Stat gains']];
    const all = newestFirst(state.activity.filter(a => ui.activityFilter === 'all' || a.type === ui.activityFilter));
    const shown = all.slice(0, ui.activityLimit);
    const history = h('section', { class: 'card', 'aria-label': 'Activity history' },
      h('div', { class: 'card-title' },
        h('h2', { text: '🕑 Activity History' }),
        h('select', { 'data-filter': 'activity', 'aria-label': 'Filter activity history' }, filters.map(f => option(f[0], f[1], ui.activityFilter === f[0])))),
      shown.length ? activityList(shown) : emptyState('🕑', 'No activity yet', 'Quests, rewards, level-ups and achievements will be listed here.'),
      all.length > shown.length
        ? h('div', { class: 'row-actions', style: 'margin-top:12px' },
            h('button', { type: 'button', class: 'btn', 'data-action': 'more-activity', text: 'Show more (' + (all.length - shown.length) + ' older)' }))
        : null);

    return h('div', { class: 'page' },
      pageHead('Stats', 'Your five stats grow as you complete quests. Every ' + STAT_TIER + ' points is a new stat level.'),
      h('div', { class: 'card-grid' }, statCards),
      h('div', { class: 'two-col' }, streakCard, chartCard),
      improvements,
      history);
  }

  /* ---------------- ACHIEVEMENTS ---------------- */
  function viewAchievements() {
    const ctx = buildAchievementContext();
    const unlockedCount = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;
    const cards = ACHIEVEMENTS.map(a => {
      const when = state.achievements[a.id];
      const cur = Math.min(ctx[a.key], a.max);
      const pct = (cur / a.max) * 100;
      return h('article', { class: 'card ach' + (when ? ' unlocked' : ''), 'aria-label': a.title + (when ? ' (unlocked)' : ' (locked)') },
        h('div', { class: 'ico', 'aria-hidden': 'true', text: a.icon }),
        h('div', { class: 'body' },
          h('h3', { text: (when ? '' : '🔒 ') + a.title }),
          h('p', { text: a.desc }),
          when
            ? h('span', { class: 'when', text: 'Unlocked ' + fmtDateTime(when) })
            : h('div', null,
                bar('ach:' + a.id, pct, 'gold thin', 'Progress toward ' + a.title),
                h('div', { class: 'prog' }, h('span', { text: a.max > 1 ? fmt(cur) + ' / ' + fmt(a.max) + (a.unit ? ' ' + a.unit : '') : 'Not yet unlocked' })))));
    });
    return h('div', { class: 'page' },
      pageHead('Achievements', 'Rare rewards for real progress.'),
      h('section', { class: 'card' },
        h('div', { class: 'xp-meta' }, h('span', { text: '🏆 ' + unlockedCount + ' of ' + ACHIEVEMENTS.length + ' unlocked' }), h('span', { text: Math.round(unlockedCount / ACHIEVEMENTS.length * 100) + '%' })),
        bar('ach-total', (unlockedCount / ACHIEVEMENTS.length) * 100, 'gold', 'Achievements unlocked')),
      h('div', { class: 'card-grid' }, cards));
  }

  /* ---------------- REWARDS ---------------- */
  function viewRewards() {
    const list = state.rewards.filter(r => !ui.affordableOnly || r.cost <= state.spendableXp);
    const cards = list.map(r => {
      const can = state.spendableXp >= r.cost;
      return h('li', { class: 'card reward', 'data-card': r.id, tabindex: '-1' },
        h('div', { class: 'quest-head' },
          h('span', { class: 'cat', text: r.category ? '🎁 ' + r.category : '🎁 Reward' }),
          h('span', { class: 'cost', text: fmt(r.cost) + ' XP' })),
        h('h3', { text: r.title }),
        r.description ? h('p', { class: 'desc', text: r.description }) : null,
        h('div', { class: 'foot' },
          h('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-action': 'claim', 'data-id': r.id, 'data-fk': 'claim:' + r.id,
            'aria-label': 'Claim reward: ' + r.title, disabled: !can, text: 'Claim' }),
          can ? null : h('span', { class: 'need', text: 'Need ' + fmt(r.cost - state.spendableXp) + ' more XP' }),
          r.custom ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-danger-text', 'data-action': 'delete-reward', 'data-id': r.id,
            'data-fk': 'delr:' + r.id, 'aria-label': 'Delete reward: ' + r.title, text: 'Delete' }) : null));
    });

    const claims = newestFirst(state.claims).slice(0, 10);
    return h('div', { class: 'page' },
      pageHead('Rewards', 'Spend the XP you earn on real-life treats you choose yourself.',
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'new-reward', text: '＋ New reward' })),
      h('section', { class: 'card' },
        h('div', { class: 'wallet' },
          h('div', { class: 'balance spend' }, h('div', { class: 'num', text: '🪙 ' + fmt(state.spendableXp) }), h('div', { class: 'cap', text: 'Spendable XP - your wallet. Rewards cost this.' })),
          h('div', { class: 'balance life' }, h('div', { class: 'num', text: '⭐ ' + fmt(state.lifetimeXp) }), h('div', { class: 'cap', text: 'Lifetime XP - sets your level. Never goes down.' }))),
        h('p', { class: 'muted small', style: 'margin-top:10px', text: 'Spending XP on rewards never lowers your level.' })),
      h('label', { class: 'check-row' },
        h('input', { type: 'checkbox', 'data-filter': 'afford', checked: ui.affordableOnly }),
        'Only show rewards I can afford'),
      cards.length
        ? h('ul', { class: 'card-grid' }, cards)
        : (state.rewards.length
            ? emptyState('🪙', 'Nothing affordable yet', 'Complete a few more quests to build up your spendable XP.',
                h('button', { type: 'button', class: 'btn', 'data-action': 'show-all-rewards', text: 'Show all rewards' }))
            : emptyState('🎁', 'No rewards yet', 'Create a reward you would love to earn.',
                h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'new-reward', text: '＋ New reward' }))),
      h('section', { class: 'card' },
        h('div', { class: 'card-title' }, h('h2', { text: '🧾 Claimed Rewards' })),
        claims.length
          ? h('ul', { class: 'list-plain' }, claims.map(c => h('li', null, h('span', { text: c.title }), h('span', { class: 'muted small' }, '-' + fmt(c.cost) + ' XP · ' + fmtDateTime(c.ts)))))
          : h('p', { class: 'muted', text: 'Nothing claimed yet.' })));
  }

  /* ---------------- SETTINGS ---------------- */
  function toggleRow(key, title, text) {
    const id = 'set-' + key;
    return h('div', { class: 'setting-row' },
      h('div', { class: 'txt' }, h('label', { for: id }, h('strong', { text: title })), h('span', { class: 'muted small', text: text })),
      h('span', { class: 'switch' },
        h('input', { type: 'checkbox', id: id, 'data-setting': key, checked: !!state.settings[key], role: 'switch' }),
        h('span', { class: 'slider', 'aria-hidden': 'true' })));
  }

  function viewSettings() {
    const tests = ui.testResults;
    return h('div', { class: 'page' },
      pageHead('Settings', 'Make LIFE XP yours, and keep your progress safe.'),
      (!storageOk || loadNotice) ? h('div', { class: 'notice warn', role: 'alert',
        text: !storageOk ? 'Your browser is blocking local storage (private mode?), so progress will not be saved after you close this tab. Export a backup below.' : loadNotice }) : null,
      h('div', { class: 'settings' },
        h('section', { class: 'card' },
          h('div', { class: 'card-title' }, h('h2', { text: '🧙 Player' })),
          h('form', { id: 'name-form', class: 'inline-form', novalidate: true },
            h('div', { class: 'field' },
              h('label', { for: 'player-name', text: 'Display name' }),
              h('input', { type: 'text', id: 'player-name', name: 'name', value: state.profile.name, maxlength: NAME_MAX, autocomplete: 'off', 'aria-describedby': 'err-name' }),
              h('div', { class: 'field-error', id: 'err-name', 'data-err': 'name' })),
            h('button', { type: 'submit', class: 'btn btn-primary', style: 'margin-top:26px', text: 'Save name' }))),
        h('section', { class: 'card' },
          h('div', { class: 'card-title' }, h('h2', { text: '🎛️ Preferences' })),
          toggleRow('sound', 'Sound effects', 'Short beeps when you gain XP, level up or unlock things.'),
          toggleRow('animations', 'Animations', 'Sliding bars, floating XP and pop-ups.'),
          toggleRow('reducedEffects', 'Reduced visual effects', 'Turns off glows, blurs and gradients for a calmer, simpler look.')),
        h('section', { class: 'card' },
          h('div', { class: 'card-title' }, h('h2', { text: '💾 Backup' })),
          h('p', { class: 'muted', text: 'Export your whole game as a JSON file, or import a backup you saved earlier.' }),
          h('div', { class: 'row-actions', style: 'margin-top:12px' },
            h('button', { type: 'button', class: 'btn', 'data-action': 'export', text: '⬇️ Export backup' }),
            h('button', { type: 'button', class: 'btn', 'data-action': 'import', text: '⬆️ Import backup' }),
            h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', hidden: true, 'aria-label': 'Choose a backup file to import' })),
          h('p', { class: 'muted small', style: 'margin-top:12px',
            text: 'Where is my data? Progress is stored in this browser on this device only (localStorage). It can be lost if you clear your browser data, and other browsers or devices will not see it. Export a backup now and then to stay safe.' })),
        h('section', { class: 'card' },
          h('div', { class: 'card-title' }, h('h2', { text: '🧪 Self-test' })),
          h('p', { class: 'muted', text: 'Runs built-in checks on the level formula, rank boundaries and streak rules.' }),
          h('div', { class: 'row-actions', style: 'margin-top:12px' },
            h('button', { type: 'button', class: 'btn', 'data-action': 'run-tests', text: 'Run self-test' })),
          tests ? h('div', { class: 'test-results', 'aria-live': 'polite' },
            h('strong', { text: tests.filter(t => t.pass).length + ' of ' + tests.length + ' checks passed' }),
            tests.map(t => h('div', { class: t.pass ? 'pass' : 'fail', text: (t.pass ? '✔ ' : '✘ ') + t.name }))) : null),
        h('section', { class: 'card danger-zone' },
          h('div', { class: 'card-title' }, h('h2', { text: '⚠️ Danger Zone' })),
          h('p', { class: 'muted', text: 'Reset deletes ALL local progress: XP, levels, stats, quests, rewards, history and achievements. This cannot be undone.' }),
          h('div', { class: 'row-actions', style: 'margin-top:12px' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-danger-text', 'data-action': 'reset', text: '🗑️ Reset all data' })))));
  }

  /* ---------------- FORMS (shown in dialogs) ---------------- */
  function field(id, label, control, hint, errName) {
    return h('div', { class: 'field' },
      h('label', { for: id, text: label }),
      control,
      hint ? h('div', { class: 'hint', id: 'hint-' + id, text: hint }) : null,
      h('div', { class: 'field-error', id: 'err-' + errName, 'data-err': errName, role: 'alert' }));
  }

  function showFormErrors(form, errors) {
    $$('[data-err]', form).forEach(el => { el.textContent = errors[el.getAttribute('data-err')] || ''; });
    let firstBad = null;
    $$('input, select, textarea', form).forEach(el => {
      const bad = !!errors[el.name];
      if (bad) { el.setAttribute('aria-invalid', 'true'); if (!firstBad) firstBad = el; }
      else el.removeAttribute('aria-invalid');
    });
    if (firstBad) firstBad.focus();
  }

  function openQuestForm() {
    const form = h('form', { id: 'quest-form', novalidate: true },
      h('div', { class: 'form-grid two' },
        h('div', { class: 'full' }, field('qf-title', 'Quest title *', h('input', { type: 'text', id: 'qf-title', name: 'title', maxlength: 60, required: true, autocomplete: 'off', 'aria-describedby': 'err-title' }), null, 'title')),
        h('div', { class: 'full' }, field('qf-desc', 'Description', h('textarea', { id: 'qf-desc', name: 'description', maxlength: 200, 'aria-describedby': 'err-description' }), 'Optional. Up to 200 characters.', 'description')),
        field('qf-cat', 'Category', h('select', { id: 'qf-cat', name: 'category' }, CATEGORIES.map(c => option(c.name, c.icon + ' ' + c.name, c.name === 'Personal'))), null, 'category'),
        field('qf-diff', 'Difficulty', h('select', { id: 'qf-diff', name: 'difficulty' }, Object.keys(DIFFICULTIES).map(k => option(k, DIFFICULTIES[k].label + ' (' + DIFFICULTIES[k].xp + ' XP)', k === 'easy'))), null, 'difficulty'),
        field('qf-xp', 'XP reward', h('input', { type: 'number', id: 'qf-xp', name: 'xp', min: 1, max: MAX_XP, step: 1, value: DIFFICULTIES.easy.xp, inputmode: 'numeric', 'aria-describedby': 'hint-qf-xp err-xp' }), 'Whole number, 1 to ' + MAX_XP + '. Changes with difficulty until you type your own.', 'xp'),
        field('qf-type', 'Quest type', h('select', { id: 'qf-type', name: 'type' }, option('daily', 'Daily - repeats every day', true), option('oneoff', 'One-time - complete once', false)), null, 'type'),
        field('qf-stat', 'Stat to improve (optional)', h('select', { id: 'qf-stat', name: 'stat' }, option('', 'None', true), STATS.map(s => option(s.key, s.icon + ' ' + s.name, false))), null, 'stat'),
        field('qf-sr', 'Stat points', h('input', { type: 'number', id: 'qf-sr', name: 'statReward', min: 1, max: MAX_STAT_REWARD, step: 1, value: 1, disabled: true, inputmode: 'numeric', 'aria-describedby': 'err-statReward' }), 'Choose a stat first. 1 to ' + MAX_STAT_REWARD + '.', 'statReward'),
        h('div', { class: 'full' }, field('qf-target', 'Target or quantity (optional)', h('input', { type: 'text', id: 'qf-target', name: 'target', maxlength: 40, placeholder: 'e.g. 20 minutes, 5 pages', autocomplete: 'off', 'aria-describedby': 'err-target' }), null, 'target'))),
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-action': 'close-modal', text: 'Cancel' }),
        h('button', { type: 'submit', class: 'btn btn-primary', text: 'Create quest' })));
    openModal({ title: 'Create a custom quest', content: form, focusSelector: '#qf-title' });
  }

  function openRewardForm() {
    const form = h('form', { id: 'reward-form', novalidate: true },
      h('div', { class: 'form-grid two' },
        h('div', { class: 'full' }, field('rf-title', 'Reward title *', h('input', { type: 'text', id: 'rf-title', name: 'title', maxlength: 60, autocomplete: 'off', 'aria-describedby': 'err-title' }), null, 'title')),
        h('div', { class: 'full' }, field('rf-desc', 'Description', h('textarea', { id: 'rf-desc', name: 'description', maxlength: 200, 'aria-describedby': 'err-description' }), 'Optional. Up to 200 characters.', 'description')),
        field('rf-cost', 'XP cost', h('input', { type: 'number', id: 'rf-cost', name: 'cost', min: 1, max: MAX_REWARD_COST, step: 1, value: 100, inputmode: 'numeric', 'aria-describedby': 'err-cost' }), 'Whole number, 1 to ' + fmt(MAX_REWARD_COST) + '.', 'cost'),
        field('rf-cat', 'Category (optional)', h('select', { id: 'rf-cat', name: 'category' }, option('', 'None', true), REWARD_CATEGORIES.map(c => option(c, c, false))), null, 'category')),
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-action': 'close-modal', text: 'Cancel' }),
        h('button', { type: 'submit', class: 'btn btn-primary', text: 'Create reward' })));
    openModal({ title: 'Create a custom reward', content: form, focusSelector: '#rf-title' });
  }

  /* ---------------- Rendering ---------------- */
  const VIEWS = { dashboard: viewDashboard, quests: viewQuests, stats: viewStats, achievements: viewAchievements, rewards: viewRewards, settings: viewSettings };

  function render() {
    // Remember what had keyboard focus so it can be restored after redrawing.
    const active = document.activeElement;
    let fk = null, card = null;
    const view = $('#view');
    if (active && active !== document.body && view.contains(active)) {
      fk = active.getAttribute('data-fk');
      const c = active.closest('[data-card]');
      card = c ? c.getAttribute('data-card') : null;
    }

    renderHeader();
    renderNav();
    const node = VIEWS[ui.route]();
    view.replaceChildren(node);
    if (typeof node._afterMount === 'function') node._afterMount();
    applyBars();

    if (fk) {
      const el = $$('[data-fk]', view).find(e => e.getAttribute('data-fk') === fk);
      if (el && !el.disabled) el.focus({ preventScroll: true });
      else if (card) {
        const c = $$('[data-card]', view).find(e => e.getAttribute('data-card') === card);
        if (c) c.focus({ preventScroll: true });
      }
    }
    ui.justLeveled = false;
  }

  /* ======================================================================
     8. EVENTS  (event delegation: ONE listener per event type, set up once,
        so re-rendering never creates duplicate listeners)
     ====================================================================== */
  function handleComplete(id, btn) {
    // Ignore accidental double-taps: the same quest within 0.5s, or any quest within 0.3s
    // (a filtered list can slide up under your finger after a completion).
    if (!guard('complete:' + id, 500) || !guard('complete:any', 300)) return;
    const rect = btn ? btn.getBoundingClientRect() : null;
    const r = completeQuest(id);
    if (!r.ok) {
      toast(r.reason === 'already' ? 'You already completed this quest. Nice work!' : 'That quest no longer exists.', 'warn');
      render();
      return;
    }
    saveState();
    ui.justLeveled = r.levelsGained > 0;
    render();
    floatText(rect, '+' + r.xp + ' XP');
    toast('+' + r.xp + ' XP' + (r.statGain ? ' and +' + r.statGain + ' ' + STAT_BY_KEY[r.quest.stat].name : '') + ' for "' + r.quest.title + '"', 'xp');
    playSound('xp');
    r.unlocked.forEach(a => {
      toast('Achievement unlocked: ' + a.title + ' - ' + a.desc, 'achievement');
      playSound('achievement');
    });
    if (r.levelsGained > 0) {
      playSound('levelup');
      showLevelUp(r);
    }
  }

  async function handleDeleteQuest(id) {
    const q = state.quests.find(x => x.id === id);
    if (!q || !q.custom) return;
    const ok = await confirmDialog({
      title: 'Delete quest?', message: 'Delete "' + q.title + '"?',
      detail: 'Your XP and history stay. Only the quest itself is removed.', confirmText: 'Delete quest', danger: true
    });
    if (!ok) return;
    if (deleteQuest(id)) { saveState(); render(); toast('Quest deleted.', 'success'); }
  }

  async function handleDeleteReward(id) {
    const r = state.rewards.find(x => x.id === id);
    if (!r || !r.custom) return;
    const ok = await confirmDialog({
      title: 'Delete reward?', message: 'Delete "' + r.title + '"?',
      detail: 'Rewards you already claimed stay in your history.', confirmText: 'Delete reward', danger: true
    });
    if (!ok) return;
    if (deleteReward(id)) { saveState(); render(); toast('Reward deleted.', 'success'); }
  }

  function handleClaim(id) {
    if (!guard('claim:' + id, 700)) return;
    const r = claimReward(id);
    if (!r.ok) {
      toast(r.reason === 'funds' ? 'Not enough spendable XP yet. You need ' + fmt(r.need) + ' more.' : 'That reward no longer exists.', 'warn');
      playSound('error');
      render();
      return;
    }
    saveState();
    render();
    toast('Reward claimed: ' + r.reward.title + '. Enjoy it, you earned it! (-' + fmt(r.reward.cost) + ' XP)', 'success');
    playSound('reward');
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function handleExport() {
    downloadJson({ app: 'LIFE XP', exportedAt: new Date().toISOString(), version: SCHEMA_VERSION, data: state },
      'life-xp-backup-' + dateKey() + '.json');
    toast('Backup downloaded. Keep the file somewhere safe.', 'success');
  }

  function handleImportFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('That file is too big to be a LIFE XP backup.', 'error'); return; }
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file.', 'error');
    reader.onload = async () => {
      let incoming;
      try {
        incoming = normalizeState(JSON.parse(String(reader.result)));   // validates BEFORE anything is replaced
      } catch (err) {
        const msg = err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message;
        toast('Import failed: ' + msg + ' Your current progress was not changed.', 'error');
        return;
      }
      const inLevel = levelFromXp(incoming.lifetimeXp);
      const nowLevel = levelFromXp(state.lifetimeXp);
      const ok = await confirmDialog({
        title: 'Replace your progress?',
        message: 'This backup is Level ' + inLevel + ' with ' + fmt(incoming.lifetimeXp) + ' lifetime XP. You are currently Level ' + nowLevel + ' with ' + fmt(state.lifetimeXp) + ' XP.',
        detail: 'Importing replaces your current progress. Consider exporting a backup of your current game first.',
        confirmText: 'Replace with backup', danger: true
      });
      if (!ok) return;
      state = incoming;
      saveState();
      applySettings();
      render();
      toast('Backup imported. Welcome back, ' + state.profile.name + '!', 'success');
    };
    reader.readAsText(file);
  }

  async function handleReset() {
    const ok = await confirmDialog({
      title: 'Delete ALL progress?',
      message: 'This will permanently delete every bit of local progress: XP, levels, stats, quests, rewards, streaks, history and achievements.',
      detail: 'This cannot be undone. Export a backup first if you might want it back.',
      confirmText: 'Yes, delete everything', danger: true
    });
    if (!ok) return;
    state = defaultState();
    saveState();
    applySettings();
    ui.q = ''; ui.status = 'all'; ui.cat = 'all'; ui.diff = 'all'; ui.sort = 'recent';
    ui.affordableOnly = false; ui.activityFilter = 'all'; ui.activityLimit = 50; ui.testResults = null;
    ui.motivation = pickMotivation();
    if (window.location.hash !== '#dashboard') window.location.hash = '#dashboard'; else render();
    toast('All data was reset. A fresh adventure begins!', 'success');
  }

  function navigateTo(route) {
    if (window.location.hash === '#' + route) { render(); return; }
    window.location.hash = '#' + route;
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    const id = el.getAttribute('data-id');

    switch (action) {
      case 'backdrop': if (e.target === el) dismissModal(); break;
      case 'close-modal': dismissModal(); break;
      case 'complete': handleComplete(id, el); break;
      case 'delete-quest': handleDeleteQuest(id); break;
      case 'new-quest': openQuestForm(); break;
      case 'set-status': ui.status = el.getAttribute('data-value'); updateQuestList(); break;
      case 'clear-filters':
        ui.q = ''; ui.status = 'all'; ui.cat = 'all'; ui.diff = 'all'; ui.sort = 'recent';
        render();
        break;
      case 'claim': handleClaim(id); break;
      case 'delete-reward': handleDeleteReward(id); break;
      case 'new-reward': openRewardForm(); break;
      case 'show-all-rewards': ui.affordableOnly = false; render(); break;
      case 'claim-rewards':
        ui.affordableOnly = true;
        if (!state.rewards.some(r => r.cost <= state.spendableXp)) toast('No rewards are affordable yet. Complete more quests to earn XP!', 'info');
        navigateTo('rewards');
        break;
      case 'dismiss-welcome': state.meta.welcomeDismissed = true; saveState(); render(); break;
      case 'new-motivation': {
        let n = pickMotivation();
        if (n === ui.motivation) n = (n + 1) % MOTIVATION.length;
        ui.motivation = n;
        render();
        break;
      }
      case 'more-activity': ui.activityLimit += 50; render(); break;
      case 'export': handleExport(); break;
      case 'import': $('#import-file').click(); break;
      case 'reset': handleReset(); break;
      case 'run-tests': {
        ui.testResults = runSelfTests();
        const failed = ui.testResults.filter(t => !t.pass).length;
        render();
        toast(failed ? failed + ' self-test check(s) failed.' : 'All ' + ui.testResults.length + ' self-test checks passed!', failed ? 'error' : 'success');
        break;
      }
      default: break;
    }
  });

  // Typing in the search box and changing filters update only the quest list,
  // so the box keeps keyboard focus while you type.
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.getAttribute && t.getAttribute('data-filter') === 'q') {
      ui.q = t.value;
      updateQuestList();
    }
    if (t.id === 'qf-xp') t.setAttribute('data-touched', '1');
  });

  document.addEventListener('change', e => {
    const t = e.target;
    const filter = t.getAttribute && t.getAttribute('data-filter');
    if (filter === 'cat' || filter === 'diff' || filter === 'sort') { ui[filter] = t.value; updateQuestList(); }
    else if (filter === 'afford') { ui.affordableOnly = t.checked; render(); }
    else if (filter === 'activity') { ui.activityFilter = t.value; ui.activityLimit = 50; render(); }

    const setting = t.getAttribute && t.getAttribute('data-setting');
    if (setting && Object.prototype.hasOwnProperty.call(state.settings, setting)) {
      state.settings[setting] = t.checked;
      saveState();
      applySettings();
      if (setting === 'sound' && t.checked) playSound('xp');
    }

    if (t.id === 'import-file') {
      handleImportFile(t.files && t.files[0]);
      t.value = '';   // lets you pick the same file again later
    }

    // Inside the quest form: difficulty fills in default XP, stat enables stat points
    if (t.id === 'qf-diff') {
      const xp = $('#qf-xp');
      if (xp && !xp.getAttribute('data-touched')) xp.value = DIFFICULTIES[t.value].xp;
    }
    if (t.id === 'qf-stat') {
      const sr = $('#qf-sr');
      if (sr) sr.disabled = !t.value;
    }
  });

  document.addEventListener('submit', e => {
    const form = e.target;
    e.preventDefault();
    const data = {};
    Array.from(new FormData(form).entries()).forEach(pair => { data[pair[0]] = pair[1]; });

    if (form.id === 'quest-form') {
      const res = validateQuestInput(data);
      showFormErrors(form, res.errors);
      if (Object.keys(res.errors).length) return;
      const quest = addQuest(res.value);
      saveState();
      closeModal();
      ui.q = ''; ui.status = 'all'; ui.cat = 'all'; ui.diff = 'all'; ui.sort = 'recent';   // make sure the new quest is visible
      render();
      toast('Quest created: ' + quest.title, 'success');
    } else if (form.id === 'reward-form') {
      const res = validateRewardInput(data);
      showFormErrors(form, res.errors);
      if (Object.keys(res.errors).length) return;
      const reward = addReward(res.value);
      saveState();
      closeModal();
      render();
      toast('Reward created: ' + reward.title, 'success');
    } else if (form.id === 'name-form') {
      const name = String(data.name || '').trim();
      const errors = {};
      if (!name) errors.name = 'Your name cannot be empty.';
      else if (name.length > NAME_MAX) errors.name = 'Keep your name to ' + NAME_MAX + ' characters or fewer.';
      showFormErrors(form, errors);
      if (Object.keys(errors).length) return;
      state.profile.name = name;
      saveState();
      render();
      toast('Name saved. Welcome, ' + name + '!', 'success');
    }
  });

  // Keyboard: Escape closes dialogs, Tab stays inside an open dialog.
  document.addEventListener('keydown', e => {
    if (!modalState) return;
    if (e.key === 'Escape') { e.preventDefault(); dismissModal(); return; }
    if (e.key === 'Tab') {
      const items = focusables(modalState.dlg);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !modalState.dlg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---- Routing: the URL hash (#quests) picks the section, no page reload ---- */
  function routeFromHash() {
    const name = window.location.hash.replace('#', '');
    return ROUTES.indexOf(name) >= 0 ? name : 'dashboard';
  }
  function onHashChange() {
    const next = routeFromHash();
    if (modalState) closeModal();
    if (next === 'dashboard' && ui.route !== 'dashboard') ui.motivation = pickMotivation();
    ui.route = next;
    window.scrollTo(0, 0);
    render();
    $('#view').focus({ preventScroll: true });
  }

  /* ---- New local day: daily quests are derived from today's date, so they
         reset by themselves. This only refreshes the screen if the page is
         left open past midnight. ---- */
  function checkDayChange() {
    const key = dateKey();
    if (key === ui.day) return;
    ui.day = key;
    ui.motivation = pickMotivation();
    render();
    toast('A new day has begun! Your daily quests are ready again.', 'info');
  }

  // If the game is open in two tabs, keep them in sync.
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try { state = normalizeState(JSON.parse(e.newValue)); applySettings(); render(); } catch (err) { /* ignore unreadable data */ }
  });

  /* ======================================================================
     9. START-UP
     ====================================================================== */
  function init() {
    loadState();
    applySettings();
    ui.route = routeFromHash();
    ui.day = dateKey();
    ui.motivation = pickMotivation();
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
    window.addEventListener('focus', checkDayChange);
    setInterval(checkDayChange, 30000);
    render();
    if (loadNotice) toast(loadNotice, 'warn');
    if (!storageOk) toast('Your browser is blocking storage, so progress will not be saved. Use Settings to export a backup.', 'warn');
  }

  // Exposed so the self-tests (and curious people in the browser console) can use them.
  window.LifeXP = {
    levelFromXp: levelFromXp, totalXpForLevel: totalXpForLevel, levelProgress: levelProgress, xpForNextLevel: xpForNextLevel,
    getRank: getRank, computeStreaks: computeStreaks, dateKey: dateKey, addDays: addDays,
    runSelfTests: runSelfTests, normalizeState: normalizeState, defaultState: defaultState,
    completeQuest: completeQuest, claimReward: claimReward, addQuest: addQuest, validateQuestInput: validateQuestInput,
    validateRewardInput: validateRewardInput, getState: () => state, setClock: fn => { clock = fn || (() => new Date()); },
    isQuestDone: isQuestDone, getStreaks: getStreaks, saveState: saveState, rerender: render
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
