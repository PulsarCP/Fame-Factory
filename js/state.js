/**
 * state.js
 * ---------------------------------------------------------------------------
 * Defines the shape of the game state (this is also exactly what gets saved)
 * and validates data loaded from storage.
 *
 * State fields:
 *   followers          the player's audience. It is NEVER spent: it is a
 *                      milestone counter that only goes up. The level and the
 *                      upgrade milestones are all calculated from it.
 *   level              current level (derived from followers; stored for
 *                      readability, recomputed on load)
 *   followersPerClick  derived from upgrades (recomputed on load)
 *   followersPerSecond derived from unlocks + upgrades (recomputed on load)
 *   upgrades           { upgradeId: claimedLevel }
 *   upgradeReadyAt     { upgradeId: timestamp (ms) when its timer finishes }
 *   unlocks            { unlockId: true/false }
 *
 * Adding a new system later (money, cars, ...) means adding fields here with
 * a default; sanitize() fills missing fields from defaults so old saves keep
 * working.
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;

  /** A brand new game. */
  function createNew() {
    const upgrades = {};
    const upgradeReadyAt = {};
    Config.UPGRADES.forEach(function (u) {
      upgrades[u.id] = 0;
      upgradeReadyAt[u.id] = 0; // 0 = timer already finished
    });

    const unlocks = {};
    Config.UNLOCKS.forEach(function (u) { unlocks[u.id] = false; });

    return {
      followers: 0,
      level: 1,
      followersPerClick: Config.BASE_STATS.followersPerClick,
      followersPerSecond: Config.BASE_STATS.followersPerSecond,
      upgrades: upgrades,
      upgradeReadyAt: upgradeReadyAt,
      unlocks: unlocks
    };
  }

  function nonNegativeNumber(value, fallback) {
    return (typeof value === 'number' && isFinite(value) && value >= 0) ? value : fallback;
  }

  /**
   * Turns untrusted data (parsed from localStorage) into a valid state.
   * Returns null if the data is not usable at all.
   */
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const state = createNew();

    state.followers = nonNegativeNumber(raw.followers, 0);

    // Derived values: kept so the save file is readable, recomputed by Game.
    state.level = Config.levelForFollowers(state.followers);
    state.followersPerClick = nonNegativeNumber(raw.followersPerClick, state.followersPerClick);
    state.followersPerSecond = nonNegativeNumber(raw.followersPerSecond, state.followersPerSecond);

    // Only known upgrades / unlocks are accepted.
    Config.UPGRADES.forEach(function (u) {
      const saved = raw.upgrades && raw.upgrades[u.id];
      state.upgrades[u.id] = (Number.isInteger(saved) && saved > 0) ? saved : 0;
      state.upgradeReadyAt[u.id] = nonNegativeNumber(raw.upgradeReadyAt && raw.upgradeReadyAt[u.id], 0);
    });
    Config.UNLOCKS.forEach(function (u) {
      state.unlocks[u.id] = Boolean(raw.unlocks && raw.unlocks[u.id]);
    });

    return state;
  }

  NS.State = { createNew: createNew, sanitize: sanitize };
})(window.Influencer = window.Influencer || {});
