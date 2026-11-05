import type { ProjectStatus } from '@strekatron/shared/structure';
import { createContext, useContext } from 'react';

export type ChangeStatus = (
  project: { id: string; title: string },
  status: ProjectStatus,
) => Promise<boolean>;

export const ProjectStatusContext = createContext<ChangeStatus | null>(null);

/** Change a project's status; over the active limit, the shell's dialog takes over. */
export function useProjectStatus(): ChangeStatus {
  const change = useContext(ProjectStatusContext);
  if (!change) throw new Error('useProjectStatus needs <ProjectStatusProvider>');
  return change;
}
