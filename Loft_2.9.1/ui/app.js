'use strict';
const api = window.loft, NS = 'http://www.w3.org/2000/svg';
const S = { user: null, canKeep: false, games: [], store: [], profile: null, host: null, view: 'library', gid: null, tab: 'play',
  gate: 'in', err: '', logOpen: false, online: navigator.onLine, pw: {}, pwShown: {}, form: { port: '3000', internet: true }, recent: [], worlds: {}, wsel: {}, nw: null, ren: null };
try { S.recent = JSON.parse(localStorage.getItem('ds.recent') || '[]'); } catch (e) {}
const saveRecent = () => { try { localStorage.setItem('ds.recent', JSON.stringify(S.recent.slice(0, 8))); } catch (e) {} };
const COLORS = ['#4fb0a5', '#e2a64a', '#d4502f', '#6f8fe8', '#7dbb5d', '#e07aa0', '#b27be0', '#9aa3ad'];

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (k === 'class') e.className = v;
    else if (k === 'on') for (const ev in v) e.addEventListener(ev, v[ev]);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function toast(msg) { const t = h('div', { class: 'toast' }, msg); document.getElementById('toasts').append(t); setTimeout(() => t.remove(), 4200); }
const copy = async (t, what) => { await api.copy(t); toast((what || 'Text') + ' copied'); };
const gameOf = id => S.games.find(g => g.id === id);
const stat = g => (S.profile && S.profile.stats && S.profile.stats[g.id]) || { ms: 0, launches: 0, hosted: 0, last: 0 };
const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const okHex = c => /^#[0-9a-f]{6}$/i.test(c || '');
const fmtTime = ms => ms < 6e4 ? (ms ? 'Under a minute' : 'None yet') : ms < 36e5 ? Math.round(ms / 6e4) + ' min' : (ms / 36e5).toFixed(1) + ' h';
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
const priceText = p => !p ? 'Free' : '$' + (p / 100).toFixed(2);
const accentVars = c => '--accent:' + c + ';--accent-ink:' + inkFor(c) + ';--accent-soft:' + soft(c);
function inkFor(hex) { const n = parseInt(hex.slice(1), 16); return ((.299 * (n >> 16) + .587 * (n >> 8 & 255) + .114 * (n & 255)) / 255) > .6 ? '#101113' : '#ffffff'; }
function soft(hex) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',.18)'; }
function setAccent(c) { const r = document.documentElement.style; if (!okHex(c)) c = '#4fb0a5'; r.setProperty('--accent', c); r.setProperty('--accent-ink', inkFor(c)); r.setProperty('--accent-soft', soft(c)); }

const svg = (d, w = 20) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  library: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  store: svg('<path d="M4.5 8.5h15l-1.2 10a2 2 0 0 1-2 1.7H7.7a2 2 0 0 1-2-1.7z"/><path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>', 18),
  mark: `<svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="25" height="25" rx="8"/><path d="M9 21h14M9 15l7-5.5 7 5.5"/></svg>`
};

