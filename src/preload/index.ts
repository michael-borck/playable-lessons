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
    ipcRenderer.invoke('secret:set', key, value),
  // Projects (local dashboard) — each project is a folder on disk.
  projects: {
    root: (): Promise<string> => ipcRenderer.invoke('projects:root'),
    list: (): Promise<any[]> => ipcRenderer.invoke('projects:list'),
    read: (id: string): Promise<any> => ipcRenderer.invoke('projects:read', id),
    save: (project: any): Promise<{ id: string; path: string }> =>
      ipcRenderer.invoke('projects:save', project),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('projects:delete', id)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
