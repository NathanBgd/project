'use strict';

class Player {
  constructor() {
    // Start near BOTTOM of room (boss spawns at top)
    this.pos   = new Vec2(W/2, PLAY.y + PLAY.h - 65);
    this.vel   = new Vec2();
    this.r     = 18;
    this.hp    = 100;
    this.maxHp = 100;
    this.dead  = false;
    this.isSpectator = false;

    // Dash
    this.dashCooldowns  = [0, 0];
    this.dashTimer      = 0;
    this.dashVel        = new Vec2();
    this.dashInvincible = false;
    this._dashWasHeld   = false;

    // Attacks
    this.atkTimer   = 0;
    this.atkAnim    = 0;
    this.castTimer  = 0;
    this.blastTimer = 0;
    this.blastAnim  = null;
    this.comboCount = 0;

    // Visual
    this.angle     = 0;
    this.hitTimer  = 0;
    this.knockTimer= 0;
    this.knockVel  = new Vec2();
    this.deathTimer= 0;

    this._dashTrail = [];

    this.boonIds    = [];
    this.synergyIds = [];

    // Kill tracking for adaptive boon system
    this.meleeKills  = 0;
    this.rangedKills = 0;

    // Burst shot queue (rafale boon)
    this._burstQueue = 0;
    this._burstDelay = 0;
    this._burstDir   = null;

    // Seismic strike counter
    this._seismicHitCount = 0;

    this.stats = {
      dmgMult:    1.0,
      atkSpeed:   1.0,
      speedMult:  1.0,
      meleeRange: 1.0,
      dashCharges:2,
      dashDmg:    0,
      dashHeal:   0,
      dmgReduce:  0,
      roomHeal:   0,
      killHeal:   0,
      lifeSteal:  0,
      bleed:      false,
      chill:      false,
      pierce:     false,
      twinShot:   false,
      tripleShot: false,
      explodeOnKill: false,
      revengeDmg: 0,
      chain:      false,
      killCDReduc:  0,
      frenzyStacks: 0,
      frenzyBonus:  0.03,
      frenzyMax:    0.30,
    };
  }

  get baseSpeed()    { return 210 * this.stats.speedMult; }
  get meleeDmg()     { return Math.round(25 * this.stats.dmgMult); }
  get meleeRange()   { return 110 * this.stats.meleeRange; }
  get meleeAngle()   { return Math.PI / 2.5; }
  get atkCooldown()  { return 0.42 / this.stats.atkSpeed; }
  get castCooldown() { return (0.60 / this.stats.atkSpeed + (this.stats.castCooldown||0)) * (this.stats.castCooldownMult||1); }
  get castDmg()      { return Math.round(30 * this.stats.dmgMult * (this.stats.castDmgMult||1)); }
  get blastDmg()     { return Math.round(38 * this.stats.dmgMult * (this.stats.blastMult||1)); }
  get blastCooldown(){ return Math.max(2.0, 4.5 - (this.stats.blastCDReduc||0)); }
  get blastRadius()  { return 160; }

  takeDamage(dmg, sourceEnemy = null) {
    if (this.dashInvincible) return;
    const finalDmg = Math.max(1, dmg - this.stats.dmgReduce);
    this.hp = Math.max(0, this.hp - finalDmg);
    this.hitTimer = 0.25;
    Particles.burst(this.pos.x, this.pos.y, 8, '#f44', 100);
    Logger.log('DAMAGE', `Player took ${finalDmg} dmg (raw ${dmg}, reduced ${dmg - finalDmg})`, { hp: Math.ceil(this.hp) });
    if (this.hp <= 0) {
      this.dead = true;
      Logger.log('SYSTEM', 'Player died');
    }
    // RevengeDmg on melee contact — handled here when sourceEnemy is known
    if (this.stats.revengeDmg > 0 && sourceEnemy && !sourceEnemy.dead) {
      sourceEnemy.takeDamage(this.stats.revengeDmg);
      Particles.damage(sourceEnemy.pos.x, sourceEnemy.pos.y, this.stats.revengeDmg);
      Logger.log('BOON', `revengeDmg ${this.stats.revengeDmg} → ${sourceEnemy.constructor.name}`);
    }
  }

