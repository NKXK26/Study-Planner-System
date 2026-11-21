const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hodConsole', {
  login: credentials => ipcRenderer.invoke('hod:login', credentials),
});
