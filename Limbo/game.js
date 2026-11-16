'use strict';

const VERSION = 'v1.9.0';

const STATE = {
  MENU:'menu', GRIMOIRE:'grimoire', GUIDE:'guide', UPGRADES:'upgrades',
  PLAYING:'playing', BOON_PICK:'boon_pick',
  TRANSITION:'transition', GAME_OVER:'game_over', WIN:'win',
  LOBBY:'lobby', FATE_CHOICE:'fate_choice', SHOP:'shop'
};

class Game {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.scaleRef = { scale:1, offsetX:0, offsetY:0 };
    this._resize();
    window.addEventListener('resize', () => this._resize());
    Input.init(canvas, this.scaleRef);

    window.addEventListener('keydown', e => {
      if (e.code === 'F1') { e.preventDefault(); Logger.toggleOverlay(); }
      if (e.code === 'F2') { e.preventDefault(); Logger.download(); }
    });
    window.addEventListener('wheel', e => {
      if (this.state === STATE.GRIMOIRE) this.grimoireScreen.handleScroll(e.deltaY * 0.5);
    }, { passive: true });

    // Auto-download log on any JS crash
    window.onerror = (msg, src, line, col) => {
      Logger.log('ERROR', `CRASH: ${msg}`, { src: (src||'').split('/').pop(), line, col });
      setTimeout(() => Logger.download(), 50);
    };
    window.onunhandledrejection = (e) => {
      Logger.log('ERROR', `Unhandled rejection: ${e.reason}`);
      setTimeout(() => Logger.download(), 50);
    };

    this.state   = STATE.MENU;
    // Auto-join si lien d'invitation (?join=CODE)
    const _joinParam = new URLSearchParams(location.search).get('join');
    if (_joinParam) {
      history.replaceState(null, '', location.pathname);
      this._lobbyInput = _joinParam;
      this._lobbyError = 'Connexion en cours…';
      this.state = STATE.LOBBY;
      // Auto-trigger join immediately
      Net.join(_joinParam).then(() => {
        Net.onMessage(data => this._handleNetMessage(data));
        this._lobbyJoining = false;
        this._lobbyNamePhase = true;
        this._myName = ''; this._p2Name = '';
        this._myNameReady = false; this._p2NameReady = false;
      }).catch(e => { this._lobbyError = 'Erreur : ' + e.message; });
    }
    this.player  = null;
    this.room    = null;
    this.depth   = 0;
    this.boonPicker    = null;
    this.grimoireScreen= null;
    this.guideScreen   = null;
    this.upgradeScreen = null;

    this.fade         = 0;
    this.fadeDir      = 0;
    this.fadeCallback = null;
    this.shakeX = 0; this.shakeY = 0; this.shakeT = 0;
    this.roomsCleared = 0;
    this.runTime      = 0;
    this.soulsEarned  = 0;
    this.runSeed = 0;
    this.perfMult = 1.0;
    this.roomClearTimes = [];
    this._roomStartTime = 0;

    this.coopMode   = false;   // true quand 2 joueurs
    this.hitstopTimer = 0;
    this._dmgFlashTimer = 0;
    this._bossIntroTimer = 0;
    this._bossIntroName = '';
    this._fateOptions = [];
    this._fateHover = -1;
    this._shopItems = [];
    this._shopBought = new Set();
    this._lastPlaystyleRatio = 0.5;
    this._killStreak = 0;
    this._killStreakTimer = 0;
    this._spectatorMode   = false;  // local player is spectating
    this._hostIsSpectator = false;  // remote host became spectator (client-side flag)
    this._reviveTimer     = 0;   // how long alive player has been near dead partner
    this._depthMilestone  = '';  // text to flash on zone change
    this._depthMilestoneT = 0;   // timer for the flash (counts down from 2.5)
    this._myFateVote    = -1;     // local player's card vote index
    this._p2FateVote    = -1;     // other player's card vote index
    this._fateVoteTimer = -1;     // 10s countdown (-1 = not running)
    this._fateRoulette  = false;  // roulette animation playing
    this._fateRouletteTimer = 0;  // 2s animation timer
    this._fateRouletteWinner = -1;// pre-computed winner index
    this._fateAnimTimer  = 0;  // drives card slide-in animation
    this._fateGuardTimer = 0;  // prevents missclicks after room clear
    this.player2    = null;    // instance Player pour P2 (hôte uniquement)
    this.p2State    = null;    // état reçu de l'hôte (client uniquement)
    this._netTimer  = 0;       // timer pour envoi état réseau
    this._lobbyCode = '';      // code affiché (hôte) ou saisi (client)
    this._lobbyInput= '';      // saisie clavier en cours
    this._lobbyError= '';      // message d'erreur lobby
    this._lobbyWaiting = false;// en attente de connexion
    this._lobbyCopied  = false; // feedback bouton copier
    this._lobbyJoining = false; // client en cours de connexion (bloque double-join)
    this._lobbyNamePhase = false; // phase saisie des pseudos
    this._myName      = '';    // pseudo du joueur local
    this._p2Name      = '';    // pseudo de l'autre joueur (reçu réseau)
    this._myNameReady = false; // joueur local a validé son pseudo
    this._p2NameReady = false; // autre joueur a validé son pseudo
    this.p1Name = 'Joueur 1'; // noms conservés pour l'affichage en jeu
    this.p2Name = 'Joueur 2';

    // Menu buttons
    this._menuButtons = [
      { label:'⚔  JOUER',              action:'play',     w:260, color:'#5040a0' },
      { label:'📖  GRIMOIRE',           action:'grimoire', w:260, color:'#304080' },
      { label:'🗺  GUIDE',              action:'guide',    w:260, color:'#2a4040' },
      { label:'💜  AMÉLIORATIONS',      action:'upgrades', w:260, color:'#403060' },
      { label:'🌐  CO-OP',              action:'coop',     w:260, color:'#204060' },
    ];

