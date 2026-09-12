/**
 * 图片转换模块 (Squoosh 模式：零滞后架构 + 双侧瞬间同步 + ICO 并行极速生成)
 */

class ConvertModule {
  constructor() {
    this.sourceFile = null;
    this.sourceImg = null;
    this.sourceSize = 0;
    this.originalWidth = 0;
    this.originalHeight = 0;

    // 当前参数
    this.targetFormat = 'webp';
    this.targetQuality = 0.75;
    this.targetWidth = 0;
    this.targetHeight = 0;
    this.aspectRatio = 1;

    // Windows 标准多分辨率 ICO 预设 (16~256px)
    this.icoStandardSizes = [16, 24, 32, 48, 64, 128, 256];

    this.resultBlob = null;
    this.splitPercent = 50;
    this.isDraggingSplitter = false;

    // 任务调度与防滞后核心
    this.encodeTimer = null;
    this.currentJobId = 0;
    this.compressedUrl = null;

    this.initDOMElements();
    this.bindEvents();
    this.bindSplitterEvents();
  }

  initDOMElements() {
    this.dropArea = document.getElementById('convertDropArea');
    this.dropPrompt = document.getElementById('convertDropPrompt');
    this.stage = document.getElementById('squooshStage');
    this.canvasBox = document.getElementById('squooshCanvasBox');
    this.imgOriginal = document.getElementById('imgOriginal');
    this.imgCompressed = document.getElementById('imgCompressed');
    this.compressedLayer = document.getElementById('compressedLayer');
    this.splitter = document.getElementById('squooshSplitter');

    this.labelOriginalSize = document.getElementById('labelOriginalSize');
    this.labelTargetFmt = document.getElementById('labelTargetFmt');
    this.labelTargetSize = document.getElementById('labelTargetSize');
    this.labelSizeDiff = document.getElementById('labelSizeDiff');

    this.dock = document.getElementById('convertDock');
    this.formatGroup = document.getElementById('convertFormatGroup');
    
    // 悬浮舱元素
    this.resizePopoverWrap = document.getElementById('resizePopoverWrap');
    this.btnResizeTrigger = document.getElementById('btnResizeTrigger');
    this.labelCurrentDim = document.getElementById('labelCurrentDim');
    this.scaleGroup = document.getElementById('convertScaleGroup');
    this.icoSizeGroup = document.getElementById('convertIcoSizeGroup');
    this.inputWidth = document.getElementById('inputWidth');
    this.inputHeight = document.getElementById('inputHeight');

    this.qualityPopoverWrap = document.getElementById('qualityPopoverWrap');
    this.btnQualityTrigger = document.getElementById('btnQualityTrigger');
    this.labelCurrentQuality = document.getElementById('labelCurrentQuality');
    this.qualitySlider = document.getElementById('convertQuality');
    this.qualityLabel = document.getElementById('convertQualityLabel');

    this.btnReplace = document.getElementById('convertReplaceBtn');
    this.btnDownload = document.getElementById('convertDownloadBtn');
  }

