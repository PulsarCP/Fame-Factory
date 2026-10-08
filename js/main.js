/**
 * main.js
 * ---------------------------------------------------------------------------
 * The controller. Creates the game, connects UI input to game actions and
 * handles menu flow, the passive-income timer and saving.
 * It does not contain game rules (game.js) or DOM code (ui.js).
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;
  const SaveManager = NS.SaveManager;
  const UI = NS.UI;

  const game = new NS.Game();

  let inGame = false;      // true while the game screen is shown
  let tickTimer = null;    // passive followers
  let autosaveTimer = null;

  /* ======================= saving ======================= */

  /** Saves the current game. Does nothing while on the menu, so that e.g.
   *  deleting the save from the menu can never be undone by an autosave. */
  function saveNow() {
    if (!inGame) return;
    SaveManager.save(game.getState());
  }

  /* ======================= timers ======================= */

  function startTimers() {
    stopTimers();
    tickTimer = setInterval(function () {
      game.tick(Config.TICK_MS / 1000);
    }, Config.TICK_MS);
    autosaveTimer = setInterval(saveNow, Config.SAVE.autosaveSeconds * 1000);
  }

  function stopTimers() {
    clearInterval(tickTimer);
    clearInterval(autosaveTimer);
    tickTimer = null;
    autosaveTimer = null;
  }

  /* ======================= menu flow ======================= */

  function refreshMenu() {
    UI.updateMenu(SaveManager.load());
  }

  function enterGame() {
    inGame = true;
    UI.showScreen('game');
    startTimers();
  }

  function onNewGame() {
    if (SaveManager.hasSave() &&
        !window.confirm('Start a new game? This will overwrite your current save.')) {
      return;
    }
    game.startNewGame();
    inGame = true;
    saveNow();
    enterGame();
  }

  function onContinue() {
    const saved = SaveManager.load();
    if (!saved) { refreshMenu(); return; }
    game.loadState(saved);
    enterGame();
  }

  function onBackToMenu() {
    saveNow();
    stopTimers();
    inGame = false;
    refreshMenu();
    UI.showScreen('menu');
  }

  function onDeleteSave() {
    if (!window.confirm('Delete your saved game? This cannot be undone.')) return;
    SaveManager.clear();
    refreshMenu();
  }

  /* ======================= gameplay input ======================= */

  function onTap(clientX, clientY) {
    if (!inGame) return;
    const gain = game.click();
    UI.showClickFeedback(gain, clientX, clientY);
  }

  /* ======================= start ======================= */

  UI.init(game, {
    onNewGame: onNewGame,
    onContinue: onContinue,
    onDeleteSave: onDeleteSave,
    onBackToMenu: onBackToMenu,
    onTap: onTap
  });

  // Save when something important happens (level up, unlock, purchase)...
  game.on('importantChange', saveNow);

  // ...and when the page is hidden or closed (covers un-saved clicks).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('pagehide', saveNow);

  refreshMenu();
  UI.showScreen('menu');

  // Exposed for development: Influencer.game.devAddFollowers(500) in the console.
  NS.game = game;
})(window.Influencer = window.Influencer || {});