/* ---------- art: each game brings its own ---------- */
function harbor(p) {
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  let s = `<svg xmlns="${NS}" viewBox="0 0 1200 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
<linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06090e"/><stop offset=".6" stop-color="#13212d"/><stop offset="1" stop-color="#3b4d58"/></linearGradient>
<radialGradient id="${p}gl"><stop offset="0" stop-color="#ffd37e" stop-opacity=".95"/><stop offset=".35" stop-color="#ffb347" stop-opacity=".35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<linearGradient id="${p}sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2f3b"/><stop offset="1" stop-color="#070b10"/></linearGradient>
<linearGradient id="${p}fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb0bb" stop-opacity="0"/><stop offset=".5" stop-color="#9fb0bb" stop-opacity=".22"/><stop offset="1" stop-color="#9fb0bb" stop-opacity="0"/></linearGradient></defs>
<rect width="1200" height="340" fill="url(#${p}sky)"/>`;
  for (let i = 0; i < 44; i++) s += `<circle cx="${(rnd() * 1200) | 0}" cy="${(rnd() * 140) | 0}" r="${(.5 + rnd() * .9).toFixed(1)}" fill="#dfe7ea" opacity="${(.25 + rnd() * .5).toFixed(2)}"/>`;
  s += `<circle cx="905" cy="84" r="74" fill="url(#${p}gl)" opacity=".3"/><circle cx="905" cy="84" r="26" fill="#dfe5e3"/>`;
  let x = 0; while (x < 1200) { const w = 50 + rnd() * 90, hh = 26 + rnd() * 50; s += `<rect x="${x | 0}" y="${(216 - hh) | 0}" width="${w | 0}" height="${hh | 0}" fill="#0e1822"/>`; x += w + 4 + rnd() * 12; }
  for (const cx of [190, 620, 1000]) s += `<g fill="#0a1118" stroke="#0a1118"><rect x="${cx}" y="122" width="14" height="140" stroke="none"/><rect x="${cx + 72}" y="122" width="14" height="140" stroke="none"/><rect x="${cx - 60}" y="112" width="240" height="12" stroke="none"/><rect x="${cx + 36}" y="66" width="9" height="48" stroke="none"/><line x1="${cx + 40}" y1="68" x2="${cx + 190}" y2="112" stroke-width="3"/><line x1="${cx + 40}" y1="68" x2="${cx - 56}" y2="112" stroke-width="3"/><line x1="${cx + 150}" y1="124" x2="${cx + 150}" y2="176" stroke-width="1.5"/><rect x="${cx + 138}" y="176" width="26" height="9" stroke="none"/></g>`;
  const C = ['#7a2f1f', '#2f4a5a', '#6a5a2a', '#3a3f46', '#52341f', '#25404a']; let cx = 30;
  while (cx < 1190) { const n = 1 + ((rnd() * 3) | 0), w = 44 + rnd() * 16; for (let k = 0; k < n; k++) s += `<rect x="${cx | 0}" y="${262 - (k + 1) * 16}" width="${w | 0}" height="15" fill="${C[(rnd() * C.length) | 0]}"/>`; cx += w + 3 + (rnd() < .25 ? 40 : 0); }
  s += `<rect y="262" width="1200" height="10" fill="#0b121a"/><rect y="272" width="1200" height="68" fill="url(#${p}sea)"/>`;
  for (let i = 0; i < 14; i++) s += `<rect x="${(rnd() * 1100) | 0}" y="${276 + ((rnd() * 56) | 0)}" width="${(60 + rnd() * 150) | 0}" height="1.5" fill="#9fb0bb" opacity="${(.04 + rnd() * .08).toFixed(2)}"/>`;
  [120, 470, 790, 1110].forEach((lx, i) => { s += `<rect x="${lx}" y="176" width="3" height="86" fill="#0b121a"/><rect x="${lx - 10}" y="174" width="16" height="4" fill="#0b121a"/><circle class="${i === 1 ? 'fl' : ''}" cx="${lx - 4}" cy="176" r="64" fill="url(#${p}gl)"/><ellipse cx="${lx - 4}" cy="292" rx="26" ry="3" fill="#ffb347" opacity=".25"/>`; });
  return s + `<rect y="196" width="1200" height="96" fill="url(#${p}fog)"/></svg>`;
}
function art(g, p) {
  if (g && g.art === 'harbor') return harbor(p);
  const c = g && okHex(g.color) ? g.color : '#3f5468';
  return `<svg xmlns="${NS}" viewBox="0 0 1200 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${p}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#0e0f11"/></linearGradient></defs><rect width="1200" height="340" fill="url(#${p}b)"/><text x="600" y="215" text-anchor="middle" font-size="150" font-weight="700" fill="#fff" opacity=".18" font-family="Bahnschrift,Segoe UI,sans-serif">${g ? initials(g.name) : ''}</text></svg>`;
}

/* ---------- render ---------- */
let queued = false;
function render() {
  if (queued) return; queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const root = document.getElementById('root'), c = root.querySelector('.content'), top = c ? c.scrollTop : 0;
    const g = S.view === 'game' ? gameOf(S.gid) : null;
    setAccent(g ? g.color : (S.profile && S.profile.color));
    root.replaceChildren(S.user ? appView() : gateView());
    const n = root.querySelector('.content'); if (n) n.scrollTop = top;
  });
}

