# Manual testing checklist (v0.2)

Open `index.html` (or the GitHub Pages URL). Open the hidden dev panel with
**Ctrl+Shift+D**, or tap the version label at the bottom of the page 7 times (phone).

1. **New game** – Start New Game: 0 followers, Level 1, "Unknown Creator", tapping shows +1.
2. **Level 5** – dev panel "Level 5": passive followers unlock, followers/second > 0, Auto-Post bonus appears.
3. **Bonus timers** – claim a bonus when available; the timer must not reset after a page refresh. Followers never go down.
4. **Level 10** – "Level 10": stage 3 look (neon, sofa, plant).
5. **Level 12 / Viral** – "Level 12", then "Trigger viral": banner GOING VIRAL 2X with a countdown, taps and passive doubled, refresh keeps the remaining time, triggering again does not stack.
6. **Level 15 / Dice** – "Level 15": Minigames shows Dice. ROLL THE DICE: animation, result 1-6, followers won, cooldown shown; refresh keeps the cooldown. "Clear dice cooldown" re-enables it.
7. **Level 20** – "Level 20": stage 4 look (crown, trophy, STAR sign, spotlights).
8. **Offline** – "Simulate 1 hour offline" (or close the tab for 2+ minutes): WELCOME BACK window, COLLECT adds followers once. Before Level 5 nothing is given.
9. **Numbers** – add large amounts: 1.2K, 3.4M, 5.6B; exact value stays in the save.
10. **Save** – Force Save, refresh, Continue: everything is restored. Corrupt the save in DevTools: the game starts clean, no crash.
11. **Reset** – "Reset save" returns to the menu with Continue disabled.
12. **Mobile** (360 px wide) – no horizontal scroll, buttons easy to tap, modals fit the screen.
