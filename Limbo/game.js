'use strict';

const STATE = {
  MENU:'menu', GRIMOIRE:'grimoire', GUIDE:'guide', UPGRADES:'upgrades',
  PLAYING:'playing', BOON_PICK:'boon_pick',
  TRANSITION:'transition', GAME_OVER:'game_over', WIN:'win',
  LOBBY:'lobby'
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
        this._lobbyError = '✓ Connecté — en attente de l\'hôte…';
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
    this.player2    = null;    // instance Player pour P2 (hôte uniquement)
    this.p2State    = null;    // état reçu de l'hôte (client uniquement)
    this._netTimer  = 0;       // timer pour envoi état réseau
    this._lobbyCode = '';      // code affiché (hôte) ou saisi (client)
    this._lobbyInput= '';      // saisie clavier en cours
    this._lobbyError= '';      // message d'erreur lobby
    this._lobbyWaiting = false;// en attente de connexion
    this._lobbyCopied  = false; // feedback bouton copier

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
      const dt=Math.min((t-this._lastTime)/1000, 0.05);
      this._lastTime=t;
      this.update(dt);
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
    this.player.pos.set(W/2, PLAY.y + PLAY.h - 65);
    Logger.log('ROOM', `Entered room depth=${this.depth} isBoss=${isBoss}`);
    if (isBoss) {
      const bossNum = Math.ceil(this.depth / 5);
      const isMini = bossNum % 2 === 1;
      Logger.log('BOSS', `Floor ${this.depth}: ${isMini ? 'MiniBoss' : 'Warden'} (boss #${bossNum})`);
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
    this.runTime+=dt;
    const prevHp=this.player.hp;
    this.room.update(dt, this.player);
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

    // Screen shake on damage — subtle, not disorienting
    if (this.player.hp < prevHp) {
      const dmgTaken = prevHp - this.player.hp;
      this._shake(Math.min(6, 2 + dmgTaken * 0.08), 0.12);
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
      this.state=STATE.TRANSITION;
      this._shake(8, 0.3);
      const rawSouls = Meta.calcSouls(this.depth, this.roomsCleared, this.player.boonIds.length);
      const souls = Math.round(rawSouls * (this.player.stats.soulBonus || 1));
      this.soulsEarned = souls;
      Meta.addSouls(souls);
      setTimeout(()=>{
        this._doFade(1,()=>{
          this.state=STATE.GAME_OVER;
          this._doFade(-1,null);
          Logger.download();
        });
      }, 500);
    }

    if (this.room.cleared && !this.room._boonTriggered && this.state===STATE.PLAYING) {
      this.room._boonTriggered=true;
      this.roomsCleared++;

      // ── Performance tracking → adaptive difficulty ────────
      if (!this.room.isBoss) {
        const clearTime = this.runTime - this._roomStartTime;
        this.roomClearTimes.push(clearTime);
        // Use last 5 rooms to smooth out spikes
        const recent = this.roomClearTimes.slice(-5);
        const avg = recent.reduce((s, t) => s + t, 0) / recent.length;
        // ref: 20s = ×1.0, 10s = ×1.4, 5s = ×1.8, 30s = ×0.85
        const raw = 20 / Math.max(4, avg);
        this.perfMult = Math.max(0.8, Math.min(3.0, raw));
        Logger.log('SYSTEM', `Room ${clearTime.toFixed(1)}s | avg ${avg.toFixed(1)}s | traque ×${this.perfMult.toFixed(2)}`);
      }

      if (this.room.isBoss) {
        const healed=this.player.maxHp-this.player.hp;
        if (healed>0) { this.player.hp=this.player.maxHp; Particles.heal(W/2,H/2,healed); }
      }
      const totalKills = this.player.meleeKills + this.player.rangedKills;
      const playstyleRatio = totalKills > 0 ? this.player.rangedKills / totalKills : 0.5;
      const boonCount = this.player.stats.boonChoices || 3;
      const choices=pickBoons(this.player.boonIds, boonCount, playstyleRatio);
      Logger.log('BOON',`Boon choices (${boonCount}): ${choices.map(b=>b.name).join(', ')}`);
      const _makePicker = (pickerChoices, limitReroll) => {
        const onPickBoon = (boon) => {
          boon.apply(this.player);
          this.player.boonIds.push(boon.id);
          checkSynergies(this.player);
          Logger.log('BOON',`Picked: ${boon.name}`, {
            dmgMult:this.player.stats.dmgMult.toFixed(2),
            synergies:this.player.synergyIds
          });
          this._doFade(1,()=>{
            this.depth++;
            if (this.player.stats.roomHeal>0) this.player.heal(this.player.stats.roomHeal);
            // Every 15 floors: award milestone souls bonus
            if (this.depth % 15 === 1 && this.depth > 1) {
              const bonus = 50 + Math.floor(this.depth / 15) * 25;
              Meta.addSouls(bonus);
              Logger.log('SYSTEM', `Milestone bonus: +${bonus} souls at depth ${this.depth}`);
            }
            this._loadRoom(); this.state=STATE.PLAYING; this._doFade(-1,null);
          });
        };
        return new BoonPicker(pickerChoices, onPickBoon, this.player.boonIds.slice(), {
          canReroll: !!this.player.stats.canReroll && !limitReroll,
          rerollCost: 8,
          onReroll: () => {
            const newChoices = pickBoons(this.player.boonIds, boonCount, playstyleRatio);
            Logger.log('BOON', `Rerolled boon choices (cost: 8 souls)`);
            this.boonPicker = _makePicker(newChoices, true); // limit to 1 reroll
          }
        });
      };
      this.boonPicker = _makePicker(choices, false);
      this.state=STATE.BOON_PICK;
    }
  }

  _updateBoonPick(dt) {
    this.boonPicker.update(dt);
    this.boonPicker.handleMouse(Input.mouse.x, Input.mouse.y, Input._leftJustPressed);
    if (Input._leftJustPressed) Input._leftJustPressed=false;
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
    else if (this.state===STATE.GAME_OVER) this._drawGameOver(ctx);
    else if (this.state===STATE.WIN)       this._drawWin(ctx);

    ctx.restore();
    if (this.fade>0) { ctx.fillStyle=`rgba(0,0,0,${this.fade})`; ctx.fillRect(0,0,W,H); }
    Logger.drawOverlay(this.ctx);
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
      ctx.fillText('P2', this.player2.pos.x, this.player2.pos.y - this.player2.r - 10);
      ctx.restore();
    }
    if (this.coopMode && !Net.isHost && this._remoteP1) {
      // Draw host player as ghost
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#7af';
      ctx.beginPath(); ctx.arc(this._remoteP1.x, this._remoteP1.y, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#7af'; ctx.font='bold 11px Georgia'; ctx.textAlign='center';
      ctx.fillText('P1', this._remoteP1.x, this._remoteP1.y - 22);
      ctx.restore();
    }
    this.player.drawHUD(ctx);
    this._drawDepthHUD(ctx);
    this._drawBoonIcons(ctx);
    this._drawSynergyIcons(ctx);
    this._drawControls(ctx);
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
    // Souls display
    ctx.fillStyle='#ff8'; ctx.font='11px Georgia';
    ctx.fillText(`💎 ${Meta.getSouls()} âmes`, W-20, 102);

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

    // Soul counter
    ctx.fillStyle='#ff8'; ctx.font='bold 14px Georgia'; ctx.textAlign='center';
    ctx.fillText(`💎 ${Meta.getSouls()} Âmes disponibles`, W/2, startY+4*(btnH+gap)+10);

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
        if (e.key === 'Backspace') { this._lobbyInput = this._lobbyInput.slice(0,-1); return; }
        if (e.key === 'Escape') { this._lobbyInput=''; this._lobbyError=''; this.state=STATE.MENU; return; }
        if (e.key.length === 1) this._lobbyInput += e.key;
      };
      window.addEventListener('keydown', this._lobbyKeyHandler);
    }
  }

  _drawLobby(ctx) {
    ctx.fillStyle = '#05030f'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 32px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('🌐 MODE CO-OP', W/2, 120);

    ctx.fillStyle = '#a0a0c0'; ctx.font = '14px Georgia';
    ctx.fillText('Deux joueurs, deux fois plus difficile. L\'hôte contrôle la partie.', W/2, 160);

    if (this._lobbyWaiting) {
      ctx.fillStyle = '#4f4'; ctx.font = 'bold 20px Georgia';
      ctx.fillText('Code de connexion :', W/2, 220);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 48px monospace';
      ctx.fillText(this._lobbyCode, W/2, 280);

      // Bouton Copier le lien
      const cpx=W/2-110, cpy=300;
      const cpHov = hitTest(Input.mouse.x, Input.mouse.y, cpx, cpy, 220, 42);
      ctx.fillStyle = this._lobbyCopied ? '#204020' : (cpHov ? '#304060' : '#1a2840');
      _roundRect(ctx, cpx, cpy, 220, 42, 10); ctx.fill();
      ctx.strokeStyle = this._lobbyCopied ? '#4f4' : '#4080ff';
      ctx.lineWidth = 1.5; _roundRect(ctx, cpx, cpy, 220, 42, 10); ctx.stroke();
      ctx.fillStyle = this._lobbyCopied ? '#4f4' : '#fff';
      ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(this._lobbyCopied ? '✓ Lien copié !' : '📋 Copier le lien d\'invitation', W/2, cpy+27);

      if (cpHov && Input._leftJustPressed) {
        Input._leftJustPressed = false;
        const base = location.href.split('?')[0];
        const link = `${base}?join=${this._lobbyCode}`;
        navigator.clipboard.writeText(link).then(() => {
          this._lobbyCopied = true;
          setTimeout(() => { this._lobbyCopied = false; }, 2000);
        });
      }

      ctx.fillStyle = '#888'; ctx.font = '12px Georgia';
      ctx.fillText('Partage ce lien — ton ami clique dessus et rejoint directement.', W/2, 358);
      ctx.fillStyle = '#ff8'; ctx.font = '14px Georgia';
      ctx.fillText('En attente de connexion…', W/2, 385);

      // Cancel button
      const bx=W/2-70, by=415;
      const hov = hitTest(Input.mouse.x, Input.mouse.y, bx, by, 140, 36);
      ctx.fillStyle = hov ? '#502020' : '#301010';
      _roundRect(ctx,bx,by,140,36,8); ctx.fill();
      ctx.fillStyle='#f88'; ctx.font='13px Georgia';
      ctx.fillText('Annuler', W/2, by+23);
      if (hov && Input._leftJustPressed) {
        Input._leftJustPressed=false;
        Net.disconnect(); this._lobbyWaiting=false; this._lobbyCode=''; this._lobbyCopied=false;
      }
      return;
    }

    // Bouton Héberger
    const hbx=W/2-130, hby=220;
    const hHov = hitTest(Input.mouse.x, Input.mouse.y, hbx, hby, 240, 52);
    ctx.fillStyle = hHov ? '#204080' : '#102040';
    _roundRect(ctx,hbx,hby,240,52,10); ctx.fill();
    ctx.strokeStyle='#4080ff'; ctx.lineWidth=1.5; _roundRect(ctx,hbx,hby,240,52,10); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 18px Georgia'; ctx.textAlign='center';
    ctx.fillText('🏠 Héberger la partie', W/2, hby+33);

    if (hHov && Input._leftJustPressed) {
      Input._leftJustPressed=false;
      this._lobbyWaiting=true;
      Net.host().then(code => {
        this._lobbyCode = code;
        Net.onConnect(() => {
          // P2 connected! Start coop run
          Net.onMessage(data => this._handleNetMessage(data));
          this.coopMode = true;
          const seed = this.runSeed || ((Math.random()*0x7FFFFFFF)>>>0);
          Net.send({ type:'start', seed, depth:1 });
          if (this._lobbyKeyHandler) { window.removeEventListener('keydown', this._lobbyKeyHandler); this._lobbyListening=false; }
          this._doFade(1,()=>{ this.startCoopRun(seed); this._doFade(-1,null); });
        });
      }).catch(e => { this._lobbyError = 'Erreur: '+e.message; this._lobbyWaiting=false; });
    }

    // Zone saisie code
    ctx.fillStyle = '#a0a0c0'; ctx.font = '14px Georgia'; ctx.textAlign='center';
    ctx.fillText('— ou rejoindre avec un code —', W/2, 310);

    const ibx=W/2-120, iby=325;
    const iHov = hitTest(Input.mouse.x, Input.mouse.y, ibx, iby, 240, 40);
    ctx.fillStyle = iHov ? '#221848' : '#1a1535';
    _roundRect(ctx,ibx,iby,240,40,6); ctx.fill();
    ctx.strokeStyle = iHov ? '#8060ff' : '#5040a0'; ctx.lineWidth=1;
    _roundRect(ctx,ibx,iby,240,40,6); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 20px monospace'; ctx.textAlign='center';
    ctx.fillText(this._lobbyInput || '📋 coller le code…', W/2, iby+27);
    // Clic sur le champ = coller depuis presse-papier
    if (iHov && Input._leftJustPressed) {
      Input._leftJustPressed=false;
      navigator.clipboard.readText().then(text => {
        const clean = text.trim();
        if (clean.length > 3) this._lobbyInput = clean;
      }).catch(() => {}); // permission refusée silencieuse
    }

    const jbx=W/2-80, jby=378;
    const jHov = hitTest(Input.mouse.x, Input.mouse.y, jbx, jby, 160, 40);
    ctx.fillStyle = this._lobbyInput.length > 3 ? (jHov?'#405020':'#203010') : '#1a1535';
    _roundRect(ctx,jbx,jby,160,40,8); ctx.fill();
    ctx.fillStyle = this._lobbyInput.length > 3 ? '#8f8' : '#555'; ctx.font='bold 16px Georgia'; ctx.textAlign='center';
    ctx.fillText('🔗 Rejoindre', W/2, jby+27);

    if (jHov && Input._leftJustPressed && this._lobbyInput.length > 3) {
      Input._leftJustPressed=false;
      this._lobbyError = 'Connexion en cours…';
      Net.join(this._lobbyInput).then(() => {
        Net.onMessage(data => this._handleNetMessage(data));
        this._lobbyError = '✓ Connecté — en attente de l\'hôte…';
        if (this._lobbyKeyHandler) { window.removeEventListener('keydown', this._lobbyKeyHandler); this._lobbyListening=false; }
      }).catch(e => { this._lobbyError = 'Erreur: '+e.message; });
    }

    if (this._lobbyError) {
      ctx.fillStyle = this._lobbyError.startsWith('Err') ? '#f44' : '#ff8';
      ctx.font='13px Georgia'; ctx.textAlign='center';
      ctx.fillText(this._lobbyError, W/2, 435);
    }

    // Back button
    const bbx=W/2-60, bby=460;
    const bHov=hitTest(Input.mouse.x,Input.mouse.y,bbx,bby,120,34);
    ctx.fillStyle=bHov?'#302030':'#201020'; _roundRect(ctx,bbx,bby,120,34,6); ctx.fill();
    ctx.fillStyle='#888'; ctx.font='13px Georgia'; ctx.textAlign='center';
    ctx.fillText('← Retour', W/2, bby+22);
    if (bHov && Input._leftJustPressed) {
      Input._leftJustPressed=false;
      if(this._lobbyKeyHandler){window.removeEventListener('keydown',this._lobbyKeyHandler);this._lobbyListening=false;}
      this.state=STATE.MENU;
    }
  }

  _handleNetMessage(data) {
    if (data.type === 'start' && !Net.isHost) {
      // Client received start signal from host
      this.coopMode = true;
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
      if (data.gameState === 'boon_pick' && this.state === STATE.PLAYING) {
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
      if (data.gameState === 'game_over' && this.state === STATE.PLAYING) {
        this.state = STATE.GAME_OVER;
      }
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
});
