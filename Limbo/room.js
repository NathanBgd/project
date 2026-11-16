'use strict';

class Obstacle {
  constructor(x, y, w, h) { this.x=x; this.y=y; this.w=w; this.h=h; }
}

const OBSTACLE_LAYOUTS = [
  // 0: empty room
  [],
  // 1: corner pillars
  (cx, cy) => [
    new Obstacle(cx-280, cy-160, 50, 50), new Obstacle(cx+230, cy-160, 50, 50),
    new Obstacle(cx-280, cy+110, 50, 50), new Obstacle(cx+230, cy+110, 50, 50),
  ],
  // 2: cardinal cross (open center)
  (cx, cy) => [
    new Obstacle(cx-25, cy-130, 50, 50), new Obstacle(cx-25, cy+80,  50, 50),
    new Obstacle(cx-130, cy-25, 50, 50), new Obstacle(cx+80,  cy-25, 50, 50),
  ],
  // 3: side walls with gap
  (cx, cy) => [
    new Obstacle(cx-320, cy-180, 50, 160), new Obstacle(cx-320, cy+20, 50, 160),
    new Obstacle(cx+270, cy-180, 50, 160), new Obstacle(cx+270, cy+20, 50, 160),
  ],
  // 4: scattered rocks
  (cx, cy) => {
    const positions = [[-220,-120],[180,-140],[-100,120],[240,100],[-280,60],[80,-60]];
    return positions.map(([dx,dy]) => new Obstacle(cx+dx, cy+dy, 40, 40));
  },
  // 5: hexagon ring
  (cx, cy) => {
    const obs = [];
    for (let i=0; i<6; i++) {
      const a = (i/6)*TAU;
      obs.push(new Obstacle(cx+Math.cos(a)*185-20, cy+Math.sin(a)*135-20, 40, 40));
    }
    return obs;
  },
  // 6: diagonal corridor (top-left → bottom-right)
  (cx, cy) => [
    new Obstacle(cx-230, cy-180, 55, 55), new Obstacle(cx-115, cy-90, 55, 55),
    new Obstacle(cx+115, cy+90,  55, 55), new Obstacle(cx+230, cy+180, 55, 55),
  ],
  // 7: plus / cross
  (cx, cy) => [
    new Obstacle(cx-25, cy-110, 50, 60), new Obstacle(cx-25, cy+50,  50, 60),
    new Obstacle(cx-140, cy-25, 60, 50), new Obstacle(cx+80,  cy-25, 60, 50),
    new Obstacle(cx-25,  cy-25, 50, 50),
  ],
  // 8: perimeter ring (compass)
  (cx, cy) => {
    const positions = [[-270,0],[270,0],[0,-185],[0,165],[-180,-125],[180,125],[-180,125],[180,-125]];
    return positions.map(([dx,dy]) => new Obstacle(cx+dx-18, cy+dy-18, 36, 36));
  },
  // 9: T-barrier top
  (cx, cy) => [
    new Obstacle(cx-180, cy-130, 180, 45), // top horizontal
    new Obstacle(cx-25,  cy-130, 50,  120), // vertical stem
    new Obstacle(cx-200, cy+80,  80,  45),
    new Obstacle(cx+120, cy+80,  80,  45),
  ],
  // 10: L-corner barricades
  (cx, cy) => [
    new Obstacle(cx-300, cy-180, 120, 40), new Obstacle(cx-300, cy-180, 40, 120),
    new Obstacle(cx+180, cy+100, 120, 40), new Obstacle(cx+260, cy-20,  40, 120),
  ],
  // 11: zigzag funnels
  (cx, cy) => [
    new Obstacle(cx-320, cy-100, 160, 40),
    new Obstacle(cx+160, cy-10,  160, 40),
    new Obstacle(cx-320, cy+80,  160, 40),
  ],
  // 12: arena pillars (inner ring tight)
  (cx, cy) => {
    const obs = [];
    for (let i=0; i<4; i++) {
      const a = (i/4)*TAU + Math.PI/4;
      obs.push(new Obstacle(cx+Math.cos(a)*140-24, cy+Math.sin(a)*100-24, 48, 48));
    }
    obs.push(new Obstacle(cx-24, cy-24, 48, 48)); // center block
    return obs;
  },
  // 13: dual long walls (vertical)
  (cx, cy) => [
    new Obstacle(cx-180, cy-180, 40, 240),
    new Obstacle(cx+140, cy-60,  40, 240),
  ],
  // 14: chessboard 3×2
  (cx, cy) => {
    const obs = [];
    const cols = [-200, -40, 120], rows = [-110, 60];
    for (const dx of cols) for (const dy of rows) obs.push(new Obstacle(cx+dx, cy+dy, 44, 44));
    return obs;
  },
  // 15: star burst (8 points)
  (cx, cy) => {
    const obs = [];
    for (let i=0; i<8; i++) {
      const a = (i/8)*TAU;
      const r = i%2 === 0 ? 200 : 115;
      obs.push(new Obstacle(cx+Math.cos(a)*r-18, cy+Math.sin(a)*r*0.75-18, 36, 36));
    }
    return obs;
  },
];

