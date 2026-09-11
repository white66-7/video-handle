const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let hardwareReady = null; // setupHardware 的 Promise

// 编码器候选配置表
const ENCODER_PRESETS = {
  nvidia: {
    encoder: 'h264_nvenc',
    label: 'NVIDIA NVENC',
    args: ['-c:v', 'h264_nvenc', '-preset', 'p2', '-cq', '23', '-pix_fmt', 'yuv420p']
  },
  intel: {
    encoder: 'h264_qsv',
    label: 'Intel QuickSync',
    args: ['-c:v', 'h264_qsv', '-global_quality', '23', '-pix_fmt', 'nv12']
  },
  amd: {
    encoder: 'h264_amf',
    label: 'AMD AMF',
    args: ['-c:v', 'h264_amf', '-quality', 'speed', '-pix_fmt', 'yuv420p']
  },
  apple: {
    encoder: 'h264_videotoolbox',
    label: 'Apple VideoToolbox',
    args: ['-c:v', 'h264_videotoolbox', '-q:v', '60', '-pix_fmt', 'yuv420p']
  },
  cpu: {
    encoder: 'libx264',
    label: 'CPU (libx264)',
    args: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '0', '-pix_fmt', 'yuv420p']
  }
};


// 当前生效的硬件编码配置（初始状态为未就绪）
let hardwareProfile = {
  encoder: ENCODER_PRESETS.cpu.encoder,
  encoderArgs: ENCODER_PRESETS.cpu.args,
  label: ENCODER_PRESETS.cpu.label,
  isHardware: false,
  gpuName: '',
  probeError: null,
  isReady: false
};

function resolveFFmpegPath() {
  const isWin = process.platform === 'win32';
  const binaryName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin', binaryName);
  }
  return path.join(__dirname, 'bin', binaryName);
}

// ---------------- 零延迟原生显卡识别（彻底淘汰耗时 3 秒的 powershell / wmic） ----------------
async function detectGpuNameAsync() {
  if (process.platform === 'darwin') return 'Apple Silicon / Metal';

  try {
    const gpuInfo = await app.getGPUInfo('basic');
    if (gpuInfo && Array.isArray(gpuInfo.gpuDevice) && gpuInfo.gpuDevice.length > 0) {
      const vendorNames = gpuInfo.gpuDevice.map(d => {
        if (d.vendorId === 0x10de) return 'NVIDIA';
        if (d.vendorId === 0x8086) return 'Intel';
        if (d.vendorId === 0x1002 || d.vendorId === 0x1022) return 'AMD';
        return d.driverVendor || '';
      }).filter(Boolean);

      if (vendorNames.length > 0) {
        return [...new Set(vendorNames)].join(' / ');
      }
    }
  } catch (err) {
    // 静默降级
  }
  return '';
}

// 候选编码器序列
function buildCandidates(gpuName) {
  const list = [];
  if (/NVIDIA/i.test(gpuName)) list.push(ENCODER_PRESETS.nvidia);
  if (/Intel/i.test(gpuName)) list.push(ENCODER_PRESETS.intel);
  if (/AMD/i.test(gpuName)) list.push(ENCODER_PRESETS.amd);
  if (process.platform === 'darwin') list.push(ENCODER_PRESETS.apple);

  // 没识别出特定厂商时，将通用硬件编码器按可能性排列
  if (list.length === 0 && process.platform === 'win32') {
    list.push(ENCODER_PRESETS.nvidia, ENCODER_PRESETS.intel, ENCODER_PRESETS.amd);
  }

  list.push(ENCODER_PRESETS.cpu);
  return list;
}

