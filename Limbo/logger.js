'use strict';

const Logger = {
  entries: [],
  overlay: false,
  _startTime: Date.now(),

  log(category, msg, data = null) {
    const ms = Date.now() - this._startTime;
    const ts = `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
    const entry = { ts, category, msg, data: data ? JSON.stringify(data) : '' };
    this.entries.push(entry);
    // Also mirror to devtools
    console.log(`[${category}] ${msg}`, data || '');
  },

  reset() {
    this.entries = [];
    this._startTime = Date.now();
    this.log('SYSTEM', 'Run started');
  },

  download() {
    const lines = this.entries.map(e =>
      `[${e.ts}] [${e.category.padEnd(8)}] ${e.msg}${e.data ? ' | ' + e.data : ''}`
    ).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'log.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[SYSTEM] log.txt downloaded');
  },

  toggleOverlay() { this.overlay = !this.overlay; },

  drawOverlay(ctx) {
    if (!this.overlay) return;
    const rows   = this.entries.slice(-22);
    const startY = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, 580, rows.length * 16 + 20);
    ctx.font = '11px monospace';
    const catColor = { BOON:'#adf', DAMAGE:'#f88', KILL:'#f4f', SPAWN:'#8fa',
                       ROOM:'#ff8', BOSS:'#fa0', SYSTEM:'#aaa', HEAL:'#5f5',
                       BLAST:'#f0f', ABILITY:'#8ff' };
    rows.forEach((e, i) => {
      ctx.fillStyle = catColor[e.category] || '#ccc';
      ctx.fillText(`[${e.ts}][${e.category}] ${e.msg}${e.data ? ' '+e.data : ''}`, 6, startY + i * 16 + 12);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('F1: fermer le journal', 6, startY + rows.length * 16 + 10);
    ctx.restore();
  }
};