// ═══════════════════════════════════════════════════════════
//  ROOM
// ═══════════════════════════════════════════════════════════
class Room {
  constructor(depth, isBoss = false, perfMult = 1.0) {
    this.depth    = depth;
    this.isBoss   = isBoss;
    this.perfMult = perfMult;
    this.cleared  = false;
    this._boonTriggered = false;
    this.enemies  = [];
    this.projectiles = [];
    this.obstacles = [];

    // ── Depth-tier room theming ──────────────────────────────
    if (isBoss) {
      this.floorColor   = '#1e1020';
      this.wallColor    = '#3a1828';
      this.accentColor  = '#603040';
      this.gridColor    = 'rgba(100,20,50,0.14)';
      this.tierName     = 'Boss';
    } else if (depth <= 5) {
      // Tier 1: Limbes — cool purple-blue
      this.floorColor   = '#12102a';
      this.wallColor    = '#1e1c38';
      this.accentColor  = '#282860';
      this.gridColor    = 'rgba(60,60,120,0.12)';
      this.tierName     = 'Limbes';
    } else if (depth <= 10) {
      // Tier 2: Achéron — dark teal-grey
      this.floorColor   = '#0d1620';
      this.wallColor    = '#182030';
      this.accentColor  = '#203040';
      this.gridColor    = 'rgba(30,80,100,0.14)';
      this.tierName     = 'Achéron';
    } else if (depth <= 15) {
      // Tier 3: Érèbe — dark emerald
      this.floorColor   = '#0a1510';
      this.wallColor    = '#152018';
      this.accentColor  = '#1e3028';
      this.gridColor    = 'rgba(20,80,40,0.14)';
      this.tierName     = 'Érèbe';
    } else if (depth <= 24) {
      // Tier 4: Tourment — crimson-dark
      this.floorColor   = '#180a0a';
      this.wallColor    = '#280f0f';
      this.accentColor  = '#401010';
      this.gridColor    = 'rgba(100,20,20,0.16)';
      this.tierName     = 'Tourment';
    } else if (depth <= 34) {
      // Tier 5: Supplice — searing amber-black
      this.floorColor   = '#1a1000';
      this.wallColor    = '#281a00';
      this.accentColor  = '#402800';
      this.gridColor    = 'rgba(100,60,10,0.16)';
      this.tierName     = 'Supplice';
    } else {
      // Tier 6: Chaos — void purple-black
      this.floorColor   = '#0d0510';
      this.wallColor    = '#180820';
      this.accentColor  = '#2a0840';
      this.gridColor    = 'rgba(80,10,120,0.18)';
      this.tierName     = 'Chaos';
    }

    const cx = PLAY.x + PLAY.w/2;
    const cy = PLAY.y + PLAY.h/2;

    if (!isBoss) {
      // Deeper rooms favour more complex (higher-index) layouts
      const minIdx = depth <= 5 ? 1 : depth <= 10 ? 1 : depth <= 15 ? 3 : 4;
      const idx = RunRNG.randInt(minIdx, OBSTACLE_LAYOUTS.length-1);
      const layout = OBSTACLE_LAYOUTS[idx];
      this.obstacles = typeof layout === 'function' ? layout(cx, cy) : [];
    }

    this._spawnEnemies(depth, isBoss, cx, cy);

    // Apply performance multiplier to all enemy stats post-spawn
    if (perfMult !== 1.0) {
      for (const e of this.enemies) {
        if (e.maxHp != null) {
          e.maxHp = Math.round(e.maxHp * perfMult);
          e.hp    = e.maxHp;
        }
        if (e.dmg  != null) e.dmg  = Math.round(e.dmg  * perfMult);
        // Also scale boss-specific damage fields
        if (e.chargeDmg  != null) e.chargeDmg  = Math.round(e.chargeDmg  * perfMult);
        if (e.explodeDmg != null) e.explodeDmg = Math.round(e.explodeDmg * perfMult);
        if (e.slamDmg    != null) e.slamDmg    = Math.round(e.slamDmg    * perfMult);
      }
    }

    Logger.log('ROOM', `Room loaded: depth=${depth} isBoss=${isBoss} perfMult=${perfMult.toFixed(2)}`, {
      enemies: this.enemies.map(e => e.constructor.name),
      obstacles: this.obstacles.length
    });
  }

