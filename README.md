# Fame Factory (working title: Influencer)

Browser clicker/idle game. Vanilla HTML, CSS and JavaScript, no build step, no backend.

## Run it
Open `index.html` in a modern browser (double-click it), or serve the folder:

    python3 -m http.server 8000     # then open http://localhost:8000

## Structure
- `index.html`        menu + game screen markup
- `css/style.css`     presentation, incl. the 3 placeholder visual stages
- `js/config.js`      ALL tunable data: level formula, bonuses, unlocks, stages
- `js/state.js`       state shape + save validation
- `js/storage.js`     localStorage wrapper
- `js/game.js`        game rules (no DOM)
- `js/ui.js`          rendering and visual feedback
- `js/main.js`        wiring: menu, timers, autosave

## Rules (prototype, levels 1-10)
- Followers are never spent: they are a milestone counter. Level and bonus milestones come from them.
- Bonuses are free: reach the follower milestone, wait for the timer, then claim.
- Passive followers unlock at Level 5.
