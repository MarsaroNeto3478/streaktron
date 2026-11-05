// The area and project dialogs (new and edit), mounted once in the shell and opened through
// ui-store, so the palette, sidebar and pages all open the same ones.

import type { RichDoc } from '@strekatron/shared/rich';
import type { ColorKey, IconKey } from '@strekatron/shared/structure';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent, type ReactNode } from 'react';
import { EntityIcon } from '@/components/entity-icon';
import { ColorPicker, IconPicker } from '@/components/look-pickers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichEditor } from '@/components/rich-editor';
import { useStructureActions } from '@/lib/actions';
import { areasQuery, meQuery, projectsQuery, type Area, type Project } from '@/lib/queries';
import { setUi, useUi } from '@/lib/ui-store';

export function StructureDialogs() {
  const ui = useUi();
  const { data: areas } = useQuery(areasQuery);
  const { data: projects } = useQuery(projectsQuery);
  const editingArea = ui.areaDialog?.areaId
    ? areas?.find((a) => a.id === ui.areaDialog?.areaId)
    : undefined;
  const editingProject = ui.projectDialog?.projectId
    ? projects?.find((p) => p.id === ui.projectDialog?.projectId)
    : undefined;

  return (
    <>
      <Dialog open={!!ui.areaDialog} onOpenChange={(o) => !o && setUi({ areaDialog: null })}>
        {ui.areaDialog && (
          <AreaForm
            key={ui.areaDialog.areaId ?? 'new'}
            area={editingArea}
            onDone={() => setUi({ areaDialog: null })}
          />
        )}
      </Dialog>
      <Dialog open={!!ui.projectDialog} onOpenChange={(o) => !o && setUi({ projectDialog: null })}>
        {ui.projectDialog && (
          <ProjectForm
            key={ui.projectDialog.projectId ?? 'new'}
            project={editingProject}
            areaId={ui.projectDialog.areaId}
            areas={areas ?? []}
            projects={projects ?? []}
            onDone={() => setUi({ projectDialog: null })}
          />
        )}
      </Dialog>
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function AreaForm({ area, onDone }: { area?: Area; onDone: () => void }) {
  const actions = useStructureActions();
  const [title, setTitle] = useState(area?.title ?? '');
  const [color, setColor] = useState<ColorKey>(area?.color ?? 'blue');
  const [icon, setIcon] = useState<IconKey>(area?.icon ?? 'folder');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const ok = area
      ? await actions.updateArea(area.id, { title, color, icon })
      : await actions.createArea({ title, color, icon });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={submit} className="grid gap-5">
        <DialogHeader>
          <DialogTitle>{area ? 'Edit area' : 'New area'}</DialogTitle>
          <DialogDescription>
            A long-lived part of your life, like University or Side projects.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <EntityIcon icon={icon} color={color} size="lg" />
          <Input
            aria-label="Title"
            placeholder="University"
            autoFocus
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Icon">
          <IconPicker value={icon} color={color} onChange={setIcon} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {area ? 'Save' : 'Create area'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

const NO_AREA = 'none';

function ProjectForm({
  project,
  areaId,
  areas,
  projects,
  onDone,
}: {
  project?: Project;
  areaId?: string | null;
  areas: Area[];
  projects: Project[];
  onDone: () => void;
}) {
  const actions = useStructureActions();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const limit = me?.settings.activeProjectLimit ?? 3;
  const activeCount = projects.filter((p) => p.status === 'active').length;
  const full = activeCount >= limit;

  const [title, setTitle] = useState(project?.title ?? '');
  const [area, setArea] = useState(project?.areaId ?? areaId ?? NO_AREA);
  const [color, setColor] = useState<ColorKey>(
    project?.color ?? areas.find((a) => a.id === (areaId ?? ''))?.color ?? 'orange',
  );
  const [icon, setIcon] = useState<IconKey>(project?.icon ?? 'rocket');
  const [status, setStatus] = useState<'active' | 'parked'>(full ? 'parked' : 'active');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [dueDate, setDueDate] = useState(project?.dueDate ?? '');
  // New projects only; an existing one's description is edited on its page.
  const [description, setDescription] = useState<RichDoc | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const fields = {
      title,
      areaId: area === NO_AREA ? null : area,
      color,
      icon,
      startDate: startDate || null,
      dueDate: dueDate || null,
    };
    if (project) {
      const ok = await actions.updateProject(project.id, fields);
      setBusy(false);
      if (ok) onDone();
      return;
    }
    const created = await actions.createProject({ ...fields, description, status });
    setBusy(false);
    if (created) {
      onDone();
      void navigate({ to: '/projects/$projectId', params: { projectId: created.id } });
    }
  }

  const openAreas = areas.filter((a) => !a.archivedAt || a.id === project?.areaId);

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <form onSubmit={submit} className="grid gap-5">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            {project
              ? 'Status changes live in the project’s menu.'
              : 'A bounded effort with goals, tasks and a board.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <EntityIcon icon={icon} color={color} size="lg" />
          <Input
            aria-label="Title"
            placeholder="Linear Algebra"
            autoFocus
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area">
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_AREA}>No area</SelectItem>
                {openAreas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!project && (
            <Field label="Status">
              <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'parked')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" disabled={full}>
                    Active
                  </SelectItem>
                  <SelectItem value="parked">Parked</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        {!project && full && (
          <p className="-mt-2 text-xs text-muted-foreground">
            You have {activeCount} active project{activeCount === 1 ? '' : 's'}, your limit. This
            one starts parked; activate it when you park another.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="project-start">
            <Input
              id="project-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Due date" htmlFor="project-due">
            <Input
              id="project-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Icon">
          <IconPicker value={icon} color={color} onChange={setIcon} />
        </Field>
        {!project && (
          <Field label="Description" htmlFor="project-description">
            <RichEditor
              id="project-description"
              value={null}
              onChange={setDescription}
              className="min-h-20"
              placeholder="What is this project for? What does done look like?"
            />
          </Field>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {project ? 'Save' : 'Create project'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