  // forbidX/forbidY = player start position, minDist = minimum distance from player
  _safePos(forbidX, forbidY, minDist = 220) {
    let tries = 0;
    while (tries++ < 100) {
      const x = rand(PLAY.x + 45, PLAY.x + PLAY.w - 45);
      const y = rand(PLAY.y + 45, PLAY.y + PLAY.h - 45);
      if (Math.hypot(x - forbidX, y - forbidY) < minDist) continue;
      let ok = true;
      for (const o of this.obstacles) {
        if (circleRect(x, y, 36, o.x, o.y, o.w, o.h)) { ok=false; break; }
      }
      if (ok) return { x, y };
    }
    // Fallback: top half of room (player is at bottom)
    return {
      x: rand(PLAY.x+60, PLAY.x+PLAY.w-60),
      y: rand(PLAY.y+60, PLAY.y+PLAY.h*0.4)
    };
  }

  _spawn(type, playerStartX, playerStartY, depth) {
    const p = this._safePos(playerStartX, playerStartY);
    switch(type) {
      case 'shade':   return new Shade(p.x, p.y, depth);
      case 'lancer':  return new Lancer(p.x, p.y, depth);
      case 'archer':  return new Archer(p.x, p.y, depth);
      case 'brute':   return new Brute(p.x, p.y, depth);
      case 'wraith':  return new Wraith(p.x, p.y, depth);
      case 'specter': return new Specter(p.x, p.y, depth);
      case 'bomb':    return new BombRunner(p.x, p.y, depth);
      case 'cultist': return new Cultist(p.x, p.y, depth);
      case 'reaper':  return new Reaper(p.x, p.y, depth);
      case 'venom':   return new VenomSpitter(p.x, p.y, depth);
      case 'golem':   return new Golem(p.x, p.y, depth);
    }
  }

