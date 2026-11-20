const $ = i => document.getElementById(i), v = $('v');
window.pw.init().then(d => { $('m').textContent = d.msg; v.value = d.def; v.focus(); v.select(); });
$('o').onclick = () => window.pw.done(v.value);
$('c').onclick = () => window.pw.done(null);
addEventListener('keydown', e => { if (e.key === 'Enter') window.pw.done(v.value); else if (e.key === 'Escape') window.pw.done(null); });
