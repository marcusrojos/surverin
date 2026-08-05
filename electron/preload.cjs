/**
 * Secure bridge between the desktop app window and the Electron main process.
 * Only PDF saving/opening is exposed (contextIsolation stays enabled, no Node
 * API reaches the renderer). Every filesystem operation goes through IPC.
 */
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  savePdf: (fileName, base64) => ipcRenderer.invoke('dpci:save-pdf', fileName, base64),
  openPdf: (fileName, base64) => ipcRenderer.invoke('dpci:open-pdf', fileName, base64),
};

contextBridge.exposeInMainWorld('dpciDesktop', api);
// Alias kept for compatibility with earlier builds of the desktop shell.
contextBridge.exposeInMainWorld('electronPdf', api);
