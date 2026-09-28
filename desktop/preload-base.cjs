const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  restart: () => ipcRenderer.invoke('dsh:restart-shared-service'),
  recoverPluginUpdate: () => ipcRenderer.invoke('dsh:recover-plugin-update'),
  recoverCore: () => ipcRenderer.invoke('dsh:recover-core'),
  showDiagnostics: () => ipcRenderer.invoke('dsh:show-diagnostics'),
  startupState: () => ipcRenderer.invoke('dsh:startup-state'),
  copyStartupLog: () => ipcRenderer.invoke('dsh:copy-startup-log'),
  onStartupState: listener => {
    const receive = (_event, state) => listener(state)
    ipcRenderer.on('dsh:startup-state', receive)
    return () => ipcRenderer.removeListener('dsh:startup-state', receive)
  },
})
