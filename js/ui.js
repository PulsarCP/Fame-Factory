/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Everything that touches the page: reading the game state to draw it,
 * visual feedback (floating numbers, toasts, animations, modals) and wiring
 * DOM input to the callbacks supplied by main.js.
 *
 * The UI never changes game rules. It only asks the game to do things
 * (claimUpgrade, playDice, collectOffline) or reports input upward (handlers).
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;
  const Format = NS.Format;
  const formatNumber = Format.formatNumber;

  let game = null;
  let els = {};
  let currentScreen = 'menu';
  let diceRolling = false;       // the roll animation is playing
  let diceAnimation = null;      // interval id of the animation
  const upgradeCards = {};       // bonusId -> references to its DOM nodes
  const unlockRows = {};         // unlockId -> references to its DOM nodes
  const minigameTiles = {};      // minigameId -> references to its DOM nodes

  /* ======================= helpers ======================= */

  function byId(id) { return document.getElementById(id); }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** Only touches the DOM when the text really changed (cheap, no flicker). */
  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** Small scale animation (skipped if the browser has no Web Animations). */
  function pulse(el, keyframes, duration) {
    if (!el || typeof el.animate !== 'function') return;
    el.animate(keyframes, { duration: duration, easing: 'ease-out' });
  }

  /* ======================= setup ======================= */

  function cacheElements() {
    els = {
      menuScreen: byId('screen-menu'),
      gameScreen: byId('screen-game'),
      btnNew: byId('btn-new'),
      btnContinue: byId('btn-continue'),
      continueInfo: byId('continue-info'),
      btnDelete: byId('btn-delete-save'),
      btnMenu: byId('btn-menu'),
      levelBadge: byId('level-badge'),
      level: byId('level'),
      followers: byId('followers'),
      perClick: byId('per-click'),
      perSecond: byId('per-second'),
      progressBar: byId('progress-bar'),
      progressFill: byId('progress-fill'),
      progressText: byId('progress-text'),
      stage: byId('stage'),
      stageName: byId('stage-name'),
      character: byId('character'),
      floatLayer: byId('float-layer'),
      eventBanner: byId('event-banner'),
      eventTitle: byId('event-title'),
      eventLabel: byId('event-label'),
      eventTimer: byId('event-timer'),
      upgradeList: byId('upgrade-list'),
      minigameList: byId('minigame-list'),
      unlockList: byId('unlock-list'),
      versionLabel: byId('version-label'),
      toasts: byId('toasts'),
      diceModal: byId('modal-dice'),
      dice: byId('dice'),
      diceHelp: byId('dice-help'),
      diceResult: byId('dice-result'),
      btnRoll: byId('btn-roll'),
      btnDiceClose: byId('btn-dice-close'),
      welcomeModal: byId('modal-welcome'),
      welcomeAway: byId('welcome-away'),
      welcomeEarned: byId('welcome-earned'),
      welcomeNote: byId('welcome-note'),
      btnCollect: byId('btn-collect')
    };
    els.versionLabel.textContent = Config.VERSION;
  }

  /** Bonus cards are built once and then only updated (never rebuilt),
   *  so a tap on a button is never lost because the DOM was replaced. */
  function buildUpgradeCards() {
    els.upgradeList.textContent = '';
    Config.UPGRADES.forEach(function (upgrade) {
      const root = createEl('div', 'upgrade');
      const info = createEl('div', 'upgrade-info');
      const name = createEl('div', 'upgrade-name', upgrade.name);
      const level = createEl('span', 'upgrade-level', 'Lv 0');
      name.appendChild(level);

      const desc = createEl('div', 'upgrade-desc');
      const note = createEl('div', 'upgrade-note');
      info.append(name, desc, note);

      // Claim button: shows "Claim", a countdown, or the follower milestone.
      const button = createEl('button', 'claim-btn');
      button.type = 'button';
      const label = createEl('span', 'claim-label', 'Claim');
      const detail = createEl('span', 'claim-detail', '');
      button.append(label, detail);
      button.addEventListener('click', function () { game.claimUpgrade(upgrade.id); });

      root.append(info, button);
      els.upgradeList.appendChild(root);
      upgradeCards[upgrade.id] = {
        root: root, level: level, desc: desc, note: note, button: button, label: label, detail: detail
      };
    });
  }

  /** One tile per minigame. Only the dice game exists for now. */
  function buildMinigameTiles() {
    els.minigameList.textContent = '';
    Object.keys(Config.MINIGAMES).forEach(function (id) {
      const def = Config.MINIGAMES[id];
      const button = createEl('button', 'minigame');
      button.type = 'button';
      const name = createEl('span', 'minigame-name', def.name);
      const status = createEl('span', 'minigame-status');
      button.append(name, status);
      button.addEventListener('click', function () { openMinigame(id); });
      els.minigameList.appendChild(button);
      minigameTiles[id] = { button: button, status: status };
    });
  }

  function buildUnlockRows() {
    els.unlockList.textContent = '';
    Config.UNLOCKS.forEach(function (unlock) {
      const root = createEl('li', 'unlock-row');
      const text = createEl('div', 'unlock-text');
      text.append(createEl('div', 'unlock-name', unlock.name), createEl('div', 'unlock-desc', unlock.description));
      const status = createEl('span', 'unlock-status');
      root.append(text, status);
      els.unlockList.appendChild(root);
      unlockRows[unlock.id] = { root: root, status: status };
    });
  }

  /** Connects DOM input to the callbacks provided by main.js. */
  function bindInput(handlers) {
    els.btnNew.addEventListener('click', handlers.onNewGame);
    els.btnContinue.addEventListener('click', handlers.onContinue);
    els.btnDelete.addEventListener('click', handlers.onDeleteSave);
    els.btnMenu.addEventListener('click', handlers.onBackToMenu);
    els.versionLabel.addEventListener('click', handlers.onVersionTap);

    // pointerdown (not click) so fast tapping and multi-touch feel instant.
    els.character.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      handlers.onTap(e.clientX, e.clientY);
    });

    // Keyboard support: Enter / Space on the focused character.
    els.character.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        const rect = els.character.getBoundingClientRect();
        handlers.onTap(rect.left + rect.width / 2, rect.top + rect.height * 0.3);
      }
    });

    // Dice modal
    els.btnRoll.addEventListener('click', rollDice);
    els.btnDiceClose.addEventListener('click', closeDice);
    els.diceModal.addEventListener('click', function (e) {
      if (e.target === els.diceModal) closeDice();   // click on the dark backdrop
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.diceModal.hidden) closeDice();
    });

    // Welcome-back modal: the only way out is COLLECT.
    els.btnCollect.addEventListener('click', function () {
      game.collectOffline();
      hideModal(els.welcomeModal);
    });
  }

  function subscribeToGame() {
    game.on('changed', render);
    game.on('loaded', onLoaded);
    game.on('tick', renderTimers);        // keeps countdowns moving
    game.on('levelUp', onLevelUp);
    game.on('unlock', onUnlock);
    game.on('upgradeClaimed', onUpgradeClaimed);
    game.on('passive', onPassive);
    game.on('eventStarted', onEventStarted);
    game.on('eventEnded', onEventEnded);
    game.on('offlinePending', showWelcomeIfPending);
    game.on('offlineCollected', onOfflineCollected);
  }

  /* ======================= rendering ======================= */

  /** Draws the current game state. Only updates text/classes, never rebuilds. */
  function render() {
    const s = game.getState();

    setText(els.level, String(s.level));
    setText(els.followers, formatNumber(s.followers));

    // Show the EFFECTIVE rates (they are boosted while an event is running).
    const boosted = game.getTapMultiplier() > 1 || game.getPassiveMultiplier() > 1;
    setText(els.perClick, formatNumber(game.getClickGain()));
    setText(els.perSecond, formatNumber(game.getPassiveGain()));
    els.perClick.classList.toggle('boosted', game.getTapMultiplier() > 1);
    els.perSecond.classList.toggle('boosted', game.getPassiveMultiplier() > 1);
    els.stage.classList.toggle('viral', boosted);

    const progress = game.getProgress();
    const percent = Math.round(progress.fraction * 100);
    els.progressFill.style.width = percent + '%';
    els.progressBar.setAttribute('aria-valuenow', String(percent));
    setText(els.progressText, progress.isMax
      ? 'Max level reached'
      : formatNumber(progress.current) + ' / ' + formatNumber(progress.target) +
        ' followers to reach Level ' + progress.nextLevel);

    const stage = Config.stageForLevel(s.level);
    els.stage.dataset.stage = String(stage.id);
    setText(els.stageName, stage.name);

    renderUpgrades();
    renderUnlocks();
    renderEvent();
    renderMinigames();
    renderDice();
  }

  /** Cheap refresh used every game step: only things that count down. */
  function renderTimers() {
    renderUpgrades();
    renderEvent();
    renderMinigames();
    renderDice();
  }

  function renderUpgrades() {
    Config.UPGRADES.forEach(function (upgrade) {
      const info = game.getUpgradeInfo(upgrade.id);
      const card = upgradeCards[upgrade.id];
      const statLabel = Config.STAT_LABELS[upgrade.stat];

      card.root.classList.toggle('locked', !info.available);
      card.root.classList.toggle('ready', info.ready);
      setText(card.level, 'Lv ' + info.level);
      setText(card.desc, 'Next level: +' + formatNumber(info.nextEffect) + (info.nextEffect === 1 ? ' follower ' : ' followers ') + statLabel + ' (free)');

      if (!info.available) {
        // Feature not unlocked yet (e.g. passive followers at Level 5)
        const unlock = Config.getUnlock(upgrade.requiresUnlock);
        setText(card.note, 'Unlocks at Level ' + unlock.level);
        setText(card.label, 'Locked');
        setText(card.detail, 'Level ' + unlock.level);
      } else if (!info.milestoneReached) {
        // Waiting for the follower milestone
        setText(card.note, 'Next level at ' + formatNumber(info.milestone) + ' followers');
        setText(card.label, 'Locked');
        setText(card.detail, formatNumber(info.milestone));
      } else if (info.secondsLeft > 0) {
        // Milestone reached, timer still running
        setText(card.note, 'Milestone reached! Next bonus is charging...');
        setText(card.label, 'Ready in');
        setText(card.detail, Format.formatTime(info.secondsLeft));
      } else {
        setText(card.note, 'Milestone reached! Claim your bonus.');
        setText(card.label, 'Claim');
        setText(card.detail, '+' + formatNumber(info.nextEffect) + ' ' + statLabel);
      }
      card.button.disabled = !info.ready;
    });
  }

  function renderUnlocks() {
    const s = game.getState();
    Config.UNLOCKS.forEach(function (unlock) {
      const row = unlockRows[unlock.id];
      const unlocked = Boolean(s.unlocks[unlock.id]);
      row.root.classList.toggle('unlocked', unlocked);
      setText(row.status, unlocked ? 'Unlocked' : 'Level ' + unlock.level);
    });
  }

  /** The "GOING VIRAL  2X FOLLOWERS  00:27" banner. */
  function renderEvent() {
    const ev = game.getActiveEvent();
    els.eventBanner.hidden = !ev;
    if (!ev) return;
    setText(els.eventTitle, ev.def.name);
    setText(els.eventLabel, ev.def.label);
    setText(els.eventTimer, Format.formatClock(ev.secondsLeft));
  }

  function renderMinigames() {
    Object.keys(minigameTiles).forEach(function (id) {
      const info = game.getMinigameInfo(id);
      const tile = minigameTiles[id];
      let text;
      if (!info.unlocked) {
        text = 'Unlocks at Level ' + Config.getUnlock(info.def.unlockId).level;
      } else if (info.secondsLeft > 0) {
        text = 'Next roll in ' + Format.formatTime(info.secondsLeft);
      } else {
        text = 'Ready to play!';
      }
      setText(tile.status, text);
      tile.button.classList.toggle('ready', info.ready);
      tile.button.classList.toggle('locked', !info.unlocked);
    });
  }

  /* ======================= dice game ======================= */

  function openMinigame(id) {
    if (id === 'dice') openDice();
  }

  /** Opens the dice window (also used by the developer panel). */
  function openDice() {
    const info = game.getMinigameInfo('dice');
    if (!info.unlocked) {
      toast('Dice Game locked', 'Reach Level ' + Config.getUnlock(info.def.unlockId).level + ' to unlock it.');
      return false;
    }
    showModal(els.diceModal, els.btnRoll);
    renderDice();
    return true;
  }

  function closeDice() {
    hideModal(els.diceModal);
  }

  /** Shows the die face for a value (0 = "?"). */
  function setDieValue(value) {
    els.dice.dataset.value = String(value);
  }

  function renderDice() {
    if (els.diceModal.hidden) return;
    const info = game.getMinigameInfo('dice');

    setText(els.diceHelp, 'Roll a number from 1 to ' + info.def.sides + '. Each pip is worth ' +
      formatNumber(info.rewardPerPip) + ' followers.');

    if (!diceRolling) {
      setDieValue(info.lastResult);
      setText(els.diceResult, info.lastResult > 0
        ? 'You rolled ' + info.lastResult + '!  +' + Format.formatFull(info.lastReward) + ' followers'
        : 'Ready when you are.');
    }

    let label;
    if (diceRolling) label = 'ROLLING...';
    else if (!info.unlocked) label = 'LOCKED';
    else if (info.secondsLeft > 0) label = 'NEXT ROLL IN ' + Format.formatTime(info.secondsLeft);
    else label = 'ROLL THE DICE';
    setText(els.btnRoll, label);
    els.btnRoll.disabled = diceRolling || !info.ready;
  }

  /**
   * The game decides the result and pays the reward immediately (so closing or
   * refreshing mid-animation changes nothing); this is only the rolling effect.
   */
  function rollDice() {
    if (diceRolling) return;
    const outcome = game.playDice();
    if (!outcome) { renderDice(); return; }

    const sides = Config.MINIGAMES.dice.sides;
    diceRolling = true;
    els.dice.classList.add('rolling');
    setText(els.diceResult, 'Rolling...');
    renderDice();

    diceAnimation = setInterval(function () {
      setDieValue(1 + Math.floor(Math.random() * sides));
    }, 80);

    setTimeout(function () {
      clearInterval(diceAnimation);
      diceAnimation = null;
      diceRolling = false;
      els.dice.classList.remove('rolling');
      setDieValue(outcome.result);
      setText(els.diceResult, 'You rolled ' + outcome.result + '!  +' + Format.formatFull(outcome.reward) + ' followers');
      pulse(els.dice, [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], 350);
      renderDice();
    }, Config.MINIGAMES.dice.rollAnimationMs);
  }

  /* ======================= modals ======================= */

  function showModal(modal, focusEl) {
    modal.hidden = false;
    if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
  }

  function hideModal(modal) {
    modal.hidden = true;
  }

  /** Shows WELCOME BACK when offline earnings are waiting (only on the game screen). */
  function showWelcomeIfPending() {
    if (currentScreen !== 'game') return;
    const pending = game.getPendingOffline();
    if (!pending) { hideModal(els.welcomeModal); return; }

    setText(els.welcomeAway, Format.formatDuration(pending.seconds));
    setText(els.welcomeEarned, '+' + Format.formatFull(pending.followers) + ' followers');
    const capped = pending.seconds > Config.OFFLINE.maxSeconds;
    els.welcomeNote.hidden = !capped;
    setText(els.welcomeNote, 'Offline earnings are capped at ' + Format.formatDuration(Config.OFFLINE.maxSeconds) + '.');
    showModal(els.welcomeModal, els.btnCollect);
  }

  function onOfflineCollected(event) {
    toast('Welcome back!', 'Collected +' + Format.formatFull(event.followers) + ' followers.');
  }

  /* ======================= feedback ======================= */

  /** Floating text inside the stage, positioned in stage coordinates. */
  function spawnFloat(text, x, y, extraClass) {
    const el = createEl('div', 'float-text' + (extraClass ? ' ' + extraClass : ''), text);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    els.floatLayer.appendChild(el);
    // Keep the DOM small even if the player taps very fast.
    while (els.floatLayer.childElementCount > 40) {
      els.floatLayer.removeChild(els.floatLayer.firstChild);
    }
    setTimeout(function () { el.remove(); }, 950);
  }

  /** Called by main.js after a tap: squash animation + "+N" at the finger. */
  function showClickFeedback(gain, clientX, clientY) {
    pulse(els.character,
      [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.05, 0.93)' }, { transform: 'scale(1, 1)' }], 140);

    const layer = els.floatLayer.getBoundingClientRect();
    const x = clientX - layer.left + (Math.random() * 30 - 15);
    const y = clientY - layer.top - 10;
    spawnFloat('+' + formatNumber(gain), x, y, game.getTapMultiplier() > 1 ? 'viral' : '');
  }

  function onPassive(event) {
    if (Math.floor(event.gain) < 1) return;
    const layer = els.floatLayer.getBoundingClientRect();
    if (layer.width === 0) return; // game screen not visible
    const c = els.character.getBoundingClientRect();
    const x = c.left - layer.left + c.width * (0.2 + Math.random() * 0.6);
    const y = c.top - layer.top + c.height * 0.1;
    spawnFloat('+' + formatNumber(event.gain), x, y, game.getPassiveMultiplier() > 1 ? 'passive viral' : 'passive');
  }

  function toast(title, text) {
    const el = createEl('div', 'toast');
    el.append(createEl('div', 'toast-title', title), createEl('div', 'toast-text', text));
    els.toasts.appendChild(el);
    while (els.toasts.childElementCount > 3) els.toasts.removeChild(els.toasts.firstChild);
    setTimeout(function () { el.classList.add('hide'); }, 2800);
    setTimeout(function () { el.remove(); }, 3300);
  }

  function onLevelUp(event) {
    // One toast for the level; if the look changes too, it is mentioned in the same toast.
    const oldStage = Config.stageForLevel(event.from);
    const newStage = Config.stageForLevel(event.to);
    let text = 'You reached Level ' + event.to + '.';
    if (newStage.id !== oldStage.id) {
      text += ' New look: ' + newStage.name + '!';
    }
    toast('LEVEL UP!', text);
    pulse(els.levelBadge, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], 500);
  }

  function onUnlock(event) {
    toast('Unlocked: ' + event.unlock.name, event.unlock.description);
  }

  function onUpgradeClaimed(event) {
    const upgrade = event.upgrade;
    toast(upgrade.name + ' Lv ' + event.level,
      '+' + formatNumber(Config.upgradeEffectFor(upgrade, event.level)) + ' ' + Config.STAT_LABELS[upgrade.stat] + ' claimed.');
  }

  function onEventStarted(event) {
    toast(event.event.name + '!', event.event.label + ' for ' + event.event.durationSeconds + ' seconds. Keep tapping!');
  }

  function onEventEnded(event) {
    if (currentScreen === 'game') toast('The buzz fades', 'Followers are back to normal.');
  }

  /** A game was started or loaded: forget any leftover animation and redraw. */
  function onLoaded() {
    hideModal(els.diceModal);
    hideModal(els.welcomeModal);
    render();
  }

  /* ======================= menu / screens ======================= */

  /** @param {object|null} saved a valid saved state, or null if none */
  function updateMenu(saved) {
    els.btnContinue.disabled = !saved;
    els.continueInfo.textContent = saved
      ? 'Level ' + Config.levelForFollowers(saved.followers) + ' - ' + formatNumber(saved.followers) + ' followers'
      : 'No saved game';
  }

  /** @param {'menu'|'game'} name */
  function showScreen(name) {
    currentScreen = name;
    els.menuScreen.classList.toggle('active', name === 'menu');
    els.gameScreen.classList.toggle('active', name === 'game');
    if (name === 'menu') {
      hideModal(els.diceModal);
      hideModal(els.welcomeModal);
    } else {
      showWelcomeIfPending();     // offline earnings saved before a refresh
    }
    window.scrollTo(0, 0);
  }

  /* ======================= public API ======================= */

  /**
   * @param {Game} gameInstance
   * @param {object} handlers  onNewGame, onContinue, onDeleteSave,
   *                           onBackToMenu, onVersionTap, onTap(clientX, clientY)
   */
  function init(gameInstance, handlers) {
    game = gameInstance;
    cacheElements();
    buildUpgradeCards();
    buildMinigameTiles();
    buildUnlockRows();
    bindInput(handlers);
    subscribeToGame();
    render();
  }

  NS.UI = {
    init: init,
    render: render,
    showScreen: showScreen,
    updateMenu: updateMenu,
    showClickFeedback: showClickFeedback,
    openDice: openDice,
    toast: toast
  };
})(window.Influencer = window.Influencer || {});
