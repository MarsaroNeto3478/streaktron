// The list view: tasks filtered, sorted and grouped (task-list.ts), with its controls.

import { useQuery } from '@tanstack/react-query';
import { ListFilter } from 'lucide-react';
import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { meQuery, projectsQuery, type Goal, type Task } from '@/lib/queries';
import {
  filterTasks,
  groupTasks,
  sortTasks,
  type DueFilter,
  type GroupKey,
  type ListOptions,
  type SortKey,
  type StatusFilter,
} from '@/lib/task-list';
import { onRowsKeyDown } from '@/lib/rows';
import { EmptyState } from './page-states';
import { TaskRow } from './task-row';

const STATUS_TEXT: Record<StatusFilter, string> = {
  open: 'Open',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  all: 'All statuses',
};
const DUE_TEXT: Record<DueFilter, string> = {
  any: 'Any date',
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  none: 'No date',
};
const SORT_TEXT: Record<SortKey, string> = {
  board: 'Board order',
  due: 'Due date',
  created: 'Newest',
  title: 'Title',
  effort: 'Effort',
};
const GROUP_TEXT: Record<GroupKey, string> = {
  none: 'No grouping',
  project: 'By project',
  status: 'By status',
  due: 'By date',
};

function Picker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" aria-label={label} className="h-8 bg-card text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(options) as T[]).map((k) => (
          <SelectItem key={k} value={k}>
            {options[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskListControls({
  options,
  onChange,
  showProject,
  hideGroups = [],
}: {
  options: ListOptions;
  onChange: (o: Partial<ListOptions>) => void;
  showProject: boolean;
  hideGroups?: GroupKey[];
}) {
  const { data: projects = [] } = useQuery(projectsQuery);
  const groups = Object.fromEntries(
    Object.entries(GROUP_TEXT).filter(([k]) => !hideGroups.includes(k as GroupKey)),
  ) as Record<GroupKey, string>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ListFilter className="size-4 text-muted-foreground" aria-hidden />
      {showProject && (
        <Select
          value={options.project ?? 'all'}
          onValueChange={(v) => onChange({ project: v === 'all' ? undefined : v })}
        >
          <SelectTrigger size="sm" aria-label="Project" className="h-8 max-w-48 bg-card text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectItem value="inbox">Inbox</SelectItem>
            {projects
              .filter((p) => p.status !== 'archived' || p.id === options.project)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
      <Picker
        label="Status"
        value={options.status}
        options={STATUS_TEXT}
        onChange={(status) => onChange({ status })}
      />
      <Picker
        label="Date"
        value={options.due}
        options={DUE_TEXT}
        onChange={(due) => onChange({ due })}
      />
      <Picker
        label="Sort"
        value={options.sort}
        options={SORT_TEXT}
        onChange={(sort) => onChange({ sort })}
      />
      <Picker
        label="Group"
        value={options.group}
        options={groups}
        onChange={(group) => onChange({ group })}
      />
    </div>
  );
}

export function TaskListView({
  tasks,
  options,
  goals,
  showProject,
  empty,
}: {
  tasks: Task[];
  options: ListOptions;
  goals?: Goal[];
  showProject: boolean;
  empty?: string;
}) {
  const { data: me } = useQuery(meQuery);
  const { data: projects = [] } = useQuery(projectsQuery);
  const today = me?.today ?? '';
  const weekStart = me?.settings.weekStart ?? 1;

  const groups = useMemo(() => {
    const shown = sortTasks(filterTasks(tasks, options, today, weekStart), options.sort);
    return groupTasks(shown, options.group, { today, projects });
  }, [tasks, options, today, weekStart, projects]);

  const byProject = new Map(projects.map((p) => [p.id, p]));
  const byGoal = new Map((goals ?? []).map((g) => [g.id, g]));
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  if (!total) {
    return <EmptyState className="py-10">{empty ?? 'Nothing here with these filters.'}</EmptyState>;
  }

  return (
    <div className="space-y-5" onKeyDown={onRowsKeyDown}>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || 'Tasks'}>
          {g.label && (
            <h3 className="mb-1 flex items-baseline gap-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {g.label}
              <span className="font-normal">{g.tasks.length}</span>
            </h3>
          )}
          <div className="grid">
            {g.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                project={showProject && t.projectId ? byProject.get(t.projectId) : undefined}
                goal={t.goalId ? byGoal.get(t.goalId) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
