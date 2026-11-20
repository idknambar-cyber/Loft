const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pw', { init: () => ipcRenderer.invoke('pw:init'), done: v => ipcRenderer.send('pw:done', v) });
