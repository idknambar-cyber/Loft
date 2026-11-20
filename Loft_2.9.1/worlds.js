// Server worlds. Every world you host is its own folder:
//   <userData>/servers/<game>/worlds/<id>/data.json   the world itself (what server.js loads and saves)
//   <userData>/servers/<game>/worlds/<id>/meta.json   name, dates
// So hosting no longer means "the one server world": you pick which world to host, make a new one, or import one from a file.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DAYL = 360;            // seconds per in-game day (same number as server.js)
const MAX_FILE = 80 * 1048576;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); };
const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;

// The same text gives the same map as in singleplayer (this is the game's own formula).
const seedFrom = t => { t = String(t == null ? '' : t).trim(); return t ? [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) : (Math.random() * 1e9 | 0); };
const cleanName = (n, d) => String(n == null ? '' : n).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 30) || d;

// ---- pieces: the same checks server.js applies when a world is moved onto it ----
const okSlot = v => v === null || (v && typeof v.id === 'string' && v.id.length < 32 && Number.isFinite(v.n) && v.n > 0 && v.n <= 99 && (v.dr == null || Number.isFinite(v.dr)));
const cleanSlot = v => v ? (v.dr != null ? { id: v.id, n: v.n | 0, dr: +v.dr } : { id: v.id, n: v.n | 0 }) : null;
function mkPc(s) {
  const o = { t: s.t, gx: s.gx, gz: s.gz, L: s.L, dir: s.dir, m: s.m, tl: s.tl | 0, open: s.open ? 1 : 0 };
  if (s.t === 'h' && Array.isArray(s.ch)) o.ch = s.ch.slice(0, 30).map(v => okSlot(v || null) ? cleanSlot(v) : null);
  if (s.t === 'm') { for (const k of ['fu', 'in', 'ou']) if (Number.isFinite(s[k])) o[k] = s[k]; for (const k of ['ii', 'oi']) if (typeof s[k] === 'string' && s[k].length < 32) o[k] = s[k]; }
  if (s.t === 't' && Number.isFinite(s.am)) o.am = s.am | 0;
  if (s.t === 'p' && Number.isFinite(s.pa)) o.pa = s.pa;
  return o;
}
const pkey = p => p.t === 'f' ? `f${p.gx},${p.gz},${p.L}` : p.t === 'w' || p.t === 'd' || p.t === 'n' ? `w${p.gx},${p.gz},${p.L},${p.dir}` : p.t === 's' ? `s${p.gx},${p.gz},${p.L}` : `o${p.gx},${p.gz},${p.L}`;

// A singleplayer world file (what "Export" in the game's world list makes) -> a server world.
function fromSingleplayer(w, owner) {
  const day = Math.max(1, num(w.day, 1)), t = Math.min(.999, Math.max(0, num(w.t, .02))), now = (day - 1 + t) * DAYL, age = num(w.age, 0);
  const pcs = {};
  for (const a of (Array.isArray(w.pcs) ? w.pcs : []).slice(0, 6000)) {
    if (!Array.isArray(a)) continue;
    const [pt, gx, gz, L, dir, m, open, fu, inn, ou, am, ch, tl, pa, ii, oi] = a;
    if (typeof pt !== 'string' || pt.length !== 1 || !Number.isFinite(gx) || !Number.isFinite(gz) || !Number.isFinite(L)) continue;
    const s = { t: pt, gx, gz, L, dir: dir | 0, m: m | 0, open: open ? 1 : 0, tl: tl | 0, fu: fu | 0, in: inn | 0, ou: ou | 0, am: am | 0, ch: Array.isArray(ch) ? ch : undefined, ii: ii || undefined, oi: oi || undefined };
    if (pt === 'p') s.pa = (+pa >= 0) ? now - (age - pa) : -1;
    const k = pkey(s); if (k.length >= 48) continue;
    pcs[k] = mkPc(s);
  }
  const rm = (Array.isArray(w.rm) ? w.rm : []).filter(x => typeof x === 'string' || typeof x === 'number').slice(0, 6000);
  const d = { inv: w.inv, arm: w.arm, xp: w.xp, lv: w.lv, pp: w.pp, pk: w.pk, ac: w.ac, ex: w.ex, bed: w.bed, hun: w.hun, kills: w.kills, x: w.x, y: w.y, z: w.z };
  return { seed: w.seed | 0, t0: Date.now() - now * 1000, age: now, users: {}, pcs, rm, rg: [], d, pieces: Object.keys(pcs).length };
}

