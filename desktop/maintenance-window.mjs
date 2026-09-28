/** A shell-owned diagnostics document with a fixed, sender-checked IPC API. */
import { BrowserWindow, ipcMain, app } from 'electron'
import { fileURLToPath } from 'node:url'

/** Create one reusable diagnostics window; the caller owns its operation lifecycle. */
export function maintenanceWindow({ parent, read, action }) {
  let window
  const requireFrame = (event) => {
    if (
      !window ||
      window.isDestroyed() ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      !event.senderFrame.url.startsWith(new URL('../lib/maintenance.html', import.meta.url).href + '?')
    )
      throw new Error('Invalid diagnostics sender')
  }
  ipcMain.handle('dsh:maintenance-read', (event) => {
    requireFrame(event)
    return read()
  })
  ipcMain.handle('dsh:maintenance-action', (event, request) => {
    requireFrame(event)
    return action(request)
  })
  return {
    async show() {
      if (window && !window.isDestroyed()) {
        window.show()
        window.focus()
        return
      }
      window = new BrowserWindow({
        parent,
        width: 1100,
        height: 780,
        minWidth: 880,
        minHeight: 600,
        title: 'DSH App',
        autoHideMenuBar: true,
        webPreferences: {
          preload: fileURLToPath(new URL('./maintenance-preload.cjs', import.meta.url)),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      window.setMenu(null)
      window.webContents.on('will-navigate', (event) => event.preventDefault())
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      await window.loadFile(fileURLToPath(new URL('../lib/maintenance.html', import.meta.url)), {
        query: { lang: app.getLocale() }
      })
    },
    progress(value) {
      if (window && !window.isDestroyed()) window.webContents.send('dsh:maintenance-progress', value)
    },
    dispose() {
      ipcMain.removeHandler('dsh:maintenance-read')
      ipcMain.removeHandler('dsh:maintenance-action')
      window?.destroy()
    }
  }
}
