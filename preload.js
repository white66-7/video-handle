const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 1. 本地文件与系统对话框
  getFilePath: (file) => webUtils.getPathForFile(file),
  openGifDialog: () => ipcRenderer.invoke('dialog:open-gif'),
  showInFolder: (path) => ipcRenderer.invoke('shell:show-item', path),

  // 2. FFmpeg 视频/动图处理
  getVideoFrame: (filePath) => ipcRenderer.invoke('video:get-frame', filePath),
  processCrop: (payload) => ipcRenderer.invoke('gif:process-crop', payload),

  // 3. 硬件配置状态查询与实时监听推送
  getHardwareProfile: () => ipcRenderer.invoke('system:get-hardware-profile'),
  onHardwareProfileUpdated: (callback) => {
    ipcRenderer.on('system:hardware-profile-updated', (_event, profile) => callback(profile));
  }
});