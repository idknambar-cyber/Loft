// Only games loaded from the app's own files get the Loft bridge (the game window never loads web pages).
const { contextBridge, ipcRenderer } = require('electron');
const info = ipcRenderer.sendSync('ds:info');
if (info) {
  contextBridge.exposeInMainWorld('loft', {
    user: info.user, game: info.game, join: info.join || undefined,
    cred: () => ipcRenderer.invoke('ds:cred'),
    host: o => ipcRenderer.invoke('ds:host', o && typeof o == 'object' ? { name: String(o.name || '') } : undefined),
    pub: () => ipcRenderer.sendSync('ds:pub'),
    prompt: (m, d) => ipcRenderer.sendSync('ds:prompt', String(m == null ? '' : m), d == null ? '' : String(d)),
    alert: m => ipcRenderer.sendSync('ds:alert', String(m == null ? '' : m)),
    confirm: m => ipcRenderer.sendSync('ds:confirm', String(m == null ? '' : m)),
    openHost: () => ipcRenderer.send('ds:openHost')
  });
}
