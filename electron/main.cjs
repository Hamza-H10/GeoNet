const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { SerialPort } = require('serialport');
const path = require('path');


let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL('http://localhost:5173');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  // Build application menu with Graph and Editor
  const template = [
    // App-specific quick navigation entries
    {
      label: 'Home',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('menu-action', { action: 'open-home' });
      },
    },
    {
      label: 'Graph',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('menu-action', { action: 'open-graph' });
      },
    },
    {
      label: 'Editor',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('menu-action', { action: 'open-editor' });
      },
    },
    // Standard menus
    {
      label: 'File',
      submenu: [
        { role: 'close' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://www.electronjs.org');
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


// Handle IPC events for serial communication
let port;
ipcMain.handle('connect-serial', async (event, portName) => {
  if (port) {
    port.close();
  }
  port = new SerialPort({ path: portName, baudRate: 9600 });
  port.on('data', (data) => {
    if (mainWindow) mainWindow.webContents.send('serial-data', data.toString());
  });
  return true;
});

ipcMain.handle('send-serial', async (event, message) => {
  if (port && port.writable) {
    port.write(message + '\n');
    return true;
  }
  return false;
});

// List available serial ports
ipcMain.handle('list-serial-ports', async () => {
  const { SerialPort } = require('serialport');
  return await SerialPort.list();
});


// IPC handlers for backend communication can be added here

// Expose app version to renderer
ipcMain.handle('get-app-version', async () => {
  try {
    return app.getVersion();
  } catch {
    return '0.0.0';
  }
});
