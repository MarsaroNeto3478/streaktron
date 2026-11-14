import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { TaskListControls, TaskListView } from '@/components/task-list-view';
import { tasksQuery } from '@/lib/queries';
import {
  DEFAULT_LIST,
  DUE_FILTERS,
  GROUPS,
  SORTS,
  STATUS_FILTERS,
  type ListOptions,
} from '@/lib/task-list';

const search = z.object({
  project: z.string().optional(),
  status: z.enum(STATUS_FILTERS).optional(),
  due: z.enum(DUE_FILTERS).optional(),
  sort: z.enum(SORTS).optional(),
  group: z.enum(GROUPS).optional(),
});

export const Route = createFileRoute('/_app/tasks')({
  validateSearch: search,
  component: TasksPage,
});

function TasksPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const options: ListOptions = { ...DEFAULT_LIST, ...s };
  // Open tasks are what lists are mostly for; done ones load only when asked for.
  const status = options.status === 'done' ? 'done' : options.status === 'all' ? 'any' : 'open';
  const { data: tasks = [], isPending } = useQuery(tasksQuery({ status }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="All tasks" description="Every task, filtered and grouped your way." />
      <TaskListControls
        options={options}
        showProject
        onChange={(o) => void navigate({ search: (prev) => ({ ...prev, ...o }), replace: true })}
      />
      {isPending ? (
        <div
          className="h-48 animate-pulse rounded-xl bg-muted/50"
          role="status"
          aria-label="Loading"
        />
      ) : (
        <TaskListView tasks={tasks} options={options} showProject />
      )}
    </div>
  );
}
