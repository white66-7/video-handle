window.initSnapshotFeature = function () {
  let currentFilePath = null;

  const video = document.getElementById('snapshotVideo');
  const dropArea = document.getElementById('snapshotDropArea');
  const prompt = document.getElementById('snapshotDropzonePrompt');
  const replaceBtn = document.getElementById('snapshotReplaceBtn');
  const snapshotBtn = document.getElementById('snapshotBtn');

  // 动效播放复选框与步进按钮
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnPrev = document.getElementById('btnPrevFrame');
  const btnNext = document.getElementById('btnNextFrame');

  // 时间轴与时间文字
  const seeker = document.getElementById('videoSeeker');
  const videoProgress = document.getElementById('videoProgress');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');

  // 音量控制全套元素
  const volumeWrapper = document.getElementById('volumeWrapper');
  const volumeBtn = document.getElementById('volumeBtn');
  const volumeSeeker = document.getElementById('volumeSeeker');
  const volumeProgress = document.getElementById('volumeProgress');

  // 格式化时间码（分:秒.毫秒）
  function fmtTime(s) {
    if (isNaN(s)) return '00:00.00';
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = (s % 60).toFixed(2).padStart(5, '0');
    return `${m}:${sec}`;
  }

  // 同步更新进度轨宽度与时间文本
  function updateProgressUI(time, duration) {
    if (currentTimeEl) currentTimeEl.innerText = fmtTime(time);
    if (duration > 0 && videoProgress) {
      const pct = Math.min(100, Math.max(0, (time / duration) * 100));
      videoProgress.style.width = `${pct}%`;
    }
  }

  // 加载并初始化视频
  async function loadVideo(filePath) {
    if (!filePath) return;
    currentFilePath = filePath;

    document.getElementById('snapshotDock').classList.remove('disabled');

    prompt.style.display = 'none';
    video.style.display = 'block';
    video.src = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
    snapshotBtn.disabled = false;
  }

  // 文件选择与拖拽监听
  prompt.addEventListener('click', async () => loadVideo(await window.electronAPI.openVideoDialog()));
  replaceBtn.addEventListener('click', async () => loadVideo(await window.electronAPI.openVideoDialog()));

  dropArea.addEventListener('dragover', e => { 
    e.preventDefault(); 
    dropArea.style.borderColor = 'rgba(255,255,255,0.4)'; 
  });
  dropArea.addEventListener('dragleave', () => dropArea.style.borderColor = 'var(--card-border)');
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.style.borderColor = 'var(--card-border)';
    const file = e.dataTransfer.files[0];
    if (file) loadVideo(window.electronAPI.getFilePath(file));
  });

  // 视频元数据就绪
  video.addEventListener('loadedmetadata', () => {
    seeker.max = video.duration;
    seeker.value = 0;
    if (totalTimeEl) totalTimeEl.innerText = fmtTime(video.duration);
    updateProgressUI(0, video.duration);
  });

  // 播放中进度刷新
  video.addEventListener('timeupdate', () => {
    seeker.value = video.currentTime;
    updateProgressUI(video.currentTime, video.duration);
  });

  // 拖动进度滑条跳转
  seeker.addEventListener('input', () => {
    const targetTime = parseFloat(seeker.value);
    video.currentTime = targetTime;
    updateProgressUI(targetTime, video.duration);
  });

  // 1. 播放/暂停状态联动 (与 Checkbox 动效开关双向绑定)
  btnPlayPause.addEventListener('change', () => {
    if (btnPlayPause.checked) {
      video.play();
    } else {
      video.pause();
    }
  });

  video.addEventListener('play', () => { btnPlayPause.checked = true; });
  video.addEventListener('pause', () => { btnPlayPause.checked = false; });
  video.addEventListener('ended', () => { btnPlayPause.checked = false; });

  // 2. 逐帧前进 / 后退
  btnPrev.addEventListener('click', () => { 
    video.pause(); 
    video.currentTime = Math.max(0, video.currentTime - 0.04); 
  });
  
  btnNext.addEventListener('click', () => { 
    video.pause(); 
    video.currentTime = Math.min(video.duration, video.currentTime + 0.04); 
  });

  // 3. 增强版音量控制逻辑（防闪退、点击锁定、拖拽防脱轨、滚轮微调）
  function setVolume(val) {
    val = Math.max(0, Math.min(1, val));
    video.volume = val;
    video.muted = (val === 0);
    if (volumeSeeker) volumeSeeker.value = val;
    if (volumeProgress) volumeProgress.style.height = `${val * 100}%`;
  }

  if (volumeSeeker) {
    volumeSeeker.addEventListener('input', (e) => {
      setVolume(parseFloat(e.target.value));
    });

    // 拖拽防闪退锁定：在按住滑块调节时，即便鼠标离开视窗也绝不收起
    volumeSeeker.addEventListener('mousedown', () => {
      volumeWrapper.classList.add('is-dragging');
    });
    window.addEventListener('mouseup', () => {
      volumeWrapper.classList.remove('is-dragging');
    });
  }

  // 点击喇叭图标：切换【常驻展开】与【静音/恢复】
  let lastVolume = 1;
  if (volumeBtn) {
    volumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      // 如果浮窗未展开，点击先锁定展开浮窗
      if (!volumeWrapper.classList.contains('is-open')) {
        volumeWrapper.classList.add('is-open');
        return;
      }

      // 如果已经处于展开状态，点击执行一键静音/恢复
      if (video.muted || video.volume === 0) {
        setVolume(lastVolume || 0.8);
      } else {
        lastVolume = video.volume;
        setVolume(0);
      }
    });
  }

  // 点击外部任意空白区域，收起常驻音量浮窗
  document.addEventListener('click', (e) => {
    if (volumeWrapper && !volumeWrapper.contains(e.target)) {
      volumeWrapper.classList.remove('is-open');
    }
  });

  // 支持在喇叭区域直接滑动鼠标滚轮调节音量
  if (volumeWrapper) {
    volumeWrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      setVolume(video.volume + step);
    }, { passive: false });
  }

  // 4. 截图导出处理
  snapshotBtn.addEventListener('click', async () => {
    if (!currentFilePath) return;
    const orig = snapshotBtn.innerText;
    snapshotBtn.disabled = true;
    snapshotBtn.innerText = '正在截取';

    try {
      const res = await window.electronAPI.saveSnapshot({ inputPath: currentFilePath, timestamp: video.currentTime });
      if (res.success) {
        snapshotBtn.innerText = '成功';
        setTimeout(() => { snapshotBtn.innerText = orig; snapshotBtn.disabled = false; }, 1500);
      } else {
        snapshotBtn.innerText = orig;
        snapshotBtn.disabled = false;
      }
    } catch (e) {
      alert('截取失败: ' + e.message);
      snapshotBtn.innerText = orig;
      snapshotBtn.disabled = false;
    }
  });
};