// SAT QUEST core: team session, saved design, and an offline-safe submission queue.
// Shared by index.html (start screen) and advanced.html (builder). Everything lives in localStorage.
(function () {
  var K = {session: 'sq_session', design: 'sq_design', outbox: 'sq_outbox'};
  var C = window.SQ || {};

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function uid() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Date.now().toString(36) + '-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  var Core = {
    keys: K,
    uid: uid,
    session: function () { return read(K.session); },
    saveSession: function (s) { return write(K.session, s); },
    // Start a new team. The old session/design are replaced only here, on an explicit Begin Mission.
    begin: function (team, coins) {
      var s = {id: uid(), team: team, coins: coins, start: Date.now(), done: false, result: null};
      write(K.session, s);
      localStorage.removeItem(K.design);
      return s;
    },
    design: function () { return read(K.design); },
    saveDesign: function (d) { return write(K.design, d); },
    elapsedSec: function (s) { return Math.max(0, Math.floor(((s.finishedAt || Date.now()) - s.start) / 1000)); },
    limitSec: function () { return (C.TIME_LIMIT_MIN || 20) * 60; },

    // ---- submission queue ----
    outbox: function () { return read(K.outbox) || []; },
    queue: function (payload) {
      var q = Core.outbox();
      for (var i = 0; i < q.length; i++) if (q[i].id === payload.id) { q[i] = payload; write(K.outbox, q); return; } // same id: replace, never duplicate
      q.push(payload); write(K.outbox, q);
    },
    // The Apps Script de-duplicates on payload.id, so re-sending is always safe.
    flush: function (onStatus) {
      var url = C.SHEET_URL, q = Core.outbox();
      if (!q.length) { onStatus && onStatus('empty'); return Promise.resolve(); }
      if (!url) { onStatus && onStatus('noconfig'); return Promise.resolve(); }
      if (Core._flushing) return Core._flushing;
      onStatus && onStatus('sending');
      var sep = url.indexOf('?') < 0 ? '?' : '&';
      var chain = q.reduce(function (p, item) {
        return p.then(function () {
          return fetch(url, {method: 'POST', mode: 'no-cors', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(item)})
            .then(function () { return fetch(url + sep + 'id=' + encodeURIComponent(item.id), {cache: 'no-store'}); })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (j && j.found) { write(K.outbox, Core.outbox().filter(function (x) { return x.id !== item.id; })); }
            });
        }).catch(function () {}); // stays queued; retried on next flush
      }, Promise.resolve());
      Core._flushing = chain.then(function () {
        Core._flushing = null;
        onStatus && onStatus(Core.outbox().length ? 'pending' : 'synced');
      });
      return Core._flushing;
    }
  };
  window.addEventListener('online', function () { Core.flush(window.SQCoreStatus); });
  window.SQCore = Core;
})();
