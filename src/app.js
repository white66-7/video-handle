let cropper = null;
let currentFilePath = null; // 当前文件绝对路径

const image = document.getElementById('image');
const dropArea = document.getElementById('dropArea');
const dropzonePrompt = document.getElementById('dropzonePrompt');
const processBtn = document.getElementById('processBtn');
const replaceBtn = document.getElementById('replaceBtn');
const metaInfo = document.getElementById('metaInfo');
const encoderInfo = document.getElementById('encoderInfo');
const encoderLabel = document.getElementById('encoderLabel');
const notice = document.getElementById('notice');
const noticeText = document.getElementById('noticeText');

// ---------------- 编码引擎状态与提示 ----------------
function showNotice(msg) {
  noticeText.innerText = msg;
  notice.style.display = 'flex';
}

document.getElementById('noticeClose').addEventListener('click', () => {
  notice.style.display = 'none';
});

// 渲染底栏硬件配置状态
function renderHardwareProfile(profile) {
  if (!profile || !profile.isReady) {
    encoderInfo.classList.remove('hw', 'cpu');
    encoderLabel.innerText = '检测中…';
    encoderInfo.title = '正在自检硬件加速能力...';
    return;
  }

  encoderInfo.classList.remove('hw', 'cpu');

  if (profile.isHardware) {
    encoderInfo.classList.add('hw');
    encoderLabel.innerText = profile.label;
    encoderInfo.title = `硬件加速已就绪\n显卡: ${profile.gpuName || '通用'}\n编码器: ${profile.encoder}`;
  } else {
    encoderInfo.classList.add('cpu');
    encoderLabel.innerText = profile.probeError ? 'CPU（硬件不可用）' : 'CPU (libx264)';
    encoderInfo.title = profile.probeError
      ? `硬件编码探测失败，已回退 CPU\n原因: ${profile.probeError}`
      : '未检测到可用硬件编码器';
  }

  if (profile.probeError) {
    showNotice(profile.isHardware
      ? `首选硬件编码器不可用，已改用 ${profile.label}。原因：${profile.probeError}`
      : `硬件加速不可用，已改用 CPU 编码。原因：${profile.probeError}`);
  }
}

// ---------------- 启动即初始化并监听后台自检 ----------------
(async () => {
  try {
    // 1. 核心修复：注册主进程检测完成的事件推送
    if (window.electronAPI.onHardwareProfileUpdated) {
      window.electronAPI.onHardwareProfileUpdated((profile) => {
        renderHardwareProfile(profile);
      });
    }

    // 2. 读取初始状态
    const initialProfile = await window.electronAPI.getHardwareProfile();
    renderHardwareProfile(initialProfile);
  } catch (err) {
    encoderInfo.classList.add('cpu');
    encoderLabel.innerText = '检测失败';
    encoderInfo.title = String(err && err.message ? err.message : err);
  }
})();

// 统一启动 Cropper 实例
function startCropper(imageSrc, btnText = '导出文件') {
  image.src = imageSrc;
  image.style.display = 'block';
  dropzonePrompt.style.display = 'none';

  if (cropper) cropper.destroy();

  cropper = new Cropper(image, {
    aspectRatio: 16 / 9,
    viewMode: 1,
    autoCropArea: 1,
    ready() {
      applySmartRatio(16 / 9, document.getElementById('btn16x9'));
      processBtn.disabled = false;
      processBtn.innerText = btnText;
    },
    crop(e) {
      // 保持严格偶数像素
      const w = Math.max(2, Math.floor(e.detail.width / 2) * 2);
      const h = Math.max(2, Math.floor(e.detail.height / 2) * 2);
      metaInfo.innerText = `${w} × ${h} px`;
    }
  });
}

// 载入本地媒体文件
async function loadLocalFile(filePath) {
  if (!filePath) return;
  currentFilePath = filePath;

  const ext = filePath.split('.').pop().toLowerCase();
  const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext);

  if (isVideo) {
    processBtn.disabled = true;
    processBtn.innerText = '解析视频中...';
    metaInfo.innerText = '提取首帧...';

    try {
      const result = await window.electronAPI.getVideoFrame(filePath);
      if (result && result.success) {
        startCropper(result.base64, '导出视频');
      } else {
        throw new Error('未读取到有效画面数据');
      }
    } catch (err) {
      alert('解析视频首帧失败: ' + err.message);
      processBtn.disabled = true;
      processBtn.innerText = '导出文件';
      metaInfo.innerText = '0 × 0 px';
    }
  } else {
    const safeUrl = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
    startCropper(safeUrl, '导出 GIF');
  }
}

