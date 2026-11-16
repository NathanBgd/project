'use strict';

class Particle {
  constructor(x, y, vx, vy, r, color, life, gravity = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r; this.color = color; this.life = life; this.maxLife = life;
    this.gravity = gravity;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.vx *= (1 - 5 * dt);
    this.vy *= (1 - 5 * dt);
    this.life -= dt;
  }
  draw(ctx) {
    const a = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * a + 0.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class TextParticle {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.vy = -60; this.life = 0.9; this.maxLife = 0.9;
  }
  update(dt) { this.y += this.vy * dt; this.vy *= (1 - 3 * dt); this.life -= dt; }
  draw(ctx) {
    const a = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = a;
    ctx.font = 'bold 15px Georgia';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

class BigTextParticle {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.vy = -40; this.life = 1.4; this.maxLife = 1.4;
    this.scale = 1.0;
  }
  update(dt) {
    this.y += this.vy * dt;
    this.vy *= (1 - 2 * dt);
    this.scale = 1.0 + Math.sin(this.life * 4) * 0.08;
    this.life -= dt;
  }
  draw(ctx) {
    const a = Math.max(0, Math.min(1, this.life / this.maxLife));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `bold ${Math.round(28 * this.scale)}px Georgia`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

class RingParticle {
  constructor(x, y, startR, endR, color, life) {
    this.x=x; this.y=y; this.r=startR; this.endR=endR;
    this.color=color; this.life=life; this.maxLife=life;
  }
  update(dt) { this.r += (this.endR - this.r) * Math.min(1, dt*6); this.life -= dt; }
  draw(ctx) {
    const a = Math.max(0, this.life/this.maxLife);
    ctx.save(); ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = this.color; ctx.lineWidth = 3*a;
    ctx.shadowColor = this.color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(0.1, this.r), 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0; ctx.restore();
  }
}

const Particles = {
  list: [],

  burst(x, y, count, color, speed = 120, r = 3, gravity = 60) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), s = rand(speed * 0.3, speed);
      this.list.push(new Particle(x, y, Math.cos(a)*s, Math.sin(a)*s, rand(r*0.5, r), color, rand(0.3, 0.8), gravity));
    }
  },

  sparks(x, y, count, color = '#fff') {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), s = rand(80, 200);
      this.list.push(new Particle(x, y, Math.cos(a)*s, Math.sin(a)*s, rand(1, 2.5), color, rand(0.2, 0.5), 0));
    }
  },

  damage(x, y, amount, isCrit = false) {
    const color = isCrit ? '#ff4' : '#f88';
    this.list.push(new TextParticle(x + rand(-10, 10), y - 10, isCrit ? `${amount}!` : `${amount}`, color));
  },

  heal(x, y, amount) {
    this.list.push(new TextParticle(x + rand(-10, 10), y - 10, `+${amount}`, '#5f5'));
  },

  bigText(x, y, text, color = '#ff8') {
    this.list.push(new BigTextParticle(x, y, text, color));
  },

  ring(x, y, startR, endR, color, life=0.5) {
    this.list.push(new RingParticle(x, y, startR, endR, color, life));
  },

  death(x, y, color, r=18) {
    this.burst(x, y, 20, color, 200, 4, 80);
    this.burst(x, y, 8, '#fff', 100, 2, 0);
    this.ring(x, y, r, r+60, color, 0.5);
  },

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].update(dt);
      if (this.list[i].life <= 0) this.list.splice(i, 1);
    }
  },

  draw(ctx) {
    for (const p of this.list) p.draw(ctx);
  },

  clear() { this.list = []; }
};
