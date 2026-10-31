/**
 * config.js
 * ---------------------------------------------------------------------------
 * ALL tunable game data lives here: level formula, base stats, unlocks,
 * bonuses, events, minigames, offline income, visual stages and save
 * settings. To rebalance the game, edit this file only.
 *
 * Note on structure: the scripts are plain (non-module) files so that
 * index.html works when opened directly from disk (file://). Every file
 * attaches what it exports to one global namespace: window.Influencer.
 *
 * Sections:
 *   1 Levels            4 Bonuses (Better Phone, Auto-Post)   7 Offline income
 *   2 Base stats        5 Viral events                        8 Visual stages
 *   3 Unlocks           6 Minigames (dice)                    9 Saving / timing
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  /* ======================= 1. LEVELS ======================= */

  const MAX_LEVEL = 20;

  // Followers are NEVER spent: they are a milestone counter that only goes up.
  // Reaching an amount unlocks things (levels, features, bonus levels).
  //
  // Followers needed to reach a level:
  //   Level 2 needs "baseRequirement".
  //   Every later level needs (previous requirement x growth), where growth is
  //   taken from the last entry of "growthSteps" whose fromLevel <= that level.
  //
  // Levels 2-10 grow x2.1 per level (30, 63, 132, 278, 583, 1225, 2573, 5403,
  // 11347 - unchanged from the first prototype). After Level 10 the growth is
  // gentler so the climb stays steady instead of exploding.
  const LEVELING = {
    baseRequirement: 30,
    growthSteps: [
      { fromLevel: 2,  growth: 2.1 },
      { fromLevel: 11, growth: 1.9 },
      { fromLevel: 14, growth: 1.85 },
      { fromLevel: 17, growth: 1.8 }
    ]
  };

  function growthForLevel(level) {
    let growth = LEVELING.growthSteps[0].growth;
    LEVELING.growthSteps.forEach(function (step) {
      if (level >= step.fromLevel) growth = step.growth;
    });
    return growth;
  }

  // Precomputed table: LEVEL_REQUIREMENTS[level] = followers needed (index 0 unused).
  const LEVEL_REQUIREMENTS = (function () {
    const table = [0, 0];
    let exact = LEVELING.baseRequirement;
    for (let level = 2; level <= MAX_LEVEL; level++) {
      if (level > 2) exact *= growthForLevel(level);
      table[level] = Math.round(exact);
    }
    return table;
  })();

  /** Followers required to reach a level. Level 1 = 0. */
  function followersForLevel(level) {
    if (level <= 1) return 0;
    return LEVEL_REQUIREMENTS[Math.min(level, MAX_LEVEL)];
  }

  /** Level for a given follower count. Never exceeds MAX_LEVEL. */
  function levelForFollowers(followers) {
    let level = 1;
    while (level < MAX_LEVEL && followers >= LEVEL_REQUIREMENTS[level + 1]) {
      level++;
    }
    return level;
  }

  /* ======================= 2. BASE STATS ======================= */

  // Starting values, before unlocks and bonuses are applied.
  const BASE_STATS = {
    followersPerClick: 1,
    followersPerSecond: 0
  };

  // Short labels used by the UI when describing a stat.
  const STAT_LABELS = {
    followersPerClick: 'per tap',
    followersPerSecond: 'per second'
  };

  /* ======================= 3. UNLOCKS ======================= */

  // Things that switch on when the player reaches a level. An unlock can be:
  //   - a feature flag the game checks (passiveFollowers, viralEvents, diceGame)
  //   - "grants":      adds a flat amount to a stat
  //   - "multipliers": permanently multiplies a stat (applied after bonuses)
  // Unlock state is always derived from the level, never trusted from a save.
  const UNLOCKS = [
    {
      id: 'passiveFollowers',
      level: 5,
      name: 'Passive followers',
      description: 'Your audience now grows by itself every second.',
      grants: { followersPerSecond: 1 }
    },
    {
      id: 'viralEvents',
      level: 12,
      name: 'Viral Events',
      description: 'Random viral moments will boost your followers for a short time.'
    },
    {
      id: 'proCamera',
      level: 13,
      name: 'Pro Camera',
      description: 'Better content: x2 followers per tap.',
      multipliers: { followersPerClick: 2 }
    },
    {
      id: 'diceGame',
      level: 15,
      name: 'Dice Game',
      description: 'A first minigame: roll the dice for a follower bonus.'
    },
    {
      id: 'contentTeam',
      level: 16,
      name: 'Content Team',
      description: 'A team posts for you: x2 followers per second.',
      multipliers: { followersPerSecond: 2 }
    },
    {
      id: 'verifiedBadge',
      level: 18,
      name: 'Verified Badge',
      description: 'Everyone trusts you now: x2 followers per tap and per second.',
      multipliers: { followersPerClick: 2, followersPerSecond: 2 }
    }
  ];

  function getUnlock(id) {
    return UNLOCKS.find(function (u) { return u.id === id; }) || null;
  }

  /* ======================= 4. BONUSES ======================= */

  // Bonuses are free. To claim the next level of a bonus two things must be true:
  //   1. MILESTONE: the player has enough followers.
  //        followers needed = round( milestone.base * milestone.growth ^ currentBonusLevel )
  //   2. TIMER: the bonus timer is finished. After every claim it restarts for
  //        "cooldownSeconds" (set it to 0 to disable the timer).
  //
  // "effects" says how much each claimed bonus level adds to the stat. The entry
  // with the highest fromLevel <= the level being claimed is used, so the bonus
  // can get stronger as it levels up.
  // "requiresUnlock" is an unlock id, or null if always available.
  const UPGRADES = [
    {
      id: 'clickPower',
      name: 'Better Phone',
      stat: 'followersPerClick',
      effects: [
        { fromLevel: 1,  perLevel: 1 },   // levels 1-12:  +1 per claim (as in the first prototype)
        { fromLevel: 13, perLevel: 3 },
        { fromLevel: 17, perLevel: 8 },
        { fromLevel: 21, perLevel: 20 }
      ],
      milestone: { base: 15, growth: 1.8 },
      cooldownSeconds: 15,
      requiresUnlock: null
    },
    {
      id: 'autoPost',
      name: 'Auto-Post Scheduler',
      stat: 'followersPerSecond',
      effects: [
        { fromLevel: 1,  perLevel: 2 },   // levels 1-6:  +2 per claim (as in the first prototype)
        { fromLevel: 7,  perLevel: 6 },
        { fromLevel: 11, perLevel: 20 },
        { fromLevel: 15, perLevel: 60 }
      ],
      milestone: { base: 300, growth: 2 },
      cooldownSeconds: 20,
      requiresUnlock: 'passiveFollowers'
    }
  ];

  function getUpgrade(id) {
    return UPGRADES.find(function (u) { return u.id === id; }) || null;
  }

  /** Followers needed to claim the next level of a bonus. */
  function upgradeMilestone(upgrade, currentLevel) {
    return Math.round(upgrade.milestone.base * Math.pow(upgrade.milestone.growth, currentLevel));
  }

  /** What claiming bonus level "bonusLevel" (1, 2, 3...) adds to the stat. */
  function upgradeEffectFor(upgrade, bonusLevel) {
    let perLevel = upgrade.effects[0].perLevel;
    upgrade.effects.forEach(function (entry) {
      if (bonusLevel >= entry.fromLevel) perLevel = entry.perLevel;
    });
    return perLevel;
  }

  /** Total added to the stat by a bonus that has been claimed "level" times. */
  function upgradeEffectTotal(upgrade, level) {
    let total = 0;
    for (let n = 1; n <= level; n++) total += upgradeEffectFor(upgrade, n);
    return total;
  }

  /* ======================= 5. VIRAL EVENTS ======================= */

  // Random temporary events. Only ONE event can be active at a time.
  // The multipliers are applied when followers are earned; they are never
  // written into the permanent per-tap / per-second values.
  // To add a new event later (x3, x5 taps, celebrity repost...) just add an entry.
  const EVENTS = {
    goingViral: {
      id: 'goingViral',
      name: 'GOING VIRAL',
      label: '2X FOLLOWERS',
      unlockId: 'viralEvents',
      durationSeconds: 30,
      multipliers: { tap: 2, passive: 2 },
      weight: 1                       // relative chance when several events exist
    }
  };

  // How long the game waits between events. Short on purpose for development;
  // raise these numbers for the real game.
  const EVENT_SCHEDULER = {
    minDelaySeconds: 45,
    maxDelaySeconds: 90
  };

  /* ======================= 6. MINIGAMES ======================= */

  // Dice game. Reward = earning power x dice result x rewardSeconds, where
  //   earning power = followers per second + followers per tap x tapWeight
  // (so the reward keeps up as the player grows). Viral multipliers are not used.
  const MINIGAMES = {
    dice: {
      id: 'dice',
      name: 'Dice Game',
      unlockId: 'diceGame',
      cooldownSeconds: 90,
      sides: 6,
      rewardSeconds: 15,              // each pip is worth this many seconds of earning power
      tapWeight: 0.5,                 // how many taps per second count towards earning power
      rollAnimationMs: 900
    }
  };

  /* ======================= 7. OFFLINE INCOME ======================= */

  const OFFLINE = {
    maxSeconds: 3 * 60 * 60,          // at most 3 hours of offline income
    minAwaySeconds: 60,               // shorter absences are ignored (just normal play)
    efficiency: 1                     // 1 = full passive income while away
  };

  /* ======================= 8. VISUAL STAGES ======================= */

  // The CSS picks its look from the stage id (see css/style.css, data-stage).
  // Later these can point to real asset sets instead of CSS differences.
  const VISUAL_STAGES = [
    { id: 1, minLevel: 1,  name: 'Unknown Creator' },
    { id: 2, minLevel: 5,  name: 'Rising Creator' },
    { id: 3, minLevel: 10, name: 'Established Influencer' },
    { id: 4, minLevel: 20, name: 'Global Superstar' }
  ];

  function stageForLevel(level) {
    let current = VISUAL_STAGES[0];
    VISUAL_STAGES.forEach(function (stage) {
      if (level >= stage.minLevel) current = stage;
    });
    return current;
  }

  /* ======================= 9. SAVING / TIMING ======================= */

  const SAVE = {
    key: 'influencer.save',   // localStorage key (unchanged, so old saves still load)
    version: 2,               // bump when the save format changes
    autosaveSeconds: 10       // regular autosave interval
  };

  // How often the game advances (milliseconds). Real elapsed time is used, so
  // a slow or paused timer never loses income.
  const TICK_MS = 1000;

  // Shown on the hidden version label (tap it 7 times to open the dev panel).
  const VERSION = 'v0.2.0-dev';

  // Developer panel activation by tapping the version label.
  const DEV = { tapsToOpen: 7, tapWindowMs: 4000 };

  NS.Config = Object.freeze({
    MAX_LEVEL: MAX_LEVEL,
    LEVELING: LEVELING,
    BASE_STATS: BASE_STATS,
    STAT_LABELS: STAT_LABELS,
    UNLOCKS: UNLOCKS,
    UPGRADES: UPGRADES,
    EVENTS: EVENTS,
    EVENT_SCHEDULER: EVENT_SCHEDULER,
    MINIGAMES: MINIGAMES,
    OFFLINE: OFFLINE,
    VISUAL_STAGES: VISUAL_STAGES,
    SAVE: SAVE,
    TICK_MS: TICK_MS,
    VERSION: VERSION,
    DEV: DEV,
    followersForLevel: followersForLevel,
    levelForFollowers: levelForFollowers,
    upgradeMilestone: upgradeMilestone,
    upgradeEffectFor: upgradeEffectFor,
    upgradeEffectTotal: upgradeEffectTotal,
    getUpgrade: getUpgrade,
    getUnlock: getUnlock,
    stageForLevel: stageForLevel
  });
})(window.Influencer = window.Influencer || {});
