'use strict';

const Input = {
  keys: new Set(),
  mouse: { x: W / 2, y: H / 2, left: false, right: false },
  _leftJustPressed: false,
  _rightJustPressed: false,
  _justPressed: new Set(),

  init(canvas, scaleRef) {
    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this._justPressed.add(e.code);
      this.keys.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = scaleRef.scale, ox = scaleRef.offsetX, oy = scaleRef.offsetY;
      this.mouse.x = (e.clientX - rect.left) / sx;
      this.mouse.y = (e.clientY - rect.top)  / sx;
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouse.left  = true;  this._leftJustPressed  = true; }
      if (e.button === 2) { this.mouse.right = true;  this._rightJustPressed = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left  = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('blur', () => { this.mouse.left = false; this.mouse.right = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('contextmenu', e => e.preventDefault());
  },

  // ZQSD (AZERTY) + WASD (QWERTY) + Arrow keys
  moveX() {
    let x = 0;
    if (this.keys.has('KeyA') || this.keys.has('KeyQ') || this.keys.has('ArrowLeft'))  x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    return x;
  },
  moveY() {
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('KeyZ') || this.keys.has('ArrowUp'))   y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    return y;
  },
  isDash()   { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('Space'); },
  isAttack() { return this.mouse.left; },
  isCast()   { return this.mouse.right; },

  justPressed(code) { return this._justPressed.has(code); },
  justAttacked()    { const v = this._leftJustPressed;  this._leftJustPressed  = false; return v; },
  justCasted()      { const v = this._rightJustPressed; this._rightJustPressed = false; return v; },

  endFrame() {
    this._justPressed.clear();
    this._leftJustPressed  = false;
    this._rightJustPressed = false;
  }
};
