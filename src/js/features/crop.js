window.initCropFeature = function () {
  let cropper = null;
  let currentFilePath = null;
  let isVideoMode = false;
  let hideTimer = null;
  let isHoveringStepper = false;

  // 基础视口与画布元素
  const workspace = document.getElementById('cropWorkspace');
  const image = document.getElementById('image');
  const video = document.getElementById('cropVideo');
  const dropArea = document.getElementById('cropDropArea');
  const prompt = document.getElementById('cropDropzonePrompt');
  const processBtn = document.getElementById('processBtn');
  const replaceBtn = document.getElementById('replaceBtn');
  const metaInfo = document.getElementById('metaInfo');

  // 视口内的微型步进岛
  const miniStepper = document.getElementById('cropMiniStepper');
  const btnPlayPause = document.getElementById('cropBtnPlayPause');
  const btnPrev = document.getElementById('cropBtnPrevFrame');
  const btnNext = document.getElementById('cropBtnNextFrame');

  // 底部通栏时间轨与信息
  const timelineStrip = document.getElementById('cropTimelineStrip');
  const leftInfo = document.getElementById('cropLeftInfo');
  const seeker = document.getElementById('cropVideoSeeker');
  const videoProgress = document.getElementById('cropVideoProgress');
  const currentTimeEl = document.getElementById('cropCurrentTime');
  const totalTimeEl = document.getElementById('cropTotalTime');

  // 音量控件
  const volumeWrapper = document.getElementById('cropVolumeWrapper');
  const volumeBtn = document.getElementById('cropVolumeBtn');
  const volumeSeeker = document.getElementById('cropVolumeSeeker');
  const volumeProgress = document.getElementById('cropVolumeProgress');

  // 格式化时间 00:00.00
  function fmtTime(s) {
    if (isNaN(s)) return '00:00.00';
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = (s % 60).toFixed(2).padStart(5, '0');
    return `${m}:${sec}`;
  }

  // 刷新时间轴进度显示
  function updateProgressUI(time, duration) {
    if (currentTimeEl) currentTimeEl.innerText = fmtTime(time);
    if (duration > 0 && videoProgress) {
      const pct = Math.min(100, Math.max(0, (time / duration) * 100));
      videoProgress.style.width = `${pct}%`;
    }
  }

  // 同步 video 画面尺寸，使其与 Cropper 画布像素级完全重合
  function syncVideoPosition() {
    if (!cropper || !isVideoMode || !video) return;
    const canvasData = cropper.getCanvasData();
    video.style.width = `${canvasData.width}px`;
    video.style.height = `${canvasData.height}px`;
    video.style.left = `${canvasData.left}px`;
    video.style.top = `${canvasData.top}px`;
  }

  // ================= 智能微型步进岛自动隐退交互 =================
  function showStepper() {
    if (!isVideoMode || !miniStepper) return;
    miniStepper.classList.remove('is-hidden');
    resetStepperTimer();
  }

  function resetStepperTimer() {
    clearTimeout(hideTimer);
    if (!isVideoMode || !miniStepper) return;
    
    // 保护条件：若视频已暂停、或鼠标正悬停在步进岛上，保持常显，方便挑帧
    if (video && video.paused) return;
    if (isHoveringStepper) return;

    // 播放状态下静止 2.2 秒后平滑淡出
    hideTimer = setTimeout(() => {
      if (video && !video.paused && !isHoveringStepper) {
        miniStepper.classList.add('is-hidden');
      }
    }, 2200);
  }

  if (dropArea) {
    dropArea.addEventListener('mousemove', showStepper);
    dropArea.addEventListener('mouseleave', () => {
      if (video && !video.paused) {
        miniStepper.classList.add('is-hidden');
      }
    });
  }

  if (miniStepper) {
    miniStepper.addEventListener('mouseenter', () => {
      isHoveringStepper = true;
      showStepper();
    });
    miniStepper.addEventListener('mouseleave', () => {
      isHoveringStepper = false;
      resetStepperTimer();
    });
  }

  // 启动 Cropper 实例
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
      zoomable: false,
      ready() {
        applyRatio(16 / 9, document.getElementById('btn16x9'));
        processBtn.disabled = false;
        processBtn.innerText = text;
        if (isVideoMode) {
          syncVideoPosition();
        }
      },
      crop(e) {
        const w = Math.max(2, Math.floor(e.detail.width / 2) * 2);
        const h = Math.max(2, Math.floor(e.detail.height / 2) * 2);
        metaInfo.innerText = `${w} X ${h} px`;
      }
    });
  }

  // 加载文件（视频 / 图片）
  async function loadFile(filePath) {
    if (!filePath) return;
    currentFilePath = filePath;

    document.getElementById('cropDock').classList.remove('disabled');

    const ext = filePath.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext);
    isVideoMode = isVideo;

    if (isVideo) {
      workspace.classList.add('is-video');
      if (miniStepper) miniStepper.style.display = 'flex';
      if (timelineStrip) timelineStrip.style.display = 'flex';
      if (leftInfo) leftInfo.style.display = 'flex';
      
      video.style.display = 'block';
      video.src = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;

      processBtn.disabled = true;
      processBtn.innerText = '解析视频...';

      // 视口步进岛初始常驻
      showStepper();

      video.onloadedmetadata = () => {
        seeker.max = video.duration;
        seeker.value = 0;
        if (totalTimeEl) totalTimeEl.innerText = fmtTime(video.duration);
        updateProgressUI(0, video.duration);

        // 首帧绘制给 Cropper 初始化
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        startCropper(canvas.toDataURL('image/jpeg'), '导出');
      };
    } else {
      isVideoMode = false;
      workspace.classList.remove('is-video');
      if (miniStepper) miniStepper.style.display = 'none';
      if (timelineStrip) timelineStrip.style.display = 'none';
      if (leftInfo) leftInfo.style.display = 'none';

      video.style.display = 'none';
      video.pause();

      startCropper(filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`, '导出');
    }
  }

  window.addEventListener('resize', () => {
    if (isVideoMode) syncVideoPosition();
  });

  // 拖拽与点击选择
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

  // ---------------- 视频播放与时间轴控制 ----------------
  video.addEventListener('timeupdate', () => {
    seeker.value = video.currentTime;
    updateProgressUI(video.currentTime, video.duration);
  });

  seeker.addEventListener('input', () => {
    const targetTime = parseFloat(seeker.value);
    video.currentTime = targetTime;
    updateProgressUI(targetTime, video.duration);
  });

  btnPlayPause.addEventListener('change', () => {
    btnPlayPause.checked ? video.play() : video.pause();
  });

  video.addEventListener('play', () => {
    btnPlayPause.checked = true;
    showStepper();
  });

  video.addEventListener('pause', () => {
    btnPlayPause.checked = false;
    showStepper(); // 暂停必定唤醒显示，方便逐帧对位
  });

  video.addEventListener('ended', () => {
    btnPlayPause.checked = false;
    showStepper();
  });

  // 逐帧步进/步退
  btnPrev.addEventListener('click', () => {
    video.pause();
    video.currentTime = Math.max(0, video.currentTime - 0.04);
  });

  btnNext.addEventListener('click', () => {
    video.pause();
    video.currentTime = Math.min(video.duration, video.currentTime + 0.04);
  });

  // 音量控制
  function setVolume(val) {
    val = Math.max(0, Math.min(1, val));
    video.volume = val;
    video.muted = (val === 0);
    if (volumeSeeker) volumeSeeker.value = val;
    if (volumeProgress) volumeProgress.style.height = `${val * 100}%`;
  }

  if (volumeSeeker) {
    volumeSeeker.addEventListener('input', (e) => setVolume(parseFloat(e.target.value)));
    volumeSeeker.addEventListener('mousedown', () => volumeWrapper.classList.add('is-dragging'));
    window.addEventListener('mouseup', () => volumeWrapper.classList.remove('is-dragging'));
  }

  let lastVolume = 1;
  if (volumeBtn) {
    volumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!volumeWrapper.classList.contains('is-open')) {
        volumeWrapper.classList.add('is-open');
        return;
      }
      if (video.muted || video.volume === 0) {
        setVolume(lastVolume || 0.8);
      } else {
        lastVolume = video.volume;
        setVolume(0);
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (volumeWrapper && !volumeWrapper.contains(e.target)) {
      volumeWrapper.classList.remove('is-open');
    }
  });

  if (volumeWrapper) {
    volumeWrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      setVolume(video.volume + step);
    }, { passive: false });
  }

  // ---------------- 比例切换 ----------------
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

  // ---------------- 导出处理 ----------------
  processBtn.addEventListener('click', async () => {
    if (!cropper || !currentFilePath) return;
    const d = cropper.getData(true);
    const orig = processBtn.innerText;
    processBtn.disabled = true;
    processBtn.innerText = '正在导出';

    if (isVideoMode) video.pause();

    try {
      const res = await window.electronAPI.processCrop({
        inputPath: currentFilePath,
        crop: {
          x: Math.max(0, Math.floor(d.x)),
          y: Math.max(0, Math.floor(d.y)),
          w: Math.max(2, Math.floor(d.width / 2) * 2),
          h: Math.max(2, Math.floor(d.height / 2) * 2)
        }
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