const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { SerialPort } = require('serialport');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/* ─────────────────────────────────────────────
   BACKEND START (PROD ONLY)
───────────────────────────────────────────── */
function startBackend() {
  if (backendProcess) return;

  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'server.cjs')
    : path.join(__dirname, '..', 'backend', 'server.cjs');

  // Verify backend file exists
  const fs = require('fs');
  if (!fs.existsSync(backendPath)) {
    console.error(`Backend file not found at: ${backendPath}`);
    return;
  }

  // Find Node.js executable - try multiple strategies
  let nodePath;
  
  if (app.isPackaged) {
    // In packaged app, use bundled Node.js from extraResources
    const resourcesDir = process.resourcesPath;
    const bundledNodePath = path.join(resourcesDir, 'nodejs', 'node.exe');
    
    const possiblePaths = [
      // Bundled Node.js (priority)
      bundledNodePath,
      // Fallback locations
      path.join(resourcesDir, 'node.exe'),
      path.join(resourcesDir, 'node'),
      path.join(path.dirname(process.execPath), 'node.exe'),
      path.join(path.dirname(process.execPath), 'node'),
    ];
    
    nodePath = possiblePaths.find(p => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
    
    // Fallback: use system Node.js (user must have Node.js installed)
    if (!nodePath) {
      nodePath = 'node'; // Let system PATH resolve it
      console.warn('Bundled Node.js not found, using system Node.js');
      console.warn('Make sure Node.js is installed and available in PATH');
    } else {
      console.log(`Using bundled Node.js: ${nodePath}`);
    }
  } else {
    // In dev mode, try to find node in the same directory as electron
    const electronDir = path.dirname(process.execPath);
    const devNodePaths = [
      path.join(electronDir, 'node.exe'),
      path.join(electronDir, 'node'),
      path.join(electronDir, '..', 'node_modules', '.bin', 'node'),
    ];
    
    nodePath = devNodePaths.find(p => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
    
    // Final fallback
    if (!nodePath) {
      nodePath = 'node';
    }
  }

  console.log(`Starting backend with Node: ${nodePath}`);
  console.log(`Backend path: ${backendPath}`);

  // Set up environment for backend process
  const backendEnv = {
    ...process.env,
    NODE_ENV: app.isPackaged ? 'production' : 'development',
  };

  // In packaged mode, set NODE_PATH to find dependencies
  if (app.isPackaged) {
    const backendDir = path.dirname(backendPath);
    const backendNodeModulesPath = path.join(backendDir, 'node_modules');
    const resourcesNodeModulesPath = path.join(process.resourcesPath, 'node_modules');
    
    // Prioritize backend/node_modules, then resources/node_modules
    const nodePaths = [];
    if (fs.existsSync(backendNodeModulesPath)) {
      nodePaths.push(backendNodeModulesPath);
    }
    if (fs.existsSync(resourcesNodeModulesPath)) {
      nodePaths.push(resourcesNodeModulesPath);
    }
    
    if (nodePaths.length > 0) {
      const existingNodePath = process.env.NODE_PATH || '';
      backendEnv.NODE_PATH = existingNodePath 
        ? `${nodePaths.join(path.delimiter)}${path.delimiter}${existingNodePath}`
        : nodePaths.join(path.delimiter);
      console.log(`NODE_PATH set to: ${backendEnv.NODE_PATH}`);
    } else {
      console.warn('No node_modules found for backend dependencies!');
    }
  }

  // Mark that this is a standalone Node.js process (not Electron)
  backendEnv.ELECTRON_RUN_AS_NODE = '1';
  // Remove Electron-related env vars that might confuse the backend
  delete backendEnv.ELECTRON_NO_ATTACH_CONSOLE;
  delete backendEnv.ELECTRON_IS_DEV;


  // backendProcess = spawn(process.execPath, [backendPath], {
  backendProcess = spawn(nodePath, [backendPath], {
    cwd: path.dirname(backendPath),
    stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr for debugging
    windowsHide: false, // Show window for debugging (set to true later)
    env: backendEnv,
    shell: false,
  });

  // Log backend output for debugging
  let backendOutput = '';
  let backendErrors = '';

  backendProcess.stdout.on('data', (data) => {
    const output = data.toString();
    backendOutput += output;
    console.log(`[Backend] ${output.trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    const error = data.toString();
    backendErrors += error;
    console.error(`[Backend Error] ${error.trim()}`);
  });

  backendProcess.on('error', (err) => {
    console.error(`Failed to start backend: ${err.message}`);
    console.error(`Node path used: ${nodePath}`);
    console.error(`Backend path: ${backendPath}`);
    console.error(`Working directory: ${path.dirname(backendPath)}`);
    if (backendErrors) {
      console.error(`Backend stderr: ${backendErrors}`);
    }
    backendProcess = null;
  });

  backendProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`Backend exited with code ${code}${signal ? `, signal ${signal}` : ''}`);
      if (backendErrors) {
        console.error(`Backend stderr output: ${backendErrors}`);
      }
      if (backendOutput) {
        console.log(`Backend stdout output: ${backendOutput}`);
      }
    } else {
      console.log(`Backend exited with code ${code}${signal ? `, signal ${signal}` : ''}`);
    }
    backendProcess = null;
  });
}


const net = require('net');

function waitForPort(port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const sockets = [];
    let timer = null;
    let settled = false;

    const cleanup = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      // Remove all listeners before destroying to prevent event handlers from firing
      sockets.forEach(sock => {
        sock.removeAllListeners();
        if (!sock.destroyed) {
          sock.destroy();
        }
      });
      sockets.length = 0;
    };

    const safeResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    timer = setInterval(() => {
      if (settled) return;

      const socket = new net.Socket();
      sockets.push(socket);

      socket
        .once('error', () => {
          if (settled) return;
          // Remove from array before destroying to avoid cleanup issues
          const index = sockets.indexOf(socket);
          if (index > -1) sockets.splice(index, 1);
          socket.removeAllListeners();
          socket.destroy();

          if (Date.now() - start > timeout) {
            safeReject(new Error(`Port ${port} not available after ${timeout}ms`));
          }
        })
        .once('connect', () => {
          if (settled) return;
          // Remove from array before destroying
          const index = sockets.indexOf(socket);
          if (index > -1) sockets.splice(index, 1);
          socket.removeAllListeners();
          socket.destroy();
          safeResolve();
        })
        .connect(port, '127.0.0.1');
    }, 300);
  });
}

/* ─────────────────────────────────────────────
   WINDOW
───────────────────────────────────────────── */
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

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    // Open DevTools in production for debugging backend issues
    // TODO: Remove this after confirming backend works
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools();
  }
}

/* ─────────────────────────────────────────────
   APP READY
───────────────────────────────────────────── */
app.whenReady().then(async () => {
  if (app.isPackaged) {
    console.log('=== Starting Backend Server ===');
    startBackend();
    
    // Give backend a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Wait for backend to be ready before creating window (longer timeout in production)
    try {
      await waitForPort(5174, 20000); // 20 second timeout for production
      console.log('✅ Backend is ready and listening on port 5174');
    } catch (err) {
      console.error('❌ Backend failed to start or is not available:', err.message);
      console.error('The app will continue but login may not work.');
      console.error('Check the console output above for backend startup errors.');
      
      // Show error in renderer
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          console.error('Backend server failed to start. Check main process console for details.');
        `);
      }
    }
  } else {
    // In dev mode, wait for backend if it's running
    try {
      await waitForPort(5174, 5000);
    } catch (err) {
      console.warn('Backend not available, continuing anyway');
    }
  }

  createWindow();

  const template = [
    {
      label: 'Home',
      click: () => mainWindow?.webContents.send('menu-action', { action: 'open-home' }),
    },
    {
      label: 'Graph',
      click: () => mainWindow?.webContents.send('menu-action', { action: 'open-graph' }),
    },
    {
      label: 'Editor',
      click: () => mainWindow?.webContents.send('menu-action', { action: 'open-editor' }),
    },
    {
      label: 'File',
      submenu: [{ role: 'close' }, { type: 'separator' }, { role: 'quit' }],
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
    { role: 'window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
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

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/* ─────────────────────────────────────────────
   CLEAN SHUTDOWN
───────────────────────────────────────────── */
app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ─────────────────────────────────────────────
   SERIAL IPC (UNCHANGED)
───────────────────────────────────────────── */
let port;

ipcMain.handle('connect-serial', async (_, portName) => {
  if (port) port.close();

  port = new SerialPort({ path: portName, baudRate: 9600 });
  port.on('data', (data) => {
    mainWindow?.webContents.send('serial-data', data.toString());
  });

  return true;
});

ipcMain.handle('send-serial', async (_, message) => {
  if (port && port.writable) {
    port.write(message + '\n');
    return true;
  }
  return false;
});

ipcMain.handle('list-serial-ports', async () => {
  return await SerialPort.list();
});

/* ─────────────────────────────────────────────
   APP VERSION
───────────────────────────────────────────── */
ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});
