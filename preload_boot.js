const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onBootStatus: (cb) => ipcRenderer.on('boot-status', (_ev, data) => cb(data)),
  onBootVersion: (cb) => ipcRenderer.on('boot-version', (_ev, ver) => cb(ver)),
});
