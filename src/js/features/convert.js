/**
 * 图片转换模块 (Squoosh 模式：上浮悬浮舱 + 改分辨率 100% 对齐防错位)
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

    this.resultBlob = null;
    this.splitPercent = 50;
    this.isDraggingSplitter = false;

    this.encodeTimer = null;

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

    // 2. 悬浮舱点击锁定/展开
    this.btnResizeTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
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
        this.icoSizeGroup.style.display = 'inline-flex';
        this.qualityPopoverWrap.style.opacity = '0.35';
        this.qualityPopoverWrap.style.pointerEvents = 'none';

        const activeIcoBtn = this.icoSizeGroup.querySelector('.segment-btn.active') || this.icoSizeGroup.children[0];
        const sz = parseInt(activeIcoBtn.dataset.size, 10);
        this.setDimensions(sz, sz);
      } else {
        this.scaleGroup.style.display = 'inline-flex';
        this.icoSizeGroup.style.display = 'none';

        if (this.targetFormat === 'png') {
          this.qualityPopoverWrap.style.opacity = '0.35';
          this.qualityPopoverWrap.style.pointerEvents = 'none';
        } else {
          this.qualityPopoverWrap.style.opacity = '1';
          this.qualityPopoverWrap.style.pointerEvents = 'all';
        }

        const activeScaleBtn = this.scaleGroup.querySelector('.segment-btn.active') || this.scaleGroup.children[0];
        const scale = parseFloat(activeScaleBtn.dataset.scale);
        this.applyScale(scale);
      }

      this.triggerReEncode();
    });

    // 4. 百分比缩放点击
    this.scaleGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;

      this.scaleGroup.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const scale = parseFloat(btn.dataset.scale);
      this.applyScale(scale);
      this.triggerReEncode();
    });

    // 5. ICO 预设尺寸点击
    this.icoSizeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;

      this.icoSizeGroup.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sz = parseInt(btn.dataset.size, 10);
      this.setDimensions(sz, sz);
      this.triggerReEncode();
    });

    // 6. 自定义分辨率输入 (等比换算)
    this.inputWidth.addEventListener('input', () => {
      let w = parseInt(this.inputWidth.value, 10);
      if (isNaN(w) || w <= 0) return;
      let h = Math.round(w / this.aspectRatio);
      this.setDimensions(w, h);
      this.clearScaleActive();
      this.triggerReEncode(250);
    });

    this.inputHeight.addEventListener('input', () => {
      let h = parseInt(this.inputHeight.value, 10);
      if (isNaN(h) || h <= 0) return;
      let w = Math.round(h * this.aspectRatio);
      this.setDimensions(w, h);
      this.clearScaleActive();
      this.triggerReEncode(250);
    });

    // 7. 质量调节
    this.qualitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.targetQuality = val / 100;
      this.qualityLabel.textContent = `${val}%`;
      this.labelCurrentQuality.textContent = `${val}%`;
      this.triggerReEncode(120);
    });

    // 8. 导出下载
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
    this.labelCurrentDim.textContent = `${this.targetWidth} × ${this.targetHeight}`;
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

    this.sourceFile = file;
    this.sourceSize = file.size;
    this.labelOriginalSize.textContent = this.formatFileSize(file.size);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.sourceImg = img;
      this.originalWidth = img.naturalWidth || img.width;
      this.originalHeight = img.naturalHeight || img.height;
      this.aspectRatio = this.originalWidth / this.originalHeight;

      // 动态锁定画布外框的最佳比例，使两张图片绝对 1:1 重叠不发生位移
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

      // 初始化分辨率设置
      if (this.targetFormat === 'ico') {
        this.setDimensions(256, 256);
      } else {
        this.setDimensions(this.originalWidth, this.originalHeight);
      }

      this.imgOriginal.src = objectUrl;

      this.dropPrompt.style.display = 'none';
      this.stage.style.display = 'flex';
      this.dock.classList.remove('disabled');
      this.btnDownload.disabled = false;

      this.setSplitPercent(50);
      this.triggerReEncode(0);
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

  triggerReEncode(delay = 60) {
    clearTimeout(this.encodeTimer);
    this.labelTargetSize.textContent = '计算中…';
    this.encodeTimer = setTimeout(() => {
      this.processEncode();
    }, delay);
  }

  async processEncode() {
    if (!this.sourceImg) return;

    const img = this.sourceImg;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const w = this.targetWidth;
    const h = this.targetHeight;
    canvas.width = w;
    canvas.height = h;

    if (this.targetFormat === 'ico') {
      ctx.clearRect(0, 0, w, h);
      const scale = Math.min(w / img.width, h / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      ctx.drawImage(img, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
    } else {
      if (this.targetFormat === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
    }

    let blob;
    if (this.targetFormat === 'ico') {
      const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      blob = await this.createIcoFromPng(pngBlob, w, h);
    } else if (this.targetFormat === 'jpg') {
      blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', this.targetQuality));
    } else if (this.targetFormat === 'webp') {
      blob = await new Promise(r => canvas.toBlob(r, 'image/webp', this.targetQuality));
    } else {
      blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    }

    this.resultBlob = blob;
    this.imgCompressed.src = URL.createObjectURL(blob);

    const targetSize = blob.size;
    this.labelTargetSize.textContent = this.formatFileSize(targetSize);

    const diff = ((targetSize - this.sourceSize) / this.sourceSize) * 100;
    const isSmaller = diff <= 0;
    this.labelSizeDiff.textContent = `${isSmaller ? '' : '+'}${diff.toFixed(0)}%`;
    this.labelSizeDiff.className = `badge-diff ${isSmaller ? '' : 'up'}`;
  }

  createIcoFromPng(pngBlob, width, height) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const pngBuf = new Uint8Array(e.target.result);
        const icoBuf = new Uint8Array(22 + pngBuf.length);
        const view = new DataView(icoBuf.buffer);

        view.setUint16(0, 0, true);
        view.setUint16(2, 1, true);
        view.setUint16(4, 1, true);
        view.setUint8(6, width >= 256 ? 0 : width);
        view.setUint8(7, height >= 256 ? 0 : height);
        view.setUint8(8, 0);
        view.setUint8(9, 0);
        view.setUint16(10, 1, true);
        view.setUint16(12, 32, true);
        view.setUint32(14, pngBuf.length, true);
        view.setUint32(18, 22, true);

        icoBuf.set(pngBuf, 22);
        resolve(new Blob([icoBuf], { type: 'image/x-icon' }));
      };
      reader.readAsArrayBuffer(pngBlob);
    });
  }
}

window.initConvertFeature = function () {
  window.convertModule = new ConvertModule();
};