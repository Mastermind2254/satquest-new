// SAT QUEST backend. Paste into Extensions > Apps Script of your Google Sheet, then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone). Put the /exec URL in js/config.js as SHEET_URL.
//
// Every submission carries a unique "id". A submission whose id is already in the sheet is ignored, so retries
// after a dropped connection or a page reload can never create duplicate rows.
var TAB = 'Submissions';
var HEAD = ['Received', 'Id', 'Team', 'Score', 'StartingCoins', 'CoinsSpent', 'CoinsRemaining', 'TimeTakenSec', 'TimeLeftSec',
            'LaunchStatus', 'Orbit', 'SatelliteSize', 'Instruments', 'PowerSystem', 'Rocket', 'EngineeringChecks', 'ScoreBreakdown', 'FullJSON'];

function tab_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(TAB);
  if (!s) { s = ss.insertSheet(TAB); s.appendRow(HEAD); s.setFrozenRows(1); }
  return s;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// Stop spreadsheet formula injection from team-typed text
function safe_(t, n) { t = String(t == null ? '' : t).substring(0, n || 60); return /^[=+\-@]/.test(t) ? "'" + t : t; }
function list_(a, f) { return (a || []).map(f).join('; '); }
function find_(s, id) {
  var last = s.getLastRow(); if (last < 2) return 0;
  var ids = s.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var d = JSON.parse(e.postData.contents), id = safe_(d.id, 80);
    if (!id || !d.team) return out_({ok: false, error: 'missing id or team'});
    var s = tab_();
    if (find_(s, id)) return out_({ok: true, duplicate: true});      // already stored: do nothing
    var sat = d.satellite || {}, rk = d.rocket || {};
    var json = JSON.stringify(d); if (json.length > 45000) json = json.substring(0, 45000);
    s.appendRow([
      new Date(), id, safe_(d.team, 40), Number(d.score) || 0, Number(d.startingCoins) || 0, Number(d.coinsSpent) || 0,
      Number(d.coinsRemaining) || 0, Number(d.timeTakenSec) || 0, Number(d.timeLeftSec) || 0,
      safe_(d.launchStatus, 30), safe_(d.orbit, 10), safe_(sat.size, 20),
      safe_(list_(sat.instruments, function (x) { return x.name + ' x' + x.qty + ' (' + x.total + ')'; }), 500),
      safe_(list_(sat.power, function (x) { return x.name + ' x' + x.qty + ' (' + x.total + ')'; }), 500),
      safe_(list_(rk.stages, function (x) { return x.name + ' (' + x.total + ')'; }), 500),
      safe_(list_(d.engineeringChecks, function (x) { return (x.met ? 'OK: ' : 'NOT MET: ') + x.label; }), 800),
      safe_(list_(d.scoreBreakdown, function (x) { return x.item + ' ' + (x.points > 0 ? '+' : '') + x.points; }), 800),
      json
    ]);
    return out_({ok: true});
  } finally { lock.releaseLock(); }
}

// GET ?id=...  -> {found:true|false}   (the app uses this to confirm delivery)
// GET          -> leaderboard for projector.html
function doGet(e) {
  var s = tab_();
  if (e && e.parameter && e.parameter.id) return out_({found: !!find_(s, String(e.parameter.id))});
  var last = s.getLastRow(), rows = [];
  if (last > 1) rows = s.getRange(2, 1, last - 1, 9).getValues().map(function (r) {
    return {team: r[2], score: r[3], budget: r[4], cost: r[5], remaining: r[6], elapsed: r[7], timeLeft: r[8]};
  });
  rows.sort(function (a, b) { return b.score - a.score || a.elapsed - b.elapsed || a.cost - b.cost; });
  return out_({ok: true, rows: rows});
}
