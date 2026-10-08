/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Thin wrapper around localStorage. The rest of the game never touches
 * localStorage directly, so the storage backend can be swapped later
 * (e.g. cloud saves) by changing only this file.
 *
 * Save format in localStorage:
 *   { version, savedAt, state: { ...see state.js } }
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;
  const State = NS.State;

  /** Writes the state. Returns true on success. */
  function save(state) {
    try {
      const payload = {
        version: Config.SAVE.version,
        savedAt: new Date().toISOString(),
        state: state
      };
      localStorage.setItem(Config.SAVE.key, JSON.stringify(payload));
      return true;
    } catch (error) {
      // Storage can be full, disabled or blocked (private mode). Never crash the game.
      console.warn('[Influencer] Could not save:', error);
      return false;
    }
  }

  /** Returns a valid state object, or null if there is no usable save. */
  function load() {
    try {
      const text = localStorage.getItem(Config.SAVE.key);
      if (!text) return null;
      const payload = JSON.parse(text);
      return State.sanitize(payload && payload.state);
    } catch (error) {
      console.warn('[Influencer] Could not read save:', error);
      return null;
    }
  }

  function hasSave() {
    return load() !== null;
  }

  /** Deletes the save. */
  function clear() {
    try {
      localStorage.removeItem(Config.SAVE.key);
    } catch (error) {
      console.warn('[Influencer] Could not delete save:', error);
    }
  }

  NS.SaveManager = { save: save, load: load, hasSave: hasSave, clear: clear };
})(window.Influencer = window.Influencer || {});
