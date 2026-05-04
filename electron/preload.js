const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    // Existing
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (_event, payload) => callback(payload))
    },
    onOllamaStatus: (callback) => {
        ipcRenderer.on('ollama-status', (_event, payload) => callback(payload))
    },
    setupOllama:  () => ipcRenderer.invoke('setup-ollama'),
    getVersion:   () => ipcRenderer.invoke('get-version'),

    // Loading screen step updates
    onLoadingStep: (callback) => {
        ipcRenderer.on('loading-step', (_event, data) => callback(data))
    },

    // Ollama install prompt (in-page, replaces native dialog)
    onOllamaPrompt: (callback) => {
        ipcRenderer.on('ollama-prompt', (_event, data) => callback(data))
    },
    respondOllamaPrompt: (value) => {
        ipcRenderer.send('ollama-prompt-response', value)
    },

    // Check / install Ollama from Settings page
    checkOllama:   () => ipcRenderer.invoke('check-ollama'),
    installOllama: () => ipcRenderer.invoke('install-ollama'),

    // Listen for install progress from Settings page
    onOllamaInstallProgress: (callback) => {
        ipcRenderer.on('ollama-install-progress', (_event, data) => callback(data))
    },

    // Cleanup listeners (call on component unmount to avoid leaks)
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel)
    },
})