function gateArt() {
  const hb = S.games.find(g => g.art === 'harbor') || S.games[0];
  return h('div', { class: 'gate-art' }, h('div', { class: 'glow' }),
    h('div', { class: 'fan' },
      h('div', { class: 'ft f3 ph' }, 'Your next game'), h('div', { class: 'ft f2 ph' }, 'Your next game'),
      h('div', { class: 'ft f1', html: hb ? art(hb, 'ga') : '' })),
    h('div', { class: 'gate-brand' }, h('div', { class: 'lg' }, h('span', { html: ICON.mark.replace('width="30" height="30"', 'width="46" height="46"') }), h('h1', {}, 'Loft')), h('p', {}, 'All your games in one place.')));
}
function gateView() {
  const up = S.gate === 'up';
  const name = h('input', { type: 'text', maxlength: 16, autocomplete: 'username', spellcheck: 'false', placeholder: 'Your name' });
  const pw = h('input', { type: 'password', maxlength: 64, autocomplete: up ? 'new-password' : 'current-password', placeholder: up ? 'At least 6 characters' : 'Your password' });
  const pw2 = h('input', { type: 'password', maxlength: 64, autocomplete: 'new-password', placeholder: 'Type it again' });
  const keep = h('input', { type: 'checkbox' }); keep.checked = S.canKeep;
  const err = h('p', { class: 'err', role: 'alert' }, S.err);
  const btn = h('button', { class: 'btn pri big', type: 'submit' }, up ? 'Create account' : 'Sign in');
  const go = async () => {
    err.textContent = '';
    if (up && pw.value !== pw2.value) { err.textContent = 'The two passwords are different'; return; }
    btn.disabled = true;
    const r = await (up ? api.signup(name.value, pw.value, keep.checked) : api.login(name.value, pw.value, keep.checked));
    if (r.error) { S.err = r.error; err.textContent = r.error; btn.disabled = false; return; }
    S.err = ''; S.user = r.user; S.canKeep = r.canKeep; S.profile = r.profile; S.view = 'library'; render();
  };
  setTimeout(() => name.focus(), 40);
  return h('main', { class: 'gate' }, gateArt(),
    h('form', { class: 'gate-form', on: { submit: e => { e.preventDefault(); go(); } } },
      h('h2', {}, up ? 'Create your account' : 'Sign in'),
      h('p', { class: 'sub' }, up ? 'One name and password for every game here. The account stays on this PC.' : 'Welcome back.'),
      h('label', { class: 'fld' }, h('span', {}, 'Name'), name),
      h('label', { class: 'fld' }, h('span', {}, 'Password'), pw),
      up ? h('label', { class: 'fld' }, h('span', {}, 'Repeat password'), pw2) : null,
      up ? h('div', { class: 'callout' }, h('b', {}, 'You cannot change this password later.'), ' Your game logins are made from it, so changing it would lock you out of servers. Pick one you will remember.') : null,
      S.canKeep ? h('label', { class: 'chk' }, keep, h('span', {}, 'Keep me signed in on this PC')) : null,
      err, btn,
      h('button', { class: 'link', type: 'button', style: 'align-self:flex-start', on: { click: () => { S.gate = up ? 'in' : 'up'; S.err = ''; render(); } } }, up ? 'I already have an account' : 'New here? Create an account'),
      h('p', { class: 'fine' }, 'Game servers get a separate game login made from your account. They never see your Loft password.')));
}

function appView() { return h('div', { class: 'app' }, railView(), h('main', { class: 'content' }, S.view === 'store' ? storeView() : S.view === 'profile' ? profileView() : S.view === 'game' && gameOf(S.gid) ? gameView(gameOf(S.gid)) : libraryView())); }

const isLive = g => S.host && S.host.gameId === g.id && (S.host.status === 'online' || S.host.status === 'starting');
function go(view, o) { S.view = view; if (o) Object.assign(S, o); if (view === 'profile') loadPw(); render(); }
function openGame(g, tab) { S.gid = g.id; S.tab = tab || 'play'; if (S.tab === 'host') loadWorlds(g.id); go('game'); }

function railView() {
  const hs = S.host, live = hs && hs.gameId && (hs.status === 'online' || hs.status === 'starting') ? gameOf(hs.gameId) : null;
  const nav = (key, label, icon) => h('button', { class: 'nv' + ((S.view === key || (key === 'library' && S.view === 'game')) ? ' on' : ''), on: { click: () => go(key) } }, h('span', { class: 'ic', html: icon }), label);
  return h('aside', { class: 'rail' },
    h('div', { class: 'brand' }, h('span', { html: ICON.mark }), h('span', { class: 'wm' }, 'Loft')),
    nav('library', 'Library', ICON.library), nav('store', 'Store', ICON.store),
    h('div', { class: 'rail-sp' }),
    live ? h('button', { class: 'chip live', on: { click: () => openGame(live, 'host') } }, h('span', { class: 'dot ' + hs.status }), 'Hosting ' + (hs.worldName || live.name) + (hs.players != null ? ', ' + hs.players + ' online' : '')) : null,
    !S.online ? h('div', { class: 'chip' }, h('span', { class: 'dot off' }), 'Offline. Games, accounts and Wi-Fi hosting still work.') : null,
    h('button', { class: 'me' + (S.view === 'profile' ? ' on' : ''), on: { click: () => go('profile') } }, h('span', { class: 'av' }, S.user[0].toUpperCase()), h('span', { class: 'me-tx' }, h('b', {}, S.user), h('small', {}, 'Profile'))));
}
const pageHead = (t, sub) => h('div', { class: 'pg-h' }, h('h1', {}, t), sub ? h('p', {}, sub) : null);
async function launch(g, join) { const r = await api.launch(g.id, join ? { join } : {}); if (r && r.error) toast(r.error); else toast('Starting ' + g.name + '...'); }

