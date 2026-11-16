'use strict';

// ═══════════════════════════════════════════════════════════
//  BOON DEFINITIONS
// ═══════════════════════════════════════════════════════════

const ALL_BOONS = [
  // ── UTILITY / GENERAL ──────────────────────────────────────
  {
    id: 'cruel_thrust', name: 'Frappe Cruelle',
    desc: '+30% dégâts d\'attaque',
    rarity: 'common', icon: '⚔', color: '#7af', tags: ['utility'],
    apply(p) { p.stats.dmgMult *= 1.30; }
  },
  {
    id: 'fatal_tempo', name: 'Tempo Fatal',
    desc: '-20% délai entre attaques',
    rarity: 'common', icon: '⚡', color: '#7af', tags: ['melee'],
    apply(p) { p.stats.atkSpeed *= 1.20; }
  },
  {
    id: 'wicked_reach', name: 'Allonge Maudite',
    desc: '+40% portée de mêlée',
    rarity: 'common', icon: '📏', color: '#7af', tags: ['melee'],
    apply(p) { p.stats.meleeRange *= 1.40; }
  },
  // ── RANGED ─────────────────────────────────────────────────
  {
    id: 'twin_shot', name: 'Double Tir',
    desc: 'Les projectiles tirent en double (spread)',
    rarity: 'rare', icon: '🔀', color: '#a7f', tags: ['ranged'],
    apply(p) { p.stats.twinShot = true; }
  },
  {
    id: 'triple_cast', name: 'Triple Lancer',
    desc: 'Lance 3 projectiles en éventail',
    rarity: 'epic', icon: '🌟', color: '#f7a', tags: ['ranged'],
    apply(p) { p.stats.tripleShot = true; }
  },
  {
    id: 'pierce', name: 'Tir Perforant',
    desc: 'Les projectiles traversent les ennemis',
    rarity: 'rare', icon: '→→', color: '#a7f', tags: ['ranged'],
    apply(p) { p.stats.pierce = true; }
  },
  // ── MELEE / DASH ───────────────────────────────────────────
  {
    id: 'dash_strike', name: 'Frappe en Dash',
    desc: 'Traverser un ennemi en dash inflige 25 dégâts',
    rarity: 'rare', icon: '💨', color: '#7ff', tags: ['melee'],
    apply(p) { p.stats.dashDmg += 25; }
  },
  {
    id: 'extra_dash', name: 'Réflexes Supérieurs',
    desc: '+1 charge de dash disponible',
    rarity: 'rare', icon: '🌀', color: '#7ff', tags: ['utility'],
    apply(p) { p.stats.dashCharges += 1; p.dashCooldowns.push(0); }
  },
  {
    id: 'dash_heal', name: 'Fuite Vitale',
    desc: 'Chaque dash restaure 4 PV',
    rarity: 'common', icon: '💉', color: '#7ff', tags: ['utility'],
    apply(p) { p.stats.dashHeal += 4; }
  },
  // ── DEFENSE ────────────────────────────────────────────────
  {
    id: 'tough_skin', name: 'Peau Épaisse',
    desc: '-6 dégâts reçus par coup',
    rarity: 'common', icon: '🛡', color: '#fa7', tags: ['defense'],
    apply(p) { p.stats.dmgReduce += 6; }
  },
  {
    id: 'stubborn_roots', name: 'Racines Tenaces',
    desc: 'Restaure 8 PV à chaque salle franchie',
    rarity: 'common', icon: '🌿', color: '#fa7', tags: ['defense'],
    apply(p) { p.stats.roomHeal += 8; }
  },
  {
    id: 'max_hp', name: 'Cœur de Titan',
    desc: '+40 PV max et restaure 40 PV',
    rarity: 'rare', icon: '❤', color: '#fa7', tags: ['defense'],
    apply(p) { p.maxHp += 40; p.hp = Math.min(p.hp + 40, p.maxHp); }
  },
  {
    id: 'kill_heal', name: 'Âme Dévorante',
    desc: '+6 PV par ennemi tué',
    rarity: 'rare', icon: '💀', color: '#fa7', tags: ['defense'],
    apply(p) { p.stats.killHeal += 6; }
  },
  {
    id: 'life_steal', name: 'Vol de Vie',
    desc: '12% des dégâts infligés restaurés en PV',
    rarity: 'epic', icon: '🩸', color: '#f7a', tags: ['defense'],
    apply(p) { p.stats.lifeSteal += 0.12; }
  },
  // ── UTILITY / STATUS ───────────────────────────────────────
  {
    id: 'bleed', name: 'Saignement',
    desc: 'Attaques infligent 5 dégâts/s pendant 3s',
    rarity: 'common', icon: '🗡', color: '#f77', tags: ['melee'],
    apply(p) { p.stats.bleed = true; }
  },
  {
    id: 'chill', name: 'Glaciation',
    desc: '30% de chance de ralentir 50% pendant 2s',
    rarity: 'common', icon: '❄', color: '#7af', tags: ['utility'],
    apply(p) { p.stats.chill = true; }
  },
  {
    id: 'explode_on_kill', name: 'Mort Explosive',
    desc: 'Les ennemis explosent à la mort (25 dégâts AoE)',
    rarity: 'epic', icon: '💥', color: '#f7a', tags: ['utility'],
    apply(p) { p.stats.explodeOnKill = true; }
  },
  {
    id: 'revenge', name: 'Riposte',
    desc: 'Être touché renvoie 15 dégâts à l\'attaquant',
    rarity: 'rare', icon: '🔄', color: '#fa7', tags: ['defense'],
    apply(p) { p.stats.revengeDmg += 15; }
  },
  {
    id: 'chain', name: 'Réaction en Chaîne',
    desc: 'Chaque 4ème frappe consécutive fait ×2 dégâts',
    rarity: 'epic', icon: '⛓', color: '#f7a', tags: ['melee'],
    apply(p) { p.stats.chain = true; }
  },
  {
    id: 'speed_boost', name: 'Vélocité',
    desc: '+20% vitesse de déplacement',
    rarity: 'common', icon: '👟', color: '#7ff', tags: ['utility'],
    apply(p) { p.stats.speedMult *= 1.20; }
  },
  {
    id: 'temporal_haste',
    name: 'Hâte Temporelle',
    icon: '⚡',
    rarity: 'rare',
    color: '#7af',
    tags: ['ranged'],
    desc: 'Chaque kill réduit les cooldowns de 0.3s.',
    apply(p) {
      p.stats.killCDReduc = (p.stats.killCDReduc || 0) + 0.3;
    }
  },
  {
    id: 'soul_barrier',
    name: 'Bouclier d\'Âme',
    icon: '🛡',
    rarity: 'rare',
    color: '#fa7',
    tags: ['defense'],
    desc: 'Réduit les dégâts reçus de 15% supplémentaires.',
    apply(p) { p.stats.dmgReduce = (p.stats.dmgReduce || 0) + 15; }
  },
  {
    id: 'blood_frenzy',
    name: 'Frénésie Sanglante',
    icon: '🩸',
    rarity: 'epic',
    color: '#f7a',
    tags: ['melee'],
    desc: 'Chaque kill augmente les dégâts de 3% (max +30%).',
    apply(p) {
      p.stats.frenzyStacks = p.stats.frenzyStacks || 0;
      // Stacks tracked in kill detection
    }
  },
  {
    id: 'void_step',
    name: 'Pas du Vide',
    icon: '🌑',
    rarity: 'epic',
    color: '#7ff',
    tags: ['melee'],
    desc: 'Dash inflige 150% des dégâts normaux et ralentit.',
    apply(p) { p.stats.dashDmg = Math.max(p.stats.dashDmg, Math.round(p.meleeDmg * 1.5)); p.stats.chill = true; }
  },

  // ── NOUVEAUX BOONS RANGED ───────────────────────────────────
  { id:'ricochet', name:'Ricochet', icon:'🔄', color:'#40c8ff', rarity:'rare', tags:['ranged'],
    desc:'Les projectiles rebondissent sur les murs (1 rebond).',
    apply(p){ p.stats.projectileBounce = (p.stats.projectileBounce||0)+1; } },

  { id:'double_salve', name:'Double Salve', icon:'⚡', color:'#80ffff', rarity:'rare', tags:['ranged'],
    desc:'Tire 2 projectiles simultanément avec un léger écart.',
    apply(p){ p.stats.projectileCount = (p.stats.projectileCount||1)+1; } },

  { id:'tir_lourd', name:'Tir Lourd', icon:'🎯', color:'#4080ff', rarity:'common', tags:['ranged'],
    desc:'+35% dégâts projectile, +0.1s cooldown.',
    apply(p){ p.stats.castDmgMult=(p.stats.castDmgMult||1)*1.35; p.stats.castCooldown=(p.stats.castCooldown||0)+0.1; } },

  { id:'rafale', name:'Rafale', icon:'💨', color:'#a0d8ff', rarity:'epic', tags:['ranged'],
    desc:'Le sort tire une rafale de 3 projectiles rapides.',
    apply(p){ p.stats.burstShot = (p.stats.burstShot||0)+1; } },

  { id:'impact_explosif', name:'Impact Explosif', icon:'💥', color:'#ff8040', rarity:'epic', tags:['ranged'],
    desc:'Les projectiles explosent à l\'impact (AoE 65px, 50% dmg).',
    apply(p){ p.stats.projectileExplosion = true; } },

  { id:'homing', name:'Guidage Spectral', icon:'🌀', color:'#c080ff', rarity:'rare', tags:['ranged'],
    desc:'Les projectiles se dirigent légèrement vers les ennemis proches.',
    apply(p){ p.stats.projectileHoming = true; } },

  { id:'cast_cd_reduce', name:'Canalisation', icon:'⏱', color:'#60c0ff', rarity:'common', tags:['ranged'],
    desc:'Réduit le cooldown du sort de 30%.',
    apply(p){ p.stats.castCooldownMult=(p.stats.castCooldownMult||1)*0.70; } },

  // ── NOUVEAUX BOONS MELEE ────────────────────────────────────
  { id:'tourbillon', name:'Tourbillon', icon:'🌪', color:'#ff6040', rarity:'epic', tags:['melee'],
    desc:'Le Blast devient un tourbillon autour du joueur (+50% portée, 360°).',
    apply(p){ p.stats.blastWhirlwind = true; p.stats.blastRange=(p.stats.blastRange||80)*1.5; } },

  { id:'lame_enflammee', name:'Lame Enflammée', icon:'🔥', color:'#ff4000', rarity:'rare', tags:['melee'],
    desc:'Les coups de mêlée appliquent une brûlure (8 dmg/s, 2s).',
    apply(p){ p.stats.meleeBurn = true; } },

  { id:'execution', name:'Exécution', icon:'💀', color:'#800020', rarity:'epic', tags:['melee'],
    desc:'Les ennemis sous 20% HP meurent instantanément sur un coup de mêlée.',
    apply(p){ p.stats.executionThreshold = 0.20; } },

  { id:'contre_attaque', name:'Contre-Attaque', icon:'🛡', color:'#c0a000', rarity:'rare', tags:['melee'],
    desc:'Pendant 0.4s après avoir pris un coup, la mêlée inflige 2.5x les dégâts.',
    apply(p){ p.stats.counterAttack = true; } },

  { id:'lame_sismique', name:'Lame Sismique', icon:'🌍', color:'#a06020', rarity:'rare', tags:['melee'],
    desc:'Chaque 3e coup de mêlée provoque une onde de choc (80px, 60% dmg).',
    apply(p){ p.stats.seismicStrike = true; p.stats.seismicCounter = 0; } },

  { id:'regain_vital', name:'Regain Vital', icon:'💚', color:'#50d050', rarity:'rare', tags:['defense'],
    desc:'Régénère 1.5 PV/s en permanence.',
    apply(p){ p.stats.regenRate = (p.stats.regenRate||0) + 1.5; } },

  { id:'impact_critique', name:'Impact Critique', icon:'🎯', color:'#ffcc00', rarity:'rare', tags:['utility'],
    desc:'+15% chance de coup critique (tirs et mêlée).',
    apply(p){ p.stats.critChance = (p.stats.critChance||0.10) + 0.15; } },

  { id:'derniere_lame', name:'Dernière Lame', icon:'🩸', color:'#cc2020', rarity:'epic', tags:['melee'],
    desc:'Sous 30% PV, tous vos dégâts sont multipliés par 1.5.',
    apply(p){ p.stats.lastBlade = true; } },
];

