import {
  BarChart3,
  CalendarDays,
  FolderKanban,
  Gem,
  Medal,
  Inbox,
  ClipboardCheck,
  ListTodo,
  Repeat,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to:
    | '/today'
    | '/inbox'
    | '/projects'
    | '/tasks'
    | '/habits'
    | '/calendar'
    | '/review'
    | '/stats'
    | '/collection'
    | '/medals';
  label: string;
  icon: LucideIcon;
  /** In the phone's bottom bar (five fit). */
  phone: boolean;
}

export const NAV: NavItem[] = [
  { to: '/today', label: 'Today', icon: Sun, phone: true },
  { to: '/inbox', label: 'Inbox', icon: Inbox, phone: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, phone: true },
  { to: '/tasks', label: 'Tasks', icon: ListTodo, phone: true },
  { to: '/habits', label: 'Habits', icon: Repeat, phone: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, phone: true },
  { to: '/review', label: 'Weekly review', icon: ClipboardCheck, phone: false },
  { to: '/stats', label: 'Stats', icon: BarChart3, phone: false },
  { to: '/collection', label: 'Collection', icon: Gem, phone: false },
  { to: '/medals', label: 'Medals', icon: Medal, phone: false },
];
