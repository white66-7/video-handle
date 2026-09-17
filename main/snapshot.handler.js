// main/snapshot.handler.js
const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { resolveFFmpegPath } = require('./hardware');

function registerSnapshotIPC(getMainWindow) {
  // 打开截取文件（限视频）
  ipcMain.handle('dialog:open-video', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择视频文件',
      filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] }],
      properties: ['openFile']
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });

  // 保存单帧
  ipcMain.handle('video:save-snapshot', async (_e, { inputPath, timestamp }) => {
    if (!inputPath) return { success: false, error: '输入文件无效' };

    const parsed = path.parse(inputPath);
    const timeFormatted = Math.max(0, timestamp).toFixed(2).replace('.', '_');

    const { canceled, filePath: outputPath } = await dialog.showSaveDialog(getMainWindow(), {
      title: '保存截取的画面',
      defaultPath: path.join(parsed.dir, `snapshot_${parsed.name}_${timeFormatted}s.png`),
      filters: [
        { name: 'PNG 无损图片 (*.png)', extensions: ['png'] },
        { name: 'JPEG 高清图片 (*.jpg)', extensions: ['jpg'] }
      ]
    });

    if (canceled || !outputPath) return { success: false, reason: 'canceled' };

    const ffmpegBin = resolveFFmpegPath();

    const args = [
      '-i', inputPath,
      '-ss', String(timestamp),
      '-frames:v', '1',
      '-q:v', '2',
      '-y',
      outputPath
    ];

    return new Promise((resolve) => {
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', chunk => stderr += chunk.toString());

      proc.on('close', code => {
        // 🌟 核心防御：必须真实存在且文件大于 0 字节才算成功！
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          // 截取成功后，自动在资源管理器高亮显示刚生成的图片！
          shell.showItemInFolder(outputPath);
          resolve({ success: true, outputPath });
        } else {
          console.error('截图失败日志:', stderr.slice(-300));
          resolve({ success: false, error: '截取图片未生成' });
        }
      });

      proc.on('error', err => resolve({ success: false, error: err.message }));
    });
  });
}

module.exports = { registerSnapshotIPC };