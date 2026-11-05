// A project's Kanban board. Cards drag within and between columns (mouse, touch with a short
// press, or keyboard: focus a card, Space to pick up, arrows, Space to drop). The move is applied
// to the cache at once and sent to the server (taskActions.move); columns are managed from their
// menus.

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCode,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { COLUMN_CATEGORIES, type ColumnCategory } from '@strekatron/shared/structure';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useOpenTask } from '@/hooks/use-open-task';
import { useStructureActions, useTaskActions } from '@/lib/actions';
import { CATEGORY_DOT, CATEGORY_LABEL } from '@/lib/look';
import type { BoardColumn, Goal, Project, Task } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { QuickAdd } from './quick-add';
import { TaskCheck } from './task-check';
import { TaskMeta } from './task-meta';

type Lanes = Record<string, string[]>;

const byOrder = (a: Task, b: Task) =>
  a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);

function lanesOf(columns: BoardColumn[], tasks: Task[]): Lanes {
  const lanes: Lanes = Object.fromEntries(columns.map((c) => [c.id, [] as string[]]));
  for (const t of [...tasks].sort(byOrder)) {
    if (t.columnId && lanes[t.columnId]) lanes[t.columnId]!.push(t.id);
  }
  return lanes;
}

const laneOf = (lanes: Lanes, id: string) =>
  id in lanes ? id : Object.keys(lanes).find((col) => lanes[col]!.includes(id));

// Space picks up and drops; Enter is left for opening a card.
const keyboardCodes = {
  start: ['Space'] as KeyboardCode[],
  cancel: ['Escape'] as KeyboardCode[],
  end: ['Space'] as KeyboardCode[],
};

export function Board({
  project,
  columns,
  tasks,
  goals,
  today,
}: {
  project: Project;
  columns: BoardColumn[];
  tasks: Task[];
  goals: Goal[];
  today: string;
}) {
  const taskActions = useTaskActions();
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const serverLanes = useMemo(() => lanesOf(columns, tasks), [columns, tasks]);
  // While dragging, the lanes as the user is arranging them.
  const [dragLanes, setDragLanes] = useState<Lanes | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lanes = dragLanes ?? serverLanes;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setDragLanes(serverLanes);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setDragLanes((current) => {
      const l = current ?? serverLanes;
      const from = laneOf(l, String(active.id));
      const to = laneOf(l, String(over.id));
      if (!from || !to || from === to) return current;
      const target = l[to]!;
      const overIndex = target.indexOf(String(over.id));
      const index = overIndex === -1 ? target.length : overIndex;
      return {
        ...l,
        [from]: l[from]!.filter((id) => id !== active.id),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const l = dragLanes ?? serverLanes;
    setActiveId(null);
    setDragLanes(null);
    const id = String(active.id);
    const task = byId.get(id);
    if (!over || !task) return;
    const to = laneOf(l, String(over.id));
    if (!to) return;
    // The lane as shown (with the card, once dragOver moved it in). Over a card, the dragged one
    // takes that card's place, as the sortable preview showed; over the column's empty space, it
    // stays where it is in the lane (or goes last).
    const full = l[to]!;
    const lane = full.filter((x) => x !== id);
    const overIndex = full.indexOf(String(over.id));
    const own = full.indexOf(id);
    const index = overIndex !== -1 ? overIndex : own !== -1 ? own : lane.length;
    if (to === task.columnId && serverLanes[to]?.indexOf(id) === index) return;
    const column = columns.find((c) => c.id === to)!;
    void taskActions.move(task, column, index, lane.map((x) => byId.get(x)!).filter(Boolean));
  }

  const active = activeId ? byId.get(activeId) : undefined;
  const byGoal = new Map(goals.map((g) => [g.id, g]));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setDragLanes(null);
      }}
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:snap-none md:px-8">
        {columns.map((column, i) => (
          <Lane
            key={column.id}
            column={column}
            index={i}
            columns={columns}
            ids={lanes[column.id] ?? []}
            byId={byId}
            byGoal={byGoal}
            project={project}
            today={today}
          />
        ))}
        <AddColumn projectId={project.id} />
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <Card
            task={active}
            project={project}
            today={today}
            goal={byGoal.get(active.goalId ?? '')}
            overlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Lane({
  column,
  index,
  columns,
  ids,
  byId,
  byGoal,
  project,
  today,
}: {
  column: BoardColumn;
  index: number;
  columns: BoardColumn[];
  ids: string[];
  byId: Map<string, Task>;
  byGoal: Map<string, Goal>;
  project: Project;
  today: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      aria-label={column.title}
      className="flex max-h-[calc(100dvh-14rem)] w-[85vw] shrink-0 snap-start flex-col rounded-xl bg-muted/50 sm:w-72"
    >
      <ColumnHeader column={column} index={index} columns={columns} count={ids.length} />
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2',
            isOver && 'rounded-lg bg-accent/40',
          )}
        >
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? (
              <SortableCard
                key={id}
                task={t}
                project={project}
                today={today}
                goal={t.goalId ? byGoal.get(t.goalId) : undefined}
              />
            ) : null;
          })}
          {column.category !== 'done' && (
            <QuickAdd
              input={{ projectId: project.id, columnId: column.id }}
              placeholder="Add a card"
            />
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard(props: { task: Task; project: Project; today: string; goal?: Goal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
  });
  const open = useOpenTask();
  const tasks = useTaskActions();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      open(props.task.id);
      return;
    }
    if (e.key === 'x' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void tasks.toggle(props.task);
      return;
    }
    listeners?.onKeyDown?.(e);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => open(props.task.id)}
      aria-roledescription="Draggable card"
      aria-label={props.task.title}
    >
      <Card {...props} />
    </div>
  );
}

