// "Start from" in the new-project dialog (D52): a blank board or a template, and the dates a
// template asks for (an exam or deadline, weekly classes).

import { PROJECT_TEMPLATES, projectTemplate } from '@strekatron/shared/structure';
import { EntityIcon } from '@/components/entity-icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NO_TEMPLATE, type TemplateChoice } from '@/lib/templates';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TemplatePicker({
  value,
  onChange,
  weekStart,
}: {
  value: TemplateChoice;
  onChange: (c: TemplateChoice) => void;
  weekStart: number;
}) {
  const t = value.key ? projectTemplate(value.key) : null;
  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  return (
    <div className="grid gap-3">
      <div
        role="radiogroup"
        aria-label="Start from"
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        <Choice selected={!value.key} onClick={() => onChange({ ...NO_TEMPLATE })}>
          <span className="text-sm font-medium">Blank</span>
        </Choice>
        {PROJECT_TEMPLATES.map((p) => (
          <Choice
            key={p.key}
            selected={value.key === p.key}
            onClick={() => onChange({ ...NO_TEMPLATE, key: p.key })}
          >
            <EntityIcon icon={p.icon} color={p.color} size="sm" />
            <span className="text-sm font-medium">{p.name}</span>
          </Choice>
        ))}
      </div>
      {t && (
        <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">
            {t.description} Starts with {t.columns.map((c) => c.title).join(' · ')};{' '}
            {t.goals.length} goals ({t.goals.map((g) => g.title).join(', ')}) and {t.tasks.length}{' '}
            first tasks.
          </p>
          {t.date && (
            <div className="grid gap-1.5">
              <Label htmlFor="template-date">
                {t.date.label} <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="template-date"
                type="date"
                value={value.date}
                onChange={(e) => onChange({ ...value, date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Adds it to the calendar with a countdown, and sets the goal’s due date.
              </p>
            </div>
          )}
          {t.weekly && (
            <div className="grid gap-1.5">
              <Label>
                {t.weekly.label}{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Class days">
                {order.map((d) => {
                  const on = value.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        onChange({
                          ...value,
                          days: on ? value.days.filter((x) => x !== d) : [...value.days, d],
                        })
                      }
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground',
                        on && 'border-primary bg-primary/10 text-foreground',
                      )}
                    >
                      {WEEKDAYS[d]}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label="Class starts"
                  value={value.startTime}
                  onChange={(e) => onChange({ ...value, startTime: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label="Class ends"
                  value={value.endTime}
                  onChange={(e) => onChange({ ...value, endTime: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                One repeating event on the calendar{t.date ? ', until the exam' : ''}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border p-2 text-left hover:bg-muted',
        selected && 'border-primary bg-primary/10 hover:bg-primary/10',
      )}
    >
      {children}
    </button>
  );
}
