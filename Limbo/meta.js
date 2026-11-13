'use strict';

// ═══════════════════════════════════════════════════════════
//  PERMANENT UPGRADES — stored in localStorage
// ═══════════════════════════════════════════════════════════

const PERMANENT_UPGRADES = [
  {
    id: 'vigueur', name: 'Vigueur', icon: '❤',
    desc: '+20 PV max par niveau',
    flavor: '"Le sang des titans coule dans tes veines."',
    maxLevel: 3, costs: [50, 120, 220],
    effect: 'PV max +20/40/60',
    apply(p, lvl) { p.maxHp += 20*lvl; p.hp = Math.min(p.hp + 20*lvl, p.maxHp); }
  },
  {
    id: 'force', name: 'Force Brute', icon: '⚔',
    desc: '+10% dégâts par niveau (mêlée, sort, blast)',
    flavor: '"Chaque frappe est un coup de destin."',
    maxLevel: 3, costs: [60, 140, 240],
    effect: 'Dégâts ×1.1/×1.21/×1.33',
    apply(p, lvl) { p.stats.dmgMult *= Math.pow(1.10, lvl); }
  },
  {
    id: 'resistance', name: 'Résistance', icon: '🛡',
    desc: '-4 dégâts reçus par niveau',
    flavor: '"L\'enfer t\'a rendu plus dur."',
    maxLevel: 3, costs: [70, 160, 260],
    effect: 'Réduction -4/-8/-12 dmg',
    apply(p, lvl) { p.stats.dmgReduce += 4*lvl; }
  },
  {
    id: 'celerite', name: 'Célérité', icon: '👟',
    desc: '+10% vitesse de déplacement par niveau',
    flavor: '"Rapide comme le Styx."',
    maxLevel: 2, costs: [80, 180],
    effect: 'Vitesse ×1.1/×1.21',
    apply(p, lvl) { p.stats.speedMult *= Math.pow(1.10, lvl); }
  },
  {
    id: 'sangfroid', name: 'Sang-Froid', icon: '🌀',
    desc: '+1 charge de dash disponible par niveau',
    flavor: '"L\'esquive est un art, maîtrise-le."',
    maxLevel: 2, costs: [100, 210],
    effect: '+1 charge dash par niveau',
    apply(p, lvl) {
      for (let i = 0; i < lvl; i++) { p.stats.dashCharges++; p.dashCooldowns.push(0); }
    }
  },
  {
    id: 'lame', name: 'Lame Allongée', icon: '📏',
    desc: '+15% portée de mêlée par niveau',
    flavor: '"Touche tes ennemis avant qu\'ils ne te voient."',
    maxLevel: 2, costs: [90, 190],
    effect: 'Portée mêlée ×1.15/×1.32',
    apply(p, lvl) { p.stats.meleeRange *= Math.pow(1.15, lvl); }
  },
  {
    id: 'blast_power', name: 'Éclat d\'Âme', icon: '💜',
    desc: '+20% dégâts du Blast AoE, -1s de cooldown par niveau',
    flavor: '"L\'âme peut être une arme dévastatrice."',
    maxLevel: 2, costs: [110, 230],
    effect: 'Blast +20% dmg, -1s CD',
    apply(p, lvl) { p.stats.blastMult = (p.stats.blastMult || 1) * Math.pow(1.20, lvl); p.stats.blastCDReduc = (p.stats.blastCDReduc||0) + lvl; }
  },
  {
    id: 'memoire', name: 'Mémoire des Dons', icon: '📚',
    desc: 'Commence chaque run avec 1 don aléatoire de départ',
    flavor: '"Les morts gardent leurs secrets — toi aussi."',
    maxLevel: 1, costs: [300],
    effect: '1 boon gratuit au départ',
    apply(p, lvl) { /* handled in startRun */ }
  },
  {
    id: 'fortitude',
    name: 'Endurance',
    icon: '🏔',
    maxLevel: 3,
    costs: [60, 140, 280],
    desc: '+25 PV max par niveau',
    effect: 'Niv 1: +25PV  Niv 2: +50PV  Niv 3: +75PV',
    flavor: 'L\'entraînement dans les enfers forge une constitution d\'acier.',
    apply(player, level) {
      const bonus = level * 25;
      player.maxHp += bonus;
      player.hp = Math.min(player.hp + bonus, player.maxHp);
    }
  },
  {
    id: 'choix_supp', name: 'Oracle Élargi', icon: '🔮',
    desc: 'Les choix de dons passent de 3 à 4 cartes.',
    effect: 'Choix de dons : 3 → 4',
    flavor: '"Quatre chemins s\'ouvrent. Lequel choisiras-tu ?"',
    maxLevel: 1, costs: [120],
    apply(p, lvl) { p.stats.boonChoices = 4; }
  },
  {
    id: 'reroll', name: 'Caprice du Destin', icon: '🎲',
    desc: 'Débloque un bouton Reroll dans le choix de dons (coûte 8 âmes/utilisation).',
    effect: 'Bouton Reroll (8 âmes)',
    flavor: '"Le destin n\'est qu\'un dé que l\'on peut relancer."',
    maxLevel: 1, costs: [80],
    apply(p, lvl) { p.stats.canReroll = true; }
  },
  {
    id: 'soul_harvest', name: 'Moissonneur d\'Âmes', icon: '💎',
    desc: 'Gagnez +20% d\'âmes à la fin de chaque run.',
    effect: '+20%/+44%/+73% âmes par run',
    flavor: '"Les morts sont généreux avec ceux qui savent récolter."',
    maxLevel: 3, costs: [50, 100, 200],
    apply(p, lvl) { p.stats.soulBonus = (p.stats.soulBonus || 1) * 1.20; }
  },
  {
    id: 'cursed_blade', name: 'Lame Maudite', icon: '🗡',
    desc: 'En début de run : −20% HP contre +30% dégâts.',
    effect: '-20% HP max, +30% dégâts',
    flavor: '"Le pouvoir a toujours un prix. Es-tu prêt à le payer ?"',
    maxLevel: 1, costs: [150],
    apply(p, lvl) { p.stats.cursedBlade = true; }
  },
  {
    id: 'hp_bars', name: 'Vision de Sang', icon: '👁',
    desc: 'Voir les barres de vie des ennemis dès le début (sinon elles n\'apparaissent que sous 50%).',
    effect: 'PV ennemis toujours visibles',
    flavor: '"Regarde leur sang se vider — c\'est rassurant."',
    maxLevel: 1, costs: [30],
    apply(p, lvl) { p.stats.alwaysShowHp = true; }
  },
  {
    id: 'second_chance', name: 'Dernière Chance', icon: '💫',
    desc: 'Une fois par run, survive à un coup fatal avec 1 HP.',
    effect: 'Survie 1× par run à 1 HP',
    flavor: '"La mort t\'a regardé droit dans les yeux... et clignié."',
    maxLevel: 1, costs: [200],
    apply(p, lvl) { p.stats.secondChance = true; }
  },
];

