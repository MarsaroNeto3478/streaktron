import type { LinkableKind } from '@strekatron/shared/rich';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';

/** The search params that open a sheet over any page (so it survives a reload). */
export type SheetKind = Exclude<LinkableKind, 'project'>;
const SHEETS = { task: undefined, goal: undefined, area: undefined };

/** Open a task, goal or area in its sheet, closing any other; `undefined` closes it. */
export function useOpenSheet() {
  const navigate = useNavigate();
  return useCallback(
    (kind: SheetKind, id: string | undefined) =>
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, ...SHEETS, [kind]: id }),
        replace: !id,
      } as never),
    [navigate],
  );
}

/** Open a task in the detail sheet. */
export function useOpenTask() {
  const open = useOpenSheet();
  return useCallback((id: string | undefined) => open('task', id), [open]);
}

/** Open anything that can be mentioned: projects get their page, the rest a sheet. */
export function useOpenEntity() {
  const navigate = useNavigate();
  const open = useOpenSheet();
  return useCallback(
    (ref: { kind: LinkableKind; id: string }) => {
      if (ref.kind === 'project') {
        void navigate({ to: '/projects/$projectId', params: { projectId: ref.id } });
      } else open(ref.kind, ref.id);
    },
    [navigate, open],
  );
}
