(function () {
  'use strict';

  // Nav background on scroll + mobile menu
  var nav = document.getElementById('nav');
  var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 10); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var burger = document.getElementById('burger');
  var links = document.getElementById('navLinks');
  burger.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  });

  // Reveal on scroll + number counters
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var countUp = function (el) {
    var target = Number(el.dataset.count);
    if (!isFinite(target) || reduce) return;
    var prefix = el.dataset.prefix || '', suffix = el.dataset.suffix || '';
    var start = performance.now(), dur = 1400;
    var step = function (now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        entry.target.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 70 + 'ms';
      io.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // Animated hero chart (illustrative)
  var canvas = document.getElementById('heroChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var W = 560, H = 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  var seed = 11;
  var rand = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  var candles = [];
  var price = 1.0832;
  for (var i = 0; i < 44; i++) {
    var drift = i > 26 ? 0.00011 : Math.sin(i / 5) * 0.00006;
    var o = price, c = o + drift + (rand() - 0.5) * 0.0005;
    candles.push({ o: o, c: c, h: Math.max(o, c) + rand() * 0.0002, l: Math.min(o, c) - rand() * 0.0002 });
    price = c;
  }
  var entry = candles[candles.length - 1].c;
  var tp = entry + 0.0027, sl = entry - 0.00134;
  var fmt = function (v) { return v.toFixed(5); };
  document.getElementById('lvEntry').textContent = fmt(entry);
  document.getElementById('lvTp').textContent = fmt(tp);
  document.getElementById('lvSl').textContent = fmt(sl);

  var live = { o: entry, c: entry, h: entry, l: entry };
  var t = 0;

  function draw() {
    var all = candles.concat([live]);
    var min = Infinity, max = -Infinity;
    all.forEach(function (k) { min = Math.min(min, k.l); max = Math.max(max, k.h); });
    min = Math.min(min, sl); max = Math.max(max, tp);
    var pad = (max - min) * 0.08; min -= pad; max += pad;
    var y = function (p) { return 10 + (max - p) / (max - min) * (H - 20); };
    var slots = all.length + 8, step = (W - 16) / slots, bw = step * 0.6;
    var x = function (i) { return 8 + step * (i + 0.5); };

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(148,163,209,0.07)'; ctx.lineWidth = 1;
    for (var g = 1; g < 5; g++) { ctx.beginPath(); ctx.moveTo(0, g * H / 5); ctx.lineTo(W, g * H / 5); ctx.stroke(); }

    var zx = x(candles.length - 1);
    ctx.fillStyle = 'rgba(34,211,155,0.10)'; ctx.fillRect(zx, y(tp), W - zx, y(entry) - y(tp));
    ctx.fillStyle = 'rgba(255,77,106,0.10)'; ctx.fillRect(zx, y(entry), W - zx, y(sl) - y(entry));

    // EMA-like smooth line
    ctx.beginPath();
    var ema = all[0].c;
    all.forEach(function (k, i) { ema = ema + (k.c - ema) * 0.18; i ? ctx.lineTo(x(i), y(ema)) : ctx.moveTo(x(i), y(ema)); });
    ctx.strokeStyle = 'rgba(245,184,61,0.85)'; ctx.lineWidth = 1.6; ctx.stroke();

    all.forEach(function (k, i) {
      var up = k.c >= k.o, col = up ? '#22d39b' : '#ff4d6a';
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x(i), y(k.h)); ctx.lineTo(x(i), y(k.l)); ctx.stroke();
      var top = y(Math.max(k.o, k.c)), h = Math.max(1.2, Math.abs(y(k.o) - y(k.c)));
      ctx.fillRect(x(i) - bw / 2, top, bw, h);
    });

    function level(p, col, label, dash) {
      ctx.setLineDash(dash ? [5, 4] : []); ctx.strokeStyle = col; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(zx - step * 4, y(p)); ctx.lineTo(W - 4, y(p)); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '700 10px Inter, sans-serif'; var tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W - tw - 6, y(p) - 9, tw, 18, 5) : ctx.rect(W - tw - 6, y(p) - 9, tw, 18); ctx.fill();
      ctx.fillStyle = '#06101c'; ctx.fillText(label, W - tw, y(p) + 3.5);
    }
    level(tp, '#22d39b', 'TP', true);
    level(sl, '#ff4d6a', 'SL', true);
    level(entry, '#5b8cff', 'ENTRY', false);

    var lx = x(all.length - 1), ly = y(live.c);
    ctx.beginPath(); ctx.arc(lx, ly, 4 + Math.sin(t / 8) * 1.2, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  }

  function tick() {
    t++;
    var target = live.o + 0.0003 + Math.sin(t / 23) * 0.00018 + (rand() - 0.5) * 0.00008;
    live.c += (target - live.c) * 0.08;
    live.h = Math.max(live.h, live.c); live.l = Math.min(live.l, live.c);
    if (t % 140 === 0) {
      candles.push(live); candles.shift();
      live = { o: live.c, c: live.c, h: live.c, l: live.c };
      if (live.o > tp - 0.0004) { // keep the illustration in range
        candles.forEach(function (k) { k.o -= 0.0012; k.c -= 0.0012; k.h -= 0.0012; k.l -= 0.0012; });
        live.o -= 0.0012; live.c -= 0.0012; live.h -= 0.0012; live.l -= 0.0012;
      }
    }
    draw();
    if (!reduce) requestAnimationFrame(tick);
  }
  draw();
  if (!reduce) requestAnimationFrame(tick);
})();