  bindEvents() {
    // 1. 拖入交互
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
        this.loadFile(e.dataTransfer.files[0]);
      }
    });

    this.dropPrompt.addEventListener('click', () => this.triggerSelect());
    this.btnReplace.addEventListener('click', () => this.triggerSelect());

    // 2. 悬浮舱展开/收起
    this.btnResizeTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.targetFormat === 'ico') return;
      this.resizePopoverWrap.classList.toggle('is-open');
      this.qualityPopoverWrap.classList.remove('is-open');
    });

    this.btnQualityTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.qualityPopoverWrap.classList.toggle('is-open');
      this.resizePopoverWrap.classList.remove('is-open');
    });

    document.addEventListener('click', (e) => {
      if (!this.resizePopoverWrap.contains(e.target)) {
        this.resizePopoverWrap.classList.remove('is-open');
      }
      if (!this.qualityPopoverWrap.contains(e.target)) {
        this.qualityPopoverWrap.classList.remove('is-open');
      }
    });

    // 3. 格式切换
    this.formatGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;

      this.formatGroup.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.targetFormat = btn.dataset.fmt;
      this.labelTargetFmt.textContent = this.targetFormat.toUpperCase();

      if (this.targetFormat === 'ico') {
        this.scaleGroup.style.display = 'none';
        if (this.icoSizeGroup) this.icoSizeGroup.style.display = 'none';
        this.resizePopoverWrap.style.opacity = '0.75';
        this.labelCurrentDim.textContent = '16~256 Multi';
        this.qualityPopoverWrap.style.opacity = '0.35';
        this.qualityPopoverWrap.style.pointerEvents = 'none';
      } else {
        this.scaleGroup.style.display = 'inline-flex';
        if (this.icoSizeGroup) this.icoSizeGroup.style.display = 'none';
        this.resizePopoverWrap.style.opacity = '1';

        if (this.targetFormat === 'png') {
          this.qualityPopoverWrap.style.opacity = '0.35';
          this.qualityPopoverWrap.style.pointerEvents = 'none';
        } else {
          this.qualityPopoverWrap.style.opacity = '1';
          this.qualityPopoverWrap.style.pointerEvents = 'all';
        }

        const activeScaleBtn = this.scaleGroup.querySelector('.segment-btn.active') || this.scaleGroup.children[0];
        const scale = parseFloat(activeScaleBtn.dataset.scale) || 1;
        this.applyScale(scale);
      }

      this.triggerReEncode(0);
    });

    // 4. 百分比缩放点击
    this.scaleGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;

      this.scaleGroup.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scale = parseFloat(btn.dataset.scale);
      this.applyScale(scale);
      this.triggerReEncode(0);
    });

    // 5. 自定义分辨率输入
    this.inputWidth.addEventListener('input', () => {
      let w = parseInt(this.inputWidth.value, 10);
      if (isNaN(w) || w <= 0) return;
      let h = Math.round(w / this.aspectRatio);
      this.setDimensions(w, h);
      this.clearScaleActive();
      this.triggerReEncode(150);
    });

    this.inputHeight.addEventListener('input', () => {
      let h = parseInt(this.inputHeight.value, 10);
      if (isNaN(h) || h <= 0) return;
      let w = Math.round(h * this.aspectRatio);
      this.setDimensions(w, h);
      this.clearScaleActive();
      this.triggerReEncode(150);
    });

    // 6. 质量调节
    this.qualitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.targetQuality = val / 100;
      this.qualityLabel.textContent = `${val}%`;
      this.labelCurrentQuality.textContent = `${val}%`;
      this.triggerReEncode(30); // 极短防抖，体验更跟手
    });

    // 7. 导出下载
    this.btnDownload.addEventListener('click', () => {
      if (!this.resultBlob || !this.sourceFile) return;
      const originalName = this.sourceFile.name;
      const lastDot = originalName.lastIndexOf('.');
      const baseName = lastDot > 0 ? originalName.substring(0, lastDot) : originalName;
      const outName = `${baseName}.${this.targetFormat}`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(this.resultBlob);
      link.download = outName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
  }

  applyScale(scale) {
    if (!this.originalWidth || !this.originalHeight) return;
    const w = Math.round(this.originalWidth * scale);
    const h = Math.round(this.originalHeight * scale);
    this.setDimensions(w, h);
  }

  setDimensions(w, h) {
    this.targetWidth = Math.max(1, w);
    this.targetHeight = Math.max(1, h);

    if (document.activeElement !== this.inputWidth) {
      this.inputWidth.value = this.targetWidth;
    }
    if (document.activeElement !== this.inputHeight) {
      this.inputHeight.value = this.targetHeight;
    }
    if (this.targetFormat !== 'ico') {
      this.labelCurrentDim.textContent = `${this.targetWidth} × ${this.targetHeight}`;
    }
  }

  clearScaleActive() {
    this.scaleGroup.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
  }

  bindSplitterEvents() {
    const onMove = (clientX) => {
      if (!this.isDraggingSplitter) return;
      const rect = this.canvasBox.getBoundingClientRect();
      let percent = ((clientX - rect.left) / rect.width) * 100;
      percent = Math.max(0, Math.min(100, percent));
      this.setSplitPercent(percent);
    };

    this.splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isDraggingSplitter = true;
      this.splitter.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingSplitter) onMove(e.clientX);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDraggingSplitter) {
        this.isDraggingSplitter = false;
        this.splitter.classList.remove('is-dragging');
      }
    });

    this.canvasBox.addEventListener('click', (e) => {
      if (e.target === this.splitter || this.splitter.contains(e.target)) return;
      const rect = this.canvasBox.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      this.setSplitPercent(Math.max(0, Math.min(100, percent)));
    });
  }

  setSplitPercent(percent) {
    this.splitPercent = percent;
    this.splitter.style.left = `${percent}%`;
    this.compressedLayer.style.clipPath = `polygon(${percent}% 0, 100% 0, 100% 100%, ${percent}% 100%)`;
  }

  triggerSelect() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.ico';
    input.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.loadFile(e.target.files[0]);
      }
    };
    input.click();
  }

  loadFile(file) {
    if (!file.type.startsWith('image/') && !file.name.endsWith('.ico')) {
      window.showNotice('请选择正确的图片格式 (PNG, JPG, WEBP, ICO 等)');
      return;
    }

    const isReplacing = !!this.sourceImg;
    if (isReplacing) {
      this.canvasBox.classList.remove('is-entering');
      this.canvasBox.classList.add('is-switching');
    }

    this.sourceFile = file;
    this.sourceSize = file.size;
    this.labelOriginalSize.textContent = this.formatFileSize(file.size);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      const delay = isReplacing ? 100 : 0;

      setTimeout(() => {
        this.sourceImg = img;
        this.originalWidth = img.naturalWidth || img.width;
        this.originalHeight = img.naturalHeight || img.height;
        this.aspectRatio = this.originalWidth / this.originalHeight;

        // 计算最佳视口呈现尺寸
        const maxW = window.innerWidth * 0.72;
        const maxH = window.innerHeight * 0.72;
        let displayW = this.originalWidth;
        let displayH = this.originalHeight;

        if (displayW > maxW || displayH > maxH) {
          const ratio = Math.min(maxW / displayW, maxH / displayH);
          displayW = Math.round(displayW * ratio);
          displayH = Math.round(displayH * ratio);
        }

        this.canvasBox.style.width = `${displayW}px`;
        this.canvasBox.style.height = `${displayH}px`;

        this.setDimensions(this.originalWidth, this.originalHeight);

        // 🌟【关键修复 1】：左右两张图在这一瞬间同步更换新图源，绝不让右侧残留旧图！
        this.imgOriginal.src = objectUrl;
        this.imgCompressed.src = objectUrl;

        this.dropPrompt.style.display = 'none';
        this.stage.style.display = 'flex';
        this.dock.classList.remove('disabled');
        this.btnDownload.disabled = false;

        this.setSplitPercent(50);
        this.triggerReEncode(0); // 立即启动最新转码

        if (isReplacing) {
          this.canvasBox.classList.remove('is-switching');
          this.canvasBox.classList.add('is-entering');
          setTimeout(() => {
            this.canvasBox.classList.remove('is-entering');
          }, 350);
        }
      }, delay);
    };

    img.src = objectUrl;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  triggerReEncode(delay = 30) {
    clearTimeout(this.encodeTimer);
    this.labelTargetSize.textContent = '计算中…';
    this.encodeTimer = setTimeout(() => {
      this.processEncode();
    }, delay);
  }

  async processEncode() {
    if (!this.sourceImg) return;

    // 🌟【关键修复 2】：递增 JobId，彻底杜绝快速调参数时旧任务覆盖新任务导致的抽搐与滞后
    const jobId = ++this.currentJobId;
    const img = this.sourceImg;

    // ================= 处理多分辨率 ICO 打包 (全并行加速) =================
    if (this.targetFormat === 'ico') {
      const icoBlob = await this.generateMultiSizeIco(img, this.icoStandardSizes);
      if (jobId !== this.currentJobId) return; // 抛弃过期帧

      this.resultBlob = icoBlob;

      const targetSize = icoBlob.size;
      this.labelTargetSize.textContent = this.formatFileSize(targetSize);

      const diff = ((targetSize - this.sourceSize) / this.sourceSize) * 100;
      const isSmaller = diff <= 0;
      this.labelSizeDiff.textContent = `${isSmaller ? '' : '+'}${diff.toFixed(0)}%`;
      this.labelSizeDiff.className = `badge-diff ${isSmaller ? '' : 'up'}`;
      return;
    }

    // ================= 处理 WebP / JPG / PNG =================
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const w = this.targetWidth;
    const h = this.targetHeight;
    canvas.width = w;
    canvas.height = h;

    if (this.targetFormat === 'jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    let blob;
    if (this.targetFormat === 'jpg') {
      blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', this.targetQuality));
    } else if (this.targetFormat === 'webp') {
      blob = await new Promise(r => canvas.toBlob(r, 'image/webp', this.targetQuality));
    } else {
      blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    }

    if (jobId !== this.currentJobId) return; // 抛弃过期帧

    this.resultBlob = blob;

    // 及时释放旧 URL，防止显存泄漏
    if (this.compressedUrl) {
      URL.revokeObjectURL(this.compressedUrl);
    }
    this.compressedUrl = URL.createObjectURL(blob);
    this.imgCompressed.src = this.compressedUrl;

    const targetSize = blob.size;
    this.labelTargetSize.textContent = this.formatFileSize(targetSize);

    const diff = ((targetSize - this.sourceSize) / this.sourceSize) * 100;
    const isSmaller = diff <= 0;
    this.labelSizeDiff.textContent = `${isSmaller ? '' : '+'}${diff.toFixed(0)}%`;
    this.labelSizeDiff.className = `badge-diff ${isSmaller ? '' : 'up'}`;
  }

  /**
   * 并行流水线：7 种分辨率同时计算，耗时缩短 80%
   */
  async generateMultiSizeIco(img, sizes) {
    const tasks = sizes.map(sz => {
      return new Promise((resolve) => {
        const cvs = document.createElement('canvas');
        cvs.width = sz;
        cvs.height = sz;
        const ctx = cvs.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, sz, sz);

        const scale = Math.min(sz / img.width, sz / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const drawX = Math.round((sz - drawW) / 2);
        const drawY = Math.round((sz - drawH) / 2);

        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        cvs.toBlob(async (blob) => {
          const arrayBuf = await blob.arrayBuffer();
          resolve({
            size: sz,
            buffer: new Uint8Array(arrayBuf)
          });
        }, 'image/png');
      });
    });

    // 🌟 Promise.all 并行渲染
    const pngBuffers = await Promise.all(tasks);

    const count = pngBuffers.length;
    const headerSize = 6 + count * 16;
    let totalDataSize = 0;
    pngBuffers.forEach(item => { totalDataSize += item.buffer.length; });

    const icoBuffer = new Uint8Array(headerSize + totalDataSize);
    const view = new DataView(icoBuffer.buffer);

    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, count, true);

    let currentOffset = headerSize;

    pngBuffers.forEach((item, i) => {
      const entryOffset = 6 + i * 16;
      const sz = item.size >= 256 ? 0 : item.size;

      view.setUint8(entryOffset + 0, sz);
      view.setUint8(entryOffset + 1, sz);
      view.setUint8(entryOffset + 2, 0);
      view.setUint8(entryOffset + 3, 0);
      view.setUint16(entryOffset + 4, 1, true);
      view.setUint16(entryOffset + 6, 32, true);
      view.setUint32(entryOffset + 8, item.buffer.length, true);
      view.setUint32(entryOffset + 12, currentOffset, true);

      icoBuffer.set(item.buffer, currentOffset);
      currentOffset += item.buffer.length;
    });

    return new Blob([icoBuffer], { type: 'image/x-icon' });
  }
}

window.initConvertFeature = function () {
  window.convertModule = new ConvertModule();
};