'use strict';

// ═══════════════════════════════════════════════════════════
//  SHARED UI HELPERS
// ═══════════════════════════════════════════════════════════
function drawPanel(ctx, x, y, w, h, title, titleColor = '#ff8') {
  ctx.fillStyle = 'rgba(5,3,20,0.97)';
  _roundRect(ctx, x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = '#3a2860'; ctx.lineWidth = 2;
  _roundRect(ctx, x, y, w, h, 14); ctx.stroke();
  if (title) {
    ctx.fillStyle = titleColor; ctx.font = 'bold 22px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(title, x + w/2, y + 36);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+20, y+46); ctx.lineTo(x+w-20, y+46); ctx.stroke();
  }
}

function drawButton(ctx, x, y, w, h, label, hovered, color = '#6050a0', textColor = '#fff') {
  ctx.fillStyle = hovered ? '#8070c0' : color;
  _roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = hovered ? '#fff' : '#8070c0'; ctx.lineWidth = hovered ? 2 : 1;
  _roundRect(ctx, x, y, w, h, 8); ctx.stroke();
  ctx.fillStyle = textColor; ctx.font = `bold ${h < 32 ? 12 : 14}px Georgia`; ctx.textAlign = 'center';
  ctx.fillText(label, x + w/2, y + h/2 + 5);
}

function hitTest(mx, my, x, y, w, h) { return mx>x && mx<x+w && my>y && my<y+h; }

// ═══════════════════════════════════════════════════════════
//  GRIMOIRE SCREEN
// ═══════════════════════════════════════════════════════════
// ── GrimoireScreen layout constants (module-level to avoid static field issues) ──
const GR_COLS = 4, GR_CARD_W = 220, GR_CARD_H = 100, GR_GAP = 10, GR_START_Y = 125;
// Close button — single source of truth for both draw + hitTest
const GR_CLOSE = { x: W - 115, y: 14, w: 95, h: 36 };

class GrimoireScreen {
  constructor(onClose) {
    this.onClose  = onClose;
    this.selected = null;
    this.scroll   = 0;
    this.hovered  = null;
  }

  _cardBounds(i) {
    const startX = (W - GR_COLS*(GR_CARD_W+GR_GAP) + GR_GAP) / 2;
    const col = i % GR_COLS, row = Math.floor(i / GR_COLS);
    return { x: startX + col*(GR_CARD_W+GR_GAP), y: GR_START_Y + row*(GR_CARD_H+GR_GAP) - this.scroll };
  }

  _maxScroll() {
    const rows = Math.ceil(ALL_BOONS.length / GR_COLS);
    const contentH = GR_START_Y + rows*(GR_CARD_H+GR_GAP) + 20 + 16 + SYNERGIES.length * 65 + 30;
    return Math.max(0, contentH - (H - 60));
  }

  handleMouse(mx, my, clicked) {
    this._lastMx = mx; this._lastMy = my;
    // Close button — always first priority
    if (hitTest(mx, my, GR_CLOSE.x, GR_CLOSE.y, GR_CLOSE.w, GR_CLOSE.h) && clicked) {
      this.onClose(); return;
    }

    this.hovered = null;
    // Skip card hit-testing in fixed header/footer strips
    if (my < 60 || my > H - 55) return;

    for (let i = 0; i < ALL_BOONS.length; i++) {
      const b = this._cardBounds(i);
      if (hitTest(mx, my, b.x, b.y, GR_CARD_W, GR_CARD_H)) {
        this.hovered = ALL_BOONS[i].id;
        if (clicked) this.selected = this.selected === ALL_BOONS[i].id ? null : ALL_BOONS[i].id;
        return;
      }
    }
    if (clicked) this.selected = null;
  }

  handleScroll(dy) { this.scroll = clamp(this.scroll + dy, 0, this._maxScroll()); }

  draw(ctx) {
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0, 0, W, H);
    drawPanel(ctx, 20, 10, W-40, H-20, '📖  GRIMOIRE  —  Dons & Synergies');

    // ── Clipped scrollable region ────────────────────────────
    ctx.save();
    ctx.beginPath(); ctx.rect(22, 60, W-44, H-120); ctx.clip();

    // Boon cards
    for (let i = 0; i < ALL_BOONS.length; i++) {
      const b = ALL_BOONS[i];
      const { x, y } = this._cardBounds(i);
      this._drawBoonCard(ctx, b, x, y, GR_CARD_W, GR_CARD_H, this.hovered === b.id, this.selected === b.id);
    }

    // Synergies section (scrolled, inside clip)
    const rows = Math.ceil(ALL_BOONS.length / GR_COLS);
    const synY = GR_START_Y + rows*(GR_CARD_H+GR_GAP) + 20 - this.scroll;

    ctx.fillStyle = '#ff8'; ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('⛓  SYNERGIES  —  Combinaisons de Dons', W/2, synY);
    ctx.strokeStyle = 'rgba(255,200,0,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, synY+8); ctx.lineTo(W-60, synY+8); ctx.stroke();

    for (let i = 0; i < SYNERGIES.length; i++) {
      const sx = 50 + (i % 3) * 370;
      const sy = synY + 20 + Math.floor(i/3) * 65;
      this._drawSynergyCard(ctx, SYNERGIES[i], sx, sy, 350, 55);
    }

    ctx.restore(); // end clip

    // ── Fixed UI on top of scrollable area ───────────────────

    // Scroll hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '11px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('Molette pour faire défiler  ·  Clic sur un don pour plus de détails', W/2, H-32);

    // Detail panel (always on top, never clipped)
    if (this.selected) {
      const b = ALL_BOONS.find(b => b.id === this.selected);
      if (b) this._drawDetail(ctx, b);
    }

    // Close button (always last → always on top)
    const c = GR_CLOSE;
    const closeHov = hitTest(this._lastMx||0, this._lastMy||0, c.x, c.y, c.w, c.h);
    ctx.fillStyle = closeHov ? '#700' : '#400';
    _roundRect(ctx, c.x, c.y, c.w, c.h, 8); ctx.fill();
    ctx.strokeStyle = '#f88'; ctx.lineWidth = 2;
    _roundRect(ctx, c.x, c.y, c.w, c.h, 8); ctx.stroke();
    ctx.fillStyle = '#f88'; ctx.font = 'bold 14px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('✕  FERMER', c.x + c.w/2, c.y + c.h/2 + 5);
  }

  _drawBoonCard(ctx, b, x, y, w, h, hovered, selected) {
    const rarityColor = { common:'#7af', rare:'#c5f', epic:'#f8a' }[b.rarity] || '#fff';
    ctx.save();
    ctx.shadowColor = selected ? rarityColor : (hovered ? rarityColor : 'transparent');
    ctx.shadowBlur  = selected ? 15 : (hovered ? 8 : 0);
    ctx.fillStyle   = selected ? '#1e1850' : (hovered ? '#181440' : '#10102a');
    _roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = selected ? rarityColor : (hovered ? rarityColor+'88' : '#2a2050');
    ctx.lineWidth   = selected ? 2 : 1;
    _roundRect(ctx, x, y, w, h, 8); ctx.stroke();
    ctx.shadowBlur  = 0;

    // Icon
    ctx.font = '28px serif'; ctx.textAlign = 'center';
    ctx.fillText(b.icon, x + 28, y + 42);

    // Rarity bar
    ctx.fillStyle = rarityColor; ctx.fillRect(x, y+h-6, w, 6);
    _roundRect(ctx, x, y, w, h, 8);  // clip bottom corners

    // Name
    ctx.fillStyle = '#fff'; ctx.font = `bold 13px Georgia`; ctx.textAlign = 'left';
    ctx.fillText(b.name, x+54, y+22);

    // Rarity label
    const rl = { common:'Commun', rare:'Rare', epic:'Épique' }[b.rarity];
    ctx.fillStyle = rarityColor; ctx.font = '10px Georgia';
    ctx.fillText(rl, x+54, y+36);

    // Short desc (truncated)
    ctx.fillStyle = '#aaa'; ctx.font = '11px Georgia';
    const desc = b.desc.length > 45 ? b.desc.slice(0,42)+'…' : b.desc;
    ctx.fillText(desc, x+10, y+60);

    // Synergy indicator
    const hasSyn = SYNERGIES.some(s => s.requires.includes(b.id));
    if (hasSyn) {
      ctx.fillStyle = '#fa0'; ctx.font = '10px Georgia';
      ctx.textAlign = 'right';
      ctx.fillText('⛓ synergie', x+w-8, y+82);
    }
    ctx.restore();
  }

  _drawDetail(ctx, b) {
    const rarityColor = { common:'#7af', rare:'#c5f', epic:'#f8a' }[b.rarity] || '#fff';
    const px = W/2 - 240, py = H - 220, pw = 480, ph = 200;
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,20,0.98)';
    _roundRect(ctx, px, py, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = rarityColor; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 12); ctx.stroke();

    ctx.font = '40px serif'; ctx.textAlign = 'left';
    ctx.fillText(b.icon, px+16, py+54);

    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Georgia';
    ctx.fillText(b.name, px+70, py+30);
    ctx.fillStyle = rarityColor; ctx.font = '12px Georgia';
    const rl = { common:'Commun', rare:'Rare', epic:'Épique' }[b.rarity];
    ctx.fillText(rl.toUpperCase(), px+70, py+48);
    ctx.fillStyle = '#ccc'; ctx.font = '13px Georgia';
    ctx.fillText(b.desc, px+70, py+68);

    // Synergies involving this boon
    const syns = SYNERGIES.filter(s => s.requires.includes(b.id));
    if (syns.length > 0) {
      ctx.fillStyle = '#fa0'; ctx.font = 'bold 12px Georgia';
      ctx.fillText('⛓ Synergies possibles :', px+16, py+100);
      for (let i = 0; i < syns.length; i++) {
        const s = syns[i];
        const other = s.requires.filter(id => id !== b.id).map(id => ALL_BOONS.find(x=>x.id===id)?.name||id).join(' + ');
        ctx.fillStyle = '#f8a'; ctx.font = '11px Georgia';
        ctx.fillText(`${s.icon} ${s.name}  (avec ${other}) — ${s.desc}`, px+16, py+118+i*18);
      }
    } else {
      ctx.fillStyle = '#666'; ctx.font = 'italic 12px Georgia';
      ctx.fillText('Pas de synergie pour ce don.', px+16, py+105);
    }
    ctx.restore();
  }

  _drawSynergyCard(ctx, s, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#0e0a20';
    _roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#604880'; ctx.lineWidth = 1;
    _roundRect(ctx, x, y, w, h, 8); ctx.stroke();

    ctx.font = '20px serif'; ctx.textAlign = 'left';
    ctx.fillText(s.icon, x+10, y+28);

    ctx.fillStyle = '#f8a'; ctx.font = 'bold 13px Georgia';
    ctx.fillText(s.name, x+40, y+20);

    const req = s.requires.map(id => ALL_BOONS.find(b=>b.id===id)?.name||id).join(' + ');
    ctx.fillStyle = '#8af'; ctx.font = '11px Georgia';
    ctx.fillText(`Nécessite : ${req}`, x+40, y+34);
    ctx.fillStyle = '#ccc'; ctx.font = '11px Georgia';
    ctx.fillText(s.desc, x+10, y+50);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  GUIDE SCREEN
// ═══════════════════════════════════════════════════════════
class GuideScreen {
  constructor(onClose) {
    this.onClose = onClose;
    this.page    = 0;
    this.maxPage = 3;
    this._lastMx = -999;
    this._lastMy = -999;
  }

  handleMouse(mx, my, clicked) {
    this._lastMx = mx; this._lastMy = my;
    if (hitTest(mx, my, W-110, 14, 90, 34) && clicked) { this.onClose(); return; }
    if (!clicked) return;
    if (hitTest(mx, my, 60, H-55, 140, 35) && this.page > 0)        this.page--;
    if (hitTest(mx, my, W-200, H-55, 140, 35) && this.page < this.maxPage) this.page++;
  }

  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0, 0, W, H);
    const titles = ['🗺  GUIDE — Contrôles', '☠  GUIDE — Ennemis', '✨  GUIDE — Dons & Synergies', '💡  GUIDE — Conseils'];
    drawPanel(ctx, 20, 10, W-40, H-20, titles[this.page]);

    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '12px Georgia'; ctx.textAlign = 'right';
    ctx.fillText(`Page ${this.page+1}/${this.maxPage+1}`, W-30, H-62);

    if (this.page === 0) this._drawControls(ctx);
    if (this.page === 1) this._drawEnemies(ctx);
    if (this.page === 2) this._drawBoonGuide(ctx);
    if (this.page === 3) this._drawTips(ctx);

    // Nav buttons
    if (this.page > 0)             drawButton(ctx, 60,  H-55, 140, 35, '← Précédent', false, '#3a2860');
    if (this.page < this.maxPage)  drawButton(ctx, W-200, H-55, 140, 35, 'Suivant →', false, '#3a2860');

    // Close
    const gcBtnX = W-110, gcBtnY = 14, gcBtnW = 90, gcBtnH = 34;
    const gcHov = hitTest(this._lastMx, this._lastMy, gcBtnX, gcBtnY, gcBtnW, gcBtnH);
    ctx.fillStyle = gcHov ? '#700' : '#400';
    _roundRect(ctx, gcBtnX, gcBtnY, gcBtnW, gcBtnH, 8); ctx.fill();
    ctx.strokeStyle = '#f88'; ctx.lineWidth = 2;
    _roundRect(ctx, gcBtnX, gcBtnY, gcBtnW, gcBtnH, 8); ctx.stroke();
    ctx.fillStyle = '#f88'; ctx.font = 'bold 14px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('✕  FERMER', gcBtnX + gcBtnW/2, gcBtnY + gcBtnH/2 + 5);
  }

  _text(ctx, lines, startX, startY, lineH = 22) {
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (typeof line === 'string') {
        const isTitle = line.startsWith('##');
        const isSub   = line.startsWith('**');
        ctx.fillStyle = isTitle ? '#ff8' : (isSub ? '#8af' : '#ccc');
        ctx.font      = isTitle ? 'bold 16px Georgia' : (isSub ? 'bold 13px Georgia' : '13px Georgia');
        ctx.fillText(line.replace(/^##+\s*/, '').replace(/^\*\*\s*/, ''), startX, startY + i*lineH);
      }
    }
  }

  _drawControls(ctx) {
    const col1 = 60, col2 = W/2+20, y = 70;
    this._text(ctx, [
      '## Déplacement',
      '** ZQSD  (clavier AZERTY)',
      'Z = Haut   Q = Gauche   S = Bas   D = Droite',
      '',
      '** WASD  (clavier QWERTY)',
      'W = Haut   A = Gauche   S = Bas   D = Droite',
      '',
      '** Flèches directionnelles  (universel)',
      '',
      '## Attaques',
      '** Clic gauche — Attaque de mêlée',
      'Arc devant le personnage, portée ~110px.',
      'Knockback sur les ennemis touchés.',
      '',
      '** Clic droit — Sort (projectile)',
      'Tire un orbe vers le curseur, 510px/s.',
      'Cooldown court, dégâts élevés.',
      '',
      '** E — Blast AoE',
      'Explosion autour du joueur (160px).',
      'Repousse tous les ennemis proches.',
      'Cooldown : 4.5s. Bon pour fuir un encerclement.',
    ], col1, y);

    this._text(ctx, [
      '## Dash  (Shift ou Espace)',
      'Courte impulsion de vitesse.',
      '2 charges par défaut, recharge en 1.8s.',
      '',
      '** Invincibilité pendant le dash !',
      'Traverse les ennemis sans prendre de dégâts.',
      'Certains dons améliorent le dash.',
      '',
      '## Interface',
      '** Barre rouge (bas-gauche) : PV',
      '** Cercles bleus (bas-gauche) : charges dash',
      '** Barres : cooldowns ATK / SORT / BLAST',
      '** Icônes (haut-centre) : dons actifs',
      '',
      '** F1 : Journal de debug en temps réel',
      'Affiche tous les événements de jeu.',
      'Utile pour vérifier que les dons fonctionnent.',
      '',
      '## Progression',
      '15 salles  ·  Boss toutes les 5 salles',
      'Après chaque salle : choisir 1 don parmi 3.',
      'Boss vaincu : soins complets + don bonus.',
    ], col2, y);
  }

  _drawEnemies(ctx) {
    const enemies = [
      { icon:'🔴', name:'Ombre (Shade)',     color:'#c03060', diff:'★☆☆☆',
        desc:'Ennemi de base. Cherche le joueur et attaque au contact. Yeux jaunes visibles.' },
      { icon:'🟠', name:'Lancier (Lancer)',   color:'#e06010', diff:'★★☆☆',
        desc:'Charge en ligne droite avec un pré-avis (aura jaune). S\'arrête après la charge.' },
      { icon:'🟢', name:'Archer',             color:'#207040', diff:'★★☆☆',
        desc:'Garde ses distances, tire des flèches vertes. Se déplace latéralement.' },
      { icon:'🟣', name:'Brute',              color:'#6020a0', diff:'★★★☆',
        desc:'Lent mais encaisse beaucoup. Prépare un coup (aura rouge) puis frappe fort.' },
      { icon:'🔵', name:'Spectre',            color:'#204080', diff:'★★☆☆',
        desc:'Semi-transparent, passe à travers les obstacles. Mouvement sinusoïdal imprévisible.' },
      { icon:'💣', name:'Coureur-Bombe',      color:'#a04000', diff:'★★★☆',
        desc:'Court vers le joueur. À portée, compte à rebours visible puis EXPLOSE (50 dmg).' },
      { icon:'🔮', name:'Cultiste',           color:'#800040', diff:'★★★☆',
        desc:'Reste à distance, tire des projectiles roses. Ne pas négliger.' },
      { icon:'👻', name:'Revenant (Wraith)',  color:'#204080', diff:'★★★☆',
        desc:'Disparaît et réapparaît près du joueur. Frappe à l\'apparition.' },
      { icon:'♛',  name:'Gardien (Boss)',     color:'#c0a000', diff:'★★★★',
        desc:'Boss avec 3 phases. Tire en éventail, charge, invoque des renforts, spirale.' },
    ];

    let x = 60, y = 70;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const col = i % 2, row = Math.floor(i/2);
      const ex = 60 + col * 530, ey = 70 + row * 72;

      ctx.fillStyle = e.color + '33';
      _roundRect(ctx, ex, ey, 510, 62, 8); ctx.fill();
      ctx.strokeStyle = e.color + '66'; ctx.lineWidth = 1;
      _roundRect(ctx, ex, ey, 510, 62, 8); ctx.stroke();

      ctx.font = '28px serif'; ctx.textAlign = 'left';
      ctx.fillText(e.icon, ex+8, ey+36);

      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Georgia';
      ctx.fillText(e.name, ex+44, ey+20);
      ctx.fillStyle = '#fa0'; ctx.font = '12px Georgia';
      ctx.fillText(e.diff, ex+44, ey+36);
      ctx.fillStyle = '#bbb'; ctx.font = '11px Georgia';
      ctx.fillText(e.desc, ex+8, ey+54);
    }
  }

  _drawBoonGuide(ctx) {
    this._text(ctx, [
      '## Le système de Dons',
      'Après chaque salle vaincue, choisissez 1 don parmi 3.',
      'Chaque don améliore définitivement le run en cours.',
      '',
      '** Raretés :',
      '   COMMUN (bleu) — effets simples, appear souvent',
      '   RARE (violet)  — effets plus puissants',
      '   ÉPIQUE (rose)  — effets transformants, apparaissent rarement',
      '',
      '** Une fois un don pris, il ne peut plus être proposé',
      'dans le même run.',
      '',
      '## Synergies',
      'Certaines paires de dons créent un effet bonus !',
      'La synergie s\'active automatiquement quand',
      'vous avez les 2 dons requis.',
      '',
      '** Exemple : Vol de Vie + Âme Dévorante',
      '→ Synergie "Âme Vampirique" :',
      'Vol de vie +25%, kills soignent le double.',
      '',
      '** Consultez le Grimoire pour voir',
      'toutes les synergies disponibles.',
    ], 60, 70);

    this._text(ctx, [
      '## Conseils pour choisir',
      '',
      '** Si vous prenez des coups souvent :',
      '→ Résistance, PV max, Sang-Froid (esquive)',
      '',
      '** Pour tuer vite :',
      '→ Dégâts, Vitesse d\'attaque, Triple Tir',
      '',
      '** Synergies recommandées pour débutants :',
      '→ Saignement + Glaciation (ralentit + DoT)',
      '→ Triple Tir + Perforant (nettoyage de salle)',
      '→ Dash + Dégâts de Dash (esquive offensive)',
      '',
      '** Synergies pour joueurs avancés :',
      '→ Vol de vie + Kill Heal (survie passive)',
      '→ Réaction en Chaîne + Explosion (burst)',
      '→ Riposte × 2 + Réduction (tank)',
    ], W/2+20, 70);
  }

  _drawTips(ctx) {
    this._text(ctx, [
      '## Conseils généraux',
      '',
      '** Le Dash est votre meilleure défense.',
      'Dash à travers les lanciers pendant leur charge.',
      'Dash hors des explosions de Bomb Runners.',
      'Toujours garder une charge de dash disponible.',
      '',
      '** Lisez les boss.',
      'Tirets jaunes = charge imminente du Gardien.',
      'Aura rouge = attaque de zone du Brute.',
      'Compteur visible = Bomb Runner sur vous.',
      '',
      '** Priorisez les cibles dangereuses :',
      '1. Bomb Runners (explosent, urgent)',
      '2. Cultistes (soins derrière, puis zone libre)',
      '3. Archers (safe, puis focus boss/brute)',
      '',
      '** Utilisez les obstacles.',
      'Les piliers bloquent les flèches.',
      'Les Spectres les traversent — attention.',
      'Le Blast AoE fonctionne même en salle fermée.',
    ], 60, 70);

    this._text(ctx, [
      '## Améliorations permanentes',
      '',
      'À chaque fin de run, vous gagnez des Âmes :',
      '  · Profondeur atteinte : ×3 âmes/salle',
      '  · Salles finies : ×4 âmes/salle',
      '  · Dons acquis : ×5 âmes/don',
      '  · Boss vaincus : +15 âmes/boss',
      '',
      'Ces âmes servent à acheter des améliorations',
      'permanentes depuis le menu principal.',
      'Elles survivent entre les runs !',
      '',
      '** Priorisez pour débuter :',
      '1. Vigueur niv.1 (plus de PV, survivre)',
      '2. Résistance niv.1 (moins de punition)',
      '3. Force niv.1 (runs plus courts)',
      '',
      '** Pour finir le jeu :',
      'Mémoire des Dons (300 âmes) donne',
      'un don gratuit au départ de chaque run.',
    ], W/2+20, 70);
  }
}

