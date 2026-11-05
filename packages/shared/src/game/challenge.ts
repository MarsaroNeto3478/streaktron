// The challenge question (D32) and the tutorial (D31). Streaky asks "What's your biggest challenge
// with discipline?" over the failure modes the app is built around (plan.md §1); the answer tunes
// the app a little (D36). The tutorial is a chain of quests done in the real app.

export const CHALLENGES = [
  'forgetting',
  'next_step',
  'missed_day',
  'too_many',
  'motivation',
] as const;
export type Challenge = (typeof CHALLENGES)[number];

export const CHALLENGE_TEXT: Record<Challenge, { label: string; tuning: string }> = {
  forgetting: {
    label: 'I forget to start, or keep putting it off',
    tuning: 'You’ll get one more quick quest a day: tiny first steps make starting easier.',
  },
  next_step: {
    label: 'I don’t know what to do next',
    tuning: 'Today shows fewer items, and I’ll ask more often for each project’s next action.',
  },
  missed_day: {
    label: 'I miss a day and then drop it',
    tuning:
      'Your weekly streak comes first, and the comeback quest shows up after a single missed day.',
  },
  too_many: {
    label: 'I juggle too many projects at once',
    tuning: 'Only 2 projects can be active at a time. You can change the limit in Settings.',
  },
  motivation: {
    label: 'I lose motivation after a while',
    tuning: 'Daily quests vary more: the same one won’t come back for a few days.',
  },
};

/** Where the tour is: not offered yet, asking the question, walking the steps, done, put away. */
export const TUTORIAL_STATES = ['new', 'question', 'active', 'done', 'closed'] as const;
export type TutorialState = (typeof TUTORIAL_STATES)[number];

/** The tutorial's quests, in order. Each one spawns the next when it's done or skipped. */
export const TUTORIAL_STEPS = [
  'tutorial.area',
  'tutorial.project',
  'tutorial.task',
  'tutorial.complete',
  'tutorial.focus',
] as const;
export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

export const TUTORIAL_TITLES: Record<TutorialStep, string> = {
  'tutorial.area': 'Create an area',
  'tutorial.project': 'Start a project',
  'tutorial.task': 'Add a task to a project',
  'tutorial.complete': 'Complete a task',
  'tutorial.focus': 'Focus for 10 minutes',
};

export const nextTutorialStep = (step: string): TutorialStep | null => {
  const i = TUTORIAL_STEPS.indexOf(step as TutorialStep);
  return i < 0 ? null : (TUTORIAL_STEPS[i + 1] ?? null);
};

export const isTutorialStep = (key: string): key is TutorialStep =>
  (TUTORIAL_STEPS as readonly string[]).includes(key);