// 异步单项测试编码器可用性
function probeEncoder(ffmpegBin, preset) {
  return new Promise(resolve => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=0.04',
      '-frames:v', '1',
      ...preset.args,
      '-f', 'null', '-'
    ];

    let proc;
    try {
      proc = spawn(ffmpegBin, args, { windowsHide: true });
    } catch (err) {
      return resolve({ ok: false, error: `无法启动 FFmpeg: ${err.message}` });
    }

    let stderr = '';
    proc.stderr.on('data', chunk => stderr += chunk.toString());
    proc.on('error', err => resolve({ ok: false, error: err.message }));
    proc.on('close', code => {
      if (code === 0) return resolve({ ok: true, error: null });
      const firstError = stderr.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
      resolve({ ok: false, error: firstError || `探测退出码 ${code}` });
    });
  });
}

// ---------------- 后台静默自检 ----------------
async function setupHardware() {
  const gpuName = await detectGpuNameAsync();
  const ffmpegBin = resolveFFmpegPath();

  if (!fs.existsSync(ffmpegBin)) {
    hardwareProfile.probeError = `找不到转码引擎: ${ffmpegBin}`;
    hardwareProfile.isReady = true;
    notifyRenderer();
    return hardwareProfile;
  }

  const candidates = buildCandidates(gpuName);
  const hwPreferred = candidates[0] === ENCODER_PRESETS.cpu ? null : candidates[0];

  for (const preset of candidates) {
    const result = await probeEncoder(ffmpegBin, preset);

    if (result.ok) {
      hardwareProfile.encoder = preset.encoder;
      hardwareProfile.encoderArgs = preset.args;
      hardwareProfile.label = preset.label;
      hardwareProfile.isHardware = preset !== ENCODER_PRESETS.cpu;
      hardwareProfile.gpuName = gpuName;
      hardwareProfile.isReady = true;

      notifyRenderer();
      return hardwareProfile;
    }

    if (preset === hwPreferred) {
      hardwareProfile.probeError = result.error;
    }
  }

  hardwareProfile.isReady = true;
  notifyRenderer();
  return hardwareProfile;
}

function notifyRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system:hardware-profile-updated', publicProfile());
  }
}

function publicProfile() {
  return {
    encoder: hardwareProfile.encoder,
    label: hardwareProfile.label,
    isHardware: hardwareProfile.isHardware,
    gpuName: hardwareProfile.gpuName,
    probeError: hardwareProfile.probeError,
    isReady: hardwareProfile.isReady
  };
}

// ---------------- 窗口创建（极速秒开） ----------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: '#090a0d',
    title: 'Cropper Studio Pro',
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 首屏就绪瞬间展示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // 核心优化：等窗口彻底展示出来 300 毫秒后，再启动后台探测
    // 彻底避开 Chromium 图形渲染初始化高峰期，消除驱动锁竞争
    setTimeout(() => {
      if (!hardwareReady) {
        hardwareReady = setupHardware();
      }
    }, 300);
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

// ---------------- 通信协议 (IPC) ----------------

ipcMain.handle('system:get-hardware-profile', async () => {
  return publicProfile();
});

ipcMain.handle('dialog:open-gif', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择动图或视频文件',
    filters: [
      { name: '所有支持的媒体', extensions: ['gif', 'mp4', 'mov', 'webm', 'mkv', 'avi'] },
      { name: '视频文件 (*.mp4, *.mov, *.webm, *.mkv)', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] },
      { name: 'GIF 动图 (*.gif)', extensions: ['gif'] }
    ],
    properties: ['openFile']
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('video:get-frame', async (_event, filePath) => {
  const ffmpegBin = resolveFFmpegPath();
  if (!fs.existsSync(ffmpegBin)) throw new Error(`找不到转码引擎: ${ffmpegBin}`);

  return new Promise((resolve, reject) => {
    const args = [
      '-ss', '00:00:00.05',
      '-i', filePath,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-c:v', 'png',
      '-'
    ];

    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    const chunks = [];
    let stderr = '';

    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.stderr.on('data', chunk => stderr += chunk.toString());

    proc.on('close', code => {
      if (code === 0 && chunks.length > 0) {
        const buffer = Buffer.concat(chunks);
        resolve({ success: true, base64: `data:image/png;base64,${buffer.toString('base64')}` });
      } else {
        reject(new Error(`提取视频帧失败:\n${stderr.slice(-300)}`));
      }
    });

    proc.on('error', err => reject(new Error(`无法启动 FFmpeg: ${err.message}`)));
  });
});

