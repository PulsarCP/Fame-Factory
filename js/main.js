/**
 * main.js
 * ---------------------------------------------------------------------------
 * The controller. Creates the game, connects UI input to game actions and
 * handles menu flow, the game timer and saving.
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
  let tickTimer = null;    // advances the game
  let autosaveTimer = null;
  let lastStepAt = 0;      // when the game was last advanced (ms)

  /* ======================= saving ======================= */

  /** Saves the current game. Does nothing while on the menu, so that e.g.
   *  deleting the save from the menu can never be undone by an autosave. */
  function saveNow() {
    if (!inGame) return;
    game.markActive();
    SaveManager.save(game.getState());
  }

  /* ======================= time ======================= */

  /**
   * Moves the game forward by the REAL time since the last step. Browsers slow
   * down or freeze timers in background tabs and sleeping phones, so a step
   * can be much longer than one second:
   *   - a normal step (under one minute) is applied as passive income;
   *   - a long absence goes through the offline-income system instead
   *     (capped, shown in the WELCOME BACK window, no event multipliers).
   */
  function advanceTime() {
    if (!inGame) return;
    const now = game.now();
    const elapsed = Math.max(0, (now - lastStepAt) / 1000);
    lastStepAt = now;

    if (elapsed >= Config.OFFLINE.minAwaySeconds) {
      game.checkOffline();
    } else {
      game.tick(elapsed);
    }
  }

  function startTimers() {
    stopTimers();
    lastStepAt = game.now();
    tickTimer = setInterval(advanceTime, Config.TICK_MS);
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
    game.checkOffline();      // pays nothing yet: stores the reward for the WELCOME BACK window
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

  /** Reset from the developer panel: delete the save and go back to the menu. */
  function resetSaveAndExit() {
    stopTimers();
    inGame = false;               // from here on autosave can not recreate the save
    SaveManager.clear();
    refreshMenu();
    UI.showScreen('menu');
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
    onVersionTap: function () { NS.Dev.registerVersionTap(); },
    onTap: onTap
  });

  NS.Dev.init(game, UI, {
    isInGame: function () { return inGame; },
    forceSave: saveNow,
    resetSave: resetSaveAndExit
  });

  // Save when something important happens (level up, claim, event, dice, offline...)...
  game.on('importantChange', saveNow);

  // ...and when the page is hidden or closed (covers un-saved clicks).
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      saveNow();
    } else {
      advanceTime();            // coming back: catch up (offline income if it was long)
    }
  });
  window.addEventListener('pagehide', saveNow);

  refreshMenu();
  UI.showScreen('menu');

  // Exposed for development in the browser console: Influencer.game.devAddFollowers(500)
  NS.game = game;
})(window.Influencer = window.Influencer || {});
