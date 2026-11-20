// Loft accounts. Same rules as the Dead Harbor server (3-16 letters/numbers/_, password 6-64).
// Nothing is sent anywhere: the account lives on this PC. Game servers never see your Dockside password,
// they get a separate game login derived from it (so the same account works on every server of that game).
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

class Auth {
  constructor(dir, safeStorage) {
    this.dir = dir; this.ss = safeStorage;
    this.file = path.join(dir, 'accounts.json');
    this.sessFile = path.join(dir, 'session.bin');
    this.user = null; this.master = null;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    try { this.db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { this.db = { users: {} }; }
    if (!this.db.users) this.db.users = {};
  }
  save() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.db)); fs.renameSync(this.file + '.tmp', this.file); }
  static master(name, pw) { return crypto.scryptSync(pw, 'dockside-v1:' + name.toLowerCase(), 32, { N: 16384, r: 8, p: 1 }); }
  static verifier(master) { return crypto.createHash('sha256').update(Buffer.concat([Buffer.from('verify:'), master])).digest('hex'); }
  canKeep() { try { return !!(this.ss && this.ss.isEncryptionAvailable()); } catch (e) { return false; } }
  check(name, pw) {
    if (!NAME_RE.test(name)) return 'Name: 3-16 letters, numbers or _';
    if (typeof pw !== 'string' || pw.length < 6 || pw.length > 64) return 'Password must be 6-64 characters';
    return null;
  }
  signup(name, pw, keep) {
    name = String(name || '').trim(); const bad = this.check(name, pw); if (bad) return { error: bad };
    const k = name.toLowerCase(); if (this.db.users[k]) return { error: 'That name already has an account on this PC' };
    const m = Auth.master(name, pw);
    this.db.users[k] = { name, v: Auth.verifier(m), created: Date.now() }; this.save();
    return this.begin(k, m, keep);
  }
  login(name, pw, keep) {
    name = String(name || '').trim(); const bad = this.check(name, pw); if (bad) return { error: bad };
    const k = name.toLowerCase(), U = this.db.users[k];
    if (!U) return { error: 'No account with that name on this PC. Use Create account.' };
    const m = Auth.master(name, pw), a = Buffer.from(Auth.verifier(m), 'hex'), b = Buffer.from(U.v, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: 'Wrong password' };
    return this.begin(k, m, keep);
  }
  begin(k, m, keep) {
    this.user = this.db.users[k].name; this.master = m;
    if (keep && this.canKeep()) {
      try { fs.writeFileSync(this.sessFile, this.ss.encryptString(JSON.stringify({ k, m: m.toString('hex') }))); } catch (e) {}
    } else this.forget();
    return { ok: true, user: this.user };
  }
  resume() {
    try {
      if (!this.canKeep() || !fs.existsSync(this.sessFile)) return false;
      const s = JSON.parse(this.ss.decryptString(fs.readFileSync(this.sessFile))), U = this.db.users[s.k];
      const m = Buffer.from(s.m, 'hex'); if (!U || Auth.verifier(m) !== U.v) return false;
      this.user = U.name; this.master = m; return true;
    } catch (e) { return false; }
  }
  forget() { try { fs.unlinkSync(this.sessFile); } catch (e) {} }
  logout() { this.user = null; this.master = null; this.forget(); }
  // the login a game server gets: same name, a password derived per game (never the Loft password)
  // (the strings 'dockside-v1:' and 'dockside|game|' are from the first version and must never change, or existing logins would break)
  gamePassword(gameId) {
    if (!this.master) return null;
    return crypto.createHmac('sha256', this.master).update('dockside|game|' + gameId).digest('hex').slice(0, 40);
  }
  cred(gameId) { return this.master ? { u: this.user, p: this.gamePassword(gameId) } : null; }
}

Auth.prototype.row = function (name) { return this.db.users[String(name || '').toLowerCase()]; };
Auth.prototype.profile = function () {
  const U = this.user && this.row(this.user); if (!U) return null;
  return { name: U.name, created: U.created || Date.now(), color: U.color || '#4fb0a5', stats: U.stats || {} };
};
Auth.prototype.setColor = function (c) { const U = this.user && this.row(this.user); if (U && /^#[0-9a-f]{6}$/i.test(c)) { U.color = c; this.save(); } return this.profile(); };
Auth.prototype.bump = function (name, gid, fn) {
  const U = this.row(name); if (!U) return; U.stats = U.stats || {};
  const s = U.stats[gid] = U.stats[gid] || { ms: 0, launches: 0, hosted: 0, last: 0 }; fn(s); try { this.save(); } catch (e) {}
};
Auth.prototype.addLaunch = function (name, gid) { this.bump(name, gid, s => { s.launches++; s.last = Date.now(); }); };
Auth.prototype.addPlay = function (name, gid, ms) { this.bump(name, gid, s => { s.ms += Math.max(0, Math.min(ms, 864e5)); }); };
Auth.prototype.addHosted = function (name, gid) { this.bump(name, gid, s => { s.hosted++; }); };
module.exports = { Auth, NAME_RE };
