// SAT QUEST builder integration: wallet, Arctic mission, autosave/restore, timer, scoring, submission.
// Loaded by advanced.html. Hooks are called from rocketscientist.js / rocketscientist.builder.js.
(function () {
  var Core = window.SQCore, P = window.SQPrices, C = window.SQ || {};
  var session = Core.session();
  if (!session) { location.replace('index.html'); return; }   // nobody has pressed Begin Mission yet

  var rs = null, ready = false, finished = !!session.done, tick = null;
  var SCORE_BIAS = 126;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function $(id) { return document.getElementById(id); }
  function fmt(t) { t = Math.max(0, t); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  function num(x) { return Math.round(x * 100) / 100; }
  function left() { return Math.max(0, Core.limitSec() - Core.elapsedSec(session)); }

  // ---------- selected components ----------
  function slotKeys(r) {
    var out = [];
    for (var s in (r.choices.slots || {})) (r.choices.slots[s] || []).forEach(function (k) { out.push(k); });
    return out;
  }
  function purchases(r) {
    var list = [], d = r.data, c = r.choices;
    function add(cat, key, name, qty, unit) { list.push({category: cat, key: key, name: name, qty: qty, unitCost: num(unit), total: num(unit * qty)}); }
    if (c.bussize) add('Satellite size', c.bussize, c.bussize + ' satellite', 1, d.bus[c.bussize].cost.value);
    if (c.orbit) add('Orbit', c.orbit, d.orbit[c.orbit].title, 1, 0);
    var counts = {}; slotKeys(r).forEach(function (k) { counts[k] = (counts[k] || 0) + 1; });
    Object.keys(counts).forEach(function (k) {
      var p = d['package'][k] || d.power[k];
      add(d['package'][k] ? 'Instrument' : 'Power', k, p.title || k, counts[k], p.cost.value);
    });
    if (c['solar-panel'] > 0) add('Power', 'solar-panel', d.power['solar-panel'].title, c['solar-panel'], d.power['solar-panel'].cost.value);
    if (c['solar-panel-surface']) add('Power', 'solar-panel-surface', d.power['solar-panel-surface'].title, 1, d.power['solar-panel-surface'].cost.value);
    var names = {firststage: 'Rocket first stage', secondstage: 'Rocket second stage', thirdstage: 'Rocket third stage', payloadbay: 'Rocket fairing'};
    r.stages.forEach(function (s) {
      var st = c[s];
      if (st && st.key !== 'None') add('Rocket', s + ':' + st.key, names[s] + ' (dia ' + st.diameter.value + ' m)', 1, st.cost.value);
    });
    return list;
  }
  function selectedKeys(r) {
    var set = {}, c = r.choices, d = r.data;
    if (c.bussize) set['bus:' + c.bussize] = 1;
    if (c.orbit) set['orbit:' + c.orbit] = 1;
    slotKeys(r).forEach(function (k) { set[(d['package'][k] ? 'pkg:' : 'pwr:') + k] = 1; });
    if (c['solar-panel'] > 0) set['pwr:solar-panel'] = 1;
    if (c['solar-panel-surface']) set['pwr:solar-panel-surface'] = 1;
    if (c.firststage && c.firststage.key !== 'None') set['fs:' + c.firststage.key] = 1;
    if (c.payloadbay && c.payloadbay.key !== 'None') set['pb:' + c.payloadbay.key] = 1;
    return set;
  }
  // Score = points for each selected sheet item + deduction for each "missed" item (sheet columns G and H).
  function scoreOf(r) {
    var sel = selectedKeys(r), total = 0, lines = [];
    P.rows.forEach(function (row) {
      var hit = row.keys.some(function (k) { return sel[k]; });
      if (hit && row.pts) { total += row.pts; lines.push({item: row.name, category: row.category, points: row.pts, why: 'selected'}); }
      if (!hit && row.miss) { total += row.miss; lines.push({item: row.name, category: row.category, points: row.miss, why: 'missed'}); }
    });
    total += SCORE_BIAS;

    lines.push({
      item: 'Base Score Adjustment',
      category: 'Scoring Adjustment',
      points: SCORE_BIAS,
      why: 'bias'
    });
    return {score: total, breakdown: lines};
  }

  // ---------- result / submission payload ----------
  function buildResult(r, status) {
    var sc = scoreOf(r), p = purchases(r), c = r.choices;
    var spent = num(r.totals.cost.value), checks = [], seen = {};
    (r.requirements || []).forEach(function (q) { if (q.label && !seen[q.label]) { seen[q.label] = 1; checks.push({label: q.label, met: !!q.met}); } });
    var el = Core.elapsedSec(session);
    return {
      id: session.id, team: session.team, submittedAt: new Date().toISOString(),
      startingCoins: session.coins, coinsSpent: spent, coinsRemaining: num(session.coins - spent),
      timeTakenSec: el, timeLeftSec: Math.max(0, Core.limitSec() - el),
      score: sc.score, scoreBreakdown: sc.breakdown,
      launchStatus: status,                       // launched | result_screen | timed_out
      launchCompleted: status === 'launched',
      orbit: c.orbit || '',
      satellite: {size: c.bussize || '', instruments: p.filter(function (x) { return x.category === 'Instrument'; }),
                  power: p.filter(function (x) { return x.category === 'Power'; }),
                  totalMassKg: num(r.totals.mass.value), powerNeededW: num(r.totals.power.value), powerAvailableW: num(r.power.value)},
      rocket: {stages: p.filter(function (x) { return x.category === 'Rocket'; }), stable: !!c.stable, enoughDeltaV: !!c.fueled, fairingFitsSatellite: !!c.bigenough},
      purchases: p, engineeringChecks: checks,
      design: designState(r)
    };
  }

  // ---------- saved design ----------
  function designState(r) {
    var st = {};
    (r.stages || []).forEach(function (s) { var sl = r.sliders && r.sliders[r.stageslookup[s]]; if (sl) st[s] = sl.selected; });
    return {bus: r.choices.bussize || '', orbit: r.choices.orbit || '', slots: JSON.parse(JSON.stringify(r.choices.slots || {})),
            solar: r.choices['solar-panel'] || 0, surface: !!r.choices['solar-panel-surface'], stages: st,
            section: r.sections[r.currentsection] || 'bus', savedAt: Date.now()};
  }
  function click(sel, r, mode) {
    var b = document.querySelector(sel);
    if (b) r.addPackage({currentTarget: b}, mode);
    return !!b;
  }

  // ---------- UI ----------
  function toast(msg) {
    var t = $('sqToast');
    if (!t) { t = document.createElement('div'); t.id = 'sqToast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.className = ''; }, 3200);
  }
  function wallet() {
    if (!rs) return;
    var rem = num(session.coins - rs.totals.cost.value), w = $('sqCoins');
    if (w) { w.textContent = rem; w.parentNode.className = 'sq-wallet' + (rem <= 0 ? ' empty' : ''); }
  }
  function buildHud() {
    var bar = document.querySelector('#bar .barmenu') || $('bar');
    if (!bar || $('sqHud')) return;
    var h = document.createElement('div'); h.id = 'sqHud'; h.className = 'baritem sq-hud';
    h.innerHTML = '<div class="sq-wallet" title="Coins left to spend"><span class="coin-icon"></span><b id="sqCoins">0</b><small>coins left</small></div>' +
                  '<div id="sqTimer" title="Time left"><span class="tm">' + fmt(left()) + '</span><small>' + esc(session.team) + '</small></div>';
    bar.appendChild(h);
  }
  function runTimer() {
    tick = setInterval(function () {
      if (finished) { clearInterval(tick); return; }
      var l = left(), t = document.querySelector('#sqTimer .tm'), box = $('sqTimer');
      if (t) t.textContent = fmt(l);
      if (box) box.className = l <= 60 ? 'danger' : l <= 300 ? 'warn' : '';
      if (l <= 0 && rs) SQGame.finish(rs, true);
    }, 500);
  }

  var SQGame = {
    toast: toast,
    launchPage: function () { return C.LAUNCH_PAGE || ''; },

    // Called first thing in init_after: prices, mission and wallet must exist before anything is wired.
    prepare: function (r) {
      rs = r;
      P.apply(r.data);
      var m = r.data.scenarios.COMMS.missions[0];
      m.title = 'Operation Arctic Lifeline';
      m.budget = new Convertable(session.coins, 'credits', 'currency');
      m.requires = [   // engineering checks: shown as information only, never block launch
        {type: 'package', oneof: ['internet-en'], label: 'An internet encoder to move heavy climate data', error: 'No internet encoder.'},
        {type: 'package', oneof: ['dish-large', 'dish-medium', 'dish-small', 'radio-antenna-cube'], label: 'A dish or antenna to beam the signal', error: 'No dish or antenna.'},
        {type: 'orbit', oneof: ['LEO', 'MEO', 'HEO'], label: 'An orbit that can reach the Arctic (inclined or polar)', error: 'Orbit cannot reach the Arctic.'},
        {type: 'power', oneof: ['solar-panel', 'solar-panel-surface', 'rtg'], label: 'A power source', error: 'No power source.'},
        {type: 'power', oneof: ['battery-small', 'battery-medium', 'battery-large', 'rtg'], label: 'Backup power for eclipse periods', error: 'No backup power.'}
      ];
      r.wallet = session.coins;
      r.updateConvertables();
      buildHud(); runTimer();
    },

    // Called at the end of init_after: rebuild the saved design by replaying it through the builder's own handlers.
    restore: function (r) {
      var d = Core.design();
      r.restoring = true;
      try {
        if (d && d.bus && r.data.bus[d.bus]) {
          r.setBus(d.bus);
          if (d.orbit && r.data.orbit[d.orbit]) r.setOrbit(d.orbit);
          Object.keys(d.slots || {}).forEach(function (size) {
            (d.slots[size] || []).forEach(function (k) {
              if (r.data['package'][k]) click('#instrument_list li[data-package="' + k + '"] button.add', r, 'instrument');
              else if (r.data.power[k]) click('#power_list li[data-package="' + k + '"] button.add', r, 'power');
            });
          });
          for (var i = 0; i < (d.solar || 0); i++) click('#power_list li[data-package="solar-panel"] button.add', r, 'power');
          if (d.surface) click('#power_list li[data-package="solar-panel-surface"] button.add', r, 'power');
          Object.keys(d.stages || {}).forEach(function (s) {
            var sl = r.sliders[r.stageslookup[s]], i = d.stages[s];
            if (sl && r.data[s][i]) { sl.setSelected(i); sl.resize(); r.setStage(s, i); }
          });
          var target = r.sections.indexOf(d.section);
          for (var n = r.currentsection; n < target; n++) {   // walk forward through the real navigation links
            var a = document.querySelector('#' + r.sections[n] + ' .next a');
            if (a) { a.classList.remove('disabled'); r.navigate({currentTarget: a, preventDefault: function () {}}); }
          }
        }
      } catch (e) { console.log('restore failed', e); }
      r.restoring = false;
      ready = true;
      r.updateTotals();          // refresh wallet from restored state
      r.updateRequirements();
      r.updateNavigation();
      SQGame.settle(r, false);
      if (finished) SQGame.showResult(session.result, true);
      else if (location.hash === '#launched' && C.LAUNCH_PAGE) { history.replaceState(null, '', location.pathname); SQGame.finish(r, false, true); }
      Core.flush(statusLine);
    },

    // Every updateTotals() lands here: refresh wallet and autosave.
    onChange: function (r) {
      wallet();
      if (!ready || r.restoring || finished) return;
      Core.saveDesign(designState(r));
    },
    saveNow: function (r) { if (ready && !finished) Core.saveDesign(designState(r)); },
    beforeLaunch: function (r) { SQGame.saveNow(r); session.launching = true; Core.saveSession(session); },

    launchText: function () {
      // Keep the participant-facing launch screen free of scoring criteria and checklists.
      return '<p>Your satellite is ready for launch. Review your design, then proceed when your team is ready.</p>';
    },

    finish: function (r, timedOut, launched) {
      if (finished) return;
      var status = timedOut ? 'timed_out' : (launched ? 'launched' : 'result_screen');
      session.finishedAt = Date.now();
      var res = buildResult(r, status);
      finished = true; clearInterval(tick);
      session.done = true; session.result = res; Core.saveSession(session);
      Core.queue(res);
      SQGame.showResult(res, false);
      Core.flush(statusLine);
    },

    // Phones only (see CSS): sections that are not on screen stop counting toward the page height,
    // so the page ends where the current section ends. Also returns to the top on every step.
    settle: function (r, toTop) {
      clearTimeout(SQGame._st);
      var cur = r.sections[r.currentsection];
      var el = document.getElementById(cur); if (el) el.classList.remove('sq-off');
      if (toTop) window.scrollTo(0, 0);
      SQGame._st = setTimeout(function () {
        r.sections.forEach(function (id) {
          var e = document.getElementById(id); if (!e) return;
          // a finished slide animation leaves a transform behind, which stops the nav pills from staying pinned
          e.classList.remove('slideInRight', 'slideInLeft', 'slideOutLeft', 'slideOutRight');
          if (id !== r.sections[r.currentsection]) e.classList.add('sq-off');
        });
      }, 700);
    },

    showResult: function (res, restored) {
      if (!res) return;
      var o = $('sqResult'); if (o) o.remove();
      o = document.createElement('div'); o.id = 'sqResult';
      function items(list) {
        return list && list.length ? '<ul>' + list.map(function (x) { return '<li>' + esc(x.name) + (x.qty > 1 ? ' &times;' + x.qty : '') + '</li>'; }).join('') + '</ul>' : '<p class="sqmuted">None</p>';
      }
      var sat = res.satellite || {}, rk = res.rocket || {};
      var head = res.launchStatus === 'timed_out' ? "TIME'S UP" : 'MISSION SUBMITTED';
      o.innerHTML = '<div class="sqbox"><div class="sqk">' + head + '</div><h2>' + esc(res.team) + '</h2>' +
        '<table class="sq-sum"><tr><td>Coins spent</td><td>' + res.coinsSpent + ' of ' + res.startingCoins + '</td></tr>' +
        '<tr><td>Coins left</td><td>' + res.coinsRemaining + '</td></tr><tr><td>Time taken</td><td>' + fmt(res.timeTakenSec) + '</td></tr></table>' +
        '<div class="sq-built"><h3>What you built</h3>' +
        '<h4>Satellite size</h4><p>' + esc(sat.size ? sat.size.charAt(0).toUpperCase() + sat.size.slice(1) : 'None') + '</p>' +
        '<h4>Orbit</h4><p>' + esc(res.orbit || 'None') + '</p>' +
        '<h4>Instruments</h4>' + items(sat.instruments) +
        '<h4>Power system</h4>' + items(sat.power) +
        '<h4>Rocket</h4>' + items(rk.stages) + '</div>' +
        '<p id="sqSubmit" class="sqmuted"></p><div class="sqbtns"><a class="sqbtn" href="index.html">Done</a></div></div>';
      document.body.appendChild(o);
      statusLine(Core.outbox().length ? 'pending' : 'synced');
    }
  };

  function statusLine(s) {
    var el = $('sqSubmit'); if (!el) return;
    el.textContent = {
      sending: 'Sending your submission...',
      synced: 'Submission recorded. Watch the big screen for the rankings.',
      noconfig: 'Saved on this phone. It will be sent as soon as the leaderboard is connected.',
      pending: 'Saved on this phone. Waiting for internet to send it; it will retry automatically.',
      empty: ''
    }[s] || '';
  }
  window.SQCoreStatus = statusLine;
  window.SQGame = SQGame;
})();
