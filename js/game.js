/**
 * game.js
 * ---------------------------------------------------------------------------
 * The game rules. This file knows NOTHING about the DOM, CSS or localStorage.
 * It changes the state and announces what happened through events:
 *
 *   loaded          a game was started or loaded
 *   changed         any state change (UI re-renders on this)
 *   tick            once per passive tick, even if nothing was earned
 *                   (the UI uses it to refresh the bonus timers)
 *   click           { gain }               the player clicked the character
 *   passive         { gain }               passive followers were applied
 *   levelUp         { from, to }
 *   unlock          { unlock }             a feature was unlocked
 *   stageChange     { stage }              the visual stage changed
 *   upgradeClaimed  { upgrade, level }
 *   importantChange level up / unlock / claim  (main.js saves on this)
 *
 * Followers are never spent. They are a milestone counter: reaching an amount
 * unlocks things (levels, features, the next level of each upgrade).
 *
 * Future systems (money, achievements, temporary x2/x3/x5 events, minigames,
 * offline earnings...) should hook in here or listen to these events.
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;
  const State = NS.State;

  class Game {
    constructor() {
      this.state = State.createNew();
      this.listeners = {};
      // Clock used by the bonus timers (a function so tests can replace it).
      this.now = function () { return Date.now(); };
      this._recalculate();
    }

    /* ----------------------- events ----------------------- */

    on(eventName, handler) {
      if (!this.listeners[eventName]) this.listeners[eventName] = [];
      this.listeners[eventName].push(handler);
    }

    _emit(eventName, payload) {
      (this.listeners[eventName] || []).forEach(function (handler) { handler(payload); });
    }

    /* ----------------------- lifecycle ----------------------- */

    startNewGame() {
      this.state = State.createNew();
      this._recalculate();
      this._emit('loaded');
    }

    /** @param {object} savedState a state already validated by State.sanitize */
    loadState(savedState) {
      this.state = savedState;
      this._recalculate();
      this._emit('loaded');
    }

    getState() {
      return this.state;
    }

    /* ----------------------- actions ----------------------- */

    /** The player clicked the character. Returns followers gained. */
    click() {
      const gain = this.getClickGain();
      this._earn(gain);
      this._emit('click', { gain: gain });
      return gain;
    }

    /** Applies passive followers. "seconds" is the time that has passed. */
    tick(seconds) {
      const gain = this.getPassiveGain() * (seconds === undefined ? 1 : seconds);
      if (gain > 0) {
        this._earn(gain);
        this._emit('passive', { gain: gain });
      }
      this._emit('tick');
      return gain > 0 ? gain : 0;
    }

    /**
     * Claims the next level of an upgrade. It costs nothing: it only needs the
     * follower milestone to be reached and the timer to be finished.
     * Returns true if it was claimed.
     */
    claimUpgrade(upgradeId) {
      const info = this.getUpgradeInfo(upgradeId);
      if (!info || !info.ready) return false;

      this.state.upgrades[upgradeId] = info.level + 1;
      this.state.upgradeReadyAt[upgradeId] = this.now() + info.upgrade.cooldownSeconds * 1000;
      this._recalculate();

      this._emit('upgradeClaimed', { upgrade: info.upgrade, level: info.level + 1 });
      this._emit('changed');
      this._emit('importantChange');
      return true;
    }

    /* ----------------------- queries ----------------------- */

    // Followers gained per click. This is the single place where future
    // multipliers (x2/x3/x5 events, sponsorships...) would be applied.
    getClickGain() {
      return this.state.followersPerClick;
    }

    // Followers gained per second (same idea: future multipliers go here).
    getPassiveGain() {
      return this.state.followersPerSecond;
    }

    /** Everything the UI needs to draw one upgrade. */
    getUpgradeInfo(upgradeId) {
      const upgrade = Config.getUpgrade(upgradeId);
      if (!upgrade) return null;

      const s = this.state;
      const level = s.upgrades[upgradeId] || 0;
      const available = !upgrade.requiresUnlock || Boolean(s.unlocks[upgrade.requiresUnlock]);
      const milestone = Config.upgradeMilestone(upgrade, level);
      const milestoneReached = s.followers >= milestone;

      // Remaining timer, never longer than the cooldown itself (protects
      // against the device clock being moved backwards).
      const msLeft = (s.upgradeReadyAt[upgradeId] || 0) - this.now();
      const secondsLeft = Math.min(upgrade.cooldownSeconds, Math.max(0, Math.ceil(msLeft / 1000)));

      return {
        upgrade: upgrade,
        level: level,
        available: available,             // feature unlocked (e.g. passive at Level 5)
        milestone: milestone,             // followers needed for the next level
        milestoneReached: milestoneReached,
        secondsLeft: secondsLeft,         // timer; 0 = finished
        ready: available && milestoneReached && secondsLeft === 0
      };
    }

    /** Progress toward the next level. */
    getProgress() {
      const s = this.state;
      if (s.level >= Config.MAX_LEVEL) {
        return { isMax: true, fraction: 1, current: s.followers, target: null, nextLevel: null };
      }
      const floor = Config.followersForLevel(s.level);
      const target = Config.followersForLevel(s.level + 1);
      const fraction = Math.min(1, Math.max(0, (s.followers - floor) / (target - floor)));
      return { isMax: false, fraction: fraction, current: s.followers, target: target, nextLevel: s.level + 1 };
    }

    /* ----------------------- dev helper ----------------------- */

    /** DEV ONLY, from the browser console: Influencer.game.devAddFollowers(500) */
    devAddFollowers(amount) {
      this._earn(amount);
    }

    /* ----------------------- internals ----------------------- */

    /** Adds followers. They are never removed. */
    _earn(amount) {
      if (!(amount > 0)) return;
      this.state.followers += amount;
      this._updateLevel();
      this._emit('changed');
    }

    /** Level only depends on the follower count. */
    _updateLevel() {
      const s = this.state;
      const oldLevel = s.level;
      const newLevel = Config.levelForFollowers(s.followers);
      if (newLevel === oldLevel) return;

      const oldStage = Config.stageForLevel(oldLevel);
      const newStage = Config.stageForLevel(newLevel);
      const newlyUnlocked = Config.UNLOCKS.filter(function (u) {
        return !s.unlocks[u.id] && newLevel >= u.level;
      });

      s.level = newLevel;
      this._recalculate(); // applies unlock flags and stat grants

      // Announce only after the state is fully consistent.
      this._emit('levelUp', { from: oldLevel, to: newLevel });
      newlyUnlocked.forEach(function (u) { this._emit('unlock', { unlock: u }); }, this);
      if (newStage.id !== oldStage.id) this._emit('stageChange', { stage: newStage });
      this._emit('importantChange');
    }

    /**
     * Rebuilds everything derived from the core data, silently (no events):
     * level, unlock flags, followers per click, followers per second.
     */
    _recalculate() {
      const s = this.state;
      s.level = Config.levelForFollowers(s.followers);

      const stats = {};
      Object.keys(Config.BASE_STATS).forEach(function (key) {
        stats[key] = Config.BASE_STATS[key];
      });

      Config.UNLOCKS.forEach(function (u) {
        if (s.level >= u.level) s.unlocks[u.id] = true;
        if (s.unlocks[u.id] && u.grants) {
          Object.keys(u.grants).forEach(function (stat) { stats[stat] += u.grants[stat]; });
        }
      });

      Config.UPGRADES.forEach(function (u) {
        stats[u.stat] += (s.upgrades[u.id] || 0) * u.perLevel;
      });

      s.followersPerClick = stats.followersPerClick;
      s.followersPerSecond = stats.followersPerSecond;
    }
  }

  NS.Game = Game;
})(window.Influencer = window.Influencer || {});