  _spawnEnemies(depth, isBoss, cx, cy) {
    const playerX = W/2, playerY = PLAY.y + PLAY.h - 65;
    if (isBoss) {
      const bossNumber = Math.ceil(depth / 5);
      const isMini     = bossNumber % 2 === 1; // odd floors = mini, even = maxi
      // depth 25+ : boss level bonus +1
      const bossLevelBonus = depth >= 25 ? 1 : 0;
      if (isMini) {
        // depth 20+ : mini-boss avec le scaling amélioré (bossLevel augmenté)
        const miniLevel = depth >= 20 ? bossNumber + bossLevelBonus : bossNumber;
        this.enemies.push(new MiniBoss(cx, PLAY.y + 110, miniLevel));
      } else {
        this.enemies.push(new Warden(cx, PLAY.y + 110, bossNumber + bossLevelBonus));
      }
      return;
    }
    // ── Phase indicator log ──────────────────────────────
    const phase = depth <= 15 ? 'Normal' : depth <= 30 ? 'Tourment' : depth <= 50 ? 'Supplice' : 'Chaos';
    Logger.log('ROOM', `Phase: ${phase} (depth=${depth})`);

    let mainPool, elitePool;
    if (depth <= 2)       { mainPool=['shade','shade'];                              elitePool=[]; }
    else if (depth <= 4)  { mainPool=['shade','lancer'];                             elitePool=['specter']; }
    else if (depth <= 6)  { mainPool=['shade','lancer','archer'];                    elitePool=['specter','bomb']; }
    else if (depth <= 9)  { mainPool=['lancer','archer','brute','reaper'];           elitePool=['specter','bomb','cultist']; }
    else if (depth <= 12) { mainPool=['lancer','archer','brute','wraith','reaper'];  elitePool=['specter','bomb','cultist','venom']; }
    else if (depth <= 14) { mainPool=['archer','brute','wraith','cultist','reaper']; elitePool=['specter','bomb','venom','golem']; }
    else if (depth <= 19) {
      // depth 15+ : Shades out, Specters/advanced only
      mainPool=['specter','wraith','reaper','venom'];
      elitePool=['specter','bomb','golem','wraith','reaper'];
    } else if (depth <= 24) {
      // depth 20+ : only advanced enemies
      mainPool=['reaper','venom','golem','specter','archer','bomb'];
      elitePool=['golem','reaper','specter','venom'];
    } else if (depth <= 34) {
      // depth 25+ : élites doublées dans le pool
      mainPool=['reaper','venom','golem','specter','archer','bomb','reaper','venom','golem','specter'];
      elitePool=['golem','reaper','specter','venom','golem','reaper','specter','venom'];
    } else {
      // depth 35+ : golem et reaper encore plus fréquents
      mainPool=['reaper','venom','golem','specter','archer','bomb','reaper','venom','golem','specter','golem','reaper','golem','reaper'];
      elitePool=['golem','reaper','specter','venom','golem','reaper','golem','reaper'];
    }

    // ── Nombre d'ennemis par salle (scaling infini) ──────
    let baseCount;
    if (depth <= 15) {
      baseCount = Math.min(2 + Math.floor(depth * 0.45), 5);
    } else if (depth <= 30) {
      baseCount = Math.min(5 + Math.floor((depth - 15) / 3), 8);
    } else {
      baseCount = Math.min(8 + Math.floor((depth - 30) / 2), 12);
    }
    const count = baseCount;
    for (let i = 0; i < count; i++) {
      const e = this._spawn(RunRNG.from(mainPool), playerX, playerY, depth);
      if (e) this.enemies.push(e);
    }
    const eliteChance = depth <= 6 ? 0.4 : 0.6;
    if (depth >= 4 && elitePool.length > 0 && RunRNG.bool(eliteChance)) {
      const e = this._spawn(RunRNG.from(elitePool), playerX, playerY, depth);
      if (e) this.enemies.push(e);
    }
    if (depth >= 8 && elitePool.length > 0 && RunRNG.bool(0.45)) {
      const e = this._spawn(RunRNG.from(elitePool), playerX, playerY, depth);
      if (e) this.enemies.push(e);
    }
    if (depth >= 11 && RunRNG.bool(0.4)) {
      const e = this._spawn('golem', playerX, playerY, depth);
      if (e) this.enemies.push(e);
    }
  }

  get isCleared() { return this.enemies.every(e => e.dead); }