// ═══════════════════════════════════════════════════════════
//  UPGRADE SHOP SCREEN
// ═══════════════════════════════════════════════════════════
class UpgradeShopScreen {
  constructor(onClose) {
    this.onClose  = onClose;
    this.hovered  = null;
    this.feedback = null;  // { msg, timer }
    this.feedbackTimer = 0;
    this._lastMx = -999;
    this._lastMy = -999;
  }

  // 2-column layout: returns { col, row, cardX, cardY, cardW, cardH }
  _cardLayout(i) {
    const cols = PERMANENT_UPGRADES.length > 7 ? 2 : 1;
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    const cardW = cols === 2 ? Math.floor((W - 100) / 2) : W - 80;
    const cardH = 64;
    const gap   = 8;
    const startX = cols === 2 ? 40 : 40;
    const startY = 80;
    const colX = startX + col * (cardW + 20);
    return { col, row, cardX: colX, cardY: startY + row * (cardH + gap), cardW, cardH };
  }

  _rowBuyBounds(i) {
    const { cardX, cardY, cardW, cardH } = this._cardLayout(i);
    return { bx: cardX + cardW - 130, by: cardY + (cardH - 30) / 2, bw: 120, bh: 30 };
  }

  handleMouse(mx, my, clicked) {
    this._lastMx = mx; this._lastMy = my;
    if (hitTest(mx, my, W-110, 14, 90, 34) && clicked) { this.onClose(); return; }
    this.hovered = null;

    for (let i = 0; i < PERMANENT_UPGRADES.length; i++) {
      const { cardX, cardY, cardW, cardH } = this._cardLayout(i);
      if (hitTest(mx, my, cardX, cardY, cardW, cardH)) {
        this.hovered = i;
        if (clicked) {
          const up = PERMANENT_UPGRADES[i];
          const result = Meta.buyUpgrade(up.id);
          if (result.ok) {
            this.feedback = { msg: `\u2713 ${up.name} niv.${result.newLevel} acheté !`, color: '#5f5' };
            Logger.log('META', `UI: bought ${up.id}`);
          } else {
            this.feedback = { msg: `\u2717 ${result.reason}`, color: '#f55' };
          }
          this.feedbackTimer = 2.5;
        }
      }
    }
  }

