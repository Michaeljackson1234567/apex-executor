const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('apex', {
  // Window
  minimize:       () => ipcRenderer.send('win-minimize'),
  maximize:       () => ipcRenderer.send('win-maximize'),
  close:          () => ipcRenderer.send('win-close'),
  // Core
  inject:         () => ipcRenderer.invoke('inject'),
  executeScript:  (s) => ipcRenderer.invoke('execute-script', s),
  checkRoblox:    () => ipcRenderer.invoke('check-roblox'),
  getRobloxUser:  () => ipcRenderer.invoke('get-roblox-user'),
  // Scripts hub
  searchScripts:  (q, p) => ipcRenderer.invoke('search-scripts', q, p),
  fetchScripts:   (p) => ipcRenderer.invoke('fetch-scripts', p),
  fetchRawScript: (u) => ipcRenderer.invoke('fetch-raw-script', u),
  // Saved scripts
  saveScript:     (name, code) => ipcRenderer.invoke('save-script', name, code),
  getSavedScripts:() => ipcRenderer.invoke('get-saved-scripts'),
  deleteScript:   (f) => ipcRenderer.invoke('delete-script', f),
  openScriptsFolder: () => ipcRenderer.invoke('open-scripts-folder'),
  // Settings
  setTopmost:     (v) => ipcRenderer.invoke('set-topmost', v),
  setOpacity:     (v) => ipcRenderer.invoke('set-opacity', v),
  // Auto-update (GitHub Sync)
  getVersion:         () => ipcRenderer.invoke('get-version'),
  checkForUpdate:     () => ipcRenderer.invoke('check-for-update'),
  syncUpdate:         (files, ver, log) => ipcRenderer.invoke('sync-update', files, ver, log),
  restartApp:         () => ipcRenderer.invoke('restart-app'),
  getPendingChangelog:() => ipcRenderer.invoke('get-pending-changelog'),
  markChangelogSeen:  () => ipcRenderer.invoke('mark-changelog-seen'),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress', (_ev, pct) => cb(pct)),
});
