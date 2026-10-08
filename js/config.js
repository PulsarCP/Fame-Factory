/**
 * config.js
 * ---------------------------------------------------------------------------
 * ALL tunable game data lives here: level formula, base stats, unlocks,
 * upgrades, visual stages and save settings. To rebalance the game, edit
 * this file only - no other file contains magic numbers.
 *
 * Note on structure: the scripts are plain (non-module) files so that
 * index.html works when opened directly from disk (file://). Every file
 * attaches what it exports to one global namespace: window.Influencer.
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  /* ======================= LEVELS ======================= */

  // Prototype cap. Raise to 100 later; the formula below keeps working.
  const MAX_LEVEL = 10;

  // Followers are NEVER spent: they are a milestone counter that only goes up.
  // Reaching an amount unlocks things (levels, features, upgrade levels).
  //
  // Level requirement formula (edit these two numbers to rebalance pacing):
  //   followers needed to REACH level L (L >= 2) =
  //       round( baseRequirement * growth ^ (L - 2) )
  // With 30 and 2.1 the milestones are:
  //   L2 = 30, L3 = 63, L4 = 132, L5 = 278, L6 = 583,
  //   L7 = 1225, L8 = 2573, L9 = 5403, L10 = 11347
  const LEVELING = {
    baseRequirement: 30,
    growth: 2.1
  };

  /** Followers required to reach a level. Level 1 = 0. */
  function followersForLevel(level) {
    if (level <= 1) return 0;
    return Math.round(LEVELING.baseRequirement * Math.pow(LEVELING.growth, level - 2));
  }

  /** Level for a given follower count. Never exceeds MAX_LEVEL. */
  function levelForFollowers(followers) {
    let level = 1;
    while (level < MAX_LEVEL && followers >= followersForLevel(level + 1)) {
      level++;
    }
    return level;
  }

  /* ======================= BASE STATS ======================= */

  // Starting values, before unlocks and upgrades are applied.
  const BASE_STATS = {
    followersPerClick: 1,
    followersPerSecond: 0
  };

  // Short labels used by the UI when describing a stat.
  const STAT_LABELS = {
    followersPerClick: 'per click',
    followersPerSecond: 'per second'
  };

  /* ======================= UNLOCKS ======================= */

  // Features that switch on when the player reaches a level.
  // "grants" adds a flat amount to a stat while the unlock is active.
  const UNLOCKS = [
    {
      id: 'passiveFollowers',
      level: 5,
      name: 'Passive followers',
      description: 'Your audience now grows by itself every second.',
      grants: { followersPerSecond: 1 }
    }
  ];

  /* ======================= UPGRADES ======================= */

  // Upgrades cost nothing. Each claimed level adds "perLevel" to "stat".
  // To claim the next level two things must be true:
  //   1. MILESTONE: the player has enough followers.
  //        followers needed = round( milestone.base * milestone.growth ^ currentLevel )
  //   2. TIMER: the upgrade's timer is finished. After every claim the timer
  //        restarts for "cooldownSeconds" (set it to 0 to disable the timer).
  // "requiresUnlock" is an unlock id, or null if always available.
  const UPGRADES = [
    {
      id: 'clickPower',
      name: 'Better Phone',
      stat: 'followersPerClick',
      perLevel: 1,
      milestone: { base: 15, growth: 1.8 },   // 15, 27, 49, 87, 157, 283, 510, ...
      cooldownSeconds: 15,
      requiresUnlock: null
    },
    {
      id: 'autoPost',
      name: 'Auto-Post Scheduler',
      stat: 'followersPerSecond',
      perLevel: 2,
      milestone: { base: 300, growth: 2 },    // 300, 600, 1200, 2400, ...
      cooldownSeconds: 20,
      requiresUnlock: 'passiveFollowers'
    }
  ];

  function getUpgrade(id) {
    return UPGRADES.find(function (u) { return u.id === id; }) || null;
  }

  function getUnlock(id) {
    return UNLOCKS.find(function (u) { return u.id === id; }) || null;
  }

  /** Followers needed to claim the next level of an upgrade. */
  function upgradeMilestone(upgrade, currentLevel) {
    return Math.round(upgrade.milestone.base * Math.pow(upgrade.milestone.growth, currentLevel));
  }

  /* ======================= VISUAL STAGES ======================= */

  // The CSS picks its look from the stage id (see css/style.css, data-stage).
  // Later these can point to real asset sets instead of CSS differences.
  const VISUAL_STAGES = [
    { id: 1, minLevel: 1,  name: 'Unknown Creator' },
    { id: 2, minLevel: 5,  name: 'Rising Creator' },
    { id: 3, minLevel: 10, name: 'Established Influencer' }
  ];

  function stageForLevel(level) {
    let current = VISUAL_STAGES[0];
    VISUAL_STAGES.forEach(function (stage) {
      if (level >= stage.minLevel) current = stage;
    });
    return current;
  }

  /* ======================= SAVING / TIMING ======================= */

  const SAVE = {
    key: 'influencer.save',   // localStorage key
    version: 1,               // bump when the save format changes
    autosaveSeconds: 10       // regular autosave interval
  };

  // How often passive followers are applied (milliseconds).
  const TICK_MS = 1000;

  NS.Config = Object.freeze({
    MAX_LEVEL: MAX_LEVEL,
    LEVELING: LEVELING,
    BASE_STATS: BASE_STATS,
    STAT_LABELS: STAT_LABELS,
    UNLOCKS: UNLOCKS,
    UPGRADES: UPGRADES,
    VISUAL_STAGES: VISUAL_STAGES,
    SAVE: SAVE,
    TICK_MS: TICK_MS,
    followersForLevel: followersForLevel,
    levelForFollowers: levelForFollowers,
    upgradeMilestone: upgradeMilestone,
    getUpgrade: getUpgrade,
    getUnlock: getUnlock,
    stageForLevel: stageForLevel
  });
})(window.Influencer = window.Influencer || {});
