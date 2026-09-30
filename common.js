(function () {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const NAV = [
    ['index.html', 'Home'], ['predict.html', 'Predict'], ['prevent.html', 'Prevent'],
    ['redistribute.html', 'Redistribute'], ['processing.html', 'Processing units'],
    ['impact.html', 'Impact and ESG'], ['staff.html', 'Staff app'], ['about.html', 'Problem statement']
  ];
  const LOGO = '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#C9D1D6" stroke="#14213D" stroke-width="1.5"/><path d="M14 14V3.5A10.5 10.5 0 0 1 24 17.2Z" fill="#F2A900"/><path d="M14 14 24 17.2A10.5 10.5 0 0 1 8 22.5Z" fill="#C2611F"/><path d="M14 14 8 22.5A10.5 10.5 0 0 1 14 3.5Z" fill="#F3EBD3"/></svg>';

  // Sample dish data: base waste %, weekday bias, portion (g), cost (Rs/kg), CO2e (kg per kg food)
  const ITEMS = [
    { id: 'rice', name: 'Rice', ta: 'சாதம்', base: 14, bias: [0, 0, 0, .05, .30, .20, .05], portion: 200, cost: 18, co2: 2.7, color: '#F3EBD3' },
    { id: 'chapati', name: 'Chapati', ta: 'சப்பாத்தி', base: 6, bias: [0, 0, 0, 0, .10, .10, 0], portion: 90, cost: 60, co2: 1.4, color: '#D9A75E' },
    { id: 'sambar', name: 'Sambar', ta: 'சாம்பார்', base: 10, bias: [0, 0, 0, .05, .20, .15, 0], portion: 150, cost: 35, co2: 1.2, color: '#C2611F' },
    { id: 'curry', name: 'Vegetable curry', ta: 'பொரியல்', base: 9, bias: [0, .05, 0, 0, .15, .10, 0], portion: 100, cost: 70, co2: 1.8, color: '#6B8E3A' }
  ];

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const fmt = n => Math.round(n).toLocaleString('en-IN');

  // Demand and waste forecast (sample model, easy to swap for a trained one)
  function forecast(s) {
    const dayAtt = [1, 1, .98, .97, .86, .72, .9];
    const dayNote = ['', '', '', '', 'Students start leaving for home.', 'Weekend: most students are away.', 'Sunday: meals shift to late brunch.'];
    const evAtt = { none: 1, exam: .94, fest: 1.12, holiday: .55 };
    const rain = s.rain ? .95 : 1;
    const skips = s.skips || 0;
    let exp = Math.round(640 * dayAtt[s.day] * evAtt[s.event] * rain);
    exp = Math.max(0, exp - skips);
    const planned = s.planned;
    const surplus = Math.max(0, (planned - exp) / planned) * 100;
    let savedKg = 0, savedRs = 0, co2 = 0;
    const items = ITEMS.map(it => {
      const w = clamp(it.base * (1 + it.bias[s.day]) + surplus * .9, 2, 40);
      const cut = Math.round(w * .68);
      const kg = planned * it.portion / 1000;
      const sk = kg * cut / 100;
      savedKg += sk; savedRs += sk * it.cost; co2 += sk * it.co2;
      return Object.assign({}, it, { waste: Math.round(w), cut, kg, savedKg: sk });
    });
    const rec = Math.ceil(exp * 1.05);
    const cutMeals = planned - rec;
    const reasons = [];
    if (dayAtt[s.day] < .95) reasons.push(DAYS[s.day] + ' attendance runs about ' + Math.round((1 - dayAtt[s.day]) * 100) + '% below a normal weekday. ' + dayNote[s.day]);
    if (s.event === 'exam') reasons.push('Exam week: fewer students come to the dining hall.');
    if (s.event === 'fest') reasons.push('Fest day: more diners, but arrival times are hard to predict.');
    if (s.event === 'holiday') reasons.push('Holiday: most residents are away.');
    if (s.rain) reasons.push('Rain: fewer people walk to the dining hall.');
    if (skips) reasons.push(skips + ' students have already tapped "skip this meal".');
    if (!reasons.length) reasons.push('A normal weekday. Past weeks show demand close to the plan.');
    const conf = clamp(72 + (s.event !== 'none' ? 6 : 0) + (s.rain ? 3 : 0) + Math.min(12, Math.floor(skips / 10)), 70, 96);
    return { expected: exp, rec, cutMeals, cutPct: Math.round(cutMeals / planned * 100), items, reasons, conf, savedKg, savedRs, co2 };
  }

  function describe(f, s) {
    const rice = f.items[0];
    let t = DAYS[s.day] + ' dinner: expect about ' + f.expected + ' diners against a plan of ' + s.planned + '. ';
    if (f.cutMeals > 0) t += 'Cook for ' + f.rec + ' (' + f.cutPct + '% fewer meals). ';
    else t += 'The plan is short. Cook for ' + f.rec + '. ';
    t += 'Rice waste is likely ' + rice.waste + '%, so cut rice production by ' + rice.cut + '%.';
    return t;
  }

  function polar(cx, cy, r, deg) { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function sector(cx, cy, r, a0, a1) {
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    return 'M' + cx + ',' + cy + ' L' + p0[0].toFixed(1) + ',' + p0[1].toFixed(1) + ' A' + r + ',' + r + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' Z';
  }

  function renderThali(svg, f) {
    const cx = 200, cy = 200, R = 138;
    const apply = () => {
      svg.querySelectorAll('.leftover').forEach(el => { el.style.transform = 'scale(' + Math.sqrt(f.items[el.dataset.i].waste / 30).toFixed(3) + ')'; });
      svg.querySelectorAll('.tv').forEach(el => { el.textContent = f.items[el.dataset.i].waste + '%'; });
    };
    if (!svg.dataset.built) {
      const spans = [[182, 358], [2, 70], [74, 124], [128, 178]];
      let h = '<defs><radialGradient id="plateG" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#F4F7F8"/><stop offset="1" stop-color="#AEB9C0"/></radialGradient></defs>' +
        '<circle cx="200" cy="200" r="192" fill="url(#plateG)" stroke="#14213D" stroke-width="2"/>' +
        '<circle cx="200" cy="200" r="168" fill="#DDE3E7" stroke="#8A97A0" stroke-width="1.5"/>';
      ITEMS.forEach((it, i) => {
        const d = sector(cx, cy, R, spans[i][0], spans[i][1]);
        h += '<path d="' + d + '" fill="' + it.color + '"/>' +
          '<path class="leftover" data-i="' + i + '" d="' + d + '" fill="#D1382C" fill-opacity=".72" style="transform:scale(0)"/>';
      });
      ITEMS.forEach((it, i) => {
        const mid = (spans[i][0] + spans[i][1]) / 2;
        const p = polar(cx, cy, i === 0 ? 82 : 98, mid);
        h += '<text class="tlabel" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle"><tspan x="' + p[0].toFixed(1) + '" dy="-2">' + it.name.split(' ')[0] + '</tspan><tspan class="tv" data-i="' + i + '" x="' + p[0].toFixed(1) + '" dy="18"></tspan></text>';
      });
      svg.innerHTML = h;
      svg.dataset.built = 1;
      requestAnimationFrame(() => requestAnimationFrame(apply));
    } else apply();
  }

  function heat(t) {
    t = clamp(t, 0, 1);
    const st = [[62, 155, 95], [242, 193, 46], [209, 56, 44]];
    let a, b, u;
    if (t < .5) { a = st[0]; b = st[1]; u = t * 2; } else { a = st[1]; b = st[2]; u = (t - .5) * 2; }
    return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ')';
  }

  function mountChrome() {
    const page = location.pathname.split('/').pop() || 'index.html';
    const skip = document.createElement('a');
    skip.className = 'skip'; skip.href = '#main'; skip.textContent = 'Skip to content';
    document.body.prepend(skip);
    const nav = document.getElementById('site-nav');
    if (nav) {
      nav.className = 'nav';
      nav.innerHTML = '<div class="wrap"><a class="brand" href="index.html">' + LOGO + 'AnnaChakra</a><nav aria-label="Main"><ul>' +
        NAV.map(n => '<li><a class="link" href="' + n[0] + '"' + (n[0] === page ? ' aria-current="page"' : '') + '>' + n[1] + '</a></li>').join('') + '</ul></nav></div>';
    }
    const f = document.getElementById('site-foot');
    if (f) {
      f.className = 'foot';
      f.innerHTML = '<div class="wrap"><p>AnnaChakra (அன்னச்சக்கரம்) is a concept prototype for Smart India Hackathon 2026, problem statement 26234, Ministry of Food Processing Industries.</p><p>Every number on this site is sample data or a labelled assumption. Nothing here uses real kitchen, NGO or sensor data.</p></div>';
    }
  }

  window.AC = { clamp, DAYS, ITEMS, hash, rng, forecast, describe, renderThali, heat, fmt, polar, sector };
  mountChrome();
})();
