import { app, shell, BrowserWindow, ipcMain, dialog, session, safeStorage } from 'electron'
import { join, resolve } from 'path'
import { readFile, writeFile, readdir, mkdir, rm, rename } from 'fs/promises'
import electronUpdater from 'electron-updater'
import { isSafeProjectId } from '../shared/projectId'

const { autoUpdater } = electronUpdater

const isDev = !app.isPackaged

/** Keys the renderer is allowed to read/write through the keychain bridge. */
const SECRET_KEYS = new Set([
  'apiKey',
  'ollamaToken',
  'customApiKey',
  'imageApiKey',
  'geminiApiKey',
  'githubToken'
])

/** Hard cap on a project snapshot (base64 scene images are the bulk). */
const MAX_PROJECT_BYTES = 64 * 1024 * 1024

/** Reject IPC from anything other than the app's own renderer. */
function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env['ELECTRON_RENDERER_URL'] ?? ''
  // Packaged builds load a file:// bundle; dev may load the Vite dev server.
  const trusted = url.startsWith('file://') || (isDev && !!devUrl && url.startsWith(devUrl))
  if (!trusted) throw new Error('Untrusted IPC sender')
}

/** Resolve a project folder, refusing traversal and symlink escapes. */
function projectDir(id: string): string {
  if (!isSafeProjectId(id)) throw new Error('Invalid project id')
  const root = resolve(projectsRoot())
  const dir = resolve(root, id)
  if (dir !== join(root, id)) throw new Error('Invalid project id')
  return dir
}

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
    // `https:` is required for user-supplied custom AI/image endpoints and for
    // `# IMAGE:` tags pointing at remote illustrations.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    // Named providers are allowlisted; `https:` is kept for user-configured
    // OpenAI-compatible / image endpoints (OpenRouter, LiteLLM, SwarmUI, …).
    "connect-src 'self' https://api.anthropic.com https://api.openai.com https://api.github.com https://generativelanguage.googleapis.com http://localhost:* https:",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
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
  const file = secretsPath()
  const tmp = `${file}.tmp`
  // 0600 + write-then-rename: the keychain ciphertext is never world-readable
  // and a crash mid-write cannot corrupt the store.
  await writeFile(tmp, JSON.stringify(map), { encoding: 'utf-8', mode: 0o600 })
  await rename(tmp, file)
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
      preload: join(__dirname, '../preload/index.cjs'),
      // The preload only needs contextBridge + ipcRenderer, both available in
      // a sandboxed renderer. Keep the renderer out of Node entirely.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
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

  // Never navigate the app window away from its own bundled UI. The preload
  // bridge is attached to the window and would otherwise be exposed to any
  // page the renderer navigates to. Vite's dev server origin is allowed so
  // hot reloads keep working; packaged builds allow no navigation at all.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (isDev && devUrl) {
      try {
        if (new URL(url).origin === new URL(devUrl).origin) return
      } catch {
        // Malformed URL — fall through and block it.
      }
    }
    event.preventDefault()
  })
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * GitHub Releases auto-update. Only packaged builds update; dev runs skip.
 * The release workflow publishes `latest*.yml` + blockmaps alongside the
 * installers, and electron-updater verifies the SHA-512 from that metadata.
 * macOS updates additionally require the app to be code-signed (it is, in CI).
 */
function setupAutoUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err instanceof Error ? err.message : err)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Playable Lessons ${info.version} is ready to install.`,
      detail: 'Restart now to finish updating, or it will install when you quit.'
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })

  const check = (): void => {
    // `checkForUpdates` downloads automatically (autoDownload) and emits
    // `update-downloaded`; no system notification to duplicate our dialog.
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] check failed:', err instanceof Error ? err.message : err)
    })
  }

  // Don't compete with startup; then check every six hours while running.
  setTimeout(check, 5_000).unref?.()
  const timer = setInterval(check, 6 * 60 * 60 * 1000)
  timer.unref?.()
}

app.whenReady().then(() => {
  // Must match `appId` in electron-builder.yml for Windows notifications.
  app.setAppUserModelId?.('com.playablelessons.app')

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

  // The app needs no camera/mic/geolocation/notifications/etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)

  // IPC: Open file dialog
  ipcMain.handle('dialog:openFile', async (event, filters?: Electron.FileFilter[]) => {
    assertTrustedSender(event)
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
  ipcMain.handle('dialog:saveFile', async (event, defaultName: string, content: string, filters?: Electron.FileFilter[]) => {
    assertTrustedSender(event)
    if (typeof content !== 'string') throw new Error('Invalid content')
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
  ipcMain.handle('dialog:saveBinaryFile', async (event, defaultName: string, base64: string, filters?: Electron.FileFilter[]) => {
    assertTrustedSender(event)
    if (typeof base64 !== 'string') throw new Error('Invalid binary content')
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(base64, 'base64'))
    return result.filePath
  })

  // IPC: Open image file and return as base64 data URL
  ipcMain.handle('image:import', async (event) => {
    assertTrustedSender(event)
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
  ipcMain.handle('secret:get', async (event, key: string): Promise<string> => {
    assertTrustedSender(event)
    if (!SECRET_KEYS.has(key)) throw new Error('Unknown secret key')
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
  ipcMain.handle('secret:set', async (event, key: string, value: string): Promise<boolean> => {
    assertTrustedSender(event)
    if (!SECRET_KEYS.has(key)) throw new Error('Unknown secret key')
    if (typeof value !== 'string' || value.length > 16_384) throw new Error('Invalid secret value')
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
  ipcMain.handle('projects:root', (event) => {
    assertTrustedSender(event)
    return projectsRoot()
  })

  ipcMain.handle('projects:list', async (event): Promise<any[]> => {
    assertTrustedSender(event)
    const root = projectsRoot()
    let entries: import('fs').Dirent[]
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      return []
    }
    const metas: any[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeProjectId(entry.name)) continue
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

  ipcMain.handle('projects:read', async (event, id: string): Promise<any> => {
    assertTrustedSender(event)
    try {
      return JSON.parse(
        await readFile(join(projectDir(id), 'project.json'), 'utf-8')
      )
    } catch {
      return null
    }
  })

  ipcMain.handle('projects:save', async (
    event,
    project: any
  ): Promise<{ id: string; path: string }> => {
    assertTrustedSender(event)
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      throw new Error('Invalid project')
    }
    if (!isSafeProjectId(project.id)) throw new Error('Invalid project id')
    if (typeof project.name !== 'string' || project.name.length > 512) {
      throw new Error('Invalid project name')
    }
    // Stamp a schema version so future migrations have an anchor.
    const snapshot = { ...project, schemaVersion: project.schemaVersion ?? 1 }
    const json = JSON.stringify(snapshot, null, 2)
    if (Buffer.byteLength(json, 'utf-8') > MAX_PROJECT_BYTES) {
      throw new Error('Project is too large to save (64 MB limit).')
    }
    const dir = projectDir(project.id)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, 'project.json')
    // Write-then-rename: a crash mid-save cannot truncate the previous file.
    const tmpPath = join(dir, '.project.json.tmp')
    await writeFile(tmpPath, json, 'utf-8')
    await rename(tmpPath, filePath)
    return { id: project.id, path: filePath }
  })

  ipcMain.handle('projects:delete', async (event, id: string): Promise<void> => {
    assertTrustedSender(event)
    await rm(projectDir(id), { recursive: true, force: true })
  })

  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
