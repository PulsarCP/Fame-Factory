/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Everything that touches the page: reading the game state to draw it,
 * visual feedback (floating numbers, toasts, animations, modals) and wiring
 * DOM input to the callbacks supplied by main.js.
 *
 * The UI never changes game rules. It only asks the game to do things
 * (claimUpgrade, playDice, collectOffline) or reports input upward (handlers).
 * ---------------------------------------------------------------------------
 */
(function (NS) {
  'use strict';

  const Config = NS.Config;
  const Format = NS.Format;
  const formatNumber = Format.formatNumber;

  let game = null;
  let els = {};
  let currentScreen = 'menu';
  let diceRolling = false;       // the roll animation is playing
  let diceAnimation = null;      // interval id of the animation
  let cupPhase = 'idle';         // Cup Shuffle screen: idle | showing | shuffling | pick | result
  let cupTimers = [];            // pending animation timers of the Cup Shuffle
  let cupSlots = [];             // cupSlots[cupIndex] = the position the cup stands in
  let cupCount = 3;              // number of cups on the table
  let cupLastText = '';          // result text of the last game (until the next one starts)
  const shopCards = {};          // itemId -> references to its DOM nodes
  let challengeCard = null;      // references to the challenge card DOM nodes
  let sponsorCard = null;        // references to the sponsorship card DOM nodes
  const upgradeCards = {};       // bonusId -> references to its DOM nodes
  const unlockRows = {};         // unlockId -> references to its DOM nodes
  const minigameTiles = {};      // minigameId -> references to its DOM nodes

  /* ======================= helpers ======================= */

  function byId(id) { return document.getElementById(id); }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** Only touches the DOM when the text really changed (cheap, no flicker). */
  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** Small scale animation (skipped if the browser has no Web Animations). */
  function pulse(el, keyframes, duration) {
    if (!el || typeof el.animate !== 'function') return;
    el.animate(keyframes, { duration: duration, easing: 'ease-out' });
  }

  /* ======================= setup ======================= */

  function cacheElements() {
    els = {
      menuScreen: byId('screen-menu'),
      gameScreen: byId('screen-game'),
      btnNew: byId('btn-new'),
      btnContinue: byId('btn-continue'),
      continueInfo: byId('continue-info'),
      btnDelete: byId('btn-delete-save'),
      btnMenu: byId('btn-menu'),
      levelBadge: byId('level-badge'),
      level: byId('level'),
      followers: byId('followers'),
      perClick: byId('per-click'),
      perSecond: byId('per-second'),
      progressBar: byId('progress-bar'),
      progressFill: byId('progress-fill'),
      progressText: byId('progress-text'),
      stage: byId('stage'),
      stageName: byId('stage-name'),
      character: byId('character'),
      floatLayer: byId('float-layer'),
      eventBanner: byId('event-banner'),
      eventTitle: byId('event-title'),
      eventLabel: byId('event-label'),
      eventTimer: byId('event-timer'),
      upgradeList: byId('upgrade-list'),
      minigameList: byId('minigame-list'),
      unlockList: byId('unlock-list'),
      versionLabel: byId('version-label'),
      toasts: byId('toasts'),
      diceModal: byId('modal-dice'),
      dice: byId('dice'),
      diceHelp: byId('dice-help'),
      diceResult: byId('dice-result'),
      btnRoll: byId('btn-roll'),
      btnDiceClose: byId('btn-dice-close'),
      money: byId('money'),
      challengeSection: byId('challenge-section'),
      challengeBox: byId('challenge-card'),
      sponsorSection: byId('sponsor-section'),
      sponsorBox: byId('sponsor-card'),
      shopSection: byId('shop-section'),
      shopList: byId('shop-list'),
      cupModal: byId('modal-cup'),
      cups: byId('cups'),
      cupHelp: byId('cup-help'),
      cupResult: byId('cup-result'),
      btnCupPlay: byId('btn-cup-play'),
      btnCupClose: byId('btn-cup-close'),
      welcomeModal: byId('modal-welcome'),
      welcomeAway: byId('welcome-away'),
      welcomeEarned: byId('welcome-earned'),
      welcomeNote: byId('welcome-note'),
      btnCollect: byId('btn-collect')
    };
    els.versionLabel.textContent = Config.VERSION;
  }

  /** Bonus cards are built once and then only updated (never rebuilt),
   *  so a tap on a button is never lost because the DOM was replaced. */
  function buildUpgradeCards() {
    els.upgradeList.textContent = '';
    Config.UPGRADES.forEach(function (upgrade) {
      const root = createEl('div', 'upgrade');
      const info = createEl('div', 'upgrade-info');
      const name = createEl('div', 'upgrade-name', upgrade.name);
      const level = createEl('span', 'upgrade-level', 'Lv 0');
      name.appendChild(level);

      const desc = createEl('div', 'upgrade-desc');
      const note = createEl('div', 'upgrade-note');
      info.append(name, desc, note);

      // Claim button: shows "Claim", a countdown, or the follower milestone.
      const button = createEl('button', 'claim-btn');
      button.type = 'button';
      const label = createEl('span', 'claim-label', 'Claim');
      const detail = createEl('span', 'claim-detail', '');
      button.append(label, detail);
      button.addEventListener('click', function () { game.claimUpgrade(upgrade.id); });

      root.append(info, button);
      els.upgradeList.appendChild(root);
      upgradeCards[upgrade.id] = {
        root: root, level: level, desc: desc, note: note, button: button, label: label, detail: detail
      };
    });
  }

  /** Challenge card: text, progress bar, reward and a collect button. Built once. */
  function buildChallengeCard() {
    els.challengeBox.textContent = '';
    const top = createEl('div', 'card-top');
    const text = createEl('div', 'card-title');
    const reward = createEl('div', 'card-reward');
    top.append(text, reward);

    const bar = createEl('div', 'mini-bar');
    const fill = createEl('div', 'mini-fill');
    bar.appendChild(fill);

    const foot = createEl('div', 'card-foot');
    const note = createEl('div', 'card-note');
    const button = createEl('button', 'claim-btn');
    button.type = 'button';
    const label = createEl('span', 'claim-label');
    const detail = createEl('span', 'claim-detail');
    button.append(label, detail);
    button.addEventListener('click', function () { game.collectChallenge(); });
    foot.append(note, button);

    els.challengeBox.append(top, bar, foot);
    challengeCard = { text: text, reward: reward, bar: bar, fill: fill, note: note, button: button, label: label, detail: detail };
  }

  /** Sponsorship card. Built once; the text changes with the campaign status. */
  function buildSponsorCard() {
    els.sponsorBox.textContent = '';
    const top = createEl('div', 'card-top');
    const title = createEl('div', 'card-title');
    const reward = createEl('div', 'card-reward');
    top.append(title, reward);
    const meta = createEl('div', 'card-meta');

    const bar = createEl('div', 'mini-bar');
    const fill = createEl('div', 'mini-fill');
    bar.appendChild(fill);

    const foot = createEl('div', 'card-foot');
    const note = createEl('div', 'card-note');
    const button = createEl('button', 'claim-btn');
    button.type = 'button';
    const label = createEl('span', 'claim-label');
    const detail = createEl('span', 'claim-detail');
    button.append(label, detail);
    button.addEventListener('click', function () {
      const info = game.getSponsorshipInfo();
      if (info.status === 'offered') game.acceptSponsorship();
      else if (info.status === 'complete') game.collectSponsorship();
    });
    foot.append(note, button);

    els.sponsorBox.append(top, meta, bar, foot);
    sponsorCard = { title: title, reward: reward, meta: meta, bar: bar, fill: fill, note: note, button: button, label: label, detail: detail };
  }

  /** One card per shop item, generated from Config.ITEMS (no item is hard-coded here). */
  function buildShopCards() {
    els.shopList.textContent = '';
    Config.ITEMS.forEach(function (item) {
      const root = createEl('div', 'upgrade');
      const info = createEl('div', 'upgrade-info');
      const name = createEl('div', 'upgrade-name', item.name);
      const tag = createEl('span', 'upgrade-level', item.category);
      name.appendChild(tag);
      const effect = createEl('div', 'upgrade-desc', itemEffectText(item));
      const note = createEl('div', 'upgrade-note');
      info.append(name, effect, note);

      const button = createEl('button', 'claim-btn');
      button.type = 'button';
      const label = createEl('span', 'claim-label');
      const detail = createEl('span', 'claim-detail');
      button.append(label, detail);
      button.addEventListener('click', function () { game.buyItem(item.id); });

      root.append(info, button);
      els.shopList.appendChild(root);
      shopCards[item.id] = { root: root, note: note, button: button, label: label, detail: detail };
    });
  }

  /** "+10% passive follower generation, +10% sponsorship income" */
  function itemEffectText(item) {
    return item.bonuses.map(function (b) {
      return '+' + Math.round(b.value * 100) + '% ' + Config.BONUS_TYPES[b.type];
    }).join(', ');
  }

  /** One tile per minigame (dice, cup shuffle...). */
  function buildMinigameTiles() {
    els.minigameList.textContent = '';
    Object.keys(Config.MINIGAMES).forEach(function (id) {
      const def = Config.MINIGAMES[id];
      const button = createEl('button', 'minigame');
      button.type = 'button';
      const name = createEl('span', 'minigame-name', def.name);
      const status = createEl('span', 'minigame-status');
      button.append(name, status);
      button.addEventListener('click', function () { openMinigame(id); });
      els.minigameList.appendChild(button);
      minigameTiles[id] = { button: button, status: status };
    });
  }

  function buildUnlockRows() {
    els.unlockList.textContent = '';
    Config.UNLOCKS.forEach(function (unlock) {
      const root = createEl('li', 'unlock-row');
      const text = createEl('div', 'unlock-text');
      text.append(createEl('div', 'unlock-name', unlock.name), createEl('div', 'unlock-desc', unlock.description));
      const status = createEl('span', 'unlock-status');
      root.append(text, status);
      els.unlockList.appendChild(root);
      unlockRows[unlock.id] = { root: root, status: status };
    });
  }

  /** Connects DOM input to the callbacks provided by main.js. */
  function bindInput(handlers) {
    els.btnNew.addEventListener('click', handlers.onNewGame);
    els.btnContinue.addEventListener('click', handlers.onContinue);
    els.btnDelete.addEventListener('click', handlers.onDeleteSave);
    els.btnMenu.addEventListener('click', handlers.onBackToMenu);
    els.versionLabel.addEventListener('click', handlers.onVersionTap);

    // pointerdown (not click) so fast tapping and multi-touch feel instant.
    els.character.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      handlers.onTap(e.clientX, e.clientY);
    });

    // Keyboard support: Enter / Space on the focused character.
    els.character.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        const rect = els.character.getBoundingClientRect();
        handlers.onTap(rect.left + rect.width / 2, rect.top + rect.height * 0.3);
      }
    });

    // Dice modal
    els.btnRoll.addEventListener('click', rollDice);
    els.btnDiceClose.addEventListener('click', closeDice);
    els.diceModal.addEventListener('click', function (e) {
      if (e.target === els.diceModal) closeDice();   // click on the dark backdrop
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.diceModal.hidden) closeDice();
    });

    // Cup Shuffle modal
    els.btnCupPlay.addEventListener('click', playCup);
    els.btnCupClose.addEventListener('click', closeCup);
    els.cupModal.addEventListener('click', function (e) {
      if (e.target === els.cupModal) closeCup();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.cupModal.hidden) closeCup();
    });

    // Welcome-back modal: the only way out is COLLECT.
    els.btnCollect.addEventListener('click', function () {
      game.collectOffline();
      hideModal(els.welcomeModal);
    });
  }

  function subscribeToGame() {
    game.on('changed', render);
    game.on('loaded', onLoaded);
    game.on('tick', renderTimers);        // keeps countdowns moving
    game.on('levelUp', onLevelUp);
    game.on('unlock', onUnlock);
    game.on('upgradeClaimed', onUpgradeClaimed);
    game.on('passive', onPassive);
    game.on('eventStarted', onEventStarted);
    game.on('eventEnded', onEventEnded);
    game.on('offlinePending', showWelcomeIfPending);
    game.on('offlineCollected', onOfflineCollected);
    game.on('moneyMilestone', onMoneyMilestone);
    game.on('itemPurchased', onItemPurchased);
    game.on('sponsorshipOffered', function (e) { toast('New sponsorship!', e.campaign.brand + ' wants to work with you.'); });
    game.on('sponsorshipComplete', function () { toast('Campaign Complete', 'Collect your payment!'); });
    game.on('sponsorshipCollected', function (e) { toast('Sponsorship paid', '+' + Format.formatMoney(e.amount) + ' from ' + e.campaign.brand + '.'); });
    game.on('challengeStarted', function (e) { toast('New challenge', e.info.text); });
    game.on('challengeComplete', function () { toast('Challenge complete!', 'Collect your reward.'); });
    game.on('challengeCollected', function (e) { toast('Reward collected', '+' + Format.formatMoney(e.amount) + '.'); });
  }

  /* ======================= rendering ======================= */

  /** Draws the current game state. Only updates text/classes, never rebuilds. */
  function render() {
    const s = game.getState();

    setText(els.level, String(s.level));
    setText(els.followers, formatNumber(s.followers));

    // Show the EFFECTIVE rates (they are boosted while an event is running).
    const boosted = game.getTapMultiplier() > 1 || game.getPassiveMultiplier() > 1;
    setText(els.perClick, Format.formatRate(game.getClickGain()));
    setText(els.perSecond, Format.formatRate(game.getPassiveGain()));
    els.perClick.classList.toggle('boosted', game.getTapMultiplier() > 1);
    els.perSecond.classList.toggle('boosted', game.getPassiveMultiplier() > 1);
    els.stage.classList.toggle('viral', boosted);

    const progress = game.getProgress();
    const percent = Math.round(progress.fraction * 100);
    els.progressFill.style.width = percent + '%';
    els.progressBar.setAttribute('aria-valuenow', String(percent));
    setText(els.progressText, progress.isMax
      ? 'Max level reached'
      : formatNumber(progress.current) + ' / ' + formatNumber(progress.target) +
        ' followers to reach Level ' + progress.nextLevel);

    const stage = Config.stageForLevel(s.level);
    els.stage.dataset.stage = String(stage.id);
    setText(els.stageName, stage.name);

    renderUpgrades();
    renderUnlocks();
    renderEvent();
    renderMinigames();
    renderDice();
    renderCup();
    renderMoney();
    renderShop();
    renderChallenge();
    renderSponsorship();
  }

  /** Cheap refresh used every game step: only things that count down. */
  function renderTimers() {
    renderUpgrades();
    renderEvent();
    renderMinigames();
    renderDice();
    renderCup();
    renderChallenge();
    renderSponsorship();
  }

  function renderUpgrades() {
    Config.UPGRADES.forEach(function (upgrade) {
      const info = game.getUpgradeInfo(upgrade.id);
      const card = upgradeCards[upgrade.id];
      const statLabel = Config.STAT_LABELS[upgrade.stat];

      card.root.classList.toggle('locked', !info.available);
      card.root.classList.toggle('ready', info.ready);
      setText(card.level, 'Lv ' + info.level);
      setText(card.desc, 'Next level: +' + formatNumber(info.nextEffect) + (info.nextEffect === 1 ? ' follower ' : ' followers ') + statLabel + ' (free)');

      if (!info.available) {
        // Feature not unlocked yet (e.g. passive followers at Level 5)
        const unlock = Config.getUnlock(upgrade.requiresUnlock);
        setText(card.note, 'Unlocks at Level ' + unlock.level);
        setText(card.label, 'Locked');
        setText(card.detail, 'Level ' + unlock.level);
      } else if (!info.milestoneReached) {
        // Waiting for the follower milestone
        setText(card.note, 'Next level at ' + formatNumber(info.milestone) + ' followers');
        setText(card.label, 'Locked');
        setText(card.detail, formatNumber(info.milestone));
      } else if (info.secondsLeft > 0) {
        // Milestone reached, timer still running
        setText(card.note, 'Milestone reached! Next bonus is charging...');
        setText(card.label, 'Ready in');
        setText(card.detail, Format.formatTime(info.secondsLeft));
      } else {
        setText(card.note, 'Milestone reached! Claim your bonus.');
        setText(card.label, 'Claim');
        setText(card.detail, '+' + formatNumber(info.nextEffect) + ' ' + statLabel);
      }
      card.button.disabled = !info.ready;
    });
  }

  function renderUnlocks() {
    const s = game.getState();
    Config.UNLOCKS.forEach(function (unlock) {
      const row = unlockRows[unlock.id];
      const unlocked = Boolean(s.unlocks[unlock.id]);
      row.root.classList.toggle('unlocked', unlocked);
      setText(row.status, unlocked ? 'Unlocked' : 'Level ' + unlock.level);
    });
  }

  /** The "GOING VIRAL  2X FOLLOWERS  00:27" banner. */
  function renderEvent() {
    const ev = game.getActiveEvent();
    els.eventBanner.hidden = !ev;
    if (!ev) return;
    setText(els.eventTitle, ev.def.name);
    setText(els.eventLabel, ev.def.label);
    setText(els.eventTimer, Format.formatClock(ev.secondsLeft));
  }

  function renderMinigames() {
    Object.keys(minigameTiles).forEach(function (id) {
      const info = game.getMinigameInfo(id);
      const tile = minigameTiles[id];
      let text;
      if (!info.unlocked) {
        text = 'Unlocks at Level ' + Config.getUnlock(info.def.unlockId).level;
      } else if (info.secondsLeft > 0) {
        text = info.def.cooldownText + ' ' + Format.formatTime(info.secondsLeft);
      } else {
        text = 'Ready to play!';
      }
      setText(tile.status, text);
      tile.button.classList.toggle('ready', info.ready);
      tile.button.classList.toggle('locked', !info.unlocked);
    });
  }

  /* ======================= money, shop, challenge, sponsorship ======================= */

  /** Money in the HUD (after the Creator Fund unlock) and the owned items in the room. */
  function renderMoney() {
    const s = game.getState();
    els.money.hidden = !s.unlocks.creatorFund;
    setText(els.money, Format.formatMoney(s.money));

    // The room shows every owned item (data-items lists their visual ids).
    const visuals = Config.ITEMS
      .filter(function (item) { return (s.items[item.id] || 0) > 0 && item.visual; })
      .map(function (item) { return item.visual; })
      .join(' ');
    if (els.stage.dataset.items !== visuals) els.stage.dataset.items = visuals;
  }

  function renderShop() {
    const s = game.getState();
    els.shopSection.hidden = !s.unlocks.creatorFund;
    if (els.shopSection.hidden) return;

    Config.ITEMS.forEach(function (item) {
      const info = game.getItemInfo(item.id);
      const card = shopCards[item.id];
      card.root.classList.toggle('locked', !info.unlocked);
      card.root.classList.toggle('owned', info.owned);
      card.root.classList.toggle('ready', info.canBuy);

      if (info.owned) {
        setText(card.note, '');
        setText(card.label, 'Status');
        setText(card.detail, 'OWNED');
      } else if (!info.unlocked) {
        setText(card.note, 'Unlocks at Level ' + item.unlockLevel + ' - ' + Format.formatMoney(item.price));
        setText(card.label, 'Unlocks');
        setText(card.detail, 'Level ' + item.unlockLevel);
      } else if (!info.affordable) {
        setText(card.note, 'Price: ' + Format.formatMoney(item.price) + ' (not owned)');
        setText(card.label, 'Need');
        setText(card.detail, Format.formatMoney(item.price));
      } else {
        setText(card.note, 'Price: ' + Format.formatMoney(item.price) + ' (not owned)');
        setText(card.label, 'Buy');
        setText(card.detail, Format.formatMoney(item.price));
      }
      card.button.disabled = !info.canBuy;
    });
  }

  function renderChallenge() {
    const info = game.getChallengeInfo();
    els.challengeSection.hidden = !info.unlocked;
    if (!info.unlocked) return;
    const c = challengeCard;

    if (info.status === 'none') {
      setText(c.text, 'Next challenge coming up...');
      setText(c.reward, '');
      c.bar.hidden = true;
      setText(c.note, info.nextSeconds > 0 ? 'Ready in ' + Format.formatTime(info.nextSeconds) : 'Preparing a challenge...');
      setText(c.label, 'Wait');
      setText(c.detail, info.nextSeconds > 0 ? Format.formatTime(info.nextSeconds) : '...');
      c.button.disabled = true;
      return;
    }

    c.bar.hidden = false;
    c.fill.style.width = Math.round((info.progress / info.target) * 100) + '%';
    setText(c.text, info.text);
    setText(c.reward, Format.formatMoney(info.reward));
    if (info.status === 'complete') {
      setText(c.note, 'Challenge complete!');
      setText(c.label, 'Collect');
      setText(c.detail, Format.formatMoney(info.reward));
      c.button.disabled = false;
    } else {
      setText(c.note, Format.formatFull(info.progress) + ' / ' + Format.formatFull(info.target));
      setText(c.label, 'In progress');
      setText(c.detail, Math.floor((info.progress / info.target) * 100) + '%');
      c.button.disabled = true;
    }
    c.button.classList.toggle('ready', info.status === 'complete');
  }

  function renderSponsorship() {
    const info = game.getSponsorshipInfo();
    els.sponsorSection.hidden = !info.unlocked;
    if (!info.unlocked) return;
    const c = sponsorCard;
    const campaign = info.campaign;

    if (info.status === 'none') {
      setText(c.title, 'No campaign right now');
      setText(c.reward, '');
      setText(c.meta, 'Brands send offers from time to time. Only one campaign can run at once.');
      c.bar.hidden = true;
      setText(c.note, info.nextOfferSeconds > 0 ? 'Next offer in ' + Format.formatTime(info.nextOfferSeconds) : 'Looking for a brand...');
      setText(c.label, 'Wait');
      setText(c.detail, info.nextOfferSeconds > 0 ? Format.formatTime(info.nextOfferSeconds) : '...');
      c.button.disabled = true;
      return;
    }

    setText(c.title, campaign.brand + ' - ' + campaign.name);
    const paymentText = info.bonusPercent > 0
      ? Format.formatMoney(info.payment) + ' (base ' + Format.formatMoney(info.basePayment) + ' +' + info.bonusPercent + '%)'
      : Format.formatMoney(info.payment);
    setText(c.reward, Format.formatMoney(info.payment));

    if (info.status === 'offered') {
      c.bar.hidden = true;
      setText(c.meta, campaign.category + ' | ' + Format.formatDuration(campaign.durationSeconds) +
        ' | Requires ' + formatNumber(campaign.requiredFollowers) + ' followers | Pays ' + paymentText);
      setText(c.note, info.meetsRequirement ? 'New offer! Accept to start the timer.'
        : 'You need ' + formatNumber(campaign.requiredFollowers) + ' followers.');
      setText(c.label, 'Accept');
      setText(c.detail, Format.formatDuration(campaign.durationSeconds));
      c.button.disabled = !info.meetsRequirement;
      c.button.classList.toggle('ready', info.meetsRequirement);
    } else if (info.status === 'active') {
      c.bar.hidden = false;
      c.fill.style.width = Math.round((1 - info.secondsLeft / info.totalSeconds) * 100) + '%';
      setText(c.meta, campaign.category + ' | Pays ' + paymentText);
      setText(c.note, 'Campaign running. You can keep playing or close the game.');
      setText(c.label, 'Time left');
      setText(c.detail, Format.formatTime(info.secondsLeft));
      c.button.disabled = true;
      c.button.classList.remove('ready');
    } else {
      c.bar.hidden = false;
      c.fill.style.width = '100%';
      setText(c.meta, campaign.category + ' | Payment ' + paymentText);
      setText(c.note, 'Campaign Complete!');
      setText(c.label, 'Collect');
      setText(c.detail, Format.formatMoney(info.payment));
      c.button.disabled = false;
      c.button.classList.add('ready');
    }
  }

  /** Scrolls to the shop (used by the developer panel). */
  function openShop() {
    if (els.shopSection.hidden) {
      toast('Shop locked', 'Reach Level ' + Config.MONEY.unlockLevel + ' to unlock money and the shop.');
      return false;
    }
    if (typeof els.shopSection.scrollIntoView === 'function') els.shopSection.scrollIntoView({ block: 'start' });
    return true;
  }

  function onMoneyMilestone(event) {
    const m = event.milestone;
    toast(m.title, m.text + '  +' + Format.formatMoney(m.amount), 5500);
  }

  function onItemPurchased(event) {
    toast('Purchased: ' + event.item.name, itemEffectText(event.item));
  }

  /* ======================= dice game ======================= */

  function openMinigame(id) {
    if (id === 'dice') openDice();
    else if (id === 'cupShuffle') openCup();
  }

  /** Opens the dice window (also used by the developer panel). */
  function openDice() {
    const info = game.getMinigameInfo('dice');
    if (!info.unlocked) {
      toast('Dice Game locked', 'Reach Level ' + Config.getUnlock(info.def.unlockId).level + ' to unlock it.');
      return false;
    }
    showModal(els.diceModal, els.btnRoll);
    renderDice();
    return true;
  }

  function closeDice() {
    hideModal(els.diceModal);
  }

  /** Shows the die face for a value (0 = "?"). */
  function setDieValue(value) {
    els.dice.dataset.value = String(value);
  }

  function renderDice() {
    if (els.diceModal.hidden) return;
    const info = game.getMinigameInfo('dice');

    setText(els.diceHelp, 'Roll a number from 1 to ' + info.def.sides + '. Each pip is worth ' +
      formatNumber(info.rewardPerPip) + ' followers.');

    if (!diceRolling) {
      setDieValue(info.lastResult);
      setText(els.diceResult, info.lastResult > 0
        ? 'You rolled ' + info.lastResult + '!  +' + Format.formatFull(info.lastReward) + ' followers'
        : 'Ready when you are.');
    }

    let label;
    if (diceRolling) label = 'ROLLING...';
    else if (!info.unlocked) label = 'LOCKED';
    else if (info.secondsLeft > 0) label = 'NEXT ROLL IN ' + Format.formatTime(info.secondsLeft);
    else label = 'ROLL THE DICE';
    setText(els.btnRoll, label);
    els.btnRoll.disabled = diceRolling || !info.ready;
  }

  /**
   * The game decides the result and pays the reward immediately (so closing or
   * refreshing mid-animation changes nothing); this is only the rolling effect.
   */
  function rollDice() {
    if (diceRolling) return;
    const outcome = game.playDice();
    if (!outcome) { renderDice(); return; }

    const sides = Config.MINIGAMES.dice.sides;
    diceRolling = true;
    els.dice.classList.add('rolling');
    setText(els.diceResult, 'Rolling...');
    renderDice();

    diceAnimation = setInterval(function () {
      setDieValue(1 + Math.floor(Math.random() * sides));
    }, 80);

    setTimeout(function () {
      clearInterval(diceAnimation);
      diceAnimation = null;
      diceRolling = false;
      els.dice.classList.remove('rolling');
      setDieValue(outcome.result);
      setText(els.diceResult, 'You rolled ' + outcome.result + '!  +' + Format.formatFull(outcome.reward) + ' followers');
      pulse(els.dice, [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], 350);
      renderDice();
    }, Config.MINIGAMES.dice.rollAnimationMs);
  }

  /* ======================= cup shuffle ======================= */
  // The game decides everything (start cup, list of swaps, winning cup) when
  // PLAY is pressed. The screen only plays that list as an animation and then
  // passes the chosen position back; it can not change the result.

  function clearCupTimers() {
    cupTimers.forEach(function (id) { clearTimeout(id); });
    cupTimers = [];
  }

  function cupLater(ms, fn) {
    cupTimers.push(setTimeout(fn, ms));
  }

  /** Draws the cups. cups[i] starts in position i. */
  function buildCups(count, ballCup) {
    const def = Config.MINIGAMES.cupShuffle;
    els.cups.textContent = '';
    els.cups.classList.remove('animate');                // no sliding while the cups are first placed
    els.cups.style.setProperty('--swap-ms', def.swapMs + 'ms');
    cupSlots = [];
    cupCount = count;
    for (let i = 0; i < count; i++) {
      const cup = createEl('button', 'cup');
      cup.type = 'button';
      cup.setAttribute('aria-label', 'Cup ' + (i + 1));
      cup.append(createEl('span', 'cup-ball'), createEl('span', 'cup-body'));
      cup.dataset.index = String(i);
      cup.addEventListener('click', function () { pickCup(i); });
      cupSlots.push(i);
      els.cups.appendChild(cup);
      placeCup(i);
    }
    if (ballCup !== undefined) els.cups.children[ballCup].classList.add('has-ball');
    void els.cups.offsetWidth;                           // apply the positions, then allow sliding
    els.cups.classList.add('animate');
  }

  /** Moves a cup to the position it currently stands in. */
  function placeCup(cupIndex) {
    const slotWidth = 100 / cupCount;               // each position is an equal share of the table
    els.cups.children[cupIndex].style.left = (cupSlots[cupIndex] * slotWidth + (slotWidth - 30) / 2) + '%';
  }

  function openCup() {
    const info = game.getMinigameInfo('cupShuffle');
    if (!info.unlocked) {
      toast('Cup Shuffle locked', 'Reach Level ' + Config.getUnlock(info.def.unlockId).level + ' to unlock it.');
      return false;
    }
    showModal(els.cupModal, els.btnCupPlay);

    if (cupPhase === 'showing' || cupPhase === 'shuffling') {
      // The animation is still running (the window was only hidden): just show it.
    } else if (game.getCupRound()) {
      // A round is waiting for a pick (the window was closed during the shuffle).
      buildCups(game.getCupRound().cups);
      cupPhase = 'pick';
    } else {
      buildCups(info.def.cups);
      cupPhase = 'idle';
    }
    renderCup();
    return true;
  }

  function closeCup() {
    hideModal(els.cupModal);
    // An unfinished animation is cancelled; the round itself stays in the game
    // and waits for a pick. The cooldown has already started.
    if (cupPhase === 'showing' || cupPhase === 'shuffling') {
      clearCupTimers();
      cupPhase = game.getCupRound() ? 'pick' : 'idle';
    }
  }

  function renderCup() {
    if (els.cupModal.hidden) return;
    const info = game.getMinigameInfo('cupShuffle');
    const range = info.rewardRange;

    setText(els.cupHelp, 'Follow the ball, then pick the right cup. Win ' + Format.formatMoney(range.min) + ' - ' +
      Format.formatMoney(range.max) + '. Wrong cup: ' + Format.formatMoney(range.consolation) + '.');

    if (cupPhase === 'idle') {
      setText(els.cupResult, cupLastText || (info.lastReward > 0 ? 'Last game: +' + Format.formatMoney(info.lastReward) : 'Ready when you are.'));
    }

    let label;
    if (cupPhase === 'showing') label = 'WATCH THE BALL...';
    else if (cupPhase === 'shuffling') label = 'SHUFFLING...';
    else if (cupPhase === 'pick') label = 'PICK A CUP';
    else if (!info.unlocked) label = 'LOCKED';
    else if (info.secondsLeft > 0) label = 'NEXT GAME IN ' + Format.formatTime(info.secondsLeft);
    else label = 'PLAY';
    setText(els.btnCupPlay, label);
    els.btnCupPlay.disabled = cupPhase !== 'idle' && cupPhase !== 'result' ? true : !info.ready;
    els.cups.classList.toggle('pickable', cupPhase === 'pick');
  }

  function playCup() {
    if (cupPhase !== 'idle' && cupPhase !== 'result') return;
    const round = game.startCupShuffle();
    if (!round) { renderCup(); return; }

    cupLastText = '';
    buildCups(round.cups, round.startPosition);
    cupPhase = 'showing';
    setText(els.cupResult, 'Watch the ball...');
    renderCup();

    const def = Config.MINIGAMES.cupShuffle;
    const start = els.cups.children[round.startPosition];
    start.classList.add('lifted');                         // show the ball
    cupLater(def.revealMs, function () {
      start.classList.remove('lifted');
      cupLater(300, function () {
        cupPhase = 'shuffling';
        setText(els.cupResult, 'Shuffling...');
        renderCup();
        runSwaps(round.swaps, 0);
      });
    });
  }

  /** Plays the swaps decided by the game, one after another. */
  function runSwaps(swaps, index) {
    const def = Config.MINIGAMES.cupShuffle;
    if (index >= swaps.length) {
      cupPhase = 'pick';
      setText(els.cupResult, 'Pick a cup!');
      renderCup();
      return;
    }
    const a = swaps[index][0];
    const b = swaps[index][1];
    const cupA = cupSlots.indexOf(a);                      // the cup standing in position a
    const cupB = cupSlots.indexOf(b);
    cupSlots[cupA] = b;
    cupSlots[cupB] = a;
    placeCup(cupA);
    placeCup(cupB);
    cupLater(def.swapMs + 80, function () { runSwaps(swaps, index + 1); });
  }

  function pickCup(cupIndex) {
    if (cupPhase !== 'pick') return;
    const outcome = game.chooseCup(cupSlots[cupIndex]);    // the game decides
    if (!outcome) return;

    cupPhase = 'result';
    const winner = cupSlots.indexOf(outcome.ballPosition);
    els.cups.children[winner].classList.add('has-ball', 'lifted');
    els.cups.children[cupIndex].classList.add('lifted');
    els.cups.children[cupIndex].classList.add(outcome.win ? 'won' : 'lost');

    cupLastText = outcome.win
      ? 'You found it!  +' + Format.formatMoney(outcome.reward)
      : 'Wrong cup.  +' + Format.formatMoney(outcome.reward) + ' consolation';
    setText(els.cupResult, cupLastText);
    renderCup();
  }

  /* ======================= modals ======================= */

  function showModal(modal, focusEl) {
    modal.hidden = false;
    if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
  }

  function hideModal(modal) {
    modal.hidden = true;
  }

  /** Shows WELCOME BACK when offline earnings are waiting (only on the game screen). */
  function showWelcomeIfPending() {
    if (currentScreen !== 'game') return;
    const pending = game.getPendingOffline();
    if (!pending) { hideModal(els.welcomeModal); return; }

    setText(els.welcomeAway, Format.formatDuration(pending.seconds));
    setText(els.welcomeEarned, '+' + Format.formatFull(pending.followers) + ' followers');
    const capped = pending.seconds > Config.OFFLINE.maxSeconds;
    els.welcomeNote.hidden = !capped;
    setText(els.welcomeNote, 'Offline earnings are capped at ' + Format.formatDuration(Config.OFFLINE.maxSeconds) + '.');
    showModal(els.welcomeModal, els.btnCollect);
  }

  function onOfflineCollected(event) {
    toast('Welcome back!', 'Collected +' + Format.formatFull(event.followers) + ' followers.');
  }

  /* ======================= feedback ======================= */

  /** Floating text inside the stage, positioned in stage coordinates. */
  function spawnFloat(text, x, y, extraClass) {
    const el = createEl('div', 'float-text' + (extraClass ? ' ' + extraClass : ''), text);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    els.floatLayer.appendChild(el);
    // Keep the DOM small even if the player taps very fast.
    while (els.floatLayer.childElementCount > 40) {
      els.floatLayer.removeChild(els.floatLayer.firstChild);
    }
    setTimeout(function () { el.remove(); }, 950);
  }

  /** Called by main.js after a tap: squash animation + "+N" at the finger. */
  function showClickFeedback(gain, clientX, clientY) {
    pulse(els.character,
      [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.05, 0.93)' }, { transform: 'scale(1, 1)' }], 140);

    const layer = els.floatLayer.getBoundingClientRect();
    const x = clientX - layer.left + (Math.random() * 30 - 15);
    const y = clientY - layer.top - 10;
    spawnFloat('+' + formatNumber(gain), x, y, game.getTapMultiplier() > 1 ? 'viral' : '');
  }

  function onPassive(event) {
    if (Math.floor(event.gain) < 1) return;
    const layer = els.floatLayer.getBoundingClientRect();
    if (layer.width === 0) return; // game screen not visible
    const c = els.character.getBoundingClientRect();
    const x = c.left - layer.left + c.width * (0.2 + Math.random() * 0.6);
    const y = c.top - layer.top + c.height * 0.1;
    spawnFloat('+' + formatNumber(event.gain), x, y, game.getPassiveMultiplier() > 1 ? 'passive viral' : 'passive');
  }

  /** @param {number} [duration] how long it stays, in ms (default 2800) */
  function toast(title, text, duration) {
    const el = createEl('div', 'toast');
    el.append(createEl('div', 'toast-title', title), createEl('div', 'toast-text', text));
    els.toasts.appendChild(el);
    while (els.toasts.childElementCount > 3) els.toasts.removeChild(els.toasts.firstChild);
    const stay = duration || 2800;
    setTimeout(function () { el.classList.add('hide'); }, stay);
    setTimeout(function () { el.remove(); }, stay + 500);
  }

  function onLevelUp(event) {
    // One toast for the level; if the look changes too, it is mentioned in the same toast.
    const oldStage = Config.stageForLevel(event.from);
    const newStage = Config.stageForLevel(event.to);
    let text = 'You reached Level ' + event.to + '.';
    if (newStage.id !== oldStage.id) {
      text += ' New look: ' + newStage.name + '!';
    }
    toast('LEVEL UP!', text);
    pulse(els.levelBadge, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], 500);
  }

  function onUnlock(event) {
    if (event.unlock.id === 'creatorFund') return;   // the payout message below announces it
    toast('Unlocked: ' + event.unlock.name, event.unlock.description);
  }

  function onUpgradeClaimed(event) {
    const upgrade = event.upgrade;
    toast(upgrade.name + ' Lv ' + event.level,
      '+' + formatNumber(Config.upgradeEffectFor(upgrade, event.level)) + ' ' + Config.STAT_LABELS[upgrade.stat] + ' claimed.');
  }

  function onEventStarted(event) {
    toast(event.event.name + '!', event.event.label + ' for ' + event.event.durationSeconds + ' seconds. Keep tapping!');
  }

  function onEventEnded(event) {
    if (currentScreen === 'game') toast('The buzz fades', 'Followers are back to normal.');
  }

  /** A game was started or loaded: forget any leftover animation and redraw. */
  function onLoaded() {
    hideModal(els.diceModal);
    hideModal(els.cupModal);
    clearCupTimers();
    cupPhase = 'idle';
    cupLastText = '';
    hideModal(els.welcomeModal);
    render();
  }

  /* ======================= menu / screens ======================= */

  /** @param {object|null} saved a valid saved state, or null if none */
  function updateMenu(saved) {
    els.btnContinue.disabled = !saved;
    els.continueInfo.textContent = saved
      ? 'Level ' + Config.levelForFollowers(saved.followers) + ' - ' + formatNumber(saved.followers) + ' followers'
      : 'No saved game';
  }

  /** @param {'menu'|'game'} name */
  function showScreen(name) {
    currentScreen = name;
    els.menuScreen.classList.toggle('active', name === 'menu');
    els.gameScreen.classList.toggle('active', name === 'game');
    if (name === 'menu') {
      hideModal(els.diceModal);
      hideModal(els.cupModal);
      clearCupTimers();
      cupPhase = 'idle';
      hideModal(els.welcomeModal);
    } else {
      showWelcomeIfPending();     // offline earnings saved before a refresh
    }
    window.scrollTo(0, 0);
  }

  /* ======================= public API ======================= */

  /**
   * @param {Game} gameInstance
   * @param {object} handlers  onNewGame, onContinue, onDeleteSave,
   *                           onBackToMenu, onVersionTap, onTap(clientX, clientY)
   */
  function init(gameInstance, handlers) {
    game = gameInstance;
    cacheElements();
    buildUpgradeCards();
    buildMinigameTiles();
    buildChallengeCard();
    buildSponsorCard();
    buildShopCards();
    buildUnlockRows();
    bindInput(handlers);
    subscribeToGame();
    render();
  }

  NS.UI = {
    init: init,
    render: render,
    showScreen: showScreen,
    updateMenu: updateMenu,
    showClickFeedback: showClickFeedback,
    openDice: openDice,
    openCup: openCup,
    openShop: openShop,
    toast: toast
  };
})(window.Influencer = window.Influencer || {});