  update(dt, player) {
    if (this.cleared) return;

    for (const e of this.enemies) {
      if (e.dead) continue;
      const result = e.update(dt, player, this.obstacles, this.projectiles);
      // Death effect
      if (e.dead && !e._deathFX) {
        e._deathFX = true;
        Particles.death(e.pos.x, e.pos.y, e.color || '#f88', e.r || 18);
      }
      if (result && Array.isArray(result)) {
        const cx = PLAY.x + PLAY.w/2, cy = PLAY.y + PLAY.h/2;
        for (const type of result) {
          const p = {
            x: clamp(e.pos.x + rand(-90,90), PLAY.x+30, PLAY.x+PLAY.w-30),
            y: clamp(e.pos.y + rand(-70,70), PLAY.y+30, PLAY.y+PLAY.h-30),
          };
          let spawn = null;
          if (type === 'shade')   spawn = new Shade(p.x, p.y, this.depth);
          if (type === 'specter') spawn = new Specter(p.x, p.y, this.depth);
          if (spawn) {
            this.enemies.push(spawn);
            Logger.log('SPAWN', `Boss summoned ${type}`);
          }
        }
      }
    }

    // ── Projectile updates ───────────────────────────────
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.update(dt, this.obstacles, this.enemies);

      if (p.fromPlayer) {
        // ── Player projectile hits enemy ─────────────────
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (!circleCircle(p.pos.x, p.pos.y, p.r, e.pos.x, e.pos.y, e.r)) continue;

          const isCrit  = Math.random() < 0.1;
          const finalDmg = isCrit ? Math.floor(p.dmg * 1.75) : p.dmg;
          const killed   = e.takeDamage(finalDmg, p.bleed);
          const ps       = player.stats;

          // ── Apply ALL boon effects on projectile hit ──
          if (ps.chill && Math.random() < 0.3) {
            e.chill();
            Logger.log('BOON', 'chill applied via projectile');
          }
          if (ps.lifeSteal > 0) {
            const heal = Math.max(1, Math.round(finalDmg * ps.lifeSteal));
            player.heal(heal);
            Logger.log('BOON', `lifeSteal healed ${heal} via projectile`);
          }
          // Impact Explosif : AoE 65px, 50% dmg
          if (p.explosion) {
            const aoeR = 65, aoeDmg = Math.round(finalDmg * 0.5);
            for (const other of this.enemies) {
              if (!other.dead && other !== e && other.pos.dist(e.pos) < aoeR + other.r) {
                other.takeDamage(aoeDmg);
                Particles.damage(other.pos.x, other.pos.y, aoeDmg);
              }
            }
            Particles.burst(e.pos.x, e.pos.y, 15, '#ff8040', aoeR, 3);
            Logger.log('BOON', `impact_explosif AoE ${aoeDmg} dmg r=${aoeR}`);
          }

          Particles.damage(e.pos.x, e.pos.y - e.r, finalDmg, isCrit);
          Particles.sparks(p.pos.x, p.pos.y, 6, '#7af');
          e.knockback(p.pos.x, p.pos.y, 150);

          Logger.log('DAMAGE', `Player projectile hit ${e.constructor.name} for ${finalDmg}${isCrit?' CRIT':''}`, { killed });

          if (killed) {
            Particles.burst(e.pos.x, e.pos.y, 22, e.color, 170, 4);
            if (ps.killHeal > 0) {
              player.heal(ps.killHeal);
              Logger.log('BOON', `killHeal +${ps.killHeal} from projectile kill`);
            }
            if (ps.explodeOnKill) {
              for (const other of this.enemies) {
                if (!other.dead && other !== e && other.pos.dist(e.pos) < 110) {
                  other.takeDamage(28);
                  Particles.damage(other.pos.x, other.pos.y, 28);
                }
              }
              Particles.burst(e.pos.x, e.pos.y, 25, '#f80', 190, 5);
              Logger.log('BOON', 'explodeOnKill triggered via projectile');
            }
            // Kill-based boon effects
            if (player.stats.killCDReduc > 0) {
              player.atkTimer  = Math.max(0, player.atkTimer  - player.stats.killCDReduc);
              player.castTimer = Math.max(0, player.castTimer - player.stats.killCDReduc);
              player.blastTimer= Math.max(0, player.blastTimer- player.stats.killCDReduc);
            }
            player.rangedKills++;
            Logger.log('KILL', `${e.constructor.name} killed by projectile`);
          }

          if (!p.pierce) { p.dead = true; break; }
          else { p.hits++; if (p.hits > 3) { p.dead = true; break; } }
        }
      } else {
        // ── Enemy projectile hits player ─────────────────
        if (!player.dashInvincible && circleCircle(p.pos.x, p.pos.y, p.r, player.pos.x, player.pos.y, player.r)) {
          player.takeDamage(p.dmg, p.sourceEnemy);
          p.dead = true;
          // RevengeDmg: damage nearby enemies when player is hit
          if (player.stats.revengeDmg > 0 && p.sourceEnemy && !p.sourceEnemy.dead) {
            p.sourceEnemy.takeDamage(player.stats.revengeDmg);
            Particles.damage(p.sourceEnemy.pos.x, p.sourceEnemy.pos.y, player.stats.revengeDmg);
            Logger.log('BOON', `revengeDmg ${player.stats.revengeDmg} → ${p.sourceEnemy.constructor.name}`);
          }
        }
      }
    }

    // NE PAS filtrer this.enemies — on garde les morts pour conserver les indices stables (sync coop)
    this.projectiles = this.projectiles.filter(p => !p.dead);

    if (this.enemies.length > 0 && this.enemies.every(e => e.dead) && !this.cleared) {
      this.cleared = true;
      Logger.log('ROOM', `Room cleared at depth ${this.depth}`);
    }
  }

  draw(ctx) {
    this._drawRoom(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
  }

  _drawRoom(ctx) {
    const { x, y, w, h } = PLAY;
    ctx.fillStyle = this.floorColor;
    ctx.fillRect(x, y, w, h);

    // Subtle floor grid (uses tier color)
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1;
    const gs = 48;
    for (let gx = PLAY.x; gx <= PLAY.x+PLAY.w; gx += gs) {
      ctx.beginPath(); ctx.moveTo(gx, PLAY.y); ctx.lineTo(gx, PLAY.y+PLAY.h); ctx.stroke();
    }
    for (let gy = PLAY.y; gy <= PLAY.y+PLAY.h; gy += gs) {
      ctx.beginPath(); ctx.moveTo(PLAY.x, gy); ctx.lineTo(PLAY.x+PLAY.w, gy); ctx.stroke();
    }

    // Corner decorations
    const corners = [[PLAY.x, PLAY.y],[PLAY.x+PLAY.w, PLAY.y],[PLAY.x, PLAY.y+PLAY.h],[PLAY.x+PLAY.w, PLAY.y+PLAY.h]];
    corners.forEach(([cx2, cy2], i) => {
      const sx2 = i%2===0?1:-1, sy2 = i<2?1:-1;
      ctx.strokeStyle = this.accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx2+sx2*2, cy2+sy2*20); ctx.lineTo(cx2+sx2*2, cy2+sy2*2); ctx.lineTo(cx2+sx2*20, cy2+sy2*2); ctx.stroke();
    });

    // Depth tier label (subtle, top-left)
    if (!this.isBoss) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Georgia';
      ctx.textAlign = 'left';
      ctx.fillText(this.tierName.toUpperCase(), PLAY.x + 14, PLAY.y + 20);
      ctx.restore();
    }

    if (this.isBoss) {
      const pulse = 0.03 + 0.015 * Math.sin(Date.now() * 0.0008);
      const grad = ctx.createRadialGradient(PLAY.x+PLAY.w/2, PLAY.y+PLAY.h/2, 0, PLAY.x+PLAY.w/2, PLAY.y+PLAY.h/2, 400);
      grad.addColorStop(0, `rgba(150,20,60,${pulse})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
    }

    // Stone tiles
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const tile = 60;
    for (let tx = x; tx < x+w; tx += tile) {
      ctx.beginPath(); ctx.moveTo(tx,y); ctx.lineTo(tx,y+h); ctx.stroke();
    }
    for (let ty = y; ty < y+h; ty += tile) {
      ctx.beginPath(); ctx.moveTo(x,ty); ctx.lineTo(x+w,ty); ctx.stroke();
    }

    // Boss room: pentagram on floor
    if (this.isBoss) {
      const cx = x + w/2, cy = y + h/2;
      ctx.save();
      ctx.strokeStyle = 'rgba(200,0,0,0.12)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a1 = (i/5)*TAU - Math.PI/2;
        const a2 = ((i+2)/5)*TAU - Math.PI/2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a1)*180, cy + Math.sin(a1)*180);
        ctx.lineTo(cx + Math.cos(a2)*180, cy + Math.sin(a2)*180);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, 185, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // Vignette
    const vig = ctx.createRadialGradient(x+w/2, y+h/2, Math.min(w,h)*0.2, x+w/2, y+h/2, Math.max(w,h)*0.75);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig; ctx.fillRect(x, y, w, h);

    // Obstacles
    for (const o of this.obstacles) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(o.x+5, o.y+7, o.w, o.h);
      // Face
      ctx.fillStyle = this.wallColor;
      _roundRect(ctx, o.x, o.y, o.w, o.h, 5); ctx.fill();
      // Top highlight (tier tinted)
      const topGrad = ctx.createLinearGradient(o.x, o.y, o.x, o.y+o.h*0.5);
      topGrad.addColorStop(0, this.isBoss ? 'rgba(220,80,120,0.35)' : 'rgba(180,180,255,0.14)');
      topGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topGrad; _roundRect(ctx, o.x, o.y, o.w, o.h*0.5, 5); ctx.fill();
      // Border
      ctx.strokeStyle = this.accentColor; ctx.lineWidth = 1.5;
      _roundRect(ctx, o.x, o.y, o.w, o.h, 5); ctx.stroke();
    }

    this._drawWalls(ctx);
  }

  _drawWalls(ctx) {
    const { x, y, w, h } = PLAY;
    const wall = 12;
    ctx.fillStyle = this.wallColor;
    ctx.fillRect(x-wall, y-wall, w+wall*2, wall);
    ctx.fillRect(x-wall, y+h, w+wall*2, wall);
    ctx.fillRect(x-wall, y, wall, h);
    ctx.fillRect(x+w, y, wall, h);

    const doorW = 70;
    const dColor = this.cleared ? '#302850' : '#1a1020';
    ctx.fillStyle = dColor;
    ctx.fillRect(x+w/2-doorW/2, y-wall, doorW, wall+5);
    ctx.fillRect(x+w/2-doorW/2, y+h-5, doorW, wall+5);
    ctx.fillRect(x-wall, y+h/2-doorW/2, wall+5, doorW);
    ctx.fillRect(x+w-5, y+h/2-doorW/2, wall+5, doorW);

    if (!this.cleared) {
      ctx.strokeStyle = '#8060a0'; ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const off = -doorW/2 + 15 + i*20;
        ctx.beginPath(); ctx.moveTo(x+w/2+off, y-wall); ctx.lineTo(x+w/2+off, y+2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+w/2+off, y+h-2); ctx.lineTo(x+w/2+off, y+h+wall); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x-wall, y+h/2+off); ctx.lineTo(x+2, y+h/2+off); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+w-2, y+h/2+off); ctx.lineTo(x+w+wall, y+h/2+off); ctx.stroke();
      }
    }

    ctx.strokeStyle = '#3a3060'; ctx.lineWidth = 2;
    ctx.strokeRect(x-wall, y-wall, w+wall*2, h+wall*2);

    // Animated wall border for boss rooms
    if (this.isBoss) {
      const t = Date.now() * 0.001;
      ctx.strokeStyle = `hsl(${340 + Math.sin(t)*15}, 80%, ${25 + Math.sin(t*0.7)*5}%)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
    }
  }
}
