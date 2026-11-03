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
 *   2b Economy          6 Minigames (dice, cup shuffle)       9 Saving / timing
 *   3 Unlocks
 *
 * Economy (section 2b): money, milestone payouts, shop items, sponsorships and
 * challenges. Followers and money are separate: followers are never spent,
 * money is spent in the shop.
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


  /* ======================= 2b. ECONOMY ======================= */

  // MONEY is a spendable currency, completely separate from followers.
  // It is never given just for levelling up: it only comes from the milestone
  // payouts below, challenges, sponsorships and money minigames.
  // Rewards are one-time: each milestone id is remembered in the save.
  const MONEY = {
    unlockLevel: 10,                  // the Creator Fund (money system) opens here
    milestones: [
      { id: 'creatorFund10', level: 10, amount: 150,
        title: 'CREATOR FUND UNLOCKED',
        text: 'Your growing audience has earned you your first creator payout.' },
      { id: 'payout15', level: 15, amount: 350,
        title: 'CREATOR PAYOUT',
        text: 'Brands keep noticing you. Another payout has arrived.' },
      { id: 'payout20', level: 20, amount: 750,
        title: 'SUPERSTAR PAYOUT',
        text: 'You are a Global Superstar. Your biggest payout yet!' }
    ]
  };

  // Kinds of permanent bonus an item can give. Bonuses of the same kind are
  // ADDED together (+10% and +15% = +25%), never multiplied against each other.
  //   passiveFollowers  followers per second
  //   tapFollowers      followers per tap
  //   allFollowers      both of the above
  //   sponsorshipMoney  money paid by sponsorships
  //   minigameMoney     money won in money minigames
  const BONUS_TYPES = {
    passiveFollowers: 'passive follower generation',
    tapFollowers:     'follower generation per tap',
    allFollowers:     'total follower generation',
    sponsorshipMoney: 'sponsorship income',
    minigameMoney:    'money from minigames'
  };

  // Shop items. Every item is described by data only; the shop and the game
  // handle all of them the same way, so a new item is just a new entry.
  //   price         money cost of the NEXT level (same price for every level for now)
  //   unlockLevel   player level needed to buy it
  //   maxLevel      1 = can be bought once (starter items). Higher values allow
  //                 several upgrade levels later: bonus value x owned level.
  //   bonuses       [{ type, value }]  value 0.10 = +10%
  //   visual        id used by the CSS to show it in the room (data-items on the stage)
  const ITEMS = [
    {
      id: 'ringLight', name: 'Ring Light', category: 'Equipment',
      description: 'Perfect lighting for every post.',
      price: 200, unlockLevel: 10, maxLevel: 1,
      bonuses: [{ type: 'passiveFollowers', value: 0.10 }],
      visual: 'ringLight'
    },
    {
      id: 'betterOutfit', name: 'Better Outfit', category: 'Clothes',
      description: 'A fresh look brands want to work with.',
      price: 350, unlockLevel: 12, maxLevel: 1,
      bonuses: [{ type: 'sponsorshipMoney', value: 0.10 }],
      visual: 'betterOutfit'
    },
    {
      id: 'microphone', name: 'Professional Microphone', category: 'Equipment',
      description: 'Studio sound for your content.',
      price: 700, unlockLevel: 15, maxLevel: 1,
      bonuses: [{ type: 'minigameMoney', value: 0.10 }],
      visual: 'microphone'
    },
    {
      id: 'camera', name: 'Professional Camera', category: 'Equipment',
      description: 'Sharper videos reach more people.',
      price: 1500, unlockLevel: 18, maxLevel: 1,
      bonuses: [{ type: 'allFollowers', value: 0.15 }],
      visual: 'camera'
    },
    {
      id: 'roomUpgrade', name: 'Room Upgrade', category: 'Room',
      description: 'A real studio instead of a messy room.',
      price: 3000, unlockLevel: 20, maxLevel: 1,
      bonuses: [{ type: 'sponsorshipMoney', value: 0.10 }, { type: 'passiveFollowers', value: 0.05 }],
      visual: 'roomUpgrade'
    }
  ];

  function getItem(id) {
    return ITEMS.find(function (item) { return item.id === id; }) || null;
  }

  // Sponsorships (version 1): one campaign at a time.
  // Flow: an offer appears -> accept -> the campaign timer runs (it keeps
  // running while the game is closed) -> Campaign Complete -> collect the money.
  // Payment = basePayment x (1 + sum of the sponsorshipMoney bonuses of owned items).
  // A campaign is only offered when the player has "requiredFollowers" (followers
  // are never spent; this is just a requirement).
  const SPONSORSHIPS = {
    unlockLevel: 20,
    offerDelaySeconds: { min: 120, max: 240 },   // wait before an offer appears (after unlock / collect)
    campaigns: [
      { id: 'glowSummer', brand: 'GlowPop', category: 'Fashion / Beauty', name: 'Summer Glow Launch',
        requiredFollowers: 5200000, durationSeconds: 8 * 60, basePayment: 500 },
      { id: 'byteSpeaker', brand: 'ByteBeat', category: 'Technology', name: 'Pocket Speaker Review',
        requiredFollowers: 6000000, durationSeconds: 15 * 60, basePayment: 850 },
      { id: 'freshMorning', brand: 'FreshFuel', category: 'Lifestyle', name: 'Morning Routine Series',
        requiredFollowers: 7500000, durationSeconds: 25 * 60, basePayment: 1200 }
    ]
  };

  function getCampaign(id) {
    return SPONSORSHIPS.campaigns.find(function (c) { return c.id === id; }) || null;
  }

  // Challenges (version 1): one at a time. When it is completed the player
  // collects the money; the next one appears after "delaySeconds".
  // Only challenges the player can do right now are offered: "unlockId" must be
  // unlocked. "targets" and "rewards" use the entry with the highest
  // fromLevel <= the player's level. Rewards are rounded to "rewardRounding".
  // "metric" is the counter the game increases while playing.
  const CHALLENGES = {
    unlockLevel: 12,
    delaySeconds: 300,                // wait after collecting a reward before the next challenge
    rewardRounding: 5,
    rewards: [
      { fromLevel: 12, min: 50,  max: 150 },
      { fromLevel: 17, min: 150, max: 400 }
    ],
    types: [
      { id: 'gainFollowers', metric: 'followersGained', unlockId: null,
        text: 'Gain {target} followers',
        targets: [
          { fromLevel: 12, target: 10000 }, { fromLevel: 14, target: 30000 }, { fromLevel: 16, target: 100000 },
          { fromLevel: 18, target: 200000 }, { fromLevel: 20, target: 350000 }
        ] },
      { id: 'tapCount', metric: 'taps', unlockId: null,
        text: 'Perform {target} manual taps',
        targets: [{ fromLevel: 12, target: 100 }, { fromLevel: 16, target: 200 }] },
      { id: 'viralFollowers', metric: 'viralFollowers', unlockId: 'viralEvents',
        text: 'Gain {target} followers during Going Viral',
        targets: [{ fromLevel: 12, target: 2500 }, { fromLevel: 16, target: 25000 }] },
      { id: 'diceRoll', metric: 'diceRolls', unlockId: 'diceGame',
        text: 'Complete one Dice roll',
        targets: [{ fromLevel: 12, target: 1 }] },
      { id: 'cupWin', metric: 'cupWins', unlockId: 'cupShuffle',
        text: 'Win one Cup Shuffle',
        targets: [{ fromLevel: 12, target: 1 }] },
      { id: 'sponsorship', metric: 'sponsorships', unlockId: 'sponsorships',
        text: 'Complete one sponsorship',
        targets: [{ fromLevel: 12, target: 1 }] }
    ]
  };

  function getChallengeType(id) {
    return CHALLENGES.types.find(function (t) { return t.id === id; }) || null;
  }

  /** Entry of a "fromLevel" list that applies at a level (the highest fromLevel <= level). */
  function tierForLevel(list, level) {
    let chosen = list[0];
    list.forEach(function (entry) { if (level >= entry.fromLevel) chosen = entry; });
    return chosen;
  }

  /* ======================= 3. UNLOCKS ======================= */

  // Things that switch on when the player reaches a level. An unlock can be:
  //   - a feature flag the game checks (passiveFollowers, viralEvents, diceGame)
  //   - "grants":      adds a flat amount to a stat
  //   - "multipliers": permanently multiplies a stat (applied after bonuses)
  // Unlock state is always derived from the level, never trusted from a save.
  const UNLOCKS = [
    {
      id: 'creatorFund',
      level: MONEY.unlockLevel,
      name: 'Creator Fund',
      description: 'You can now earn and spend money in the Shop.'
    },
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
      id: 'challenges',
      level: CHALLENGES.unlockLevel,
      name: 'Challenges',
      description: 'Complete challenges to earn money.'
    },
    {
      id: 'proCamera',
      level: 13,
      name: 'Better Content',
      description: 'Better content: x2 followers per tap.',
      multipliers: { followersPerClick: 2 }
    },
    {
      id: 'cupShuffle',
      level: 14,
      name: 'Cup Shuffle',
      description: 'A money minigame: find the ball under the cups.'
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
      id: 'sponsorships',
      level: SPONSORSHIPS.unlockLevel,
      name: 'Sponsorships',
      description: 'Brands offer you paid campaigns.'
    },
    {
      id: 'verifiedBadge',
      level: 18,
      name: 'Verified Badge',
      description: 'Everyone trusts you now: x2 followers per tap and per second.',
      multipliers: { followersPerClick: 2, followersPerSecond: 2 }
    }
  ];

  // Show the unlock list in level order.
  UNLOCKS.sort(function (a, b) { return a.level - b.level; });

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

  // Every minigame shares the same structure:
  //   unlockId         unlock (level) needed to play
  //   cooldownSeconds  wait between plays (saved as a timestamp, so refreshing never skips it)
  //   rewardType       'followers' or 'money'
  //   challengeMetric  challenge counter increased by a successful play
  //   cooldownText     label shown on the tile while waiting
  // plus the settings of that particular game (below).
  //
  // Dice game: reward = earning power x dice result x rewardSeconds, where
  //   earning power = followers per second + followers per tap x tapWeight
  // (so the reward keeps up as the player grows). Viral multipliers are not used.
  //
  // Cup Shuffle: a ball is hidden under one of the cups, the cups are swapped
  // "swaps" times and the player picks one. The swaps are decided BEFORE the
  // animation starts and the ball is tracked through them, so the right cup is
  // a real result and not decided after the player chooses.
  // Money rewards use the entry with the highest fromLevel <= the player's level
  // (a random amount between min and max, rounded to "rewardRounding").
  // The Professional Microphone adds its minigameMoney bonus on top.
  // A wrong cup gives a small "consolation" amount.
  const MINIGAMES = {
    dice: {
      id: 'dice',
      name: 'Dice Game',
      unlockId: 'diceGame',
      rewardType: 'followers',
      challengeMetric: 'diceRolls',
      cooldownText: 'Next roll in',
      cooldownSeconds: 90,
      sides: 6,
      rewardSeconds: 15,              // each pip is worth this many seconds of earning power
      tapWeight: 0.5,                 // how many taps per second count towards earning power
      rollAnimationMs: 900
    },
    cupShuffle: {
      id: 'cupShuffle',
      name: 'Cup Shuffle',
      unlockId: 'cupShuffle',
      rewardType: 'money',
      challengeMetric: 'cupWins',
      cooldownText: 'Next game in',
      cooldownSeconds: 5 * 60,        // 5 minutes for testing
      cups: 3,
      swaps: 7,                       // how many times two cups swap places
      revealMs: 1300,                 // the ball is shown for this long
      swapMs: 520,                    // time of one swap (not too fast on purpose)
      rewardRounding: 5,
      rewards: [
        { fromLevel: 14, min: 100, max: 250, consolation: 15 },
        { fromLevel: 20, min: 150, max: 300, consolation: 25 }
      ]
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
    version: 3,               // bump when the save format changes (3 = economy)
    autosaveSeconds: 10       // regular autosave interval
  };

  // How often the game advances (milliseconds). Real elapsed time is used, so
  // a slow or paused timer never loses income.
  const TICK_MS = 1000;

  // Shown on the hidden version label (tap it 7 times to open the dev panel).
  const VERSION = 'v0.3.0-dev';

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
    MONEY: MONEY,
    BONUS_TYPES: BONUS_TYPES,
    ITEMS: ITEMS,
    SPONSORSHIPS: SPONSORSHIPS,
    CHALLENGES: CHALLENGES,
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
    getItem: getItem,
    getCampaign: getCampaign,
    getChallengeType: getChallengeType,
    tierForLevel: tierForLevel,
    stageForLevel: stageForLevel
  });
})(window.Influencer = window.Influencer || {});
