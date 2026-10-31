/**
 * format.js
 * ---------------------------------------------------------------------------
 * Pure display helpers (no DOM, no game state). Numbers are only abbreviated
 * for DISPLAY; the real stored values are never changed.
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  // Suffix for every factor of 1000. Beyond the list, scientific notation is used.
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

  /**
   * 950 -> "950", 1234 -> "1.2K", 54879 -> "54.8K", 1.3e6 -> "1.3M", 1.1e9 -> "1.1B".
   * Always rounds DOWN, so the display never shows more than the player has
   * (999,999 is "999.9K", never "1000.0K").
   */
  function formatNumber(value) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return '0';
    const n = Math.floor(value);
    if (n < 1000) return String(n);

    let tier = 0;
    let scale = 1;
    while (tier < SUFFIXES.length - 1 && n >= scale * 1000) {
      scale *= 1000;
      tier++;
    }
    if (n >= scale * 1000) return n.toExponential(1).replace('+', '');

    const tenths = Math.floor(n / (scale / 10));   // integer arithmetic: no rounding surprises
    const whole = Math.floor(tenths / 10);
    const decimal = tenths % 10;
    return whole + (decimal ? '.' + decimal : '') + SUFFIXES[tier];
  }

  /** Full number with thousands separators (12540 -> "12,540"); abbreviated when huge. */
  function formatFull(value) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return '0';
    const n = Math.floor(value);
    return n < 1e9 ? n.toLocaleString('en-US') : formatNumber(n);
  }

  /** 75 -> "1:15", 9 -> "0:09" (compact countdown for bonus timers). */
  function formatTime(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** 27 -> "00:27" (event countdown). */
  function formatClock(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** 8040 -> "2h 14m", 330 -> "5m 30s", 45 -> "45s". */
  function formatDuration(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }

  NS.Format = {
    formatNumber: formatNumber,
    formatFull: formatFull,
    formatTime: formatTime,
    formatClock: formatClock,
    formatDuration: formatDuration
  };
})(window.Influencer = window.Influencer || {});
