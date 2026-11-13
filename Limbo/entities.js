'use strict';

// ═══════════════════════════════════════════════════════════
//  INFINITE DIFFICULTY SCALING HELPERS
// ═══════════════════════════════════════════════════════════
// Scaling factor for infinite difficulty: accelerates beyond depth 15
function infiniteScale(depth) {
  if (depth <= 15) return 1.0;
  // Each depth beyond 15 adds 6% multiplicative bonus
  return 1.0 + (depth - 15) * 0.06;
}

// Boss scaling (softer): 4% per depth beyond 15
function bossInfiniteScale(depth) {
  if (depth <= 15) return 1.0;
  return 1.0 + (depth - 15) * 0.04;
}

// ═══════════════════════════════════════════════════════════
//  PROJECTILE
// ═══════════════════════════════════════════════════════════
class Projectile {
  constructor(x, y, vx, vy, r, dmg, fromPlayer, color = '#7af', pierce = false, bleed = false) {
    this.pos        = new Vec2(x, y);
    this.vel        = new Vec2(vx, vy);
    this.r          = r;
    this.dmg        = dmg;
    this.fromPlayer = fromPlayer;
    this.color      = color;
    this.pierce     = pierce;
    this.bleed      = bleed;
    this.dead       = false;
    this.hits       = 0;
    this.trail      = [];
    this.sourceEnemy= null; // for revenge mechanic
  }

