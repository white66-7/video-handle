const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getFilePath: (file) => webUtils.getPathForFile(file),
  // 打开文件选择器
  openGifDialog: () => ipcRenderer.invoke('dialog:open-gif'),
  // 核心裁剪
  processCrop: (payload) => ipcRenderer.invoke('gif:process-crop', payload),
  // 在文件夹中显示文件
  showInFolder: (path) => ipcRenderer.invoke('shell:show-item', path)
});