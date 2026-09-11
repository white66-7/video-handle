window.initCropFeature = function () {
  let cropper = null;
  let currentFilePath = null;

  const image = document.getElementById('image');
  const dropArea = document.getElementById('cropDropArea');
  const prompt = document.getElementById('cropDropzonePrompt');
  const processBtn = document.getElementById('processBtn');
  const replaceBtn = document.getElementById('replaceBtn');
  const metaInfo = document.getElementById('metaInfo');

  function startCropper(src, text = '导出') {
    image.src = src;
    image.style.display = 'block';
    prompt.style.display = 'none';

    if (cropper) cropper.destroy();
    cropper = new Cropper(image, {
      aspectRatio: 16 / 9,
      viewMode: 1,
      autoCropArea: 1,
      background: false,
      ready() {
        applyRatio(16 / 9, document.getElementById('btn16x9'));
        processBtn.disabled = false;
        processBtn.innerText = text;
      },
      crop(e) {
        const w = Math.max(2, Math.floor(e.detail.width / 2) * 2);
        const h = Math.max(2, Math.floor(e.detail.height / 2) * 2);
        metaInfo.innerText = `${w} X ${h} px`;
      }
    });
  }

  async function loadFile(filePath) {
    if (!filePath) return;
    currentFilePath = filePath;

    // 核心：载入文件后瞬间解锁底栏
    document.getElementById('cropDock').classList.remove('disabled');

    const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(filePath.split('.').pop().toLowerCase());
    if (isVideo) {
      processBtn.disabled = true;
      processBtn.innerText = '解析视频中...';
      try {
        const res = await window.electronAPI.getVideoFrame(filePath);
        if (res.success) startCropper(res.base64, '导出');
      } catch (err) {
        alert(err.message);
        processBtn.innerText = '导出';
      }
    } else {
      startCropper(filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`, '导出');
    }
  }

  prompt.addEventListener('click', async () => loadFile(await window.electronAPI.openGifDialog()));
  replaceBtn.addEventListener('click', async () => loadFile(await window.electronAPI.openGifDialog()));

  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.borderColor = 'rgba(255,255,255,0.4)'; });
  dropArea.addEventListener('dragleave', () => dropArea.style.borderColor = 'var(--card-border)');
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.style.borderColor = 'var(--card-border)';
    const file = e.dataTransfer.files[0];
    if (file) loadFile(window.electronAPI.getFilePath(file));
  });

  function applyRatio(ratio, btn) {
    if (!cropper) return;
    document.querySelectorAll('#cropWorkspace .segment-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (isNaN(ratio)) { cropper.setAspectRatio(NaN); return; }
    cropper.setAspectRatio(ratio);
    const d = cropper.getImageData();
    const imgRatio = d.naturalWidth / d.naturalHeight;
    let tw = imgRatio <= ratio ? d.naturalWidth : d.naturalHeight * ratio;
    let th = imgRatio <= ratio ? tw / ratio : d.naturalHeight;
    cropper.setData({
      x: Math.round(imgRatio <= ratio ? 0 : (d.naturalWidth - tw) / 2),
      y: Math.round(imgRatio <= ratio ? (d.naturalHeight - th) / 2 : 0),
      width: Math.round(tw), height: Math.round(th)
    });
  }

  document.getElementById('btn16x9').addEventListener('click', function () { applyRatio(16 / 9, this); });
  document.getElementById('btn1x1').addEventListener('click', function () { applyRatio(1, this); });
  document.getElementById('btn4x3').addEventListener('click', function () { applyRatio(4 / 3, this); });
  document.getElementById('btnFree').addEventListener('click', function () { applyRatio(NaN, this); });

  processBtn.addEventListener('click', async () => {
    if (!cropper || !currentFilePath) return;
    const d = cropper.getData(true);
    const orig = processBtn.innerText;
    processBtn.disabled = true;
    processBtn.innerText = '正在导出';

    try {
      const res = await window.electronAPI.processCrop({
        inputPath: currentFilePath,
        crop: { x: Math.max(0, Math.floor(d.x)), y: Math.max(0, Math.floor(d.y)), w: Math.max(2, Math.floor(d.width / 2) * 2), h: Math.max(2, Math.floor(d.height / 2) * 2) }
      });
      if (res.success) {
        processBtn.innerText = '成功';
        setTimeout(() => { processBtn.innerText = orig; processBtn.disabled = false; }, 1500);
      } else {
        processBtn.innerText = orig;
        processBtn.disabled = false;
      }
    } catch (e) {
      alert('处理失败: ' + e.message);
      processBtn.innerText = orig;
      processBtn.disabled = false;
    }
  });
};