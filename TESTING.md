# Manual testing checklist (v0.2 + economy v0.3)

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

---

# Economy checklist (v0.3)

Use the dev panel presets so you do not have to play for hours. Each "Test Level N economy"
button resets money, purchases, payouts, challenge and sponsorship, then sets followers to level N.

**Money**
1. New game, reach Level 9 (dev "Level 10" is the next step): no money shown, no Shop.
2. Level 10: "CREATOR FUND UNLOCKED ... +$150" message; `$150` appears under the followers. The Shop appears.
3. Press "Test Level 10 economy" twice: you get $150 each time (preset resets), but just playing/refreshing never repeats the reward.
4. Refresh (Continue): money unchanged. Levels 11-14 give no money. Level 15 gives +$350, Level 20 gives +$750.

**Shop**
5. At $150 the Ring Light ($200) button says "Need $200" and is disabled. Add $100: it says "Buy".
6. Buy it: money drops by exactly $200, a ring light appears in the room, followers/second goes up 10%.
7. The button now says OWNED; it can not be bought again. Refresh: still owned, bonus still applied.
8. Items above your level show "Unlocks at Level N" and can not be bought even with $10,000.
9. Buy everything at Level 20 (add $10,000): ring light, microphone, camera, new outfit colours, better room all show.
10. Passive bonuses add: ring light (+10%) + room (+5%) + camera (+15%) = +30% followers/second, not +32.8%.
11. Trigger Going Viral: tap and passive values double the bonus-including value; the permanent numbers do not change.

**Cup Shuffle**
12. Before Level 14 the tile says "Unlocks at Level 14". At 14: open it, press PLAY. The ball shows under one cup, the cups swap, pick one.
13. Right cup: money win ($100-$250, +10% with the microphone). Wrong cup: $15 consolation. The correct cup is always the one that really holds the ball.
14. The button shows "NEXT GAME IN 5:00" right after playing. Refresh: the cooldown continues, it does not reset. Closing the game also does not skip it.
15. Dev "Force Cup Shuffle win / loss" test both outcomes. "Clear Cup Shuffle cooldown" lets you play again.

**Challenges**
16. Nothing before Level 12. At Level 12 a challenge appears (taps / followers / viral only; dice, cup and sponsorship types only after their unlocks).
17. Progress moves while you play. Completing it shows Collect; collecting pays once; the next one comes after 5 minutes. Refresh keeps progress.
18. Dev "Generate challenge" / "Complete current challenge" help.

**Sponsorships**
19. Nothing before Level 20. At 20 the Sponsorship card shows a countdown to the first offer (about 2-4 min). Dev "Generate sponsorship" skips it.
20. Accept: the timer starts and a bar fills. Only one at a time. Refresh keeps the timer.
21. Accept, then close the game for longer than the campaign: on return it says Campaign Complete but no money is paid until you press Collect.
22. With Better Outfit the payment is +10%, with Better Outfit + Room Upgrade +20% (e.g. $500 -> $600).
23. Dev "Complete sponsorship timer" and "Clear sponsorship" help.

**Saves and layout**
24. Old save (from before the economy) loads: no crash; at Level 20 it receives the missing $1,250 of payouts once.
25. Phone (portrait) and desktop: no sideways scrolling; Shop, cards and the Cup window fit on screen; buttons easy to tap.
26. Dice game, Going Viral, passive followers and WELCOME BACK offline earnings all still work.
