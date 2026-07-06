import { app, shell, BrowserWindow, ipcMain, dialog, session, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, readdir, mkdir, rm } from 'fs/promises'

const isDev = !app.isPackaged

/** Content-Security-Policy applied to renderer responses. */
function contentSecurityPolicy(): string {
  if (isDev) {
    // Vite dev server needs inline/eval + websockets for HMR.
    return [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
      "img-src 'self' data: blob: https: http:",
      "connect-src 'self' https: http://localhost:* ws://localhost:*"
    ].join('; ')
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    // AI providers + GitHub + a locally-running Ollama. `https:` covers a
    // user-configured remote Ollama over TLS.
    "connect-src 'self' https://api.anthropic.com https://api.openai.com https://api.github.com http://localhost:* https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
}

function secretsPath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

/** Directory holding project folders — one project.json per folder. */
function projectsRoot(): string {
  return join(app.getPath('documents'), 'Playable Lessons')
}

async function readSecrets(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(secretsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

async function writeSecrets(map: Record<string, string>): Promise<void> {
  await writeFile(secretsPath(), JSON.stringify(map), 'utf-8')
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links in the user's browser — but only safe web schemes.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol
      if (protocol === 'https:' || protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Malformed URL — ignore.
    }
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  app.setAppUserModelId?.('com.playablelessons')

  // Apply a Content-Security-Policy to every response served to the renderer.
  const csp = contentSecurityPolicy()
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  // IPC: Open file dialog
  ipcMain.handle('dialog:openFile', async (_event, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf-8')
    return { filePath, content }
  })

  // IPC: Save file dialog
  ipcMain.handle('dialog:saveFile', async (_event, defaultName: string, content: string, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: filters || [
        { name: 'HTML Files', extensions: ['html'] },
        { name: 'Ink Files', extensions: ['ink'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, content, 'utf-8')
    return result.filePath
  })

  // IPC: Save binary file dialog (content arrives base64-encoded, e.g. .h5p zips)
  ipcMain.handle('dialog:saveBinaryFile', async (_event, defaultName: string, base64: string, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(base64, 'base64'))
    return result.filePath
  })

  // IPC: Open image file and return as base64 data URL
  ipcMain.handle('image:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const buffer = await readFile(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml'
    }
    const mime = mimeTypes[ext] || 'image/png'
    const base64 = Buffer.from(buffer).toString('base64')
    const dataUrl = `data:${mime};base64,${base64}`
    const fileName = filePath.split('/').pop() || `image.${ext}`
    return { dataUrl, fileName, filePath }
  })

  // IPC: Read a secret (e.g. API key) from the OS-encrypted store.
  ipcMain.handle('secret:get', async (_event, key: string): Promise<string> => {
    if (!safeStorage.isEncryptionAvailable()) return ''
    const map = await readSecrets()
    const enc = map[key]
    if (!enc) return ''
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return ''
    }
  })

  // IPC: Write a secret to the OS-encrypted store. Returns false if the OS
  // provides no secure storage (in which case the secret is NOT persisted).
  ipcMain.handle('secret:set', async (_event, key: string, value: string): Promise<boolean> => {
    if (!safeStorage.isEncryptionAvailable()) return false
    const map = await readSecrets()
    if (value) {
      map[key] = safeStorage.encryptString(value).toString('base64')
    } else {
      delete map[key]
    }
    await writeSecrets(map)
    return true
  })

  // ─── Projects (local dashboard) ───
  // Each project is a folder under the projects root containing project.json.
  ipcMain.handle('projects:root', () => projectsRoot())

  ipcMain.handle('projects:list', async (): Promise<any[]> => {
    const root = projectsRoot()
    let entries: import('fs').Dirent[]
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      return []
    }
    const metas: any[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const data = JSON.parse(
          await readFile(join(root, entry.name, 'project.json'), 'utf-8')
        )
        metas.push({
          id: data.id || entry.name,
          name: data.name || entry.name,
          inputMode: data.inputMode || 'topic',
          createdAt: data.createdAt || 0,
          updatedAt: data.updatedAt || 0,
          artifacts: {
            story: !!data.inkSource,
            flashcards: !!data.flashcards,
            quiz: !!data.quiz,
            summary: !!data.summary,
            aiTask: !!data.aiTask,
            caseStudy: !!data.caseStudy
          }
        })
      } catch {
        // skip folders without a readable project.json
      }
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt)
  })

  ipcMain.handle('projects:read', async (_event, id: string): Promise<any> => {
    try {
      return JSON.parse(
        await readFile(join(projectsRoot(), id, 'project.json'), 'utf-8')
      )
    } catch {
      return null
    }
  })

  ipcMain.handle('projects:save', async (
    _event,
    project: any
  ): Promise<{ id: string; path: string }> => {
    const dir = join(projectsRoot(), project.id)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, 'project.json')
    await writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8')
    return { id: project.id, path: filePath }
  })

  ipcMain.handle('projects:delete', async (_event, id: string): Promise<void> => {
    await rm(join(projectsRoot(), id), { recursive: true, force: true })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