const Meta = {
  _KEY: 'underworld_v2',

  _default() {
    return { souls: 0, upgrades: Object.fromEntries(PERMANENT_UPGRADES.map(u => [u.id, 0])) };
  },

  load() {
    try {
      const raw = localStorage.getItem(this._KEY);
      const d = raw ? JSON.parse(raw) : this._default();
      // Ensure all keys exist
      for (const u of PERMANENT_UPGRADES) {
        if (d.upgrades[u.id] === undefined) d.upgrades[u.id] = 0;
      }
      return d;
    } catch(e) { return this._default(); }
  },

  save(d) { try { localStorage.setItem(this._KEY, JSON.stringify(d)); } catch(e) {} },

  getSouls()           { return this.load().souls; },
  getUpgrades()        { return this.load().upgrades; },
  getUpgradeLevel(id)  { return this.load().upgrades[id] || 0; },

  addSouls(amount) {
    const d = this.load();
    d.souls = (d.souls || 0) + amount;
    this.save(d);
    Logger.log('META', `+${amount} âmes → total ${d.souls}`);
    return d.souls;
  },

  buyUpgrade(id) {
    const up = PERMANENT_UPGRADES.find(u => u.id === id);
    if (!up) return { ok: false, reason: 'inconnu' };
    const d = this.load();
    const lvl = d.upgrades[id] || 0;
    if (lvl >= up.maxLevel) return { ok: false, reason: 'niveau max' };
    const cost = up.costs[lvl];
    if (d.souls < cost) return { ok: false, reason: `${cost - d.souls} âmes manquantes` };
    d.souls -= cost;
    d.upgrades[id] = lvl + 1;
    this.save(d);
    Logger.log('META', `Acheté ${up.name} niv.${lvl+1}`, { cost, remaining: d.souls });
    return { ok: true, newLevel: lvl + 1 };
  },

  // Apply all permanent upgrades to a fresh player
  applyToplayer(player) {
    const upgrades = this.getUpgrades();
    for (const up of PERMANENT_UPGRADES) {
      const lvl = upgrades[up.id] || 0;
      if (lvl > 0 && up.id !== 'memoire') {
        up.apply(player, lvl);
        Logger.log('META', `Applied perm upgrade ${up.name} lv${lvl}`);
      }
    }
  },

  // Alias with standard casing
  applyToPlayer(player) { return this.applyToplayer(player); },

  // Calculate souls earned from a run
  calcSouls(depth, roomsCleared, boonCount) {
    const base   = 10;
    const dBonus = depth * 3;
    const rBonus = roomsCleared * 4;
    const bBonus = boonCount * 5;
    const bosses = Math.floor(depth / 5) * 15;
    let total = base + dBonus + rBonus + bBonus + bosses;
    if (depth > 15) total = Math.round(total * (1 + (depth - 15) * 0.05));
    return total;
  },

  reset() {
    this.save(this._default());
  }
};
