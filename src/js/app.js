// 全局通知弹条
window.showNotice = function(msg) {
  const notice = document.getElementById('notice');
  document.getElementById('noticeText').innerText = msg;
  notice.style.display = 'flex';
};

document.getElementById('noticeClose').addEventListener('click', () => {
  document.getElementById('notice').style.display = 'none';
});

// 左侧切栏
const tabCropBtn = document.getElementById('tabCropBtn');
const tabSnapshotBtn = document.getElementById('tabSnapshotBtn');
const cropWorkspace = document.getElementById('cropWorkspace');
const snapshotWorkspace = document.getElementById('snapshotWorkspace');

tabCropBtn.addEventListener('click', () => {
  tabCropBtn.classList.add('active');
  tabSnapshotBtn.classList.remove('active');
  cropWorkspace.classList.add('active');
  snapshotWorkspace.classList.remove('active');
});

tabSnapshotBtn.addEventListener('click', () => {
  tabSnapshotBtn.classList.add('active');
  tabCropBtn.classList.remove('active');
  snapshotWorkspace.classList.add('active');
  cropWorkspace.classList.remove('active');
});

// 硬件灯状态监听
const encoderInfo = document.getElementById('encoderInfo');
const encoderLabel = document.getElementById('encoderLabel');

function renderHardware(profile) {
  if (!profile || !profile.isReady) return;
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

if (window.electronAPI.onHardwareProfileUpdated) {
  window.electronAPI.onHardwareProfileUpdated(renderHardware);
}
window.electronAPI.getHardwareProfile().then(renderHardware);

// 启动各个独立子模块
window.initCropFeature();
window.initSnapshotFeature();