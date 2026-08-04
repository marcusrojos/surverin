/**
 * Secure bridge between the desktop app window and the Electron main process.
 * Only the PDF saving capability is exposed (contextIsolation stays enabled).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dpciDesktop', {
  savePdf: (fileName, base64) => ipcRenderer.invoke('dpci:save-pdf', fileName, base64),
});
