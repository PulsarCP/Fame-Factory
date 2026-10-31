/**
 * state.js
 * ---------------------------------------------------------------------------
 * Defines the shape of the game state (this is also exactly what gets saved)
 * and validates data loaded from storage.
 *
 * State fields:
 *   followers          the player's audience. NEVER spent: it only goes up. The
 *                      level and the bonus milestones are calculated from it.
 *   level              derived from followers (recomputed on load)
 *   followersPerClick  PERMANENT value, derived from bonuses + unlocks
 *   followersPerSecond PERMANENT value, derived from bonuses + unlocks
 *                      (temporary event multipliers are NOT stored here)
 *   upgrades           { bonusId: claimedLevel }
 *   upgradeReadyAt     { bonusId: timestamp (ms) when its timer finishes }
 *   unlocks            { unlockId: true/false }  derived from level
 *   activeEvent        null, or { id, startedAt, endsAt } (timestamps, ms)
 *   nextEventAt        timestamp (ms) of the next random event, 0 = not scheduled
 *   minigames          { dice: { readyAt, lastResult, lastReward } }
 *   lastActiveAt       timestamp (ms) the player was last playing, 0 = unknown
 *   pendingOffline     null, or { seconds, followers } waiting to be collected
 *
 * Adding a new system later (money, cars, ...) means adding fields here with a
 * default; sanitize() fills missing fields from defaults so old saves keep
 * working and a damaged save can never crash the game.
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;

  // Followers are capped so arithmetic always stays exact.
  const MAX_FOLLOWERS = Number.MAX_SAFE_INTEGER;

  function createMinigames() {
    const minigames = {};
    Object.keys(Config.MINIGAMES).forEach(function (id) {
      minigames[id] = { readyAt: 0, lastResult: 0, lastReward: 0 };
    });
    return minigames;
  }

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
      unlocks: unlocks,
      activeEvent: null,
      nextEventAt: 0,
      minigames: createMinigames(),
      lastActiveAt: 0,
      pendingOffline: null
    };
  }

  /** A finite number >= 0, otherwise the fallback. */
  function nonNegativeNumber(value, fallback) {
    return (typeof value === 'number' && isFinite(value) && value >= 0) ? value : fallback;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Turns untrusted data (parsed from localStorage) into a valid state.
   * Returns null if the data is not usable at all.
   */
  function sanitize(raw) {
    if (!isObject(raw)) return null;

    const state = createNew();

    state.followers = Math.min(nonNegativeNumber(raw.followers, 0), MAX_FOLLOWERS);

    // Derived values: kept so the save file is readable, recomputed by Game.
    state.level = Config.levelForFollowers(state.followers);
    state.followersPerClick = nonNegativeNumber(raw.followersPerClick, state.followersPerClick);
    state.followersPerSecond = nonNegativeNumber(raw.followersPerSecond, state.followersPerSecond);

    // Only known bonuses are accepted.
    Config.UPGRADES.forEach(function (u) {
      const saved = isObject(raw.upgrades) ? raw.upgrades[u.id] : 0;
      state.upgrades[u.id] = (Number.isInteger(saved) && saved > 0) ? Math.min(saved, 10000) : 0;
      state.upgradeReadyAt[u.id] = nonNegativeNumber(isObject(raw.upgradeReadyAt) ? raw.upgradeReadyAt[u.id] : 0, 0);
    });

    // Unlock flags are always re-derived from the level by Game; nothing to read here.

    // Viral event: must be a known event with sane timestamps.
    const ev = raw.activeEvent;
    if (isObject(ev) && Config.EVENTS[ev.id] &&
        nonNegativeNumber(ev.startedAt, -1) >= 0 && nonNegativeNumber(ev.endsAt, -1) > 0) {
      state.activeEvent = { id: ev.id, startedAt: ev.startedAt, endsAt: ev.endsAt };
    }
    state.nextEventAt = nonNegativeNumber(raw.nextEventAt, 0);

    // Minigames: one entry per configured minigame.
    Object.keys(Config.MINIGAMES).forEach(function (id) {
      const saved = isObject(raw.minigames) && isObject(raw.minigames[id]) ? raw.minigames[id] : {};
      const sides = Config.MINIGAMES[id].sides || 6;
      const lastResult = Number.isInteger(saved.lastResult) && saved.lastResult >= 0 && saved.lastResult <= sides
        ? saved.lastResult : 0;
      state.minigames[id] = {
        readyAt: nonNegativeNumber(saved.readyAt, 0),
        lastResult: lastResult,
        lastReward: nonNegativeNumber(saved.lastReward, 0)
      };
    });

    state.lastActiveAt = nonNegativeNumber(raw.lastActiveAt, 0);

    const pending = raw.pendingOffline;
    if (isObject(pending) && nonNegativeNumber(pending.followers, 0) > 0) {
      state.pendingOffline = {
        seconds: nonNegativeNumber(pending.seconds, 0),
        followers: Math.min(nonNegativeNumber(pending.followers, 0), MAX_FOLLOWERS)
      };
    }

    return state;
  }

  NS.State = { createNew: createNew, sanitize: sanitize, MAX_FOLLOWERS: MAX_FOLLOWERS };
})(window.Influencer = window.Influencer || {});
