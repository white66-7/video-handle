// main/compress.handler.js
const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function registerCompressIPC(getMainWindow) {
  // 1. 弹出让用户自选保存文件夹
  ipcMain.handle('compress:select-output-dir', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: '选择压缩视频保存目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // 2. 定位并高亮输出文件
  ipcMain.handle('compress:show-in-folder', async (_event, fullPath) => {
    if (fullPath && fs.existsSync(fullPath)) {
      shell.showItemInFolder(fullPath);
      return true;
    }
    return false;
  });

  // 3. 原生 FFmpeg 压制并统计产物体积
  ipcMain.handle('compress:run-task', async (_event, payload) => {
    const { taskId, inputPath, outputDir, fileName, crf, scaleFilter, hwProfile } = payload;
    const ext = path.extname(fileName) || '.mp4';
    const baseName = path.basename(fileName, ext);
    const outputPath = path.join(outputDir, `${baseName}_min${ext}`);

    const win = getMainWindow();

    return new Promise((resolve) => {
      const args = ['-y', '-i', inputPath];

      if (scaleFilter) {
        args.push('-vf', scaleFilter);
      }

      // 编码器匹配
      if (hwProfile && hwProfile.isHardware) {
        if (hwProfile.encoder === 'h264_nvenc') {
          args.push('-c:v', 'h264_nvenc', '-cq', String(crf), '-preset', 'p4', '-pix_fmt', 'yuv420p');
        } else if (hwProfile.encoder === 'h264_qsv') {
          args.push('-c:v', 'h264_qsv', '-global_quality', String(crf), '-preset', 'medium');
        } else if (hwProfile.encoder === 'h264_amf') {
          args.push('-c:v', 'h264_amf', '-qp_i', String(crf), '-qp_p', String(crf));
        } else {
          args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'fast', '-pix_fmt', 'yuv420p');
        }
      } else {
        args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'fast', '-pix_fmt', 'yuv420p');
      }

      args.push('-c:a', 'aac', '-b:a', '128k', outputPath);

      const ffmpegProcess = spawn('ffmpeg', args);
      let totalDurationSec = 0;

      ffmpegProcess.stderr.on('data', (data) => {
        const str = data.toString();

        if (!totalDurationSec) {
          const durationMatch = str.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
          if (durationMatch) {
            totalDurationSec = parseFloat(durationMatch[1]) * 3600 + parseFloat(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
          }
        }

        const timeMatch = str.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch && totalDurationSec > 0) {
          const currentSec = parseFloat(timeMatch[1]) * 3600 + parseFloat(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
          const percent = Math.min(99, Math.round((currentSec / totalDurationSec) * 100));

          if (win && !win.isDestroyed()) {
            win.webContents.send('compress:progress', { taskId, percent });
          }
        }
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          // 👈 核心：读取压缩后文件的真实物理大小 (Bytes)
          let outputSize = 0;
          try {
            outputSize = fs.statSync(outputPath).size;
          } catch (e) {
            console.error('获取输出文件大小失败:', e);
          }
          resolve({ success: true, outputPath, outputSize });
        } else {
          resolve({ success: false, error: `FFmpeg 退出，错误码: ${code}` });
        }
      });

      ffmpegProcess.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  });
}

module.exports = { registerCompressIPC };