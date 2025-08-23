const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connectSerial: (portName) => ipcRenderer.invoke('connect-serial', portName),
  sendSerial: (message) => ipcRenderer.invoke('send-serial', message),
  onSerialData: (cb) => {
    ipcRenderer.removeAllListeners('serial-data');
    ipcRenderer.on('serial-data', (event, data) => cb(data));
  },
  listSerialPorts: async () => {
    return await ipcRenderer.invoke('list-serial-ports');
  },
  onMenuAction: (cb) => {
    ipcRenderer.removeAllListeners('menu-action');
    ipcRenderer.on('menu-action', (_event, payload) => cb(payload));
  },
  getAppVersion: async () => {
    return await ipcRenderer.invoke('get-app-version');
  }
});
