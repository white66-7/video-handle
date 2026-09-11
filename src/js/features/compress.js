/**
 * 视频压缩模块 (Compress Feature)
 * 针对 1080P/720P 及 CRF 极简轻量压制调度
 */

class CompressModule {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.currentRes = '1080p'; // 默认 1080P (1920x1080 自适应)
    this.currentCrf = 28;

    this.initDOMElements();
    this.bindEvents();
  }

  initDOMElements() {
    this.dropArea = document.getElementById('compressDropArea');
    this.dropPrompt = document.getElementById('compressDropPrompt');
    this.queueWrap = document.getElementById('compressQueueWrap');
    this.queueList = document.getElementById('compressQueueList');
    this.queueCount = document.getElementById('queueCount');
    this.dock = document.getElementById('compressDock');
    this.resGroup = document.getElementById('compressResGroup');
    this.crfSlider = document.getElementById('compressCrf');
    this.crfLabel = document.getElementById('crfLabel');
    this.btnAdd = document.getElementById('compressAddBtn');
    this.btnClear = document.getElementById('compressClearBtn');
    this.btnStart = document.getElementById('compressStartBtn');
  }

  bindEvents() {
    // 1. 拖拽文件进入
    this.dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropArea.classList.add('drag-over');
    });

    this.dropArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropArea.classList.remove('drag-over');
    });

    this.dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropArea.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        this.handleFiles(e.dataTransfer.files);
      }
    });

    // 点击空状态添加
    this.dropPrompt.addEventListener('click', () => {
      this.triggerFileSelect();
    });

    this.btnAdd.addEventListener('click', () => {
      this.triggerFileSelect();
    });

    // 2. 分辨率切换
    this.resGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;

      this.resGroup.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.currentRes = btn.dataset.res;
      this.updateQueueSpecs();
    });

    // 3. CRF 强度滑块
    this.crfSlider.addEventListener('input', (e) => {
      this.currentCrf = parseInt(e.target.value, 10);
      this.crfLabel.textContent = `CRF ${this.currentCrf}`;
      this.updateQueueSpecs();
    });

    // 4. 清空队列
    this.btnClear.addEventListener('click', () => {
      if (this.isProcessing) return;
      this.queue = [];
      this.renderQueue();
    });

    // 5. 启动压制
    this.btnStart.addEventListener('click', () => {
      if (this.isProcessing || this.queue.length === 0) return;
      this.startBatchProcess();
    });
  }

  triggerFileSelect() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/mp4,video/mkv,video/avi,video/quicktime,video/x-flv,video/x-ms-wmv,.mp4,.mkv,.avi,.mov,.flv,.wmv';
    input.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFiles(e.target.files);
      }
    };
    input.click();
  }

  handleFiles(fileList) {
    const validExts = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
    let addedCount = 0;

    Array.from(fileList).forEach(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (validExts.includes(ext) || file.type.startsWith('video/')) {
        const id = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        this.queue.push({
          id,
          file,
          name: file.name,
          path: file.path || '',
          size: file.size,
          progress: 0,
          statusText: '等待压缩',
          statusType: 'waiting', // waiting | processing | done | error
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.renderQueue();
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getResDisplayLabel(res) {
    switch (res) {
      case '1080p': return '1080P (1920×1080)';
      case '720p': return '720P (1280×720)';
      case 'original': return '原始尺寸';
      default: return '1080P';
    }
  }

  updateQueueSpecs() {
    const specElements = this.queueList.querySelectorAll('.queue-item');
    specElements.forEach(item => {
      const mainText = item.querySelector('.spec-main-text');
      const subText = item.querySelector('.spec-sub-text');
      if (mainText) mainText.textContent = this.getResDisplayLabel(this.currentRes);
      if (subText) subText.textContent = `H.264 · CRF ${this.currentCrf}`;
    });
  }

  renderQueue() {
    this.queueCount.textContent = this.queue.length;

    if (this.queue.length === 0) {
      this.dropPrompt.style.display = 'flex';
      this.queueWrap.style.display = 'none';
      this.dock.classList.add('disabled');
      this.btnStart.disabled = true;
      this.queueList.innerHTML = '';
      return;
    }

    this.dropPrompt.style.display = 'none';
    this.queueWrap.style.display = 'flex';
    this.dock.classList.remove('disabled');
    this.btnStart.disabled = this.isProcessing;

    this.queueList.innerHTML = this.queue.map(task => `
      <div class="queue-item" id="${task.id}">
        <div class="q-col col-name item-name">
          <svg class="file-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
          </svg>
          <div class="file-meta-box">
            <span class="filename" title="${task.name}">${task.name}</span>
            <span class="filesize">${this.formatFileSize(task.size)}</span>
          </div>
        </div>

        <div class="q-col col-spec item-spec">
          <span class="spec-main-text">${this.getResDisplayLabel(this.currentRes)}</span>
          <span class="spec-sub-text">H.264 · CRF ${this.currentCrf}</span>
        </div>

        <div class="q-col col-status item-status-wrap">
          <div class="item-progress-track">
            <div class="item-progress-bar" style="width: ${task.progress}%;"></div>
          </div>
          <span class="item-status-text ${task.statusType}">${task.statusText}</span>
        </div>

        <div class="q-col col-op">
          <button class="item-remove-btn" title="移出任务" onclick="compressModule.removeTask('${task.id}')">×</button>
        </div>
      </div>
    `).join('');
  }

  removeTask(taskId) {
    if (this.isProcessing) return;
    this.queue = this.queue.filter(t => t.id !== taskId);
    this.renderQueue();
  }

  // 获取 FFmpeg 分辨率滤镜命令
  getScaleFilter(targetRes) {
    switch (targetRes) {
      case '1080p':
        // 自适应缩放到 1920x1080 范围以内，保证等比例并补齐偶数像素
        return "scale='min(1920,iw)':min'(1080,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2";
      case '720p':
        return "scale='min(1280,iw)':min'(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2";
      default:
        return "pad=ceil(iw/2)*2:ceil(ih/2)*2";
    }
  }

  // 批量压缩流程调度
  async startBatchProcess() {
    this.isProcessing = true;
    this.btnStart.disabled = true;
    this.btnStart.textContent = '压缩中…';

    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      if (task.statusType === 'done') continue;

      await this.processSingleTask(task);
    }

    this.isProcessing = false;
    this.btnStart.disabled = false;
    this.btnStart.textContent = '开始批量压缩';
  }

  // 单个视频转码模拟 / 实际对接
  processSingleTask(task) {
    return new Promise((resolve) => {
      const itemEl = document.getElementById(task.id);
      const progressBar = itemEl ? itemEl.querySelector('.item-progress-bar') : null;
      const statusText = itemEl ? itemEl.querySelector('.item-status-text') : null;

      task.statusType = 'processing';
      task.statusText = '0%';
      if (statusText) statusText.className = 'item-status-text';

      // 模拟转码进度（如在 Electron 环境下，直接替换为 ipcRenderer.on 回调即可）
      let p = 0;
      const timer = setInterval(() => {
        p += 5;
        task.progress = p;
        task.statusText = `压缩中 ${p}%`;

        if (progressBar) progressBar.style.width = `${p}%`;
        if (statusText) statusText.textContent = task.statusText;

        if (p >= 100) {
          clearInterval(timer);
          task.statusType = 'done';
          task.statusText = '压制完成';
          if (statusText) {
            statusText.className = 'item-status-text done';
            statusText.textContent = task.statusText;
          }
          resolve();
        }
      }, 120);
    });
  }
}

// 挂载到全局，方便行内事件调用
window.compressModule = new CompressModule();