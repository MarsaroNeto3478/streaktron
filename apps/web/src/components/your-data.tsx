// Settings → Your data (D51): download everything as one JSON file, or put a file back. Importing
// replaces the account's data, so it asks first and says what the file holds.

import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDataActions, type ExportFile } from '@/lib/actions';
import { formatDayLong } from '@/lib/days';

const SHOWN: [key: string, one: string, many: string][] = [
  ['areas', 'area', 'areas'],
  ['projects', 'project', 'projects'],
  ['tasks', 'task', 'tasks'],
  ['habits', 'habit', 'habits'],
  ['calendarEvents', 'event', 'events'],
  ['activity', 'thing done', 'things done'],
];

function summary(f: ExportFile) {
  return SHOWN.map(([k, one, many]) => {
    const n = f.data[k]?.length ?? 0;
    return `${n} ${n === 1 ? one : many}`;
  }).join(', ');
}

export function YourData() {
  const actions = useDataActions();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ExportFile | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | undefined) {
    if (input.current) input.current.value = '';
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text()) as ExportFile;
      if (parsed?.format !== 'strekatron-export' || !parsed.data) throw new Error();
      setFile(parsed);
    } catch {
      toast.error('That isn’t a Strekatron export.', {
        description: 'Pick a file made with “Export my data”.',
      });
    }
  }

  async function replace() {
    if (!file) return;
    setBusy(true);
    const res = await actions.importData(file);
    setBusy(false);
    setFile(null);
    if (res) {
      toast.success('Your data was imported', {
        description: 'What you had before was saved on the server, just in case.',
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          Everything you’ve made here, as one JSON file: areas, projects, tasks, habits, events, the
          activity behind your XP and streaks, quests, boxes and medals. Importing a file replaces
          what you have now.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await actions.exportData();
            setBusy(false);
          }}
        >
          <Download /> Export my data
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          <Upload /> Import a file…
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </CardContent>

      <AlertDialog open={file !== null} onOpenChange={(o) => !o && !busy && setFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your data with this file?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {file && (
                  <p>
                    Exported on {formatDayLong(file.exportedAt.slice(0, 10))}
                    {file.user ? ` from ${file.user.email}` : ''}: {summary(file)}.
                  </p>
                )}
                <p>
                  Everything you have now is replaced by the file’s contents. A copy of your current
                  data is saved on the server first.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void replace();
              }}
            >
              {busy ? 'Importing…' : 'Replace my data'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
