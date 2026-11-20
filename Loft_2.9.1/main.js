// Loft: game launcher. Accounts, library, store, profile, game windows, one-click hosting.
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, clipboard, Menu } = require('electron');
const path = require('path'), fs = require('fs');
const { Auth } = require('./auth'), { Host } = require('./host'), { Worlds } = require('./worlds');

app.setName('Loft');
// The app was called Dockside first. Keep using that data folder so existing accounts, worlds and servers carry over.
app.setPath('userData', path.join(app.getPath('appData'), 'Dockside'));
app.setAppUserModelId('app.loft.launcher');
if (!app.requestSingleInstanceLock()) { app.quit(); } else start();

function start() {
  Menu.setApplicationMenu(null);
  let auth, host, worlds, launcher = null, quitting = false, GAMES = [], STORE = [];
  const gameWins = new Map(), promptWins = new Map(); // webContents id -> info
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const loadGames = () => {
    const root = path.join(__dirname, 'games'), out = [];
    let dirs = []; try { dirs = fs.readdirSync(root); } catch (e) {}
    for (const d of dirs) {
      const dir = path.join(root, d), g = readJson(path.join(dir, 'game.json'), null); if (!g) continue;
      g.id = g.id || d; g.dir = dir; if (fs.existsSync(path.join(dir, g.entry || 'index.html'))) out.push(g);
    }
    return out;
  };
  const gameById = id => GAMES.find(g => g.id === id);
  const pub = g => { const o = Object.assign({}, g); delete o.dir; o.hostable = !!g.server; return o; };
  const refocus = win => { try { if (win && !win.isDestroyed()) { win.blur(); win.focus(); win.webContents.focus(); } } catch (e) {} };

  app.on('second-instance', () => { if (launcher) { if (launcher.isMinimized()) launcher.restore(); launcher.focus(); } });
  app.whenReady().then(() => {
    auth = new Auth(app.getPath('userData'), safeStorage); auth.resume();
    host = new Host(app.getPath('userData')); worlds = new Worlds(app.getPath('userData'));
    GAMES = loadGames(); STORE = (readJson(path.join(__dirname, 'store.json'), { games: [] }).games || []);
    host.on('update', snap => { if (launcher && !launcher.isDestroyed()) launcher.webContents.send('host:update', snap); });
    makeLauncher();
  });
  app.on('window-all-closed', () => app.quit());
  // Quitting stops the server the polite way (it saves the world first), so the app waits a moment for it.
  app.on('before-quit', e => {
    if (quitting) return; quitting = true;
    if (host && (host.proc || host.exiting)) { e.preventDefault(); Promise.resolve(host.proc ? host.stop() : host.exiting).then(() => app.quit(), () => app.quit()); }
  });

  function lockDown(win) {
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  }

  function makeLauncher() {
    launcher = new BrowserWindow({
      width: 1240, height: 800, minWidth: 960, minHeight: 640, show: false, backgroundColor: '#111214', title: 'Loft',
      titleBarStyle: 'hidden', titleBarOverlay: { color: '#111214', symbolColor: '#ece9e2', height: 38 },
      webPreferences: { preload: path.join(__dirname, 'preload-launcher.js'), contextIsolation: true, sandbox: true }
    });
    launcher.removeMenu(); lockDown(launcher);
    launcher.once('ready-to-show', () => launcher.show());
    launcher.on('close', e => {
      if (quitting) return;
      const st = host.state.status;
      if (st === 'online' || st === 'starting') {
        const r = dialog.showMessageBoxSync(launcher, { type: 'question', buttons: ['Stop server and quit', 'Keep playing'], defaultId: 1, cancelId: 1, title: 'Loft', message: 'Your server is still running.', detail: 'Closing Loft stops it and disconnects everybody on it.' });
        if (r !== 0) e.preventDefault();
      }
    });
    launcher.on('closed', () => { launcher = null; for (const w of [...gameWins.values()]) { try { w.win.close(); } catch (e) {} } });
    launcher.loadFile(path.join(__dirname, 'ui', 'index.html'));
  }
  const showLauncher = tab => { if (!launcher) return; if (launcher.isMinimized()) launcher.restore(); launcher.show(); launcher.focus(); if (tab) launcher.webContents.send('nav', tab); };

  // ---------- game windows ----------
  function openGame(gameId, opts = {}) {
    const g = gameById(gameId); if (!g) return { error: 'Unknown game' };
    if (!auth.user) return { error: 'Sign in first' };
    const who = auth.user, t0 = Date.now();
    const win = new BrowserWindow({
      width: 1280, height: 800, minWidth: 960, minHeight: 600, show: false, backgroundColor: '#05070a', title: g.name, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload-game.js'), contextIsolation: true, sandbox: true, partition: 'persist:dockside-' + g.id, backgroundThrottling: false }
    });
    win.removeMenu(); lockDown(win);
    const id = win.webContents.id, join = Array.isArray(opts.join) && opts.join.length ? opts.join.map(String).slice(0, 6) : null;
    gameWins.set(id, { gameId: g.id, win, join });
    auth.addLaunch(who, g.id);
    win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'fullscreen', 'pointerLock', 'clipboard-sanitized-write'].includes(perm)));
    win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
    win.once('ready-to-show', () => { win.show(); win.webContents.focus(); });
    win.on('focus', () => { try { win.webContents.focus(); } catch (e) {} });
    win.on('closed', () => { gameWins.delete(id); auth.addPlay(who, g.id, Date.now() - t0); if (launcher && !launcher.isDestroyed()) launcher.webContents.send('nav', 'refresh'); });
    win.loadFile(path.join(g.dir, g.entry));
    return { ok: true };
  }
  const gameInfo = e => { const i = gameWins.get(e.sender.id); const u = e.senderFrame && e.senderFrame.url; return i && u && u.startsWith('file://') ? i : null; };

  ipcMain.on('ds:info', e => { const i = gameInfo(e); e.returnValue = i && auth.user ? { user: auth.user, game: i.gameId, join: i.join } : null; });
  ipcMain.handle('ds:cred', e => { const i = gameInfo(e); const c = i && auth.cred(i.gameId); if (!c) throw new Error('Not signed in'); return c; });
  ipcMain.on('ds:pub', e => { e.returnValue = gameInfo(e) ? host.pub() : []; });
  ipcMain.on('ds:openHost', e => { if (gameInfo(e)) showLauncher('host'); });
  const ownerOf = gid => auth.user ? { name: auth.user, pw: auth.gamePassword(gid) } : null;
  // "Open to friends" in the game: the world you are standing in becomes a NEW server world (named after it), so it never
  // overwrites a world you hosted before. The game then moves your base, items and position onto it.
  ipcMain.handle('ds:host', async (e, o) => {
    const i = gameInfo(e); if (!i) return { error: 'Not a game window' };
    const g = gameById(i.gameId); if (!g || !g.server) return { error: 'This game has no server' };
    const nm = String((o && o.name) || 'My world').slice(0, 30);
    if (host.state.status === 'online' || host.state.status === 'starting') {
      const r = dialog.showMessageBoxSync(i.win, { type: 'question', buttons: ['Stop it and host this world', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Loft',
        message: 'Your server is already running' + (host.state.worldName ? ' "' + host.state.worldName + '"' : '') + '.',
        detail: 'To open "' + nm + '" to friends, Loft has to stop it first. Everybody on it is disconnected. That world stays saved and you can host it again later.' });
      if (r !== 0) return { cancel: true };
      await host.stop();
    } else if (host.exiting) await host.exiting;
    const c = worlds.create(g.id, { name: nm, source: 'open', owner: ownerOf(g.id) }); if (c.error) return c;
    const r = host.start(g, { port: 3000, internet: true, world: c.world }); if (r.error) { worlds.remove(g.id, c.world.id); return { error: r.error }; }
    worlds.touch(g.id, c.world.id); auth.addHosted(auth.user, g.id);
    if (!(await host.waitOnline(20000))) return { error: host.state.error || 'The server did not start' };
    return { addr: 'localhost:' + host.state.port };
  });
  // The system alert/confirm/prompt boxes of the web page break typing on Windows (and prompt does not exist in Electron),
  // so the game asks us to show the dialog from here and then gives the keyboard back to the page.
  ipcMain.on('ds:alert', (e, msg) => {
    const i = gameInfo(e); if (!i) { e.returnValue = false; return; }
    dialog.showMessageBoxSync(i.win, { type: 'info', buttons: ['OK'], title: 'Loft', message: String(msg).slice(0, 1500), noLink: true });
    e.returnValue = true; setTimeout(() => refocus(i.win), 30);
  });
  ipcMain.on('ds:confirm', (e, msg) => {
    const i = gameInfo(e); if (!i) { e.returnValue = false; return; }
    const r = dialog.showMessageBoxSync(i.win, { type: 'question', buttons: ['OK', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Loft', message: String(msg).slice(0, 1500), noLink: true });
    e.returnValue = r === 0; setTimeout(() => refocus(i.win), 30);
  });
  ipcMain.on('ds:prompt', (e, msg, def) => {
    const i = gameInfo(e); if (!i) { e.returnValue = null; return; }
    const pw = new BrowserWindow({ parent: i.win, modal: true, width: 480, height: 250, resizable: false, minimizable: false, maximizable: false, show: false, autoHideMenuBar: true, title: 'Loft', backgroundColor: '#17181b', webPreferences: { preload: path.join(__dirname, 'preload-prompt.js'), contextIsolation: true, sandbox: true } });
    pw.removeMenu(); let done = false;
    const finish = v => { if (done) return; done = true; promptWins.delete(pw.webContents.id); e.returnValue = v; if (!pw.isDestroyed()) pw.close(); setTimeout(() => refocus(i.win), 60); };
    promptWins.set(pw.webContents.id, { msg: String(msg || ''), def: String(def || ''), finish });
    pw.once('ready-to-show', () => pw.show()); pw.on('closed', () => finish(null));
    pw.loadFile(path.join(__dirname, 'ui', 'prompt.html'));
  });
  ipcMain.handle('pw:init', e => { const p = promptWins.get(e.sender.id); return p ? { msg: p.msg, def: p.def } : { msg: '', def: '' }; });
  ipcMain.on('pw:done', (e, v) => { const p = promptWins.get(e.sender.id); if (p) p.finish(v == null ? null : String(v)); });

  // ---------- launcher window ----------
  const fromLauncher = e => launcher && e.sender === launcher.webContents;
  const authState = () => ({ user: auth.user, canKeep: auth.canKeep(), profile: auth.profile() });
  ipcMain.handle('app:state', e => fromLauncher(e) ? Object.assign(authState(), { games: GAMES.map(pub), store: STORE, host: host.snapshot(), version: app.getVersion() }) : null);
  ipcMain.handle('profile:get', e => fromLauncher(e) ? auth.profile() : null);
  ipcMain.handle('profile:color', (e, c) => fromLauncher(e) ? auth.setColor(String(c)) : null);
  ipcMain.handle('auth:signup', (e, n, p, keep) => fromLauncher(e) ? Object.assign(auth.signup(n, p, !!keep), authState()) : { error: 'Not allowed' });
  ipcMain.handle('auth:login', (e, n, p, keep) => fromLauncher(e) ? Object.assign(auth.login(n, p, !!keep), authState()) : { error: 'Not allowed' });
  ipcMain.handle('auth:logout', e => { if (!fromLauncher(e)) return null; for (const w of [...gameWins.values()]) { try { w.win.close(); } catch (x) {} } auth.logout(); return authState(); });
  ipcMain.handle('auth:password', (e, gid) => fromLauncher(e) && auth.user ? auth.gamePassword(String(gid)) : null);
  ipcMain.handle('game:launch', (e, gid, opts) => fromLauncher(e) ? openGame(String(gid), opts || {}) : { error: 'Not allowed' });
  ipcMain.handle('host:start', (e, gid, o) => {
    if (!fromLauncher(e)) return { error: 'Not allowed' }; const g = gameById(String(gid)); if (!g || !g.server) return { error: 'This game cannot be hosted' };
    o = o || {}; const w = worlds.get(g.id, String(o.world || '')); if (!w) return { error: 'Pick a world to host first' };
    const r = host.start(g, { port: o.port, internet: o.internet, world: w });
    if (r && r.ok) { worlds.touch(g.id, w.id); if (auth.user) auth.addHosted(auth.user, g.id); } return r;
  });
  ipcMain.handle('host:stop', async e => { if (fromLauncher(e)) await host.stop(); return true; });
  ipcMain.handle('host:cf', e => fromLauncher(e) ? host.installCf() : { error: 'Not allowed' });
  // ---------- server worlds ----------
  const hostable = gid => { const g = gameById(String(gid)); return g && g.server ? g : null; };
  const running = (gid, id) => host.state.gameId === gid && host.state.worldId === id && (host.state.status === 'online' || host.state.status === 'starting' || !!host.exiting);
  ipcMain.handle('worlds:list', (e, gid) => {
    const g = fromLauncher(e) && hostable(gid); if (!g) return { worlds: [], last: null };
    const l = worlds.list(g.id), last = l.slice().sort((a, b) => b.played - a.played)[0];
    return { worlds: l, last: last && last.played ? last.id : null };
  });
  ipcMain.handle('worlds:create', (e, gid, o) => {
    const g = fromLauncher(e) && hostable(gid); if (!g || !auth.user) return { error: 'Not allowed' }; o = o || {};
    return worlds.create(g.id, { name: o.name, seed: o.seed, pvp: o.pvp !== false, loot: o.loot !== false, owner: ownerOf(g.id) });
  });
  ipcMain.handle('worlds:import', async (e, gid) => {
    const g = fromLauncher(e) && hostable(gid); if (!g || !auth.user) return { error: 'Not allowed' };
    const r = await dialog.showOpenDialog(launcher, { title: 'Import a world', properties: ['openFile'], filters: [{ name: 'World files', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths[0]) return { cancel: true };
    return worlds.importFile(g.id, r.filePaths[0], ownerOf(g.id));
  });
  ipcMain.handle('worlds:export', async (e, gid, id) => {
    const g = fromLauncher(e) && hostable(gid); if (!g) return { error: 'Not allowed' }; const w = worlds.get(g.id, String(id)); if (!w) return { error: 'World not found' };
    const r = await dialog.showSaveDialog(launcher, { title: 'Export world', defaultPath: path.join(app.getPath('documents'), w.name.replace(/[^\w\- ]+/g, '_') + '.json'), filters: [{ name: 'World file', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { cancel: true };
    return worlds.exportTo(g.id, w.id, r.filePath);
  });
  ipcMain.handle('worlds:rename', (e, gid, id, name) => { const g = fromLauncher(e) && hostable(gid); if (!g) return { error: 'Not allowed' }; const r = worlds.rename(g.id, String(id), name); if (r.ok && host.state.worldId === String(id) && host.state.gameId === g.id) host.state.worldName = String(name).trim().slice(0, 30); return r; });
  ipcMain.handle('worlds:cfg', (e, gid, id, c) => {
    const g = fromLauncher(e) && hostable(gid); if (!g) return { error: 'Not allowed' };
    if (running(g.id, String(id))) return { error: 'Stop the server first. While it runs, the owner can type /pvp off or /loot off in chat.' };
    return worlds.setCfg(g.id, String(id), c || {});
  });
  ipcMain.handle('worlds:delete', (e, gid, id) => {
    const g = fromLauncher(e) && hostable(gid); if (!g) return { error: 'Not allowed' }; const w = worlds.get(g.id, String(id)); if (!w) return { error: 'World not found' };
    if (running(g.id, w.id)) return { error: 'Stop the server first.' };
    const r = dialog.showMessageBoxSync(launcher, { type: 'warning', buttons: ['Delete forever', 'Keep it'], defaultId: 1, cancelId: 1, title: 'Loft', message: 'Delete "' + w.name + '"?', detail: 'The world, its buildings and every account saved on it are removed. Export it first if you want a copy.' });
    return r === 0 ? worlds.remove(g.id, w.id) : { cancel: true };
  });
  ipcMain.handle('shell:open', (e, what, gid, wid) => {
    if (!fromLauncher(e)) return false; const g = gameById(String(gid));
    const dir = what === 'server' ? path.join(app.getPath('userData'), 'servers', String(gid)) : what === 'world' && g && worlds.dir(g.id, String(wid)) ? worlds.dir(g.id, String(wid)) : what === 'game' && g ? g.dir : what === 'data' ? app.getPath('userData') : null;
    if (!dir) return false; try { fs.mkdirSync(dir, { recursive: true }); } catch (x) {} shell.openPath(dir); return true;
  });
  ipcMain.handle('app:copy', (e, t) => { if (fromLauncher(e)) clipboard.writeText(String(t)); return true; });
}
