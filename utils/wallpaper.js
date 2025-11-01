// Lightweight live wallpaper: drifting nodes + subtle connective lines and grid
// UI-only: respects prefers-reduced-motion and keeps CPU usage modest.

export function initLiveWallpaper(options = {}) {
  try {
    const settings = {
      nodes: 28,
      maxDist: 120,
      speed: 0.15,
      dotColor: 'rgba(148, 163, 184, 0.55)',
      lineColor: 'rgba(99, 102, 241, 0.20)',
      gridColor: 'rgba(148, 163, 184, 0.06)',
      gridSpacing: 100,
      fps: 30,
      ...options
    };

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.className = 'live-wallpaper';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '0';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let width = 0, height = 0;

    function resize() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Nodes
    const nodes = [];
    const count = settings.nodes;
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() * 2 - 1) * settings.speed,
        vy: (Math.random() * 2 - 1) * settings.speed,
        r: Math.random() * 1.4 + 0.6
      });
    }

    const maxDist2 = settings.maxDist * settings.maxDist;
    let rafId = 0;
    let lastTs = 0;
    const frameInterval = 1000 / Math.max(1, settings.fps);

    function drawGrid(offsetX = 0, offsetY = 0) {
      const sp = settings.gridSpacing;
      if (!sp) return;
      ctx.save();
      ctx.strokeStyle = settings.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = -((offsetX % sp) + sp);
      for (let x = startX; x < width + sp; x += sp) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      const startY = -((offsetY % sp) + sp);
      for (let y = startY; y < height + sp; y += sp) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }

    function step(ts) {
      if (reduceMotion) return; // Static wallpaper only
      rafId = requestAnimationFrame(step);
      if (ts - lastTs < frameInterval) return;
      lastTs = ts;

      ctx.clearRect(0, 0, width, height);

      // Subtle drifting grid
      const t = (ts || 0) * 0.02;
      drawGrid(t * 0.05, t * 0.03);

      // Update + draw connections first for layering
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < -20 || a.x > width + 20) a.vx *= -1;
        if (a.y < -20 || a.y > height + 20) a.vy *= -1;
      }

      // Connections
      ctx.strokeStyle = settings.lineColor;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxDist2) {
            const alpha = 1 - d2 / maxDist2;
            ctx.globalAlpha = Math.max(0.04, alpha * 0.25);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // Dots
      ctx.fillStyle = settings.dotColor;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw a static first frame (including when reduced-motion)
    ctx.clearRect(0, 0, width, height);
    drawGrid(0, 0);
    ctx.fillStyle = settings.dotColor;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!reduceMotion) rafId = requestAnimationFrame(step);

    // Return cleanup
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      try { canvas.remove(); } catch {}
    };
  } catch (err) {
    // Fail silently to avoid breaking UI
    console.warn('live wallpaper init failed', err);
    return () => {};
  }
}