// ═══════════════════════════════════════════════════════════
//  SYNERGIES (duo-boons)
// ═══════════════════════════════════════════════════════════
const SYNERGIES = [
  {
    id: 'vampire', name: 'Âme Vampirique', icon: '🧛',
    requires: ['life_steal', 'kill_heal'],
    desc: 'Vol de vie +25%, kills soignent le double.',
    apply(p) { p.stats.lifeSteal *= 1.25; p.stats.killHeal = Math.round(p.stats.killHeal * 2); }
  },
  {
    id: 'frostfire', name: 'Brûlure Glaciale', icon: '🌡',
    requires: ['bleed', 'chill'],
    desc: 'Ennemis ralentis prennent +70% dégâts de saignement.',
    apply(p) { p.stats.frostfire = true; }
  },
  {
    id: 'storm', name: 'Tempête de Lames', icon: '🌪',
    requires: ['triple_cast', 'pierce'],
    desc: 'Projectiles perforants +25% de dégâts supplémentaires.',
    apply(p) { p.stats.dmgMult *= 1.25; }
  },
  {
    id: 'death_dance', name: 'Danse Mortelle', icon: '💃',
    requires: ['dash_strike', 'extra_dash'],
    desc: 'Dégâts du dash doublés, temps d\'invincibilité +20%.',
    apply(p) { p.stats.dashDmg = Math.round(p.stats.dashDmg * 2); }
  },
  {
    id: 'chain_boom', name: 'Réaction Explosive', icon: '⛓',
    requires: ['chain', 'explode_on_kill'],
    desc: 'Frappe chaîne déclenche aussi l\'explosion. +50% rayon explosion.',
    apply(p) { p.stats.chainExplode = true; }
  },
  {
    id: 'iron_revenge', name: 'Riposte de Fer', icon: '⚖',
    requires: ['revenge', 'tough_skin'],
    desc: 'Dégâts riposte doublés. Réduction dégâts +3.',
    apply(p) { p.stats.revengeDmg = Math.round(p.stats.revengeDmg * 2); p.stats.dmgReduce += 3; }
  },
  {
    id: 'swift_death', name: 'Mort Rapide', icon: '⚡',
    requires: ['fatal_tempo', 'cruel_thrust'],
    desc: 'Chaque 6ème frappe consécutive est instantanée et fait ×2 dégâts.',
    apply(p) { p.stats.swiftDeath = true; p.stats._swiftCount = 0; }
  },
  {
    id: 'plague_carrier', name: 'Porteur de Fléau', icon: '☣',
    requires: ['bleed', 'explode_on_kill'],
    desc: 'Explosions de kill propagent le saignement aux voisins dans 130px.',
    apply(p) { p.stats.plagueExplosion = true; }
  },
  {
    id: 'syn_frenzy_bleed',
    name: 'Carnage Absolu',
    icon: '💀',
    requires: ['blood_frenzy', 'bleed'],
    desc: 'Frénésie: +5% dmg/kill (au lieu de 3%), stacks max 50%.',
    apply(p) { p.stats.frenzyBonus = 0.05; p.stats.frenzyMax = 0.5; }
  },
  {
    id: 'syn_void_pierce',
    name: 'Lame du Néant',
    icon: '🌀',
    requires: ['void_step', 'pierce'],
    desc: 'Dash traverse les ennemis et perfore, dégâts ×2.',
    apply(p) { p.stats.dashDmg = Math.round(p.stats.dashDmg * 2); }
  },
];

