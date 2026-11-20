// One-click hosting: runs the game's server.js as a hidden background process and keeps track of it.
// The world to run is chosen by the caller (see worlds.js): start(game, { world: { id, name, dir }, port, internet }).
const { spawn, spawnSync } = require('child_process'), EventEmitter = require('events');
const fs = require('fs'), path = require('path'), os = require('os'), https = require('https');

function download(url, dest, onProg, redirects = 0) {
  return new Promise((res, rej) => {
    if (redirects > 6) return rej(new Error('Too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'Dockside' } }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) {
        r.resume(); return download(new URL(r.headers.location, url).toString(), dest, onProg, redirects + 1).then(res, rej);
      }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('Download failed (HTTP ' + r.statusCode + ')')); }
      const total = +r.headers['content-length'] || 0, tmp = dest + '.part', out = fs.createWriteStream(tmp); let got = 0;
      r.on('data', c => { got += c.length; if (onProg) onProg(total ? got / total : null); });
      r.pipe(out); r.on('error', rej); out.on('error', rej);
      out.on('finish', () => out.close(() => { try { fs.renameSync(tmp, dest); res(); } catch (e) { rej(e); } }));
    }).on('error', rej);
  });
}

class Host extends EventEmitter {
  constructor(userData) {
    super(); this.userData = userData; this.binDir = path.join(userData, 'bin');
    this.proc = null; this.poll = null; this.cfBusy = null; this.exiting = null;
    this.state = this.fresh();
  }
  fresh() { return { status: 'stopped', gameId: null, worldId: null, worldName: '', port: 3000, players: null, max: 20, tunnel: null, addrs: [], noTunnel: false, tunnelFailed: false, internet: true, error: null, log: [], dataDir: null, cfProgress: null }; }
  cfName() { return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'; }
  cfLocal() { return path.join(this.binDir, this.cfName()); }
  hasCf() {
    if (fs.existsSync(this.cfLocal())) return true;
    try { return spawnSync('cloudflared', ['--version'], { windowsHide: true, timeout: 4000 }).status === 0; } catch (e) { return false; }
  }
  snapshot() { const s = Object.assign({}, this.state); s.log = this.state.log.slice(-60); s.cf = this.hasCf(); s.share = this.share(); return s; }
  push() { this.emit('update', this.snapshot()); }
  lan() { const o = []; for (const l of Object.values(os.networkInterfaces())) for (const i of l) if ((i.family === 'IPv4' || i.family === 4) && !i.internal) o.push(i.address + ':' + this.state.port); return o; }
  // addresses worth giving to friends, best first
  share() {
    const out = [], st = this.state, seen = new Set(), add = (addr, kind) => { if (!addr || seen.has(addr)) return; seen.add(addr); out.push({ addr, kind, url: /^https?:/.test(addr) ? addr : 'http://' + addr }); };
    if (st.tunnel) add(st.tunnel, 'internet');
    for (const a of st.addrs) { if (/^localhost|^127\./.test(a)) continue; const ip = a.split(':')[0]; add(a, /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ? 'lan' : 'public'); }
    return out;
  }
  pub() { return this.share().map(s => s.addr); }
  start(game, o = {}) {
    if (this.proc) return { error: 'The server is already running' };
    if (this.exiting) return { error: 'The last server is still saving. Try again in a second.' };
    const w = o.world; if (!w || !w.dir) return { error: 'Pick a world to host first' };
    const port = +o.port || 3000; if (!(port >= 1024 && port <= 65535)) return { error: 'Pick a port between 1024 and 65535' };
    const dataDir = w.dir; try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
    const st = this.state = this.fresh(); st.status = 'starting'; st.gameId = game.id; st.worldId = w.id; st.worldName = w.name || ''; st.port = port; st.internet = o.internet !== false; st.dataDir = dataDir;
    const args = [path.join(game.dir, game.server), String(port)];
    const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', DH_DATA: dataDir, DH_NAME: w.name || '', DH_GAME: path.join(game.dir, game.entry) });
    env.PATH = this.binDir + path.delimiter + (process.env.PATH || '');
    if (!st.internet) env.PUBLIC_ADDR = (this.lan()[0] || 'localhost:' + port);
    // the 4th stdio slot is an IPC channel: it lets us ask the server to save and quit instead of killing it
    let p; try { p = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); } catch (e) { st.status = 'error'; st.error = String(e.message || e); this.push(); return { error: st.error }; }
    this.proc = p;
    const feed = d => { for (const line of String(d).split(/\r?\n/)) { if (line.trim()) this.line(line, st); } };
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', e => { if (this.proc !== p) return; st.status = 'error'; st.error = String(e.message || e); this.cleanup(); this.push(); });
    p.on('exit', code => {
      if (this.proc !== p) return;       // we stopped it ourselves (stop() already tidied up)
      const was = st.status; this.cleanup();
      if (was !== 'stopped') {
        if (code) {
          const log = st.log.join('\n'); st.status = 'error';
          st.error = /EADDRINUSE/.test(log) ? 'Port ' + port + ' is already in use. Pick another port.' : /Cannot find module 'ws'/.test(log) ? 'The ws package is missing. Run npm install in the Loft folder.' : (was === 'online' ? 'The server crashed' : 'The server did not start') + ' (exit code ' + code + ').';
        } else st.status = 'stopped';
      }
      st.players = null; this.push();
    });
    this.push(); return { ok: true };
  }
  line(l, owner) {
    const st = this.state; if (owner && owner !== st) return; st.log.push(l); if (st.log.length > 200) st.log.shift(); let m;
    if (/SERVER RUNNING/.test(l)) { st.status = 'online'; this.startPoll(); clearTimeout(this.tw); this.tw = setTimeout(() => { if (this.state === st && st.status === 'online' && st.internet && !st.tunnel && !st.noTunnel) { st.tunnelFailed = true; this.push(); } }, 25000); }
    if ((m = /Tunnel online: (https:\/\/\S+)/.exec(l))) st.tunnel = m[1];
    if ((m = /\(server: (.+?)\)/.exec(l))) st.addrs = m[1].split(',').map(x => x.trim()).filter(Boolean);
    if (/No tunnel found/.test(l)) st.noTunnel = true;
    this.push();
  }
  startPoll() {
    clearInterval(this.poll); const tick = () => {
      let WebSocket; try { WebSocket = require('ws'); } catch (e) { return; }
      let done = false; const ws = new WebSocket('ws://127.0.0.1:' + this.state.port), end = () => { if (!done) { done = true; try { ws.close(); } catch (e) {} } };
      setTimeout(end, 3000); ws.on('error', end);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'status' })));
      ws.on('message', raw => { try { const m = JSON.parse(raw); if (m.t === 'status') { if (this.state.players !== m.n || this.state.max !== m.max) { this.state.players = m.n; this.state.max = m.max; this.push(); } } } catch (e) {} end(); });
    };
    tick(); this.poll = setInterval(tick, 5000);
  }
  cleanup() { clearInterval(this.poll); clearTimeout(this.tw); this.poll = null; this.proc = null; }
  // Asks the server to save and quit (so the last seconds of play are kept), then kills it only if it does not answer.
  // Returns a promise that resolves when the process is gone.
  stop() {
    const p = this.proc, st = this.state;
    if (!p) { st.status = 'stopped'; this.push(); return this.exiting || Promise.resolve(); }
    st.status = 'stopped'; st.tunnel = null; st.addrs = []; st.players = null;
    this.cleanup(); this.push();
    this.exiting = new Promise(res => {
      let done = false, t1, t2; const fin = () => { if (done) return; done = true; clearTimeout(t1); clearTimeout(t2); this.exiting = null; res(); };
      p.once('exit', fin);
      try { p.send({ cmd: 'quit' }); } catch (e) { try { p.kill(); } catch (x) {} }
      t1 = setTimeout(() => { try { p.kill(); } catch (e) {} }, 2500); t2 = setTimeout(fin, 4500);
    });
    return this.exiting;
  }
  async waitOnline(ms) {
    const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = this.state.status; if (s === 'online') return true; if (s === 'error' || s === 'stopped') return false; await new Promise(r => setTimeout(r, 150)); } return false;
  }
  // free Cloudflare tunnel helper, so friends can join over the internet without touching router settings
  installCf() {
    if (this.cfBusy) return this.cfBusy;
    const plat = process.platform, arch = process.arch;
    const file = plat === 'win32' && arch === 'x64' ? 'cloudflared-windows-amd64.exe' : plat === 'linux' && arch === 'x64' ? 'cloudflared-linux-amd64' : plat === 'linux' && arch === 'arm64' ? 'cloudflared-linux-arm64' : null;
    if (!file) return Promise.resolve({ error: 'No automatic download for this system. Install cloudflared yourself and restart Dockside.' });
    try { fs.mkdirSync(this.binDir, { recursive: true }); } catch (e) {}
    this.state.cfProgress = 0; this.push();
    this.cfBusy = download('https://github.com/cloudflare/cloudflared/releases/latest/download/' + file, this.cfLocal(), p => { this.state.cfProgress = p == null ? -1 : p; this.push(); })
      .then(() => { try { fs.chmodSync(this.cfLocal(), 0o755); } catch (e) {} this.state.cfProgress = null; this.cfBusy = null; this.push(); return { ok: true }; })
      .catch(e => { this.state.cfProgress = null; this.cfBusy = null; this.push(); return { error: 'Could not download the helper: ' + (e.message || e) }; });
    return this.cfBusy;
  }
}
module.exports = { Host };
