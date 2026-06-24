const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(command, args) {
    return ipcRenderer.invoke('app:invoke', command, args)
  },
  pickDirectory(defaultPath) {
    return ipcRenderer.invoke('app:pick-directory', defaultPath)
  },
})