function Card({
  task,
  project,
  today,
  goal,
  overlay,
}: {
  task: Task;
  project: Project;
  today: string;
  goal?: Goal;
  overlay?: boolean;
}) {
  const tasks = useTaskActions();
  const done = task.completedAt !== null;
  const isNext = project.nextAction?.id === task.id;
  return (
    <div
      className={cn(
        'group cursor-grab touch-manipulation rounded-lg border bg-card p-3 shadow-xs transition-shadow select-none hover:shadow-sm active:cursor-grabbing',
        overlay && 'rotate-1 shadow-lg',
        isNext && !done && 'border-primary/50',
      )}
    >
      <div className="flex items-start gap-2.5">
        <TaskCheck task={task} onToggle={() => void tasks.toggle(task)} className="mt-px" />
        <div
          className={cn(
            'min-w-0 flex-1 text-sm leading-5 break-words',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </div>
        {isNext && !done && (
          <span title={project.nextAction?.pinned ? 'Next action (pinned)' : 'Next action'}>
            <Pin className="size-3.5 text-primary" aria-label="Next action" />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7.5 empty:hidden">
        <TaskMeta task={task} today={today} goal={goal} />
      </div>
    </div>
  );
}

function ColumnHeader({
  column,
  index,
  columns,
  count,
}: {
  column: BoardColumn;
  index: number;
  columns: BoardColumn[];
  count: number;
}) {
  const actions = useStructureActions();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(column.title);

  const move = (delta: number) => {
    const ids = columns.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    void actions.reorderColumns(column.projectId, ids);
  };

  async function rename() {
    setRenaming(false);
    const t = title.trim();
    if (t && t !== column.title) await actions.updateColumn(column, { title: t });
    else setTitle(column.title);
  }

  return (
    <header className="flex items-center gap-2 px-3 pt-3 pb-2">
      <span className={cn('size-2 shrink-0 rounded-full', CATEGORY_DOT[column.category])} />
      {renaming ? (
        <Input
          autoFocus
          value={title}
          maxLength={60}
          className="h-7 text-sm"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void rename();
            if (e.key === 'Escape') {
              setTitle(column.title);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{column.title}</h3>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`${column.title} column menu`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => move(-1)}>
            <ArrowLeft />
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === columns.length - 1} onSelect={() => move(1)}>
            <ArrowRight />
            Move right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Counts as
          </DropdownMenuLabel>
          {COLUMN_CATEGORIES.map((c) => (
            <DropdownMenuItem
              key={c}
              onSelect={() =>
                c !== column.category && void actions.updateColumn(column, { category: c })
              }
            >
              <span className={cn('size-2 rounded-full', CATEGORY_DOT[c])} />
              {CATEGORY_LABEL[c]}
              {c === column.category && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => void actions.deleteColumn(column)}
          >
            <Trash2 />
            Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function AddColumn({ projectId }: { projectId: string }) {
  const actions = useStructureActions();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ColumnCategory>('in_progress');

  if (!adding) {
    return (
      <Button
        variant="ghost"
        className="h-11 w-60 shrink-0 justify-start text-muted-foreground"
        onClick={() => setAdding(true)}
      >
        <Plus />
        Add column
      </Button>
    );
  }

  async function add() {
    const t = title.trim();
    if (!t) return;
    await actions.createColumn(projectId, t, category);
    setTitle('');
    setAdding(false);
  }

  return (
    <div className="grid w-64 shrink-0 content-start gap-2 rounded-xl bg-muted/50 p-3">
      <Input
        autoFocus
        placeholder="Column title"
        value={title}
        maxLength={60}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void add();
          if (e.key === 'Escape') setAdding(false);
        }}
      />
      <div className="flex flex-wrap gap-1">
        {COLUMN_CATEGORIES.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={category === c ? 'secondary' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => setCategory(c)}
          >
            <span className={cn('size-2 rounded-full', CATEGORY_DOT[c])} />
            {CATEGORY_LABEL[c]}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void add()} disabled={!title.trim()}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
