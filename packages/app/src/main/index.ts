import { app, BrowserWindow, ipcMain, screen, type WebContents } from 'electron';
import * as path from 'node:path';
import { registerPipelineIpc, shutdownPipeline } from './pipeline';
import {
  loadWindowState, minimumSizeForBounds, showRestoredWindow,
  WINDOW_STATE_CONFIG_NAME, WindowStateTracker,
} from './window-state';
import { windowChromeOptions } from './window-chrome';

let win: BrowserWindow | null = null;

app.setName('CodeDoc');
app.enableSandbox();

function isTrustedRenderer(sender: WebContents): boolean {
  return win !== null && !win.isDestroyed() && sender === win.webContents;
}

function createWindow() {
  const stateFile = path.join(app.getPath('userData'), WINDOW_STATE_CONFIG_NAME);
  const restoredState = loadWindowState(stateFile, screen);
  const minimumSize = minimumSizeForBounds(restoredState.bounds);
  const createdWindow = new BrowserWindow({
    ...restoredState.bounds,
    minWidth: minimumSize.width,
    minHeight: minimumSize.height,
    ...windowChromeOptions(process.platform),
    show: false,
    icon: path.join(__dirname, '../../build/icon.png'),
    backgroundColor: '#f4f4f5',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win = createdWindow;

  new WindowStateTracker(stateFile, createdWindow, screen, restoredState);
  createdWindow.on('ready-to-show', () => {
    showRestoredWindow(createdWindow, restoredState);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    createdWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    createdWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerPipelineIpc(isTrustedRenderer);

  ipcMain.on('win:minimize', (event) => {
    if (!isTrustedRenderer(event.sender)) return;
    win?.minimize();
  });
  ipcMain.on('win:maximize', (event) => {
    if (!isTrustedRenderer(event.sender)) return;
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize();
  });
  ipcMain.on('win:close', (event) => {
    if (!isTrustedRenderer(event.sender)) return;
    win?.close();
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void shutdownPipeline();
});