    this._lastTime = 0;
    requestAnimationFrame(t => this._loop(t));
  }

  _resize() {
    const sx=window.innerWidth/W, sy=window.innerHeight/H, s=Math.min(sx,sy);
    this.canvas.width=W; this.canvas.height=H;
    this.canvas.style.width=`${W*s}px`; this.canvas.style.height=`${H*s}px`;
    this.scaleRef.scale=s;
    this.scaleRef.offsetX=(window.innerWidth-W*s)/2;
    this.scaleRef.offsetY=(window.innerHeight-H*s)/2;
  }

  _loop(t) {
    try {
      const rawDt = Math.min((t-this._lastTime)/1000, 0.05);
      this._lastTime = t;
      // Hitstop: skip game update for a few ms on hard hits
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
      } else {
        this.update(rawDt);
      }
      this.draw();
      Input.endFrame();
    } catch(err) {
      Logger.log('ERROR', `Loop crash: ${err.message}`, { stack: (err.stack||'').slice(0,200) });
      Logger.download();
      // Show crash screen instead of freezing silently
      try {
        const ctx = this.ctx;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f44'; ctx.font = 'bold 28px Georgia'; ctx.textAlign = 'center';
        ctx.fillText('ERREUR — JEU PLANTÉ', W/2, H/2 - 40);
        ctx.fillStyle = '#aaa'; ctx.font = '16px Georgia';
        ctx.fillText(err.message, W/2, H/2);
        ctx.fillStyle = '#888'; ctx.font = '14px Georgia';
        ctx.fillText('Le fichier log.txt a été téléchargé automatiquement.', W/2, H/2 + 40);
        ctx.fillText('Appuyez sur F5 pour recharger.', W/2, H/2 + 65);
      } catch(_) {}
      return; // stop the loop
    }
    requestAnimationFrame(ts=>this._loop(ts));
  }

  startRun() {
    Logger.reset();
    this.runSeed = (Math.random() * 0x7FFFFFFF) >>> 0;
    RunRNG = new SeededRNG(this.runSeed);
    Logger.log('SYSTEM', `Run seed: ${this.runSeed}`);
    this.player = new Player();
    // Apply permanent upgrades
    Meta.applyToplayer(this.player);
    // Lame Maudite: -20% HP, +30% dmg
    if (this.player.stats.cursedBlade) {
      this.player.maxHp = Math.round(this.player.maxHp * 0.80);
      this.player.hp = this.player.maxHp;
      this.player.stats.dmgMult = (this.player.stats.dmgMult || 1) * 1.30;
      Logger.log('SYSTEM', 'Lame Maudite: -20% HP +30% dmg');
    }
    // Mémoire des Dons: start with 1 free boon
    const upgrades = Meta.getUpgrades();
    if (upgrades.memoire >= 1) {
      const freeBoon = pickBoons([], 1, 0.5)[0];
      if (freeBoon) {
        freeBoon.apply(this.player);
        this.player.boonIds.push(freeBoon.id);
        Logger.log('BOON', `Mémoire des Dons: free boon ${freeBoon.name}`);
      }
    }
    this.depth = 1; this.roomsCleared = 0; this.runTime = 0; this.soulsEarned = 0;
    this.perfMult = 1.0; this.roomClearTimes = []; this._roomStartTime = 0;
    Particles.clear();
    this._loadRoom();
    this.state = STATE.PLAYING;
    Logger.log('SYSTEM', 'New run started');
  }

  _loadRoom() {
    const isBoss = this.depth % 5 === 0;
    this._roomStartTime = this.runTime;
    const coopMult = this.coopMode ? 2.5 : 1.0;
    this.room = new Room(this.depth, isBoss, this.perfMult * coopMult);
    // Depth milestone announcements
    const milestones = { 1:'🌑 Limbes', 6:'💧 Achéron', 11:'🌿 Érèbe', 16:'🔥 Tourment', 26:'☄ Supplice', 36:'☠ Chaos' };
    if (milestones[this.depth]) {
      this._depthMilestone = milestones[this.depth];
      this._depthMilestoneT = 2.5;
    }
    this.player.pos.set(W/2, PLAY.y + PLAY.h - 65);
    Logger.log('ROOM', `Entered room depth=${this.depth} isBoss=${isBoss}`);
    if (isBoss) {
      const bossNum = Math.ceil(this.depth / 5);
      const isMini = bossNum % 2 === 1;
      Logger.log('BOSS', `Floor ${this.depth}: ${isMini ? 'MiniBoss' : 'Warden'} (boss #${bossNum})`);
      // Boss entrance animation
      if (this.room.enemies.length > 0) {
        this._bossIntroTimer = 2.5;
        this._bossIntroName = this.room.enemies[0].name || 'BOSS';
      }
    } else {
      this._bossIntroTimer = 0;
    }
  }

  _advanceToNextRoom() {
    this._doFade(1, () => {
      this.depth++;
      if (this.player.stats.roomHeal > 0) this.player.heal(this.player.stats.roomHeal);
      if (this.depth % 15 === 1 && this.depth > 1) {
        const bonus = 50 + Math.floor(this.depth / 15) * 25;
        Meta.addSouls(bonus);
        Logger.log('SYSTEM', `Milestone bonus: +${bonus} souls at depth ${this.depth}`);
      }
      this._loadRoom();
      this.state = STATE.PLAYING;
      this._doFade(-1, null);
    });
  }

  _makeBoonPicker(choices, limitReroll) {
    const playstyleRatio = this._lastPlaystyleRatio || 0.5;
    const boonCount = this.player.stats.boonChoices || 3;
    const onPickBoon = (boon) => {
      boon.apply(this.player);
      this.player.boonIds.push(boon.id);
      checkSynergies(this.player);
      Logger.log('BOON', `Picked: ${boon.name}`, {
        dmgMult: this.player.stats.dmgMult.toFixed(2),
        synergies: this.player.synergyIds
      });
      this._advanceToNextRoom();
    };
    return new BoonPicker(choices, onPickBoon, this.player.boonIds.slice(), {
      canReroll: !!this.player.stats.canReroll && !limitReroll,
      rerollCost: 8,
      onReroll: () => {
        const newChoices = pickBoons(this.player.boonIds, boonCount, playstyleRatio);
        Logger.log('BOON', 'Rerolled boon choices');
        this.boonPicker = this._makeBoonPicker(newChoices, true);
      }
    });
  }

  _generateFateOptions() {
    const choices = this.player.stats.boonChoices || 3;
    const healAmt = Math.round(this.player.maxHp * 0.4);
    return [
      { type:'boon', icon:'✨', label:'Don du Destin',   desc:`Choisissez parmi ${choices} dons de pouvoir`, color:'#302060' },
      { type:'heal', icon:'💉', label:'Source de Vie',   desc:`Restaure ${healAmt} PV — soignez vos blessures`, color:'#102020' },
      { type:'shop', icon:'🏛', label:'Puits de Charon', desc:'Dépensez des âmes contre des pouvoirs rares', color:'#2a1a08' },
    ];
  }

  _selectFate(option) {
    if (option.type === 'boon') {
      const boonCount = this.player.stats.boonChoices || 3;
      const choices = pickBoons(this.player.boonIds, boonCount, this._lastPlaystyleRatio);
      Logger.log('BOON', `Fate: Boon choices (${boonCount}): ${choices.map(b=>b.name).join(', ')}`);
      this.boonPicker = this._makeBoonPicker(choices, false);
      this.state = STATE.BOON_PICK;
      if (this.coopMode && Net.isHost) {
        Net.send({ type:'state', gameState:'boon_pick',
          boonChoices: choices.map(b=>b.id) });
      }
    } else if (option.type === 'heal') {
      const healAmt = Math.round(this.player.maxHp * 0.4);
      this.player.heal(healAmt);
      this._shake(3, 0.2);
      Particles.burst(W/2, H/2, 20, '#5f5', 150, 3);
      Logger.log('SYSTEM', `Fate: Heal ${healAmt} HP`);
      if (this.coopMode && Net.isHost) Net.send({ type:'fate_heal', amt: healAmt });
      this._advanceToNextRoom();
    } else if (option.type === 'shop') {
      this._generateShopItems();
      this.state = STATE.SHOP;
      Logger.log('SYSTEM', "Fate: Entered Charon's Well");
      if (this.coopMode && Net.isHost) Net.send({ type:'state', gameState:'shop' });
    }
  }

  _generateShopItems() {
    const healAmt = Math.round(this.player.maxHp * 0.35);
    const allItems = [
      { id:'hp_flask',    icon:'🧪', label:'Népenthès',        desc:`Restaure ${healAmt} PV`,         cost:15, apply:(p)=>p.heal(healAmt) },
      { id:'large_flask', icon:'🫙', label:'Grande Fiole',     desc:'Restaure 100 PV',                cost:28, apply:(p)=>p.heal(100) },
      { id:'chaos_boon',  icon:'🔮', label:'Cristal du Chaos', desc:'Don aléatoire immédiat',          cost:35, apply:(p,g)=>g._giveRandomBoon(p) },
      { id:'shadow_veil', icon:'💨', label:'Voile des Ombres', desc:'+1 charge de Dash',              cost:30, apply:(p)=>{if(p.stats.dashCharges<4){p.stats.dashCharges++;p.dashCooldowns.push(0);}} },
      { id:'soul_prism',  icon:'💎', label:'Prisme d\'Âmes',   desc:'+20% de dégâts ce run',          cost:22, apply:(p)=>{p.stats.dmgMult *= 1.20;} },
      { id:'iron_heart',  icon:'❤', label:'Cœur de Fer',      desc:'+30 PV max + soin immédiat',     cost:32, apply:(p)=>{p.maxHp+=30;p.heal(30);} },
      { id:'specter_dust',icon:'💫', label:'Poussière Spectre',desc:'+15% vitesse de déplacement',    cost:20, apply:(p)=>{p.stats.speedMult *= 1.15;} },
      { id:'void_lens',   icon:'🔭', label:'Prisme du Vide',   desc:'-1s délai Blast ce run',         cost:18, apply:(p)=>{p.stats.blastCDReduc=(p.stats.blastCDReduc||0)+1;} },
    ];
    // Shuffle and pick 3
    const shuffled = [...allItems].sort(() => Math.random() - 0.5);
    this._shopItems = shuffled.slice(0, 3);
    this._shopBought = new Set();
  }

  _giveRandomBoon(player) {
    const totalKills = player.meleeKills + player.rangedKills;
    const ratio = totalKills > 0 ? player.rangedKills / totalKills : 0.5;
    const boon = pickBoons(player.boonIds, 1, ratio)[0];
    if (boon) {
      boon.apply(player);
      player.boonIds.push(boon.id);
      checkSynergies(player);
      Particles.burst(W/2, H/2, 30, '#c5f', 200, 4);
      Logger.log('BOON', `Shop: Random boon ${boon.name}`);
    }
  }

  _doFade(dir, cb) { this.fadeDir=dir; this.fadeCallback=cb; }
  _shake(i=6, d=0.15) { this.shakeX=rand(-i,i); this.shakeY=rand(-i,i); this.shakeT=d; }

  _openGrimoire() {
    this.grimoireScreen = new GrimoireScreen(() => { this.state=STATE.MENU; });
    this.state = STATE.GRIMOIRE;
  }
  _openGuide() {
    this.guideScreen = new GuideScreen(() => { this.state=STATE.MENU; });
    this.state = STATE.GUIDE;
  }
  _openUpgrades() {
    this.upgradeScreen = new UpgradeShopScreen(() => { this.state=STATE.MENU; });
    this.state = STATE.UPGRADES;
  }
  _openLobby() {
    this._lobbyCode = ''; this._lobbyInput = ''; this._lobbyError = ''; this._lobbyWaiting = false;
    this.state = STATE.LOBBY;
  }

  update(dt) {
    this.shakeT=Math.max(0,this.shakeT-dt);
    if (this.shakeT<=0) { this.shakeX=0; this.shakeY=0; }
    this._dmgFlashTimer = Math.max(0, this._dmgFlashTimer - dt);
    this._killStreakTimer = Math.max(0, this._killStreakTimer - dt);
    if (this._killStreakTimer <= 0) this._killStreak = 0;

    if (this.fadeDir!==0) {
      this.fade += this.fadeDir*dt*4;
      if (this.fade>=1 && this.fadeDir>0) {
        this.fade=1; this.fadeDir=0;
        if (this.fadeCallback) { this.fadeCallback(); this.fadeCallback=null; }
      } else if (this.fade<=0 && this.fadeDir<0) { this.fade=0; this.fadeDir=0; }
    }

    // Route mouse hover/click to overlay screens
    const mx=Input.mouse.x, my=Input.mouse.y, lp=Input._leftJustPressed;
    if      (this.state===STATE.LOBBY)     this._updateLobby(dt);
    else if (this.state===STATE.MENU)      this._updateMenu(dt);
    else if (this.state===STATE.GRIMOIRE && this.grimoireScreen) {
      this.grimoireScreen.handleMouse(mx,my,lp); if(lp) Input._leftJustPressed=false;
    }
    else if (this.state===STATE.GUIDE && this.guideScreen) {
      this.guideScreen.handleMouse(mx,my,lp); if(lp) Input._leftJustPressed=false;
    }
    else if (this.state===STATE.UPGRADES && this.upgradeScreen) {
      this.upgradeScreen.update(dt);
      this.upgradeScreen.handleMouse(mx,my,lp); if(lp) Input._leftJustPressed=false;
    }
    else if (this.state===STATE.PLAYING)   this._updatePlaying(dt);
    else if (this.state===STATE.BOON_PICK) this._updateBoonPick(dt);
    else if (this.state===STATE.FATE_CHOICE) this._updateFateChoice(dt);
    else if (this.state===STATE.SHOP)        this._updateShop(dt);
    else if (this.state===STATE.GAME_OVER || this.state===STATE.WIN) {
      this.runTime+=dt;
      if (Input.justPressed('KeyR'))
        this._doFade(1, ()=>{ this.startRun(); this._doFade(-1,null); });
      else if (Input.justPressed('Enter') || Input.justPressed('Space') || lp) {
        Input._leftJustPressed=false;
        this._doFade(1, ()=>{ this.state=STATE.MENU; this._doFade(-1,null); });
      }
    }
  }

  _updateMenu(dt) {
    if (Input.justPressed('Enter') || Input.justPressed('Space')) {
      this._doFade(1,()=>{ this.startRun(); this._doFade(-1,null); });
    }
  }

  _updatePlaying(dt) {
    // Block input during boss entrance animation
    if (this._bossIntroTimer > 0) {
      this._bossIntroTimer -= dt;
      Particles.update(dt);
      return;
    }
    if (this._depthMilestoneT > 0) this._depthMilestoneT -= dt;
    this.runTime+=dt;
    const prevHp=this.player.hp;
    const prevAlive = this.room.enemies.filter(e => !e.dead).length;

    // ── COOP CLIENT: snapshot dead mask avant room.update pour détecter les kills locaux
    let _prevDeadMask = null;
    if (this.coopMode && !Net.isHost) {
      _prevDeadMask = this.room.enemies.map(e => e.dead);
    }

    this.room.update(dt, this.player);

    // ── COOP CLIENT: signaler au host les ennemis tués localement
    if (this.coopMode && !Net.isHost && _prevDeadMask) {
      const newKills = [];
      for (let i = 0; i < this.room.enemies.length; i++) {
        if (!_prevDeadMask[i] && this.room.enemies[i].dead) newKills.push(i);
      }
      if (newKills.length) Net.send({ type: 'kill_enemy', indices: newKills });
    }

    this.player.update(dt, this.room, Input.mouse.x, Input.mouse.y);

    // ── COOP: update P2 (host only) ───────────────────────
    if (this.coopMode && Net.isHost && this.player2) {
      const inp = this._p2Input;
      if (inp) {
        this.player2.pos.set(inp.x, inp.y);
        // Apply P2 abilities based on received input
        if (inp.melee && this.player2.atkTimer <= 0) {
          this.player2.atkTimer = this.player2.atkCooldown;
          for (const e of this.room.enemies) {
            if (e.dead) continue;
            if (this.player2.pos.dist(e.pos) < this.player2.range + e.r) {
              e.takeDamage(this.player2.meleeDmg);
              this.player2.meleeKills += e.dead ? 1 : 0;
            }
          }
        }
        if (inp.cast && this.player2.castTimer <= 0) {
          this.player2.castTimer = this.player2.castCooldown;
          const dx = inp.mx - this.player2.pos.x, dy = inp.my - this.player2.pos.y;
          const len = Math.hypot(dx, dy) || 1;
          const proj = new Projectile(
            this.player2.pos.x, this.player2.pos.y,
            dx/len*500, dy/len*500, 8, this.player2.castDmg, true, '#f8a'
          );
          this.room.projectiles.push(proj);
          this.player2.rangedKills += 0;
        }
      }
      // Send state to client every 50ms
      this._netTimer -= dt;
      if (this._netTimer <= 0) {
        this._netTimer = 0.05;
        const statePayload = {
          type: 'state',
          gameState: this.state,
          depth: this.depth,
          enemies: this.room.enemies.map((e,i)=>({
            i, x:Math.round(e.pos.x), y:Math.round(e.pos.y),
            hp:Math.round(e.hp), maxHp:e.maxHp, dead:e.dead
          })),
          p1: { x:Math.round(this.player.pos.x), y:Math.round(this.player.pos.y), hp:Math.round(this.player.hp), maxHp:this.player.maxHp },
        };
        // Include boon choices when in BOON_PICK
        if (this.state === STATE.BOON_PICK && this.boonPicker) {
          statePayload.gameState = 'boon_pick';
          statePayload.boonChoices = (this.boonPicker._choices||[]).map(b=>b.id);
        }
        Net.send(statePayload);
      }
    }

    // ── COOP: send input to host (client only) ────────────
    if (this.coopMode && !Net.isHost) {
      Net.send({
        type: 'input',
        x: Math.round(this.player.pos.x), y: Math.round(this.player.pos.y),
        mx: Math.round(Input.mouse.x), my: Math.round(Input.mouse.y),
        melee: Input.isAttack(), cast: Input.isCast(),
        dash: Input.isDash(), blast: Input.justPressed('KeyE')
      });
    }

    Particles.update(dt);

    // ── COOP REVIVE: alive player stays near dead partner's ghost for 3s ──
    if (this.coopMode) {
      const REVIVE_DIST = 65, REVIVE_TIME = 3.0;
      let nearGhost = false;

      if (Net.isHost) {
        // Case A: host alive, P2 is spectator ghost
        if (!this._spectatorMode && this.player2 && this.player2.isSpectator) {
          const d = Math.hypot(this.player.pos.x - this.player2.pos.x, this.player.pos.y - this.player2.pos.y);
          if (d < REVIVE_DIST) {
            nearGhost = true;
            this._reviveTimer += dt;
            if (this._reviveTimer >= REVIVE_TIME) {
              this._reviveTimer = 0;
              this.player2.isSpectator = false;
              this.player2.dead = false;
              this.player2.hp = Math.round(this.player2.maxHp * 0.30);
              Particles.burst(this.player2.pos.x, this.player2.pos.y, 20, '#5f5', 160, 4);
              Net.send({ type: 'partner_revived', hp: this.player2.hp });
              Logger.log('SYSTEM', 'P1 revived P2');
            }
          }
        }
        // Case B: host is spectator, P2 (via input) is near host ghost
        if (this._spectatorMode && this._p2Input) {
          const d = Math.hypot(this._p2Input.x - this.player.pos.x, this._p2Input.y - this.player.pos.y);
          if (d < REVIVE_DIST) {
            nearGhost = true;
            this._reviveTimer += dt;
            if (this._reviveTimer >= REVIVE_TIME) {
              this._reviveTimer = 0;
              this.player.isSpectator = false;
              this.player.dead = false;
              this._spectatorMode = false;
              this.player.hp = Math.round(this.player.maxHp * 0.30);
              Particles.burst(this.player.pos.x, this.player.pos.y, 20, '#5f5', 160, 4);
              Net.send({ type: 'host_revived', hp: this.player.hp });
              Logger.log('SYSTEM', 'P2 revived P1');
            }
          }
        }
      } else {
        // Client: alive, host is spectator (use _remoteP1 for host ghost position)
        if (!this._spectatorMode && this._hostIsSpectator && this._remoteP1) {
          const d = Math.hypot(this.player.pos.x - this._remoteP1.x, this.player.pos.y - this._remoteP1.y);
          if (d < REVIVE_DIST) {
            nearGhost = true;
            this._reviveTimer += dt;
            if (this._reviveTimer >= REVIVE_TIME) {
              this._reviveTimer = 0;
              Net.send({ type: 'request_revive' });
            }
          }
        }
      }
      if (!nearGhost) this._reviveTimer = 0;
    }

    // Screen shake on damage — subtle, not disorienting
    if (this.player.hp < prevHp) {
      const dmgTaken = prevHp - this.player.hp;
      this._shake(Math.min(6, 2 + dmgTaken * 0.08), 0.12);
      this._dmgFlashTimer = 0.14;
    }
    // Kill streak tracking
    const newAlive = this.room.enemies.filter(e => !e.dead).length;
    const justKilled = prevAlive - newAlive;
    if (justKilled > 0) {
      this._killStreak += justKilled;
      this._killStreakTimer = 2.5;
      if (this._killStreak >= 3) {
        const msg = this._killStreak >= 6 ? '☠ MASSACRE !' : '🔥 SÉRIE !';
        Particles.bigText(W/2, PLAY.y + 100, msg, this._killStreak >= 6 ? '#f04' : '#ff8');
        if (this._killStreak >= 5) this._shake(4, 0.2);
      }
    }

    // Dernière Chance: survive a fatal hit once per run
    if (this.player.hp <= 0 && this.player.stats.secondChance && !this.player._secondChanceUsed) {
      this.player._secondChanceUsed = true;
      this.player.hp = 1;
      this.player.dead = false;
      Particles.heal(this.player.pos.x, this.player.pos.y, 999);
      this._shake(10, 0.4);
      Logger.log('SYSTEM', 'Dernière Chance activated!');
    }

    if (this.player.dead && this.state===STATE.PLAYING) {
      if (this.coopMode) {
        // Coop: become spectator, don't end the game
        this.player.isSpectator = true;
        this.player.dead = false;
        this.player.hp = 0;
        this._spectatorMode = true;
        if (!Net.isHost) Net.send({ type: 'player_dead' });
        // Host checks if P2 is also dead
        if (Net.isHost) {
          const p2Dead = !this.player2 || this.player2.hp <= 0;
          if (p2Dead) this._triggerGameOver();
          else Net.send({ type: 'host_dead' }); // avertit le client que P1 est spectateur
        }
        Logger.log('SYSTEM', `${Net.isHost ? 'P1' : 'P2'} est spectateur`);
      } else {
        this._triggerGameOver();
      }
    }

    if (this.room.cleared && !this.room._boonTriggered && this.state===STATE.PLAYING) {
      this.room._boonTriggered = true;
      this.roomsCleared++;

      // Performance tracking → adaptive difficulty (infinite only)
      if (!this.room.isBoss && this.depth > 15) {
        const clearTime = this.runTime - this._roomStartTime;
        this.roomClearTimes.push(clearTime);
        const recent = this.roomClearTimes.slice(-5);
        const avg = recent.reduce((s, t) => s + t, 0) / recent.length;
        const raw = 20 / Math.max(4, avg);
        this.perfMult = Math.max(0.8, Math.min(3.0, raw));
        Logger.log('SYSTEM', `Room ${clearTime.toFixed(1)}s | avg ${avg.toFixed(1)}s | traque ×${this.perfMult.toFixed(2)}`);
      }

      if (this.room.isBoss) {
        const healed = this.player.maxHp - this.player.hp;
        if (healed > 0) { this.player.hp = this.player.maxHp; Particles.heal(W/2, H/2, healed); }
      }

      // Track playstyle ratio for boon selection
      const totalKills = this.player.meleeKills + this.player.rangedKills;
      this._lastPlaystyleRatio = totalKills > 0 ? this.player.rangedKills / totalKills : 0.5;

      // HADES-style fate choice — both solo and coop
      this._fateOptions = this._generateFateOptions();
      this._fateHover   = -1;
      this._fateAnimTimer  = 0;
      this._fateGuardTimer = 0.55; // 550ms guard against missclicks
      this._myFateVote    = -1;
      this._p2FateVote    = -1;
      this._fateVoteTimer = -1;
      this._fateRoulette  = false;
      this._fateRouletteTimer = 0;
      this._fateRouletteWinner = -1;
      Input._leftJustPressed = false; // discard the kill-click
      this.state = STATE.FATE_CHOICE;
      if (this.coopMode && Net.isHost) {
        Net.send({ type:'state', gameState:'fate_choice',
          fateOptions: this._fateOptions.map(o => o.type) });
      }
    }
  }

  _updateBoonPick(dt) {
    this.boonPicker.update(dt);
    this.boonPicker.handleMouse(Input.mouse.x, Input.mouse.y, Input._leftJustPressed);
    if (Input._leftJustPressed) Input._leftJustPressed=false;
  }

  _updateFateChoice(dt) {
    if (this._fateGuardTimer > 0) { this._fateGuardTimer -= dt; return; }
    this._fateAnimTimer += dt;

    // ── Roulette animation ────────────────────────────────
    if (this._fateRoulette) {
      this._fateRouletteTimer -= dt;
      if (this._fateRouletteTimer <= 0 && (Net.isHost || !this.coopMode)) {
        this._fateRoulette = false;
        this._selectFate(this._fateOptions[this._fateRouletteWinner]);
        if (this.coopMode) Net.send({ type:'fate_selected', index: this._fateRouletteWinner });
      }
      return;
    }

    // ── Countdown (votes differ) ──────────────────────────
    if (this._fateVoteTimer >= 0) {
      this._fateVoteTimer -= dt;
      if (this._fateVoteTimer <= 0 && (Net.isHost || !this.coopMode)) {
        // Start roulette
        const opts = [this._myFateVote, this._p2FateVote];
        this._fateRouletteWinner = opts[Math.floor(Math.random() * 2)];
        this._fateRoulette = true;
        this._fateRouletteTimer = 2.2;
        if (this.coopMode) Net.send({ type:'fate_roulette', winner: this._fateRouletteWinner });
      }
      return;
    }

    const mx = Input.mouse.x, my = Input.mouse.y;
    const lp = Input._leftJustPressed;
    const cardsReady = this._fateAnimTimer > 0.9;
    const cardW = 220, cardH = 230, gap = 40;
    const totalW = 3 * cardW + 2 * gap;
    const startX = W/2 - totalW/2;
    const cardY = H/2 - cardH/2 + 30;

    this._fateHover = -1;
    const canVote = this._myFateVote === -1; // can only vote once

    if (cardsReady && canVote) {
      for (let k = 0; k < 3; k++) {
        if (Input.justPressed(`Digit${k+1}`) || Input.justPressed(`Numpad${k+1}`)) {
          this._castFateVote(k); return;
        }
      }
      for (let i = 0; i < this._fateOptions.length; i++) {
        const cx = startX + i * (cardW + gap);
        if (hitTest(mx, my, cx, cardY, cardW, cardH)) {
          this._fateHover = i;
          if (lp) {
            Input._leftJustPressed = false;
            this._castFateVote(i);
            return;
          }
        }
      }
    }
    if (lp) Input._leftJustPressed = false;

    // Host periodic sync
    if (this.coopMode && Net.isHost) {
      this._netTimer = (this._netTimer || 0) + dt;
      if (this._netTimer > 0.4) {
        this._netTimer = 0;
        Net.send({ type:'state', gameState:'fate_choice',
          fateOptions: this._fateOptions.map(o => o.type),
          p1Vote: this._myFateVote, p2Vote: this._p2FateVote,
          fateTimer: this._fateVoteTimer });
      }
    }
  }

  _castFateVote(index) {
    this._myFateVote = index;
    if (this.coopMode) {
      Net.send({ type:'fate_vote', index });
      this._checkFateVotes();
    } else {
      this._selectFate(this._fateOptions[index]);
    }
  }

  _checkFateVotes() {
    if (!Net.isHost) return;
    // Si l'hôte est spectateur, le client décide seul
    if (this._spectatorMode) {
      if (this._p2FateVote !== -1) {
        this._selectFate(this._fateOptions[this._p2FateVote]);
      }
      return;
    }
    if (this._myFateVote === -1 || this._p2FateVote === -1) return;
    if (this._myFateVote === this._p2FateVote) {
      // Agreement — select immediately
      this._selectFate(this._fateOptions[this._myFateVote]);
    } else {
      // Disagreement — 10s countdown
      this._fateVoteTimer = 10;
      Net.send({ type:'fate_countdown' });
    }
  }

  _triggerGameOver() {
    this.state = STATE.TRANSITION;
    this._shake(8, 0.3);
    const rawSouls = Meta.calcSouls(this.depth, this.roomsCleared, this.player.boonIds.length);
    const souls = Math.round(rawSouls * (this.player.stats.soulBonus || 1));
    this.soulsEarned = souls;
    Meta.addSouls(souls);
    setTimeout(() => {
      this._doFade(1, () => {
        this.state = STATE.GAME_OVER;
        this._doFade(-1, null);
        Logger.download();
      });
    }, 500);
  }

  _updateShop(dt) {
    const mx = Input.mouse.x, my = Input.mouse.y;
    const lp = Input._leftJustPressed;
    // En coop, seul l'hôte peut acheter et quitter
    const canAct = !this.coopMode || Net.isHost;
    const itemW = 210, itemH = 240, gap = 36;
    const totalW = this._shopItems.length * itemW + (this._shopItems.length - 1) * gap;
    const startX = W/2 - totalW/2;
    const itemY = 210;
    for (let i = 0; i < this._shopItems.length; i++) {
      const item = this._shopItems[i];
      if (this._shopBought.has(i)) continue;
      const ix = startX + i * (itemW + gap);
      const btnY = itemY + itemH - 56;
      if (canAct && hitTest(mx, my, ix + 10, btnY, itemW - 20, 44) && lp) {
        const souls = Meta.getSouls();
        if (souls >= item.cost) {
          Meta.addSouls(-item.cost);
          item.apply(this.player, this);
          this._shopBought.add(i);
          this._shake(4, 0.18);
          Particles.burst(W/2, H/2 + 50, 20, '#c0a040', 160, 3);
          Input._leftJustPressed = false;
          Logger.log('SYSTEM', `Bought ${item.label} for ${item.cost} souls`);
        }
      }
    }
    // Exit button (hôte uniquement en coop)
    const ex = W/2 - 80, ey = H - 110;
    if (canAct && hitTest(mx, my, ex, ey, 160, 46) && lp) {
      Input._leftJustPressed = false;
      if (this.coopMode && Net.isHost) Net.send({ type:'shop_exit' });
      this._advanceToNextRoom();
    }
  }

  // ── DRAW ─────────────────────────────────────────────────
  draw() {
    const ctx=this.ctx;
    ctx.save(); ctx.translate(this.shakeX, this.shakeY);

    if      (this.state===STATE.LOBBY)     this._drawLobby(ctx);
    else if (this.state===STATE.MENU)      this._drawMenu(ctx);
    else if (this.state===STATE.GRIMOIRE && this.grimoireScreen) this.grimoireScreen.draw(ctx);
    else if (this.state===STATE.GUIDE    && this.guideScreen)    this.guideScreen.draw(ctx);
    else if (this.state===STATE.UPGRADES && this.upgradeScreen)  this.upgradeScreen.draw(ctx);
    else if (this.state===STATE.PLAYING||this.state===STATE.TRANSITION) this._drawPlaying(ctx);
    else if (this.state===STATE.BOON_PICK) { this._drawPlaying(ctx); this.boonPicker.draw(ctx); }
    else if (this.state===STATE.FATE_CHOICE) { this._drawPlaying(ctx); this._drawFateChoice(ctx); }
    else if (this.state===STATE.SHOP)        this._drawShop(ctx);
    else if (this.state===STATE.GAME_OVER) this._drawGameOver(ctx);
    else if (this.state===STATE.WIN)       this._drawWin(ctx);

    ctx.restore();
    if (this.fade>0) { ctx.fillStyle=`rgba(0,0,0,${this.fade})`; ctx.fillRect(0,0,W,H); }
    Logger.drawOverlay(this.ctx);
    // Depth milestone flash
    if (this._depthMilestoneT > 0 && (this.state === STATE.PLAYING || this.state === STATE.FATE_CHOICE)) {
      const alpha = Math.min(1, this._depthMilestoneT) * Math.min(1, (2.5 - this._depthMilestoneT) * 4);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = '#000'; ctx.fillRect(0, H/2 - 40, W, 80);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#8af'; ctx.shadowBlur = 20;
      ctx.font = 'bold 28px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(this._depthMilestone, W/2, H/2 + 10);
      ctx.restore();
    }
    // Version badge — toujours visible en haut à gauche
    this.ctx.save();
    this.ctx.textAlign = 'left';
    this.ctx.font = '10px monospace';
    this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    this.ctx.fillText(VERSION, 8, 14);
    this.ctx.restore();
  }

  _handleMenuClick(mx, my) {
    // Dispatch click to open screens or sub-screens
    if (this.state===STATE.GRIMOIRE && this.grimoireScreen) {
      this.grimoireScreen.handleMouse(mx,my,true); return;
    }
    if (this.state===STATE.GUIDE && this.guideScreen) {
      this.guideScreen.handleMouse(mx,my,true); return;
    }
    if (this.state===STATE.UPGRADES && this.upgradeScreen) {
      this.upgradeScreen.handleMouse(mx,my,true); return;
    }
  }

  _drawPlaying(ctx) {
    ctx.fillStyle='#05030f'; ctx.fillRect(0,0,W,H);
    this.room.draw(ctx);
    Particles.draw(ctx);
    this.player.draw(ctx);
    // Draw P2
    if (this.coopMode && Net.isHost && this.player2) {
      // Draw P2 with a tint
      ctx.save(); ctx.globalAlpha = 0.9;
      this.player2.draw(ctx);
      // P2 label
      ctx.fillStyle='#f8a'; ctx.font='bold 11px Georgia'; ctx.textAlign='center';
      ctx.fillText(this.p2Name, this.player2.pos.x, this.player2.pos.y - this.player2.r - 10);
      ctx.restore();
    }
    if (this.coopMode && !Net.isHost && this._remoteP1) {
      // Draw host player as ghost
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#7af';
      ctx.beginPath(); ctx.arc(this._remoteP1.x, this._remoteP1.y, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#7af'; ctx.font='bold 11px Georgia'; ctx.textAlign='center';
      ctx.fillText(this.p1Name, this._remoteP1.x, this._remoteP1.y - 22);
      ctx.restore();
    }
    this.player.drawHUD(ctx);
    // ── Revive progress bar ──────────────────────────────────
    if (this.coopMode && this._reviveTimer > 0) {
      const pct = this._reviveTimer / 3.0;
      const bw = 160, bh = 12;
      const bx = W/2 - bw/2, by = H/2 + 55;
      ctx.save();
      ctx.fillStyle = '#111'; _roundRect(ctx, bx-2, by-2, bw+4, bh+4, 4); ctx.fill();
      ctx.fillStyle = `hsl(${120*pct}, 90%, 55%)`;
      _roundRect(ctx, bx, by, bw * pct, bh, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('⟳ Ressusciter…', W/2, by - 6);
      ctx.restore();
    }
    // Spectator banner
    if (this._spectatorMode) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#000';
      ctx.fillRect(PLAY.x, PLAY.y + PLAY.h/2 - 22, PLAY.w, 44);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f88'; ctx.font = 'bold 20px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('⚰ SPECTATEUR — Votre coéquipier continue...', W/2, PLAY.y + PLAY.h/2 + 7);
      ctx.restore();
    }
    this._drawDepthHUD(ctx);
    this._drawBoonIcons(ctx);
    this._drawSynergyIcons(ctx);
    this._drawControls(ctx);
    // Boss HP bar at top
    this._drawBossHPBar(ctx);
    // Boss entrance animation overlay
    if (this._bossIntroTimer > 0) this._drawBossIntro(ctx);
    // Damage flash
    if (this._dmgFlashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = this._dmgFlashTimer * 2.0 * 0.25;
      ctx.fillStyle = '#f00';
      ctx.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
      ctx.restore();
    }
  }

  _drawDepthHUD(ctx) {
    const isBoss=this.depth%5===0, floor=Math.ceil(this.depth/5);
    ctx.textAlign='right';
    ctx.fillStyle='#ff8'; ctx.font='bold 15px Georgia';
    ctx.fillText(`Profondeur ${this.depth}`, W-20, 30);
    ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font='10px Georgia'; ctx.textAlign='right';
    ctx.fillText(`seed #${this.runSeed}`, W-20, 48);
    ctx.fillStyle='#cca'; ctx.font='12px Georgia';
    ctx.fillText(isBoss?'⚠ BOSS ⚠':`Étage ${floor} · Salle ${this.depth}`, W-20, 66);
    const alive=this.room.enemies.filter(e=>!e.dead).length;
    ctx.fillStyle=alive>0?'#f44':'#4f4';
    ctx.fillText(alive>0?`${alive} ennemi${alive>1?'s':''} restant${alive>1?'s':''}`:'Dégagée — passez la porte', W-20, 84);
    // Souls display — bottom-right corner
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, W-130, H-38, 118, 26, 6); ctx.fill();
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 13px Georgia';
    ctx.fillText(`💎 ${Meta.getSouls()} âmes`, W-14, H-20);
    ctx.restore();

    // Phase infinie (au-delà de depth 15)
    if (this.depth > 15) {
      const phase = this.depth <= 30 ? 'TOURMENT' : this.depth <= 50 ? 'SUPPLICE' : '☠ CHAOS';
      ctx.fillStyle = this.depth > 50 ? '#f04' : this.depth > 30 ? '#f80' : '#c060ff';
      ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'right';
      ctx.fillText(`⚠ ${phase}`, W-20, 118);
    }

    // Traque (performance mult)
    if (this.perfMult > 1.05) {
      const p = this.perfMult;
      ctx.fillStyle = p >= 2.0 ? '#f04' : p >= 1.5 ? '#f80' : '#ffa0';
      ctx.font = '10px Georgia'; ctx.textAlign = 'right';
      ctx.fillText(`⚡ Traque ×${p.toFixed(1)}`, W-20, 130);
    }

    // Floor progress bar (progress within 5-room cycle)
    const cyclePos = this.depth % 5;
    const isBossNext = (this.depth + 1) % 5 === 0;
    const nextBossIn = 5 - cyclePos;

    // Mini progress pips
    const pipCount = 5, pipW = 18, pipH = 8, pipGap = 5;
    const pipStartX = W - 20 - (pipCount*(pipW+pipGap));
    for (let p = 0; p < pipCount; p++) {
      const filled = p < cyclePos;
      const isBossPos = p === 4;
      ctx.fillStyle = filled ? (isBossPos ? '#f80' : '#a070ff') : '#1a1535';
      _roundRect(ctx, pipStartX + p*(pipW+pipGap), 56, pipW, pipH, 3);
      ctx.fill();
      if (!filled) {
        ctx.strokeStyle = isBossPos ? '#604' : '#302855';
        ctx.lineWidth = 1;
        _roundRect(ctx, pipStartX + p*(pipW+pipGap), 56, pipW, pipH, 3);
        ctx.stroke();
      }
    }

    // Next boss label
    if (isBossNext) {
      const bossNum = Math.ceil((this.depth + 1) / 5);
      const isMini = bossNum % 2 === 1;
      ctx.fillStyle = isMini ? '#f060a0' : '#f80';
      ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'right';
      ctx.fillText(isMini ? '⚔ MINI BOSS' : '☠ MAXI BOSS', W-20, 78);
    }

    // Room clear flash
    if (this.room?.cleared && !this.room?.isBoss) {
      const t = Date.now() % 2000;
      if (t < 800) {
        ctx.globalAlpha = Math.sin(t / 800 * Math.PI) * 0.8;
        ctx.fillStyle = '#5f5'; ctx.font = 'bold 20px Georgia'; ctx.textAlign = 'center';
        ctx.fillText('SALLE DÉGAGÉE !', W/2, PLAY.y + 30);
        ctx.globalAlpha = 1;
      }
    }
  }

  _drawBoonIcons(ctx) {
    if (!this.player||this.player.boonIds.length===0) return;
    const total=this.player.boonIds.length;
    let x=W/2-(total*36)/2;
    for (const id of this.player.boonIds) {
      const b=ALL_BOONS.find(b=>b.id===id); if(!b) continue;
      ctx.fillStyle=b.color||'#7af'; ctx.font='20px serif'; ctx.textAlign='center';
      ctx.fillText(b.icon, x+16, 32); x+=36;
    }
  }

  _drawSynergyIcons(ctx) {
    if (!this.player||this.player.synergyIds.length===0) return;
    ctx.textAlign='center';
    let x=W/2-(this.player.synergyIds.length*32)/2;
    for (const id of this.player.synergyIds) {
      const s=SYNERGIES.find(s=>s.id===id); if(!s) continue;
      ctx.font='16px serif'; ctx.fillStyle='#f8a';
      ctx.fillText(s.icon, x+12, 50); x+=32;
    }
  }

  _drawControls(ctx) {
    ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font='11px Georgia'; ctx.textAlign='left';
    ctx.fillText('ZQSD/WASD: Déplacer  |  Clic gauche: Mêlée  |  Clic droit: Sort  |  Shift: Dash  |  E: Blast  |  F1: Journal  |  F2: Log', 20, H-15);
  }

  _drawBossHPBar(ctx) {
    if (!this.room) return;
    const boss = this.room.enemies.find(e => e.isBoss && !e.dead);
    if (!boss) return;
    const barW = 560, barH = 18, bx = W/2 - barW/2, by = 14;
    // Panel background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    _roundRect(ctx, bx - 10, by - 8, barW + 20, barH + 44, 6);
    ctx.fill();
    ctx.strokeStyle = '#503010'; ctx.lineWidth = 1;
    _roundRect(ctx, bx - 10, by - 8, barW + 20, barH + 44, 6);
    ctx.stroke();
    // HP bar
    ctx.fillStyle = '#1a0505'; ctx.fillRect(bx, by, barW, barH);
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    const hpColor = ratio > 0.6 ? '#c06030' : ratio > 0.3 ? '#d04020' : '#f00';
    ctx.fillStyle = hpColor; ctx.fillRect(bx, by, barW * ratio, barH);
    // Phase dividers
    for (let i = 1; i < 3; i++) {
      const mx2 = bx + barW * (i / 3);
      ctx.fillStyle = 'rgba(255,200,0,0.5)'; ctx.fillRect(mx2 - 1, by, 2, barH);
    }
    // Armor segments on bar
    if (boss.maxArmorSegs > 0) {
      for (let i = 0; i < boss.maxArmorSegs; i++) {
        const ax2 = bx + barW * (i + 0.5) / boss.maxArmorSegs;
        ctx.fillStyle = i < boss.armorSegs ? '#8cf' : 'rgba(100,180,210,0.2)';
        ctx.beginPath(); ctx.arc(ax2, by + barH + 5, 5, 0, TAU); ctx.fill();
      }
    }
    // Border
    ctx.strokeStyle = '#a06020'; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, barW, barH);
    // Boss name
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
    ctx.shadowColor = '#806020'; ctx.shadowBlur = 8;
    ctx.fillText(boss.name || 'BOSS', W/2, by + barH + (boss.maxArmorSegs > 0 ? 22 : 16));
    ctx.shadowBlur = 0;
    // Phase
    const phase = boss.bossPhase || 1;
    ctx.fillStyle = phase >= 3 ? '#f04' : phase >= 2 ? '#f80' : '#888';
    ctx.font = '11px Georgia';
    ctx.fillText(`Phase ${phase}`, W/2, by + barH + (boss.maxArmorSegs > 0 ? 36 : 30));
  }

  _drawBossIntro(ctx) {
    const t = this._bossIntroTimer;
    const totalDur = 2.5;
    let alpha = t > totalDur - 0.5 ? (totalDur - t) * 2 : (t < 0.5 ? t * 2 : 1.0);
    alpha = Math.max(0, Math.min(1, alpha));
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, H/2 - 90, W, 180);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a00'; ctx.font = 'bold 13px Georgia';
    ctx.fillText('⚔  B O S S  ⚔', W/2, H/2 - 40);
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 46px Georgia';
    ctx.shadowColor = '#f80'; ctx.shadowBlur = 35;
    ctx.fillText(this._bossIntroName, W/2, H/2 + 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200,180,120,0.65)'; ctx.font = 'italic 14px Georgia';
    ctx.fillText('Préparez-vous au combat...', W/2, H/2 + 50);
    ctx.restore();
  }

  _drawFateChoice(ctx) {
    const t = this._fateAnimTimer;
    const guardActive = this._fateGuardTimer > 0;

    const flashDur   = 0.65;
    const flashAlpha = guardActive
      ? Math.min(1, this._fateGuardTimer / 0.3)
      : (t < flashDur ? 1 - (t / flashDur) : 0);

    const overlayA = guardActive ? 0.5 : Math.min(0.82, 0.5 + t * 0.6);
    ctx.fillStyle = `rgba(0,0,0,${overlayA})`; ctx.fillRect(0, 0, W, H);

    if (flashAlpha > 0.01) {
      ctx.save(); ctx.globalAlpha = flashAlpha;
      ctx.textAlign = 'center';
      const flashScale = 1.0 + 0.12 * Math.sin(flashAlpha * Math.PI);
      ctx.save();
      ctx.translate(W/2, H/2 - 10); ctx.scale(flashScale, flashScale);
      ctx.fillStyle = '#ffe066';
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 60;
      ctx.font = 'bold 56px Georgia';
      ctx.fillText('SALLE DÉGAGÉE', 0, 0);
      ctx.shadowBlur = 0; ctx.restore();
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.55})`;
      ctx.font = '16px Georgia';
      ctx.fillText('— Préparez-vous pour le prochain choix —', W/2, H/2 + 42);
      ctx.restore();
    }

    const cardSlideStart = 0.1;
    if (guardActive || t < cardSlideStart) return;
    const slideDt = t - cardSlideStart;

    const easeOutBack = (x) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    };

    const cardW = 220, cardH = 230, gap = 40;
    const totalW = 3 * cardW + 2 * gap;
    const startX = W/2 - totalW/2;
    const cardY   = H/2 - cardH/2 + 24;
    const mx = Input.mouse.x, my = Input.mouse.y;

    // Title
    const titleA = Math.min(1, (slideDt - 0.0) / 0.35);
    if (titleA > 0) {
      ctx.save(); ctx.globalAlpha = titleA;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8'; ctx.font = 'bold 28px Georgia';
      ctx.shadowColor = '#c0a040'; ctx.shadowBlur = 20;
      ctx.fillText('CHOISISSEZ VOTRE DESTIN', W/2, cardY - 56);
      ctx.shadowBlur = 0;
      // Coop: show who has voted
      if (this.coopMode && slideDt > 0.5) {
        const p1n = Net.isHost ? (this.p1Name||'Hôte') : (this.p2Name||'Hôte');
        const p2n = Net.isHost ? (this.p2Name||'Client') : (this.p1Name||'Client');
        const myVote  = this._myFateVote;
        const p2Vote  = this._p2FateVote;
        const myReady  = myVote !== -1 ? ` ✓ (${this._fateOptions[myVote]?.label||''})` : ' — en attente…';
        const p2Ready  = p2Vote !== -1 ? ` ✓ (${this._fateOptions[p2Vote]?.label||''})` : ' — en attente…';
        ctx.fillStyle = '#8af'; ctx.font = '12px Georgia';
        ctx.fillText(`${Net.isHost?'👑':' '}${p1n}${Net.isHost?myReady:p2Ready}   |   ${Net.isHost?' ':'👑'}${p2n}${Net.isHost?p2Ready:myReady}`, W/2, cardY - 28);
      } else if (!this.coopMode) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = 'italic 13px Georgia';
        ctx.fillText('Soyez sage, mortel — chaque choix forge votre légende.', W/2, cardY - 28);
      }
      ctx.restore();
    }

    const cardColors = ['#1e1240', '#0d2020', '#1e1208'];
    const bandColors  = ['#5533cc', '#119955', '#bb6600'];

    // Roulette: compute which card is "highlighted"
    let rouletteHighlight = -1;
    if (this._fateRoulette && this._fateRouletteTimer > 0) {
      const prog = 1 - (this._fateRouletteTimer / 2.2);
      // Bounce between the two voted options, slowing down
      const speed = Math.max(2, 18 * (1 - prog));
      const bounceIdx = Math.floor(Date.now() / (1000 / speed)) % 2;
      const opts = [this._myFateVote, this._p2FateVote];
      if (this._fateRouletteTimer < 0.4) {
        rouletteHighlight = this._fateRouletteWinner;
      } else {
        rouletteHighlight = opts[bounceIdx];
      }
    }

    for (let i = 0; i < this._fateOptions.length; i++) {
      const opt = this._fateOptions[i];
      const slideDelay = 0.08 + i * 0.12;
      const rawP = Math.min(1, Math.max(0, (slideDt - slideDelay) / 0.44));
      const p = easeOutBack(rawP);

      const cx = startX + i * (cardW + gap);
      const drawY = cardY + (1 - p) * 90;
      const alpha = Math.min(1, rawP * 2.5);

      ctx.save(); ctx.globalAlpha = alpha;

      const hov = rawP >= 1 && this._myFateVote === -1 && hitTest(mx, my, cx, cardY, cardW, cardH);
      const isRoulette = rouletteHighlight === i;
      const isMyVote   = this._myFateVote === i;
      const isP2Vote   = this._p2FateVote === i;
      const scale = (hov || isRoulette) ? 1.06 : (isMyVote ? 1.03 : 1.0);

      ctx.save();
      ctx.translate(cx + cardW/2, drawY + cardH/2);
      ctx.scale(scale, scale);
      const lx = -cardW/2, ly = -cardH/2;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      _roundRect(ctx, lx + 5, ly + 8, cardW, cardH, 14); ctx.fill();

      // Card body
      if (hov || isRoulette) { ctx.shadowColor = bandColors[i]; ctx.shadowBlur = 32; }
      ctx.fillStyle = cardColors[i];
      _roundRect(ctx, lx, ly, cardW, cardH, 14); ctx.fill();
      ctx.shadowBlur = 0;

      // Top band
      ctx.save();
      ctx.beginPath(); _roundRect(ctx, lx, ly, cardW, 10, 14); ctx.clip();
      ctx.fillStyle = bandColors[i]; ctx.fillRect(lx, ly, cardW, 10);
      ctx.restore();

      // Border
      ctx.strokeStyle = (hov || isRoulette) ? '#fff' : (isMyVote ? '#ffdd44' : `rgba(255,255,255,0.1)`);
      ctx.lineWidth = (hov || isRoulette || isMyVote) ? 2.5 : 1.2;
      _roundRect(ctx, lx, ly, cardW, cardH, 14); ctx.stroke();

      // Icon
      ctx.font = '52px serif'; ctx.textAlign = 'center';
      ctx.fillText(opt.icon, 0, ly + 76);

      // Label
      ctx.fillStyle = '#fff'; ctx.font = 'bold 17px Georgia';
      ctx.fillText(opt.label, 0, ly + 112);

      // Key hint
      ctx.fillStyle = this._myFateVote === -1 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`[${i+1}]`, 0, ly + 130);

      // Description
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '12px Georgia';
      const words = opt.desc.split(' ');
      let line = '', lineY2 = ly + 152;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > cardW - 32) {
          ctx.fillText(line, 0, lineY2); line = word; lineY2 += 17;
        } else { line = test; }
      }
      if (line) ctx.fillText(line, 0, lineY2);

      // Vote badges (coop)
      if (this.coopMode) {
        let badgeY = ly + cardH - 48;
        if (isMyVote) {
          ctx.fillStyle = '#ffdd44';
          _roundRect(ctx, lx + 10, badgeY, cardW - 20, 20, 5); ctx.fill();
          ctx.fillStyle = '#000'; ctx.font = 'bold 11px Georgia';
          ctx.fillText(`${Net.isHost ? (this.p1Name||'Hôte') : (this.p2Name||'Client')} ✓`, 0, badgeY + 14);
          badgeY += 22;
        }
        if (isP2Vote) {
          ctx.fillStyle = '#44aaff';
          _roundRect(ctx, lx + 10, badgeY, cardW - 20, 20, 5); ctx.fill();
          ctx.fillStyle = '#000'; ctx.font = 'bold 11px Georgia';
          ctx.fillText(`${Net.isHost ? (this.p2Name||'Client') : (this.p1Name||'Hôte')} ✓`, 0, badgeY + 14);
        }
      } else if (hov) {
        ctx.fillStyle = bandColors[i];
        _roundRect(ctx, lx + 16, ly + cardH - 44, cardW - 32, 30, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Georgia';
        ctx.fillText('▶  CHOISIR', 0, ly + cardH - 23);
      }

      ctx.restore(); ctx.restore();
    }

    // Countdown bar
    if (this._fateVoteTimer >= 0 && !this._fateRoulette && slideDt > 0.5) {
      const pct = this._fateVoteTimer / 10;
      const barW = 400, barH = 10, barX = W/2 - barW/2, barY = cardY + cardH + 24;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      _roundRect(ctx, barX, barY, barW, barH, 5); ctx.fill();
      ctx.fillStyle = pct > 0.4 ? '#ff8' : '#f44';
      _roundRect(ctx, barX, barY, barW * pct, barH, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(`⚔ Désaccord ! Roulette dans ${Math.ceil(this._fateVoteTimer)}s…`, W/2, barY + 28);
    }

    // Roulette message
    if (this._fateRoulette) {
      const pulse = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ff8'; ctx.font = 'bold 18px Georgia'; ctx.textAlign = 'center';
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 20;
      ctx.fillText('🎲 LA ROULETTE DU DESTIN TOURNE…', W/2, cardY + cardH + 36);
      ctx.shadowBlur = 0; ctx.restore();
    }

    // Kill streak
    if (this._killStreak >= 2 && slideDt > 0.5) {
      ctx.fillStyle = '#ff8'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(`🔥 Série : ${this._killStreak} éliminations`, W/2, H - 72);
    }

    // Coop: waiting message (uniquement si hôte n'est pas spectateur)
    if (this.coopMode && !Net.isHost && !this._hostIsSpectator && slideDt > 0.9 && this._myFateVote !== -1 && this._p2FateVote === -1) {
      const pulse = 0.6 + Math.sin(Date.now() * 0.003) * 0.4;
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.fillStyle = '#8af'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('⏳ En attente du vote de l\'hôte…', W/2, H - 48);
      ctx.restore();
    }
  }

  _drawShop(ctx) {
    ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, W, H);
    // Animated bg sparks
    if (Math.random() < 0.04) Particles.sparks(rand(0,W), rand(H*0.3,H*0.8), 1, '#a08020');
    Particles.update(0.016); Particles.draw(ctx);
    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c0a040'; ctx.font = 'bold 34px Georgia';
    ctx.shadowColor = '#806020'; ctx.shadowBlur = 22;
    ctx.fillText('🏛 PUITS DE CHARON', W/2, 108);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,200,100,0.5)'; ctx.font = 'italic 13px Georgia';
    ctx.fillText('"Toute âme a un prix, même la vôtre."  — Charon', W/2, 138);
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 15px Georgia';
    ctx.fillText(`💎 ${Meta.getSouls()} âmes disponibles`, W/2, 168);
    ctx.strokeStyle = 'rgba(192,160,64,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W/2-300, 182); ctx.lineTo(W/2+300, 182); ctx.stroke();
    // Items
    const itemW = 210, itemH = 240, gap = 36;
    const totalW = this._shopItems.length * itemW + (this._shopItems.length - 1) * gap;
    const startX = W/2 - totalW/2;
    const itemY = 200;
    const mx = Input.mouse.x, my = Input.mouse.y;
    for (let i = 0; i < this._shopItems.length; i++) {
      const item = this._shopItems[i];
      const ix = startX + i * (itemW + gap);
      const bought = this._shopBought.has(i);
      const canAfford = Meta.getSouls() >= item.cost;
      const cardHov = hitTest(mx, my, ix, itemY, itemW, itemH);
      ctx.globalAlpha = bought ? 0.4 : 1;
      ctx.fillStyle = bought ? '#0a0a14' : (cardHov ? '#1e1608' : '#100e06');
      _roundRect(ctx, ix, itemY, itemW, itemH, 10); ctx.fill();
      ctx.strokeStyle = bought ? '#2a2a2a' : (cardHov ? '#c0a040' : '#302010');
      ctx.lineWidth = cardHov ? 2 : 1;
      _roundRect(ctx, ix, itemY, itemW, itemH, 10); ctx.stroke();
      ctx.font = '44px serif'; ctx.textAlign = 'center';
      ctx.fillText(item.icon, ix + itemW/2, itemY + 60);
      ctx.fillStyle = '#ff8'; ctx.font = 'bold 15px Georgia';
      ctx.fillText(item.label, ix + itemW/2, itemY + 90);
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '12px Georgia';
      ctx.fillText(item.desc, ix + itemW/2, itemY + 115);
      ctx.fillStyle = bought ? '#555' : (canAfford ? '#ff8' : '#844');
      ctx.font = 'bold 13px Georgia';
      ctx.fillText(bought ? '✓ Acheté' : `Coût : ${item.cost} âmes`, ix + itemW/2, itemY + 143);
      if (!bought) {
        const btnY = itemY + itemH - 56;
        const btnHov = hitTest(mx, my, ix + 10, btnY, itemW - 20, 42);
        ctx.fillStyle = canAfford ? (btnHov ? '#604010' : '#3a2a08') : '#141414';
        _roundRect(ctx, ix + 10, btnY, itemW - 20, 42, 8); ctx.fill();
        ctx.strokeStyle = canAfford ? '#c0a040' : '#282828'; ctx.lineWidth = 1;
        _roundRect(ctx, ix + 10, btnY, itemW - 20, 42, 8); ctx.stroke();
        ctx.fillStyle = canAfford ? '#ff8' : '#444';
        ctx.font = `bold ${canAfford ? 13 : 10}px Georgia`;
        ctx.fillText(canAfford ? 'ACHETER' : 'ÂMES INSUFFISANTES', ix + itemW/2, btnY + 27);
      }
      ctx.globalAlpha = 1;
    }
    // Exit button
    const ex = W/2 - 80, ey = H - 110;
    const eHov = hitTest(mx, my, ex, ey, 160, 46);
    ctx.fillStyle = eHov ? '#502020' : '#1a0808';
    _roundRect(ctx, ex, ey, 160, 46, 10); ctx.fill();
    ctx.strokeStyle = eHov ? '#a04020' : '#401010'; ctx.lineWidth = 1.5;
    _roundRect(ctx, ex, ey, 160, 46, 10); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('⚔ Continuer', W/2, ey + 30);
  }

  _drawMenu(ctx) {
    ctx.fillStyle='#05030f'; ctx.fillRect(0,0,W,H);
    const t=Date.now()*0.001;
    for (let i=0;i<100;i++) {
      const sx=(Math.sin(i*1.3+t*0.1)*0.5+0.5)*W, sy=(Math.cos(i*2.1+t*0.07)*0.5+0.5)*H;
      ctx.fillStyle=`rgba(255,255,255,${0.3+Math.sin(i+t)*0.2})`;
      ctx.beginPath(); ctx.arc(sx,sy,0.5+Math.sin(i+t*2)*0.3,0,TAU); ctx.fill();
    }
    ctx.shadowColor='#a07020'; ctx.shadowBlur=40;
    ctx.fillStyle='#ff8'; ctx.font='bold 68px Georgia'; ctx.textAlign='center';
    ctx.fillText('UNDERWORLD', W/2, 170); ctx.shadowBlur=0;
    ctx.fillStyle='#c0a040'; ctx.font='bold 18px Georgia';
    ctx.fillText('Un roguelite des enfers', W/2, 205);

    // Menu buttons
    const btnW=260, btnH=52, startY=270, gap=16;
    const mx=Input.mouse.x, my=Input.mouse.y;
    for (let i=0;i<this._menuButtons.length;i++) {
      const btn=this._menuButtons[i];
      const bx=W/2-btnW/2, by=startY+i*(btnH+gap);
      const hov=hitTest(mx,my,bx,by,btnW,btnH);
      if (hov) ctx.shadowBlur=15, ctx.shadowColor=btn.color;
      ctx.fillStyle=hov?btn.color+'ff':btn.color+'cc';
      _roundRect(ctx,bx,by,btnW,btnH,10); ctx.fill();
      ctx.strokeStyle=hov?'#ffffff88':'#ffffff33'; ctx.lineWidth=1.5;
      _roundRect(ctx,bx,by,btnW,btnH,10); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.fillStyle='#fff'; ctx.font=`bold 18px Georgia`; ctx.textAlign='center';
      ctx.fillText(btn.label, W/2, by+btnH/2+6);

      // Handle click
      if (hov && Input._leftJustPressed) {
        Input._leftJustPressed=false;
        if (btn.action==='play')     this._doFade(1,()=>{ this.startRun(); this._doFade(-1,null); });
        if (btn.action==='grimoire') this._openGrimoire();
        if (btn.action==='guide')    this._openGuide();
        if (btn.action==='upgrades') this._openUpgrades();
        if (btn.action==='coop')     this._openLobby();
      }
    }

    // Soul counter — bas à droite
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, W-144, H-42, 132, 28, 6); ctx.fill();
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 13px Georgia';
    ctx.fillText(`💎 ${Meta.getSouls()} âmes`, W-14, H-23);
    ctx.restore();

    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='13px Georgia';
    ctx.fillText('15 salles  ·  3 boss  ·  20 dons  ·  8 synergies  ·  7 améliorations permanentes', W/2, H-50);
    ctx.fillStyle='rgba(200,180,120,0.5)'; ctx.font='italic 12px Georgia';
    ctx.fillText('"Fuis les enfers ou rejoins les ombres pour l\'éternité."', W/2, H-28);
  }

  _drawGameOver(ctx) {
    ctx.fillStyle='#05030f'; ctx.fillRect(0,0,W,H);
    // Animated background particles
    if (Math.random()<0.04) Particles.sparks(rand(0,W), rand(H/2,H), 1, '#600');
    Particles.update(0.016); Particles.draw(ctx);
    ctx.shadowColor='#800'; ctx.shadowBlur=50;
    ctx.fillStyle='#c03'; ctx.font='bold 60px Georgia'; ctx.textAlign='center';
    ctx.fillText('MORT', W/2, H/2-110); ctx.shadowBlur=0;
    ctx.fillStyle='#a0a0c0'; ctx.font='20px Georgia';
    ctx.fillText(`Profondeur : ${this.depth}  ·  Salles : ${this.roomsCleared}  ·  Dons : ${this.player?.boonIds.length||0}`, W/2, H/2-50);
    ctx.fillStyle='#ff8'; ctx.font='bold 20px Georgia';
    ctx.fillText(`+${this.soulsEarned} 💎 Âmes gagnées  (total : ${Meta.getSouls()})`, W/2, H/2-15);
    ctx.fillStyle='#604'; ctx.font='14px Georgia';
    ctx.fillText('"Reviens quand tu seras prêt."  — Hades', W/2, H/2+30);
    // Synergies this run
    if (this.player?.synergyIds?.length>0) {
      ctx.fillStyle='#f8a'; ctx.font='bold 13px Georgia';
      ctx.fillText(`Synergies débloquées : ${this.player.synergyIds.map(id=>SYNERGIES.find(s=>s.id===id)?.name||id).join(', ')}`, W/2, H/2+55);
    }
    // Boon summary
    if (this.player?.boonIds?.length > 0) {
      const icons = this.player.boonIds.map(id => ALL_BOONS.find(b=>b.id===id)?.icon||'?').slice(0,12);
      ctx.font = '20px serif'; ctx.textAlign = 'center';
      ctx.fillText(icons.join(' '), W/2, H/2+70);
    }
    ctx.fillStyle='#555'; ctx.font='12px Georgia';
    ctx.fillText('log.txt téléchargé · Dépensez vos âmes dans Améliorations', W/2, H/2+92);
    ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='11px Georgia';
    ctx.fillText(`Seed : #${this.runSeed}`, W/2, H/2+108);
    ctx.globalAlpha=0.6+Math.sin(Date.now()*0.003)*0.4;
    ctx.fillStyle='#fff'; ctx.shadowColor='#fff'; ctx.shadowBlur=8;
    ctx.font='bold 17px Georgia';
    ctx.fillText('[ ENTRÉE : Menu  ·  R : Rejouer ]', W/2, H/2+132);
    ctx.globalAlpha=1; ctx.shadowBlur=0;
  }

  _updateLobby(dt) {
    if (!this._lobbyListening) {
      this._lobbyListening = true;
      this._lobbyKeyHandler = (e) => {
        if (this.state !== STATE.LOBBY) return;
        if (this._lobbyNamePhase) {
          if (e.key === 'Backspace') { this._myName = this._myName.slice(0,-1); this._sendNameUpdate(); return; }
          if (e.key === 'Enter')     { this._confirmMyName(); return; }
          if (e.key === 'Escape')    { return; }
          if (e.key.length === 1 && this._myName.length < 16) { this._myName += e.key; this._sendNameUpdate(); }
        } else {
          if (e.key === 'Backspace') { this._lobbyInput = this._lobbyInput.slice(0,-1); return; }
          if (e.key === 'Escape') { this._lobbyInput=''; this._lobbyError=''; this.state=STATE.MENU; return; }
          if (e.key.length === 1) this._lobbyInput += e.key;
        }
      };
      window.addEventListener('keydown', this._lobbyKeyHandler);
    }
  }

  _sendNameUpdate() {
    Net.send({ type: 'name_update', name: this._myName });
  }

  _confirmMyName() {
    const name = this._myName.trim();
    if (!name) return;
    this._myNameReady = true;
    Net.send({ type: 'name_ready', name });
    if (Net.isHost) this._checkBothReady();
  }

  _checkBothReady() {
    if (!Net.isHost || !this._myNameReady || !this._p2NameReady) return;
    const seed = (Math.random() * 0x7FFFFFFF) >>> 0;
    this.p1Name = this._myName.trim() || 'Hôte';
    this.p2Name = this._p2Name.trim() || 'Client';
    Net.send({ type: 'start', seed, hostName: this.p1Name, clientName: this.p2Name });
    if (this._lobbyKeyHandler) { window.removeEventListener('keydown', this._lobbyKeyHandler); this._lobbyListening = false; }
    this._lobbyNamePhase = false;
    this._doFade(1, () => { this.startCoopRun(seed); this._doFade(-1, null); });
  }

  _drawNamePhase(ctx, mx, my) {
    const W2 = W/2, cardW = 320, cardH = 260, gap = 60;
    const leftX  = W2 - gap/2 - cardW;
    const rightX = W2 + gap/2;
    const cardY  = H/2 - cardH/2 - 20;

    // Titre
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 26px Georgia';
    ctx.shadowColor = '#c0a040'; ctx.shadowBlur = 18;
    ctx.fillText('ENTREZ VOS PSEUDOS', W2, cardY - 42);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '13px Georgia';
    ctx.fillText('Les deux joueurs doivent valider pour lancer la partie', W2, cardY - 16);

    const drawCard = (x, label, name, ready, isMe) => {
      // Fond carte
      ctx.fillStyle = ready ? 'rgba(20,60,20,0.9)' : (isMe ? 'rgba(20,20,50,0.9)' : 'rgba(10,10,30,0.7)');
      _roundRect(ctx, x, cardY, cardW, cardH, 14); ctx.fill();
      ctx.strokeStyle = ready ? '#4f4' : (isMe ? '#6060c0' : '#303060');
      ctx.lineWidth = ready ? 2.5 : 1.5;
      _roundRect(ctx, x, cardY, cardW, cardH, 14); ctx.stroke();

      // Bande couleur en haut
      ctx.save();
      ctx.beginPath(); _roundRect(ctx, x, cardY, cardW, 8, 14); ctx.clip();
      ctx.fillStyle = ready ? '#4f4' : (isMe ? '#6060ff' : '#404080');
      ctx.fillRect(x, cardY, cardW, 8);
      ctx.restore();

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = 'bold 11px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + cardW/2, cardY + 30);

      // Icône joueur
      ctx.font = '32px serif';
      ctx.fillText(isMe ? '🧑' : '👤', x + cardW/2, cardY + 76);

      // Nom (champ de saisie pour moi, texte pour l'autre)
      if (isMe) {
        const fieldY = cardY + 100;
        const focused = !this._myNameReady;
        ctx.fillStyle = focused ? 'rgba(60,60,120,0.8)' : 'rgba(20,40,20,0.8)';
        _roundRect(ctx, x + 20, fieldY, cardW - 40, 38, 8); ctx.fill();
        ctx.strokeStyle = focused ? '#8080ff' : '#4f4'; ctx.lineWidth = 1.5;
        _roundRect(ctx, x + 20, fieldY, cardW - 40, 38, 8); ctx.stroke();
        // Texte + curseur clignotant
        const displayName = name || '';
        const cursor = focused && Math.floor(Date.now() / 500) % 2 === 0 ? '|' : '';
        ctx.fillStyle = displayName ? '#fff' : '#666';
        ctx.font = '15px Georgia'; ctx.textAlign = 'center';
        ctx.fillText((displayName || 'Votre pseudo…') + cursor, x + cardW/2, fieldY + 24);
      } else {
        ctx.fillStyle = name ? '#fff' : 'rgba(255,255,255,0.3)';
        ctx.font = name ? 'bold 17px Georgia' : 'italic 13px Georgia';
        ctx.textAlign = 'center';
        const pulse = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
        if (!name) ctx.globalAlpha = 0.4 + pulse * 0.4;
        ctx.fillText(name || '⏳ En saisie…', x + cardW/2, cardY + 118);
        ctx.globalAlpha = 1;
      }

      // Statut
      if (ready) {
        ctx.fillStyle = '#4f4'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
        ctx.fillText('✓ PRÊT', x + cardW/2, cardY + 170);
      } else if (isMe) {
        // Bouton Valider
        const btnX = x + 40, btnY = cardY + 194, btnW2 = cardW - 80, btnH2 = 38;
        const hov = hitTest(mx, my, btnX, btnY, btnW2, btnH2);
        const canConfirm = this._myName.trim().length > 0;
        ctx.fillStyle = canConfirm ? (hov ? '#304830' : '#1e3020') : '#1a1a1a';
        _roundRect(ctx, btnX, btnY, btnW2, btnH2, 8); ctx.fill();
        ctx.strokeStyle = canConfirm ? '#6f4' : '#333'; ctx.lineWidth = 1.5;
        _roundRect(ctx, btnX, btnY, btnW2, btnH2, 8); ctx.stroke();
        ctx.fillStyle = canConfirm ? '#8f8' : '#555'; ctx.font = 'bold 14px Georgia';
        ctx.fillText('✓ Valider (Entrée)', x + cardW/2, btnY + 24);
        if (canConfirm && hov && Input._leftJustPressed) {
          Input._leftJustPressed = false;
          this._confirmMyName();
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '12px Georgia'; ctx.textAlign = 'center';
        ctx.fillText('En attente…', x + cardW/2, cardY + 170);
      }
    };

    if (Net.isHost) {
      drawCard(leftX,  '👑 HÔTE (toi)',   this._myName, this._myNameReady, true);
      drawCard(rightX, '🔗 CLIENT',        this._p2Name, this._p2NameReady, false);
    } else {
      drawCard(leftX,  '👑 HÔTE',          this._p2Name, this._p2NameReady, false);
      drawCard(rightX, '🔗 CLIENT (toi)',  this._myName, this._myNameReady, true);
    }

    // Message "les deux sont prêts"
    if (this._myNameReady && this._p2NameReady) {
      const pulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ff8'; ctx.font = 'bold 20px Georgia'; ctx.textAlign = 'center';
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 20;
      ctx.fillText('⚔  Les deux joueurs sont prêts — la partie démarre !', W2, cardY + cardH + 46);
      ctx.shadowBlur = 0; ctx.restore();
    } else if (Net.isHost && !this._myNameReady && !this._p2NameReady) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '12px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('Les deux joueurs doivent valider leur pseudo pour commencer', W2, cardY + cardH + 36);
    }
  }

  _drawLobby(ctx) {
    ctx.fillStyle = '#05030f'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 32px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('🌐 MODE CO-OP', W/2, 110);
    ctx.fillStyle = '#a0a0c0'; ctx.font = '13px Georgia';
    ctx.fillText('L\'hôte contrôle la simulation — ×2.5 difficulté à deux', W/2, 142);

    const mx = Input.mouse.x, my = Input.mouse.y;

    // ── ÉTAT : saisie des pseudos ─────────────────────────────
    if (this._lobbyNamePhase) {
      this._drawNamePhase(ctx, mx, my);
      return;
    }

    // ── ÉTAT : client en cours de connexion / connecté ───────
    if (this._lobbyJoining) {
      const pulse = 0.6 + Math.sin(Date.now() * 0.004) * 0.4;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = this._lobbyError.startsWith('✓') ? '#4f4' : '#ff8';
      ctx.font = 'bold 22px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(this._lobbyError || 'Connexion en cours…', W/2, H/2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#555'; ctx.font = '12px Georgia';
      ctx.fillText('La partie démarre automatiquement quand l\'hôte est prêt.', W/2, H/2 + 36);
      // Annuler
      const cx2=W/2-60, cy2=H/2+70;
      const ch = hitTest(mx,my,cx2,cy2,120,32);
      ctx.fillStyle = ch ? '#502020' : '#2a1010'; _roundRect(ctx,cx2,cy2,120,32,6); ctx.fill();
      ctx.fillStyle='#f88'; ctx.font='12px Georgia'; ctx.textAlign='center';
      ctx.fillText('Annuler', W/2, cy2+21);
      if (ch && Input._leftJustPressed) {
        Input._leftJustPressed=false;
        Net.disconnect(); this._lobbyJoining=false; this._lobbyError='';
      }
      return;
    }

    // ── ÉTAT : hôte en attente de joueur ─────────────────────
    if (this._lobbyWaiting) {
      ctx.fillStyle = '#4f4'; ctx.font = 'bold 18px Georgia'; ctx.textAlign='center';
      ctx.fillText('Partage ce lien à ton ami :', W/2, 210);

      // Affiche le code en petit (UUID trop long pour 48px)
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      _roundRect(ctx, W/2-340, 225, 680, 36, 6); ctx.fill();
      ctx.fillStyle = '#adf'; ctx.font = '14px monospace'; ctx.textAlign='center';
      const shortLink = `${location.href.split('?')[0]}?join=${this._lobbyCode}`;
      ctx.fillText(shortLink.length > 80 ? shortLink.slice(0,80)+'…' : shortLink, W/2, 248);

      // Bouton copier
      const cpx=W/2-120, cpy=272;
      const cpH = hitTest(mx,my,cpx,cpy,240,44);
      ctx.fillStyle = this._lobbyCopied ? '#1a4020' : (cpH ? '#1a3050' : '#101828');
      _roundRect(ctx,cpx,cpy,240,44,10); ctx.fill();
      ctx.strokeStyle = this._lobbyCopied ? '#4f4' : '#4080ff';
      ctx.lineWidth=1.5; _roundRect(ctx,cpx,cpy,240,44,10); ctx.stroke();
      ctx.fillStyle = this._lobbyCopied ? '#4f4' : '#fff';
      ctx.font = 'bold 15px Georgia'; ctx.textAlign='center';
      ctx.fillText(this._lobbyCopied ? '✓ Copié !' : '📋 Copier le lien d\'invitation', W/2, cpy+28);
      if (cpH && Input._leftJustPressed) {
        Input._leftJustPressed=false;
        navigator.clipboard.writeText(shortLink).then(() => {
          this._lobbyCopied=true; setTimeout(()=>{ this._lobbyCopied=false; },2500);
        });
      }

      ctx.fillStyle = '#888'; ctx.font = '12px Georgia'; ctx.textAlign='center';
      ctx.fillText('Ton ami clique le lien → la partie démarre automatiquement', W/2, 334);

      // Pulse "en attente"
      const p2 = 0.5 + Math.sin(Date.now()*0.003)*0.5;
      ctx.globalAlpha = p2;
      ctx.fillStyle = '#ff8'; ctx.font = '15px Georgia';
      ctx.fillText('⏳ En attente de connexion…', W/2, 365);
      ctx.globalAlpha = 1;

      const bx=W/2-65, by=395;
      const bH=hitTest(mx,my,bx,by,130,34);
      ctx.fillStyle=bH?'#502020':'#2a1010'; _roundRect(ctx,bx,by,130,34,8); ctx.fill();
      ctx.fillStyle='#f88'; ctx.font='13px Georgia'; ctx.textAlign='center';
      ctx.fillText('Annuler', W/2, by+22);
      if (bH && Input._leftJustPressed) {
        Input._leftJustPressed=false;
        Net.disconnect(); this._lobbyWaiting=false; this._lobbyCode=''; this._lobbyCopied=false;
      }
      return;
    }

    // ── ÉTAT : choix initial ──────────────────────────────────

    // Bouton Héberger
    const hbx=W/2-130, hby=200;
    const hH = hitTest(mx,my,hbx,hby,260,54);
    ctx.fillStyle = hH ? '#1a3560' : '#0d1f3a';
    _roundRect(ctx,hbx,hby,260,54,12); ctx.fill();
    ctx.strokeStyle='#4080ff'; ctx.lineWidth=1.5; _roundRect(ctx,hbx,hby,260,54,12); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 18px Georgia'; ctx.textAlign='center';
    ctx.fillText('🏠 Héberger la partie', W/2, hby+34);
    if (hH && Input._leftJustPressed) {
      Input._leftJustPressed=false;
      this._lobbyWaiting=true;
      Net.host().then(code => {
        this._lobbyCode = code;
        Net.onConnect(() => {
          Net.onMessage(data => this._handleNetMessage(data));
          this.coopMode = true;
          // Passer en phase pseudo — plus de démarrage automatique
          this._lobbyWaiting = false;
          this._lobbyNamePhase = true;
          this._myName = ''; this._p2Name = '';
          this._myNameReady = false; this._p2NameReady = false;
        });
      }).catch(e => { this._lobbyError='Erreur: '+e.message; this._lobbyWaiting=false; });
    }

    // Séparateur
    ctx.fillStyle='#333'; ctx.fillRect(W/2-140,272,280,1);
    ctx.fillStyle='#666'; ctx.font='12px Georgia'; ctx.textAlign='center';
    ctx.fillText('— ou rejoindre avec un code —', W/2, 292);

    // Champ code (clic = coller)
    const ibx=W/2-140, iby=304;
    const iH = hitTest(mx,my,ibx,iby,280,42);
    ctx.fillStyle = iH ? '#1e1545' : '#141030';
    _roundRect(ctx,ibx,iby,280,42,8); ctx.fill();
    ctx.strokeStyle = iH ? '#8060ff' : '#3a2880'; ctx.lineWidth=1;
    _roundRect(ctx,ibx,iby,280,42,8); ctx.stroke();
    ctx.fillStyle = this._lobbyInput ? '#fff' : '#555';
    ctx.font = this._lobbyInput ? '13px monospace' : '13px Georgia';
    ctx.textAlign='center';
    // Truncate long UUID for display
    const dispCode = this._lobbyInput.length > 36 ? this._lobbyInput.slice(0,34)+'…' : (this._lobbyInput || '📋 Cliquer pour coller le code');
    ctx.fillText(dispCode, W/2, iby+26);
    if (iH && Input._leftJustPressed) {
      Input._leftJustPressed=false;
      navigator.clipboard.readText().then(txt => {
        const c = txt.trim(); if (c.length > 3) this._lobbyInput = c;
      }).catch(()=>{});
    }

    // Bouton rejoindre
    const jbx=W/2-100, jby=358;
    const canJoin = this._lobbyInput.length > 3;
    const jH = hitTest(mx,my,jbx,jby,200,44);
    ctx.fillStyle = canJoin ? (jH?'#304820':'#1c2e10') : '#141414';
    _roundRect(ctx,jbx,jby,200,44,10); ctx.fill();
    ctx.strokeStyle = canJoin ? '#6f4' : '#333'; ctx.lineWidth=1.5;
    _roundRect(ctx,jbx,jby,200,44,10); ctx.stroke();
    ctx.fillStyle = canJoin ? '#8f8' : '#444';
    ctx.font='bold 16px Georgia'; ctx.textAlign='center';
    ctx.fillText('🔗 Rejoindre', W/2, jby+29);
    if (jH && Input._leftJustPressed && canJoin) {
      Input._leftJustPressed=false;
      this._lobbyJoining=true; this._lobbyError='Connexion en cours…';
      Net.join(this._lobbyInput).then(() => {
        Net.onMessage(data => this._handleNetMessage(data));
        this._lobbyJoining = false;
        this._lobbyNamePhase = true;
        this._myName = ''; this._p2Name = '';
        this._myNameReady = false; this._p2NameReady = false;
      }).catch(e => { this._lobbyError='Erreur: '+e.message; this._lobbyJoining=false; });
    }

    if (this._lobbyError) {
      ctx.fillStyle = this._lobbyError.startsWith('Err') ? '#f55' : '#ff8';
      ctx.font='12px Georgia'; ctx.textAlign='center';
      ctx.fillText(this._lobbyError, W/2, 420);
    }

    // Retour
    const rbx=W/2-55, rby=445;
    const rH=hitTest(mx,my,rbx,rby,110,30);
    ctx.fillStyle=rH?'#2a1030':'#160820'; _roundRect(ctx,rbx,rby,110,30,6); ctx.fill();
    ctx.fillStyle='#666'; ctx.font='12px Georgia'; ctx.textAlign='center';
    ctx.fillText('← Retour', W/2, rby+20);
    if (rH && Input._leftJustPressed) {
      Input._leftJustPressed=false;
      if(this._lobbyKeyHandler){window.removeEventListener('keydown',this._lobbyKeyHandler);this._lobbyListening=false;}
      Net.disconnect(); this.state=STATE.MENU;
    }
  }

  _handleNetMessage(data) {
    if (data.type === 'name_update') {
      this._p2Name = data.name || '';
      return;
    }
    if (data.type === 'name_ready') {
      this._p2Name = data.name || '';
      this._p2NameReady = true;
      if (Net.isHost) this._checkBothReady();
      return;
    }
    if (data.type === 'fate_vote') {
      this._p2FateVote = data.index;
      if (Net.isHost) this._checkFateVotes();
      return;
    }
    if (data.type === 'fate_countdown' && !Net.isHost) {
      this._fateVoteTimer = 10;
      return;
    }
    if (data.type === 'fate_roulette' && !Net.isHost) {
      this._fateRouletteWinner = data.winner;
      this._fateRoulette = true;
      this._fateRouletteTimer = 2.2;
      return;
    }
    if (data.type === 'fate_selected' && !Net.isHost) {
      this._fateRoulette = false;
      this._selectFate(this._fateOptions[data.index]);
      return;
    }
    if (data.type === 'player_dead' && Net.isHost) {
      // P2 died — check if game over or spectator
      if (this.player && this.player.hp <= 0) {
        this._triggerGameOver();
      }
      // else P1 continues alone
      Logger.log('SYSTEM', 'P2 est devenu spectateur');
      return;
    }
    if (data.type === 'host_dead' && !Net.isHost) {
      // P1 (host) est spectateur — P2 peut décider seul
      this._hostIsSpectator = true;
      Logger.log('SYSTEM', 'P1 est spectateur — P2 joue seul');
      return;
    }
    if (data.type === 'partner_revived' && !Net.isHost) {
      this.player.isSpectator = false;
      this.player.dead = false;
      this._spectatorMode = false;
      this.player.hp = data.hp || Math.round((this.player.maxHp || 100) * 0.30);
      Particles.burst(this.player.pos.x, this.player.pos.y, 20, '#5f5', 160, 4);
      Logger.log('SYSTEM', 'Client revived by partner');
      return;
    }
    if (data.type === 'host_revived' && !Net.isHost) {
      this._hostIsSpectator = false;
      Logger.log('SYSTEM', 'Host was revived');
      return;
    }
    if (data.type === 'request_revive' && Net.isHost) {
      // P2 requests to revive P1 (host)
      this.player.isSpectator = false;
      this.player.dead = false;
      this._spectatorMode = false;
      this.player.hp = Math.round(this.player.maxHp * 0.30);
      Particles.burst(this.player.pos.x, this.player.pos.y, 20, '#5f5', 160, 4);
      Net.send({ type: 'host_revived', hp: this.player.hp });
      Logger.log('SYSTEM', 'P1 revived by P2 request');
      return;
    }
    if (data.type === 'kill_enemy' && Net.isHost) {
      // Client a tué des ennemis localement — appliquer sur le host
      for (const idx of (data.indices || [])) {
        const e = this.room && this.room.enemies[idx];
        if (e && !e.dead) {
          e.dead = true; e.hp = 0;
          if (!e._deathFX) { e._deathFX = true; Particles.death(e.pos.x, e.pos.y, e.color || '#f88', e.r || 18); }
        }
      }
      return;
    }
    if (data.type === 'start' && !Net.isHost) {
      // Client received start signal from host
      this.coopMode = true;
      this.p1Name = data.hostName   || 'Hôte';
      this.p2Name = data.clientName || 'Client';
      this._lobbyNamePhase = false;
      if (this._lobbyKeyHandler) { window.removeEventListener('keydown', this._lobbyKeyHandler); this._lobbyListening = false; }
      this._doFade(1,()=>{ this.startCoopRun(data.seed); this._doFade(-1,null); });
      return;
    }
    if (data.type === 'state' && !Net.isHost) {
      // Client receives authoritative state from host
      this.p2State = data;
      // Sync enemy state
      if (this.room && data.enemies) {
        for (const es of data.enemies) {
          const e = this.room.enemies[es.i];
          if (!e) continue;
          e.x = es.x; e.y = es.y; e.pos.x = es.x; e.pos.y = es.y;
          e.hp = es.hp;
          if (es.dead && !e.dead) { e.dead = true; e.hp = 0; }
        }
      }
      // Sync P1 position (host player) for display
      if (data.p1) this._remoteP1 = data.p1;
      // Sync game state transitions
      if (data.gameState === 'fate_choice') {
        if (this.state === STATE.PLAYING) {
          this._fateOptions = this._generateFateOptions();
          this._fateHover = -1;
          this._fateAnimTimer = 0;
          this._fateGuardTimer = 0;
          this._myFateVote = -1; this._p2FateVote = -1;
          this._fateVoteTimer = -1; this._fateRoulette = false;
          Input._leftJustPressed = false;
          this.state = STATE.FATE_CHOICE;
        }
        // Always sync vote state from host
        if (data.p1Vote !== undefined) this._p2FateVote = data.p1Vote; // host's vote = p2 from client view
        if (data.fateTimer !== undefined && data.fateTimer >= 0) this._fateVoteTimer = data.fateTimer;
      }
      if (data.gameState === 'boon_pick' &&
          (this.state === STATE.PLAYING || this.state === STATE.FATE_CHOICE)) {
        if (data.boonChoices) {
          const choices = data.boonChoices.map(id => ALL_BOONS.find(b=>b.id===id)).filter(Boolean);
          this.boonPicker = new BoonPicker(choices, (boon)=>{
            boon.apply(this.player);
            this.player.boonIds.push(boon.id);
            Net.send({ type:'boon_picked', boonId: boon.id });
            this._doFade(1,()=>{ this.depth++; this._loadRoom(); this.state=STATE.PLAYING; this._doFade(-1,null); });
          }, this.player.boonIds.slice());
          this.state = STATE.BOON_PICK;
        }
      }
      if (data.gameState === 'shop' && this.state === STATE.FATE_CHOICE) {
        this.state = STATE.SHOP;
      }
      if (data.gameState === 'game_over' && this.state === STATE.PLAYING) {
        this.state = STATE.GAME_OVER;
      }
      return;
    }
    if (data.type === 'fate_heal' && !Net.isHost) {
      if (this.player) this.player.heal(data.amt || 0);
      Particles.burst(W/2, H/2, 20, '#5f5', 150, 3);
      return;
    }
    if (data.type === 'shop_exit' && !Net.isHost) {
      this._advanceToNextRoom();
      return;
    }
    if (data.type === 'input' && Net.isHost) {
      // Host receives P2 inputs
      this._p2Input = data;
      return;
    }
    if (data.type === 'boon_picked' && Net.isHost) {
      // Apply P2's boon pick on host side
      if (this.player2) {
        const boon = ALL_BOONS.find(b=>b.id===data.boonId);
        if (boon) { boon.apply(this.player2); this.player2.boonIds.push(boon.id); }
      }
    }
  }

  startCoopRun(seed) {
    Logger.reset();
    this.runSeed = seed;
    RunRNG = new SeededRNG(this.runSeed);
    this.player = new Player();
    Meta.applyToPlayer(this.player);
    if (Net.isHost) {
      // Host creates P2 as a second Player instance
      this.player2 = new Player();
      this.player2.pos.set(W/2 + 60, PLAY.y + PLAY.h - 65);
      this._p2Input = null;
      this._netTimer = 0;
      Net.onDisconnect(() => {
        this.coopMode = false; this.player2 = null;
        Logger.log('SYSTEM', 'P2 disconnected');
      });
    } else {
      this.player2 = null;
      this._remoteP1 = null;
      Net.onDisconnect(() => {
        this.coopMode = false;
        Logger.log('SYSTEM', 'Host disconnected');
      });
    }
    this.depth = 1; this.roomsCleared = 0; this.runTime = 0; this.soulsEarned = 0;
    this.perfMult = 1.0; this.roomClearTimes = []; this._roomStartTime = 0;
    this._spectatorMode = false; this._hostIsSpectator = false;
    this._reviveTimer = 0;
    Particles.clear();
    this._loadRoom();
    this.state = STATE.PLAYING;
    Logger.log('SYSTEM', `Coop run started (${Net.isHost?'HOST':'CLIENT'}) seed=${seed}`);
  }

  _drawWin(ctx) {
    ctx.fillStyle='#030510'; ctx.fillRect(0,0,W,H);
    if (Math.random()<0.08) Particles.sparks(rand(0,W),rand(0,H/3),2,'#ff8');
    Particles.update(0.016); Particles.draw(ctx);
    ctx.shadowColor='#ff8'; ctx.shadowBlur=50;
    ctx.fillStyle='#ffe060'; ctx.font='bold 56px Georgia'; ctx.textAlign='center';
    ctx.fillText('LIBERTÉ !', W/2, H/2-120); ctx.shadowBlur=0;
    ctx.fillStyle='#cca'; ctx.font='20px Georgia';
    ctx.fillText('Tu as traversé les 15 salles des enfers.', W/2, H/2-60);
    ctx.fillStyle='#ff8'; ctx.font='bold 20px Georgia';
    ctx.fillText(`+${this.soulsEarned} 💎 Âmes gagnées  (total : ${Meta.getSouls()})`, W/2, H/2-20);
    if (this.player?.synergyIds?.length>0) {
      ctx.fillStyle='#f8a'; ctx.font='13px Georgia';
      ctx.fillText(`Synergies : ${this.player.synergyIds.map(id=>SYNERGIES.find(s=>s.id===id)?.name||id).join(', ')}`, W/2, H/2+15);
    }
    ctx.fillStyle='#8a8'; ctx.font='italic 15px Georgia';
    ctx.fillText('"Une victoire méritée. Pour cette fois."  — Hades', W/2, H/2+55);
    ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='11px Georgia';
    ctx.fillText(`Seed : #${this.runSeed}`, W/2, H/2+78);
    ctx.globalAlpha=0.7+Math.sin(Date.now()*0.002)*0.3;
    ctx.fillStyle='#fff'; ctx.shadowColor='#ff8'; ctx.shadowBlur=8;
    ctx.font='bold 17px Georgia';
    ctx.fillText('[ ENTRÉE : Menu  ·  R : Rejouer ]', W/2, H/2+108);
    ctx.globalAlpha=1; ctx.shadowBlur=0;
  }
}

window.addEventListener('load', () => {
  window._game = new Game(document.getElementById('c'));
  window._hitstop = (dur = 0.04) => {
    if (window._game) window._game.hitstopTimer = Math.max(window._game.hitstopTimer, dur);
  };
});