/* ---------- library ---------- */
function libraryView() {
  const gs = [...S.games].sort((a, b) => stat(b).last - stat(a).last), f = gs[0], rest = gs.slice(1);
  return h('div', { class: 'wrap' }, pageHead('Library', S.games.length + (S.games.length === 1 ? ' game' : ' games')),
    f ? featured(f) : null,
    h('div', { class: 'grid' }, rest.map(tile),
      h('button', { class: 'tile add', on: { click: () => go('store') } }, h('span', { class: 'plus' }, '+'), h('b', {}, 'Find more games'), h('small', {}, 'New games show up in the Store'))));
}
function featured(f) {
  const s = stat(f);
  return h('article', { class: 'feat', style: accentVars(okHex(f.color) ? f.color : '#4fb0a5') },
    h('div', { class: 'feat-art', html: art(f, 'f') }), h('div', { class: 'feat-fade' }),
    h('div', { class: 'feat-tx' },
      h('p', { class: 'kick' }, s.launches ? 'Pick up where you left off' : 'Ready when you are'),
      h('h2', { class: 'gtitle', style: f.font ? 'font-family:' + f.font : '' }, f.name),
      h('p', { class: 'tag' }, f.tagline),
      h('div', { class: 'row' }, h('button', { class: 'btn pri big', on: { click: () => launch(f) } }, 'Play'), h('button', { class: 'btn glass big', on: { click: () => openGame(f) } }, 'Game page'), isLive(f) ? h('span', { class: 'live' }, 'Hosting') : null),
      h('p', { class: 'meta' }, s.ms ? fmtTime(s.ms) + ' played' : 'Not played yet')));
}
function tile(g) {
  return h('button', { class: 'tile', on: { click: () => openGame(g) } }, h('div', { class: 'tile-art', html: art(g, 't' + g.id) }),
    h('div', { class: 'tile-b' }, h('b', {}, g.name), h('small', {}, isLive(g) ? 'Hosting now' : fmtTime(stat(g).ms) === 'None yet' ? 'Not played yet' : fmtTime(stat(g).ms) + ' played')));
}

/* ---------- store ---------- */
function storeView() {
  return h('div', { class: 'wrap' }, pageHead('Store', 'Games you can add to your library.'),
    S.store.map(it => {
      const own = gameOf(it.id), c = okHex(it.color) ? it.color : '#4fb0a5';
      return h('article', { class: 'shop', style: accentVars(c) },
        h('div', { class: 'shop-art', html: art(it, 's' + it.id) }),
        h('div', { class: 'shop-b' },
          h('h3', { class: 'gtitle', style: (it.font ? 'font-family:' + it.font + ';' : '') + 'font-size:34px' }, it.name),
          h('p', { class: 'tag' }, it.tagline),
          h('div', { class: 'tags' }, (it.tags || []).map(t => h('span', { class: 'tag-chip' }, t))),
          h('div', { class: 'shop-f' }, h('span', { class: 'price' + (it.price ? '' : ' free') }, priceText(it.price)),
            own ? [h('span', { class: 'owned' }, 'In your library'), h('button', { class: 'btn pri', on: { click: () => openGame(own) } }, 'Open')]
              : h('button', { class: 'btn', disabled: true }, it.status === 'available' ? 'Get' : 'Coming soon'))));
    }),
    h('div', { class: 'soon' }, h('b', {}, 'More games are on the way'), 'They will appear here with their price.'));
}

/* ---------- profile ---------- */
async function loadPw() {
  for (const g of S.games) if (S.pw[g.id] == null) { try { S.pw[g.id] = await api.gamePassword(g.id) || ''; } catch (e) {} }
  if (S.view === 'profile') render();
}
async function refreshProfile() { const p = await api.profile(); if (p) { S.profile = p; render(); } }
function profileView() {
  const P = S.profile || { name: S.user, created: Date.now(), color: '#4fb0a5', stats: {} };
  const tot = S.games.reduce((a, g) => a + stat(g).ms, 0), hosted = S.games.reduce((a, g) => a + stat(g).hosted, 0), maxMs = Math.max(1, ...S.games.map(g => stat(g).ms));
  const last = [...S.games].sort((a, b) => stat(b).last - stat(a).last)[0];
  const stc = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));
  return h('div', { class: 'wrap' }, pageHead('Profile'),
    h('div', { class: 'pf-head' }, h('span', { class: 'av xl' }, S.user[0].toUpperCase()),
      h('div', {}, h('h2', {}, S.user), h('p', { class: 'small' }, 'Member since ' + fmtDate(P.created)),
        h('div', { class: 'sws', role: 'radiogroup', 'aria-label': 'Your colour' }, COLORS.map(c => h('button', { class: 'sw' + (P.color === c ? ' on' : ''), style: 'background:' + c, title: 'Use this colour', 'aria-label': c, on: { click: async () => { const r = await api.setColor(c); if (r) { S.profile = r; render(); } } } }))))),
    h('div', { class: 'stats' }, stc(fmtTime(tot) === 'None yet' ? '0 min' : fmtTime(tot), 'Time played'), stc(String(S.games.length), S.games.length === 1 ? 'Game in library' : 'Games in library'), stc(String(hosted), hosted === 1 ? 'Server started' : 'Servers started'), stc(last && stat(last).last ? last.name : 'Nothing yet', 'Last played')),
    h('p', { class: 'sec' }, 'Playtime'),
    h('div', { class: 'panel2' }, S.games.length ? h('div', { class: 'bars' }, S.games.map(g => h('div', { class: 'bar-r' }, h('b', {}, g.name), h('div', { class: 'track' }, h('i', { style: 'width:' + Math.max(stat(g).ms ? 3 : 0, Math.round(stat(g).ms / maxMs * 100)) + '%' }), ), h('span', {}, fmtTime(stat(g).ms))))) : h('p', { class: 'empty-note' }, 'Games you play show up here.')),
    h('p', { class: 'sec' }, 'Game logins'),
    h('div', { class: 'panel2' }, h('p', { class: 'small' }, 'Inside Loft you never type a password for a game. If you play a web version in a browser, sign in there with your name and the game password below.'),
      S.games.map(g => { const pw = S.pw[g.id]; if (!pw) return null; const shown = !!S.pwShown[g.id];
        return h('div', {}, h('p', { class: 'small', style: 'margin-top:12px' }, g.name + ' game password'), h('div', { class: 'pwrow' }, h('code', {}, shown ? pw : '\u2022'.repeat(14)),
          h('button', { class: 'btn', on: { click: () => { S.pwShown[g.id] = !shown; render(); } } }, shown ? 'Hide' : 'Show'), h('button', { class: 'btn', on: { click: () => copy(pw, 'Password') } }, 'Copy'))); })),
    h('p', { class: 'sec' }, 'Account'),
    h('div', { class: 'panel2' }, h('p', { class: 'small' }, 'Your account lives on this PC and works without internet. The password cannot be changed, because your game logins are made from it.'),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', on: { click: () => api.openFolder('data') } }, 'Open data folder'),
        h('button', { class: 'btn danger', on: { click: async () => { const r = await api.logout(); S.user = r.user; S.profile = null; S.canKeep = r.canKeep; S.gate = 'in'; S.view = 'library'; render(); } } }, 'Sign out'))));
}

