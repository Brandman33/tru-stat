// tru-stat live figures — Cloudflare Pages Function, served at /api/live
// Fetches the latest official figures straight from the ONS and the Bank of England,
// caches the result for an hour, and returns only what it could read.
// The page falls back to its saved figures (data/dashuk.json) for anything missing.

const UA = 'tru-stat/1.0 (public dashboard of official UK statistics)';
const CACHE_SECONDS = 3600;
const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const MNAME = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ONS series: id on the page -> [path to the series, which list to read, how to treat it]
const ONS = {
  cpi:          ['/economy/inflationandpriceindices/timeseries/d7g7/mm23', 'months', 'prevPeriod'],
  core_cpi:     ['/economy/inflationandpriceindices/timeseries/dko8/mm23', 'months', 'prevPeriod'],
  unemployment: ['/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms', 'months', 'prevPeriod'],
  gdp:          ['/economy/grossdomesticproductgdp/timeseries/ihyq/pn2', 'quarters', 'prevPeriod'],
  borrowing:    ['/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/j5ii/pusf', 'months', 'prevYear', 'millionsToBillions'],
  debt:         ['/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6w/pusf', 'months', 'prevYear', 'maybeMillions'],
  debt_gdp:     ['/economy/governmentpublicsectorandtaxes/publicsectorfinance/timeseries/hf6x/pusf', 'months', 'prevYear'],
};

const iso = (d) => (d instanceof Date && !isNaN(d)) ? d.toISOString().slice(0, 10) : null;
const label = (s) => {
  // "2026 OCT" -> "Oct 2026"; "2026 Q3" -> "Jul–Sep 2026"; "2026 JUL-SEP" -> "Jul–Sep 2026"
  const m = /^(\d{4}) ([A-Z]{3})(?:-([A-Z]{3}))?$/.exec(s);
  if (m) return m[3] ? `${MNAME[MON[m[2]]]}–${MNAME[MON[m[3]]]} ${m[1]}` : `${MNAME[MON[m[2]]]} ${m[1]}`;
  const q = /^(\d{4}) Q([1-4])$/.exec(s);
  if (q) { const a = (+q[2] - 1) * 3 + 1; return `${MNAME[a]}–${MNAME[a + 2]} ${q[1]}`; }
  return s;
};
const round = (v, p) => { const f = 10 ** p; return Math.round(v * f) / f; };

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function onsFigure(id, [path, list, mode, scale]) {
  const j = await getJSON(`https://www.ons.gov.uk${path}/data`);
  const rows = (j[list] || []).filter((r) => r.value !== '' && r.value !== null && !isNaN(parseFloat(r.value)));
  if (rows.length < 2) throw new Error(`${id}: no data`);
  const last = rows[rows.length - 1];
  let prev = rows[rows.length - 2];
  if (mode === 'prevYear') {
    const want = last.date.replace(/^\d{4}/, (y) => String(+y - 1));
    prev = rows.find((r) => r.date === want) || prev;
  }
  let v = parseFloat(last.value), pv = parseFloat(prev.value), dp = 1;
  if (scale === 'millionsToBillions' || (scale === 'maybeMillions' && v > 100000)) { v = v / 1000; pv = pv / 1000; }
  v = round(v, dp); pv = round(pv, dp);
  const d = j.description || {};
  const out = {
    value: v.toFixed(dp), prev_value: pv.toFixed(dp), prev_label: label(prev.date),
    period: label(last.date), published: iso(new Date(d.releaseDate)), source: 'ONS (live)',
    url: `https://www.ons.gov.uk${path}`,
  };
  const nx = iso(new Date(d.nextRelease));
  if (nx) out.next_update = nx;
  if (id === 'unemployment') {
    // ONS labels rolling three-month Labour Force Survey figures by their middle month ("2026 AUG" = Jul–Sep 2026)
    const mid = (s) => { const m = /^(\d{4}) ([A-Z]{3})$/.exec(s); if (!m) return label(s);
      const y = +m[1], k = MON[m[2]]; const a = new Date(Date.UTC(y, k - 2, 1)), c = new Date(Date.UTC(y, k, 1));
      return `${MNAME[a.getUTCMonth() + 1]}${a.getUTCFullYear() !== c.getUTCFullYear() ? ' ' + a.getUTCFullYear() : ''}–${MNAME[c.getUTCMonth() + 1]} ${c.getUTCFullYear()}`; };
    out.period = mid(last.date); out.prev_label = mid(prev.date);
  }
  if (id === 'cpi' || id === 'core_cpi') out.period = '12 months to ' + out.period;
  return out;
}

async function bankRate() {
  const from = '01/Jan/2024';
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } });
  if (!r.ok) throw new Error('BoE ' + r.status);
  const rows = (await r.text()).trim().split(/\r?\n/).slice(1).map((l) => l.split(','))
    .map(([d, v]) => ({ date: new Date(d + ' UTC'), rate: parseFloat(v) })).filter((x) => !isNaN(x.rate) && !isNaN(x.date));
  if (!rows.length) throw new Error('BoE: no data');
  rows.sort((a, b) => a.date - b.date);
  const cur = rows[rows.length - 1].rate;
  let i = rows.length - 1;
  while (i > 0 && rows[i - 1].rate === cur) i--;
  const changed = rows[i].date, prev = i > 0 ? rows[i - 1].rate : cur;
  const dd = changed.getUTCDate(), mm = MNAME[changed.getUTCMonth() + 1], yy = changed.getUTCFullYear();
  return {
    value: cur.toFixed(2), prev_value: prev.toFixed(2), prev_label: `before ${dd} ${mm} ${yy}`,
    period: `set ${dd} ${mm} ${yy}`, published: iso(changed), source: 'Bank of England (live)',
    url: 'https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate',
  };
}

export async function onRequest(context) {
  const cache = caches.default;
  const key = new Request(new URL('/api/live?v=2', context.request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const jobs = Object.entries(ONS).map(([id, spec]) => onsFigure(id, spec).then((f) => [id, f]));
  jobs.push(bankRate().then((f) => ['bank_rate', f]));
  const settled = await Promise.allSettled(jobs);
  const figures = {}, errors = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') figures[s.value[0]] = s.value[1];
    else errors.push(String(s.reason && s.reason.message || s.reason));
  }
  const body = JSON.stringify({ fetched_at: new Date().toISOString(), figures, errors });
  const res = new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, 'Access-Control-Allow-Origin': '*' },
  });
  if (Object.keys(figures).length) context.waitUntil(cache.put(key, res.clone()));
  return res;
}
