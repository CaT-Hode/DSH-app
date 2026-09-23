const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  restart: () => ipcRenderer.invoke('dsh:restart-shared-service'),
  recoverPluginUpdate: () => ipcRenderer.invoke('dsh:recover-plugin-update'),
  startupState: () => ipcRenderer.invoke('dsh:startup-state'),
  copyStartupLog: () => ipcRenderer.invoke('dsh:copy-startup-log'),
  onStartupState: listener => {
    const receive = (_event, state) => listener(state)
    ipcRenderer.on('dsh:startup-state', receive)
    return () => ipcRenderer.removeListener('dsh:startup-state', receive)
  },
})
