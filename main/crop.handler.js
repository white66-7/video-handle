const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { resolveFFmpegPath, ENCODER_PRESETS, getProfile } = require('./hardware');

function runFFmpeg(ffmpegBin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', chunk => stderr += chunk.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
    proc.on('error', err => reject(err));
  });
}

function registerCropIPC(getMainWindow) {
  // 打开裁切支持的文件
  ipcMain.handle('dialog:open-gif', async () => {
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择文件',
      filters: [
        { name: '所有支持的媒体', extensions: ['gif', 'mp4', 'mov', 'webm', 'mkv', 'avi'] },
        { name: '视频文件', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] },
        { name: 'GIF 动图', extensions: ['gif'] }
      ],
      properties: ['openFile']
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });

  // 获取视频首帧
  ipcMain.handle('video:get-frame', async (_e, filePath) => {
    const ffmpegBin = resolveFFmpegPath();
    return new Promise((resolve, reject) => {
      const args = ['-ss', '00:00:00.05', '-i', filePath, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'];
      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      const chunks = [];
      let stderr = '';
      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.stderr.on('data', chunk => stderr += chunk.toString());
      proc.on('close', code => {
        if (code === 0 && chunks.length > 0) {
          resolve({ success: true, base64: `data:image/png;base64,${Buffer.concat(chunks).toString('base64')}` });
        } else {
          reject(new Error(`提取视频帧失败:\n${stderr.slice(-300)}`));
        }
      });
      proc.on('error', err => reject(new Error(`无法启动 FFmpeg: ${err.message}`)));
    });
  });

  // 执行裁切
  ipcMain.handle('gif:process-crop', async (_e, { inputPath, crop }) => {
    const profile = getProfile();
    const parsed = path.parse(inputPath);
    const isInputGif = parsed.ext.toLowerCase() === '.gif';
    const defaultExt = isInputGif ? '.gif' : '.mp4';

    const { canceled, filePath: outputPath } = await dialog.showSaveDialog(getMainWindow(), {
      title: '保存裁切后的文件',
      defaultPath: path.join(parsed.dir, `cropped_${parsed.name}${defaultExt}`),
      filters: isInputGif ? [{ name: 'GIF 动图', extensions: ['gif'] }] : [{ name: 'MP4 视频', extensions: ['mp4'] }, { name: 'GIF 动图', extensions: ['gif'] }]
    });
    if (canceled || !outputPath) return { success: false, reason: 'canceled' };

    const ffmpegBin = resolveFFmpegPath();
    const safeW = crop.w % 2 === 0 ? crop.w : crop.w - 1;
    const safeH = crop.h % 2 === 0 ? crop.h : crop.h - 1;
    const targetExt = path.extname(outputPath).toLowerCase();

    if (targetExt === '.gif') {
      const gifArgs = isInputGif
        ? ['-i', inputPath, '-vf', `crop=${safeW}:${safeH}:${crop.x}:${crop.y}`, '-y', outputPath]
        : ['-i', inputPath, '-vf', `fps=15,crop=${safeW}:${safeH}:${crop.x}:${crop.y},split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`, '-y', outputPath];
      await runFFmpeg(ffmpegBin, gifArgs);
      return { success: true, outputPath };
    }

    // MP4 导出（带自动降级 CPU 保护）
    const gpuArgs = ['-i', inputPath, '-vf', `crop=${safeW}:${safeH}:${crop.x}:${crop.y}`, '-map', '0:v:0', '-map', '0:a?', '-c:a', 'copy', ...profile.encoderArgs, '-y', outputPath];
    try {
      await runFFmpeg(ffmpegBin, gpuArgs);
      return { success: true, outputPath, encoderLabel: profile.label, usedFallback: false };
    } catch (primaryError) {
      if (!profile.isHardware) throw primaryError;
      const cpuArgs = ['-i', inputPath, '-vf', `crop=${safeW}:${safeH}:${crop.x}:${crop.y}`, '-map', '0:v:0', '-map', '0:a?', '-c:a', 'copy', ...ENCODER_PRESETS.cpu.args, '-y', outputPath];
      await runFFmpeg(ffmpegBin, cpuArgs);
      return { success: true, outputPath, encoderLabel: ENCODER_PRESETS.cpu.label, usedFallback: true, fallbackReason: primaryError.message.slice(-200) };
    }
  });
}

module.exports = { registerCropIPC };