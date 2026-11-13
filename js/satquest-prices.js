// SAT QUEST: official component prices and scoring points.
// Source: Tuned_Arctic_Lifeline_Scoring_Matrix.xlsx (sheet "Tuned Scoring Matrix"). This is the ONLY place prices live.
// Each row: [Excel row, category, Excel component name, cost (coins), points if selected, points deducted if missed, app keys]
// App key prefixes: bus: satellite size | orbit: orbit code | pkg: instrument | pwr: power device | fs: first stage | pb: payload bay (fairing)
(function () {
  var R = [
    [2,  'Satellite Size', 'Cube sat',                    30, -10,   0, ['bus:cube']],
    [3,  'Satellite Size', 'Small satellite',             80,   5,   0, ['bus:small']],
    [4,  'Satellite Size', 'Medium satellite',           150,  10,   0, ['bus:medium']],
    [5,  'Satellite Size', 'Large satellite',            200,  15,   0, ['bus:large']],
    [6,  'Orbit', 'Geo-stationary orbit',                  0, -20,   0, ['orbit:GEO']],
    [7,  'Orbit', 'Highly-elliptical orbit (HEO)',         0,  25, -25, ['orbit:HEO']],
    [8,  'Orbit', 'Low-Earth orbit (LEO)',                 0, -10,   0, ['orbit:LEO']],
    [9,  'Orbit', 'Medium-Earth orbit (MEO)',              0,  -5,   0, ['orbit:MEO']],
    [10, 'Instruments', 'Internet encoder',              100,  20, -15, ['pkg:internet-en']],
    [11, 'Instruments', 'Phone encoder',                  40,   5,   0, ['pkg:phone-en', 'pkg:phone-en-mini']],
    [12, 'Instruments', 'TV encoder',                    100,  -5,   0, ['pkg:tv-en']],
    [13, 'Instruments', 'Radio dish',                     20,  15, -10, ['pkg:dish-medium']],
    [14, 'Instruments', 'Radio dish (large)',             40,  20,   0, ['pkg:dish-large']],
    [15, 'Instruments', 'Radio antenna (deployable)',     10,  -5,   0, ['pkg:radio-antenna-cube']],
    [16, 'Instruments', 'Radio antenna (compact)',        15,  -5,   0, ['pkg:dish-small']],
    [17, 'Instruments', 'GPS receiver',                   30,   5,   0, ['pkg:gps-rx', 'pkg:gps-rx-mini']],
    [18, 'Instruments', 'Atomic clock (all types)',       20,  -5,   0, ['pkg:atomic-clock', 'pkg:atomic-clock-small']],
    [19, 'Instruments', 'All Cameras / Spectrometers',   100, -10,   0, ['pkg:camera-opt', 'pkg:camera-opt-hires', 'pkg:camera-mini', 'pkg:camera-nir', 'pkg:camera-fir', 'pkg:spect-opt', 'pkg:spect-nir', 'pkg:spect-fir']],
    [20, 'Power Devices', 'Deployable solar panel',       50,  15, -10, ['pwr:solar-panel']],
    [21, 'Power Devices', 'Body-mounted solar panel',     80,  10,   0, ['pwr:solar-panel-surface']],
    [22, 'Power Devices', 'Small battery',                20,  -5,   0, ['pwr:battery-small']],
    [23, 'Power Devices', 'Medium battery',               40,   5,   0, ['pwr:battery-medium']],
    [24, 'Power Devices', 'Large battery',                70,  10,   0, ['pwr:battery-large']],
    [25, 'Power Devices', 'RTG',                         120, -10,   0, ['pwr:rtg']],
    [26, 'Rocket - Fairing (Top)', 'Dia 1m',              10,   5,   0, ['pb:XS']],
    [27, 'Rocket - Fairing (Top)', 'Dia 2m',              20,   5,   0, ['pb:S']],
    [28, 'Rocket - Fairing (Top)', 'Dia 4m',              30,  10,   0, ['pb:M']],
    [29, 'Rocket - Fairing (Top)', 'Dia 8m',              60,  15,   0, ['pb:L']],
    [30, 'Rocket - Fairing (Top)', 'Dia 10m',             80,   0,   0, ['pb:XL']],
    [31, 'Rocket - First Stage (Bottom)', 'Dia 1m (Thrust: 2200kN)',    90,  5,   0, ['fs:S']],
    [32, 'Rocket - First Stage (Bottom)', 'Dia 2m (Thrust: 1500kN)',   120,  5,   0, ['fs:M']],
    [33, 'Rocket - First Stage (Bottom)', 'Dia 4.5m (Thrust: 6000kN)', 150, 10, -10, ['fs:L']],
    [34, 'Rocket - First Stage (Bottom)', 'Dia 8m (Thrust: 7400kN)',   200, 15,   0, ['fs:XL']],
    [35, 'Rocket - First Stage (Bottom)', 'Dia 10m (Thrust: 34000kN)', 250,  0,   0, ['fs:XXL']]
  ];
  // App components that have NO row in the sheet. They are NOT given an invented price: they cost 0 and are reported here.
  var UNPRICED = ['pkg:radar-alt', 'ss:XS', 'ss:S', 'ss:M', 'ss:L', 'ss:XL', 'ss:XXL', 'ts:S', 'ts:M', 'ts:L', 'ts:XL', 'booster:M'];

  var rows = R.map(function (r) {
    return {row: r[0], category: r[1], name: r[2], cost: r[3], pts: r[4], miss: r[5], keys: r[6]};
  });
  var byKey = {};
  rows.forEach(function (r) { r.keys.forEach(function (k) { byKey[k] = r; }); });

  var STAGE_DATA = {fs: 'firststage', pb: 'payloadbay', ss: 'secondstage', ts: 'thirdstage'};

  // Overwrite every cost in the builder data (and the on-page labels) with the sheet price.
  function apply(data) {
    function setCost(obj, v) { if (obj && obj.cost) obj.cost.value = v; }
    var k, p, i, r;
    for (k in data.bus) setCost(data.bus[k], (byKey['bus:' + k] || {cost: 0}).cost);
    for (k in data['package']) setCost(data['package'][k], (byKey['pkg:' + k] || {cost: 0}).cost);
    for (k in data.power) setCost(data.power[k], (byKey['pwr:' + k] || {cost: 0}).cost);
    Object.keys(STAGE_DATA).forEach(function (pre) {
      (data[STAGE_DATA[pre]] || []).forEach(function (st) { setCost(st, (byKey[pre + ':' + st.key] || {cost: 0}).cost); });
    });
    (data.boosters || []).forEach(function (st) { setCost(st, 0); });
    // On-page labels (they are static HTML in advanced.html, so refresh them from the same data)
    function label(el, v) {
      if (!el) return;
      el.setAttribute('data-value', v);
    }
    for (k in data.bus) {
      var b = document.querySelector('#bus button[data-size="' + k + '"]');
      if (b) label(b.parentNode.querySelector('.bus_cost + td .value'), data.bus[k].cost.value);
    }
    ['package', 'power'].forEach(function (sec) {
      for (k in data[sec]) {
        var li = document.querySelector('li[data-package="' + k + '"]');
        if (li) label(li.querySelector('.package_cost .value'), data[sec][k].cost.value);
      }
    });
    Object.keys(STAGE_DATA).forEach(function (pre) {
      var sec = STAGE_DATA[pre];
      (data[sec] || []).forEach(function (st) {
        var li = document.querySelector('.rocket-builder .' + sec + ' .stage-' + st.key);
        if (!li) return;
        var tds = li.querySelectorAll('td');
        for (i = 0; i < tds.length; i++) if (/^Cost/.test(tds[i].textContent) && tds[i + 1]) label(tds[i + 1].querySelector('.value'), st.cost.value);
      });
    });
  }

  window.SQPrices = {rows: rows, byKey: byKey, unpriced: UNPRICED, apply: apply};
})();
