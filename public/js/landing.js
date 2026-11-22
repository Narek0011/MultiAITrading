(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var data = {};
  try { data = JSON.parse(document.getElementById('clientData').textContent); } catch (e) { /* page still works without it */ }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /** Resolves once the element is on screen and the tab is visible (pauses loops otherwise). */
  function visibility(el) {
    var state = { visible: true };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; }).observe(el);
    }
    state.wait = function () {
      return new Promise(function (resolve) {
        (function check() { if (state.visible && !document.hidden) resolve(); else setTimeout(check, 300); })();
      });
    };
    return state;
  }

  function seeded(seed) {
    var s = seed;
    return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }

  /* ---------------- Nav ---------------- */
  (function nav() {
    var nav = $('#nav');
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 10); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    var burger = $('#burger'), links = $('#navLinks');
    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
    });
    // Language menu: close on a tap outside it or on Escape.
    var langSwitch = $('#langSwitch');
    if (langSwitch) {
      document.addEventListener('click', function (e) { if (!langSwitch.contains(e.target)) langSwitch.open = false; });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') langSwitch.open = false; });
    }
  })();

  /* ---------------- Reveal + counters ---------------- */
  function countUp(el) {
    var target = Number(el.dataset.count);
    if (!isFinite(target) || reduce) return;
    var prefix = el.dataset.prefix || '', suffix = el.dataset.suffix || '';
    var start = performance.now(), dur = 1400;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur);
      el.textContent = prefix + Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }
  (function reveal() {
    var items = $$('.reveal');
    if (!('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        $$('[data-count]', entry.target).forEach(countUp);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
  })();


  /* ---------------- Chart kit (for the layer cards) ---------------- */
  var UP = '#3ad29f', DOWN = '#f2566f', EMA_FAST = '#e2c17c', EMA_SLOW = '#8e887a', ENTRY = '#f3efe6', CYAN = '#e2c17c';

  /** Realistic OHLC random walk. `drift` and `vol` may be numbers or functions of (i, n). */
  function genCandles(seed, n, opts) {
    var rand = seeded(seed), p = opts.start || 100, out = [];
    var val = function (f, i) { return typeof f === 'function' ? f(i, n) : (f || 0); };
    for (var i = 0; i < n; i++) {
      var vol = val(opts.vol, i) || 1, o = p;
      var c = o + val(opts.drift, i) + (rand() - 0.5) * vol * 1.6;
      out.push({ o: o, c: c, h: Math.max(o, c) + rand() * vol * 0.6, l: Math.min(o, c) - rand() * vol * 0.6 });
      p = c + (rand() - 0.5) * vol * 0.15; // small gap between candles
    }
    return out;
  }
  function ema(values, period) {
    var k = 2 / (period + 1), e = values[0];
    return values.map(function (v) { e = v * k + e * (1 - k); return e; });
  }
  function atr(cs, period) {
    var out = [], a = cs[0].h - cs[0].l;
    cs.forEach(function (c, i) {
      var tr = i ? Math.max(c.h - c.l, Math.abs(c.h - cs[i - 1].c), Math.abs(c.l - cs[i - 1].c)) : c.h - c.l;
      a = (a * (period - 1) + tr) / period; out.push(a);
    });
    return out;
  }
  function extent(cs, extra) {
    var min = Infinity, max = -Infinity;
    cs.forEach(function (c) { min = Math.min(min, c.l); max = Math.max(max, c.h); });
    (extra || []).forEach(function (v) { min = Math.min(min, v); max = Math.max(max, v); });
    var pad = (max - min) * 0.08;
    return [min - pad, max + pad];
  }

  var NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function svgPath(points) { return points.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(''); }

  /* ---------------- Layer mini-charts ---------------- */
  (function layerCharts() {
    var svgs = $$('svg.mini');
    if (!svgs.length) return;

    function base(svg, padR) {
      var w = svg.clientWidth || 320, h = svg.clientHeight || 120;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var defs = S('defs', {}, svg);
      var g = S('linearGradient', { id: 'mfade', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      S('stop', { offset: 0, 'stop-color': CYAN, 'stop-opacity': 0.22 }, g);
      S('stop', { offset: 1, 'stop-color': CYAN, 'stop-opacity': 0 }, g);
      for (var i = 1; i < 4; i++) S('line', { x1: 0, x2: w, y1: (h / 4) * i, y2: (h / 4) * i, stroke: 'rgba(148,163,209,0.07)' }, svg);
      return { w: w, h: h, l: 8, r: w - (padR || 10) };
    }
    function candles(svg, cs, x, y, bw) {
      cs.forEach(function (c, i) {
        var col = c.c >= c.o ? UP : DOWN;
        var g = S('g', { class: 'cd', style: 'transition-delay:' + (i * 16) + 'ms' }, svg);
        S('line', { x1: x(i), x2: x(i), y1: y(c.h), y2: y(c.l), stroke: col, 'stroke-width': 1 }, g);
        S('rect', { x: x(i) - bw / 2, y: y(Math.max(c.o, c.c)), width: bw, height: Math.max(1, Math.abs(y(c.o) - y(c.c))), fill: col, rx: 0.8 }, g);
      });
    }
    function xs(cs, f, slotsExtra) {
      var slots = cs.length + (slotsExtra || 0), step = (f.r - f.l) / slots;
      return { x: function (i) { return f.l + step * (i + 0.5); }, bw: Math.max(2, step * 0.62), step: step };
    }
    function line(svg, vals, x, y, color, width, dash) {
      S('path', { d: svgPath(vals.map(function (v, i) { return [x(i), y(v)]; })), fill: 'none', stroke: color, 'stroke-width': width || 1.6, 'stroke-dasharray': dash || '', 'stroke-linejoin': 'round' }, svg);
    }
    function tag(svg, f, yv, text, color) {
      S('line', { x1: f.l, x2: f.r, y1: yv, y2: yv, stroke: color, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.7 }, svg);
      S('rect', { x: f.r + 2, y: yv - 8, width: f.w - f.r - 4, height: 16, rx: 4, fill: color }, svg);
      S('text', { x: f.r + (f.w - f.r) / 2, y: yv + 3.5, 'text-anchor': 'middle', fill: '#06101c', 'font-weight': 700 }, svg).textContent = text;
    }

    var draw = {
      trend: function (svg) {
        var f = base(svg, 46);
        var cs = genCandles(11, 34, { drift: function (i) { return 0.42 + Math.sin(i / 3) * 0.55; }, vol: 3.4 });
        var ex = extent(cs), m = xs(cs, f), y = function (v) { return 8 + (ex[1] - v) / (ex[1] - ex[0]) * (f.h - 16); };
        var closes = cs.map(function (c) { return c.c; });
        var area = closes.map(function (v, i) { return [m.x(i), y(v)]; });
        S('path', { d: svgPath(area) + 'L' + m.x(cs.length - 1) + ',' + f.h + 'L' + m.x(0) + ',' + f.h + 'Z', fill: 'url(#mfade)' }, svg);
        line(svg, ema(closes, 21), m.x, y, EMA_SLOW, 1.6);
        line(svg, ema(closes, 9), m.x, y, EMA_FAST, 1.6);
        candles(svg, cs, m.x, y, m.bw);
        tag(svg, f, y(closes[closes.length - 1]), 'UP', UP);
      },
      momentum: function (svg) {
        var f = base(svg, 10);
        var cs = genCandles(5, 34, { drift: function (i, n) { return -0.6 + (i / n) * 1.6; }, vol: 3.2 });
        var top = f.h * 0.62, ex = extent(cs), m = xs(cs, f);
        var y = function (v) { return 6 + (ex[1] - v) / (ex[1] - ex[0]) * (top - 12); };
        candles(svg, cs, m.x, y, m.bw);
        var closes = cs.map(function (c) { return c.c; });
        var fast = ema(closes, 6), slow = ema(closes, 13);
        var macd = fast.map(function (v, i) { return v - slow[i]; }), sig = ema(macd, 5);
        var hist = macd.map(function (v, i) { return v - sig[i]; });
        var hmax = Math.max.apply(null, hist.map(Math.abs)) || 1, zero = top + (f.h - top) / 2 + 2, hh = (f.h - top) / 2 - 4;
        S('line', { x1: f.l, x2: f.r, y1: zero, y2: zero, stroke: 'rgba(148,163,209,0.25)' }, svg);
        hist.forEach(function (v, i) {
          var rising = i && v > hist[i - 1], hgt = Math.abs(v) / hmax * hh;
          var col = v >= 0 ? (rising ? UP : 'rgba(34,211,155,0.45)') : (!rising ? DOWN : 'rgba(255,77,106,0.45)');
          var g = S('g', { class: 'cd', style: 'transition-delay:' + (i * 16) + 'ms' }, svg);
          S('rect', { x: m.x(i) - m.bw / 2, y: v >= 0 ? zero - hgt : zero, width: m.bw, height: Math.max(1, hgt), fill: col }, g);
        });
        S('text', { x: f.l + 2, y: top + 10, fill: '#6b7591' }, svg).textContent = 'MACD';
      },
      structure: function (svg) {
        var f = base(svg, 10);
        var cs = genCandles(23, 40, { drift: function (i) { return Math.sin(i / 3.2) * 1.5; }, vol: 1.5 });
        var ex = extent(cs), m = xs(cs, f), y = function (v) { return 10 + (ex[1] - v) / (ex[1] - ex[0]) * (f.h - 20); };
        var hi = Math.max.apply(null, cs.map(function (c) { return c.h; })), lo = Math.min.apply(null, cs.map(function (c) { return c.l; }));
        var zone = (hi - lo) * 0.09;
        S('rect', { x: f.l, y: y(hi), width: f.r - f.l, height: y(hi - zone) - y(hi), fill: 'rgba(255,77,106,0.12)', stroke: 'rgba(255,77,106,0.35)', 'stroke-dasharray': '4 3' }, svg);
        S('rect', { x: f.l, y: y(lo + zone), width: f.r - f.l, height: y(lo) - y(lo + zone), fill: 'rgba(34,211,155,0.12)', stroke: 'rgba(34,211,155,0.35)', 'stroke-dasharray': '4 3' }, svg);
        S('text', { x: f.r - 4, y: y(hi) + 10, 'text-anchor': 'end', fill: DOWN }, svg).textContent = 'RESISTANCE';
        S('text', { x: f.r - 4, y: y(lo) - 4, 'text-anchor': 'end', fill: UP }, svg).textContent = 'SUPPORT';
        candles(svg, cs, m.x, y, m.bw);
        for (var i = 2; i < cs.length - 2; i++) {
          var c = cs[i];
          if (c.h >= Math.max(cs[i - 1].h, cs[i - 2].h, cs[i + 1].h, cs[i + 2].h)) S('path', { d: 'M' + (m.x(i) - 4) + ',' + (y(c.h) - 9) + 'h8l-4,5z', fill: CYAN }, svg);
          if (c.l <= Math.min(cs[i - 1].l, cs[i - 2].l, cs[i + 1].l, cs[i + 2].l)) S('path', { d: 'M' + (m.x(i) - 4) + ',' + (y(c.l) + 9) + 'h8l-4,-5z', fill: CYAN }, svg);
        }
      },
      volatility: function (svg) {
        var f = base(svg, 10);
        var cs = genCandles(31, 40, { drift: function (i) { return Math.sin(i / 6) * 0.5; }, vol: function (i, n) { return 0.8 + (i / n) * 2.4; } });
        var closes = cs.map(function (c) { return c.c; }), mid = ema(closes, 10), a = atr(cs, 8);
        var upper = mid.map(function (v, i) { return v + a[i] * 1.6; }), lower = mid.map(function (v, i) { return v - a[i] * 1.6; });
        var ex = extent(cs, upper.concat(lower)), m = xs(cs, f), y = function (v) { return 6 + (ex[1] - v) / (ex[1] - ex[0]) * (f.h - 12); };
        var up = upper.map(function (v, i) { return [m.x(i), y(v)]; }), dn = lower.map(function (v, i) { return [m.x(i), y(v)]; }).reverse();
        S('path', { d: svgPath(up.concat(dn)) + 'Z', fill: 'rgba(31,209,255,0.10)' }, svg);
        line(svg, upper, m.x, y, 'rgba(31,209,255,0.55)', 1.2);
        line(svg, lower, m.x, y, 'rgba(31,209,255,0.55)', 1.2);
        line(svg, mid, m.x, y, 'rgba(31,209,255,0.35)', 1, '3 3');
        candles(svg, cs, m.x, y, m.bw);
        S('text', { x: f.l + 2, y: 14, fill: CYAN }, svg).textContent = 'ATR BAND';
      },
      risk: function (svg) {
        var f = base(svg, 10);
        var cs = genCandles(17, 30, { drift: function (i) { return i < 18 ? -0.35 : 0.55; }, vol: 2.8 });
        var entry = cs[cs.length - 1].c, rng = extent(cs), risk = (rng[1] - rng[0]) * 0.16;
        var tp = entry + risk * 2, sl = entry - risk;
        var ex = extent(cs, [tp, sl]), m = xs(cs, f, 14), y = function (v) { return 6 + (ex[1] - v) / (ex[1] - ex[0]) * (f.h - 12); };
        var x0 = m.x(cs.length - 1), x1 = f.r;
        S('rect', { x: x0, y: y(tp), width: x1 - x0, height: y(entry) - y(tp), fill: 'rgba(34,211,155,0.16)', stroke: 'rgba(34,211,155,0.55)' }, svg);
        S('rect', { x: x0, y: y(entry), width: x1 - x0, height: y(sl) - y(entry), fill: 'rgba(255,77,106,0.16)', stroke: 'rgba(255,77,106,0.55)' }, svg);
        S('line', { x1: x0 - 20, x2: x1, y1: y(entry), y2: y(entry), stroke: ENTRY, 'stroke-width': 1.6 }, svg);
        S('text', { x: (x0 + x1) / 2, y: (y(tp) + y(entry)) / 2 + 3, 'text-anchor': 'middle', fill: UP, 'font-weight': 700 }, svg).textContent = 'TP  1 : 2';
        S('text', { x: (x0 + x1) / 2, y: (y(sl) + y(entry)) / 2 + 3, 'text-anchor': 'middle', fill: DOWN, 'font-weight': 700 }, svg).textContent = 'SL';
        candles(svg, cs, m.x, y, m.bw);
        S('circle', { cx: x0, cy: y(entry), r: 3.5, fill: ENTRY, stroke: '#fff', 'stroke-width': 1.5 }, svg);
      },
    };

    function render() { svgs.forEach(function (svg) { var fn = draw[svg.dataset.mini]; if (fn) fn(svg); if (reduce) svg.classList.add('static'); }); }
    render();
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(render, 200); });
  })();

  /* ---------------- Neural network background ---------------- */
  (function neural() {
    var canvas = $('#neural');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, nodes = [], pulses = [];
    var vis = visibility(canvas);
    var rand = seeded(42);

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.round(clamp((W * H) / 15000, 24, 80));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({ x: rand() * W, y: rand() * H, vx: (rand() - 0.5) * 0.25, vy: (rand() - 0.5) * 0.25, r: 1 + rand() * 1.6 });
      }
    }
    function color(x, a) {
      // Logo palette: blue on the left → green on the right
      var t = clamp(x / (W || 1), 0, 1);
      var r = Math.round(243 - 17 * t), g = Math.round(239 - 46 * t), b = Math.round(230 - 106 * t);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    var LINK = 150;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!reduce) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > W) n.vx *= -1;
          if (n.y < 0 || n.y > H) n.vy *= -1;
        }
        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j], dx = n.x - m.x, dy = n.y - m.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            ctx.strokeStyle = color((n.x + m.x) / 2, (1 - d / LINK) * 0.22);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke();
            if (!reduce && pulses.length < 6 && rand() < 0.0008) pulses.push({ a: n, b: m, t: 0 });
          }
        }
      }
      nodes.forEach(function (n) {
        ctx.fillStyle = color(n.x, 0.75);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      });
      pulses = pulses.filter(function (p) {
        p.t += 0.02;
        var x = p.a.x + (p.b.x - p.a.x) * p.t, y = p.a.y + (p.b.y - p.a.y) * p.t;
        var g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, color(x, 0.95)); g.addColorStop(1, color(x, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
        return p.t < 1;
      });
    }
    function loop() {
      if (vis.visible && !document.hidden) frame();
      requestAnimationFrame(loop);
    }
    resize();
    window.addEventListener('resize', function () { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
    if (reduce) frame(); else loop();
  })();

  /* ---------------- Example Telegram chat ---------------- */
  (function phone() {
    var root = $('#phone');
    if (!root) return;
    var msgs = $$('[data-post]', root);
    if (reduce) { msgs.forEach(function (m) { m.classList.add('show'); }); return; }
    var vis = visibility(root);
    (async function play() {
      for (;;) {
        msgs.forEach(function (m) { m.classList.remove('show'); });
        for (var i = 0; i < msgs.length; i++) {
          await sleep(i ? 1600 : 500);
          await vis.wait();
          msgs[i].classList.add('show');
        }
        await sleep(6000);
      }
    })();
  })();

  /* ---------------- Global coverage globe ---------------- */
  (function globe() {
    var canvas = $('#globe'), layer = $('#globeLabels');
    if (!canvas || !layer) return;
    var info = {};
    try { info = JSON.parse($('#globeData').textContent); } catch (e) { /* labels only */ }
    var words = data.globe || { open: 'open', closed: 'closed' };
    var ctx = canvas.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var size = 0, R = 0, dotScale = 1, dots = [], rot = -10, tilt = 18, dragging = null;
    var D = Math.PI / 180;
    // Forex session hubs (UTC hours, weekends closed) and other financial centres.
    var HUBS = [
      { name: 'London FX', lon: -0.13, lat: 51.5, open: 7, close: 16 },
      { name: 'New York FX', lon: -74, lat: 40.7, open: 12, close: 21 },
      { name: 'Tokyo FX', lon: 139.7, lat: 35.7, open: 0, close: 9 },
      { name: 'Sydney FX', lon: 151.2, lat: -33.9, open: 21, close: 6 },
    ];
    var CITIES = [
      ['Paris', 2.35, 48.86], ['Frankfurt', 8.68, 50.11], ['Istanbul', 28.98, 41.01], ['Dubai', 55.27, 25.2], ['Mumbai', 72.88, 19.08],
      ['Singapore', 103.82, 1.35], ['Hong Kong', 114.17, 22.32], ['Shanghai', 121.47, 31.23], ['Seoul', 126.98, 37.57],
      ['São Paulo', -46.63, -23.55], ['Johannesburg', 28.05, -26.2], ['Lagos', 3.38, 6.52], ['Toronto', -79.38, 43.65], ['Yerevan', 44.51, 40.18],
    ].map(function (c) { return { name: c[0], lon: c[1], lat: c[2] }; });
    var ALL = HUBS.concat(CITIES);
    var ARCS = [[0, 1], [0, 2], [2, 3], [0, 7], [1, 13], [6, 9], [0, 14], [4, 2]];
    var tags = (info.tags || []).map(function (t, i) { return { t: t, city: ALL[(i * 5 + 3) % ALL.length], born: -1 }; });

    function isOpen(h) {
      var now = new Date(), day = now.getUTCDay(), hr = now.getUTCHours() + now.getUTCMinutes() / 60;
      if (day === 6 || (day === 0 && hr < 21) || (day === 5 && hr >= 21)) return false;
      return h.open < h.close ? hr >= h.open && hr < h.close : hr >= h.open || hr < h.close;
    }
    // Orthographic projection: returns screen x/y and z (> 0 = facing us).
    function project(lon, lat) {
      var l = (lon + rot) * D, p = lat * D, t = tilt * D;
      var x = Math.cos(p) * Math.sin(l), y = Math.sin(p), z = Math.cos(p) * Math.cos(l);
      var y2 = y * Math.cos(t) - z * Math.sin(t), z2 = y * Math.sin(t) + z * Math.cos(t);
      return { x: size / 2 + x * R, y: size / 2 - y2 * R, z: z2 };
    }
    function resize() {
      size = canvas.getBoundingClientRect().width;
      R = size * 0.42;
      dotScale = clamp(size / 620, 0.55, 1);
      canvas.width = size * dpr; canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Labels are DOM elements so text stays crisp and translatable.
    var labels = ALL.map(function (c, i) {
      var el = document.createElement('span');
      el.className = 'gl ' + (i < HUBS.length ? 'hub' : 'city');
      layer.appendChild(el);
      return el;
    });
    var tagEls = tags.map(function (tg) {
      var el = document.createElement('span');
      el.className = 'gl tag';
      el.innerHTML = '';
      el.appendChild(document.createTextNode(tg.t.pair + ' · ' + tg.t.detail + (tg.t.side ? ' · ' + tg.t.side : '') + ' '));
      if (tg.t.win) { var em = document.createElement('em'); em.textContent = '✓'; el.appendChild(em); }
      el.style.opacity = 0;
      layer.appendChild(el);
      return el;
    });
    function hubText() {
      HUBS.forEach(function (h, i) {
        var open = isOpen(h);
        labels[i].textContent = h.name + ' · ' + (open ? words.open : words.closed);
        labels[i].classList.toggle('open', open);
      });
      CITIES.forEach(function (c, i) { labels[HUBS.length + i].textContent = c.name; });
    }
    function arc(a, b, t) {
      // Great-circle points between two cities, lifted slightly above the surface.
      var pts = [];
      var A = [Math.cos(a.lat * D) * Math.cos(a.lon * D), Math.cos(a.lat * D) * Math.sin(a.lon * D), Math.sin(a.lat * D)];
      var B = [Math.cos(b.lat * D) * Math.cos(b.lon * D), Math.cos(b.lat * D) * Math.sin(b.lon * D), Math.sin(b.lat * D)];
      for (var i = 0; i <= 32 * t; i++) {
        var f = i / 32, v = [A[0] * (1 - f) + B[0] * f, A[1] * (1 - f) + B[1] * f, A[2] * (1 - f) + B[2] * f];
        var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        var lat = Math.asin(v[2] / n) / D, lon = Math.atan2(v[1], v[0]) / D;
        var p = project(lon, lat), lift = 1 + Math.sin(f * Math.PI) * 0.12;
        pts.push({ x: size / 2 + (p.x - size / 2) * lift, y: size / 2 + (p.y - size / 2) * lift, z: p.z });
      }
      return pts;
    }
    var start = performance.now(), tagCursor = 0, lastTag = 0;
    function frame(now) {
      var time = (now - start) / 1000;
      ctx.clearRect(0, 0, size, size);
      var cx = size / 2, cy = size / 2;
      // Globe body and rim.
      var g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.008)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
      // Land dots: brighter and bigger towards the viewer.
      for (var i = 0; i < dots.length; i++) {
        var p = project(dots[i][0], dots[i][1]);
        if (p.z <= 0) continue;
        ctx.fillStyle = 'rgba(243,239,230,' + (0.12 + p.z * 0.55).toFixed(3) + ')';
        var r = (0.55 + p.z * 0.75) * dotScale;
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
      // Arcs draw themselves in and fade, one after another.
      ARCS.forEach(function (pair, k) {
        var phase = ((time / 3 + k * 0.37) % 2.4) / 1.4;
        if (phase > 1.4) return;
        var pts = arc(ALL[pair[0]], ALL[pair[1]], Math.min(1, phase));
        var alpha = phase > 1 ? (1.4 - phase) / 0.4 : 1;
        ctx.strokeStyle = 'rgba(226,193,124,' + (0.55 * alpha).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        var drawing = false;
        pts.forEach(function (q) { if (q.z > -0.05) { if (drawing) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); drawing = true; } } else drawing = false; });
        ctx.stroke();
      });
      // City markers and labels; hubs first, and a label that would overlap one already shown is hidden.
      var placed = [];
      function free(x, y) {
        for (var j = 0; j < placed.length; j++) if (Math.abs(placed[j][0] - x) < 96 && Math.abs(placed[j][1] - y) < 24) return false;
        placed.push([x, y]);
        return true;
      }
      ALL.forEach(function (c, k) {
        var p = project(c.lon, c.lat), el = labels[k], hub = k < HUBS.length;
        if (p.z > 0.15) {
          var open = hub && el.classList.contains('open');
          ctx.fillStyle = open ? '#e2c17c' : 'rgba(243,239,230,0.85)';
          ctx.beginPath(); ctx.arc(p.x, p.y, hub ? 3.2 : 2.2, 0, Math.PI * 2); ctx.fill();
          if (open) { ctx.strokeStyle = 'rgba(226,193,124,' + (0.6 - (time % 1.6) / 2.7).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + (time % 1.6) * 9, 0, Math.PI * 2); ctx.stroke(); }
          el.style.left = (p.x / size * 100) + '%'; el.style.top = (p.y / size * 100) + '%';
          el.style.opacity = !free(p.x, p.y) ? 0 : hub ? Math.min(1, (p.z - 0.15) * 3) : Math.max(0, Math.min(0.9, (p.z - 0.45) * 3));
        } else el.style.opacity = 0;
      });
      // Signal tags: one appears every few seconds over a front-facing city, then fades.
      if (tags.length && time - lastTag > 2.6) {
        lastTag = time;
        for (var tries = 0; tries < tags.length; tries++) {
          var tg = tags[tagCursor++ % tags.length];
          var cands = ALL.filter(function (c) { return project(c.lon, c.lat).z > 0.5; });
          if (cands.length) { tg.city = cands[Math.floor((time * 7) % cands.length)]; tg.born = time; break; }
        }
      }
      tags.forEach(function (tg, k) {
        var el = tagEls[k], age = time - tg.born;
        if (tg.born < 0 || age > 5.5) { el.style.opacity = 0; return; }
        var p = project(tg.city.lon, tg.city.lat);
        el.style.left = (p.x / size * 100) + '%'; el.style.top = (p.y / size * 100 + 7) + '%';
        el.style.opacity = p.z < 0.2 ? 0 : Math.min(1, age * 2, (5.5 - age) * 2);
      });
      if (!dragging && !reduce) rot += 0.06;
    }
    var vis = visibility(canvas);
    function loop(now) {
      if (vis.visible && !document.hidden && size) frame(now);
      requestAnimationFrame(loop);
    }
    canvas.addEventListener('pointerdown', function (e) { dragging = { x: e.clientX, y: e.clientY, rot: rot, tilt: tilt }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      rot = dragging.rot + (e.clientX - dragging.x) * 0.35;
      tilt = clamp(dragging.tilt + (e.clientY - dragging.y) * 0.25, -40, 50);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { canvas.addEventListener(ev, function () { dragging = null; }); });
    window.addEventListener('resize', function () { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
    resize(); hubText(); setInterval(hubText, 60000);
    fetch('/static/data/globe-dots.json').then(function (r) { return r.json(); }).then(function (d) {
      dots = d;
      if (reduce) frame(performance.now()); else requestAnimationFrame(loop);
    }).catch(function () { /* the stats below still show */ });
  })();

  /* ---------------- Live AI status ---------------- */
  (function liveStatus() {
    var st = data.status, initial = data.initial;
    if (!st || !initial) return;
    var box = $('#aiStatus'), latest = initial;
    function ago(iso) {
      if (!iso) return '';
      var min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (min < 1) return st.justNow;
      if (min < 60) return st.minAgo.replace('{n}', min);
      return st.hAgo.replace('{n}', Math.round(min / 60));
    }
    function apply(s) {
      latest = s;
      if (box) {
        box.dataset.state = s.state;
        box.hidden = s.state === 'offline';
        $('[data-status-label]', box).textContent = s.state === 'live' ? st.live : st.standby;
        $('[data-last-wrap]', box).hidden = !s.lastScanAt;
        $('[data-last-scan]', box).textContent = ago(s.lastScanAt);
        $('[data-analyses]', box).textContent = s.analysesToday.toLocaleString();
      }
      $$('[data-live]').forEach(function (b) {
        var v = s[b.dataset.live];
        if (v == null) return;
        b.dataset.count = v;
        if (b.closest('.reveal.in') || reduce) b.textContent = (b.dataset.prefix || '') + Number(v).toLocaleString() + (b.dataset.suffix || '');
      });
    }
    apply(initial);
    setInterval(function () {
      if (document.hidden) return;
      fetch('/api/public/ai-status').then(function (r) { return r.json(); }).then(apply).catch(function () { /* keep last values */ });
    }, 60000);
    // keep "x min ago" fresh between fetches
    setInterval(function () { if (box && latest.lastScanAt) $('[data-last-scan]', box).textContent = ago(latest.lastScanAt); }, 30000);
  })();
})();