  update(dt, obstacles, enemies) {
    this.trail.unshift({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > 7) this.trail.pop();

    // Homing : légère attraction vers l'ennemi le plus proche
    if (this.homing && enemies) {
      let nearest = null, nearDist = 300;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y);
        if (d < nearDist) { nearDist = d; nearest = e; }
      }
      if (nearest) {
        const dx = nearest.pos.x - this.pos.x, dy = nearest.pos.y - this.pos.y;
        const dist = Math.hypot(dx, dy) || 1;
        const spd = Math.hypot(this.vel.x, this.vel.y);
        // Steer gently toward the nearest enemy
        this.vel.x += (dx/dist * spd - this.vel.x) * 3.5 * dt;
        this.vel.y += (dy/dist * spd - this.vel.y) * 3.5 * dt;
        // Keep constant speed
        const newSpd = Math.hypot(this.vel.x, this.vel.y) || 1;
        this.vel.x = this.vel.x / newSpd * spd;
        this.vel.y = this.vel.y / newSpd * spd;
      }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    if (this.pos.x < PLAY.x || this.pos.x > PLAY.x + PLAY.w ||
        this.pos.y < PLAY.y || this.pos.y > PLAY.y + PLAY.h) {
      this.dead = true; return;
    }
    for (const o of obstacles) {
      if (circleRect(this.pos.x, this.pos.y, this.r, o.x, o.y, o.w, o.h)) {
        // Ricochet : rebondir sur l'obstacle si bounceLeft > 0
        if (this.bounceLeft > 0) {
          this.bounceLeft--;
          // Bounce off the obstacle (simple axis reflection)
          // Try horizontal then vertical reflection
          const cx = o.x + o.w/2, cy = o.y + o.h/2;
          const dx = this.pos.x - cx, dy = this.pos.y - cy;
          if (Math.abs(dx / o.w) > Math.abs(dy / o.h)) {
            this.vel.x = -this.vel.x;
          } else {
            this.vel.y = -this.vel.y;
          }
          Particles.sparks(this.pos.x, this.pos.y, 3, this.color);
          return;
        }
        this.dead = true;
        Particles.sparks(this.pos.x, this.pos.y, 5, this.color);
        return;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.fromPlayer ? 12 : 8;
    for (let i = 0; i < this.trail.length; i++) {
      const a = (1 - i / this.trail.length) * 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, this.r * (1 - i / this.trail.length), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const grd = ctx.createRadialGradient(this.pos.x, this.pos.y, 0, this.pos.x, this.pos.y, this.r * 2.5);
    grd.addColorStop(0, this.color);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r * 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r * 0.6, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  ENEMY BASE
// ═══════════════════════════════════════════════════════════
class Enemy {
  constructor(x, y, r, hp, speed, color) {
    this.pos       = new Vec2(x, y);
    this.vel       = new Vec2();
    this.r         = r;
    this.hp        = hp;
    this.maxHp     = hp;
    this.speed     = speed;
    this.color     = color;
    this.dead      = false;
    this.hitTimer  = 0;
    this.stunTimer = 0;
    this.bleedTimer= 0;
    this.chillTimer= 0;
    this.angle     = 0;
    this.isBoss    = false;
  }

  takeDamage(dmg, bleed = false) {
    if (bleed && this.bleedTimer < 1) this.bleedTimer = 3;
    this.hp = Math.max(0, this.hp - dmg);
    this.hitTimer = 0.12;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  chill() { this.chillTimer = 2; }
  get effectiveSpeed() { return this.chillTimer > 0 ? this.speed * 0.4 : this.speed; }

  baseUpdate(dt, player, obstacles) {
    this.hitTimer   = Math.max(0, this.hitTimer   - dt);
    this.stunTimer  = Math.max(0, this.stunTimer  - dt);
    this.chillTimer = Math.max(0, this.chillTimer - dt);
    if (this.bleedTimer > 0) {
      this.bleedTimer -= dt;
      this.hp -= 5 * dt;
      if (this.hp <= 0) this.dead = true;
    }
    // Brûlure (lame_enflammee boon)
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.hp -= (this.burnDmg || 8) * dt;
      if (this.hp <= 0) this.dead = true;
    }
    if (this.stunTimer > 0) {
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.vel.iscale(1 - 8 * dt);
    }
    for (const o of obstacles) {
      const p = pushOutOfRect(this.pos.x, this.pos.y, this.r, o.x, o.y, o.w, o.h);
      this.pos.x = p.x; this.pos.y = p.y;
    }
    const b = keepInBounds(this.pos.x, this.pos.y, this.r);
    this.pos.x = b.x; this.pos.y = b.y;
    const dx = player.pos.x - this.pos.x, dy = player.pos.y - this.pos.y;
    this.angle = Math.atan2(dy, dx);
  }

  drawBase(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y + this.r * 0.6, this.r * 0.9, this.r * 0.3, 0, 0, TAU);
    ctx.fill();

    if (this.hitTimer > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 20; }
    else if (this.chillTimer > 0) { ctx.shadowColor = '#8cf'; ctx.shadowBlur = 10; }
    else if (this.bleedTimer > 0) { ctx.shadowColor = '#f44'; ctx.shadowBlur = 8; }

    ctx.fillStyle = this.hitTimer > 0 ? '#fff' : this.color;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r, 0, TAU); ctx.fill();
    ctx.restore();

    if (this.hitTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.globalAlpha = this.hitTimer / 0.12;
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r + 4, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    if (this.hp < this.maxHp) {
      const bw = this.r * 2 + 10, bh = this.isBoss ? 10 : 5;
      const bx = this.pos.x - bw/2, by = this.pos.y - this.r - (this.isBoss ? 20 : 12);
      ctx.fillStyle = '#400'; ctx.fillRect(bx, by, bw, bh);
      const hpRatio = this.hp / this.maxHp;
      ctx.fillStyle = this.isBoss
        ? `hsl(${30 + hpRatio*10}, 100%, 50%)`
        : `hsl(${hpRatio*100}, 90%, 55%)`;
      ctx.fillRect(bx, by, bw * this.hp / this.maxHp, bh);
      if (this.isBoss) {
        ctx.strokeStyle = '#ff8'; ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
  }

  seekPlayer(dt, player) {
    if (this.stunTimer > 0) return;
    const dir = player.pos.sub(this.pos).norm();
    this.pos.x += dir.x * this.effectiveSpeed * dt;
    this.pos.y += dir.y * this.effectiveSpeed * dt;
  }

  knockback(fromX, fromY, force) {
    const dx = this.pos.x - fromX, dy = this.pos.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    this.vel.set(dx/dist * force, dy/dist * force);
    this.stunTimer = 0.15;
  }
}

// ═══════════════════════════════════════════════════════════
//  SHADE  (basic seeker)
// ═══════════════════════════════════════════════════════════
class Shade extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    const hp = Math.round((35 + depth * 8) * iScale);
    super(x, y, 18, hp, 80 + depth * 4, '#c03060');
    this.contactTimer = 0;
    this.dmg = Math.round((7 + depth * 1.3) * iScale);  // depth 1 = 8, depth 6 = 15
  }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.baseUpdate(dt, player, obstacles);
    this.seekPlayer(dt, player);
    if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r, player.pos.x,player.pos.y,player.r)) {
      player.takeDamage(this.dmg, this);
      this.contactTimer = 0.9;
      this.knockback(player.pos.x, player.pos.y, 200);
      Logger.log('DAMAGE', `Shade hit player for ${this.dmg}`);
    }
  }
  draw(ctx) {
    this.drawBase(ctx);
    ctx.save();
    const t = Date.now() * 0.003;
    // Glowing eyes
    ctx.shadowColor = '#ff4'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff4';
    for (let i=-1; i<=1; i+=2) {
      const ex = this.pos.x + i*5, ey = this.pos.y - 3;
      ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#ff0';
    const ex = Math.cos(this.angle)*this.r*0.3, ey = Math.sin(this.angle)*this.r*0.3;
    const perp = Math.atan2(-Math.cos(this.angle), Math.sin(this.angle));
    const px = Math.cos(perp)*this.r*0.2, py = Math.sin(perp)*this.r*0.2;
    ctx.beginPath(); ctx.arc(this.pos.x+ex+px, this.pos.y+ey+py, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(this.pos.x+ex-px, this.pos.y+ey-py, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  LANCER  (telegraphed charge)
// ═══════════════════════════════════════════════════════════
class Lancer extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 20, Math.round((55 + depth * 10) * iScale), 70, '#e06010');
    this.state = 'wander'; this.stateTimer = rand(1.5, 2.5);
    this.chargeVel = new Vec2();
    this.dmg = Math.round((17 + depth * 2) * iScale);  // depth 6 = 29 (was 40)
    this.contactTimer = 0;
  }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.baseUpdate(dt, player, obstacles);
    this.stateTimer -= dt;
    if (this.state === 'wander') {
      this.seekPlayer(dt, player);
      if (this.stateTimer <= 0) {
        this.state = 'telegraph'; this.stateTimer = 0.8;
        this.chargeVel = player.pos.sub(this.pos).norm().scale(520);
      }
    } else if (this.state === 'telegraph') {
      if (this.stateTimer <= 0) { this.state = 'charge'; this.stateTimer = 0.35; }
    } else if (this.state === 'charge') {
      if (this.stunTimer <= 0) { this.pos.x += this.chargeVel.x*dt; this.pos.y += this.chargeVel.y*dt; }
      if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r, player.pos.x,player.pos.y,player.r)) {
        player.takeDamage(this.dmg, this);
        this.contactTimer = 1.5;
        player.knockback(this.pos.x, this.pos.y, 350);
        Logger.log('DAMAGE', `Lancer charged player for ${this.dmg}`);
      }
      if (this.stateTimer <= 0) { this.state = 'cooldown'; this.stateTimer = rand(1.0, 2.0); }
    } else if (this.state === 'cooldown') {
      this.seekPlayer(dt, player);
      if (this.stateTimer <= 0) { this.state = 'wander'; this.stateTimer = rand(1.0, 2.0); }
    }
  }
  draw(ctx) {
    if (this.state === 'telegraph') {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(Date.now()*0.02)*0.3;
      ctx.strokeStyle = '#ff4'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r+8, 0, TAU); ctx.stroke();
      // Direction arrow
      const dir = this.chargeVel.norm();
      ctx.strokeStyle = '#f80'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this.pos.x+dir.x*60, this.pos.y+dir.y*60); ctx.stroke();
      ctx.restore();
    }
    this.drawBase(ctx);
    ctx.save();
    if (this.state === 'charge') {
      ctx.strokeStyle = '#f84'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
      ctx.shadowColor = '#f84'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(this.pos.x - this.chargeVel.x*0.1, this.pos.y - this.chargeVel.y*0.1);
      ctx.lineTo(this.pos.x, this.pos.y); ctx.stroke();
    }
    // Spear tip indicator
    if (this.state === 'windup') {
      const a = this.chargeVel.len() > 0 ? Math.atan2(this.chargeVel.y, this.chargeVel.x) : 0;
      ctx.fillStyle = '#ff8'; ctx.shadowColor = '#ff8'; ctx.shadowBlur = 8;
      const tx = this.pos.x + Math.cos(a)*(this.r+8), ty = this.pos.y + Math.sin(a)*(this.r+8);
      ctx.beginPath(); ctx.arc(tx, ty, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.fillStyle = '#fff';
    const tip = Vec2.fromAngle(this.angle, this.r+10);
    const lp = Vec2.fromAngle(this.angle+2.5, this.r*0.5);
    const rp = Vec2.fromAngle(this.angle-2.5, this.r*0.5);
    ctx.beginPath();
    ctx.moveTo(this.pos.x+tip.x, this.pos.y+tip.y);
    ctx.lineTo(this.pos.x+lp.x, this.pos.y+lp.y);
    ctx.lineTo(this.pos.x+rp.x, this.pos.y+rp.y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  ARCHER  (kites, fires arrows)
// ═══════════════════════════════════════════════════════════
class Archer extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 17, Math.round((45 + depth * 7) * iScale), 90, '#207040');
    this.depth = depth;
    this.shootTimer = rand(1.5, 2.5);
    this.dmg = Math.round((13 + depth * 1.5) * iScale);  // depth 6 = 22 (was 30)
    this.idealRange = 300;
  }
  update(dt, player, obstacles, projectiles) {
    this.baseUpdate(dt, player, obstacles);
    const dist = this.pos.dist(player.pos);
    if (this.stunTimer <= 0) {
      const dir = player.pos.sub(this.pos);
      if (dist < this.idealRange - 40) {
        this.pos.x -= dir.norm().x * this.effectiveSpeed * dt;
        this.pos.y -= dir.norm().y * this.effectiveSpeed * dt;
      } else if (dist > this.idealRange + 40) {
        this.pos.x += dir.norm().x * this.effectiveSpeed * 0.7 * dt;
        this.pos.y += dir.norm().y * this.effectiveSpeed * 0.7 * dt;
      } else {
        const perp = new Vec2(-dir.norm().y, dir.norm().x);
        this.pos.x += perp.x * this.effectiveSpeed * 0.5 * dt;
        this.pos.y += perp.y * this.effectiveSpeed * 0.5 * dt;
      }
    }
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && dist < 550) {
      this.shootTimer = rand(1.8, 3.0);
      const dir = player.pos.sub(this.pos).norm();
      const spd = 240 + this.depth * 5;
      const proj = new Projectile(
        this.pos.x + dir.x*(this.r+8), this.pos.y + dir.y*(this.r+8),
        dir.x*spd, dir.y*spd, 6, this.dmg, false, '#5e3'
      );
      proj.sourceEnemy = this;
      projectiles.push(proj);
    }
  }
  draw(ctx) {
    this.drawBase(ctx);
    ctx.save(); ctx.strokeStyle = '#8d6'; ctx.lineWidth = 2;
    const bx = this.pos.x + Math.cos(this.angle)*(this.r-2);
    const by = this.pos.y + Math.sin(this.angle)*(this.r-2);
    ctx.beginPath(); ctx.arc(bx, by, 10, this.angle-1.2, this.angle+1.2); ctx.stroke();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  BRUTE  (slow, tanky, telegraphed slam)
// ═══════════════════════════════════════════════════════════
class Brute extends Enemy {
  constructor(x, y, depth = 1) {
    super(x, y, 28, 130 + depth * 18, 50, '#6020a0');
    this.contactTimer = 0;
    this.windupTimer  = 0;
    this.dmg = 32 + depth * 4;
    this.damageReduce = 5 + Math.floor(depth * 0.5);
  }
  takeDamage(dmg, bleed) { return super.takeDamage(Math.max(1, dmg - this.damageReduce), bleed); }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.baseUpdate(dt, player, obstacles);
    this.seekPlayer(dt, player);
    const inRange = this.contactTimer <= 0 &&
      circleCircle(this.pos.x, this.pos.y, this.r+12, player.pos.x, player.pos.y, player.r);
    if (this.windupTimer > 0) {
      const wasAbove = this.windupTimer > 0;
      this.windupTimer -= dt;
      if (this.windupTimer <= 0 && wasAbove) {
        if (circleCircle(this.pos.x, this.pos.y, this.r+22, player.pos.x, player.pos.y, player.r)) {
          player.takeDamage(this.dmg, this);
          player.knockback(this.pos.x, this.pos.y, 420);
          Particles.burst(player.pos.x, player.pos.y, 15, '#a0f', 150);
          Logger.log('DAMAGE', `Brute slammed player for ${this.dmg}`);
        }
        this.contactTimer = 1.2;
        this.windupTimer = 0;
      }
    } else if (inRange) {
      this.windupTimer = 0.45;
    }
  }
  draw(ctx) {
    if (this.windupTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.windupTimer / 0.45);
      ctx.strokeStyle = '#f00'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r+16, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    this.drawBase(ctx);
    ctx.save(); ctx.strokeStyle = '#8060c0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r*0.75, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  WRAITH  (teleports near player)
// ═══════════════════════════════════════════════════════════
class Wraith extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 16, Math.round((55 + depth * 7) * iScale), 70, '#204080');
    this.phase = 'float'; this.phaseTimer = rand(2, 3.5);
    this.alpha = 1; this.contactTimer = 0;
    this.dmg = Math.round((20 + depth * 3) * iScale);
  }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.baseUpdate(dt, player, obstacles);
    this.phaseTimer -= dt;
    if (this.phase === 'float') {
      const dir = player.pos.sub(this.pos).norm();
      this.pos.x += dir.x * this.effectiveSpeed * 0.4 * dt;
      this.pos.y += dir.y * this.effectiveSpeed * 0.4 * dt;
      this.alpha = 0.6;
      if (this.phaseTimer <= 0) { this.phase = 'vanish'; this.phaseTimer = 0.5; }
    } else if (this.phase === 'vanish') {
      this.alpha = Math.max(0, this.phaseTimer / 0.5);
      if (this.phaseTimer <= 0) {
        const a = rand(0, TAU), dist = rand(55, 110);
        this.pos.x = clamp(player.pos.x + Math.cos(a)*dist, PLAY.x+20, PLAY.x+PLAY.w-20);
        this.pos.y = clamp(player.pos.y + Math.sin(a)*dist, PLAY.y+20, PLAY.y+PLAY.h-20);
        this.phase = 'appear'; this.phaseTimer = 0.4;
        Particles.burst(this.pos.x, this.pos.y, 10, '#408', 80);
      }
    } else if (this.phase === 'appear') {
      this.alpha = 1 - this.phaseTimer/0.4;
      if (this.phaseTimer <= 0) {
        this.phase = 'float'; this.phaseTimer = rand(2, 3.5); this.alpha = 1;
        if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r+5, player.pos.x,player.pos.y,player.r)) {
          player.takeDamage(this.dmg, this);
          this.contactTimer = 1.0;
          Logger.log('DAMAGE', `Wraith teleport-struck player for ${this.dmg}`);
        }
      }
    }
  }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = this.alpha;
    ctx.shadowColor = '#48f'; ctx.shadowBlur = 20;
    this.drawBase(ctx); ctx.restore();
    if (this.phase === 'float' && this.alpha > 0.5) {
      ctx.save();
      ctx.globalAlpha = (this.alpha - 0.5) * 0.3;
      ctx.strokeStyle = '#40a0ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r + 8, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  SPECTER  (fast, ignores obstacles)
// ═══════════════════════════════════════════════════════════
class Specter extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 13, Math.round((28 + depth * 5) * iScale), 180 + depth * 4, '#1050a0');
    this.contactTimer = 0;
    this.dmg = Math.round((10 + depth * 2) * iScale);
    this.wobble = rand(0, TAU);
  }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    // Specters ignore obstacles (phase through)
    this.hitTimer   = Math.max(0, this.hitTimer   - dt);
    this.stunTimer  = Math.max(0, this.stunTimer  - dt);
    this.chillTimer = Math.max(0, this.chillTimer - dt);
    if (this.bleedTimer > 0) { this.bleedTimer -= dt; this.hp -= 5*dt; if(this.hp<=0) this.dead=true; }
    if (this.stunTimer > 0) {
      this.pos.x += this.vel.x*dt; this.pos.y += this.vel.y*dt;
      this.vel.iscale(1-8*dt);
    }
    const b = keepInBounds(this.pos.x, this.pos.y, this.r);
    this.pos.x = b.x; this.pos.y = b.y;
    const dx = player.pos.x-this.pos.x, dy = player.pos.y-this.pos.y;
    this.angle = Math.atan2(dy, dx);

    // Seek player with wobble
    this.wobble += dt * 3;
    if (this.stunTimer <= 0) {
      const dir = player.pos.sub(this.pos).norm();
      const perp = new Vec2(-dir.y, dir.x);
      this.pos.x += (dir.x + perp.x * Math.sin(this.wobble) * 0.3) * this.effectiveSpeed * dt;
      this.pos.y += (dir.y + perp.y * Math.sin(this.wobble) * 0.3) * this.effectiveSpeed * dt;
    }

    if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r, player.pos.x,player.pos.y,player.r)) {
      player.takeDamage(this.dmg, this);
      this.contactTimer = 0.6;
      this.knockback(player.pos.x, player.pos.y, 180);
      Logger.log('DAMAGE', `Specter hit player for ${this.dmg}`);
    }
  }
  draw(ctx) {
    // Pulsing semi-transparent
    const pulse = 0.55 + Math.sin(Date.now()*0.004 + this.wobble)*0.2;
    ctx.save(); ctx.globalAlpha = pulse;
    ctx.shadowColor = '#48f'; ctx.shadowBlur = 15;
    ctx.fillStyle = this.hitTimer > 0 ? '#fff' : this.color;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r, 0, TAU); ctx.fill();
    // Wispy tail
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = pulse * (0.4 - i*0.1);
      ctx.beginPath();
      ctx.arc(this.pos.x - Math.cos(this.angle)*i*8, this.pos.y - Math.sin(this.angle)*i*8,
              this.r*(1 - i*0.25), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (this.hp < this.maxHp) {
      const bw = this.r*2+6, bh = 4;
      const bx = this.pos.x - bw/2, by = this.pos.y - this.r - 10;
      ctx.fillStyle = '#400'; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle = '#f44'; ctx.fillRect(bx,by,bw*this.hp/this.maxHp,bh);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  BOMB RUNNER  (runs at player, explodes)
// ═══════════════════════════════════════════════════════════
class BombRunner extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 20, Math.round((45 + depth * 5) * iScale), 100 + depth * 3, '#a04000');
    this.fuseTimer  = -1;  // -1 = not lit
    this.fuseDur    = 1.8;  // more reaction time
    this.explodeDmg = Math.round((28 + depth * 3) * iScale);  // depth 6 = 46 (was 69)
    this.explodeR   = 110;
  }
  update(dt, player, obstacles, projectiles) {
    this.baseUpdate(dt, player, obstacles);
    const dist = this.pos.dist(player.pos);

    if (this.fuseTimer > 0) {
      this.fuseTimer -= dt;
      // Don't move while fuse is lit (scare tactic)
      if (this.fuseTimer <= 0) {
        // EXPLODE
        Logger.log('DAMAGE', `BombRunner exploded near player, r=${this.explodeR}`);
        if (dist < this.explodeR) {
          player.takeDamage(this.explodeDmg, this);
          player.knockback(this.pos.x, this.pos.y, 500);
          Logger.log('DAMAGE', `Explosion hit player for ${this.explodeDmg}`);
        }
        Particles.burst(this.pos.x, this.pos.y, 40, '#f80', 220, 6, 50);
        Particles.burst(this.pos.x, this.pos.y, 15, '#ff0', 180, 3);
        this.dead = true;
      }
    } else if (dist < 70) {
      this.fuseTimer = this.fuseDur;
      Logger.log('SPAWN', 'BombRunner fuse lit!');
    } else {
      this.seekPlayer(dt, player);
    }
  }
  draw(ctx) {
    if (this.fuseTimer > 0) {
      // Countdown ring
      const t = 1 - this.fuseTimer / this.fuseDur;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = `hsl(${30 - t*30}, 100%, 50%)`;
      ctx.lineWidth   = 5;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.explodeR, -Math.PI/2, -Math.PI/2 + t*TAU); ctx.stroke();
      // Flashing body
      if (Math.floor(Date.now() / (100 - t*70)) % 2 === 0) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#ff0';
        ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r+6, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    this.drawBase(ctx);
    // Skull icon
    ctx.save(); ctx.font = `${this.r}px serif`; ctx.textAlign = 'center';
    ctx.fillText('💣', this.pos.x, this.pos.y + this.r*0.4); ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  CULTIST  (buffs nearby enemies, ranged)
// ═══════════════════════════════════════════════════════════
class Cultist extends Enemy {
  constructor(x, y, depth = 1) {
    super(x, y, 16, 50 + depth * 6, 65, '#800040');
    this.buffTimer  = 0;
    this.buffRadius = 180;
    this.shootTimer = rand(2, 3);
    this.dmg        = 15 + depth * 2;
    this.idealRange = 320;
  }
  update(dt, player, obstacles, projectiles) {
    this.baseUpdate(dt, player, obstacles);
    const dist = this.pos.dist(player.pos);
    if (this.stunTimer <= 0) {
      const dir = player.pos.sub(this.pos);
      if (dist < this.idealRange - 50) {
        this.pos.x -= dir.norm().x * this.effectiveSpeed * dt;
        this.pos.y -= dir.norm().y * this.effectiveSpeed * dt;
      } else if (dist > this.idealRange + 50) {
        this.pos.x += dir.norm().x * this.effectiveSpeed * 0.6 * dt;
        this.pos.y += dir.norm().y * this.effectiveSpeed * 0.6 * dt;
      }
    }
    // Shoot homing-ish projectiles
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && dist < 600) {
      this.shootTimer = rand(2, 3.5);
      // Lead the target slightly
      const lead = player.pos.add(new Vec2(rand(-30,30), rand(-30,30)));
      const dir  = lead.sub(this.pos).norm();
      const spd  = 190;
      const proj = new Projectile(
        this.pos.x + dir.x*(this.r+5), this.pos.y + dir.y*(this.r+5),
        dir.x*spd, dir.y*spd, 7, this.dmg, false, '#f0a'
      );
      proj.sourceEnemy = this;
      projectiles.push(proj);
    }
    this.buffTimer += dt;
  }
  draw(ctx) {
    // Buff aura
    ctx.save();
    ctx.globalAlpha = 0.12 + Math.sin(this.buffTimer * 2)*0.05;
    ctx.strokeStyle = '#f0a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.buffRadius, 0, TAU); ctx.stroke();
    ctx.restore();
    this.drawBase(ctx);
    ctx.save(); ctx.font = `${this.r}px serif`; ctx.textAlign = 'center';
    ctx.fillText('🔮', this.pos.x, this.pos.y + this.r*0.4); ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  BOSS: THE WARDEN
//  FIX: spawns at given position (passed from room, top-center)
// ═══════════════════════════════════════════════════════════
class Warden extends Enemy {
  constructor(x, y, bossLevel = 1) {
    const bScale = bossInfiniteScale(bossLevel * 5); // bossLevel maps roughly to depth
    const hp = Math.round((320 + bossLevel * 180) * bScale);
    super(x, y, 42, hp, 60 + bossLevel * 8, '#c0a000');
    this.isBoss      = true;
    this.bossLevel   = bossLevel;
    this.bossPhase   = 1;
    this.action      = 'seek';
    this.actionTimer = rand(1.5, 2.5);
    this.chargeVel   = new Vec2();
    this.shootPhase  = 0;
    this.shootDelay  = 0;
    this.contactTimer= 0;
    this.dmg         = Math.round((28 + bossLevel * 6) * bScale);
    this.name        = ['', 'Megaera la Furieuse', "L'Hydre Osseuse", 'Hadès lui-même'][Math.min(bossLevel, 3)];
    Logger.log('BOSS', `${this.name} spawned at (${Math.round(x)},${Math.round(y)})`, { hp, bossLevel });
  }

  get phaseThreshold() {
    if (this.hp / this.maxHp > 0.66) return 1;
    if (this.hp / this.maxHp > 0.33) return 2;
    return 3;
  }

  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.baseUpdate(dt, player, obstacles);

    const newPhase = this.phaseThreshold;
    if (newPhase > this.bossPhase) {
      this.bossPhase = newPhase;
      Particles.burst(this.pos.x, this.pos.y, 35, '#ff0', 220, 5);
      Logger.log('BOSS', `${this.name} entered phase ${newPhase}`, { hp: Math.round(this.hp) });
    }
    this.actionTimer -= dt;

    if (this.action === 'seek') {
      this.seekPlayer(dt, player);
      if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r+5, player.pos.x,player.pos.y,player.r)) {
        player.takeDamage(this.dmg, this);
        this.contactTimer = 0.7;
        player.knockback(this.pos.x, this.pos.y, 300);
        Logger.log('DAMAGE', `Boss melee hit player for ${this.dmg}`);
      }
      if (this.actionTimer <= 0) {
        const roll = Math.random();
        if (this.bossPhase === 1)      this.action = roll < 0.5 ? 'burst4' : 'charge';
        else if (this.bossPhase === 2) this.action = roll < 0.33 ? 'burst4' : roll < 0.66 ? 'charge' : 'summon';
        else                           this.action = roll < 0.25 ? 'burst8' : roll < 0.5 ? 'charge' : roll < 0.75 ? 'summon' : 'spin';
        this.actionTimer = 0; this.shootPhase = 0; this.shootDelay = 0;
        Logger.log('BOSS', `${this.name} → action: ${this.action}`);
      }
    }

    else if (this.action === 'burst4' || this.action === 'burst8') {
      this.shootDelay -= dt;
      if (this.shootDelay <= 0) {
        const count = this.action === 'burst8' ? 8 : 4;
        const offset = this.shootPhase * (TAU / count / 2);
        for (let i = 0; i < count; i++) {
          const a = offset + (i/count)*TAU;
          const spd = 200 + this.bossLevel * 25;
          const proj = new Projectile(this.pos.x, this.pos.y,
            Math.cos(a)*spd, Math.sin(a)*spd, 8, 15+this.bossLevel*3, false, '#ff8');
          proj.sourceEnemy = this;
          projectiles.push(proj);
        }
        this.shootPhase++; this.shootDelay = 0.3 - this.bossLevel*0.03;
        if (this.shootPhase >= 3) { this.action = 'seek'; this.actionTimer = rand(1,2); }
      }
    }

    else if (this.action === 'charge') {
      if (this.shootPhase === 0) {
        this.shootDelay += dt;
        if (this.shootDelay >= 0.8) {
          this.chargeVel = player.pos.sub(this.pos).norm().scale(540 + this.bossLevel*35);
          this.shootPhase = 1; this.shootDelay = 0.45;
        }
      } else {
        this.pos.x += this.chargeVel.x*dt; this.pos.y += this.chargeVel.y*dt;
        this.shootDelay -= dt;
        if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r, player.pos.x,player.pos.y,player.r)) {
          const chargeDmg = Math.round(this.dmg * 1.5);
          player.takeDamage(chargeDmg, this);
          this.contactTimer = 1.0;
          player.knockback(this.pos.x, this.pos.y, 480);
          Logger.log('DAMAGE', `Boss charge hit player for ${chargeDmg}`);
        }
        if (this.shootDelay <= 0) { this.action = 'seek'; this.actionTimer = rand(1,1.5); }
      }
    }

    else if (this.action === 'summon') {
      this.shootDelay += dt;
      if (this.shootDelay >= 0.5) {
        this.action = 'seek'; this.actionTimer = rand(1.5, 2.5);
        return ['shade', 'specter'];
      }
    }

    else if (this.action === 'spin') {
      this.shootDelay += dt;
      if (this.shootDelay > 0 && Math.floor(this.shootDelay * 8) !== Math.floor((this.shootDelay - dt) * 8) && this.shootDelay < 2.0) {
        for (let i = 0; i < 10; i++) {
          const a = (i/10)*TAU + this.shootDelay*4;
          const proj = new Projectile(this.pos.x, this.pos.y,
            Math.cos(a)*170, Math.sin(a)*170, 7, 12, false, '#f80');
          proj.sourceEnemy = this;
          projectiles.push(proj);
        }
      }
      if (this.shootDelay >= 2.0) { this.action = 'seek'; this.actionTimer = 2; }
    }

    return null;
  }

  draw(ctx) {
    ctx.save();
    if (this.bossPhase >= 2) {
      ctx.strokeStyle = '#f80'; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + Math.sin(Date.now()*0.003)*0.3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r+15, 0, TAU); ctx.stroke();
    }
    if (this.bossPhase >= 3) {
      ctx.strokeStyle = '#f00'; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 + Math.sin(Date.now()*0.005+1)*0.3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r+28, 0, TAU); ctx.stroke();
    }
    ctx.restore();

    // Charge telegraph
    if (this.action === 'charge' && this.shootPhase === 0 && this.shootDelay > 0) {
      const t = this.shootDelay / 0.8;
      ctx.save(); ctx.globalAlpha = t * 0.6;
      ctx.strokeStyle = '#ff0'; ctx.lineWidth = 4;
      const target = this.chargeVel.len() > 0 ? this.chargeVel.norm() : new Vec2(1, 0);
      ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this.pos.x + target.x*350, this.pos.y + target.y*350); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    this.drawBase(ctx);
    // Orbital ring
    ctx.save();
    const orb = Date.now() * 0.002;
    const orbitR = this.r + 18;
    ctx.strokeStyle = this.bossPhase === 3 ? '#f80' : (this.bossPhase === 2 ? '#f8f' : '#ff8');
    ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, orbitR, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    // Orbiting gem
    ctx.fillStyle = this.bossPhase === 3 ? '#f80' : '#ff8';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    for (let i = 0; i < this.bossPhase; i++) {
      const a = orb + i*(TAU/this.bossPhase);
      ctx.beginPath(); ctx.arc(this.pos.x+Math.cos(a)*orbitR, this.pos.y+Math.sin(a)*orbitR, 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 20px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('♛', this.pos.x, this.pos.y - this.r - 22);
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 13px Georgia';
    ctx.fillText(this.name, this.pos.x, this.pos.y + this.r + 28);

    // Phase indicator
    ctx.fillStyle = `hsl(${120 - (1-this.hp/this.maxHp)*120}, 100%, 60%)`;
    ctx.font = '11px Georgia';
    ctx.fillText(`Phase ${this.bossPhase} · ${Math.ceil(this.hp)}/${this.maxHp} PV`, this.pos.x, this.pos.y + this.r + 44);
  }
}

