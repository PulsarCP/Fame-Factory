# Fame Factory (working title: Influencer)

Browser clicker/idle game. Vanilla HTML, CSS and JavaScript, no build step, no backend.

## Run it
Open `index.html` in a modern browser (double-click it), or serve the folder:

    python3 -m http.server 8000     # then open http://localhost:8000

Also works on GitHub Pages (Settings -> Pages -> deploy from branch `main`, folder `/ (root)`).

## Structure
- `index.html`        menu + game screen + modal markup
- `css/style.css`     presentation, incl. the 4 placeholder visual stages
- `js/config.js`      ALL tunable data: levels, bonuses, unlocks, viral events, minigames, offline cap, stages, and the economy (money, shop items, sponsorships, challenges)
- `js/format.js`      number/time formatting (1.2K, 1.3M, 2h 14m)
- `js/state.js`       state shape + save validation
- `js/storage.js`     localStorage wrapper (save version 3, tolerant of old/corrupt saves)
- `js/game.js`        game rules (no DOM): taps, passive, levels, bonuses, events, minigames, money/shop, sponsorships, challenges, offline
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

## Economy (version 0.3, first small test)
- Followers and money are separate. Followers are never spent; money is spent in the Shop.
- Money starts at Level 10 (Creator Fund, $150). One-time payouts: L10 $150, L15 $350, L20 $750 (`MONEY` in config.js). No money per level.
- Shop (`ITEMS`): Ring Light, Better Outfit, Professional Microphone, Professional Camera, Room Upgrade. Each is bought once and shows in the room.
- Permanent item bonuses are ADDED (+10% and +15% = +25%). Viral events multiply the final value afterwards.
- Challenges (L12, one at a time), Cup Shuffle (L14, 5 min cooldown), Sponsorships (L20, one at a time, timer keeps running offline, money is paid only when collected).
- Minigames share one structure (`MINIGAMES` in config.js: unlock, cooldown, reward type, challenge counter).
- All numbers (prices, rewards, durations, requirements, cooldowns) live in `js/config.js`.

## Developer panel
Desktop: `Ctrl + Shift + D`. Phone: tap the small version label (bottom of the game screen) 7 times.
The panel sets FOLLOWER amounts; the level is always calculated from followers.

Economy tools in the panel: add/set money, open the shop, Level 10/15/20 economy presets (reset money and
purchases, then set followers so the real payout code runs), Cup Shuffle cooldown/force win/force loss,
generate/complete challenges, generate/complete/clear sponsorships.

## Tests
`TESTING.md` has the manual checklist. The automated checks (jsdom + Node) are not part of the repo.
