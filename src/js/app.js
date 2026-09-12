const winMinBtn = document.getElementById('winMinBtn');
const winMaxBtn = document.getElementById('winMaxBtn');
const winCloseBtn = document.getElementById('winCloseBtn');

winMinBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  window.electronAPI?.minimizeWindow();
});

winMaxBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  window.electronAPI?.maximizeWindow();
});

winCloseBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  window.electronAPI?.closeWindow();
});


// 2. 全局通知弹条 (可在任何模块通过 window.showNotice('提示信息') 调用)
window.showNotice = function (msg) {
  const notice = document.getElementById('notice');
  const noticeText = document.getElementById('noticeText');
  if (noticeText) noticeText.innerText = msg;
  if (notice) notice.style.display = 'flex';
};

document.getElementById('noticeClose')?.addEventListener('click', () => {
  const notice = document.getElementById('notice');
  if (notice) notice.style.display = 'none';
});


// 3. 左侧导航切栏 (裁切 / 截取 / 压缩 / 转换)
const tabCropBtn = document.getElementById('tabCropBtn');
const tabSnapshotBtn = document.getElementById('tabSnapshotBtn');
const tabCompressBtn = document.getElementById('tabCompressBtn');
const tabConvertBtn = document.getElementById('tabConvertBtn');

const cropWorkspace = document.getElementById('cropWorkspace');
const snapshotWorkspace = document.getElementById('snapshotWorkspace');
const compressWorkspace = document.getElementById('compressWorkspace');
const convertWorkspace = document.getElementById('convertWorkspace');

const tabs = [
  { btn: tabCropBtn, panel: cropWorkspace },
  { btn: tabSnapshotBtn, panel: snapshotWorkspace },
  { btn: tabCompressBtn, panel: compressWorkspace },
  { btn: tabConvertBtn, panel: convertWorkspace }
];

function switchTab(targetBtn, targetPanel) {
  tabs.forEach(({ btn, panel }) => {
    btn?.classList.remove('active');
    panel?.classList.remove('active');
  });
  targetBtn?.classList.add('active');
  targetPanel?.classList.add('active');
}

tabCropBtn?.addEventListener('click', () => switchTab(tabCropBtn, cropWorkspace));
tabSnapshotBtn?.addEventListener('click', () => switchTab(tabSnapshotBtn, snapshotWorkspace));
tabCompressBtn?.addEventListener('click', () => switchTab(tabCompressBtn, compressWorkspace));
tabConvertBtn?.addEventListener('click', () => switchTab(tabConvertBtn, convertWorkspace));


// 4. 硬件状态灯与 GPU 编码器监听
const encoderInfo = document.getElementById('encoderInfo');
const encoderLabel = document.getElementById('encoderLabel');

function renderHardware(profile) {
  if (!profile || !profile.isReady || !encoderInfo || !encoderLabel) return;
  window.currentHardwareProfile = profile; // 共享给压缩/转换模块使用

  encoderInfo.classList.remove('hw', 'cpu');
  if (profile.isHardware) {
    encoderInfo.classList.add('hw');
    encoderLabel.innerText = profile.label;
    encoderInfo.title = `硬件加速就绪: ${profile.gpuName}`;
  } else {
    encoderInfo.classList.add('cpu');
    encoderLabel.innerText = profile.probeError ? 'CPU（硬件不可用）' : 'CPU (libx264)';
  }

  if (profile.probeError) {
    window.showNotice(`硬件加速不可用，已自动改用 CPU。原因：${profile.probeError}`);
  }
}

// 接收来自主进程的硬件配置检测
if (window.electronAPI?.onHardwareProfileUpdated) {
  window.electronAPI.onHardwareProfileUpdated(renderHardware);
}
if (window.electronAPI?.getHardwareProfile) {
  window.electronAPI.getHardwareProfile().then(renderHardware);
}


// 5. 启动各个独立子模块 (加 try-catch 隔离，单模块异常不影响其他功能)
try { window.initCropFeature?.(); } catch (e) { console.error('[Crop Feature Init Error]:', e); }
try { window.initSnapshotFeature?.(); } catch (e) { console.error('[Snapshot Feature Init Error]:', e); }
try { window.initCompressFeature?.(); } catch (e) { console.error('[Compress Feature Init Error]:', e); }
try { window.initConvertFeature?.(); } catch (e) { console.error('[Convert Feature Init Error]:', e); }