ipcMain.handle('shell:show-item', async (_event, fullPath) => {
  if (fullPath && fs.existsSync(fullPath)) {
    shell.showItemInFolder(fullPath);
  }
});

function runFFmpeg(ffmpegBin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', chunk => stderr += chunk.toString());
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr));
    });
    proc.on('error', err => reject(err));
  });
}

// 导出裁切处理
ipcMain.handle('gif:process-crop', async (_event, { inputPath, crop }) => {
  // 如果导出时自检仍在进行中，等待其完成
  if (hardwareReady) await hardwareReady;

  const parsed = path.parse(inputPath);
  const isInputGif = parsed.ext.toLowerCase() === '.gif';

  const defaultExt = isInputGif ? '.gif' : '.mp4';
  const defaultOutName = `cropped_${parsed.name}${defaultExt}`;

  const saveFilters = isInputGif
    ? [{ name: 'GIF 动图 (*.gif)', extensions: ['gif'] }]
    : [
        { name: 'MP4 视频 (*.mp4)', extensions: ['mp4'] },
        { name: 'GIF 动图 (*.gif)', extensions: ['gif'] }
      ];

  const { canceled, filePath: outputPath } = await dialog.showSaveDialog(mainWindow, {
    title: '保存裁切后的文件',
    defaultPath: path.join(parsed.dir, defaultOutName),
    filters: saveFilters
  });

  if (canceled || !outputPath) return { success: false, reason: 'canceled' };

  const ffmpegBin = resolveFFmpegPath();
  const safeW = crop.w % 2 === 0 ? crop.w : crop.w - 1;
  const safeH = crop.h % 2 === 0 ? crop.h : crop.h - 1;
  const targetExt = path.extname(outputPath).toLowerCase();

  // 1. 输出为 GIF
  if (targetExt === '.gif') {
    let gifArgs = [];
    if (isInputGif) {
      gifArgs = ['-i', inputPath, '-vf', `crop=${safeW}:${safeH}:${crop.x}:${crop.y}`, '-y', outputPath];
    } else {
      gifArgs = [
        '-i', inputPath,
        '-vf', `fps=15,crop=${safeW}:${safeH}:${crop.x}:${crop.y},split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
        '-y', outputPath
      ];
    }
    await runFFmpeg(ffmpegBin, gifArgs);
    return { success: true, outputPath };
  }

  // 2. 输出为 MP4
  const gpuArgs = [
    '-i', inputPath,
    '-vf', `crop=${safeW}:${safeH}:${crop.x}:${crop.y}`,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:a', 'copy',
    ...hardwareProfile.encoderArgs,
    '-y', outputPath
  ];

  try {
    await runFFmpeg(ffmpegBin, gpuArgs);
    return {
      success: true,
      outputPath,
      encoder: hardwareProfile.encoder,
      encoderLabel: hardwareProfile.label,
      usedFallback: false,
      fallbackReason: null
    };
  } catch (primaryError) {
    const reason = primaryError.message.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0]
      || primaryError.message.slice(-200);

    if (!hardwareProfile.isHardware) {
      throw new Error(`导出失败:\n${reason}`);
    }

    // 硬件编码异常，自动 CPU 兜底
    const cpuArgs = [
      '-i', inputPath,
      '-vf', `crop=${safeW}:${safeH}:${crop.x}:${crop.y}`,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:a', 'copy',
      ...ENCODER_PRESETS.cpu.args,
      '-y', outputPath
    ];

    try {
      await runFFmpeg(ffmpegBin, cpuArgs);
      return {
        success: true,
        outputPath,
        encoder: ENCODER_PRESETS.cpu.encoder,
        encoderLabel: ENCODER_PRESETS.cpu.label,
        usedFallback: true,
        fallbackReason: reason
      };
    } catch (cpuError) {
      throw new Error(`导出失败:\n${cpuError.message.slice(-300)}`);
    }
  }
});