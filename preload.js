const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('retzef', {
  getBoard: () => ipcRenderer.invoke('get-board'),
  summarize: () => ipcRenderer.invoke('summarize'),
  resume: (target) => ipcRenderer.invoke('resume', target),
  resumeCluster: (targets) => ipcRenderer.invoke('resume-cluster', targets),
  quit: () => ipcRenderer.send('quit'),
  onRefresh: (cb) => ipcRenderer.on('refresh', cb)
});