// Check and apply synergies when a boon is picked
function checkSynergies(player) {
  for (const syn of SYNERGIES) {
    if (player.synergyIds.includes(syn.id)) continue;
    if (syn.requires.every(id => player.boonIds.includes(id))) {
      syn.apply(player);
      player.synergyIds.push(syn.id);
      Logger.log('BOON', `SYNERGIE activée: ${syn.name}`, { requires: syn.requires });
      Particles.burst(player.pos.x, player.pos.y, 25, '#f8a', 150, 4);
    }
  }
}

// Fallback boons: infinite, always available when the pool is exhausted
const FALLBACK_BOONS = [
  { id:'hp_up', name:'+10 PV Max', icon:'❤', color:'#f44', rarity:'common', tags:['defense'],
    desc:'Augmente les PV maximum de 10 et restaure 10 PV.',
    apply(p) { p.maxHp += 10; p.hp = Math.min(p.hp + 10, p.maxHp); } },
  { id:'souls_gain', name:'+15 Âmes', icon:'💎', color:'#ffcc00', rarity:'common', tags:['utility'],
    desc:'Gagne immédiatement 15 âmes permanentes.',
    apply(p) { Meta.addSouls(15); } },
  { id:'hp_up_big', name:'+25 PV Max', icon:'💖', color:'#f88', rarity:'rare', tags:['defense'],
    desc:'Augmente les PV maximum de 25 et restaure 25 PV.',
    apply(p) { p.maxHp += 25; p.hp = Math.min(p.hp + 25, p.maxHp); } },
  { id:'souls_gain_big', name:'+30 Âmes', icon:'💠', color:'#88ff44', rarity:'rare', tags:['utility'],
    desc:'Gagne immédiatement 30 âmes permanentes.',
    apply(p) { Meta.addSouls(30); } },
];