class Worlds {
  constructor(userData) { this.userData = userData; }
  gameDir(gid) { return path.join(this.userData, 'servers', String(gid)); }
  root(gid) { return path.join(this.gameDir(gid), 'worlds'); }
  dir(gid, id) { return ID_RE.test(String(id)) ? path.join(this.root(gid), String(id)) : null; }
  metaFile(gid, id) { return path.join(this.dir(gid, id), 'meta.json'); }
  dataFile(gid, id) { return path.join(this.dir(gid, id), 'data.json'); }

  // The first version had a single world straight in the server folder. Keep it as a world of its own.
  migrate(gid) {
    const old = path.join(this.gameDir(gid), 'data.json'); if (!fs.existsSync(old)) return;
    try {
      const d = this.dir(gid, 'first-world'); fs.mkdirSync(d, { recursive: true });
      if (fs.existsSync(path.join(d, 'data.json'))) return;
      try { fs.renameSync(old, path.join(d, 'data.json')); } catch (e) { fs.copyFileSync(old, path.join(d, 'data.json')); fs.unlinkSync(old); }
      writeJson(path.join(d, 'meta.json'), { id: 'first-world', name: 'My server world', created: Date.now(), played: 0, source: 'earlier' });
    } catch (e) {}
  }
  ids(gid) { try { return fs.readdirSync(this.root(gid)).filter(n => ID_RE.test(n) && fs.existsSync(path.join(this.root(gid), n, 'data.json'))); } catch (e) { return []; } }
  describe(gid, id) {
    const m = readJson(this.metaFile(gid, id), null) || {}, f = this.dataFile(gid, id);
    const db = readJson(f, null); if (!db) return null;
    let size = 0; try { size = fs.statSync(f).size; } catch (e) {}
    if (!m.name) { m.name = id; }
    const cfg = Object.assign({ pvp: true, loot: true }, db.cfg || {});
    return { id, name: m.name, created: m.created || 0, played: m.played || 0, source: m.source || '', seed: db.seed | 0,
      day: Math.floor(num(db.age, 0) / DAYL) + 1, pieces: Object.keys(db.pcs || {}).length, players: Object.keys(db.users || {}).length,
      pvp: cfg.pvp !== false, loot: cfg.loot !== false, size };
  }
  list(gid) {
    this.migrate(gid);
    return this.ids(gid).map(id => this.describe(gid, id)).filter(Boolean).sort((a, b) => (b.played || b.created) - (a.played || a.created));
  }
  get(gid, id) { if (!ID_RE.test(String(id)) || !fs.existsSync(this.dataFile(gid, id))) return null; const w = this.describe(gid, id); return w && Object.assign({ dir: this.dir(gid, id) }, w); }
  uniqueName(gid, name) {
    const have = new Set(this.list(gid).map(w => w.name.toLowerCase())); let n = name, i = 2;
    while (have.has(n.toLowerCase())) { const suf = ' (' + i++ + ')'; n = name.slice(0, 30 - suf.length) + suf; }
    return n;
  }
  newId() { return 'w' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'); }

  // owner = { name, pw }: the Loft account that is creating the world. It is registered on the world right away as the owner
  // (so it is admin of its own server) with exactly the game login Loft will use later.
  ownerRecord(owner, d) {
    const s = crypto.randomBytes(16).toString('hex');
    return { n: owner.name, s, h: crypto.scryptSync(owner.pw, s, 32).toString('hex'), d: d || null };
  }
  write(gid, id, name, db, source, owner) {
    const ok = owner && owner.name && owner.pw;
    if (ok) {
      const k = owner.name.toLowerCase(), carry = db.d; delete db.d; delete db.pieces;
      db.users = db.users || {};
      const rec = this.ownerRecord(owner, null);
      if (!db.users[k]) { rec.d = carry || null; db.users[k] = rec; }
      else { const u = db.users[k]; u.n = owner.name; u.s = rec.s; u.h = rec.h; delete u.tk; if (carry && !u.d) u.d = carry; } // this is your copy: your Loft login owns it
      db.owner = k;
    } else { delete db.d; delete db.pieces; }
    db.cfg = Object.assign({ pvp: true, loot: true }, db.cfg || {});
    const dir = this.dir(gid, id); fs.mkdirSync(dir, { recursive: true });
    writeJson(path.join(dir, 'data.json'), db);
    writeJson(path.join(dir, 'meta.json'), { id, name, created: Date.now(), played: 0, source });
    return this.get(gid, id);
  }
  create(gid, o = {}) {
    this.migrate(gid);
    const name = this.uniqueName(gid, cleanName(o.name, 'New world')), id = this.newId();
    const db = { seed: seedFrom(o.seed), t0: Date.now() - .02 * DAYL * 1000, age: .02 * DAYL, users: {}, pcs: {}, rm: [], rg: [], cfg: { pvp: o.pvp !== false, loot: o.loot !== false } };
    try { return { world: this.write(gid, id, name, db, o.source || 'new', o.owner) }; } catch (e) { return { error: 'Could not create the world: ' + (e.message || e) }; }
  }
  // file: a singleplayer world exported from the game, a server world exported from here, or a raw data.json from a server folder
  importFile(gid, file, owner) {
    this.migrate(gid);
    let st; try { st = fs.statSync(file); } catch (e) { return { error: 'Could not open that file.' }; }
    if (st.size > MAX_FILE) return { error: 'That file is too big to be a world (over 80 MB).' };
    let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { error: 'That is not a world file (it could not be read as JSON).' }; }
    if (!j || typeof j !== 'object') return { error: 'That is not a Dead Harbor world file.' };
    const base = path.basename(file).replace(/\.[^.]*$/, '').replace(/_/g, ' ');
    let db, name, source = 'import';
    const raw = j.dhServerWorld === 1 && j.data && typeof j.data === 'object' ? j.data : j;
    if (raw.users && typeof raw.users === 'object' && raw.pcs && typeof raw.pcs === 'object' && !Array.isArray(raw.pcs)) {
      db = raw; name = cleanName(j.name, base);
      for (const u of Object.values(db.users)) if (u && typeof u === 'object') delete u.tk;   // login sessions never travel
      if (!Array.isArray(db.rm)) db.rm = []; if (!Array.isArray(db.rg)) db.rg = [];
      if (db.age == null) db.age = Math.min((Date.now() - (num(db.t0, Date.now()))) / 1000, DAYL * 8);
      db.t0 = Date.now() - num(db.age) * 1000; db.seed = db.seed | 0;
    } else if (Array.isArray(j.pcs) && j.seed != null) {
      db = fromSingleplayer(j, owner); name = cleanName(j.name, base);
    } else return { error: 'That file is not a Dead Harbor world. Use a file made with Export in the game, or a world exported from Loft.' };
    name = this.uniqueName(gid, name);
    try { return { world: this.write(gid, this.newId(), name, db, source, owner), pieces: Object.keys(db.pcs || {}).length }; } catch (e) { return { error: 'Could not import the world: ' + (e.message || e) }; }
  }
  exportTo(gid, id, dest) {
    const db = readJson(this.dataFile(gid, id), null), m = readJson(this.metaFile(gid, id), {}); if (!db) return { error: 'World not found' };
    for (const u of Object.values(db.users || {})) if (u && typeof u === 'object') delete u.tk;
    try { fs.writeFileSync(dest, JSON.stringify({ dhServerWorld: 1, name: m.name || id, exported: Date.now(), data: db })); return { ok: true }; } catch (e) { return { error: 'Could not save the file: ' + (e.message || e) }; }
  }
  rename(gid, id, name) {
    if (!this.get(gid, id)) return { error: 'World not found' };
    const nm = cleanName(name, ''); if (!nm) return { error: 'A world needs a name' };
    const m = readJson(this.metaFile(gid, id), {}); m.id = id; m.name = nm; try { writeJson(this.metaFile(gid, id), m); } catch (e) { return { error: 'Could not rename: ' + e.message }; }
    return { ok: true };
  }
  setCfg(gid, id, c) {
    const f = this.dataFile(gid, id), db = readJson(f, null); if (!db) return { error: 'World not found' };
    db.cfg = Object.assign({ pvp: true, loot: true }, db.cfg || {});
    if (typeof c.pvp === 'boolean') db.cfg.pvp = c.pvp; if (typeof c.loot === 'boolean') db.cfg.loot = c.loot;
    try { writeJson(f, db); } catch (e) { return { error: 'Could not save: ' + e.message }; } return { ok: true };
  }
  touch(gid, id) { const f = this.metaFile(gid, id), m = readJson(f, null); if (!m) return; m.played = Date.now(); try { writeJson(f, m); } catch (e) {} }
  remove(gid, id) { const d = this.dir(gid, id); if (!d || !fs.existsSync(d)) return { error: 'World not found' }; try { fs.rmSync(d, { recursive: true, force: true }); return { ok: true }; } catch (e) { return { error: 'Could not delete: ' + e.message }; } }
}
module.exports = { Worlds, fromSingleplayer, mkPc, seedFrom, DAYL };
