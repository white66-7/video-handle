const { app, BrowserWindow } = require('electron');
const path = require('path');

// 引入拆分出来的各功能模块
const { setupHardware, registerHardwareIPC } = require('./main/hardware');
const { registerCropIPC } = require('./main/crop.handler');
const { registerSnapshotIPC } = require('./main/snapshot.handler');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1140,
    height: 760,
    minWidth: 960,
    minHeight: 650,
    show: false,
    backgroundColor: '#090a0d',
    title: 'Cropper Studio',
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(() => setupHardware(mainWindow), 300);
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// 注册所有模块的 IPC 通信
registerHardwareIPC();
registerCropIPC(() => mainWindow);
registerSnapshotIPC(() => mainWindow);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});