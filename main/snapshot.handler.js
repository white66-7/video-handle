const { ipcMain, dialog } = require('electron');
const path = require('path');
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
    const parsed = path.parse(inputPath);
    const timeFormatted = timestamp.toFixed(2).replace('.', '_');

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
    const args = ['-ss', String(timestamp), '-i', inputPath, '-frames:v', '1', '-q:v', '2', '-y', outputPath];

    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      proc.on('close', code => code === 0 ? resolve({ success: true, outputPath }) : reject(new Error('截取失败')));
      proc.on('error', err => reject(err));
    });
  });
}

module.exports = { registerSnapshotIPC };