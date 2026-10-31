# Fame Factory (working title: Influencer)

Browser clicker/idle game. Vanilla HTML, CSS and JavaScript, no build step, no backend.

## Run it
Open `index.html` in a modern browser (double-click it), or serve the folder:

    python3 -m http.server 8000     # then open http://localhost:8000

Also works on GitHub Pages (Settings -> Pages -> deploy from branch `main`, folder `/ (root)`).

## Structure
- `index.html`        menu + game screen + modal markup
- `css/style.css`     presentation, incl. the 4 placeholder visual stages
- `js/config.js`      ALL tunable data: levels, bonuses, unlocks, viral events, dice, offline cap, stages
- `js/format.js`      number/time formatting (1.2K, 1.3M, 2h 14m)
- `js/state.js`       state shape + save validation
- `js/storage.js`     localStorage wrapper (save version 2, tolerant of old/corrupt saves)
- `js/game.js`        game rules (no DOM): taps, passive, levels, bonuses, events, dice, offline
- `js/ui.js`          rendering, banner, modals, dice animation
- `js/dev.js`         hidden developer panel (delete this file to ship without it)
- `js/main.js`        wiring: menu, game timer, autosave

## Rules (version 0.2, levels 1-20)
- Followers are never spent: they are a milestone counter. Levels and bonus milestones come from them.
- Bonuses (Better Phone, Auto-Post Scheduler) are free: reach the follower milestone, wait for the timer, claim.
- Level 5 passive followers, 12 Viral Events (Going Viral: x2 for 30 s), 13/16/18 permanent multipliers,
  15 Dice Game, 20 final visual stage.
- Offline income (capped at 3 h) is paid through the WELCOME BACK window; viral multipliers do not apply offline.
- Temporary multipliers are applied when followers are earned and never stored in the permanent tap/second values.

## Developer panel
Desktop: `Ctrl + Shift + D`. Phone: tap the small version label (bottom of the game screen) 7 times.
The panel sets FOLLOWER amounts; the level is always calculated from followers.
