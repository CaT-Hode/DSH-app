const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('dshMaintenance', {
  read: () => ipcRenderer.invoke('dsh:maintenance-read'),
  action: (request) => ipcRenderer.invoke('dsh:maintenance-action', request),
  onProgress: (listener) => {
    const receive = (_event, value) => listener(value)
    ipcRenderer.on('dsh:maintenance-progress', receive)
    return () => ipcRenderer.removeListener('dsh:maintenance-progress', receive)
  }
})
