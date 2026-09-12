// 1. 引入 ipcMain
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

const { setupHardware, registerHardwareIPC } = require('./main/hardware');
const { registerCropIPC } = require('./main/crop.handler');
const { registerSnapshotIPC } = require('./main/snapshot.handler');
const { registerCompressIPC } = require('./main/compress.handler');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1140,
    height: 760,
    minWidth: 960,
    minHeight: 650,
    show: false,
    frame: false, 
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

ipcMain.on('window-min', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('shell:show-item', async (_event, fullPath) => {
  if (fullPath) {
    shell.showItemInFolder(fullPath); // 唤起 Windows 资源管理器并高亮该文件
    return true;
  }
  return false;
});

ipcMain.on('window-max', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

registerHardwareIPC();
registerCropIPC(() => mainWindow);
registerSnapshotIPC(() => mainWindow);
registerCompressIPC(() => mainWindow);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});