function pickBoons(playerBoonIds, count = 3, playstyleRatio = 0.5) {
  const pool = ALL_BOONS.filter(b => !playerBoonIds.includes(b.id));

  // Calculate weight for each boon
  const weighted = pool.map(b => {
    let w = 1.0;
    const tags = b.tags || ['utility'];
    if (tags.includes('ranged')) w *= (0.4 + playstyleRatio * 1.2);
    if (tags.includes('melee'))  w *= (0.4 + (1 - playstyleRatio) * 1.2);
    // Rarity weights
    if (b.rarity === 'rare') w *= 0.65;
    if (b.rarity === 'epic') w *= 0.35;
    return { boon: b, weight: Math.max(0.05, w) };
  });

  // Weighted pick without replacement
  const picks = [];
  const used = new Set();
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const available = weighted.filter(w => !used.has(w.boon.id));
    const total = available.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const w of available) {
      r -= w.weight;
      if (r <= 0) { picks.push(w.boon); used.add(w.boon.id); break; }
    }
    if (picks.length <= i) {
      const fb = available.find(w => !used.has(w.boon.id));
      if (fb) { picks.push(fb.boon); used.add(fb.boon.id); }
    }
  }

  // If pool exhausted, fill remaining slots with fallback boons (shuffled)
  while (picks.length < count) {
    const shuffled = FALLBACK_BOONS.slice().sort(() => Math.random() - 0.5);
    for (const fb of shuffled) {
      if (picks.length >= count) break;
      if (!picks.some(p => p.id === fb.id)) picks.push(fb);
    }
    if (picks.length < count) break; // safety
  }

  return picks;
}

