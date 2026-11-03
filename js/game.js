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
 *   moneyEarned      { amount, source }       money was added
 *   moneyMilestone   { milestone }            a one-time milestone payout was received
 *   itemPurchased    { item, level }
 *   sponsorshipOffered / sponsorshipAccepted / sponsorshipComplete / sponsorshipCollected
 *   challengeStarted / challengeComplete / challengeCollected
 *   importantChange  level up / unlock / claim / event / roll ... (main.js saves on this)
 *
 * Followers are never spent. They are a milestone counter: reaching an amount
 * unlocks things (levels, features, the next level of each bonus).
 * Money is a different currency: it can be spent (shop items).
 *
 * Permanent bonuses (shop items) are ADDED together: +10% and +15% = +25%.
 * Temporary multipliers (viral events) multiply the final amount afterwards.
 * The two are never mixed: see _recalculate (permanent) and getClickGain /
 * tick (temporary).
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
      this.cupRound = null;       // the Cup Shuffle in progress (not saved)
      this.devCupForce = null;    // developer panel: 'win' / 'loss' for the next Cup Shuffle
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
      this.cupRound = null;
      this.devCupForce = null;
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
      this.cupRound = null;      // a half-played Cup Shuffle is lost on refresh (its cooldown stays)
      this.devCupForce = null;
      this._emit('loaded');
      // Time that passed while the game was closed (sponsorship timer...) and
      // payouts a save from an older version has not received yet.
      this._updateEconomy(true);
      this._grantMoneyMilestones();
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
      this._progressChallenge('taps', 1);
      if (this.getTapMultiplier() > 1) this._progressChallenge('viralFollowers', gain);
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
        const viral = this._boostedSeconds(dt, 'passive');
        if (viral.seconds > 0) {
          this._progressChallenge('viralFollowers', this.state.followersPerSecond * viral.seconds * viral.multiplier);
        }
        this._emit('passive', { gain: gain });
      }

      this.markActive();
      this._updateEvents();
      this._updateEconomy();
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
    // Shared by every minigame: unlock, cooldown, record (saved), reward payment.
    // Game-specific rules are in playDice / startCupShuffle + chooseCup.

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

      const info = {
        def: def,
        unlocked: unlocked,
        secondsLeft: secondsLeft,
        ready: unlocked && secondsLeft === 0,
        lastResult: record.lastResult,
        lastReward: record.lastReward
      };
      if (id === 'dice') info.rewardPerPip = Math.floor(this.getEarningPower() * def.rewardSeconds);
      if (def.rewardType === 'money') info.rewardRange = this._moneyRewardRange(def);
      return info;
    }

    /** Records a finished play: cooldown, last result, reward, challenge progress. */
    _recordMinigame(def, result, reward, success) {
      const record = this.state.minigames[def.id];
      record.lastResult = result;
      record.lastReward = reward;
      if (success && def.challengeMetric) this._progressChallenge(def.challengeMetric, 1);
    }

    _startCooldown(def) {
      this.state.minigames[def.id].readyAt = this.now() + def.cooldownSeconds * 1000;
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
      this._startCooldown(def);
      this._recordMinigame(def, result, reward, true);

      this._earn(reward);
      this._emit('minigamePlayed', { id: def.id, result: result, reward: reward, currency: 'followers' });
      this._emit('changed');
      this._emit('importantChange');
      return { result: result, reward: reward };
    }

    /** Money range of a money minigame at the current level, bonus included. */
    _moneyRewardRange(def) {
      const tier = Config.tierForLevel(def.rewards, this.state.level);
      const factor = 1 + this.getBonus('minigameMoney');
      return {
        min: Math.round(tier.min * factor),
        max: Math.round(tier.max * factor),
        consolation: Math.round(tier.consolation * factor)
      };
    }

    /**
     * CUP SHUFFLE, step 1: start a round. The cooldown starts NOW (so a refresh
     * can not be used to retry) and the whole shuffle is decided here: the ball's
     * start cup and the list of swaps. Tracking the ball through the swaps gives
     * the winning cup, which is kept inside the game. Returns what the screen
     * needs to animate: { cups, startPosition, swaps }, or null if not ready.
     */
    startCupShuffle() {
      const info = this.getMinigameInfo('cupShuffle');
      if (!info || !info.ready || this.cupRound) return null;
      const def = info.def;
      const cups = def.cups;

      const startPosition = Math.min(cups - 1, Math.floor(this.random() * cups));
      const swaps = [];
      let ball = startPosition;
      for (let i = 0; i < def.swaps; i++) {
        const a = Math.min(cups - 1, Math.floor(this.random() * cups));
        const offset = 1 + Math.min(cups - 2, Math.floor(this.random() * (cups - 1)));
        const b = (a + offset) % cups;            // always a different cup
        swaps.push([a, b]);
        if (ball === a) ball = b; else if (ball === b) ball = a;
      }

      this.cupRound = { cups: cups, startPosition: startPosition, swaps: swaps, winningPosition: ball };
      this._startCooldown(def);
      this._emit('changed');
      this._emit('importantChange');
      return this.getCupRound();
    }

    /** The round in progress as the screen may see it (without the answer), or null. */
    getCupRound() {
      const r = this.cupRound;
      if (!r) return null;
      return { cups: r.cups, startPosition: r.startPosition, swaps: r.swaps.map(function (p) { return p.slice(); }) };
    }

    /**
     * CUP SHUFFLE, step 2: the player picks the cup standing in position
     * "position". It is a win only if that is where the ball really is.
     * Returns { win, reward, ballPosition, chosen }, or null without a round.
     */
    chooseCup(position) {
      const round = this.cupRound;
      if (!round || !Number.isInteger(position) || position < 0 || position >= round.cups) return null;
      this.cupRound = null;                         // one pick per round

      const def = Config.MINIGAMES.cupShuffle;
      let ballPosition = round.winningPosition;
      let win = position === ballPosition;

      // Developer panel only: force the outcome of this round.
      if (this.devCupForce) {
        win = this.devCupForce === 'win';
        ballPosition = win ? position : (position + 1) % round.cups;
        this.devCupForce = null;
      }

      const range = this._moneyRewardRange(def);
      let reward = range.consolation;
      if (win) {
        const tier = Config.tierForLevel(def.rewards, this.state.level);
        const base = this._rollRounded(tier.min, tier.max, def.rewardRounding);
        reward = Math.round(base * (1 + this.getBonus('minigameMoney')));
      }

      this._recordMinigame(def, win ? 1 : 0, reward, win);
      this._earnMoney(reward, 'cupShuffle');
      this._emit('minigamePlayed', { id: def.id, result: win ? 1 : 0, reward: reward, currency: 'money', win: win });
      this._emit('changed');
      this._emit('importantChange');
      return { win: win, reward: reward, ballPosition: ballPosition, chosen: position };
    }

    /** Random whole amount between min and max, rounded to a step (e.g. 5). */
    _rollRounded(min, max, step) {
      const raw = min + this.random() * (max - min);
      const rounded = Math.round(raw / step) * step;
      return Math.min(max, Math.max(min, rounded));
    }

    /* ----------------------- money ----------------------- */

    /** Adds money (a whole number). Money is the only thing that can be spent. */
    _earnMoney(amount, source) {
      const value = Math.round(amount);
      if (!(value > 0)) return 0;
      const s = this.state;
      s.money = Math.min(State.MAX_MONEY, s.money + value);
      this._emit('moneyEarned', { amount: value, source: source || '' });
      this._emit('changed');
      return value;
    }

    /** One-time milestone payouts for reaching a level. Each is paid only once. */
    _grantMoneyMilestones() {
      const s = this.state;
      Config.MONEY.milestones.forEach(function (m) {
        if (s.moneyMilestones[m.id] || s.level < m.level) return;
        s.moneyMilestones[m.id] = true;           // marked first: it can never be paid twice
        this._earnMoney(m.amount, 'milestone');
        this._emit('moneyMilestone', { milestone: m });
        this._emit('importantChange');
      }, this);
    }

    /* ----------------------- shop items ----------------------- */

    /**
     * Total permanent bonus of one kind from all owned items, as a fraction
     * (0.25 = +25%). Bonuses are ADDED, never multiplied against each other.
     */
    getBonus(type) {
      const items = this.state.items;
      let total = 0;
      Config.ITEMS.forEach(function (item) {
        const level = items[item.id] || 0;
        if (level <= 0) return;
        item.bonuses.forEach(function (b) { if (b.type === type) total += b.value * level; });
      });
      return Math.round(total * 1e6) / 1e6;          // no floating point dust (0.1 + 0.15)
    }

    /** Everything the UI needs to draw one shop item. */
    getItemInfo(itemId) {
      const item = Config.getItem(itemId);
      if (!item) return null;
      const s = this.state;
      const level = s.items[itemId] || 0;
      const owned = level >= item.maxLevel;
      const unlocked = s.level >= item.unlockLevel;
      const affordable = s.money >= item.price;
      return {
        item: item,
        level: level,
        owned: owned,
        unlocked: unlocked,
        affordable: affordable,
        canBuy: Boolean(s.unlocks.creatorFund) && unlocked && !owned && affordable
      };
    }

    /** Buys the next level of an item. Returns true if it was bought. */
    buyItem(itemId) {
      const info = this.getItemInfo(itemId);
      if (!info || !info.canBuy) return false;

      const s = this.state;
      s.money -= info.item.price;                    // can not go below 0: canBuy checked it
      s.items[itemId] = info.level + 1;
      this._recalculate();                           // the bonus applies immediately

      this._emit('itemPurchased', { item: info.item, level: info.level + 1 });
      this._emit('changed');
      this._emit('importantChange');
      return true;
    }

    /* ----------------------- economy timers ----------------------- */

    /** Sponsorship and challenge timers. Called every tick, on load and after offline time. */
    _updateEconomy(quiet) {
      this._updateSponsorship(quiet);
      this._updateChallenges();
    }

    /* ----------------------- sponsorships ----------------------- */

    /** Everything the UI needs to draw the sponsorship card. */
    getSponsorshipInfo() {
      const s = this.state;
      const now = this.now();
      const cfg = Config.SPONSORSHIPS;
      const info = {
        unlocked: Boolean(s.unlocks.sponsorships),
        status: 'none',               // none | offered | active | complete
        campaign: null,
        secondsLeft: 0,
        totalSeconds: 0,
        basePayment: 0,
        bonusPercent: Math.round(this.getBonus('sponsorshipMoney') * 100),
        payment: 0,
        meetsRequirement: true,
        nextOfferSeconds: 0
      };
      if (!info.unlocked) return info;

      const sp = s.sponsorship;
      const campaign = sp ? Config.getCampaign(sp.campaignId) : null;
      if (!sp || !campaign) {
        info.nextOfferSeconds = Math.min(cfg.offerDelaySeconds.max, Math.max(0, Math.ceil((s.sponsorshipNextOfferAt - now) / 1000)));
        return info;
      }

      info.campaign = campaign;
      info.status = sp.status;
      info.totalSeconds = campaign.durationSeconds;
      info.basePayment = campaign.basePayment;
      info.payment = this._sponsorshipPayment(campaign);
      info.meetsRequirement = s.followers >= campaign.requiredFollowers;
      if (sp.status === 'active') {
        // Never longer than the campaign itself (clock moved backwards).
        info.secondsLeft = Math.min(campaign.durationSeconds, Math.max(0, Math.ceil((sp.endsAt - now) / 1000)));
        if (info.secondsLeft === 0) info.status = 'complete';
      }
      return info;
    }

    /** Base payment plus the ADDED sponsorship bonuses (outfit +10%, room +10% = +20%). */
    _sponsorshipPayment(campaign) {
      return Math.round(campaign.basePayment * (1 + this.getBonus('sponsorshipMoney')));
    }

    _scheduleNextOffer(fromMs) {
      const d = Config.SPONSORSHIPS.offerDelaySeconds;
      const delay = d.min + this.random() * (d.max - d.min);
      this.state.sponsorshipNextOfferAt = fromMs + Math.round(delay * 1000);
    }

    /** Offers a campaign. Only one sponsorship exists at a time. */
    _createOffer(options) {
      const s = this.state;
      if (s.sponsorship) return false;
      const all = Config.SPONSORSHIPS.campaigns;
      let choices = all.filter(function (c) { return s.followers >= c.requiredFollowers; });
      if (choices.length === 0) {
        if (!(options && options.force)) return false;   // nothing the player qualifies for yet
        choices = [all[0]];
      }
      const campaign = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      s.sponsorship = { campaignId: campaign.id, status: 'offered', offeredAt: this.now(), startedAt: 0, endsAt: 0 };
      this._emit('sponsorshipOffered', { campaign: campaign });
      this._emit('changed');
      this._emit('importantChange');
      return true;
    }

    /** Finishes a campaign whose timer ran out, and makes new offers when it is time. */
    _updateSponsorship(quiet) {
      const s = this.state;
      const now = this.now();
      if (!s.unlocks.sponsorships) return;

      const sp = s.sponsorship;
      if (sp && !Config.getCampaign(sp.campaignId)) { s.sponsorship = null; return; }

      if (sp) {
        if (sp.status === 'active') {
          const campaign = Config.getCampaign(sp.campaignId);
          if (now >= sp.endsAt) {
            sp.status = 'complete';
            if (!quiet) this._emit('sponsorshipComplete', { campaign: campaign });
            this._emit('changed');
            this._emit('importantChange');
          } else if (sp.endsAt - now > campaign.durationSeconds * 1000 + 1000) {
            sp.endsAt = now + campaign.durationSeconds * 1000;   // clock was moved backwards
          }
        }
        return;
      }

      const maxDelayMs = Config.SPONSORSHIPS.offerDelaySeconds.max * 1000;
      if (s.sponsorshipNextOfferAt === 0 || s.sponsorshipNextOfferAt - now > maxDelayMs + 1000) {
        this._scheduleNextOffer(now);               // first time, or clock moved backwards
      } else if (now >= s.sponsorshipNextOfferAt) {
        if (!this._createOffer()) this._scheduleNextOffer(now);   // not qualified yet: try later
      }
    }

    /** Accepts the offered campaign: its timer starts now. */
    acceptSponsorship() {
      const info = this.getSponsorshipInfo();
      if (info.status !== 'offered' || !info.meetsRequirement) return false;
      const sp = this.state.sponsorship;
      const now = this.now();
      sp.status = 'active';
      sp.startedAt = now;
      sp.endsAt = now + info.campaign.durationSeconds * 1000;
      this._emit('sponsorshipAccepted', { campaign: info.campaign });
      this._emit('changed');
      this._emit('importantChange');
      return true;
    }

    /** Collects the money of a completed campaign. Returns the money paid. */
    collectSponsorship() {
      const info = this.getSponsorshipInfo();
      if (info.status !== 'complete') return 0;
      const s = this.state;
      s.sponsorship = null;                          // cleared first: it can never be paid twice
      this._scheduleNextOffer(this.now());
      const paid = this._earnMoney(info.payment, 'sponsorship');
      this._emit('sponsorshipCollected', { campaign: info.campaign, amount: paid });
      this._progressChallenge('sponsorships', 1);
      this._emit('changed');
      this._emit('importantChange');
      return paid;
    }

    /* ----------------------- challenges ----------------------- */

    /** Everything the UI needs to draw the challenge card. */
    getChallengeInfo() {
      const s = this.state;
      const now = this.now();
      const unlocked = Boolean(s.unlocks.challenges);
      const cur = s.challenges.current;
      const info = { unlocked: unlocked, status: 'none', text: '', progress: 0, target: 0, reward: 0, nextSeconds: 0 };
      if (!unlocked) return info;
      if (!cur) {
        info.nextSeconds = Math.min(Config.CHALLENGES.delaySeconds, Math.max(0, Math.ceil((s.challenges.nextAt - now) / 1000)));
        return info;
      }
      const type = Config.getChallengeType(cur.typeId);
      info.status = cur.status;
      info.text = type.text.replace('{target}', NS.Format.formatFull(cur.target));
      info.progress = cur.progress;
      info.target = cur.target;
      info.reward = cur.reward;
      return info;
    }

    /** Challenge types the player can do right now. */
    _availableChallengeTypes() {
      const unlocks = this.state.unlocks;
      return Config.CHALLENGES.types.filter(function (t) { return !t.unlockId || unlocks[t.unlockId]; });
    }

    /** Creates the next challenge. "force" (developer panel) replaces the current one. */
    _generateChallenge(force) {
      const s = this.state;
      if (!s.unlocks.challenges) return false;
      if (s.challenges.current && !force) return false;

      let choices = this._availableChallengeTypes();
      if (choices.length === 0) return false;
      const last = s.challenges.lastTypeId;
      const different = choices.filter(function (t) { return t.id !== last; });
      if (different.length > 0) choices = different;       // avoid the same challenge twice in a row

      const type = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      const target = Config.tierForLevel(type.targets, s.level).target;
      const range = Config.tierForLevel(Config.CHALLENGES.rewards, s.level);
      const reward = this._rollRounded(range.min, range.max, Config.CHALLENGES.rewardRounding);

      s.challenges.current = { typeId: type.id, target: target, progress: 0, reward: reward, status: 'active' };
      s.challenges.lastTypeId = type.id;
      this._emit('challengeStarted', { type: type, info: this.getChallengeInfo() });
      this._emit('changed');
      this._emit('importantChange');
      return true;
    }

    _updateChallenges() {
      const s = this.state;
      if (!s.unlocks.challenges || s.challenges.current) return;
      if (this.now() >= s.challenges.nextAt) this._generateChallenge(false);
    }

    /** Adds progress to the running challenge if it counts this kind of action. */
    _progressChallenge(metric, amount) {
      const cur = this.state.challenges.current;
      if (!cur || cur.status !== 'active' || !(amount > 0)) return;
      const type = Config.getChallengeType(cur.typeId);
      if (!type || type.metric !== metric) return;

      cur.progress = Math.min(cur.target, cur.progress + amount);
      if (cur.progress >= cur.target) {
        cur.status = 'complete';
        this._emit('challengeComplete', { info: this.getChallengeInfo() });
        this._emit('importantChange');
      }
      this._emit('changed');
    }

    /** Collects the reward of a completed challenge. Returns the money paid. */
    collectChallenge() {
      const s = this.state;
      const cur = s.challenges.current;
      if (!cur || cur.status !== 'complete') return 0;
      s.challenges.current = null;                   // cleared first: it can never be paid twice
      s.challenges.nextAt = this.now() + Config.CHALLENGES.delaySeconds * 1000;
      const paid = this._earnMoney(cur.reward, 'challenge');
      this._emit('challengeCollected', { amount: paid });
      this._emit('changed');
      this._emit('importantChange');
      return paid;
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
      this._updateEconomy(true);       // sponsorship timers keep running while closed
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
      this._grantMoneyMilestones();
      this._emit('changed');
      this._emit('importantChange');
    }

    devClearCooldown(minigameId) {
      const record = this.state.minigames[minigameId];
      if (record) record.readyAt = 0;
      this._emit('changed');
      this._emit('importantChange');
    }

    /* ----- economy (developer panel) ----- */

    devAddMoney(amount) {
      this._earnMoney(amount, 'dev');
      this._emit('importantChange');
    }

    devSetMoney(amount) {
      this.state.money = Math.min(State.MAX_MONEY, Math.max(0, Math.floor(amount)));
      this._emit('changed');
      this._emit('importantChange');
    }

    /** The next Cup Shuffle is a win/loss whatever cup is picked (everything else is real). */
    devForceCup(outcome) {
      this.devCupForce = outcome;
      this.state.minigames.cupShuffle.readyAt = 0;
      this._emit('changed');
    }

    /** Offers a sponsorship now (needs the sponsorship unlock and no running one). */
    devGenerateSponsorship() {
      if (!this.state.unlocks.sponsorships) return false;
      return this._createOffer({ force: true });
    }

    /** Lets the running campaign finish (the normal completion code runs). */
    devCompleteSponsorship() {
      const sp = this.state.sponsorship;
      if (!sp || sp.status !== 'active') return false;
      sp.endsAt = this.now();
      this._updateSponsorship();
      return true;
    }

    devClearSponsorship() {
      this.state.sponsorship = null;
      this.state.sponsorshipNextOfferAt = 0;
      this._emit('changed');
      this._emit('importantChange');
    }

    devGenerateChallenge() {
      return this._generateChallenge(true);
    }

    /** Completes the running challenge through the normal progress code. */
    devCompleteChallenge() {
      const cur = this.state.challenges.current;
      if (!cur || cur.status !== 'active') return false;
      const type = Config.getChallengeType(cur.typeId);
      this._progressChallenge(type.metric, cur.target - cur.progress);
      return true;
    }

    /**
     * Economy test preset: wipes money, purchases, payouts, sponsorship and
     * challenge, then sets the followers of "level" so the REAL level-up code
     * pays the milestone rewards again.
     */
    devEconomyPreset(level) {
      const s = this.state;
      const fresh = State.createNew();
      s.money = 0;
      s.moneyMilestones = {};
      s.items = fresh.items;
      s.sponsorship = null;
      s.sponsorshipNextOfferAt = 0;
      s.challenges = fresh.challenges;
      s.minigames.cupShuffle.readyAt = 0;
      this.cupRound = null;
      this._recalculate();
      this.devSetFollowers(Config.followersForLevel(level));
      this._grantMoneyMilestones();
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
      // Counted BEFORE the level check, so a challenge created by a level-up
      // does not instantly receive the followers that caused the level-up.
      this._progressChallenge('followersGained', amount);
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
      this._grantMoneyMilestones();      // one-time payouts (money unlock, level 15, 20)
      this._updateEconomy();             // e.g. the first challenge appears at once
      this._emit('importantChange');
    }

    /**
     * Rebuilds everything derived from the core data, silently (no events):
     * level, unlock flags, followers per click, followers per second.
     * Order: base + unlock grants + claimed bonuses, then permanent unlock
     * multipliers, then the ADDED shop item bonuses.
     * Temporary event multipliers are not part of this (see click / tick).
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

      // Shop items: permanent percentage bonuses. Same-kind bonuses are ADDED
      // (never multiplied together); the result multiplies the stat once.
      const all = this.getBonus('allFollowers');
      stats.followersPerClick *= 1 + this.getBonus('tapFollowers') + all;
      stats.followersPerSecond *= 1 + this.getBonus('passiveFollowers') + all;

      // Rounded to remove floating point dust (1.1 x 3 = 3.3000000000000003).
      s.followersPerClick = Math.round(stats.followersPerClick * 1e6) / 1e6;
      s.followersPerSecond = Math.round(stats.followersPerSecond * 1e6) / 1e6;
    }
  }

  NS.Game = Game;
})(window.Influencer = window.Influencer || {});