  update(dt) {
    if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
    else this.feedback = null;
  }

  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0, 0, W, H);
    drawPanel(ctx, 20, 10, W-40, H-20, '\uD83D\uDC9C  AMÉLIORATIONS PERMANENTES');

    // Soul balance
    const souls = Meta.getSouls();
    ctx.fillStyle = '#ff8'; ctx.font = 'bold 18px Georgia'; ctx.textAlign = 'left';
    ctx.fillText(`\uD83D\uDCAE Âmes disponibles : ${souls}`, 50, 55);

    const upgrades = Meta.getUpgrades();

    // Compute total souls spent
    let soulsSpent = 0;
    for (const up of PERMANENT_UPGRADES) {
      const lvl = upgrades[up.id] || 0;
      for (let k = 0; k < lvl; k++) soulsSpent += up.costs[k];
    }

    for (let i = 0; i < PERMANENT_UPGRADES.length; i++) {
      const up  = PERMANENT_UPGRADES[i];
      const lvl = upgrades[up.id] || 0;
      const { cardX, cardY, cardW, cardH } = this._cardLayout(i);
      const isBuyable = lvl < up.maxLevel && souls >= up.costs[lvl];
      const isMax     = lvl >= up.maxLevel;
      const hov       = this.hovered === i;

      // Row bg
      ctx.fillStyle = hov && !isMax ? '#1a1540' : '#10102a';
      _roundRect(ctx, cardX, cardY, cardW, cardH, 8); ctx.fill();
      ctx.strokeStyle = isMax ? '#308030' : (isBuyable ? '#6050a0' : '#2a2050');
      ctx.lineWidth = isMax ? 2 : 1;
      _roundRect(ctx, cardX, cardY, cardW, cardH, 8); ctx.stroke();

      // Icon
      ctx.font = '24px serif'; ctx.textAlign = 'left';
      ctx.fillText(up.icon, cardX + 10, cardY + 38);

      // Name
      ctx.fillStyle = isMax ? '#5f5' : '#fff'; ctx.font = `bold 13px Georgia`;
      ctx.fillText(up.name, cardX + 44, cardY + 20);

      // Desc
      ctx.fillStyle = '#8af'; ctx.font = '11px Georgia';
      const descTrim = up.desc.length > 55 ? up.desc.slice(0, 52) + '…' : up.desc;
      ctx.fillText(descTrim, cardX + 44, cardY + 35);

      // Effect
      ctx.fillStyle = '#fa0'; ctx.font = '10px Georgia';
      ctx.fillText(`Effet : ${up.effect || ''}`, cardX + 44, cardY + 50);

      // Level pips
      const pipStartX = cardX + cardW - 130 - (up.maxLevel * 14) - 10;
      for (let p = 0; p < up.maxLevel; p++) {
        ctx.beginPath();
        ctx.arc(pipStartX + 8 + p * 14, cardY + cardH / 2, 5, 0, Math.PI * 2);
        ctx.fillStyle = p < lvl ? '#a070ff' : '#2a2040';
        ctx.fill();
        ctx.strokeStyle = '#5040a0'; ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = '#888'; ctx.font = '9px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(`${lvl}/${up.maxLevel}`, pipStartX + 8 + (up.maxLevel - 1) * 7, cardY + cardH - 6);

      // Buy button
      const { bx, by, bw, bh } = this._rowBuyBounds(i);
      if (isMax) {
        drawButton(ctx, bx, by, bw, bh, '\u2713 MAX', false, '#204020', '#5f5');
      } else {
        const cost = up.costs[lvl];
        const label = `\uD83D\uDCAE ${cost}`;
        drawButton(ctx, bx, by, bw, bh, label, hov && isBuyable, isBuyable ? '#5040a0' : '#2a2050', isBuyable ? '#fff' : '#666');
      }

      // Flavor text on hover
      if (hov && !isMax && up.flavor) {
        ctx.fillStyle = 'rgba(255,255,180,0.6)'; ctx.font = 'italic 10px Georgia'; ctx.textAlign = 'left';
        ctx.fillText(up.flavor, cardX + 10, cardY + cardH + 5);
      }
    }

    // Total souls spent
    ctx.fillStyle = 'rgba(200,180,255,0.5)'; ctx.font = '12px Georgia'; ctx.textAlign = 'left';
    ctx.fillText(`Âmes dépensées au total : ${soulsSpent}`, 50, H - 72);

    // Feedback message
    if (this.feedback && this.feedbackTimer > 0) {
      const a = Math.min(1, this.feedbackTimer);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.feedback.color; ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(this.feedback.msg, W/2, H - 50);
      ctx.globalAlpha = 1;
    }

    // Tip
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '11px Georgia'; ctx.textAlign = 'left';
    ctx.fillText('Conseil : jouez des runs pour accumuler des Âmes', 50, H - 55);

    // Close
    const usBtnX = W-110, usBtnY = 14, usBtnW = 90, usBtnH = 34;
    const usHov = hitTest(this._lastMx, this._lastMy, usBtnX, usBtnY, usBtnW, usBtnH);
    ctx.fillStyle = usHov ? '#700' : '#400';
    _roundRect(ctx, usBtnX, usBtnY, usBtnW, usBtnH, 8); ctx.fill();
    ctx.strokeStyle = '#f88'; ctx.lineWidth = 2;
    _roundRect(ctx, usBtnX, usBtnY, usBtnW, usBtnH, 8); ctx.stroke();
    ctx.fillStyle = '#f88'; ctx.font = 'bold 14px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('\u2715  FERMER', usBtnX + usBtnW/2, usBtnY + usBtnH/2 + 5);
  }
}