// ═══════════════════════════════════════════════════════════
//  REAPER — fast melee, telegraphed scythe arc sweep
// ═══════════════════════════════════════════════════════════
class Reaper extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 16, Math.round((50 + depth * 7) * iScale), 125 + depth * 3, '#2a0a3a');
    this.depth       = depth;
    this.scytheCd    = rand(0.5, 1.5);
    this.scytheAnim  = 0;
    this.windupTimer = 0;
    this.isWindup    = false;
    this.contactTimer= 0;
    this.dmg         = Math.round((14 + depth * 2) * iScale);
    this.sweepDmg    = Math.round((22 + depth * 2.5) * iScale);
  }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.scytheCd     = Math.max(0, this.scytheCd - dt);
    if (this.scytheAnim > 0) this.scytheAnim -= dt;
    this.baseUpdate(dt, player, obstacles);
    const dist = this.pos.dist(player.pos);
    if (this.isWindup) {
      this.windupTimer -= dt;
      if (this.windupTimer <= 0) {
        this.isWindup = false; this.scytheAnim = 0.4;
        if (dist < 110) {
          player.takeDamage(this.sweepDmg, this);
          player.knockback(this.pos.x, this.pos.y, 300);
          Particles.burst(player.pos.x, player.pos.y, 10, '#c0a0ff', 150, 3);
          Logger.log('DAMAGE', `Reaper scythe hit player for ${this.sweepDmg}`);
        }
        this.scytheCd = 2.0;
      }
      return;
    }
    if (this.stunTimer <= 0) this.seekPlayer(dt, player);
    if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r, player.pos.x,player.pos.y,player.r)) {
      player.takeDamage(this.dmg, this);
      this.contactTimer = 0.9;
    }
    if (this.scytheCd <= 0 && dist < 95 && !this.isWindup) {
      this.isWindup = true; this.windupTimer = 0.45;
      Particles.ring(this.pos.x, this.pos.y, this.r, this.r+50, '#c0a0ff', 0.4);
    }
  }
  draw(ctx) {
    this.drawBase(ctx);
    ctx.save();
    const dir = this.vel.len() > 1 ? Math.atan2(this.vel.y, this.vel.x) : 0;
    ctx.fillStyle = this.isWindup ? '#fff' : '#a060ff';
    ctx.shadowColor = '#a060ff'; ctx.shadowBlur = this.isWindup ? 16 : 8;
    for (let i=-1; i<=1; i+=2) {
      ctx.beginPath(); ctx.arc(this.pos.x+Math.cos(dir+i*0.45)*9, this.pos.y+Math.sin(dir+i*0.45)*9, this.isWindup?4:3, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (this.scytheAnim > 0) {
      const a = this.scytheAnim/0.4;
      ctx.globalAlpha = a; ctx.strokeStyle = '#c0a0ff';
      ctx.lineWidth = 5*a; ctx.shadowColor='#c0a0ff'; ctx.shadowBlur=20;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 70, dir-Math.PI*0.65, dir+Math.PI*0.65); ctx.stroke();
    }
    if (this.isWindup) {
      const p = 1 - this.windupTimer/0.45;
      ctx.globalAlpha = 0.6; ctx.strokeStyle = '#c0a0ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 20, -Math.PI/2, -Math.PI/2 + p*TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  VENOM SPITTER — stationary, 3-way toxic spray
// ═══════════════════════════════════════════════════════════
class VenomSpitter extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 20, Math.round((60 + depth * 6) * iScale), 25, '#1a4010');
    this.depth      = depth;
    this.shootTimer = rand(1.5, 2.5);
    this.dmg        = Math.round((10 + depth * 1.5) * iScale);
    this.idealRange = 350;
    this.wobble     = rand(0, TAU);
  }
  update(dt, player, obstacles, projectiles) {
    this.baseUpdate(dt, player, obstacles);
    this.wobble += dt * 1.5;
    const dist = this.pos.dist(player.pos);
    if (this.stunTimer <= 0 && dist > this.idealRange + 60) {
      this.seekPlayer(dt, player);
    }
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && dist < 520) {
      this.shootTimer = rand(2.2, 3.5);
      const ba = Math.atan2(player.pos.y-this.pos.y, player.pos.x-this.pos.x);
      for (let i=-1; i<=1; i++) {
        const a = ba + i*0.38;
        const spd = 155 + this.depth * 4;
        const proj = new Projectile(
          this.pos.x+Math.cos(a)*(this.r+6), this.pos.y+Math.sin(a)*(this.r+6),
          Math.cos(a)*spd, Math.sin(a)*spd, 7, this.dmg, false, '#3c8'
        );
        proj.sourceEnemy = this; projectiles.push(proj);
      }
      Particles.burst(this.pos.x, this.pos.y, 8, '#3c8', 80, 3);
    }
  }
  draw(ctx) {
    this.drawBase(ctx);
    ctx.save();
    const pulse = 0.5 + 0.5*Math.sin(this.wobble);
    ctx.shadowColor='#3c8'; ctx.shadowBlur=8+pulse*10;
    ctx.fillStyle='#5fa';
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r*0.5, 0, TAU); ctx.fill();
    for (let i=0; i<3; i++) {
      const a = this.wobble + i*TAU/3;
      ctx.fillStyle='#2a6';
      ctx.beginPath(); ctx.arc(this.pos.x+Math.cos(a)*(this.r-6), this.pos.y+Math.sin(a)*(this.r-6), 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  GOLEM — slow tank, ground slam
// ═══════════════════════════════════════════════════════════
class Golem extends Enemy {
  constructor(x, y, depth = 1) {
    const iScale = infiniteScale(depth);
    super(x, y, 30, Math.round((160 + depth * 20) * iScale), 38, '#607080');
    this.depth       = depth;
    this.slamTimer   = rand(2, 3.5);
    this.slamAnim    = 0;
    this.contactTimer= 0;
    this.dmg         = Math.round((18 + depth * 2.5) * iScale);
    this.slamDmg     = Math.round((35 + depth * 4) * iScale);
    this.slamRadius  = 90;
  }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.slamTimer   -= dt;
    if (this.slamAnim > 0) this.slamAnim -= dt;
    this.baseUpdate(dt, player, obstacles);
    if (this.stunTimer <= 0) this.seekPlayer(dt, player);
    if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r, player.pos.x,player.pos.y,player.r)) {
      player.takeDamage(this.dmg, this); this.contactTimer = 1.2;
    }
    if (this.slamTimer <= 0) {
      this.slamTimer = rand(2.5, 4.0); this.slamAnim = 0.6;
      if (this.pos.dist(player.pos) < this.slamRadius) {
        player.takeDamage(this.slamDmg, this);
        player.knockback(this.pos.x, this.pos.y, 400);
        Logger.log('DAMAGE', `Golem slam hit player for ${this.slamDmg}`);
      }
      Particles.burst(this.pos.x, this.pos.y, 15, '#888', 180, 5, 100);
      Particles.ring(this.pos.x, this.pos.y, this.r, this.slamRadius, '#aaa', 0.4);
    }
  }
  draw(ctx) {
    this.drawBase(ctx);
    ctx.save();
    ctx.strokeStyle = this.hitTimer > 0 ? '#fff' : '#405060';
    ctx.lineWidth = 2;
    for (let i=0; i<4; i++) {
      const a = i*TAU/4 + 0.4;
      ctx.beginPath();
      ctx.moveTo(this.pos.x+Math.cos(a)*5, this.pos.y+Math.sin(a)*5);
      ctx.lineTo(this.pos.x+Math.cos(a)*(this.r-4), this.pos.y+Math.sin(a)*(this.r-4));
      ctx.stroke();
    }
    if (this.slamAnim > 0) {
      const a = this.slamAnim/0.6;
      ctx.globalAlpha = a; ctx.strokeStyle='#aaa'; ctx.lineWidth=4*a;
      ctx.shadowColor='#aaa'; ctx.shadowBlur=12;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.slamRadius*(1-a*0.3), 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  MINI BOSS — fast aggressive skirmisher (odd boss floors)
// ═══════════════════════════════════════════════════════════
class MiniBoss extends Enemy {
  constructor(x, y, bossLevel = 1) {
    const bScale = bossInfiniteScale(bossLevel * 5); // bossLevel maps roughly to depth
    const hp = Math.round((220 + bossLevel * 90) * bScale);
    super(x, y, 30, hp, 110 + bossLevel * 8, '#c03080');
    this.isBoss      = true;
    this.bossLevel   = bossLevel;
    this.bossPhase   = 1;
    this.action      = 'seek';
    this.actionTimer = rand(1.0, 1.8);
    this.dashDelay   = 0;
    this.dashDur     = 0;
    this.dashPhase   = false;
    this.dashVel     = new Vec2();
    this.burstDelay  = 0;
    this.burstCount  = 0;
    this.contactTimer= 0;
    this.dmg         = Math.round((20 + bossLevel * 5) * bScale);
    const names = ['', 'Furies Jumelle', 'Chasseresse Maudite', 'Spectre Royal', 'Lames du Chaos'];
    this.name = names[Math.min(bossLevel, names.length-1)];
    Logger.log('BOSS', `${this.name} (MiniBoss) spawned`, { hp, bossLevel });
  }
  get phaseThreshold() { return this.hp/this.maxHp > 0.5 ? 1 : 2; }
  update(dt, player, obstacles, projectiles) {
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.baseUpdate(dt, player, obstacles);
    const newPhase = this.phaseThreshold;
    if (newPhase > this.bossPhase) {
      this.bossPhase = newPhase; this.speed *= 1.25;
      Particles.burst(this.pos.x, this.pos.y, 25, '#ff4', 200, 4);
      Particles.ring(this.pos.x, this.pos.y, this.r, 120, '#f06', 0.5);
      Logger.log('BOSS', `${this.name} enraged!`, { hp: Math.round(this.hp) });
    }
    this.actionTimer -= dt;
    if (this.action === 'seek') {
      this.seekPlayer(dt, player);
      if (this.contactTimer <= 0 && circleCircle(this.pos.x,this.pos.y,this.r+5, player.pos.x,player.pos.y,player.r)) {
        player.takeDamage(this.dmg, this); this.contactTimer=0.5;
        player.knockback(this.pos.x, this.pos.y, 320);
        Logger.log('DAMAGE', `MiniBoss contact hit for ${this.dmg}`);
      }
      if (this.actionTimer <= 0) {
        this.action = Math.random()<0.55 ? 'dash' : 'burst';
        this.dashDelay=0; this.dashPhase=false; this.burstCount=0; this.burstDelay=0;
        Logger.log('BOSS', `${this.name} → ${this.action}`);
      }
    }
    else if (this.action === 'dash') {
      if (!this.dashPhase) {
        this.dashDelay += dt;
        if (this.dashDelay >= 0.55) {
          this.dashVel = player.pos.sub(this.pos).norm().scale(620 + this.bossLevel*30);
          this.dashPhase=true; this.dashDur=0.28;
        }
      } else {
        this.pos.x += this.dashVel.x*dt; this.pos.y += this.dashVel.y*dt;
        this.dashDur -= dt;
        if (this.contactTimer<=0 && circleCircle(this.pos.x,this.pos.y,this.r, player.pos.x,player.pos.y,player.r)) {
          player.takeDamage(Math.round(this.dmg*1.4), this); this.contactTimer=1.0;
          player.knockback(this.pos.x, this.pos.y, 500);
        }
        Particles.sparks(this.pos.x, this.pos.y, 2, '#f06');
        if (this.dashDur<=0) { this.action='seek'; this.actionTimer=rand(0.8,1.5); this.dashPhase=false; }
      }
    }
    else if (this.action === 'burst') {
      this.burstDelay += dt;
      if (this.burstDelay >= 0.4) {
        this.burstDelay=0; this.burstCount++;
        const count = 6 + this.bossPhase*2;
        for (let i=0; i<count; i++) {
          const a=(i/count)*TAU + this.burstCount*0.3;
          const spd=180+this.bossLevel*20;
          const proj=new Projectile(this.pos.x, this.pos.y, Math.cos(a)*spd, Math.sin(a)*spd, 7, 12+this.bossLevel*2, false, '#f06');
          proj.sourceEnemy=this; projectiles.push(proj);
        }
        if (this.burstCount>=2) { this.action='seek'; this.actionTimer=rand(1,2); this.burstCount=0; }
      }
    }
    return null;
  }
  draw(ctx) {
    ctx.save();
    const pulse = 0.5+0.5*Math.sin(Date.now()*0.004);
    ctx.shadowColor='#f040a0'; ctx.shadowBlur=20+pulse*10;
    ctx.fillStyle = this.hitTimer>0 ? '#fff' : '#c03080';
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r, 0, TAU); ctx.fill();
    ctx.strokeStyle='#f040a0'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r, 0, TAU); ctx.stroke();
    ctx.fillStyle='#ff8'; ctx.shadowBlur=0;
    for (let i=0; i<5; i++) {
      const a=(i/5)*TAU - Math.PI/2;
      const ix=this.pos.x+Math.cos(a)*this.r, iy=this.pos.y+Math.sin(a)*this.r;
      ctx.beginPath(); ctx.moveTo(ix,iy);
      ctx.lineTo(this.pos.x+Math.cos(a)*(this.r+12)-Math.sin(a)*4, this.pos.y+Math.sin(a)*(this.r+12)+Math.cos(a)*4);
      ctx.lineTo(this.pos.x+Math.cos(a)*(this.r+12)+Math.sin(a)*4, this.pos.y+Math.sin(a)*(this.r+12)-Math.cos(a)*4);
      ctx.closePath(); ctx.fill();
    }
    for (let i=-1; i<=1; i+=2) {
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(this.pos.x+i*9, this.pos.y-4, 5, 0, TAU); ctx.fill();
      ctx.fillStyle='#f06'; ctx.beginPath(); ctx.arc(this.pos.x+i*9, this.pos.y-4, 2.5, 0, TAU); ctx.fill();
    }
    if (this.action==='dash' && !this.dashPhase) {
      const p=Math.min(1, this.dashDelay/0.55);
      ctx.globalAlpha=0.7; ctx.strokeStyle='#f06'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, this.r+10, -Math.PI/2, -Math.PI/2+p*TAU); ctx.stroke();
    }
    ctx.restore();
    if (this.hp < this.maxHp) {
      const bw=this.r*2+20, bh=10, bx=this.pos.x-bw/2, by=this.pos.y-this.r-20;
      ctx.fillStyle='#400'; ctx.fillRect(bx,by,bw,bh);
      const ratio=this.hp/this.maxHp;
      ctx.fillStyle=ratio>0.5?'#f80':'#f44'; ctx.fillRect(bx,by,bw*ratio,bh);
      ctx.strokeStyle='#ff8'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
      ctx.fillStyle='#ff8'; ctx.fillRect(bx+bw*0.5-1,by,2,bh);
      ctx.fillStyle='#ff8'; ctx.font='bold 11px Georgia'; ctx.textAlign='center';
      ctx.fillText(this.name, this.pos.x, by-5);
    }
  }
}
