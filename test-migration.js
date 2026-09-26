/* Node-level test of the exact import logic in main.js (extracted by eval of the module
   is complex under Electron); instead we spin the same code path via a tiny harness. */
const initSqlJs = require('sql.js');
const path = require('path');
(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f) });
  const db = new SQL.Database();
  db.run('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const kvGet = (k) => { const st = db.prepare('SELECT value FROM kv WHERE key=:k'); st.bind({':k':k}); const r = st.step()? st.getAsObject().value : null; st.free(); return r; };
  const kvSet = (k,v) => db.run('INSERT INTO kv VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k,v,Date.now()]);

  // replicate importBrowserSnapshot pair-extraction logic (kept in sync with main.js)
  function extractPairs(data) {
    let pairs = {};
    if (data && data.app && (data.data || data.bills)) {
      const d = data.data || data;
      for (const k of Object.keys(d)) if (typeof d[k] !== 'undefined') pairs[k] = JSON.stringify(d[k]);
      if (data.bills) for (const id of Object.keys(data.bills)) pairs['bill:' + id] = JSON.stringify(data.bills[id]);
    } else if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        if (/::bak|::crc/.test(k)) continue;
        pairs[k] = typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]);
      }
    } else throw new Error('bad');
    return pairs;
  }
  let pass = 0, fail = 0;
  const t = (n, ok) => { console.log((ok?'PASS ':'FAIL ')+n); ok?pass++:fail++; };

  // format A: browser full backup
  const backupA = { app: 'CGHS Billing Suite', data: { 'bills-index': [{id:'a'}], 'app-settings': {theme:'dark'} }, bills: { a: { id:'a', total: 700 } } };
  const pa = extractPairs(backupA);
  t('full-backup: extracts data keys + bill records', pa['bills-index'] && pa['bill:a'] && JSON.parse(pa['bill:a']).total === 700);
  // format B: raw localStorage dump with sidecars
  const dumpB = { 'local-rates': '{"WC001":{"rate":1500}}', 'x::crc': '1', 'y::bak': '2', 'draft': '{"rows":[]}' };
  const pb = extractPairs(dumpB);
  t('raw-dump: sidecars excluded, values passthrough', pb['local-rates'] && !pb['x::crc'] && !pb['y::bak'] && pb['draft'] === '{"rows":[]}');
  // never-overwrite semantics
  kvSet('local-rates', 'DESKTOP-NEWER');
  let imported = 0, skipped = 0;
  for (const k of Object.keys(pb)) { if (kvGet(k) !== null) { skipped++; continue; } kvSet(k, pb[k]); imported++; }
  t('never-overwrite: existing desktop key preserved', kvGet('local-rates') === 'DESKTOP-NEWER' && skipped === 1 && imported === 1);
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail?1:0);
})();
