const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ENCODER_PRESETS = {
  nvidia: { encoder: 'h264_nvenc', label: 'NVIDIA NVENC', args: ['-c:v', 'h264_nvenc', '-preset', 'p2', '-cq', '23', '-pix_fmt', 'yuv420p'] },
  intel: { encoder: 'h264_qsv', label: 'Intel QuickSync', args: ['-c:v', 'h264_qsv', '-global_quality', '23', '-pix_fmt', 'nv12'] },
  amd: { encoder: 'h264_amf', label: 'AMD AMF', args: ['-c:v', 'h264_amf', '-quality', 'speed', '-pix_fmt', 'yuv420p'] },
  apple: { encoder: 'h264_videotoolbox', label: 'Apple VideoToolbox', args: ['-c:v', 'h264_videotoolbox', '-q:v', '60', '-pix_fmt', 'yuv420p'] },
  cpu: { encoder: 'libx264', label: 'CPU (libx264)', args: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '0', '-pix_fmt', 'yuv420p'] }
};

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
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', binaryName)
    : path.join(__dirname, '..', 'bin', binaryName);
}

async function detectGpuNameAsync() {
  if (process.platform === 'darwin') return 'Apple';
  try {
    const gpuInfo = await app.getGPUInfo('basic');
    if (gpuInfo?.gpuDevice?.length > 0) {
      const names = gpuInfo.gpuDevice.map(d => {
        if (d.vendorId === 0x10de) return 'NVIDIA';
        if (d.vendorId === 0x8086) return 'Intel';
        if (d.vendorId === 0x1002 || d.vendorId === 0x1022) return 'AMD';
        return d.driverVendor || '';
      }).filter(Boolean);
      if (names.length > 0) return [...new Set(names)].join(' / ');
    }
  } catch (e) {}
  return '';
}

function buildCandidates(gpuName) {
  const list = [];
  if (/NVIDIA/i.test(gpuName)) list.push(ENCODER_PRESETS.nvidia);
  if (/Intel/i.test(gpuName)) list.push(ENCODER_PRESETS.intel);
  if (/AMD/i.test(gpuName)) list.push(ENCODER_PRESETS.amd);
  if (process.platform === 'darwin') list.push(ENCODER_PRESETS.apple);
  if (list.length === 0 && process.platform === 'win32') {
    list.push(ENCODER_PRESETS.nvidia, ENCODER_PRESETS.intel, ENCODER_PRESETS.amd);
  }
  list.push(ENCODER_PRESETS.cpu);
  return list;
}

function probeEncoder(ffmpegBin, preset) {
  return new Promise(resolve => {
    const args = ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=0.04', '-frames:v', '1', ...preset.args, '-f', 'null', '-'];
    let proc;
    try {
      proc = spawn(ffmpegBin, args, { windowsHide: true });
    } catch (err) {
      return resolve({ ok: false, error: err.message });
    }
    let stderr = '';
    proc.stderr.on('data', chunk => stderr += chunk.toString());
    proc.on('close', code => {
      if (code === 0) return resolve({ ok: true, error: null });
      const firstError = stderr.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
      resolve({ ok: false, error: firstError || `退出码 ${code}` });
    });
  });
}

async function setupHardware(mainWindow) {
  const gpuName = await detectGpuNameAsync();
  const ffmpegBin = resolveFFmpegPath();

  if (!fs.existsSync(ffmpegBin)) {
    hardwareProfile.probeError = `找不到转码引擎: ${ffmpegBin}`;
    hardwareProfile.isReady = true;
    notify(mainWindow);
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
      notify(mainWindow);
      return hardwareProfile;
    }
    if (preset === hwPreferred) hardwareProfile.probeError = result.error;
  }

  hardwareProfile.isReady = true;
  notify(mainWindow);
  return hardwareProfile;
}

function notify(mainWindow) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system:hardware-profile-updated', publicProfile());
  }
}

function publicProfile() {
  return { ...hardwareProfile };
}

function registerHardwareIPC() {
  ipcMain.handle('system:get-hardware-profile', () => publicProfile());
}

module.exports = { setupHardware, registerHardwareIPC, resolveFFmpegPath, ENCODER_PRESETS, getProfile: () => hardwareProfile };