/* ============================================================
   Snow Particles — page snowfall + interactive preview
   A loose JS approximation of cocos2d's CCParticleSnow, which is
   what the mod actually spawns in game.
   ============================================================ */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     SnowField — one canvas worth of falling particles
     --------------------------------------------------------- */
  function SnowField(canvas, opts) {
    opts = opts || {};

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.count = opts.count || 700;
    this.maxCount = opts.maxCount || 3000;
    this.scale = opts.scale || 1;        // visual size multiplier
    this.alpha = opts.alpha || 1;        // global opacity multiplier
    this.wind = opts.wind !== false;
    this.enabled = opts.enabled !== false;
    this.speed = opts.speed || 1;

    this.particles = [];
    this.w = 0;
    this.h = 0;
    this.last = 0;
    this.running = false;

    this.resize();
    this.fill();

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  SnowField.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));

    if (w === this.w && h === this.h) return;

    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  SnowField.prototype.makeParticle = function (seeded) {
    // depth 0 = far away (small, slow, faint), 1 = close to camera
    var depth = Math.pow(Math.random(), 1.6);
    var radius = (0.6 + depth * 2.1) * this.scale;

    return {
      x: Math.random() * this.w,
      y: seeded ? Math.random() * this.h : -radius * 2 - Math.random() * 60,
      r: radius,
      depth: depth,
      // fall speed in px/sec, scaled by depth for parallax
      vy: (16 + depth * 62) * (0.85 + Math.random() * 0.3),
      // horizontal drift
      vx: (Math.random() - 0.5) * 14,
      swayAmp: 6 + Math.random() * 22,
      swayFreq: 0.25 + Math.random() * 0.75,
      phase: Math.random() * Math.PI * 2,
      opacity: (0.28 + depth * 0.62) * (0.7 + Math.random() * 0.3)
    };
  };

  SnowField.prototype.fill = function () {
    var target = Math.round(this.count * this.densityFactor());

    while (this.particles.length < target) {
      this.particles.push(this.makeParticle(true));
    }
    if (this.particles.length > target) {
      this.particles.length = target;
    }
  };

  // Full-page field would be overwhelming at 1:1, so large surfaces
  // get a proportional share of the configured count.
  SnowField.prototype.densityFactor = function () {
    return this.factor == null ? 1 : this.factor;
  };

  SnowField.prototype.setCount = function (n) {
    this.count = Math.max(0, Math.min(this.maxCount, n));
    this.fill();
  };

  SnowField.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!this.enabled) {
      this.ctx.clearRect(0, 0, this.w, this.h);
    }
  };

  SnowField.prototype.setWind = function (on) {
    this.wind = !!on;
  };

  SnowField.prototype.step = function (dt, t) {
    var p, i;
    var drift = this.wind ? 1 : 0;
    // slow global gust so the snow isn't perfectly vertical
    var gust = this.wind ? Math.sin(t * 0.18) * 12 + Math.sin(t * 0.07) * 7 : 0;

    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];

      p.y += p.vy * dt * this.speed;
      p.x += (p.vx * drift + gust * p.depth) * dt * this.speed;

      if (drift) {
        p.x += Math.sin(t * p.swayFreq + p.phase) * p.swayAmp * dt;
      }

      // wrap / recycle
      if (p.y - p.r > this.h) {
        var fresh = this.makeParticle(false);
        fresh.x = Math.random() * this.w;
        this.particles[i] = fresh;
      } else if (p.x < -20) {
        p.x = this.w + 20;
      } else if (p.x > this.w + 20) {
        p.x = -20;
      }
    }
  };

  SnowField.prototype.draw = function () {
    var ctx = this.ctx;
    var p, i;

    ctx.clearRect(0, 0, this.w, this.h);

    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      ctx.globalAlpha = p.opacity * this.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  };

  SnowField.prototype.destroy = function () {
    window.removeEventListener('resize', this._onResize);
  };

  /* ---------------------------------------------------------
     Shared animation loop
     --------------------------------------------------------- */
  var fields = [];
  var lastTime = 0;
  var elapsed = 0;
  var frameCount = 0;
  var fpsAccum = 0;
  var fps = 60;
  var paused = false;

  function loop(now) {
    requestAnimationFrame(loop);

    if (!lastTime) lastTime = now;
    var dt = (now - lastTime) / 1000;
    lastTime = now;

    // guard against tab-switch time jumps
    if (dt > 0.1) dt = 0.1;
    if (paused) return;

    elapsed += dt;

    // rough fps readout
    fpsAccum += dt;
    frameCount++;
    if (fpsAccum >= 0.5) {
      fps = Math.round(frameCount / fpsAccum);
      frameCount = 0;
      fpsAccum = 0;
      if (onFps) onFps(fps);
    }

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.enabled) continue;
      f.step(dt, elapsed);
      f.draw();
    }
  }

  var onFps = null;

  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
    lastTime = 0;
  });

  /* ---------------------------------------------------------
     Wire up the two canvases
     --------------------------------------------------------- */
  var pageCanvas = document.getElementById('snow');
  var previewCanvas = document.getElementById('preview');

  var pageField = new SnowField(pageCanvas, {
    count: 700,
    scale: 1,
    alpha: 0.62,
    enabled: !reduceMotion
  });
  // the page is much bigger than the preview box, so it only renders a
  // fraction of the configured count to stay light
  pageField.factor = 0.45;
  pageField.fill();

  var previewField = new SnowField(previewCanvas, {
    count: 700,
    scale: 1.1,
    alpha: 1,
    enabled: !reduceMotion
  });
  previewField.factor = 0.22;
  previewField.fill();

  fields.push(pageField, previewField);
  requestAnimationFrame(loop);

  /* ---------------------------------------------------------
     Controls
     --------------------------------------------------------- */
  var countInput = document.getElementById('count');
  var countOut = document.getElementById('countOut');
  var fpsOut = document.getElementById('fpsOut');
  var toggleSnow = document.getElementById('toggleSnow');
  var toggleWind = document.getElementById('toggleWind');

  function paintRange() {
    var min = +countInput.min;
    var max = +countInput.max;
    var pct = ((+countInput.value - min) / (max - min)) * 100;
    countInput.style.setProperty('--pct', pct + '%');
  }

  function applyCount() {
    var n = +countInput.value;
    countOut.textContent = n;
    pageField.setCount(n);
    previewField.setCount(n);
    paintRange();
    updateHud();
  }

  function updateHud() {
    if (!fpsOut) return;
    if (!previewField.enabled) {
      fpsOut.textContent = 'snow disabled';
      return;
    }
    fpsOut.textContent = previewField.particles.length + ' drawn · ' + fps + ' fps';
  }

  onFps = updateHud;

  countInput.addEventListener('input', applyCount);
  applyCount();

  function bindSwitch(el, handler) {
    el.addEventListener('click', function () {
      var on = !el.classList.contains('is-on');
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', String(on));
      handler(on);
      updateHud();
    });
  }

  bindSwitch(toggleSnow, function (on) {
    pageField.setEnabled(on);
    previewField.setEnabled(on);
  });

  bindSwitch(toggleWind, function (on) {
    pageField.setWind(on);
    previewField.setWind(on);
  });

  // reflect reduced-motion in the initial switch state
  if (reduceMotion) {
    toggleSnow.classList.remove('is-on');
    toggleSnow.setAttribute('aria-checked', 'false');
    updateHud();
  }

  /* ---------------------------------------------------------
     Copy buttons
     --------------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.code__copy'), function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy') || '';
      var done = function () {
        var original = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        done();
      }
    });
  });

  /* ---------------------------------------------------------
     Scroll reveal
     --------------------------------------------------------- */
  if ('IntersectionObserver' in window && !reduceMotion) {
    var targets = document.querySelectorAll('.card, .panel, .table-wrap, .timeline li, .playground > *, .cta__inner');

    Array.prototype.forEach.call(targets, function (el, i) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(18px)';
      el.style.transition = 'opacity 0.6s ease ' + ((i % 4) * 0.07) + 's, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) ' + ((i % 4) * 0.07) + 's';
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'none';
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
  }
})();
