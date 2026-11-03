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
 * Economy (save version 3):
 *   money              spendable currency, a plain number (never a string)
 *   moneyMilestones    { milestoneId: true } one-time payouts already received
 *   items              { itemId: ownedLevel }  (0 = not owned)
 *                      Item bonuses are NOT stored: they are recalculated from this.
 *   sponsorship        null, or { campaignId, status: 'offered'|'active'|'complete',
 *                      offeredAt, startedAt, endsAt }  (timestamps, ms)
 *   sponsorshipNextOfferAt  timestamp (ms) of the next offer, 0 = not scheduled
 *   challenges         { current: null | { typeId, target, progress, reward,
 *                      status: 'active'|'complete' }, nextAt, lastTypeId }
 *   (the Cup Shuffle cooldown is minigames.cupShuffle.readyAt)
 *
 * Adding a new system later (money, cars, ...) means adding fields here with a
 * default; sanitize() fills missing fields from defaults so old saves keep
 * working and a damaged save can never crash the game.
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;

  // Followers and money are capped so arithmetic always stays exact.
  const MAX_FOLLOWERS = Number.MAX_SAFE_INTEGER;
  const MAX_MONEY = Number.MAX_SAFE_INTEGER;

  const SPONSORSHIP_STATUSES = ['offered', 'active', 'complete'];
  const CHALLENGE_STATUSES = ['active', 'complete'];

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

    const items = {};
    Config.ITEMS.forEach(function (item) { items[item.id] = 0; });

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
      pendingOffline: null,
      money: 0,
      moneyMilestones: {},
      items: items,
      sponsorship: null,
      sponsorshipNextOfferAt: 0,
      challenges: { current: null, nextAt: 0, lastTypeId: '' }
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

    sanitizeEconomy(raw, state);

    return state;
  }

  /** Economy fields. Missing or damaged data (e.g. a save from before money existed) gets defaults. */
  function sanitizeEconomy(raw, state) {
    state.money = Math.min(nonNegativeNumber(raw.money, 0), MAX_MONEY);

    // Only known milestones, and only "true".
    if (isObject(raw.moneyMilestones)) {
      Config.MONEY.milestones.forEach(function (m) {
        if (raw.moneyMilestones[m.id] === true) state.moneyMilestones[m.id] = true;
      });
    }

    // Owned items: whole levels between 0 and the item's maximum.
    Config.ITEMS.forEach(function (item) {
      const saved = isObject(raw.items) ? raw.items[item.id] : 0;
      state.items[item.id] = (Number.isInteger(saved) && saved > 0) ? Math.min(saved, item.maxLevel) : 0;
    });

    // Sponsorship: a known campaign, a known status and sane timestamps.
    const sp = raw.sponsorship;
    if (isObject(sp) && Config.getCampaign(sp.campaignId) && SPONSORSHIP_STATUSES.indexOf(sp.status) !== -1) {
      const startedAt = nonNegativeNumber(sp.startedAt, 0);
      const endsAt = nonNegativeNumber(sp.endsAt, 0);
      const usable = sp.status === 'offered' || (startedAt > 0 && endsAt > 0);
      if (usable) {
        state.sponsorship = {
          campaignId: sp.campaignId,
          status: sp.status,
          offeredAt: nonNegativeNumber(sp.offeredAt, 0),
          startedAt: startedAt,
          endsAt: endsAt
        };
      }
    }
    state.sponsorshipNextOfferAt = nonNegativeNumber(raw.sponsorshipNextOfferAt, 0);

    // Challenge: a known type with a valid target; progress can never exceed the target.
    const ch = isObject(raw.challenges) ? raw.challenges : {};
    state.challenges.nextAt = nonNegativeNumber(ch.nextAt, 0);
    state.challenges.lastTypeId = Config.getChallengeType(ch.lastTypeId) ? ch.lastTypeId : '';
    const cur = ch.current;
    if (isObject(cur) && Config.getChallengeType(cur.typeId) && CHALLENGE_STATUSES.indexOf(cur.status) !== -1 &&
        nonNegativeNumber(cur.target, 0) >= 1) {
      const target = nonNegativeNumber(cur.target, 1);
      const progress = Math.min(target, nonNegativeNumber(cur.progress, 0));
      state.challenges.current = {
        typeId: cur.typeId,
        target: target,
        progress: progress,
        reward: nonNegativeNumber(cur.reward, 0),
        status: progress >= target ? 'complete' : (cur.status === 'complete' ? 'complete' : 'active')
      };
      if (state.challenges.current.status === 'complete') state.challenges.current.progress = target;
    }
  }

  NS.State = {
    createNew: createNew, sanitize: sanitize,
    MAX_FOLLOWERS: MAX_FOLLOWERS, MAX_MONEY: MAX_MONEY
  };
})(window.Influencer = window.Influencer || {});
