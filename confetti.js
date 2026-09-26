// Tiny dependency-free confetti burst for the win screen.
const Confetti = (() => {
  const COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff8fab'];

  function launch(canvas, { duration = 3200 } = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    const count = Math.min(220, Math.floor(window.innerWidth / 4));
    const particles = Array.from({ length: count }, () => spawn(canvas));

    const start = performance.now();
    let raf;
    function frame(now) {
      const t = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        p.life -= 1;
        const alpha = Math.max(0, Math.min(1, p.life / 40));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life < 40 ? alpha : 1;
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      });

      if (t < duration) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.removeEventListener('resize', resize);
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }

  function spawn(canvas) {
    const w = window.innerWidth;
    const fromTop = Math.random() < 0.5;
    return {
      x: Math.random() * w,
      y: fromTop ? -20 - Math.random() * 100 : window.innerHeight * 0.3 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 6,
      vy: fromTop ? Math.random() * 2 : -8 - Math.random() * 6,
      gravity: 0.18 + Math.random() * 0.08,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: Math.random() < 0.5 ? 'circle' : 'rect',
      life: 200 + Math.random() * 100,
    };
  }

  return { launch };
})();