/* ---------- game page ---------- */
function gameView(g) {
  const tabs = [['play', 'Play']].concat(g.hostable ? [['host', 'Host a server'], ['join', 'Join a server']] : []);
  const live = S.host && S.host.gameId === g.id ? S.host.status : 'stopped';
  return h('div', { class: 'wrap' },
    h('button', { class: 'back', on: { click: () => go('library') } }, h('span', { class: 'ic', html: ICON.back }), 'Library'),
    h('header', { class: 'hero' }, h('div', { class: 'hero-art', html: art(g, 'h') }), h('div', { class: 'hero-fade' }),
      h('div', { class: 'hero-tx' }, h('h1', { class: 'gtitle', style: g.font ? 'font-family:' + g.font : '' }, g.name), h('p', { class: 'tag' }, g.tagline), h('p', { class: 'meta' }, 'Version ' + g.version + (g.players ? ', ' + g.players : '')))),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { class: 'tab' + (S.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(S.tab === k), on: { click: () => { S.tab = k; if (k === 'host') loadWorlds(g.id); render(); } } }, l, k === 'host' && live !== 'stopped' ? h('span', { class: 'dot ' + live }) : null))),
    S.tab === 'host' && g.hostable ? hostPanel(g) : S.tab === 'join' && g.hostable ? joinPanel(g) : playPanel(g));
}
function playPanel(g) {
  return h('div', { class: 'cols' },
    h('div', {}, h('p', { class: 'lead' }, g.description),
      h('div', { class: 'row' }, h('button', { class: 'btn pri big', on: { click: () => launch(g) } }, 'Play ' + g.name), h('button', { class: 'btn', on: { click: () => api.openFolder('game', g.id) } }, 'Open game folder'))),
    h('aside', { class: 'note' }, h('b', {}, 'You are signed in as ' + S.user),
      h('p', {}, 'Multiplayer servers log you in by themselves, so there is nothing to type. Singleplayer works without internet.'),
      h('p', {}, h('b', {}, 'Moving worlds from your browser?'), ' Worlds saved in a browser stay in that browser. In the browser version open Singleplayer, pick a world and press Export. Then press Import in the same place here.')));
}
const kindLabel = { internet: 'Internet link, works from anywhere', lan: 'Your Wi-Fi or home network', public: 'Public IP address, needs port forwarding on your router' };
function helperBox(st) {
  if (st.cf) return h('p', { class: 'small' }, 'Internet helper installed.');
  const busy = st.cfProgress != null;
  return h('div', { class: 'box' + (st.noTunnel ? ' warn' : '') }, h('h3', {}, 'Internet helper needed'),
    h('p', {}, st.noTunnel ? 'No internet helper was found, so only people on your Wi-Fi can join right now. Download it, then stop and start the server again.' : 'To let friends join from anywhere without changing router settings, Loft uses a free Cloudflare tunnel. It needs one small download (about 30 MB, internet required once).'),
    h('button', { class: 'btn', disabled: busy, on: { click: async () => { const r = await api.installHelper(); if (r && r.error) toast(r.error); else toast('Internet helper installed'); } } }, busy ? 'Downloading' + (st.cfProgress > 0 ? ' ' + Math.round(st.cfProgress * 100) + '%' : '...') : 'Download helper'),
    busy ? h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.max(4, Math.round((st.cfProgress > 0 ? st.cfProgress : .05) * 100)) + '%' })) : null);
}

