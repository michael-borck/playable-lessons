/**
 * Renderer wrapper around the project IPC bridge (window.api.projects).
 * Used by the Projects dashboard view + store.
 */
import type { ProjectMeta, ProjectFull } from '../../../shared/project'

export const projectService = {
  root: (): Promise<string> => window.api.projects.root(),
  list: (): Promise<ProjectMeta[]> => window.api.projects.list(),
  read: (id: string): Promise<ProjectFull | null> => window.api.projects.read(id),
  save: (project: ProjectFull): Promise<{ id: string; path: string }> =>
    window.api.projects.save(project),
  delete: (id: string): Promise<void> => window.api.projects.delete(id)
}
