(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var state = { settings: null, defaultPrompt: '', pairs: [], dashboard: null, signalsPage: 1 };

  // ---------- helpers ----------
  function api(method, path, body) {
    return fetch('/admin/api' + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (res) {
      if (res.status === 401) { location.href = '/admin/login'; throw new Error('Session expired'); }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Request failed (' + res.status + ')'));
        return data;
      });
    });
  }

  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 4200);
    setTimeout(function () { el.remove(); }, 4600);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function digits(pair) { return /JPY$/.test(pair) ? 3 : 5; }
  function price(pair, v) { return Number(v).toFixed(digits(pair)); }
  function pips(pair, d) { return Math.round(Math.abs(d) / (/JPY$/.test(pair) ? 0.01 : 0.0001) * 10) / 10; }
  function time(iso) { return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—'; }
  function ago(iso) {
    if (!iso) return 'never';
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 0) { s = -s; return 'in ' + (s < 60 ? s + 's' : Math.round(s / 60) + ' min'); }
    return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago';
  }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.innerHTML; btn.textContent = 'Working…'; } else if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }

  // ---------- routing ----------
  function route() {
    var page = (location.hash || '#dashboard').slice(1);
    if (!$('[data-page="' + page + '"]')) page = 'dashboard';
    $$('.page').forEach(function (p) { p.hidden = p.dataset.page !== page; });
    $$('.side-nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === page); });
    $('#pageTitle').textContent = $('[data-page="' + page + '"]').dataset.title;
    $('#sidebar').classList.remove('open');
    if (page === 'dashboard') loadDashboard();
    if (page === 'pairs') loadPairs();
    if (page === 'signals') loadSignals();
    if (page === 'marketData') updateEstimate();
    if (page === 'bot') loadBot();
    if (page === 'access') loadAccess();
    if (page === 'news') loadNews();
    if (page === 'landing') loadLandingNews();
    if (page === 'telegram') { loadChats(); checkChannelId(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('#menuBtn').addEventListener('click', function () { $('#sidebar').classList.toggle('open'); });

  // ---------- settings forms ----------
  function fillForm(form) {
    var values = state.settings[form.dataset.group] || {};
    $$('[name]', form).forEach(function (el) {
      var v = values[el.name];
      if (v === undefined) return;
      if (el.type === 'checkbox') el.checked = el.hasAttribute('value') ? (v || []).indexOf(el.value) !== -1 : !!v;
      else if (el.type === 'radio') el.checked = String(v) === el.value;
      else el.value = v;
    });
    if (form.dataset.group === 'news') { renderChannels(initialChannels(values)); renderSlots(values.slots || []); renderTargets(); renderWebsiteChannel(values.websiteChannel || ''); toggleNewsSources(); }
  }

  function readForm(form) {
    var out = {};
    $$('[name]', form).forEach(function (el) {
      if (el.type === 'checkbox' && el.hasAttribute('value')) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  }

  function saveForm(form) {
    var body = readForm(form);
    if (form.dataset.group === 'news') {
      try { body.channels = readChannels(); body.slots = readSlots(); } catch (err) { return Promise.reject(err); }
    }
    return api('PUT', '/settings/' + form.dataset.group, body).then(function (res) {
      state.settings = res.settings;
      fillForm(form);
      renderBotPill();
      return res;
    });
  }

  $$('form[data-group]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', form);
      busy(btn, true);
      saveForm(form)
        .then(function () { toast('Saved ✓', 'ok'); if (form.dataset.group === 'general' || form.dataset.group === 'marketData') updateEstimate(); })
        .catch(function (err) { toast(err.message, 'err'); })
        .finally(function () { busy(btn, false); });
    });
    form.addEventListener('input', function () { if (form.dataset.group === 'marketData') updateEstimate(); });
  });

  // Test buttons save the form first so the test uses what is on screen.
  $$('[data-test]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var form = btn.closest('form');
      busy(btn, true);
      saveForm(form)
        .then(function () { return api('POST', '/test/' + btn.dataset.test); })
        .then(function (res) { reportTest(btn.dataset.test, res); })
        .catch(function (err) { toast(err.message, 'err'); })
        .finally(function () { busy(btn, false); });
    });
  });

  function reportTest(kind, res) {
    if (kind === 'telegram') toast('Test message sent to ' + res.channel + ' by ' + res.bot, 'ok');
    if (kind === 'market-data') {
      var u = res.usage || {};
      toast('Connected ✓ EUR/USD = ' + res.eurUsd + (u.plan_limit ? ' · credits used this minute: ' + u.current_usage + '/' + u.plan_limit : ''), 'ok');
    }
    if (kind === 'openai') fillModels(res);
  }

  function fillModels(res) {
    var list = $('#modelList');
    list.innerHTML = res.models.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
    toast('OpenAI key works ✓ ' + res.models.length + ' models available' + (res.selectedAvailable ? '' : ' — selected model NOT available for this key'), res.selectedAvailable ? 'ok' : 'err');
  }

  $('#loadModels').addEventListener('click', function () {
    var btn = this, form = btn.closest('form');
    busy(btn, true);
    saveForm(form).then(function () { return api('POST', '/test/openai'); }).then(fillModels)
      .catch(function (err) { toast(err.message, 'err'); }).finally(function () { busy(btn, false); });
  });

  $('#resetPrompt').addEventListener('click', function () {
    $('[name=systemPrompt]').value = state.defaultPrompt;
    toast('Default prompt restored — press Save to apply');
  });

  // ---------- dashboard ----------
  function renderBotPill() {
    var g = state.settings && state.settings.general;
    if (!g) return;
    var pill = $('#botPill');
    pill.classList.toggle('on', g.botEnabled);
    $('span', pill).textContent = (g.botEnabled ? 'Running' : 'Stopped') + ' · ' + (g.mode === 'AI' ? 'AI mode' : 'Custom mode');
  }

  function loadDashboard() {
    return api('GET', '/dashboard').then(function (d) {
      state.dashboard = d;
      var s = d.stats;
      $('#kBot').textContent = d.scanning ? 'Scanning…' : d.botEnabled ? 'Running' : 'Stopped';
      $('#kBot').className = d.botEnabled || d.scanning ? 'on' : 'off';
      $('#kMode').textContent = (d.mode === 'AI' ? 'AI mode' : 'Custom mode') + ' · ' + d.timeframe + ' · ' + d.enabledPairs + ' pairs';
      $('#kToday').textContent = s.today;
      $('#kTotal').textContent = s.total + ' total';
      $('#kWin').textContent = s.winRate == null ? '—' : s.winRate + '%';
      $('#kWL').textContent = s.wins + ' wins · ' + s.losses + ' losses · ' + (s.pips >= 0 ? '+' : '') + s.pips + ' pips';
      $('#kOpen').textContent = s.open;
      $('#kNext').textContent = d.nextRunAt ? 'next scan ' + ago(d.nextRunAt) : 'auto-scan off';
      $('#kLast').textContent = 'last scan ' + ago(d.lastScanAt);

      var setup = [];
      if (!d.setup.marketData) setup.push(['Add your Twelve Data API key to load market candles.', 'marketData']);
      if (!d.setup.openai && d.mode === 'AI') setup.push(['AI mode needs an OpenAI API key.', 'ai']);
      if (!d.setup.telegram) setup.push(['Connect the Telegram bot token and channel ID.', 'telegram']);
      if (!d.setup.landing) setup.push(['Set the signals channel and support links shown on the website.', 'landing']);
      if (!d.botEnabled) setup.push(['The bot is stopped, so scheduled scans will not run.', 'general']);
      if (d.pendingAccess) setup.push([d.pendingAccess + ' channel access request' + (d.pendingAccess > 1 ? 's are' : ' is') + ' waiting for your approval.', 'access']);
      renderAccessBadge(d.pendingAccess);
      $('#setupList').innerHTML = setup.map(function (x) { return '<div class="setup-item">⚠ ' + esc(x[0]) + '<a href="#' + x[1] + '">Fix →</a></div>'; }).join('');

      $('#activity').innerHTML = d.activity.length
        ? d.activity.map(function (a) {
            return '<div class="log-row lv-' + a.level + '"><time>' + new Date(a.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '</time><i></i><span>' + esc(a.message) + '</span></div>';
          }).join('')
        : '<p class="muted">No activity yet. Press "Run scan now" or enable the bot.</p>';
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  setInterval(function () { if (!$('[data-page=dashboard]').hidden && !document.hidden) loadDashboard(); }, 5000);

  $('#scanBtn').addEventListener('click', function () {
    var btn = this;
    busy(btn, true);
    api('POST', '/scan').then(function (res) {
      toast(res.message, res.ok ? 'ok' : 'err');
      location.hash = '#dashboard';
      setTimeout(loadDashboard, 600);
    }).catch(function (err) { toast(err.message, 'err'); }).finally(function () { busy(btn, false); });
  });

  // ---------- pairs ----------
  function loadPairs() {
    return api('GET', '/pairs').then(function (pairs) {
      state.pairs = pairs;
      renderPairs();
      fillPairFilter();
    });
  }

  function renderPairs() {
    var on = state.pairs.filter(function (p) { return p.enabled; }).length;
    $('#pairsCount').textContent = on + ' of ' + state.pairs.length + ' enabled';
    $('#pairsGrid').innerHTML = state.pairs.map(function (p) {
      return '<div class="pair-card ' + (p.enabled ? '' : 'off') + '">' +
        '<div><b>' + esc(p.symbol) + '</b><small>' + (p.lastSignalAt ? 'last signal ' + ago(p.lastSignalAt) : 'no signals yet') + '</small></div>' +
        '<div class="acts"><button class="btn btn-ghost btn-sm" data-preview="' + p.id + '">Analyze</button>' +
        '<button class="mini-switch ' + (p.enabled ? 'on' : '') + '" data-toggle="' + p.id + '" aria-label="Toggle ' + esc(p.symbol) + '"></button></div></div>';
    }).join('');
  }

  $('#pairsGrid').addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]');
    if (t) {
      var pair = state.pairs.find(function (p) { return p.id === Number(t.dataset.toggle); });
      api('PATCH', '/pairs/' + pair.id, { enabled: !pair.enabled }).then(function (p) {
        pair.enabled = p.enabled; renderPairs(); updateEstimate();
      }).catch(function (err) { toast(err.message, 'err'); });
      return;
    }
    var pv = e.target.closest('[data-preview]');
    if (pv) preview(Number(pv.dataset.preview));
  });

  $$('[data-pairs-all]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      api('POST', '/pairs/all', { enabled: btn.dataset.pairsAll === 'true' }).then(function (pairs) { state.pairs = pairs; renderPairs(); updateEstimate(); });
    });
  });

  function preview(id, mode) {
    var pair = state.pairs.find(function (p) { return p.id === id; });
    var currentMode = mode || state.settings.general.mode;
    openModal('<h3>' + esc(pair.symbol) + ' — analyzing…</h3><div class="spinner"></div><p class="muted" style="text-align:center">Fetching candles' + (currentMode === 'AI' ? ' and asking the AI' : '') + '. This can take up to a minute on the free data plan.</p>');
    api('POST', '/pairs/' + id + '/preview', { mode: currentMode }).then(function (r) {
      var i = r.idea;
      var other = r.mode === 'AI' ? 'CUSTOM' : 'AI';
      var passed = i.direction !== 'NONE' && i.confidence >= r.minConfidence;
      var html = '<h3>' + esc(r.pair) + ' <span class="tag ' + i.direction + '">' + (i.direction === 'NONE' ? 'NO TRADE' : i.direction) + '</span><span class="tag">' + (r.mode === 'AI' ? 'AI mode' : 'Custom mode') + '</span>' +
        (r.marketClosed ? '<span class="tag BE">market closed — preview only</span>'
          : i.direction !== 'NONE' ? '<span class="tag ' + (passed ? 'TP1' : 'BE') + '">' + (passed ? 'would be posted' : 'below ' + r.minConfidence + '% — would be skipped') + '</span>' : '') + '</h3>' +
        '<img src="' + r.chart + '" alt="chart" />';
      if (i.direction !== 'NONE') {
        html += '<div class="modal-kv">' +
          kv('Entry', price(r.pair, i.entry)) +
          kv('TP1', price(r.pair, i.takeProfit1) + ' (+' + pips(r.pair, i.takeProfit1 - i.entry) + ')') +
          kv('TP2', price(r.pair, i.takeProfit2) + ' (+' + pips(r.pair, i.takeProfit2 - i.entry) + ')') +
          kv('Stop loss', price(r.pair, i.stopLoss) + ' (−' + pips(r.pair, i.entry - i.stopLoss) + ')') +
          kv('Confidence', i.confidence + '%') + '</div>';
      }
      html += '<div class="modal-reason">' + esc(i.reasoning) + '</div>' +
        '<div class="form-actions" style="margin-top:16px"><button class="btn btn-ghost" id="pvOther">Try ' + (other === 'AI' ? 'AI' : 'Custom') + ' mode</button></div>';
      openModal(html);
      $('#pvOther').addEventListener('click', function () { preview(id, other); });
    }).catch(function (err) {
      openModal('<h3>' + esc(pair.symbol) + '</h3><div class="alert alert-error" style="margin-top:14px">' + esc(err.message) + '</div>');
    });
  }
  function kv(k, v) { return '<div><small>' + k + '</small><b>' + v + '</b></div>'; }

  // ---------- market data credit estimate ----------
  function updateEstimate() {
    if (!state.settings) return;
    var g = state.settings.general, ai = state.settings.ai;
    var form = $('form[data-group=marketData]');
    var rpm = Number($('[name=requestsPerMinute]', form).value) || state.settings.marketData.requestsPerMinute;
    var pairs = state.pairs.length ? state.pairs.filter(function (p) { return p.enabled; }).length : 17;
    var perPair = g.mode === 'AI' && ai.useHigherTimeframe && g.timeframe !== '4h' ? 2 : 1;
    var perScan = pairs * perPair + Math.min(pairs, 5);
    var sessionHours = g.sessions.length ? Math.min(24, g.sessions.length * 9 - (g.sessions.indexOf('london') > -1 && g.sessions.indexOf('newyork') > -1 ? 4 : 0)) : 24;
    var perDay = Math.round(perScan * (60 / g.scanIntervalMinutes) * sessionHours);
    var scanMinutes = Math.ceil(perScan / rpm);
    $('#estimate').innerHTML =
      '<div>Each scan uses about <b>' + perScan + ' requests</b> (' + pairs + ' pairs × ' + perPair + (perPair > 1 ? ' incl. higher timeframe' : '') + ' + result tracking).</div>' +
      '<div>At ' + rpm + ' req/min one scan takes about <b>' + scanMinutes + ' min</b>' + (scanMinutes >= g.scanIntervalMinutes ? ' <span class="bad">— longer than the scan interval; scans will overlap and be skipped</span>' : '') + '.</div>' +
      '<div>Estimated usage: <b>~' + perDay.toLocaleString() + ' requests/day</b> over ~' + sessionHours + ' active hours' + (perDay > 800 ? ' <span class="bad">— more than the free 800/day; reduce pairs, increase the interval or upgrade</span>' : ' ✓ fits the free plan') + '.</div>';
  }

  // ---------- telegram channel detection ----------
  function checkChannelId() {
    var v = $('[name=channelId]').value.trim(), hint = $('#channelHint');
    var bad = /^\d+$/.test(v) ? 'This looks like a personal user ID. A channel ID is negative and starts with -100.'
      : /^-\d+$/.test(v) && v.indexOf('-100') !== 0 ? 'Private channel IDs start with -100 (e.g. -100' + v.slice(1) + ').'
      : /t\.me\//.test(v) ? 'This is a link, not an ID. Use the detected channel below, or -100… / @name.' : '';
    hint.textContent = bad || 'The channel where signals are posted. Easiest: pick it from the detected channels below.';
    hint.classList.toggle('warn-text', !!bad);
  }
  $('[name=channelId]').addEventListener('input', checkChannelId);

  function loadChats() {
    api('GET', '/telegram/chats').then(function (chats) {
      var current = $('[name=channelId]').value.trim();
      $('#detectedChats').innerHTML = chats.length ? chats.map(function (c) {
        var isAdmin = c.status === 'administrator' || c.status === 'creator';
        var gone = c.status === 'left' || c.status === 'kicked';
        return '<div class="chat-row ' + (current === c.id ? 'current' : '') + '"><div><b>' + esc(c.title || '(no title)') + '</b><small>' + esc(c.id) + ' · ' + esc(c.type) + ' · ' +
          (isAdmin ? '✅ bot is admin' : gone ? '❌ bot removed' : c.status === 'seen' ? 'post seen' : '⚠ bot is not admin') + '</small></div>' +
          (gone ? '' : current === c.id ? '<span class="tag TP1">in use</span>' : '<button type="button" class="btn btn-primary btn-sm" data-use-chat="' + esc(c.id) + '">Use</button>') + '</div>';
      }).join('') : '<p class="muted">No channels detected yet. Make sure the bot token is saved, add the bot as admin of your channel, then post any message in the channel and press Refresh.</p>';
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  $('#refreshChats').addEventListener('click', loadChats);
  $('#detectedChats').addEventListener('click', function (e) {
    var b = e.target.closest('[data-use-chat]');
    if (!b) return;
    var form = $('form[data-group=telegram]');
    $('[name=channelId]', form).value = b.dataset.useChat;
    saveForm(form).then(function () { toast('Channel saved ✓ — press "Send test message" to check', 'ok'); loadChats(); checkChannelId(); })
      .catch(function (err) { toast(err.message, 'err'); });
  });

  // ---------- bot welcome ----------
  function loadBot() {
    api('GET', '/bot').then(function (b) {
      var st = b.status, langs = { en: 0, ru: 0, es: 0 };
      b.byLang.forEach(function (r) { if (r.language) langs[r.language] = r.count; });
      $('#botKpis').innerHTML =
        '<div class="kpi"><small>Bot chat</small><b class="' + (st.polling ? 'on' : 'off') + '">' + (st.polling ? 'Online' : 'Offline') + '</b><span>' + (st.botUsername ? '@' + esc(st.botUsername) : 'set the bot token in Telegram settings') + '</span></div>' +
        '<div class="kpi"><small>Users</small><b>' + b.total + '</b><span>started the bot</span></div>' +
        '<div class="kpi"><small>Languages</small><b>' + langs.ru + ' / ' + langs.en + ' / ' + langs.es + '</b><span>RU / EN / ES</span></div>';
      $('#botError').hidden = !st.lastError;
      $('#botError').textContent = st.lastError || '';
      $('#botLink').hidden = !st.botUsername;
      if (st.botUsername) $('#botLink').href = 'https://t.me/' + st.botUsername;
      $('#botUsersTotal').textContent = b.total > 20 ? 'latest 20 of ' + b.total : '';
      $('#botUsers').innerHTML = b.recent.length ? b.recent.map(function (u) {
        return '<tr><td>' + esc(u.firstName) + '</td><td>' + (u.username ? '<a href="https://t.me/' + esc(u.username) + '" target="_blank" rel="noopener">@' + esc(u.username) + '</a>' : '—') + '</td><td>' + (u.language ? u.language.toUpperCase() : '—') + '</td><td>' + time(u.createdAt) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty">Nobody has started the bot yet.</td></tr>';
    }).catch(function (err) { toast(err.message, 'err'); });
  }

  // ---------- news channel ----------
  var NEWS_TYPE_LABEL = { morning: 'Morning', midday: 'Midday', evening: 'Evening' };
  var NEWS_FORMAT_LABEL = { auto: 'Auto format', story: 'Story + chart', bullets: 'Key points', levels: 'Levels to watch', calendar: 'Calendar', movers: 'Top movers', quick: 'Quick take' };
  var NEWS_LANG_LABEL = { ru: 'Русский', en: 'English', es: 'Español' };

  function options(map, selected) {
    return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + map[k] + '</option>'; }).join('');
  }
  /** Checkbox chips for channels; `checked(key)` decides which are ticked. */
  function channelChips(checked) {
    var list = readChannels();
    return list.length ? list.map(function (c) {
      return '<label class="chip"><input type="checkbox" value="' + esc(c.key) + '"' + (checked(c.key) ? ' checked' : '') + ' /><span>' + esc(c.name || c.chatId || 'New channel') + '</span></label>';
    }).join('') : '<span class="muted">Add a channel first</span>';
  }
  function tickedKeys(box) {
    return $$('input[type=checkbox]:checked', box).map(function (i) { return i.value; });
  }

  // Channels: before any are added, the old single channel shows up as "main" so nothing is lost.
  function initialChannels(news) {
    if (news.channels && news.channels.length) return news.channels;
    return news.channelId ? [{ key: 'main', name: news.channelId, chatId: news.channelId, url: news.channelUrl || '', language: news.language || 'ru', enabled: true }] : [];
  }
  function channelCard(c, i) {
    return '<div class="channel-card" data-key="' + esc(c.key) + '">' +
      '<div class="channel-card-head"><b>' + esc(c.name || 'Channel ' + (i + 1)) + '</b>' +
      '<label class="switch-field mini"><input type="checkbox" data-f="enabled"' + (c.enabled !== false ? ' checked' : '') + ' /><span class="switch"></span><small>Active</small></label>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-test-channel>Send test</button>' +
      '<button type="button" class="btn btn-danger btn-sm" data-del-channel>Remove</button></div>' +
      '<div class="grid-2">' +
      '<label class="field"><span>Name</span><input type="text" data-f="name" placeholder="e.g. MultiAI News RU" value="' + esc(c.name || '') + '" /></label>' +
      '<label class="field"><span>Chat id</span><input type="text" data-f="chatId" placeholder="@channel or -100…" value="' + esc(c.chatId || '') + '" /></label>' +
      '<label class="field"><span>Public link</span><input type="url" data-f="url" placeholder="empty = t.me/ + @name" value="' + esc(c.url || '') + '" /></label>' +
      '<label class="field"><span>Post language</span><select data-f="language">' + options(NEWS_LANG_LABEL, c.language || 'ru') + '</select></label>' +
      '</div></div>';
  }
  function renderChannels(list) {
    $('#newsChannels').innerHTML = list.map(channelCard).join('') || '<p class="muted empty-channels">No channels yet — press "+ Add channel".</p>';
  }
  function readChannels() {
    return $$('#newsChannels .channel-card').map(function (r) {
      return {
        key: r.dataset.key,
        name: $('[data-f=name]', r).value.trim(),
        chatId: $('[data-f=chatId]', r).value.trim(),
        url: $('[data-f=url]', r).value.trim(),
        language: $('[data-f=language]', r).value,
        enabled: $('[data-f=enabled]', r).checked,
      };
    }).filter(function (c) { return c.chatId || c.name; });
  }
  /** "Channel shown on the website" select; keeps the current choice. */
  function renderWebsiteChannel(selected) {
    var sel = $('#newsWebsiteChannel');
    var value = selected !== undefined ? selected : sel.value;
    var list = readChannels();
    sel.innerHTML = '<option value="">First channel with a link</option>' + list.map(function (c) {
      return '<option value="' + esc(c.key) + '"' + (c.key === value ? ' selected' : '') + '>' + esc(c.name || c.chatId) + (c.url ? '' : ' (no link)') + '</option>';
    }).join('');
  }
  function channelsChanged() {
    // Keep each slot's and Try it's ticks while names/keys change.
    $$('#newsSlots .slot-row').forEach(function (r) {
      var box = $('.chips', r);
      var had = tickedKeys(box);
      var known = $$('input', box).map(function (i) { return i.value; });
      // New channels start ticked; existing ones keep their tick.
      box.innerHTML = channelChips(function (k) { return had.indexOf(k) !== -1 || known.indexOf(k) === -1; });
    });
    $$('#newsChannels .channel-card').forEach(function (card, i) {
      $('.channel-card-head b', card).textContent = $('[data-f=name]', card).value.trim() || 'Channel ' + (i + 1);
    });
    renderTargets();
    renderWebsiteChannel();
  }

  // Schedule rows: "HH:MM|type|format|key1,key2" (no keys = every channel).
  function slotRow(s) {
    var p = s.split('|');
    var keys = (p[3] || '').split(',').filter(Boolean);
    return '<div class="slot-row"><input type="time" value="' + esc(p[0]) + '" />' +
      '<select data-type>' + Object.keys(NEWS_TYPE_LABEL).map(function (k) { return '<option value="' + k + '"' + (k === p[1] ? ' selected' : '') + '>' + NEWS_TYPE_LABEL[k] + ' post</option>'; }).join('') + '</select>' +
      '<select data-format>' + options(NEWS_FORMAT_LABEL, p[2] || 'auto') + '</select>' +
      '<div class="chips">' + channelChips(function (k) { return !keys.length || keys.indexOf(k) !== -1; }) + '</div>' +
      '<button type="button" class="icon-btn" data-del-slot aria-label="Remove">✕</button></div>';
  }
  function renderSlots(slots) {
    $('#newsSlots').innerHTML = slots.map(slotRow).join('') || '<p class="muted">No posts scheduled — add one.</p>';
  }
  function readSlots() {
    var all = readChannels().map(function (c) { return c.key; });
    return $$('#newsSlots .slot-row').map(function (r) {
      var keys = tickedKeys($('.chips', r));
      // All ticked = every channel, including ones added later.
      var allTicked = all.every(function (k) { return keys.indexOf(k) !== -1; });
      if (!keys.length && all.length) throw new Error('Each scheduled post needs at least one channel ticked');
      return [$('input[type=time]', r).value, $('[data-type]', r).value, $('[data-format]', r).value, allTicked ? '' : keys.join(',')].join('|');
    }).filter(function (s) { return /^\d{2}:\d{2}\|/.test(s); });
  }
  function renderTargets() {
    var box = $('#newsTargets');
    var had = box.dataset.ready ? tickedKeys(box) : null;
    var known = box.dataset.keys ? box.dataset.keys.split(',') : [];
    box.innerHTML = channelChips(function (k) { return !had || had.indexOf(k) !== -1 || known.indexOf(k) === -1; });
    box.dataset.ready = '1';
    box.dataset.keys = readChannels().map(function (c) { return c.key; }).join(',');
  }
  $('#newsFormat').innerHTML = options(NEWS_FORMAT_LABEL, 'auto');

  function toggleNewsSources() {
    var mode = ($('form[data-group=news] [name=sourceMode]:checked') || {}).value;
    $('#newsSourcesField').hidden = mode === 'ai';
  }
  $('#addSlot').addEventListener('click', function () {
    if (!$$('#newsSlots .slot-row').length) $('#newsSlots').innerHTML = '';
    $('#newsSlots').insertAdjacentHTML('beforeend', slotRow('12:00|midday|auto|'));
  });
  $('#newsSlots').addEventListener('click', function (e) {
    if (!e.target.closest('[data-del-slot]')) return;
    e.target.closest('.slot-row').remove();
    if (!$$('#newsSlots .slot-row').length) renderSlots([]);
  });
  $('#addChannel').addEventListener('click', function () {
    var list = readChannels();
    list.push({ key: list.length ? 'ch' + Date.now().toString(36).slice(-6) : 'main', name: '', chatId: '', language: 'en', enabled: true });
    renderChannels(list);
    channelsChanged();
    $$('#newsChannels .channel-card [data-f=name]').pop().focus();
  });
  $('#newsChannels').addEventListener('input', channelsChanged);
  $('#newsChannels').addEventListener('change', channelsChanged);
  $('#newsChannels').addEventListener('click', function (e) {
    var row = e.target.closest('.channel-card');
    if (!row) return;
    if (e.target.closest('[data-del-channel]')) {
      row.remove();
      if (!$$('#newsChannels .channel-card').length) renderChannels([]);
      channelsChanged();
    } else if (e.target.closest('[data-test-channel]')) {
      var btn = e.target.closest('[data-test-channel]');
      busy(btn, true);
      saveForm($('form[data-group=news]'))
        .then(function () { return api('POST', '/news/test', { channel: row.dataset.key }); })
        .then(function (r) { toast('Test message sent to ' + r.channel + ' ✓', 'ok'); })
        .catch(function (err) { toast(err.message, 'err'); })
        .finally(function () { busy(btn, false); });
    }
  });
  $$('form[data-group=news] [name=sourceMode]').forEach(function (r) { r.addEventListener('change', toggleNewsSources); });

  /** Same rule as the website (news-channels.ts): the only channel, else the page language, else the default, else the first. */
  function newsChannelFor(lang, channels, defaultKey) {
    var list = channels.filter(function (c) { return c.enabled && c.url; }); // the server already fills url from @name
    if (list.length === 1) return list[0];
    return list.filter(function (c) { return c.language === lang; })[0] || list.filter(function (c) { return c.key === defaultKey; })[0] || list[0] || null;
  }
  function loadLandingNews() {
    api('GET', '/news').then(function (n) {
      var news = state.settings.news;
      $('#landingNews').innerHTML = ['ru', 'en', 'es'].map(function (lang) {
        var c = newsChannelFor(lang, n.channels, news.websiteChannel);
        var url = c ? c.url : news.channelUrl;
        return '<div class="news-link-row"><span class="tag">' + lang.toUpperCase() + ' page</span><span>→</span>' +
          (url ? '<b>' + esc(c ? c.name : 'News channel') + '</b><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>' : '<span class="muted">no channel link — add one on the News channel page</span>') + '</div>';
      }).join('');
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  function channelName(key) {
    var c = (state.newsChannels || []).filter(function (x) { return x.key === key; })[0];
    return c ? c.name : key;
  }
  function loadNews() {
    api('GET', '/news').then(function (n) {
      state.newsPosts = n.posts;
      state.newsChannels = n.channels;
      var filter = $('#newsChannelFilter');
      var picked = filter.value;
      filter.innerHTML = '<option value="">All channels</option>' + n.channels.map(function (c) { return '<option value="' + esc(c.key) + '"' + (c.key === picked ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
      var on = n.channels.filter(function (c) { return c.enabled; });
      $('#newsKpis').innerHTML =
        '<div class="kpi"><small>Auto-posting</small><b class="' + (n.enabled ? 'on' : 'off') + '">' + (n.enabled ? 'On' : 'Off') + '</b><span>' + (on.length ? on.length + ' channel' + (on.length > 1 ? 's' : '') + ': ' + esc(on.map(function (c) { return c.name; }).join(', ')) : 'no channel set') + '</span></div>' +
        '<div class="kpi"><small>Next post</small><b>' + (n.next ? esc(n.next.time) : '—') + '</b><span>' + (n.next ? NEWS_TYPE_LABEL[n.next.type] + ' · ' + esc(NEWS_FORMAT_LABEL[n.next.format] || '') + ' · ' + esc(state.settings.news.timezone) : 'add a time to the schedule') + '</span></div>' +
        '<div class="kpi"><small>Posted today</small><b>' + n.today + '</b><span>' + state.settings.news.slots.length + ' scheduled per day</span></div>';
      renderNewsPosts();
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  function renderNewsPosts() {
    var key = $('#newsChannelFilter').value;
    var rows = state.newsPosts.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return !key || x.p.channel === key; });
    $('#newsBody').innerHTML = rows.length ? rows.map(function (x) {
      var p = x.p;
      return '<tr data-news="' + x.i + '"><td>' + esc(p.day) + '</td><td>' + esc(p.slot.replace('now-', 'now ').slice(0, 9)) + '</td><td>' + esc(channelName(p.channel)) + '</td><td>' + (NEWS_TYPE_LABEL[p.type] || esc(p.type)) + '</td>' +
        '<td>' + esc(NEWS_FORMAT_LABEL[p.format] || p.format || '—') + '</td><td>' + esc(p.pair || '—') + '</td>' +
        '<td><span class="tag ' + esc(p.status) + '" ' + (p.error ? 'title="' + esc(p.error) + '"' : '') + '>' + esc(p.status) + '</span></td><td class="muted">' + esc((p.text || p.error || '').slice(0, 70)) + '…</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty">' + (key ? 'No posts in this channel yet.' : 'No posts yet. Press Preview to see one.') + '</td></tr>';
  }
  $('#newsChannelFilter').addEventListener('change', renderNewsPosts);
  $('#newsBody').addEventListener('click', function (e) {
    var row = e.target.closest('[data-news]');
    if (!row) return;
    var p = state.newsPosts[Number(row.dataset.news)];
    openModal('<h3>' + (NEWS_TYPE_LABEL[p.type] || '') + ' post · ' + esc(channelName(p.channel)) + ' · ' + esc(p.day) + ' <span class="tag ' + esc(p.status) + '">' + esc(p.status) + '</span></h3>' +
      (p.error ? '<div class="alert alert-error" style="margin-top:14px">' + esc(p.error) + '</div>' : '') + '<div class="news-text">' + esc(p.text) + '</div>');
  });
  /** Post HTML from the server, with only <b>/<i> let through (everything else stays escaped). */
  function telegramHtml(html) {
    return esc(html).replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>');
  }

  // Preview / Post now run as a background job on the server (AI web search can take a minute or two):
  // start it, then poll until it is done.
  function waitForJob(jobId, onTick) {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function poll() {
        api('GET', '/news/jobs/' + jobId).then(function (j) {
          if (j.status === 'done') return resolve(j.result);
          if (j.status === 'failed') return reject(new Error(j.error || 'Failed'));
          if (Date.now() - started > 300000) return reject(new Error('Still not finished after 5 minutes — check Recent posts later'));
          if (onTick) onTick(j.seconds, j.note);
          setTimeout(poll, 3000);
        }).catch(reject);
      })();
    });
  }
  function newsAction(btn, path, done, onTick) {
    var form = $('form[data-group=news]');
    var channels = tickedKeys($('#newsTargets'));
    if (!channels.length) { toast('Tick at least one channel', 'err'); return Promise.resolve(); }
    busy(btn, true);
    return saveForm(form).then(function () { return api('POST', path, { type: $('#newsType').value, format: $('#newsFormat').value, channels: channels }); })
      .then(function (r) { return r.jobId ? waitForJob(r.jobId, onTick) : r; })
      .then(done).catch(function (err) { toast(err.message, 'err'); }).finally(function () { busy(btn, false); });
  }
  $('#newsPreview').addEventListener('click', function () {
    openModal('<h3>Writing a post…</h3><div class="spinner"></div><p class="muted" style="text-align:center">The AI is researching today\'s news. This usually takes 30–90 seconds. <span id="newsElapsed"></span></p>');
    newsAction(this, '/news/preview', function (r) {
      openModal('<h3>Preview · ' + esc(NEWS_FORMAT_LABEL[r.format] || r.format) + ' · ' + esc(r.pair) + ' <span class="tag">not posted</span></h3><p class="muted">As ' + esc(r.channel) + ' would get it</p>' +
        (r.image ? '<img src="' + r.image + '" alt="post image" />' : '') + '<div class="news-text">' + telegramHtml(r.html) + '</div>');
    }, function (s, note) { var el = $('#newsElapsed'); if (el) el.textContent = '(' + s + 's' + (note ? ' · ' + note : '') + ')'; }).then(function () { if (/Writing/.test(($('#modalBody h3') || {}).textContent || '')) closeModal(); });
  });
  $('#newsPostNow').addEventListener('click', function () {
    toast('Writing and posting — this takes about a minute…');
    newsAction(this, '/news/post-now', function (r) {
      if (r.failed && r.failed.length) toast('Posted to ' + r.posted + ' channel(s); failed: ' + r.failed.join('; '), 'err');
      else toast('Posted to ' + r.posted + ' channel' + (r.posted > 1 ? 's' : '') + ' ✓', 'ok');
      loadNews();
    });
  });

  // ---------- channel access ----------
  var ACCESS_LABEL = { awaiting_id: 'waiting for ID', pending: 'pending', approved: 'approved', rejected: 'rejected' };

  function renderAccessBadge(n) {
    $('#accessBadge').hidden = !n;
    $('#accessBadge').textContent = n || '';
  }

  function renderJoinLink() {
    var link = state.settings.access.joinLink;
    $('#joinLink').textContent = link || 'not generated yet';
    $('#joinLink').classList.toggle('muted', !link);
  }

  function loadAccess() {
    renderJoinLink();
    api('GET', '/access/requests?status=' + encodeURIComponent($('#accStatus').value)).then(function (r) {
      var c = r.counts;
      renderAccessBadge(c.pending || 0);
      $('#accKpis').innerHTML =
        '<div class="kpi"><small>Pending</small><b>' + (c.pending || 0) + '</b><span>waiting for you</span></div>' +
        '<div class="kpi"><small>Approved</small><b class="on">' + (c.approved || 0) + '</b><span>have channel access</span></div>' +
        '<div class="kpi"><small>Rejected</small><b>' + (c.rejected || 0) + '</b><span>' + (c.awaiting_id || 0) + ' still sending their ID</span></div>';
      $('#accBody').innerHTML = r.items.length ? r.items.map(function (u) {
        var canApprove = u.accessStatus !== 'approved' && u.pocketId;
        var canReject = u.accessStatus === 'pending' || u.accessStatus === 'approved';
        return '<tr><td>' + esc(u.firstName) + '</td><td>' + (u.username ? '<a href="https://t.me/' + esc(u.username) + '" target="_blank" rel="noopener">@' + esc(u.username) + '</a>' : '—') + '</td>' +
          '<td>' + (u.pocketId ? '<code>' + esc(u.pocketId) + '</code>' : '—') + '</td><td><span class="tag ' + u.accessStatus + '">' + ACCESS_LABEL[u.accessStatus] + '</span></td>' +
          '<td>' + time(u.requestedAt) + '</td><td>' + (u.joinedAt ? '✓ ' + time(u.joinedAt) : '—') + '</td>' +
          '<td><div class="row-actions">' +
          (canApprove ? '<button class="btn btn-primary btn-sm" data-acc="approve" data-user="' + esc(u.id) + '">Approve</button>' : '') +
          (canReject ? '<button class="btn btn-ghost btn-sm" data-acc="reject" data-user="' + esc(u.id) + '">Reject</button>' : '') +
          '</div></td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">No requests here.</td></tr>';
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  $('#accStatus').addEventListener('change', loadAccess);
  $('#accBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-acc]');
    if (!b) return;
    busy(b, true);
    api('POST', '/access/' + b.dataset.user + '/' + b.dataset.acc).then(function () {
      toast(b.dataset.acc === 'approve' ? 'Approved ✓ — the join link was sent to the user' : 'Rejected — the user was told to register with your link', 'ok');
      return api('GET', '/settings').then(function (res) { state.settings = res.settings; loadAccess(); });
    }).catch(function (err) { toast(err.message, 'err'); busy(b, false); });
  });
  $('#genJoinLink').addEventListener('click', function () {
    var btn = this;
    busy(btn, true);
    api('POST', '/access/join-link').then(function (res) {
      state.settings = res.settings;
      renderJoinLink();
      toast('New join link created ✓', 'ok');
    }).catch(function (err) { toast(err.message, 'err'); }).finally(function () { busy(btn, false); });
  });

  // ---------- signals ----------
  function fillPairFilter() {
    var sel = $('#fPair'), cur = sel.value;
    sel.innerHTML = '<option value="">All pairs</option>' + state.pairs.map(function (p) { return '<option>' + esc(p.symbol) + '</option>'; }).join('');
    sel.value = cur;
  }

  function loadSignals() {
    if (!state.pairs.length) loadPairs();
    var q = '?page=' + state.signalsPage + '&status=' + encodeURIComponent($('#fStatus').value) + '&pair=' + encodeURIComponent($('#fPair').value);
    api('GET', '/signals' + q).then(function (r) {
      state.signals = r.items;
      $('#sigTotal').textContent = r.total + ' signals';
      $('#sigBody').innerHTML = r.items.length ? r.items.map(function (s) {
        return '<tr data-sig="' + s.id + '"><td>' + time(s.createdAt) + '</td><td><b>' + esc(s.pair) + '</b></td><td><span class="tag ' + s.direction + '">' + s.direction + '</span></td>' +
          '<td>' + price(s.pair, s.entry) + '</td><td>' + price(s.pair, s.takeProfit1) + ' / ' + price(s.pair, s.takeProfit2) + '</td><td>' + price(s.pair, s.stopLoss) + '</td>' +
          '<td>' + s.confidence + '%</td><td>' + (s.mode === 'AI' ? 'AI' : 'Custom') + '</td><td><span class="tag ' + s.status + '">' + s.status + '</span></td>' +
          '<td>' + (s.error ? '<span title="' + esc(s.error) + '">⚠</span>' : s.telegramMessageId ? '✓' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="10" class="empty">No signals yet.</td></tr>';
      var pager = '';
      for (var i = 1; i <= r.pages && r.pages > 1; i++) pager += '<button class="btn btn-sm ' + (i === r.page ? 'btn-primary' : 'btn-ghost') + '" data-page-num="' + i + '">' + i + '</button>';
      $('#pager').innerHTML = pager;
    }).catch(function (err) { toast(err.message, 'err'); });
  }
  $('#fStatus').addEventListener('change', function () { state.signalsPage = 1; loadSignals(); });
  $('#fPair').addEventListener('change', function () { state.signalsPage = 1; loadSignals(); });
  $('#pager').addEventListener('click', function (e) { var b = e.target.closest('[data-page-num]'); if (b) { state.signalsPage = Number(b.dataset.pageNum); loadSignals(); } });

  $('#sigBody').addEventListener('click', function (e) {
    var row = e.target.closest('[data-sig]');
    if (!row) return;
    var s = state.signals.find(function (x) { return x.id === Number(row.dataset.sig); });
    var html = '<h3>#' + s.id + ' ' + esc(s.pair) + ' <span class="tag ' + s.direction + '">' + s.direction + '</span><span class="tag ' + s.status + '">' + s.status + '</span></h3>' +
      (s.imageFile ? '<img src="/admin/api/signals/' + s.id + '/chart" alt="chart" />' : '<p class="muted" style="margin:14px 0">No chart stored.</p>') +
      '<div class="modal-kv">' + kv('Created (UTC)', time(s.createdAt)) + kv('Entry', price(s.pair, s.entry)) + kv('TP1', price(s.pair, s.takeProfit1)) + kv('TP2', price(s.pair, s.takeProfit2)) +
      kv('Stop loss', price(s.pair, s.stopLoss)) + kv('Confidence', s.confidence + '%') + kv('Mode / TF', (s.mode === 'AI' ? 'AI' : 'Custom') + ' · ' + s.timeframe) + kv('Closed', time(s.closedAt)) + '</div>' +
      (s.reasoning ? '<div class="modal-reason">' + esc(s.reasoning) + '</div>' : '') +
      (s.error ? '<div class="alert alert-error" style="margin-top:14px">Telegram error: ' + esc(s.error) + '</div>' : '') +
      '<div class="form-actions" style="margin-top:16px"><button class="btn btn-ghost" id="resendBtn">Resend to Telegram</button></div>';
    openModal(html);
    $('#resendBtn').addEventListener('click', function () {
      var btn = this; busy(btn, true);
      api('POST', '/signals/' + s.id + '/resend').then(function () { toast('Signal re-sent ✓', 'ok'); closeModal(); loadSignals(); })
        .catch(function (err) { toast(err.message, 'err'); }).finally(function () { busy(btn, false); });
    });
  });

  // ---------- modal ----------
  function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  // ---------- boot ----------
  Promise.all([api('GET', '/settings'), api('GET', '/pairs')]).then(function (res) {
    state.settings = res[0].settings;
    state.defaultPrompt = res[0].defaultSystemPrompt;
    state.pairs = res[1];
    $$('form[data-group]').forEach(fillForm);
    renderBotPill();
    fillPairFilter();
    route();
  }).catch(function (err) { toast(err.message, 'err'); });
})();
