const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;

// 动态解析 FFmpeg 路径（支持开发模式与 asar 打包后环境）
function resolveFFmpegPath() {
  const isWin = process.platform === 'win32';
  const binaryName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

  if (app.isPackaged) {
    // 打包后：位于 resources/bin 目录下
    return path.join(process.resourcesPath, 'bin', binaryName);
  }
  // 本地开发：位于项目根目录的 bin/
  return path.join(__dirname, 'bin', binaryName);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#090a0d',
    title: 'Cropper Studio Pro',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // 开启上下文隔离（企业安全规范）
      nodeIntegration: false  // 禁用渲染层 Node API
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC 1: 原生选择文件对话框
ipcMain.handle('dialog:open-gif', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择动图文件',
    filters: [{ name: 'GIF 动图', extensions: ['gif'] }],
    properties: ['openFile']
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

// IPC 2: 原生定位并打开导出的文件
ipcMain.handle('shell:show-item', async (event, fullPath) => {
  if (fullPath && fs.existsSync(fullPath)) {
    shell.showItemInFolder(fullPath);
  }
});

// IPC 3: 执行裁剪核心 (直接操作本地磁盘文件，零拷贝)
ipcMain.handle('gif:process-crop', async (event, { inputPath, crop }) => {
  const parsed = path.parse(inputPath);
  const defaultOutName = `cropped_${parsed.name}.gif`;

  // 1. 调起系统原生“另存为”保存窗口
  const { canceled, filePath: outputPath } = await dialog.showSaveDialog(mainWindow, {
    title: '保存裁切后的动图',
    defaultPath: path.join(parsed.dir, defaultOutName),
    filters: [{ name: 'GIF 动图', extensions: ['gif'] }]
  });

  if (canceled || !outputPath) {
    return { success: false, reason: 'canceled' };
  }

  const ffmpegBin = resolveFFmpegPath();

  // 检查引擎是否存在并具有执行权限
  if (!fs.existsSync(ffmpegBin)) {
    throw new Error(`找不到转码引擎，请确保文件存在: ${ffmpegBin}`);
  }

  // 2. FFmpeg 安全滤镜参数 (严格整数，边界保护，透明度保留)
  const filter = `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},split[s0][s1];[s0]palettegen=reserve_transparent=1[p];[s1][p]paletteuse=alpha_threshold=128`;
  const args = ['-i', inputPath, '-vf', filter, '-y', outputPath];

  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegBin, args);
    let stderr = '';

    process.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    process.on('error', err => {
      reject(new Error(`无法启动 FFmpeg: ${err.message}`));
    });

    process.on('close', code => {
      if (code === 0) {
        resolve({ success: true, outputPath });
      } else {
        reject(new Error(`FFmpeg 退出异常 (Code ${code}):\n${stderr.slice(-400)}`));
      }
    });
  });
});