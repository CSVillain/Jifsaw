// Jigsaw puzzle engine: cuts a playing <video> (or still image fallback) into
// interlocking canvas pieces and handles drag/drop + snap-to-place.
const Puzzle = (() => {
  function buildKnobs(rows, cols) {
    const vSign = [], hSign = [];
    for (let r = 0; r < rows; r++) {
      vSign.push([]);
      for (let c = 0; c < cols - 1; c++) vSign[r].push(Math.random() < 0.5 ? 1 : -1);
    }
    for (let r = 0; r < rows - 1; r++) {
      hSign.push([]);
      for (let c = 0; c < cols; c++) hSign[r].push(Math.random() < 0.5 ? 1 : -1);
    }
    return { vSign, hSign };
  }

  function knobSegment(p0, p1, dir, normal, sign, bump) {
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const neck1 = { x: p0.x + dir.x * 0.35 * L, y: p0.y + dir.y * 0.35 * L };
    const neck2 = { x: p0.x + dir.x * 0.65 * L, y: p0.y + dir.y * 0.65 * L };
    const mid = { x: p0.x + dir.x * 0.5 * L, y: p0.y + dir.y * 0.5 * L };
    const cx = mid.x + normal.x * sign * bump, cy = mid.y + normal.y * sign * bump;
    const half = 0.15 * L;
    const top = { x: cx - dir.x * half, y: cy - dir.y * half };
    const bot = { x: cx + dir.x * half, y: cy + dir.y * half };

    let d = ` L ${neck1.x} ${neck1.y}`;
    d += ` C ${neck1.x + normal.x * sign * bump * 0.6} ${neck1.y + normal.y * sign * bump * 0.6}, ${top.x - dir.x * half * 0.6 + normal.x * sign * bump * 0.2} ${top.y - dir.y * half * 0.6 + normal.y * sign * bump * 0.2}, ${top.x} ${top.y}`;
    d += ` C ${cx - dir.x * half * 0.5 + normal.x * sign * bump * 1.4} ${cy - dir.y * half * 0.5 + normal.y * sign * bump * 1.4}, ${cx + dir.x * half * 0.5 + normal.x * sign * bump * 1.4} ${cy + dir.y * half * 0.5 + normal.y * sign * bump * 1.4}, ${bot.x} ${bot.y}`;
    d += ` C ${bot.x + dir.x * half * 0.6 + normal.x * sign * bump * 0.2} ${bot.y + dir.y * half * 0.6 + normal.y * sign * bump * 0.2}, ${neck2.x + normal.x * sign * bump * 0.6} ${neck2.y + normal.y * sign * bump * 0.6}, ${neck2.x} ${neck2.y}`;
    d += ` L ${p1.x} ${p1.y}`;
    return d;
  }

  // Builds a piece outline in LOCAL coordinates (origin = piece canvas top-left,
  // which sits `pad` px before the piece's actual cell). Every piece uses the
  // same local cell rect (pad,pad)-(pad+pw,pad+ph); only knob directions differ.
  function buildPiecePath(r, c, rows, cols, pw, ph, pad, bump, vSign, hSign) {
    const x0 = pad, y0 = pad, x1 = pad + pw, y1 = pad + ph;
    let d = `M ${x0} ${y0}`;
    d += r === 0 ? ` L ${x1} ${y0}` : knobSegment({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, hSign[r - 1][c], bump);
    d += c === cols - 1 ? ` L ${x1} ${y1}` : knobSegment({ x: x1, y: y0 }, { x: x1, y: y1 }, { x: 0, y: 1 }, { x: 1, y: 0 }, vSign[r][c], bump);
    d += r === rows - 1 ? ` L ${x0} ${y1}` : knobSegment({ x: x1, y: y1 }, { x: x0, y: y1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, hSign[r][c], bump);
    d += c === 0 ? ` L ${x0} ${y0}` : knobSegment({ x: x0, y: y1 }, { x: x0, y: y0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, vSign[r][c - 1], bump);
    return d + ' Z';
  }

  class JigsawGame {
    /**
     * @param {object} opts
     * @param {HTMLElement} opts.board
     * @param {HTMLElement} opts.tray
     * @param {HTMLVideoElement|HTMLImageElement} opts.source - already loaded & playing (or a still image)
     * @param {number} opts.rows
     * @param {number} opts.cols
     * @param {number} opts.width  board pixel width
     * @param {number} opts.height board pixel height
     * @param {(solved:boolean)=>void} opts.onProgress
     * @param {()=>void} [opts.onLock] - fires when a piece/group locks onto the board
     * @param {()=>void} [opts.onJoin] - fires when two pieces join off-board
     * @param {boolean} [opts.hardMode] - enables gentle drift for unplaced pieces
     */
    constructor(opts) {
      Object.assign(this, opts);
      this.pw = this.width / this.cols;
      this.ph = this.height / this.rows;
      this.bump = Math.min(this.pw, this.ph) * 0.22;
      // Padding around each piece's own cell so its canvas fully contains any
      // knob that bulges out from an interlocking edge.
      this.pad = Math.ceil(this.bump * 1.6);
      this.snapDist = Math.min(this.pw, this.ph) * 0.35;
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.pieces = [];
      this.dragging = null;
      this.hintOn = false;
      this.scattered = false;

      this._backCanvas = document.createElement('canvas');
      this._backCanvas.width = this.width;
      this._backCanvas.height = this.height;
      this._backCtx = this._backCanvas.getContext('2d');

      // Sits behind locked pieces only, masked to their own shapes (slightly
      // dilated), so hairline anti-aliasing gaps between two locked pieces
      // show the real image instead of a seam — without revealing any part
      // of the board that isn't already solved.
      this._fillCanvas = document.createElement('canvas');
      this._fillCanvas.width = this.width * this.dpr;
      this._fillCanvas.height = this.height * this.dpr;
      this._fillCanvas.style.position = 'absolute';
      this._fillCanvas.style.left = '0';
      this._fillCanvas.style.top = '0';
      this._fillCanvas.style.width = this.width + 'px';
      this._fillCanvas.style.height = this.height + 'px';
      this._fillCtx = this._fillCanvas.getContext('2d');
      this.board.appendChild(this._fillCanvas);

      this._maskCanvas = document.createElement('canvas');
      this._maskCanvas.width = this.width * this.dpr;
      this._maskCanvas.height = this.height * this.dpr;
      this._maskCtx = this._maskCanvas.getContext('2d');

      this._boundMove = this._onPointerMove.bind(this);
      this._boundUp = this._onPointerUp.bind(this);
      this._boundResize = this._onResize.bind(this);
      window.addEventListener('pointermove', this._boundMove);
      window.addEventListener('pointerup', this._boundUp);
      window.addEventListener('resize', this._boundResize);

      this._buildPieces();
      this._layoutPile();
      this._raf = requestAnimationFrame(() => this._render());
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._dealTimer);
      clearTimeout(this._resizeTimer);
      window.removeEventListener('pointermove', this._boundMove);
      window.removeEventListener('pointerup', this._boundUp);
      window.removeEventListener('resize', this._boundResize);
    }

    // Debounced: if the viewport changes size (resize, or mobile rotation)
    // after pieces have already been dealt out, pull any that are now
    // outside the new bounds back into view rather than leaving them
    // stranded off-screen.
    _onResize() {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        if (!this.scattered) return;
        this.pieces.forEach(p => {
          if (p.locked || p === this.dragging) return;
          const curLeft = parseFloat(p.canvas.style.left) || 0;
          const curTop = parseFloat(p.canvas.style.top) || 0;
          const { left, top } = this._clampToViewport(curLeft, curTop, p.rot);
          if (left !== curLeft || top !== curTop) {
            p.canvas.style.left = left + 'px';
            p.canvas.style.top = top + 'px';
          }
        });
      }, 150);
    }

    setHint(on) {
      this.hintOn = on;
      this.board.classList.toggle('show-hint', on);
    }

    // Deals unlocked pieces out across the whole visible window: a jittered
    // grid of viewport slots (excluding the board) so pieces spread evenly
    // above/below/beside the board without needing a scroll, each with a
    // loose tabletop rotation. Used for the opening deal and the Shuffle button.
    shuffle() {
      clearTimeout(this._dealTimer);
      const wasPiled = !this.scattered;
      this.scattered = true;

      // Scatter by GROUP, not by individual piece, so an off-board-joined
      // cluster moves as one unit instead of being torn apart. Each group
      // is represented by one anchor piece for slot-picking (its footprint
      // is sized like a single piece — close enough for the small clusters
      // joining realistically produces, and keeps the already-tuned
      // viewport-packing math in _viewportSlots untouched).
      const seen = new Set();
      const groups = [];
      this.pieces.forEach(p => {
        if (p.locked || seen.has(p.group)) return;
        seen.add(p.group);
        groups.push(p.group);
      });

      const targets = this._spreadTargets(groups.length);
      const ease = 'cubic-bezier(.2,.9,.25,1.05)';

      groups.forEach((group, i) => {
        const t = targets[i];
        const anchor = group[0];
        const anchorLeft = parseFloat(anchor.canvas.style.left) || t.left;
        const anchorTop = parseFloat(anchor.canvas.style.top) || t.top;
        const dLeft = t.left - anchorLeft, dTop = t.top - anchorTop;
        const dRot = t.rot - (anchor.rot || 0);
        group.forEach((p, gi) => {
          this.tray.appendChild(p.canvas);
          p.canvas.classList.remove('piled');
          p.canvas.style.position = 'fixed';
          p.canvas.style.zIndex = 1;
          const delay = wasPiled ? (i * group.length + gi) * 45 + Math.random() * 60 : Math.random() * 80;
          p.canvas.style.transition =
            `left 0.7s ${ease} ${delay}ms, top 0.7s ${ease} ${delay}ms, transform 0.7s ${ease} ${delay}ms`;
          const left = (parseFloat(p.canvas.style.left) || 0) + dLeft;
          const top = (parseFloat(p.canvas.style.top) || 0) + dTop;
          p.rot = (p.rot || 0) + dRot;
          requestAnimationFrame(() => {
            p.canvas.style.left = left + 'px';
            p.canvas.style.top = top + 'px';
            p.canvas.style.transform = `rotate(${p.rot}deg)`;
          });
          p.canvas.addEventListener('transitionend', () => { p.canvas.style.transition = ''; }, { once: true });
        });
      });
    }

    // Builds a pool of candidate spots covering the whole viewport (minus a
    // safe margin) and excluding the board's own rect, so pieces can land
    // above, below, or beside the board without ever needing a scroll. If
    // there isn't enough room around the board at the piece's natural size,
    // the grid is packed tighter (allowing some overlap between pieces, never
    // past the viewport edge) rather than falling back to a sparser grid
    // that would leave pieces stacked past where they can actually fit.
    _viewportSlots(n) {
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      const margin = 14;
      const vw = window.innerWidth, vh = window.innerHeight;
      const boardRect = this.board.getBoundingClientRect();
      const boardPad = 18;
      const bx0 = boardRect.left - boardPad, bx1 = boardRect.right + boardPad;
      const by0 = boardRect.top - boardPad, by1 = boardRect.bottom + boardPad;
      const availW = Math.max(cw, vw - margin * 2);
      const availH = Math.max(ch, vh - margin * 2);

      const buildPool = (fw, fh) => {
        const cols = Math.max(1, Math.floor(availW / fw));
        const rows = Math.max(1, Math.floor(availH / fh));
        const slots = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cx = margin + (c + 0.5) * fw;
            const cy = margin + (r + 0.5) * fh;
            const overlapsBoard = cx > bx0 && cx < bx1 && cy > by0 && cy < by1;
            if (!overlapsBoard) slots.push({ cx, cy });
          }
        }
        return slots;
      };

      let scale = 1.08;
      let fw = cw * scale, fh = ch * scale;
      let slots = buildPool(fw, fh);
      // Shrink the spacing (letting pieces sit closer, even touching) until
      // enough non-board slots exist for every piece, or we hit a sane floor.
      while (slots.length < n && scale > 0.45) {
        scale -= 0.08;
        fw = cw * scale;
        fh = ch * scale;
        slots = buildPool(fw, fh);
      }

      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      return { pool: slots, fw, fh, cw, ch, margin, availW, availH };
    }

    // Keeps a piece's canvas box fully inside the current viewport — shared
    // by the initial deal, drop-back-into-tray, and the resize re-clamp.
    // `rotate()` pivots around the element's own center, so a rotated piece's
    // on-screen bounding box is wider/taller than its unrotated canvas (up to
    // its own diagonal at 45°) — clamping the unrotated box alone still lets
    // a rotated piece's corners stick out past the viewport edge. We clamp
    // the piece's CENTER to stay at least half that worst-case bounding box
    // away from every edge, using the largest rotation any code path applies
    // (see `rot`/`dispRot` assignments) as the bound.
    _clampToViewport(left, top, rotDeg = 40) {
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      const a = Math.abs(rotDeg) * Math.PI / 180;
      const boundW = cw * Math.cos(a) + ch * Math.sin(a);
      const boundH = cw * Math.sin(a) + ch * Math.cos(a);
      const cx = left + cw / 2, cy = top + ch / 2;
      const halfW = Math.min(boundW, window.innerWidth) / 2;
      const halfH = Math.min(boundH, window.innerHeight) / 2;
      const clampedCx = Math.max(halfW, Math.min(window.innerWidth - halfW, cx));
      const clampedCy = Math.max(halfH, Math.min(window.innerHeight - halfH, cy));
      return { left: clampedCx - cw / 2, top: clampedCy - ch / 2 };
    }

    _spreadTargets(n) {
      const { pool, fw, fh, cw, ch } = this._viewportSlots(n);
      const maxRot = 36;
      return Array.from({ length: n }, (_, i) => {
        const s = pool[i % pool.length];
        const cx = s.cx + (Math.random() - 0.5) * fw * 0.3;
        const cy = s.cy + (Math.random() - 0.5) * fh * 0.3;
        const { left, top } = this._clampToViewport(cx - cw / 2, cy - ch / 2, maxRot);
        return { left, top, rot: (Math.random() - 0.5) * maxRot };
      });
    }

    // Opening moment: pieces land as a loose heap over the board, then deal
    // themselves out across the whole visible window.
    _layoutPile() {
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      const boardRect = this.board.getBoundingClientRect();
      const cx = boardRect.left + boardRect.width / 2 - cw / 2;
      const cy = boardRect.top + boardRect.height / 2 - ch / 2;
      this.pieces.forEach((p, i) => {
        p.rot = (Math.random() - 0.5) * 40;
        p.canvas.style.position = 'fixed';
        p.canvas.style.transition = 'none';
        p.canvas.style.left = (cx + (Math.random() - 0.5) * 30) + 'px';
        p.canvas.style.top = (cy + (Math.random() - 0.5) * 20) + 'px';
        p.canvas.style.transform = `rotate(${p.rot}deg)`;
        p.canvas.style.zIndex = i + 1;
        p.canvas.classList.add('piled');
        this.tray.appendChild(p.canvas);
      });
      this._dealTimer = setTimeout(() => this.shuffle(), 450);
    }

    // Finds the topmost unlocked piece whose actual jigsaw shape (not its
    // transparent canvas padding) is under the pointer.
    _pieceAt(clientX, clientY) {
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      for (const el of document.elementsFromPoint(clientX, clientY)) {
        const p = this._byCanvas.get(el);
        if (!p || p.locked) continue;
        const r = el.getBoundingClientRect();
        const a = -(p.rot || 0) * Math.PI / 180;
        const dx = clientX - (r.left + r.width / 2);
        const dy = clientY - (r.top + r.height / 2);
        const lx = dx * Math.cos(a) - dy * Math.sin(a) + cw / 2;
        const ly = dx * Math.sin(a) + dy * Math.cos(a) + ch / 2;
        p.ctx.save();
        p.ctx.setTransform(1, 0, 0, 1, 0, 0);
        const hit = p.ctx.isPointInPath(p.path, lx, ly);
        p.ctx.restore();
        if (hit) return p;
      }
      return null;
    }

    solvedCount() {
      return this.pieces.filter(p => p.locked).length;
    }

    _buildPieces() {
      const { vSign, hSign } = buildKnobs(this.rows, this.cols);
      this._byCanvas = new Map();
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const canvas = document.createElement('canvas');
          canvas.width = cw * this.dpr;
          canvas.height = ch * this.dpr;
          canvas.style.width = cw + 'px';
          canvas.style.height = ch + 'px';
          canvas.className = 'piece';
          const ctx = canvas.getContext('2d');
          const d = buildPiecePath(r, c, this.rows, this.cols, this.pw, this.ph, this.pad, this.bump, vSign, hSign);
          const piece = {
            r, c, canvas, ctx,
            path: new Path2D(d),
            // Canvas top-left when correctly placed on the board.
            home: { x: c * this.pw - this.pad, y: r * this.ph - this.pad },
            locked: false,
            rot: 0,
            group: null, // set below once every piece exists
          };
          canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
          this._byCanvas.set(canvas, piece);
          this.pieces.push(piece);
        }
      }
      // Every piece starts in a "group" of just itself — joining two pieces
      // off-board later just means pointing both pieces' `group` at one
      // shared array, so dragging one moves every piece in that array.
      this.pieces.forEach(p => { p.group = [p]; });
    }

    _render() {
      if (this.source instanceof HTMLVideoElement) {
        if (this.source.readyState >= 2) this._backCtx.drawImage(this.source, 0, 0, this.width, this.height);
      } else if (this.source) {
        this._backCtx.drawImage(this.source, 0, 0, this.width, this.height);
      }

      // Base layer behind locked pieces only: hides hairline AA seams between
      // two locked neighbors, without revealing any unsolved part of the board.
      const locked = this.pieces.filter(p => p.locked);
      this._maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      this._maskCtx.clearRect(0, 0, this._maskCanvas.width, this._maskCanvas.height);
      this._maskCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._maskCtx.fillStyle = '#fff';
      this._maskCtx.strokeStyle = '#fff';
      this._maskCtx.lineWidth = 2;
      locked.forEach(p => {
        this._maskCtx.save();
        this._maskCtx.translate(p.home.x, p.home.y);
        this._maskCtx.fill(p.path);
        this._maskCtx.stroke(p.path); // slight dilation to guarantee overlap at shared edges
        this._maskCtx.restore();
      });

      this._fillCtx.setTransform(1, 0, 0, 1, 0, 0);
      this._fillCtx.clearRect(0, 0, this._fillCanvas.width, this._fillCanvas.height);
      this._fillCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (locked.length) {
        this._fillCtx.drawImage(this._backCanvas, 0, 0);
        this._fillCtx.globalCompositeOperation = 'destination-in';
        this._fillCtx.setTransform(1, 0, 0, 1, 0, 0);
        this._fillCtx.drawImage(this._maskCanvas, 0, 0);
        this._fillCtx.globalCompositeOperation = 'source-over';
        this._fillCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }

      const d = this.dragging;
      if (d) {
        this._vx *= 0.85;
        this._vy *= 0.85;
        d.dispRot *= 0.8;
        const tiltY = Math.max(-16, Math.min(16, this._vx * 1.2));
        const tiltX = Math.max(-16, Math.min(16, -this._vy * 1.2));
        d.canvas.style.transform =
          `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) rotate(${d.dispRot}deg) scale(1.06)`;
      }

      if (this.hardMode) this._updateDrift();

      this.pieces.forEach(p => {
        p.ctx.setTransform(1, 0, 0, 1, 0, 0);
        p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
        p.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        p.ctx.save();
        p.ctx.clip(p.path);
        p.ctx.drawImage(this._backCanvas, -p.home.x, -p.home.y);
        if (!p.locked) this._shade(p);
        p.ctx.restore();
        if (!p.locked) {
          p.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          p.ctx.lineWidth = 0.75;
          p.ctx.stroke(p.path);
        }
        if (this.hintOn && !p.locked) {
          p.ctx.save();
          p.ctx.globalAlpha = 0.35;
          p.ctx.clip(p.path);
          p.ctx.fillStyle = '#fff';
          p.ctx.fillRect(0, 0, p.canvas.width, p.canvas.height);
          p.ctx.restore();
        }
      });
      this._raf = requestAnimationFrame(() => this._render());
    }

    // Hard-mode only: unplaced pieces gently wander instead of sitting
    // still, so the player has to "catch" one as well as find it. Driven
    // by one velocity per GROUP (not per piece) so a joined cluster drifts
    // as a rigid unit — exactly how dragging a group already works. Each
    // frame there's a small chance of picking a fresh random direction,
    // which reads as idle wandering rather than a fixed orbit or bounce.
    _updateDrift() {
      if (!this.scattered) return;
      const seen = new Set();
      this.pieces.forEach(p => {
        if (p.locked || p === this.dragging || seen.has(p.group)) return;
        seen.add(p.group);
        const anchor = p.group[0];

        if (anchor.driftVx === undefined) {
          anchor.driftVx = 0;
          anchor.driftVy = 0;
        }
        if (Math.random() < 0.01) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.12 + Math.random() * 0.18;
          anchor.driftVx = Math.cos(angle) * speed;
          anchor.driftVy = Math.sin(angle) * speed;
        }

        const cw = this.pw + 2 * this.pad, ch = this.ph + 2 * this.pad;
        const left = (parseFloat(anchor.canvas.style.left) || 0) + anchor.driftVx;
        const top = (parseFloat(anchor.canvas.style.top) || 0) + anchor.driftVy;
        const { left: clampedLeft, top: clampedTop } = this._clampToViewport(left, top, anchor.rot);
        // Bounce off the viewport edge instead of sticking to it, so a
        // drifting piece doesn't just pile up against the boundary.
        if (clampedLeft !== left) anchor.driftVx *= -1;
        if (clampedTop !== top) anchor.driftVy *= -1;
        const dLeft = clampedLeft - (parseFloat(anchor.canvas.style.left) || 0);
        const dTop = clampedTop - (parseFloat(anchor.canvas.style.top) || 0);

        p.group.forEach(gp => {
          gp.canvas.style.left = ((parseFloat(gp.canvas.style.left) || 0) + dLeft) + 'px';
          gp.canvas.style.top = ((parseFloat(gp.canvas.style.top) || 0) + dTop) + 'px';
        });
      });
    }

    // Light comes from the upper left of the screen. One soft radial sheen
    // sweeps across the piece toward the light, and a single thin highlight
    // traces just the edge facing the light — together they read as one
    // consistent light source instead of competing effects. Both rotate
    // with the piece and the sheen slides against the drag direction.
    _shade(p) {
      const ctx = p.ctx;
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      const isDrag = this.dragging === p;
      const a = -((isDrag ? p.dispRot : p.rot) || 0) * Math.PI / 180;
      const Lx = -0.45, Ly = -0.89;
      const lx = Lx * Math.cos(a) - Ly * Math.sin(a);
      const ly = Lx * Math.sin(a) + Ly * Math.cos(a);
      const cx = this.pad + this.pw / 2;
      const cy = this.pad + this.ph / 2;
      const size = Math.min(this.pw, this.ph);

      let ox = 0, oy = 0;
      if (isDrag) {
        const lim = size * 0.25;
        ox = Math.max(-lim, Math.min(lim, -this._vx * 1.5));
        oy = Math.max(-lim, Math.min(lim, -this._vy * 1.5));
      }
      const hx = cx + lx * size * 0.35 + ox;
      const hy = cy + ly * size * 0.35 + oy;
      const peak = isDrag ? 0.16 : 0.1;
      const sheen = ctx.createRadialGradient(hx, hy, 0, hx, hy, size * (isDrag ? 1.1 : 0.95));
      sheen.addColorStop(0, `rgba(255,255,255,${peak})`);
      sheen.addColorStop(0.6, `rgba(255,255,255,${peak * 0.25})`);
      sheen.addColorStop(1, 'rgba(0,0,0,0.04)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, cw, ch);

      // Edge highlight: a single thin stroke, only bright on the side facing
      // the light — clipped to the piece so it never spills a hard outline
      // around the whole shape the way a full double-stroke bevel would.
      ctx.save();
      ctx.clip(p.path);
      const edge = ctx.createLinearGradient(
        cx + lx * size * 0.7, cy + ly * size * 0.7,
        cx - lx * size * 0.7, cy - ly * size * 0.7);
      edge.addColorStop(0, 'rgba(255,255,255,0.22)');
      edge.addColorStop(0.35, 'rgba(255,255,255,0)');
      edge.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = edge;
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.lineJoin = 'round';
      ctx.stroke(p.path);
      ctx.restore();
    }

    _onPointerDown(e) {
      if (!this.scattered) {
        this.shuffle();
        return;
      }
      const piece = this._pieceAt(e.clientX, e.clientY);
      if (!piece) return;
      e.preventDefault();
      this.dragging = piece;
      piece.canvas.setPointerCapture(e.pointerId);
      const rect = piece.canvas.getBoundingClientRect();
      const cw = this.pw + 2 * this.pad;
      const ch = this.ph + 2 * this.pad;
      // Offset from the unrotated box, so the piece doesn't jump as it
      // straightens out in the hand.
      this._offsetX = e.clientX - (rect.left + rect.width / 2 - cw / 2);
      this._offsetY = e.clientY - (rect.top + rect.height / 2 - ch / 2);
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._vx = 0;
      this._vy = 0;
      piece.dispRot = piece.rot || 0;
      // Stop any Hard-mode drift the instant a piece is grabbed — fighting
      // the player's own drag would feel broken, not challenging.
      piece.group[0].driftVx = 0;
      piece.group[0].driftVy = 0;
      // The whole group the grabbed piece belongs to moves together: lift
      // every member to the front, keeping each one's own current position
      // and rotation (only the cluster's as a whole gets dragged, its
      // internal shape never changes).
      piece.group.forEach(gp => {
        document.body.appendChild(gp.canvas);
        gp.canvas.style.transition = 'none';
        gp.canvas.style.position = 'fixed';
        gp.canvas.style.zIndex = gp === piece ? 1000 : 999;
      });
    }

    _onPointerMove(e) {
      if (!this.dragging) return;
      this._vx = this._vx * 0.6 + (e.clientX - this._lastX) * 0.4;
      this._vy = this._vy * 0.6 + (e.clientY - this._lastY) * 0.4;
      const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.dragging.group.forEach(gp => {
        gp.canvas.style.left = (parseFloat(gp.canvas.style.left) || 0) + dx + 'px';
        gp.canvas.style.top = (parseFloat(gp.canvas.style.top) || 0) + dy + 'px';
      });
    }

    // Two pieces are candidates for an off-board join only if they're
    // actual grid neighbors (so a match is only possible where the jigsaw
    // cut really has a matching edge) and both are close enough to upright
    // — matching rotated pieces isn't supported, so a loose/tumbled piece
    // simply won't catch until it settles close to 0°.
    _isUpright(rot) {
      const norm = ((rot % 360) + 360) % 360; // 0..360
      const centered = norm > 180 ? norm - 360 : norm; // -180..180
      return Math.abs(centered) <= 6;
    }

    _isNeighbor(a, b) {
      return (a.r === b.r && Math.abs(a.c - b.c) === 1) ||
             (a.c === b.c && Math.abs(a.r - b.r) === 1);
    }

    // After a drag that didn't snap onto the board, see if the dragged
    // group landed close enough to another upright group to join it. Join
    // is a pure translation (no rotation blending needed, since both sides
    // must already be upright) — the dragged group's pieces are nudged so
    // the matched pair lines up exactly, then the two groups' piece arrays
    // are merged into one shared array.
    _tryJoinOffBoard(draggedPiece) {
      const dragRect = draggedPiece.canvas.getBoundingClientRect();
      const dragCx = dragRect.left + dragRect.width / 2;
      const dragCy = dragRect.top + dragRect.height / 2;
      if (!this._isUpright(draggedPiece.rot)) return false;

      for (const other of this.pieces) {
        if (other.locked || other.group === draggedPiece.group) continue;
        if (!this._isNeighbor(draggedPiece, other) || !this._isUpright(other.rot)) continue;

        const otherRect = other.canvas.getBoundingClientRect();
        const otherCx = otherRect.left + otherRect.width / 2;
        const otherCy = otherRect.top + otherRect.height / 2;
        const wantDx = other.home.x - draggedPiece.home.x;
        const wantDy = other.home.y - draggedPiece.home.y;
        const actualDx = otherCx - dragCx, actualDy = otherCy - dragCy;

        if (Math.hypot(actualDx - wantDx, actualDy - wantDy) < this.snapDist) {
          // Shift every piece in the dragged group by the same correction so
          // the whole cluster lands in perfect alignment, not just the one
          // piece that happened to be checked.
          const correctionX = (otherCx - wantDx) - dragCx;
          const correctionY = (otherCy - wantDy) - dragCy;
          draggedPiece.group.forEach(gp => {
            const left = (parseFloat(gp.canvas.style.left) || 0) + correctionX;
            const top = (parseFloat(gp.canvas.style.top) || 0) + correctionY;
            gp.canvas.style.transition = 'left 0.15s ease, top 0.15s ease';
            gp.canvas.style.left = left + 'px';
            gp.canvas.style.top = top + 'px';
            gp.canvas.addEventListener('transitionend', () => { gp.canvas.style.transition = ''; }, { once: true });
          });
          const merged = [...new Set([...draggedPiece.group, ...other.group])];
          merged.forEach(gp => { gp.group = merged; });
          return true;
        }
      }
      return false;
    }

    _onPointerUp(e) {
      if (!this.dragging) return;
      const p = this.dragging;
      this.dragging = null;
      p.group.forEach(gp => gp.canvas.classList.remove('dragging'));
      const boardRect = this.board.getBoundingClientRect();
      const dropX = e.clientX - this._offsetX - boardRect.left;
      const dropY = e.clientY - this._offsetY - boardRect.top;

      if (Math.hypot(dropX - p.home.x, dropY - p.home.y) < this.snapDist) {
        // Whole group locks onto the board together, each piece to its own
        // home — the group was already internally aligned, so this can
        // never partially succeed for some members and not others.
        p.group.forEach(gp => {
          this.board.appendChild(gp.canvas);
          gp.canvas.style.position = 'absolute';
          gp.canvas.style.left = gp.home.x + 'px';
          gp.canvas.style.top = gp.home.y + 'px';
          gp.canvas.style.zIndex = 1;
          gp.canvas.style.transform = '';
          gp.rot = 0;
          gp.locked = true;
          gp.canvas.classList.add('locked', 'just-locked');
          gp.canvas.addEventListener('animationend', () => gp.canvas.classList.remove('just-locked'), { once: true });
        });
        this.onLock?.();
      } else if (this._tryJoinOffBoard(p)) {
        // Joined another group off-board; _tryJoinOffBoard already moved
        // and merged everything.
        this.onJoin?.();
      } else {
        // A lone piece gets a fresh jaunty tabletop angle when it misses, as
        // before. A multi-piece group keeps every member's existing
        // rotation fixed, since changing them independently would tear the
        // cluster's aligned shape apart.
        if (p.group.length === 1) {
          p.rot = (Math.random() - 0.5) * 16;
          p.canvas.style.transform = `rotate(${p.rot}deg)`;
        }
        // Clamp using the grabbed piece's own position, then apply that
        // SAME correction to every member — clamping each piece to the
        // viewport independently could tear a multi-piece cluster apart if
        // it straddles an edge.
        const anchorLeft = parseFloat(p.canvas.style.left) || 0;
        const anchorTop = parseFloat(p.canvas.style.top) || 0;
        const { left: clampedAnchorLeft, top: clampedAnchorTop } = this._clampToViewport(anchorLeft, anchorTop, p.rot);
        const dLeft = clampedAnchorLeft - anchorLeft, dTop = clampedAnchorTop - anchorTop;
        p.group.forEach(gp => {
          this.tray.appendChild(gp.canvas);
          gp.canvas.style.position = 'fixed';
          const left = (parseFloat(gp.canvas.style.left) || 0) + dLeft;
          const top = (parseFloat(gp.canvas.style.top) || 0) + dTop;
          gp.canvas.style.transition = 'left 0.2s ease, top 0.2s ease, transform 0.2s ease';
          gp.canvas.style.left = left + 'px';
          gp.canvas.style.top = top + 'px';
          gp.canvas.style.zIndex = 1;
          gp.canvas.addEventListener('transitionend', () => { gp.canvas.style.transition = ''; }, { once: true });
        });
      }

      const solved = this.pieces.every(pp => pp.locked);
      this.onProgress?.(solved);
    }
  }

  // buildKnobs/knobSegment/buildPiecePath are exported alongside JigsawGame
  // only so the pure geometry math can be unit-tested directly — nothing in
  // the runtime app calls them from outside this module.
  return { JigsawGame, buildKnobs, knobSegment, buildPiecePath };
})();

// Inert in the browser (no bundler/module system is used there — this file
// loads as a plain <script>); picked up by the test suite under Node/Vitest.
if (typeof module !== 'undefined') module.exports = Puzzle;
