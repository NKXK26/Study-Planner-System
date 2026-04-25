const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for update status events from main process
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, payload) => callback(payload))
  },
  // App version for display in your UI
  getVersion: () => ipcRenderer.invoke('get-version'),
})