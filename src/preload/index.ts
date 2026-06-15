import { contextBridge, ipcRenderer } from 'electron'

export type FileFilter = { name: string; extensions: string[] }

const api = {
  openFile: (filters?: FileFilter[]): Promise<{ filePath: string; content: string } | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),

  saveFile: (defaultName: string, content: string, filters?: FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName, content, filters),

  importImage: (): Promise<{ dataUrl: string; fileName: string; filePath: string } | null> =>
    ipcRenderer.invoke('image:import'),

  // Secrets are stored via the OS keychain (Electron safeStorage), never in
  // renderer-accessible storage. `setSecret` returns false if the OS provides
  // no secure storage, in which case the value is not persisted.
  getSecret: (key: string): Promise<string> =>
    ipcRenderer.invoke('secret:get', key),

  setSecret: (key: string, value: string): Promise<boolean> =>
    ipcRenderer.invoke('secret:set', key, value)
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
