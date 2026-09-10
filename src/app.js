let cropper = null;
let currentFilePath = null; // 真实系统绝对路径

const image = document.getElementById('image');
const dropArea = document.getElementById('dropArea');
const dropzonePrompt = document.getElementById('dropzonePrompt');
const processBtn = document.getElementById('processBtn');
const replaceBtn = document.getElementById('replaceBtn');
const metaInfo = document.getElementById('metaInfo');

// 统一载入图片路径
function loadLocalFile(filePath) {
  if (!filePath) return;
  currentFilePath = filePath;

  // 使用 file:// 协议进行原生免内存预览
  image.src = `file://${filePath}`;
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
    },
    crop(e) {
      const w = Math.max(2, Math.floor(e.detail.width / 2) * 2);
      const h = Math.max(2, Math.floor(e.detail.height / 2) * 2);
      metaInfo.innerText = `${w} × ${h} px`;
    }
  });
}

// 1. 原生对话框选取
dropzonePrompt.addEventListener('click', async () => {
  const filePath = await window.electronAPI.openGifDialog();
  loadLocalFile(filePath);
});

replaceBtn.addEventListener('click', async () => {
  const filePath = await window.electronAPI.openGifDialog();
  loadLocalFile(filePath);
});

// 2. 拖拽支持 (使用标准 webUtils 获取磁盘绝对路径)
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

dropArea.addEventListener('dragover', () => dropArea.style.borderColor = 'rgba(255,255,255,0.4)');
dropArea.addEventListener('dragleave', () => dropArea.style.borderColor = 'var(--card-border)');
dropArea.addEventListener('drop', e => {
  dropArea.style.borderColor = 'var(--card-border)';
  const file = e.dataTransfer.files[0];
  if (file && (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'))) {
    const realPath = window.electronAPI.getFilePath(file);
    loadLocalFile(realPath);
  }
});

// 3. 智能等比最大化算法
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

// 4. 调用原生裁切 IPC
processBtn.addEventListener('click', async () => {
  if (!cropper || !currentFilePath) return;

  const cropData = cropper.getData(true);
  const imgData = cropper.getImageData();

  // 严格边界纠偏，确保不超出实际像素尺寸
  const x = Math.max(0, Math.floor(cropData.x));
  const y = Math.max(0, Math.floor(cropData.y));
  const w = Math.min(imgData.naturalWidth - x, Math.max(2, Math.floor(cropData.width / 2) * 2));
  const h = Math.min(imgData.naturalHeight - y, Math.max(2, Math.floor(cropData.height / 2) * 2));

  processBtn.disabled = true;
  processBtn.innerText = '正在导出...';

  try {
    const result = await window.electronAPI.processCrop({
      inputPath: currentFilePath,
      crop: { x, y, w, h }
    });

    if (result.success) {
      processBtn.innerText = '导出成功 ✓';
      // 询问用户是否打开所在文件夹
      setTimeout(() => {
        if (confirm('动图已成功导出！是否打开所在文件夹查看？')) {
          window.electronAPI.showInFolder(result.outputPath);
        }
        processBtn.innerText = '导出 GIF';
        processBtn.disabled = false;
      }, 500);
    } else {
      processBtn.innerText = '导出 GIF';
      processBtn.disabled = false;
    }
  } catch (err) {
    alert('处理失败: ' + err.message);
    processBtn.innerText = '导出 GIF';
    processBtn.disabled = false;
  }
});