/* ---------- server worlds ---------- */
const ago = t => { if (!t) return 'never'; const d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
async function loadWorlds(gid) {
  const r = await api.worlds(gid), l = (r && r.worlds) || []; S.worlds[gid] = l;
  if (!l.some(w => w.id === S.wsel[gid])) S.wsel[gid] = (r && r.last && l.some(w => w.id === r.last)) ? r.last : (l[0] ? l[0].id : null);
  render();
}
async function setWorldCfg(g, w, c) { const r = await api.worldCfg(g.id, w.id, c); if (r && r.error) toast(r.error); await loadWorlds(g.id); }
async function importWorld(g) {
  const r = await api.worldImport(g.id); if (!r || r.cancel) return; if (r.error) { toast(r.error); return; }
  S.wsel[g.id] = r.world.id; S.nw = null; toast('Imported "' + r.world.name + '" (' + r.pieces + ' building pieces)'); await loadWorlds(g.id);
}
async function exportWorld(g, w) { const r = await api.worldExport(g.id, w.id); if (r && r.error) toast(r.error); else if (r && r.ok) toast('World exported'); }
async function removeWorld(g, w) { const r = await api.worldDelete(g.id, w.id); if (r && r.error) toast(r.error); else if (r && r.ok) toast('World deleted'); await loadWorlds(g.id); }
async function saveRename(g) { const R = S.ren; if (!R) return; const r = await api.worldRename(g.id, R.id, R.value); if (r && r.error) { toast(r.error); return; } S.ren = null; await loadWorlds(g.id); }
async function createWorld(g) {
  const f = S.nw, r = await api.worldCreate(g.id, { name: f.name, seed: f.seed, pvp: f.pvp, loot: f.loot }); if (r.error) { toast(r.error); return; }
  S.nw = null; S.wsel[g.id] = r.world.id; toast('Created "' + r.world.name + '"'); await loadWorlds(g.id);
}
function worldCard(g, w, on) {
  const R = S.ren && S.ren.id === w.id ? S.ren : null, st = f => e => { e.stopPropagation(); f(); };
  let head;
  if (R) {
    const inp = h('input', { type: 'text', maxlength: 30, value: R.value, 'aria-label': 'World name', on: { input: e => { R.value = e.target.value; }, click: e => e.stopPropagation(), keydown: e => { if (e.key === 'Enter') saveRename(g); else if (e.key === 'Escape') { S.ren = null; render(); } } } });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
    head = h('div', { class: 'wc-b' }, inp);
  } else head = h('div', { class: 'wc-b' }, h('b', {}, w.name), h('small', {}, ['Day ' + w.day, w.pieces + (w.pieces === 1 ? ' building piece' : ' building pieces'), w.players + (w.players === 1 ? ' account' : ' accounts'), 'hosted ' + ago(w.played)].join('   \u00b7   ')));
  return h('div', { class: 'wcard' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on), tabindex: '0', on: { click: () => { S.wsel[g.id] = w.id; render(); }, keydown: e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); S.wsel[g.id] = w.id; render(); } } } },
    h('span', { class: 'rad' }), head,
    h('div', { class: 'wc-t' },
      h('button', { class: 'tg' + (w.pvp ? ' on' : ''), title: 'Players can fight each other. Click to switch (while the server is stopped).', on: { click: st(() => setWorldCfg(g, w, { pvp: !w.pvp })) } }, 'PvP ' + (w.pvp ? 'on' : 'off')),
      h('button', { class: 'tg' + (w.loot ? ' on' : ''), title: 'The loser of a fight drops their items. Click to switch.', on: { click: st(() => setWorldCfg(g, w, { loot: !w.loot })) } }, 'Loot drop ' + (w.loot ? 'on' : 'off')),
      h('span', { class: 'wc-a' },
        R ? [h('button', { class: 'mini', on: { click: st(() => saveRename(g)) } }, 'Save'), h('button', { class: 'mini', on: { click: st(() => { S.ren = null; render(); }) } }, 'Cancel')]
          : [h('button', { class: 'mini', on: { click: st(() => { S.ren = { id: w.id, value: w.name }; render(); }) } }, 'Rename'), h('button', { class: 'mini', on: { click: st(() => exportWorld(g, w)) } }, 'Export'),
             h('button', { class: 'mini', on: { click: st(() => api.openFolder('world', g.id, w.id)) } }, 'Folder'), h('button', { class: 'mini bad', on: { click: st(() => removeWorld(g, w)) } }, 'Delete')])));
}
function newWorldForm(g) {
  const f = S.nw;
  const name = h('input', { type: 'text', maxlength: 30, placeholder: 'New world', value: f.name, on: { input: e => { f.name = e.target.value; }, keydown: e => { if (e.key === 'Enter') createWorld(g); } } });
  const seed = h('input', { type: 'text', maxlength: 20, placeholder: 'Random', value: f.seed, on: { input: e => { f.seed = e.target.value; }, keydown: e => { if (e.key === 'Enter') createWorld(g); } } });
  const pvp = h('input', { type: 'checkbox', on: { change: e => { f.pvp = e.target.checked; } } }); pvp.checked = f.pvp;
  const loot = h('input', { type: 'checkbox', on: { change: e => { f.loot = e.target.checked; } } }); loot.checked = f.loot;
  setTimeout(() => { if (document.activeElement === document.body) name.focus(); }, 30);
  return h('div', { class: 'box nwform' }, h('h3', {}, 'New world'),
    h('label', { class: 'fld' }, h('span', {}, 'Name'), name),
    h('label', { class: 'fld' }, h('span', {}, 'Seed (optional)'), seed),
    h('label', { class: 'chk' }, pvp, h('span', {}, 'PvP', h('small', {}, 'Players can hurt each other. Everybody is protected for a few seconds after joining or respawning.'))),
    h('label', { class: 'chk' }, loot, h('span', {}, 'Loot drop on PvP death', h('small', {}, 'A player who is killed by another player drops their items where they fell.'))),
    h('div', { class: 'row' }, h('button', { class: 'btn pri', on: { click: () => createWorld(g) } }, 'Create world'), h('button', { class: 'btn', on: { click: () => { S.nw = null; render(); } } }, 'Cancel')));
}
function hostPanel(g) {
  const st = S.host && S.host.gameId === g.id ? S.host : Object.assign({}, S.host || {}, { status: 'stopped', share: [], log: [], error: null, tunnelFailed: false });
  const run = st.status === 'online' || st.status === 'starting';
  const names = { stopped: 'Stopped', starting: 'Starting', online: 'Online', error: 'Problem' };
  const out = [h('div', { class: 'h-top' }, h('span', { class: 'pill ' + st.status }, names[st.status] || 'Stopped'), run && st.worldName ? h('b', {}, st.worldName) : null, st.status === 'online' && st.players != null ? h('span', { class: 'ppl' }, st.players + ' of ' + st.max + ' players online') : null)];
  if (st.error && st.status === 'error') out.push(h('div', { class: 'box warn' }, h('h3', {}, 'The server could not run'), h('p', {}, st.error)));
  if (!run) {
    const ws = S.worlds[g.id], sel = S.wsel[g.id];
    out.push(h('p', { class: 'sech first' }, 'World'));
    if (!ws) out.push(h('p', { class: 'small' }, 'Loading your worlds...'));
    else {
      if (!ws.length && !S.nw) out.push(h('div', { class: 'box' }, h('h3', {}, 'No server worlds yet'), h('p', {}, 'Create a new world, or import one from a file (for example a world you exported from the game). Every world is saved on this PC, so you can pick it again next time.')));
      if (ws.length) out.push(h('div', { class: 'wlist' }, ws.map(w => worldCard(g, w, w.id === sel))));
    }
    out.push(h('div', { class: 'row', style: 'margin-bottom:8px' },
      h('button', { class: 'btn', on: { click: () => { S.nw = S.nw ? null : { name: '', seed: '', pvp: true, loot: true }; render(); } } }, S.nw ? 'Cancel' : 'New world'),
      h('button', { class: 'btn', on: { click: () => importWorld(g) } }, 'Import from file...'),
      h('button', { class: 'link', on: { click: () => api.openFolder('server', g.id) } }, 'Open server folder')));
    if (S.nw) out.push(newWorldForm(g));
    const port = h('input', { type: 'number', min: 1024, max: 65535, value: S.form.port, on: { input: e => { S.form.port = e.target.value; } } });
    const net = h('input', { type: 'checkbox', on: { change: e => { S.form.internet = e.target.checked; render(); } } }); net.checked = S.form.internet;
    out.push(h('div', { class: 'form3', style: 'margin-top:14px' }, h('label', { class: 'fld' }, h('span', {}, 'Port'), port),
      h('label', { class: 'chk span' }, net, h('span', {}, 'Let friends join over the internet', h('small', {}, S.online ? 'Makes a link you can send to anybody. Turn this off to play only on your own Wi-Fi.' : 'You are offline right now, so only your Wi-Fi will work. Turn this off to skip the link.')))));
    if (S.form.internet) out.push(helperBox(st));
    out.push(h('div', { class: 'row' }, h('button', { class: 'btn pri big', disabled: !sel, on: { click: async () => { const r = await api.hostStart(g.id, { world: sel, port: S.form.port, internet: S.form.internet }); if (r && r.error) toast(r.error); else { refreshProfile(); loadWorlds(g.id); } } } }, 'Start server'),
      sel ? h('span', { class: 'small' }, 'Hosts "' + ((ws || []).find(w => w.id === sel) || {}).name + '"') : null));
    out.push(h('p', { class: 'small', style: 'margin-top:14px' }, 'Each world is saved on this PC with its buildings and every account on it. Pick the same world next time to carry on, or Import to bring one from a file.'));
  } else {
    out.push(h('div', { class: 'row' }, h('button', { class: 'btn pri big', disabled: st.status !== 'online', on: { click: () => launch(g, ['localhost:' + st.port]) } }, 'Play on your server'), h('button', { class: 'btn danger', on: { click: () => api.hostStop() } }, 'Stop server')));
    if (st.status === 'starting') out.push(h('p', { class: 'small', style: 'margin-top:14px' }, 'Starting up. Your internet link appears here in a few seconds.'));
    if (st.status === 'online') {
      const sh = st.share || [], best = sh[0];
      out.push(h('p', { class: 'sech' }, 'Invite friends'));
      if (st.tunnelFailed) out.push(h('div', { class: 'box warn' }, h('h3', {}, 'No internet link yet'), h('p', {}, 'Loft could not open an internet link. Check that you are online. Friends on your Wi-Fi can still join with the addresses below. Stop and start the server to try again.')));
      else if (st.internet && !st.tunnel && !st.noTunnel) out.push(h('p', { class: 'small' }, 'Opening your internet link...'));
      if (best) {
        out.push(h('div', { class: 'share' }, sh.map(s => h('div', { class: 'srow' }, h('div', {}, h('b', {}, kindLabel[s.kind] || s.kind), h('span', {}, s.addr)), h('button', { class: 'btn', on: { click: () => copy(s.addr, 'Address') } }, 'Copy')))));
        out.push(h('button', { class: 'btn', on: { click: () => copy('Join my ' + g.name + ' server: ' + best.url + '\nIn a browser just open the link. With Loft choose Join a server and paste ' + best.addr, 'Invite') } }, 'Copy invite message'));
        out.push(h('p', { class: 'small', style: 'margin-top:10px' }, 'Friends can open the link in any browser, phone included. Friends who use Loft can paste the address under Join a server.'));
      } else if (!st.internet || st.noTunnel) out.push(h('p', { class: 'small' }, 'Waiting for an address to share...'));
      if (st.internet && (!st.cf || st.noTunnel)) out.push(h('div', { style: 'margin-top:16px' }, helperBox(st)));
    }
  }
  const log = (st.log || []).join('\n');
  if (log) out.push(h('details', { class: 'log', open: S.logOpen, on: { toggle: e => { S.logOpen = e.target.open; } } }, h('summary', {}, 'Server log'), h('pre', {}, log)));
  return h('div', {}, out);
}
function normAddr(v) { v = String(v || '').trim().replace(/\/+$/, ''); if (!v) return ''; if (/^https?:\/\//i.test(v)) return v; return /trycloudflare\.com/i.test(v) ? 'https://' + v : v; }
function joinPanel(g) {
  const inp = h('input', { type: 'text', placeholder: 'abc-def.trycloudflare.com or 192.168.1.20:3000', spellcheck: 'false' });
  const goJoin = a => { a = normAddr(a); if (!a) { toast('Paste the server address first'); return; } S.recent = [{ addr: a }].concat(S.recent.filter(r => r.addr !== a)); saveRecent(); launch(g, [a]); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') goJoin(inp.value); });
  return h('div', {}, h('p', { class: 'lead' }, 'Got an address from a friend? Paste it here and you land in their world, already signed in.'),
    h('div', { class: 'row', style: 'max-width:700px;flex-wrap:nowrap' }, h('div', { style: 'flex:1' }, inp), h('button', { class: 'btn pri', on: { click: () => goJoin(inp.value) } }, 'Join')),
    h('p', { class: 'sech' }, 'Recent servers'),
    S.recent.length ? h('div', { class: 'recent' }, S.recent.map(r => h('div', { class: 'srow' }, h('div', {}, h('b', {}, r.addr.replace(/^https?:\/\//, ''))),
      h('div', { class: 'row' }, h('button', { class: 'btn', on: { click: () => goJoin(r.addr) } }, 'Join'), h('button', { class: 'btn danger', on: { click: () => { S.recent = S.recent.filter(x => x !== r); saveRecent(); render(); } } }, 'Remove'))))) : h('p', { class: 'empty-note' }, 'Servers you join show up here.'));
}

/* ---------- start ---------- */
(async function boot() {
  const st = await api.state(); if (!st) return;
  Object.assign(S, { user: st.user, canKeep: st.canKeep, games: st.games, store: st.store || [], profile: st.profile, host: st.host });
  api.onHost(s => { const prev = S.host && S.host.status; S.host = s; if (!S.user) return; if (prev !== s.status && S.view === 'game' && S.tab === 'host' && S.gid) loadWorlds(S.gid); const a = document.activeElement; if (a && a.tagName === 'INPUT' && s.status === 'stopped') return; render(); });
  api.onNav(t => { if (!S.user) return; if (t === 'refresh') { refreshProfile(); if (S.view === 'game' && S.tab === 'host' && S.gid) loadWorlds(S.gid); return; } const g = S.host && S.host.gameId && gameOf(S.host.gameId) || S.games.find(x => x.hostable); if (g) openGame(g, t); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (S.ren) { S.ren = null; render(); } else if (S.nw) { S.nw = null; render(); } } });
  addEventListener('online', () => { S.online = true; render(); }); addEventListener('offline', () => { S.online = false; render(); });
  render();
})();