// ═══════════════════════════════════════════════════════════
//  BOON PICKER UI
// ═══════════════════════════════════════════════════════════
class BoonPicker {
  constructor(boons, onPick, playerBoonIds = [], options = {}) {
    this.boons        = boons;
    this.onPick       = onPick;
    this.playerBoonIds= playerBoonIds;
    this._options     = options; // { canReroll, rerollCost, onReroll }
    this.hovered      = -1;
    this.alpha        = 0;
    this.done         = false;
    this._rerollHovered = false;
    this._rerollBtn   = null;
  }

  _wouldSynergize(boon) {
    return SYNERGIES.some(s => {
      if (!s.requires.includes(boon.id)) return false;
      const otherReqs = s.requires.filter(id => id !== boon.id);
      return otherReqs.every(id => this.playerBoonIds.includes(id));
    });
  }

  handleMouse(mx, my, clicked) {
    if (this.done) return;
    this.hovered = -1;
    this._rerollHovered = false;

    // Check reroll button first
    if (this._options.canReroll && this._rerollBtn) {
      const r = this._rerollBtn;
      this._rerollHovered = hitTest(mx, my, r.x, r.y, r.w, r.h);
      if (clicked && this._rerollHovered && this._options.onReroll) {
        const cost = this._options.rerollCost || 8;
        if (Meta.getSouls() >= cost) {
          Meta.addSouls(-cost);
          this._options.onReroll();
          return;
        }
      }
    }

    for (let i = 0; i < this.boons.length; i++) {
      const { x, y, w, h } = this._cardBounds(i);
      if (mx > x && mx < x+w && my > y && my < y+h) {
        this.hovered = i;
        if (clicked) {
          this.onPick(this.boons[i]);
          this.done = true;
        }
      }
    }
  }

  _cardBounds(i) {
    const totalW = this.boons.length * 220 + (this.boons.length - 1) * 20;
    const startX = W / 2 - totalW / 2;
    return { x: startX + i * 240, y: H / 2 - 160, w: 220, h: 320 };
  }

  update(dt) {
    this.alpha = Math.min(1, this.alpha + dt * 3);
  }