  heal(amount) {
    const actual = Math.min(this.maxHp - this.hp, amount);
    if (actual <= 0) return;
    this.hp += actual;
    Particles.heal(this.pos.x, this.pos.y - 20, actual);
    Logger.log('HEAL', `Player healed ${actual} → ${Math.ceil(this.hp)}/${this.maxHp}`);
  }

  knockback(fromX, fromY, force) {
    const dx = this.pos.x - fromX, dy = this.pos.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    this.knockVel.set(dx/dist*force, dy/dist*force);
    this.knockTimer = 0.1;
  }

  update(dt, room, mx, my) {
    if (this.isSpectator) return;
    if (this.dead) { this.deathTimer += dt; return; }

    this.hitTimer   = Math.max(0, this.hitTimer   - dt);
    this.atkTimer   = Math.max(0, this.atkTimer   - dt);
    this.castTimer  = Math.max(0, this.castTimer  - dt);
    this.blastTimer = Math.max(0, this.blastTimer - dt);
    this.atkAnim    = Math.max(0, this.atkAnim    - dt);
    this.knockTimer = Math.max(0, this.knockTimer - dt);

    // ── BURST QUEUE (rafale boon) ──────────────────────────
    if (this._burstQueue > 0 && this._burstDir) {
      this._burstDelay -= dt;
      if (this._burstDelay <= 0) {
        this._burstDelay = 0.1;
        this._burstQueue--;
        const d = this._burstDir;
        const spd = 510;
        const proj = new Projectile(
          this.pos.x + d.x*(this.r+5), this.pos.y + d.y*(this.r+5),
          d.x*spd, d.y*spd, 9, this.castDmg, true, '#7af',
          this.stats.pierce, this.stats.bleed
        );
        if (this.stats.projectileHoming) proj.homing = true;
        if (this.stats.projectileExplosion) proj.explosion = true;
        room.projectiles.push(proj);
        if (this._burstQueue <= 0) this._burstDir = null;
      }
    }

    for (let i = 0; i < this.stats.dashCharges; i++) {
      if (this.dashCooldowns[i] > 0) this.dashCooldowns[i] = Math.max(0, this.dashCooldowns[i] - dt);
    }

    this.angle = Math.atan2(my - this.pos.y, mx - this.pos.x);

    // ── DASH ──────────────────────────────────────────────
    if (this.dashTimer > 0) {
      // Store position for ghost trail
      this._dashTrail.unshift({ x: this.pos.x, y: this.pos.y });
      if (this._dashTrail.length > 8) this._dashTrail.pop();
      this.dashTimer -= dt;
      this.pos.x += this.dashVel.x * dt;
      this.pos.y += this.dashVel.y * dt;
      this.dashInvincible = true;

      if (this.stats.dashDmg > 0) {
        for (const e of room.enemies) {
          if (!e.dead && circleCircle(this.pos.x, this.pos.y, this.r+6, e.pos.x, e.pos.y, e.r)) {
            e.takeDamage(this.stats.dashDmg);
            Particles.damage(e.pos.x, e.pos.y, this.stats.dashDmg);
          }
        }
      }
      if (this.dashTimer <= 0) this.dashInvincible = false;
    } else {
      this.dashInvincible = false;
      if (this._dashTrail.length > 0 && this.dashTimer <= 0) {
        // Gradually fade trail
        this._dashTrail.pop();
      }

      // ── MOVEMENT ────────────────────────────────────────
      let mvx = Input.moveX(), mvy = Input.moveY();
      const mlen = Math.hypot(mvx, mvy);
      if (mlen > 0) { mvx /= mlen; mvy /= mlen; }

      if (this.knockTimer > 0) {
        this.pos.x += this.knockVel.x * dt;
        this.pos.y += this.knockVel.y * dt;
        this.knockVel.iscale(1 - 10*dt);
      } else {
        this.pos.x += mvx * this.baseSpeed * dt;
        this.pos.y += mvy * this.baseSpeed * dt;
      }

      // ── START DASH ──────────────────────────────────────
      const dashHeld = Input.isDash();
      if (dashHeld && !this._dashWasHeld) {
        const slot = this.dashCooldowns.findIndex((c, i) => c <= 0 && i < this.stats.dashCharges);
        if (slot >= 0) {
          this.dashTimer = 0.18;
          this._dashTrail = [];
          const dx = mvx || Math.cos(this.angle);
          const dy = mvy || Math.sin(this.angle);
          const dl = Math.hypot(dx, dy) || 1;
          this.dashVel.set(dx/dl * 490, dy/dl * 490);
          this.dashCooldowns[slot] = 1.8;
          if (this.stats.dashHeal > 0) this.heal(this.stats.dashHeal);
          Particles.burst(this.pos.x, this.pos.y, 8, '#8ff', 80, 2);
          Logger.log('ABILITY', `Dash used (slot ${slot})`);
        }
      }
      this._dashWasHeld = dashHeld;
    }

    // ── PUSH OUT OF OBSTACLES + BOUNDS ────────────────────
    for (const o of room.obstacles) {
      const p = pushOutOfRect(this.pos.x, this.pos.y, this.r, o.x, o.y, o.w, o.h);
      this.pos.x = p.x; this.pos.y = p.y;
    }
    const b = keepInBounds(this.pos.x, this.pos.y, this.r);
    this.pos.x = b.x; this.pos.y = b.y;

    // ── MELEE ATTACK  (Left Click) ─────────────────────────
    if (Input.isAttack() && this.atkTimer <= 0) {
      this.atkTimer  = this.atkCooldown;
      this.atkAnim   = 0.18;
      this.comboCount = this.stats.chain ? (this.comboCount + 1) % 4 : 0;
      const isChain  = this.stats.chain && this.comboCount === 0;
      let hitCount   = 0;

      for (const e of room.enemies) {
        if (e.dead) continue;
        const ex = e.pos.x - this.pos.x, ey = e.pos.y - this.pos.y;
        const dist = Math.hypot(ex, ey);
        if (dist > this.meleeRange + e.r) continue;
        const ang = Math.atan2(ey, ex);
        if (Math.abs(angleDiff(ang, this.angle)) > this.meleeAngle) continue;

        let dmg = this.meleeDmg;
        if (isChain) dmg *= 2;
        // Contre-Attaque : 2.5x dégâts pendant 0.4s après avoir pris un coup
        if (this.stats.counterAttack && this.hitTimer > 0) dmg = Math.floor(dmg * 2.5);
        const isCrit = Math.random() < 0.1;
        if (isCrit) dmg = Math.floor(dmg * 1.75);
        // Exécution : tuer instantanément les ennemis sous 20% HP
        if (this.stats.executionThreshold && e.hp / e.maxHp < this.stats.executionThreshold) {
          e.hp = 0; e.dead = true;
          Particles.burst(e.pos.x, e.pos.y, 15, '#800020', 160, 4);
          Logger.log('BOON', `execution triggered on ${e.constructor.name}`);
          this.meleeKills++;
          if (this.stats.killHeal > 0) this.heal(this.stats.killHeal);
          if (this.stats.killCDReduc > 0) {
            this.atkTimer  = Math.max(0, this.atkTimer  - this.stats.killCDReduc);
            this.castTimer = Math.max(0, this.castTimer - this.stats.killCDReduc);
            this.blastTimer= Math.max(0, this.blastTimer- this.stats.killCDReduc);
          }
          Logger.log('KILL', `${e.constructor.name} executed by melee`);
          continue;
        }
        const killed = e.takeDamage(dmg, this.stats.bleed);
        if (typeof window._hitstop === 'function') window._hitstop(killed ? 0.07 : 0.04);
        if (this.stats.chill && Math.random() < 0.3) e.chill();
        // Lame Enflammée : brûlure sur coup de mêlée
        if (this.stats.meleeBurn) {
          e.burnTimer = 2.0;
          e.burnDmg   = 8;
        }
        Particles.damage(e.pos.x, e.pos.y - e.r, dmg, isCrit);
        Particles.sparks(e.pos.x, e.pos.y, 5, '#fff');
        e.knockback(this.pos.x, this.pos.y, 180);
        hitCount++;
        // Lame Sismique : onde de choc tous les 3 coups
        if (this.stats.seismicStrike) {
          this._seismicHitCount = (this._seismicHitCount || 0) + 1;
          if (this._seismicHitCount >= 3) {
            this._seismicHitCount = 0;
            const seismicDmg = Math.round(dmg * 0.6);
            for (const other of room.enemies) {
              if (!other.dead && this.pos.dist(other.pos) < 80 + other.r) {
                other.takeDamage(seismicDmg);
                Particles.damage(other.pos.x, other.pos.y, seismicDmg);
              }
            }
            Particles.burst(this.pos.x, this.pos.y, 12, '#a06020', 160, 3);
            // TODO: effet visuel Particles.ring si disponible
            Logger.log('BOON', `seismicStrike AoE ${seismicDmg} dmg`);
          }
        }

        Logger.log('DAMAGE', `Melee hit ${e.constructor.name} for ${dmg}${isCrit?' CRIT':''}${isChain?' CHAIN':''}`, { killed });

        if (this.stats.lifeSteal > 0) {
          this.heal(Math.max(1, Math.round(dmg * this.stats.lifeSteal)));
        }
        if (killed) {
          Particles.burst(e.pos.x, e.pos.y, 20, e.color, 160, 4);
          if (this.stats.killHeal > 0) this.heal(this.stats.killHeal);
          if (this.stats.explodeOnKill) {
            for (const other of room.enemies) {
              if (!other.dead && other !== e && other.pos.dist(e.pos) < 110) {
                other.takeDamage(28);
                Particles.damage(other.pos.x, other.pos.y, 28);
              }
            }
            Particles.burst(e.pos.x, e.pos.y, 20, '#f80', 180, 5);
            Logger.log('BOON', 'explodeOnKill triggered via melee');
          }
          // Kill-based boon effects
          if (this.stats.killCDReduc > 0) {
            this.atkTimer  = Math.max(0, this.atkTimer  - this.stats.killCDReduc);
            this.castTimer = Math.max(0, this.castTimer - this.stats.killCDReduc);
            this.blastTimer= Math.max(0, this.blastTimer- this.stats.killCDReduc);
          }
          this.meleeKills++;
          Logger.log('KILL', `${e.constructor.name} killed by melee`);
        }
      }
      Logger.log('ABILITY', `Melee swing: ${hitCount} hit(s), dmgMult=${this.stats.dmgMult.toFixed(2)}`);
    }

    // ── CAST  (Right Click) ────────────────────────────────
    if (Input.isCast() && this.castTimer <= 0) {
      this.castTimer = this.castCooldown;
      const dir = new Vec2(mx - this.pos.x, my - this.pos.y).norm();
      const spd = 510;
      const fireShot = (angle) => {
        const d = Vec2.fromAngle(angle);
        const proj = new Projectile(
          this.pos.x + d.x*(this.r+5), this.pos.y + d.y*(this.r+5),
          d.x*spd, d.y*spd, 9, this.castDmg, true, '#7af',
          this.stats.pierce, this.stats.bleed
        );
        if (this.stats.projectileHoming)    proj.homing    = true;
        if (this.stats.projectileExplosion) proj.explosion = true;
        if (this.stats.projectileBounce)    proj.bounceLeft = this.stats.projectileBounce;
        room.projectiles.push(proj);
      };

      const base = dir.angle();
      // Priorité : tripleShot > twinShot > projectileCount > single
      if (this.stats.tripleShot) {
        fireShot(base-0.25); fireShot(base); fireShot(base+0.25);
        Logger.log('ABILITY', `Triple cast fired (dmg=${this.castDmg}×3)`);
      } else if (this.stats.twinShot) {
        fireShot(base-0.1); fireShot(base+0.1);
        Logger.log('ABILITY', `Twin cast fired (dmg=${this.castDmg}×2)`);
      } else {
        const count = this.stats.projectileCount || 1;
        for (let i = 0; i < count; i++) {
          const spread = (i - (count-1)/2) * 0.15;
          fireShot(base + spread);
        }
        if (count > 1) Logger.log('ABILITY', `Multi cast fired (dmg=${this.castDmg}×${count})`);
        else Logger.log('ABILITY', `Cast fired (dmg=${this.castDmg})`);
      }

      // Rafale (burstShot) : queues 2 extra shots with 0.1s delay
      if (this.stats.burstShot > 0) {
        this._burstQueue = 2;
        this._burstDelay = 0.1;
        this._burstDir   = dir.clone ? dir.clone() : new Vec2(dir.x, dir.y);
      }
    }

    // ── BLAST  (E key) ─────────────────────────────────────
    if (Input.justPressed('KeyE') && this.blastTimer <= 0) {
      this.blastTimer = this.blastCooldown;
      let blastHits = 0;
      const dmg = this.blastDmg;
      for (const e of room.enemies) {
        if (e.dead) continue;
        if (this.pos.dist(e.pos) < this.blastRadius + e.r) {
          e.takeDamage(dmg, this.stats.bleed);
          if (this.stats.chill) e.chill();
          e.knockback(this.pos.x, this.pos.y, 320);
          Particles.damage(e.pos.x, e.pos.y, dmg);
          if (this.stats.lifeSteal > 0) this.heal(Math.max(1, Math.round(dmg * this.stats.lifeSteal)));
          blastHits++;
        }
      }
      // Visual: big burst + expanding ring stored in player
      this.blastAnim = { r: 10, maxR: this.blastRadius + 20, life: 0.5 };
      Particles.burst(this.pos.x, this.pos.y, 50, '#88f', 280, 5);
      Particles.burst(this.pos.x, this.pos.y, 20, '#fff', 150, 2);
      for (let i = 0; i < 12; i++) {
        const a = (i/12)*TAU;
        Particles.burst(this.pos.x + Math.cos(a)*80, this.pos.y + Math.sin(a)*80, 4, '#a8f', 60, 2);
      }
      Logger.log('ABILITY', `Blast: hit ${blastHits} enemies for ${dmg}`);
    }
    // Advance blast animation
    if (this.blastAnim) {
      this.blastAnim.r += (this.blastAnim.maxR / 0.3) * dt;
      this.blastAnim.life -= dt;
      if (this.blastAnim.life <= 0 || this.blastAnim.r >= this.blastAnim.maxR) this.blastAnim = null;
    }
  }

