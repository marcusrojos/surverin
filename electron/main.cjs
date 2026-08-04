/**
 * Electron main process for the DPCI Delivery desktop app (.exe).
 *
 * The built web app is served over a tiny local HTTP server instead of file://
 * so that absolute asset paths, SPA routing and Supabase requests behave exactly
 * like on the web. PDF saving is handled natively through the "dpci:save-pdf"
 * IPC channel (see electron/preload.cjs).
 */
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST_DIR = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.join(DIST_DIR, urlPath);

        // Prevent path traversal outside dist/
        if (!filePath.startsWith(DIST_DIR)) {
          res.writeHead(403).end('Forbidden');
          return;
        }
        // SPA fallback: any unknown route serves index.html
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(DIST_DIR, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500).end('Internal error');
      }
    });

    server.on('error', reject);
    // Port 0 = let the OS pick a free port.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function createWindow() {
  const baseUrl = await startStaticServer();

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    title: 'DPCI Delivery',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  await win.loadURL(baseUrl);

  // External links open in the user's browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith(baseUrl)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/** Native "Save as" dialog + write the PDF, then open it with the default viewer. */
ipcMain.handle('dpci:save-pdf', async (_event, fileName, base64) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Enregistrer le document PDF',
      defaultPath: path.join(app.getPath('documents'), fileName),
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) return { ok: true, canceled: true };

    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    shell.openPath(filePath);
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