  draw(ctx) {
    // Overlay
    ctx.fillStyle = `rgba(5,3,15,${0.85 * this.alpha})`;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = '#ff8';
    ctx.font = 'bold 28px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('— CHOISISSEZ UN DON —', W/2, H/2 - 200);
    ctx.restore();

    // Cards
    for (let i = 0; i < this.boons.length; i++) {
      this._drawCard(ctx, i);
    }

    // Reroll button
    if (this._options.canReroll) {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      const cost = this._options.rerollCost || 8;
      const souls = Meta.getSouls();
      const canAfford = souls >= cost;
      const { y: cardY, h: cardH } = this._cardBounds(0);
      const bx = W/2 - 80, by = cardY + cardH + 20;
      const hov = this._rerollHovered;
      ctx.fillStyle = canAfford ? (hov ? '#5050c0' : '#303080') : '#333';
      _roundRect(ctx, bx, by, 160, 36, 8);
      ctx.fill();
      ctx.strokeStyle = canAfford ? (hov ? '#a090ff' : '#6050c0') : '#555';
      ctx.lineWidth = 1.5;
      _roundRect(ctx, bx, by, 160, 36, 8);
      ctx.stroke();
      ctx.fillStyle = canAfford ? '#fff' : '#666';
      ctx.font = 'bold 14px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(`\uD83C\uDFB2 Reroll (${cost} \uD83D\uDCAE)`, W/2, by + 24);
      this._rerollBtn = { x: bx, y: by, w: 160, h: 36 };
      ctx.restore();
    }
  }

  _drawCard(ctx, i) {
    const b = this.boons[i];
    const { x, y, w, h } = this._cardBounds(i);
    const hover = this.hovered === i;
    const cy = hover ? y - 8 : y;
    const synergy = this._wouldSynergize(b);

    ctx.save();
    ctx.globalAlpha = this.alpha;

    const rarityColors = { common: '#7af', rare: '#c5f', epic: '#f8a' };
    const rc = rarityColors[b.rarity] || '#fff';
    const glowColor = synergy ? '#ffcc00' : rc;

    // Card shadow — gold glow if synergy available
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = synergy ? 30 : (hover ? 25 : 10);

    // Card background — slight gold tint for synergy
    ctx.fillStyle = synergy ? (hover ? '#2a2010' : '#1a1508') : (hover ? '#1a1540' : '#120e30');
    _roundRect(ctx, x, cy, w, h, 10);
    ctx.fill();

    // Card border
    ctx.strokeStyle = synergy ? '#ffcc00' : rc;
    ctx.lineWidth = (hover || synergy) ? 3 : 1.5;
    _roundRect(ctx, x, cy, w, h, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Synergy banner at top
    if (synergy) {
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(x, cy, w, 24);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText('⛓  SYNERGIE DISPONIBLE  ⛓', x + w/2, cy + 16);
    }

    // Rarity label
    ctx.fillStyle = rc;
    ctx.font = 'bold 11px Georgia';
    ctx.textAlign = 'center';
    const rarityNames = { common: 'COMMUN', rare: 'RARE', epic: 'ÉPIQUE' };
    ctx.fillText(rarityNames[b.rarity] || '', x + w/2, cy + (synergy ? 38 : 22));

    // Icon
    ctx.font = '50px serif';
    ctx.fillText(b.icon, x + w/2, cy + 85);

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${hover ? 17 : 16}px Georgia`;
    ctx.fillText(b.name, x + w/2, cy + 120);

    // Divider
    ctx.strokeStyle = `rgba(255,255,255,0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+20, cy+135); ctx.lineTo(x+w-20, cy+135); ctx.stroke();

    // Description (word wrap)
    ctx.fillStyle = '#ccc';
    ctx.font = '13px Georgia';
    const words = b.desc.split(' ');
    let line = '', lineY = cy + 160;
    for (const word of words) {
      const test = line + (line ? ' ' : '') + word;
      if (ctx.measureText(test).width > w - 30 && line) {
        ctx.fillText(line, x + w/2, lineY);
        line = word; lineY += 20;
      } else { line = test; }
    }
    if (line) ctx.fillText(line, x + w/2, lineY);

    if (hover) {
      ctx.fillStyle = synergy ? '#ffcc00' : rc;
      ctx.font = 'bold 13px Georgia';
      ctx.fillText('[ CLIQUER POUR CHOISIR ]', x + w/2, cy + h - 18);
    }

    ctx.restore();
  }
}
