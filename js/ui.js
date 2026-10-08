/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Everything that touches the page: reading the game state to draw it,
 * visual feedback (floating numbers, toasts, animations) and wiring DOM
 * input to the callbacks supplied by main.js.
 *
 * The UI never changes game rules. It only calls game methods (claimUpgrade)
 * or reports input upward (handlers).
 * (The only game call made here is claimUpgrade.)
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;

  let game = null;
  let els = {};
  const upgradeCards = {}; // upgradeId -> references to its DOM nodes
  const unlockRows = {};   // unlockId  -> references to its DOM nodes

  /* ======================= helpers ======================= */

  function byId(id) { return document.getElementById(id); }

  /** 1234 -> "1,234", 2,500,000 -> "2.50M" */
  function formatNumber(value) {
    const n = Math.floor(value);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return n.toLocaleString('en-US');
  }

  /** 75 -> "1:15", 9 -> "0:09" */
  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
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
      upgradeList: byId('upgrade-list'),
      unlockList: byId('unlock-list'),
      toasts: byId('toasts')
    };
  }

  /** Upgrade cards are built once and then only updated (never rebuilt),
   *  so a tap on a button is never lost because the DOM was replaced. */
  function buildUpgradeCards() {
    els.upgradeList.textContent = '';
    Config.UPGRADES.forEach(function (upgrade) {
      const root = createEl('div', 'upgrade');
      const info = createEl('div', 'upgrade-info');
      const name = createEl('div', 'upgrade-name', upgrade.name);
      const level = createEl('span', 'upgrade-level', 'Lv 0');
      name.appendChild(level);

      const plural = upgrade.perLevel === 1 ? 'follower' : 'followers';
      const desc = createEl('div', 'upgrade-desc',
        '+' + upgrade.perLevel + ' ' + plural + ' ' + Config.STAT_LABELS[upgrade.stat] + ' per level (free)');
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
      upgradeCards[upgrade.id] = { root: root, level: level, note: note, button: button, label: label, detail: detail };
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
  }

  function subscribeToGame() {
    game.on('changed', render);
    game.on('loaded', render);
    game.on('tick', renderUpgrades);   // keeps the bonus countdowns moving
    game.on('levelUp', onLevelUp);
    game.on('unlock', onUnlock);
    game.on('upgradeClaimed', onUpgradeClaimed);
    game.on('passive', onPassive);
  }

  /* ======================= rendering ======================= */

  /** Draws the current game state. Only updates text/classes, never rebuilds. */
  function render() {
    const s = game.getState();

    els.level.textContent = s.level;
    els.followers.textContent = formatNumber(s.followers);
    els.perClick.textContent = formatNumber(s.followersPerClick);
    els.perSecond.textContent = formatNumber(s.followersPerSecond);

    const progress = game.getProgress();
    const percent = Math.round(progress.fraction * 100);
    els.progressFill.style.width = percent + '%';
    els.progressBar.setAttribute('aria-valuenow', String(percent));
    els.progressText.textContent = progress.isMax
      ? 'Max level for this prototype reached'
      : formatNumber(progress.current) + ' / ' + formatNumber(progress.target) +
        ' followers to reach Level ' + progress.nextLevel;

    const stage = Config.stageForLevel(s.level);
    els.stage.dataset.stage = String(stage.id);
    els.stageName.textContent = stage.name;

    renderUpgrades();
    renderUnlocks();
  }

  function renderUpgrades() {
    Config.UPGRADES.forEach(function (upgrade) {
      const info = game.getUpgradeInfo(upgrade.id);
      const card = upgradeCards[upgrade.id];

      card.root.classList.toggle('locked', !info.available);
      card.root.classList.toggle('ready', info.ready);
      card.level.textContent = 'Lv ' + info.level;

      if (!info.available) {
        // Feature not unlocked yet (e.g. passive followers at Level 5)
        const unlock = Config.getUnlock(upgrade.requiresUnlock);
        card.note.textContent = 'Unlocks at Level ' + unlock.level;
        card.label.textContent = 'Locked';
        card.detail.textContent = 'Level ' + unlock.level;
      } else if (!info.milestoneReached) {
        // Waiting for the follower milestone
        card.note.textContent = 'Next level at ' + formatNumber(info.milestone) + ' followers';
        card.label.textContent = 'Locked';
        card.detail.textContent = formatNumber(info.milestone) + ' followers';
      } else if (info.secondsLeft > 0) {
        // Milestone reached, timer still running
        card.note.textContent = 'Milestone reached! Next bonus is charging...';
        card.label.textContent = 'Ready in';
        card.detail.textContent = formatTime(info.secondsLeft);
      } else {
        card.note.textContent = 'Milestone reached! Claim your bonus.';
        card.label.textContent = 'Claim';
        card.detail.textContent = '+' + upgrade.perLevel + ' ' + Config.STAT_LABELS[upgrade.stat];
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
      row.status.textContent = unlocked ? 'Unlocked' : 'Level ' + unlock.level;
    });
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
    spawnFloat('+' + formatNumber(gain), x, y, '');
  }

  function onPassive(event) {
    const layer = els.floatLayer.getBoundingClientRect();
    if (layer.width === 0) return; // game screen not visible
    const c = els.character.getBoundingClientRect();
    const x = c.left - layer.left + c.width * (0.2 + Math.random() * 0.6);
    const y = c.top - layer.top + c.height * 0.1;
    spawnFloat('+' + formatNumber(event.gain), x, y, 'passive');
  }

  function toast(title, text) {
    const el = createEl('div', 'toast');
    el.append(createEl('div', 'toast-title', title), createEl('div', 'toast-text', text));
    els.toasts.appendChild(el);
    setTimeout(function () { el.classList.add('hide'); }, 3200);
    setTimeout(function () { el.remove(); }, 3700);
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
    toast(event.upgrade.name + ' Lv ' + event.level,
      '+' + event.upgrade.perLevel + ' ' + Config.STAT_LABELS[event.upgrade.stat] + ' claimed.');
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
    els.menuScreen.classList.toggle('active', name === 'menu');
    els.gameScreen.classList.toggle('active', name === 'game');
    window.scrollTo(0, 0);
  }

  /* ======================= public API ======================= */

  /**
   * @param {Game} gameInstance
   * @param {object} handlers  onNewGame, onContinue, onDeleteSave,
   *                           onBackToMenu, onTap(clientX, clientY)
   */
  function init(gameInstance, handlers) {
    game = gameInstance;
    cacheElements();
    buildUpgradeCards();
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
    showClickFeedback: showClickFeedback
  };
})(window.Influencer = window.Influencer || {});