// ---------------- 用户交互事件 ----------------

// 点击打开对话框
dropzonePrompt.addEventListener('click', async () => {
  const filePath = await window.electronAPI.openGifDialog();
  if (filePath) loadLocalFile(filePath);
});

replaceBtn.addEventListener('click', async () => {
  const filePath = await window.electronAPI.openGifDialog();
  if (filePath) loadLocalFile(filePath);
});

// 文件拖拽导入
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

dropArea.addEventListener('dragover', () => dropArea.style.borderColor = 'rgba(255,255,255,0.4)');
dropArea.addEventListener('dragleave', () => dropArea.style.borderColor = 'var(--card-border)');
dropArea.addEventListener('drop', e => {
  dropArea.style.borderColor = 'var(--card-border)';
  const file = e.dataTransfer.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const supported = ['gif', 'mp4', 'mov', 'webm', 'mkv', 'avi'];

  if (supported.includes(ext)) {
    const realPath = window.electronAPI.getFilePath(file);
    loadLocalFile(realPath);
  } else {
    alert('仅支持 GIF 动图及常用视频格式 (MP4, MOV, WEBM, MKV, AVI)');
  }
});

// 比例控制算法
function setActiveBtn(btn) {
  document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function applySmartRatio(ratio, btn) {
  if (!cropper) return;
  setActiveBtn(btn);

  if (isNaN(ratio)) {
    cropper.setAspectRatio(NaN);
    return;
  }

  cropper.setAspectRatio(ratio);
  const data = cropper.getImageData();
  const imgW = data.naturalWidth;
  const imgH = data.naturalHeight;
  const imgRatio = imgW / imgH;

  let targetW, targetH, targetX, targetY;

  if (imgRatio <= ratio) {
    targetW = imgW;
    targetH = targetW / ratio;
    targetX = 0;
    targetY = Math.max(0, (imgH - targetH) / 2);
  } else {
    targetH = imgH;
    targetW = targetH * ratio;
    targetY = 0;
    targetX = Math.max(0, (imgW - targetW) / 2);
  }

  cropper.setData({
    x: Math.round(targetX),
    y: Math.round(targetY),
    width: Math.round(targetW),
    height: Math.round(targetH)
  });
}

// 执行导出裁切
processBtn.addEventListener('click', async () => {
  if (!cropper || !currentFilePath) return;

  const cropData = cropper.getData(true);
  const imgData = cropper.getImageData();

  const x = Math.max(0, Math.floor(cropData.x));
  const y = Math.max(0, Math.floor(cropData.y));
  const w = Math.min(imgData.naturalWidth - x, Math.max(2, Math.floor(cropData.width / 2) * 2));
  const h = Math.min(imgData.naturalHeight - y, Math.max(2, Math.floor(cropData.height / 2) * 2));

  const originalBtnText = processBtn.innerText;
  processBtn.disabled = true;
  processBtn.innerText = '正在导出...';

  try {
    const result = await window.electronAPI.processCrop({
      inputPath: currentFilePath,
      crop: { x, y, w, h }
    });

    if (result.success) {
      if (result.usedFallback) {
        encoderInfo.classList.remove('hw');
        encoderInfo.classList.add('cpu');
        encoderLabel.innerText = result.encoderLabel || 'CPU (libx264)';
        encoderInfo.title = `本次导出已回退 CPU\n原因: ${result.fallbackReason || '硬件运行受阻'}`;
        showNotice(`本次硬件加速失败，已自动改用 CPU 完成导出。原因：${result.fallbackReason || '未知'}`);
      } else if (result.encoderLabel) {
        encoderInfo.classList.remove('cpu');
        encoderInfo.classList.add('hw');
        encoderLabel.innerText = result.encoderLabel;
      }

      processBtn.innerText = '导出完成！';
      setTimeout(() => {
        processBtn.innerText = originalBtnText;
        processBtn.disabled = false;
      }, 1500);
    } else {
      processBtn.innerText = originalBtnText;
      processBtn.disabled = false;
    }
  } catch (err) {
    alert('处理失败: ' + err.message);
    processBtn.innerText = originalBtnText;
    processBtn.disabled = false;
  }
});