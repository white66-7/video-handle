// src/js/features/compress.js

class CompressModule {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.currentRes = '1080p';
    this.currentCrf = 28;

    this.initDOMElements();
    this.bindEvents();
    this.listenProgress();
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
    this.dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        this.handleFiles(e.dataTransfer.files);
      }
    });

    this.dropPrompt.addEventListener('click', () => this.triggerFileSelect());
    this.btnAdd.addEventListener('click', () => this.triggerFileSelect());

    // 切换分辨率：已完成项若需重新压缩，可标记状态
    this.resGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;
      this.resGroup.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.currentRes = btn.dataset.res;
      this.updateQueueSpecs();
    });

    // 调节 CRF
    this.crfSlider.addEventListener('input', (e) => {
      this.currentCrf = parseInt(e.target.value, 10);
      this.crfLabel.textContent = `CRF ${this.currentCrf}`;
      this.updateQueueSpecs();
    });

    this.btnClear.addEventListener('click', () => {
      if (this.isProcessing) return;
      this.queue = [];
      this.renderQueue();
    });

    this.btnStart.addEventListener('click', () => {
      if (this.isProcessing) return;
      this.startBatchProcess();
    });
  }

  listenProgress() {
    window.electronAPI?.onCompressProgress(({ taskId, percent }) => {
      const task = this.queue.find(t => t.id === taskId);
      if (!task) return;
      task.progress = percent;
      task.statusText = `压缩中 ${percent}%`;

      const itemEl = document.getElementById(taskId);
      if (itemEl) {
        const bar = itemEl.querySelector('.item-progress-bar');
        const txt = itemEl.querySelector('.item-status-text');
        if (bar) bar.style.width = `${percent}%`;
        if (txt) txt.textContent = task.statusText;
      }
    });
  }

  triggerFileSelect() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*';
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
        const realPath = window.electronAPI ? window.electronAPI.getFilePath(file) : (file.path || '');
        const id = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

        this.queue.push({
          id,
          name: file.name,
          path: realPath,
          size: file.size,
          outputSize: 0,     
          outputPath: '',     
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
    if (!bytes || bytes <= 0) return '0 B';
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

  getScaleFilter(targetRes) {
    switch (targetRes) {
      case '1080p':
        return "scale='min(1920,iw)':min'(1080,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2";
      case '720p':
        return "scale='min(1280,iw)':min'(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2";
      default:
        return "pad=ceil(iw/2)*2:ceil(ih/2)*2";
    }
  }

  updateQueueSpecs() {
    const specElements = this.queueList.querySelectorAll('.queue-item');
    specElements.forEach(item => {
      const mainText = item.querySelector('.spec-main-text');
      const subText = item.querySelector('.spec-sub-text');
      if (mainText) mainText.textContent = this.getResDisplayLabel(this.currentRes);
      if (subText) subText.textContent = `CRF ${this.currentCrf}`;
    });
  }

  // 🌟 核心：管理“开始批量压缩”按钮的状态与文字
  updateStartBtnState() {
    if (this.isProcessing) {
      this.btnStart.disabled = true;
      this.btnStart.textContent = '压缩中…';
      return;
    }

    const pendingTasks = this.queue.filter(t => t.statusType !== 'done');

    if (this.queue.length === 0) {
      this.btnStart.disabled = true;
      this.btnStart.textContent = '开始压缩';
    } else if (pendingTasks.length === 0) {
      // 👈 所有文件都压缩完成时，彻底禁用按钮，防止误重复触发！
      this.btnStart.disabled = true;
      this.btnStart.textContent = '完成';
    } else {
      this.btnStart.disabled = false;
      this.btnStart.textContent = `开始压缩 (${pendingTasks.length})`;
    }
  }

  renderQueue() {
    this.queueCount.textContent = this.queue.length;

    if (this.queue.length === 0) {
      this.dropPrompt.style.display = 'flex';
      this.queueWrap.style.display = 'none';
      this.dock.classList.add('disabled');
      this.queueList.innerHTML = '';
      this.updateStartBtnState();
      return;
    }

    this.dropPrompt.style.display = 'none';
    this.queueWrap.style.display = 'flex';
    this.dock.classList.remove('disabled');

    this.queueList.innerHTML = this.queue.map(task => {
      // 文件大小展示逻辑：如果完成，展示【原大小 ➔ 新大小 (-XX%)】
      let sizeHtml = `<span class="filesize">${this.formatFileSize(task.size)}</span>`;
      if (task.statusType === 'done' && task.outputSize > 0) {
        const savedPercent = Math.max(0, Math.round(((task.size - task.outputSize) / task.size) * 100));
        sizeHtml = `
          <div style="display:flex; align-items:center; gap:6px; font-size:11.5px;">
            <span style="text-decoration: line-through; opacity: 0.5;">${this.formatFileSize(task.size)}</span>
            <span style="color: #6ee7a8; font-weight: 600;">➔ ${this.formatFileSize(task.outputSize)}</span>
            <span style="background: rgba(110,231,168,0.15); color: #6ee7a8; padding: 1px 5px; border-radius: 4px; font-weight:700;">-${savedPercent}%</span>
          </div>
        `;
      }

      // 操作列按钮：若完成显示“打开定位”，否则显示删除
      let opHtml = `<button class="item-remove-btn" title="移出任务" onclick="compressModule.removeTask('${task.id}')">×</button>`;
      if (task.statusType === 'done') {
        opHtml = `
          <button class="item-remove-btn" title="打开所在文件夹" style="font-size:12px;" onclick="compressModule.openFolder('${task.id}')">📂</button>
        `;
      }

      return `
        <div class="queue-item" id="${task.id}">
          <div class="q-col col-name item-name">
            <svg class="file-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
            </svg>
            <div class="file-meta-box">
              <span class="filename" title="${task.name}">${task.name}</span>
              ${sizeHtml}
            </div>
          </div>

          <div class="q-col col-spec item-spec">
            <span class="spec-main-text">${this.getResDisplayLabel(this.currentRes)}</span>
            <span class="spec-sub-text">CRF ${this.currentCrf}</span>
          </div>

          <div class="q-col col-status item-status-wrap">
            <div class="item-progress-track">
              <div class="item-progress-bar" style="width: ${task.progress}%;"></div>
            </div>
            <span class="item-status-text ${task.statusType}">${task.statusText}</span>
          </div>

          <div class="q-col col-op">
            ${opHtml}
          </div>
        </div>
      `;
    }).join('');

    this.updateStartBtnState();
  }

  removeTask(taskId) {
    if (this.isProcessing) return;
    this.queue = this.queue.filter(t => t.id !== taskId);
    this.renderQueue();
  }

  openFolder(taskId) {
    const task = this.queue.find(t => t.id === taskId);
    if (task && task.outputPath) {
      window.electronAPI?.showInFolder(task.outputPath);
    }
  }

  async startBatchProcess() {
    if (!window.electronAPI) {
      alert('未检测到 Electron 环境');
      return;
    }

    // 过滤出未完成的任务
    const pendingTasks = this.queue.filter(t => t.statusType !== 'done');
    if (pendingTasks.length === 0) return;

    // 1. 让用户自选存放位置
    const outputDir = await window.electronAPI.selectCompressOutputDir();
    if (!outputDir) return;

    this.isProcessing = true;
    this.updateStartBtnState();

    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      if (task.statusType === 'done') continue; // 跳过已经成功的

      const itemEl = document.getElementById(task.id);
      const statusText = itemEl?.querySelector('.item-status-text');

      task.statusType = 'processing';
      task.statusText = '准备编码…';
      if (statusText) statusText.className = 'item-status-text';

      // 2. 发起真实压制
      const result = await window.electronAPI.runCompressTask({
        taskId: task.id,
        inputPath: task.path,
        outputDir,
        fileName: task.name,
        crf: this.currentCrf,
        scaleFilter: this.getScaleFilter(this.currentRes),
        hwProfile: window.currentHardwareProfile
      });

      // 3. 处理产物大小与结果
      if (result.success) {
        task.statusType = 'done';
        task.outputSize = result.outputSize || 0;
        task.outputPath = result.outputPath || '';
        task.progress = 100;
        task.statusText = '压制完成';
      } else {
        task.statusType = 'error';
        task.statusText = '失败: ' + (result.error || '转码错误');
      }

      this.renderQueue(); // 重新渲染刷新大小和操作栏
    }

    this.isProcessing = false;
    this.updateStartBtnState();
  }
}

window.initCompressFeature = function() {
  window.compressModule = new CompressModule();
};