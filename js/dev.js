/**
 * dev.js
 * ---------------------------------------------------------------------------
 * Hidden developer / test panel. It does not exist in the page until it is
 * deliberately opened:
 *   - desktop: Ctrl + Shift + D
 *   - phone:   tap the small version label (bottom of the game screen) 7 times
 *
 * Rules:
 *   - The panel never sets the level directly. "Jump" buttons set the FOLLOWER
 *     count, and the normal progression code calculates the level.
 *   - It only works while a game is running (not on the main menu).
 *   - Delete this file (and its <script> tag) to ship a build without it.
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;
  const Format = NS.Format;

  let game = null;
  let ui = null;
  let actions = null;       // { isInGame, forceSave, resetSave }
  let panel = null;         // built the first time it is opened
  let statusEl = null;
  let versionTaps = [];     // timestamps of recent taps on the version label

  /* ======================= panel contents ======================= */

  function section(parent, title) {
    const box = document.createElement('div');
    box.className = 'dev-section';
    const heading = document.createElement('div');
    heading.className = 'dev-heading';
    heading.textContent = title;
    box.appendChild(heading);
    const grid = document.createElement('div');
    grid.className = 'dev-grid';
    box.appendChild(grid);
    parent.appendChild(box);
    return grid;
  }

  function addButton(grid, label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dev-btn';
    button.textContent = label;
    button.addEventListener('click', function () {
      onClick();
      refreshStatus();
    });
    grid.appendChild(button);
    return button;
  }

  /** Sets followers to the requirement of a level; the game works out the level. */
  function jumpToLevel(level) {
    game.devSetFollowers(Config.followersForLevel(level));
  }

  function build() {
    panel = document.createElement('div');
    panel.id = 'dev-panel';
    panel.className = 'modal dev-panel';
    panel.hidden = true;

    const card = document.createElement('div');
    card.className = 'modal-card dev-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Developer panel');

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = 'DEV PANEL';
    card.appendChild(title);

    statusEl = document.createElement('div');
    statusEl.className = 'dev-status';
    card.appendChild(statusEl);

    let grid = section(card, 'Followers');
    addButton(grid, 'Add 1,000 followers', function () { game.devAddFollowers(1000); });
    addButton(grid, 'Add 100,000 followers', function () { game.devAddFollowers(100000); });
    addButton(grid, 'Add 1,000,000 followers', function () { game.devAddFollowers(1000000); });

    grid = section(card, 'Jump (sets followers to the level requirement)');
    [5, 10, 12, 15, 20].forEach(function (level) {
      addButton(grid, 'Level ' + level, function () { jumpToLevel(level); });
    });

    grid = section(card, 'Viral events');
    addButton(grid, 'Trigger Going Viral', function () {
      if (!game.startEvent('goingViral', { force: true })) ui.toast('Dev', 'An event is already running.');
    });
    addButton(grid, 'End Viral Event', function () { game.endEvent(); });

    grid = section(card, 'Dice game');
    addButton(grid, 'Open Dice Game', function () { close(); ui.openDice(); });
    addButton(grid, 'Clear Dice Cooldown', function () { game.devClearCooldown('dice'); });

    grid = section(card, 'Offline income');
    addButton(grid, 'Simulate 1 hour offline', function () {
      const pending = game.devSimulateOffline(3600);
      if (!pending) ui.toast('Dev', 'No offline reward (passive income needs Level 5).');
      close();
    });

    grid = section(card, 'System');
    addButton(grid, 'Force Save', function () { actions.forceSave(); ui.toast('Dev', 'Game saved.'); });
    addButton(grid, 'Reload UI From Current State', function () { ui.render(); });
    const reset = addButton(grid, 'Reset Save', function () {
      if (window.confirm('Delete the save and return to the menu?')) {
        close();
        actions.resetSave();
      }
    });
    reset.classList.add('dev-danger');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn-link modal-close';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', close);
    card.appendChild(closeButton);

    panel.appendChild(card);
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
    document.body.appendChild(panel);
  }

  function refreshStatus() {
    if (!statusEl) return;
    const s = game.getState();
    const ev = game.getActiveEvent();
    statusEl.textContent =
      'Level ' + s.level + '  |  ' + Format.formatNumber(s.followers) + ' followers  |  ' +
      Format.formatNumber(s.followersPerClick) + '/tap  ' + Format.formatNumber(s.followersPerSecond) + '/s  |  ' +
      (ev ? 'viral ' + Format.formatClock(ev.secondsLeft) : 'no event');
  }

  /* ======================= open / close ======================= */

  function isOpen() {
    return Boolean(panel) && !panel.hidden;
  }

  function open() {
    if (!actions.isInGame()) return;     // only while playing
    if (!panel) build();
    panel.hidden = false;
    refreshStatus();
  }

  function close() {
    if (panel) panel.hidden = true;
  }

  function toggle() {
    if (isOpen()) close(); else open();
  }

  /** Called on every tap of the version label; 7 quick taps open the panel. */
  function registerVersionTap() {
    const now = Date.now();
    versionTaps.push(now);
    versionTaps = versionTaps.filter(function (t) { return now - t <= Config.DEV.tapWindowMs; });
    if (versionTaps.length >= Config.DEV.tapsToOpen) {
      versionTaps = [];
      toggle();
    }
  }

  /**
   * @param {Game} gameInstance
   * @param {object} uiApi    NS.UI
   * @param {object} callbacks isInGame(), forceSave(), resetSave()
   */
  function init(gameInstance, uiApi, callbacks) {
    game = gameInstance;
    ui = uiApi;
    actions = callbacks;

    // Ctrl + Shift + D
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });

    game.on('tick', function () { if (isOpen()) refreshStatus(); });
    game.on('loaded', close);
  }

  NS.Dev = { init: init, toggle: toggle, registerVersionTap: registerVersionTap, isOpen: isOpen };
})(window.Influencer = window.Influencer || {});