  draw(ctx) {
    if (this.isSpectator) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    if (this.dead) return;
    ctx.save();

    // Blast shockwave ring
    if (this.blastAnim) {
      const a = this.blastAnim.life / 0.5;
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = '#a8f';
      ctx.lineWidth   = 4 * a;
      ctx.shadowColor = '#88f';
      ctx.shadowBlur  = 20;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.blastAnim.r, 0, TAU); ctx.stroke();
      // Inner ring
      ctx.lineWidth   = 2 * a;
      ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.blastAnim.r * 0.6, 0, TAU); ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
    }

    // Ghost afterimage trail during dash
    if (this._dashTrail && this._dashTrail.length > 0 && this.dashTimer > 0) {
      for (let i = 0; i < this._dashTrail.length; i++) {
        const alpha = (1 - i / this._dashTrail.length) * 0.55;
        const r = this.r * Math.max(0.3, 1 - i * 0.1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#8ff';
        ctx.shadowColor = '#8ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this._dashTrail[i].x, this._dashTrail[i].y, r, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // Dash trail
    if (this.dashTimer > 0) {
      ctx.globalAlpha = this.dashTimer / 0.18 * 0.5;
      ctx.fillStyle = '#8ff';
      ctx.beginPath();
      ctx.arc(this.pos.x - this.dashVel.x*0.03, this.pos.y - this.dashVel.y*0.03, this.r*0.8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y+this.r*0.6, this.r*0.9, this.r*0.3, 0, 0, TAU);
    ctx.fill();

    if (this.dashInvincible && Math.floor(Date.now()/50)%2===0) { ctx.restore(); return; }

    // Low HP warning pulse
    const hpRatio = this.hp / this.maxHp;
    if (hpRatio < 0.3) {
      ctx.shadowColor = '#f00';
      ctx.shadowBlur  = 20 + Math.sin(Date.now()*0.008) * 10;
    } else {
      ctx.shadowColor = this.hitTimer > 0 ? '#f44' : '#7af';
      ctx.shadowBlur  = this.hitTimer > 0 ? 20 : 12;
    }

    ctx.fillStyle = this.hitTimer > 0 ? '#f88' : (hpRatio < 0.3 ? '#ff8080' : '#d0e8ff');
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r, 0, TAU); ctx.fill();
    ctx.fillStyle = hpRatio < 0.3 ? '#d44' : '#8cc';
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r*0.5, 0, TAU); ctx.fill();

    // Weapon line
    const wx = Math.cos(this.angle), wy = Math.sin(this.angle);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const weapLen = this.r + 14 + (this.atkAnim > 0 ? 10 : 0);
    ctx.beginPath();
    ctx.moveTo(this.pos.x + wx*this.r*0.7, this.pos.y + wy*this.r*0.7);
    ctx.lineTo(this.pos.x + wx*weapLen,    this.pos.y + wy*weapLen);
    ctx.stroke();

    // Melee arc
    if (this.atkAnim > 0) {
      const t = this.atkAnim / 0.18;
      ctx.globalAlpha = t * 0.5;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.meleeRange*0.65,
              this.angle - this.meleeAngle, this.angle + this.meleeAngle);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  drawHUD(ctx) {
    // === HP BAR ===
    const bx = 20, by = H-50, bw = 220, bh = 18;
    ctx.fillStyle = '#300'; ctx.fillRect(bx, by, bw, bh);
    const hpRatio = this.hp / this.maxHp;
    const hpColor = hpRatio > 0.5 ? '#e44' : hpRatio > 0.25 ? '#e84' : '#f00';
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, bw * Math.max(0, hpRatio), bh);
    ctx.strokeStyle = '#600'; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(Math.max(0, this.hp))} / ${this.maxHp}`, bx+bw/2, by+13);
    ctx.fillStyle = '#ccc'; ctx.textAlign = 'left'; ctx.font = '11px Georgia';
    ctx.fillText('PV', bx+bw+6, by+13);

    // === DASH ===
    for (let i = 0; i < this.stats.dashCharges; i++) {
      const dx = 20 + i*32, dy = H-78;
      const charged = this.dashCooldowns[i] <= 0;
      ctx.fillStyle = charged ? '#8ff' : '#244';
      ctx.beginPath(); ctx.arc(dx+12, dy+12, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(dx+12, dy+12, 10, 0, TAU); ctx.stroke();
      if (!charged) {
        const prog = 1 - this.dashCooldowns[i] / 1.8;
        ctx.strokeStyle = '#8ff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(dx+12, dy+12, 10, -Math.PI/2, -Math.PI/2 + prog*TAU); ctx.stroke();
      }
    }
    ctx.fillStyle = '#8ff'; ctx.font = '10px Georgia'; ctx.textAlign = 'left';
    ctx.fillText('DASH', 20 + this.stats.dashCharges*32 + 4, H-68);

    // === COOLDOWN BARS ===
    const bars = [
      { label:'ATK', timer:this.atkTimer, cd:this.atkCooldown, color:'#fa0', y:H-120 },
      { label:'SORT', timer:this.castTimer, cd:this.castCooldown, color:'#7af', y:H-108 },
      { label:`BLAST ${this.blastTimer > 0 ? Math.ceil(this.blastTimer)+'s' : 'PRÊT'}`,
        timer:this.blastTimer, cd:this.blastCooldown, color:'#88f', y:H-96 },
    ];
    for (const b of bars) {
      const prog = 1 - b.timer / b.cd;
      ctx.fillStyle = '#222'; ctx.fillRect(20, b.y, 55, 6);
      ctx.fillStyle = b.color; ctx.fillRect(20, b.y, 55 * Math.min(1, prog), 6);
      ctx.fillStyle = b.color; ctx.font = '10px Georgia'; ctx.textAlign = 'left';
      ctx.fillText(b.label, 78, b.y+6);
    }
  }
}
