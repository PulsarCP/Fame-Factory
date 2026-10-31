/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Thin wrapper around localStorage. The rest of the game never touches
 * localStorage directly, so the storage backend can be swapped later
 * (e.g. cloud saves) by changing only this file.
 *
 * Save format in localStorage:
 *   { saveVersion, savedAt, state: { ...see state.js } }
 * Older saves used "version" instead of "saveVersion"; both are accepted.
 * Missing fields are filled with safe defaults by State.sanitize().
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
        saveVersion: Config.SAVE.version,
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
    let text = null;
    try {
      text = localStorage.getItem(Config.SAVE.key);
      if (!text) return null;
      const payload = JSON.parse(text);
      // payload.saveVersion / payload.version are informational: sanitize()
      // accepts every older (or newer) layout by reading only the fields it knows.
      return State.sanitize(payload && payload.state);
    } catch (error) {
      console.warn('[Influencer] Could not read save:', error);
      keepCopyOfBrokenSave(text);
      return null;
    }
  }

  /** A broken save is not silently lost: a copy stays in localStorage. */
  function keepCopyOfBrokenSave(text) {
    try {
      if (text) localStorage.setItem(Config.SAVE.key + '.corrupt', text);
    } catch (error) { /* nothing more we can do */ }
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
