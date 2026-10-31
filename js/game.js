/**
 * game.js
 * ---------------------------------------------------------------------------
 * The game rules. This file knows NOTHING about the DOM, CSS or localStorage.
 * It changes the state and announces what happened through events:
 *
 *   loaded           a game was started or loaded
 *   changed          any state change (UI re-renders on this)
 *   tick             once per game step, even if nothing was earned
 *                    (the UI uses it to refresh countdowns)
 *   click            { gain }                 the player tapped the character
 *   passive          { gain }                 passive followers were applied
 *   levelUp          { from, to }
 *   unlock           { unlock }               a feature was unlocked
 *   upgradeClaimed   { upgrade, level }       a bonus level was claimed
 *   eventStarted     { event }                a viral event began
 *   eventEnded       { event }                a viral event finished
 *   minigamePlayed   { id, result, reward }
 *   offlinePending   { seconds, followers }   offline earnings wait to be collected
 *   offlineCollected { followers }
 *   importantChange  level up / unlock / claim / event / roll ... (main.js saves on this)
 *
 * Followers are never spent. They are a milestone counter: reaching an amount
 * unlocks things (levels, features, the next level of each bonus).
 *
 * Temporary multipliers (viral events) are applied at the moment followers are
 * earned. They are never written into followersPerClick / followersPerSecond,
 * so the permanent values can not be changed or multiplied twice by an event.
 *
 * All timers are absolute timestamps (milliseconds, from this.now()), so
 * refreshing or closing the page can not reset or extend them.
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
      // Clock and dice source: functions so tests can replace them.
      this.now = function () { return Date.now(); };
      this.random = function () { return Math.random(); };
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
      this.state.lastActiveAt = this.now();
      this._recalculate();
      this._emit('loaded');
    }

    /** @param {object} savedState a state already validated by State.sanitize */
    loadState(savedState) {
      this.state = savedState;
      this._recalculate();
      // An event time that passed while the game was closed is rescheduled
      // (never fired instantly), so refreshing can not be used to farm events.
      if (this.state.nextEventAt <= this.now()) this.state.nextEventAt = 0;
      this._emit('loaded');
    }

    getState() {
      return this.state;
    }

    /** Remembers "the player was playing right now" (used for offline income). */
    markActive() {
      this.state.lastActiveAt = this.now();
    }

    /* ----------------------- core actions ----------------------- */

    /** The player tapped the character. Returns followers gained. */
    click() {
      const gain = this.getClickGain();
      this._earn(gain);
      this._emit('click', { gain: gain });
      return gain;
    }

    /**
     * Advances the game by "seconds" of real time: passive followers, events.
     * The viral multiplier is applied only to the part of this time that was
     * really inside the event.
     */
    tick(seconds) {
      const dt = (seconds === undefined) ? 1 : Math.max(0, seconds);
      let gain = 0;

      if (dt > 0 && this.state.followersPerSecond > 0) {
        const boosted = this._boostedSeconds(dt, 'passive');
        gain = this.state.followersPerSecond * (dt + boosted.seconds * (boosted.multiplier - 1));
      }
      if (gain > 0) {
        this._earn(gain);
        this._emit('passive', { gain: gain });
      }

      this.markActive();
      this._updateEvents();
      this._emit('tick');
      return gain;
    }

    /**
     * Claims the next level of a bonus. It costs nothing: it only needs the
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

    /* ----------------------- earning rates ----------------------- */

    /** Followers gained by one tap, including an active event. */
    getClickGain() {
      return this.state.followersPerClick * this.getTapMultiplier();
    }

    /** Followers gained per second, including an active event. */
    getPassiveGain() {
      return this.state.followersPerSecond * this.getPassiveMultiplier();
    }

    getTapMultiplier() {
      const ev = this.getActiveEvent();
      return ev ? (ev.def.multipliers.tap || 1) : 1;
    }

    getPassiveMultiplier() {
      const ev = this.getActiveEvent();
      return ev ? (ev.def.multipliers.passive || 1) : 1;
    }

    /** Permanent earning power used by the minigames (events are not included). */
    getEarningPower() {
      const s = this.state;
      return s.followersPerSecond + s.followersPerClick * Config.MINIGAMES.dice.tapWeight;
    }

    /* ----------------------- bonuses ----------------------- */

    /** Everything the UI needs to draw one bonus. */
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
        nextEffect: Config.upgradeEffectFor(upgrade, level + 1),
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

    /* ----------------------- viral events ----------------------- */

    /** The running event as { def, startedAt, endsAt, secondsLeft }, or null. */
    getActiveEvent() {
      const ev = this.state.activeEvent;
      if (!ev) return null;
      const def = Config.EVENTS[ev.id];
      if (!def) return null;
      const msLeft = ev.endsAt - this.now();
      if (msLeft <= 0) return null;
      // Never longer than the configured duration (clock moved backwards).
      const secondsLeft = Math.min(def.durationSeconds, Math.ceil(msLeft / 1000));
      return { def: def, startedAt: ev.startedAt, endsAt: ev.endsAt, secondsLeft: secondsLeft };
    }

    /**
     * Starts an event. Events never stack: nothing happens while one is running.
     * "force" (developer panel) ignores the unlock level.
     */
    startEvent(eventId, options) {
      const def = Config.EVENTS[eventId];
      if (!def) return false;
      if (this.getActiveEvent()) return false;
      const force = Boolean(options && options.force);
      if (!force && !this.state.unlocks[def.unlockId]) return false;

      const now = this.now();
      this.state.activeEvent = { id: def.id, startedAt: now, endsAt: now + def.durationSeconds * 1000 };
      this._scheduleNextEvent(this.state.activeEvent.endsAt);

      this._emit('eventStarted', { event: def });
      this._emit('changed');
      this._emit('importantChange');
      return true;
    }

    /** Ends the running event immediately. Returns true if there was one. */
    endEvent() {
      const ev = this.state.activeEvent;
      if (!ev) return false;
      const def = Config.EVENTS[ev.id] || null;
      this.state.activeEvent = null;
      this._emit('eventEnded', { event: def });
      this._emit('changed');
      this._emit('importantChange');
      return true;
    }

    /** Ends a finished event and starts a new one when it is time. Called every tick. */
    _updateEvents(quiet) {
      const s = this.state;
      const now = this.now();

      if (s.activeEvent) {
        const def = Config.EVENTS[s.activeEvent.id];
        if (!def) {
          s.activeEvent = null;
        } else if (now >= s.activeEvent.endsAt) {
          if (quiet) s.activeEvent = null;   // ran out while the player was away: no pop-up
          else this.endEvent();
        } else if (s.activeEvent.endsAt - now > def.durationSeconds * 1000 + 1000) {
          s.activeEvent.endsAt = now + def.durationSeconds * 1000; // clock was moved backwards
        }
      }

      if (s.activeEvent || !this._anyEventUnlocked()) return;

      const maxDelayMs = Config.EVENT_SCHEDULER.maxDelaySeconds * 1000;
      if (s.nextEventAt === 0 || s.nextEventAt - now > maxDelayMs + 1000) {
        this._scheduleNextEvent(now);            // first time, or clock moved backwards
      } else if (now >= s.nextEventAt) {
        const id = this._pickEvent();
        if (id) this.startEvent(id);
      }
    }

    _anyEventUnlocked() {
      const unlocks = this.state.unlocks;
      return Object.keys(Config.EVENTS).some(function (id) { return unlocks[Config.EVENTS[id].unlockId]; });
    }

    /** Weighted random choice among unlocked events. */
    _pickEvent() {
      const unlocks = this.state.unlocks;
      const choices = Object.keys(Config.EVENTS)
        .map(function (id) { return Config.EVENTS[id]; })
        .filter(function (def) { return unlocks[def.unlockId]; });
      if (choices.length === 0) return null;
      let roll = this.random() * choices.reduce(function (sum, def) { return sum + (def.weight || 1); }, 0);
      for (let i = 0; i < choices.length; i++) {
        roll -= (choices[i].weight || 1);
        if (roll < 0) return choices[i].id;
      }
      return choices[choices.length - 1].id;
    }

    _scheduleNextEvent(fromMs) {
      const sched = Config.EVENT_SCHEDULER;
      const delay = sched.minDelaySeconds + this.random() * (sched.maxDelaySeconds - sched.minDelaySeconds);
      this.state.nextEventAt = fromMs + Math.round(delay * 1000);
    }

    /**
     * Of the last "dt" seconds, how many were inside the running event?
     * Returns { seconds, multiplier } for the given kind ('tap' or 'passive').
     */
    _boostedSeconds(dt, kind) {
      const ev = this.state.activeEvent;
      const def = ev ? Config.EVENTS[ev.id] : null;
      if (!def) return { seconds: 0, multiplier: 1 };
      const now = this.now();
      const from = Math.max(now - dt * 1000, ev.startedAt);
      const to = Math.min(now, ev.endsAt);
      const seconds = Math.min(dt, Math.max(0, (to - from) / 1000));
      return { seconds: seconds, multiplier: def.multipliers[kind] || 1 };
    }

    /* ----------------------- minigames ----------------------- */

    /** Everything the UI needs to draw a minigame. */
    getMinigameInfo(id) {
      const def = Config.MINIGAMES[id];
      if (!def) return null;
      const s = this.state;
      const record = s.minigames[id];
      const unlocked = Boolean(s.unlocks[def.unlockId]);

      // Remaining cooldown, never longer than the cooldown itself.
      const msLeft = record.readyAt - this.now();
      const secondsLeft = Math.min(def.cooldownSeconds, Math.max(0, Math.ceil(msLeft / 1000)));

      return {
        def: def,
        unlocked: unlocked,
        secondsLeft: secondsLeft,
        ready: unlocked && secondsLeft === 0,
        lastResult: record.lastResult,
        lastReward: record.lastReward,
        rewardPerPip: Math.floor(this.getEarningPower() * def.rewardSeconds)
      };
    }

    /**
     * Rolls the dice. The reward is paid and the cooldown starts right now, so
     * refreshing the page can not skip the cooldown or lose the reward.
     * Returns { result, reward }, or null if the dice can not be rolled.
     */
    playDice() {
      const info = this.getMinigameInfo('dice');
      if (!info || !info.ready) return null;

      const def = info.def;
      const result = Math.min(def.sides, 1 + Math.floor(this.random() * def.sides));
      const reward = Math.floor(this.getEarningPower() * result * def.rewardSeconds);

      // Record everything first: a level-up caused by the reward saves the game.
      const record = this.state.minigames.dice;
      record.readyAt = this.now() + def.cooldownSeconds * 1000;
      record.lastResult = result;
      record.lastReward = reward;

      this._earn(reward);
      this._emit('minigamePlayed', { id: def.id, result: result, reward: reward });
      this._emit('changed');
      this._emit('importantChange');
      return { result: result, reward: reward };
    }

    /* ----------------------- offline income ----------------------- */

    /**
     * Compares "now" with the last time the player was active. If they were
     * away long enough and passive income is unlocked, the reward is stored in
     * state.pendingOffline (and saved) until the player collects it.
     * Returns the pending reward, or null.
     */
    checkOffline() {
      const s = this.state;
      const now = this.now();
      const last = s.lastActiveAt;
      let created = false;

      s.lastActiveAt = now;   // whatever happens below, this time is now accounted for

      if (last > 0 && now > last) {
        const away = (now - last) / 1000;
        if (away >= Config.OFFLINE.minAwaySeconds) {
          if (s.unlocks.passiveFollowers) {
            const counted = Math.min(away, Config.OFFLINE.maxSeconds);
            // Permanent rate only: viral multipliers never apply offline.
            const followers = Math.floor(s.followersPerSecond * counted * Config.OFFLINE.efficiency);
            if (followers > 0) {
              const previous = s.pendingOffline;
              s.pendingOffline = {
                seconds: (previous ? previous.seconds : 0) + away,
                followers: Math.min(State.MAX_FOLLOWERS, (previous ? previous.followers : 0) + followers)
              };
              created = true;
            }
          }
          if (s.nextEventAt <= now) s.nextEventAt = 0;   // never fire a missed event at once
        }
      }

      this._updateEvents(true);
      if (created) {
        this._emit('offlinePending', this.getPendingOffline());
        this._emit('importantChange');
      }
      this._emit('changed');
      return this.getPendingOffline();
    }

    getPendingOffline() {
      const p = this.state.pendingOffline;
      return p ? { seconds: p.seconds, followers: p.followers } : null;
    }

    /** Pays the waiting offline reward. Returns the followers collected. */
    collectOffline() {
      const pending = this.state.pendingOffline;
      if (!pending) return 0;
      this.state.pendingOffline = null;   // cleared first, so it can never be paid twice
      this._earn(pending.followers);
      this._emit('offlineCollected', { followers: pending.followers });
      this._emit('changed');
      this._emit('importantChange');
      return pending.followers;
    }

    /* ----------------------- developer helpers ----------------------- */
    // Used only by the hidden developer panel (js/dev.js) and tests.

    /** Adds followers through the normal path (levels and unlocks follow). */
    devAddFollowers(amount) {
      this._earn(amount);
    }

    /**
     * Sets the follower count. Going up uses the normal path (toasts, unlocks).
     * Going down is allowed here for testing; the level is still calculated
     * from followers, never set directly.
     */
    devSetFollowers(target) {
      const s = this.state;
      const value = Math.min(State.MAX_FOLLOWERS, Math.max(0, Math.floor(target)));
      if (value >= s.followers) {
        this._earn(value - s.followers);
        return;
      }
      s.followers = value;
      this._recalculate();
      this._emit('changed');
      this._emit('importantChange');
    }

    devClearCooldown(minigameId) {
      const record = this.state.minigames[minigameId];
      if (record) record.readyAt = 0;
      this._emit('changed');
      this._emit('importantChange');
    }

    /** Pretends the player was away for "seconds" and runs the offline check. */
    devSimulateOffline(seconds) {
      this.state.lastActiveAt = this.now() - seconds * 1000;
      return this.checkOffline();
    }

    /* ----------------------- internals ----------------------- */

    /** Adds followers. They are never removed. */
    _earn(amount) {
      if (!(amount > 0)) return;
      const s = this.state;
      s.followers = Math.min(State.MAX_FOLLOWERS, s.followers + amount);
      this._updateLevel();
      this._emit('changed');
    }

    /** Level only depends on the follower count. */
    _updateLevel() {
      const s = this.state;
      const oldLevel = s.level;
      const newLevel = Config.levelForFollowers(s.followers);
      if (newLevel === oldLevel) return;

      const newlyUnlocked = Config.UNLOCKS.filter(function (u) {
        return !s.unlocks[u.id] && newLevel >= u.level;
      });

      s.level = newLevel;
      this._recalculate(); // applies unlock flags and stat changes

      // Announce only after the state is fully consistent.
      this._emit('levelUp', { from: oldLevel, to: newLevel });
      newlyUnlocked.forEach(function (u) { this._emit('unlock', { unlock: u }); }, this);
      this._emit('importantChange');
    }

    /**
     * Rebuilds everything derived from the core data, silently (no events):
     * level, unlock flags, followers per click, followers per second.
     * Order: base + unlock grants + claimed bonuses, then permanent multipliers.
     */
    _recalculate() {
      const s = this.state;
      s.level = Config.levelForFollowers(s.followers);

      const stats = {};
      Object.keys(Config.BASE_STATS).forEach(function (key) {
        stats[key] = Config.BASE_STATS[key];
      });

      // Unlock flags always follow the level (never trusted from a save).
      Config.UNLOCKS.forEach(function (u) {
        s.unlocks[u.id] = s.level >= u.level;
        if (s.unlocks[u.id] && u.grants) {
          Object.keys(u.grants).forEach(function (stat) { stats[stat] += u.grants[stat]; });
        }
      });

      Config.UPGRADES.forEach(function (u) {
        stats[u.stat] += Config.upgradeEffectTotal(u, s.upgrades[u.id] || 0);
      });

      Config.UNLOCKS.forEach(function (u) {
        if (s.unlocks[u.id] && u.multipliers) {
          Object.keys(u.multipliers).forEach(function (stat) { stats[stat] *= u.multipliers[stat]; });
        }
      });

      s.followersPerClick = stats.followersPerClick;
      s.followersPerSecond = stats.followersPerSecond;
    }
  }

  NS.Game = Game;
})(window.Influencer = window.Influencer || {});
