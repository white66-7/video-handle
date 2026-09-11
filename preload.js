const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件路径与原生文件选择框
  getFilePath: (file) => webUtils.getPathForFile(file),
  openGifDialog: () => ipcRenderer.invoke('dialog:open-gif'),
  openVideoDialog: () => ipcRenderer.invoke('dialog:open-video'),
  showInFolder: (path) => ipcRenderer.invoke('shell:show-item', path),

  // 功能处理：裁切、首帧提取、指定帧截取
  getVideoFrame: (filePath) => ipcRenderer.invoke('video:get-frame', filePath),
  processCrop: (payload) => ipcRenderer.invoke('gif:process-crop', payload),
  saveSnapshot: (payload) => ipcRenderer.invoke('video:save-snapshot', payload),

  // 硬件配置与状态通知
  getHardwareProfile: () => ipcRenderer.invoke('system:get-hardware-profile'),
  onHardwareProfileUpdated: (callback) => {
    ipcRenderer.on('system:hardware-profile-updated', (_event, profile) => callback(profile));
  }
});