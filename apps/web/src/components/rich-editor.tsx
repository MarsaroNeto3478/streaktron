// The one rich-text editor (TipTap), for every description. Typing `@` or `[[` opens a picker of
// tasks, goals, projects and areas; picking one inserts a mention, shown as a chip with the
// target's current title (mention-chip.tsx). The server extracts mentions into links on save.
//
//   <RichEditor value={task.description} onChange={setDoc} selfId={task.id} />
//
// `value` is read once, at mount: the editor owns the document after that, and `onChange` reports
// every edit (null when empty). Remount it (a `key`) to load another document.

import type { RichDoc } from '@strekatron/shared/rich';
import { Mention, type MentionNodeAttrs } from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extensions';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  ReactRenderer,
  useEditor,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { KIND_LABEL } from '@/lib/entities';
import { picker } from '@/lib/picker';
import { searchQuery, type SearchHit } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { RefIcon } from './entity-icon';
import { MentionChip } from './mention-chip';

export function RichEditor({
  value,
  onChange,
  selfId,
  placeholder = 'Write something… Type @ to link a task, goal, project or area.',
  className,
  autoFocus,
  'aria-label': ariaLabel,
  id,
}: {
  value: RichDoc | null | undefined;
  onChange: (doc: RichDoc | null) => void;
  /** The entity this text belongs to, left out of the picker. */
  selfId?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
  id?: string;
}) {
  const qc = useQueryClient();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: true, autolink: true, defaultProtocol: 'https' },
      }),
      Placeholder.configure({ placeholder }),
      Mention.extend({
        addNodeView() {
          return ReactNodeViewRenderer(MentionView, { as: 'span' });
        },
      }).configure({
        renderText: ({ node }) => `@${node.attrs.label ?? ''}`,
        suggestions: [mentionSuggestion('@', qc, selfId), mentionSuggestion('[[', qc, selfId)],
      }),
    ],
    content: value ?? '',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'rich-text min-h-[inherit] outline-none',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
        ...(id ? { id } : {}),
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
    onUpdate: ({ editor }) =>
      onChangeRef.current(editor.isEmpty ? null : (editor.getJSON() as RichDoc)),
  });

  return (
    <EditorContent
      editor={editor}
      className={cn(
        'min-h-24 w-full cursor-text rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 md:text-sm dark:bg-input/30',
        className,
      )}
      onClick={(e) => {
        // A click in the padding focuses the text too.
        if (e.target === e.currentTarget) editor?.commands.focus('end');
      }}
    />
  );
}

function MentionView({ node }: ReactNodeViewProps) {
  const { id, label } = node.attrs as MentionNodeAttrs;
  return (
    <NodeViewWrapper as="span" className="inline">
      <MentionChip id={id ?? ''} label={label} />
    </NodeViewWrapper>
  );
}

// --- The picker ------------------------------------------------------------------------------

const PICKER_SIZE = 8;

/** Keeps the list inside the window (a phone's right edge, mostly). Ported from Quire. */
const onScreen: SuggestionOptions['floatingUi'] = {
  middleware: [
    {
      name: 'onScreen',
      fn: ({ x, rects }) => {
        const vw = document.documentElement.clientWidth;
        return { x: Math.max(scrollX + 8, Math.min(x, scrollX + vw - rects.floating.width - 8)) };
      },
    },
  ],
};

function mentionSuggestion(
  char: string,
  qc: QueryClient,
  selfId: string | undefined,
): Omit<SuggestionOptions<SearchHit, MentionNodeAttrs>, 'editor'> {
  return {
    char,
    // Titles have spaces ("Pass the exam"); the list hides itself once nothing matches.
    allowSpaces: true,
    debounce: 120,
    floatingUi: onScreen,
    items: async ({ query }) => {
      const hits = await qc.fetchQuery(searchQuery(query.trim(), PICKER_SIZE + 1));
      return hits.filter((h) => h.id !== selfId).slice(0, PICKER_SIZE);
    },
    render: () => {
      let component: ReactRenderer<PickerHandle, PickerProps> | null = null;
      let unmount: (() => void) | null = null;
      return {
        onStart: (props) => {
          picker.open = true;
          component = new ReactRenderer(MentionPicker, { props, editor: props.editor });
          const el = component.element as HTMLElement;
          el.className = 'z-[60]';
          // Inside a modal sheet or dialog, the list must live in it: outside, the modal would
          // block its clicks and count them as clicks away.
          const host = props.editor.view.dom.closest('[role="dialog"]') ?? document.body;
          host.appendChild(el);
          unmount = props.mount(el);
        },
        onUpdate: (props) => component?.updateProps(props),
        onKeyDown: ({ event }) => component?.ref?.onKeyDown(event) ?? false,
        onExit: () => {
          picker.open = false;
          unmount?.();
          component?.element.remove();
          component?.destroy();
          component = null;
        },
      };
    },
  };
}

type PickerProps = SuggestionProps<SearchHit, MentionNodeAttrs> & { ref?: Ref<PickerHandle> };
interface PickerHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

function MentionPicker({ items, query, command, loading, ref }: PickerProps) {
  const [active, setActive] = useState(0);
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setActive(0);
  }
  const pick = (hit: SearchHit | undefined) => hit && command({ id: hit.id, label: hit.title });

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') setActive((i) => (i + 1) % items.length);
      else if (event.key === 'ArrowUp') setActive((i) => (i - 1 + items.length) % items.length);
      else if (event.key === 'Enter' || event.key === 'Tab') pick(items[active]);
      else return false;
      return true;
    },
  }));

  // Once a query with spaces matches nothing, the person has moved on: stay out of the way.
  if (!items.length && (loading || query.includes(' '))) return null;

  return (
    <div
      className="w-80 max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      role="listbox"
      aria-label="Link to"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground">Nothing called “{query}”</p>
      ) : (
        <>
          {!query.trim() && (
            <p className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">Recent</p>
          )}
          {items.map((hit, i) => (
            <button
              key={hit.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                i === active && 'bg-accent text-accent-foreground',
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // keep the editor's focus and selection
                pick(hit);
              }}
            >
              <RefIcon entity={hit} />
              <span
                className={cn('min-w-0 flex-1 truncate', hit.closed && 'text-muted-foreground')}
              >
                {hit.title}
              </span>
              <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
                {hit.context ?? KIND_LABEL[hit.kind]}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
