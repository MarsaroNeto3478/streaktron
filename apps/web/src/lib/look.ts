// How color and icon keys (shared/structure) look. Class names are spelled out so Tailwind sees
// them.

import type { ColorKey, IconKey } from '@strekatron/shared/structure';
import {
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Camera,
  Code,
  Coffee,
  Dumbbell,
  FlaskConical,
  Folder,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  House,
  Languages,
  Laptop,
  Leaf,
  Lightbulb,
  Music,
  Palette,
  PenLine,
  Plane,
  Rocket,
  Star,
  Target,
  Trophy,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const ICON: Record<IconKey, LucideIcon> = {
  folder: Folder,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  flask: FlaskConical,
  calculator: Calculator,
  brain: Brain,
  languages: Languages,
  code: Code,
  laptop: Laptop,
  rocket: Rocket,
  wrench: Wrench,
  briefcase: Briefcase,
  lightbulb: Lightbulb,
  pen: PenLine,
  palette: Palette,
  music: Music,
  camera: Camera,
  gamepad: Gamepad2,
  dumbbell: Dumbbell,
  heart: Heart,
  leaf: Leaf,
  home: House,
  coffee: Coffee,
  plane: Plane,
  globe: Globe,
  target: Target,
  star: Star,
  trophy: Trophy,
};

/** A soft tile (icon backgrounds), a solid dot, and readable text, per color. */
export const COLOR: Record<ColorKey, { tile: string; dot: string; text: string }> = {
  stone: {
    tile: 'bg-stone-200 text-stone-700 dark:bg-stone-700/60 dark:text-stone-200',
    dot: 'bg-stone-400',
    text: 'text-stone-600 dark:text-stone-300',
  },
  red: {
    tile: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
  orange: {
    tile: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    dot: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
  },
  amber: {
    tile: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  lime: {
    tile: 'bg-lime-100 text-lime-800 dark:bg-lime-500/20 dark:text-lime-300',
    dot: 'bg-lime-500',
    text: 'text-lime-700 dark:text-lime-400',
  },
  green: {
    tile: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    dot: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
  },
  teal: {
    tile: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
    dot: 'bg-teal-500',
    text: 'text-teal-700 dark:text-teal-400',
  },
  sky: {
    tile: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    dot: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-400',
  },
  blue: {
    tile: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    dot: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
  },
  indigo: {
    tile: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
    dot: 'bg-indigo-500',
    text: 'text-indigo-600 dark:text-indigo-400',
  },
  violet: {
    tile: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
  },
  pink: {
    tile: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    dot: 'bg-pink-500',
    text: 'text-pink-600 dark:text-pink-400',
  },
};

export const STATUS_LABEL = {
  active: 'Active',
  parked: 'Parked',
  completed: 'Completed',
  archived: 'Archived',
} as const;

export const CATEGORY_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' } as const;

export const CATEGORY_DOT = {
  todo: 'bg-stone-400',
  in_progress: 'bg-amber-500',
  done: 'bg-green-500',
} as const;
