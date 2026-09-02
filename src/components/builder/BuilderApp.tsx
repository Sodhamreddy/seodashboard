'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BuilderTopbar } from './BuilderTopbar';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { LibraryRail } from './LibraryRail';
import { PagesRail } from './PagesRail';
import { BuilderProvider, useBuilder } from './store';

/**
 * The editor is client-only on purpose.
 *
 * Its initial document comes from localStorage and carries generated ids and a
 * timestamp, none of which the server can know. Rendering it on the server would
 * guarantee a hydration mismatch, so the whole tree waits one tick for mount and
 * shows a frame in the meantime.
 */

function Skeleton() {
  return (
    <div className="flex h-screen flex-col bg-plane">
      <div className="h-[104px] shrink-0 border-b border-hairline bg-[color:var(--topbar-bg)]" />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[268px] shrink-0 border-r border-hairline lg:block" />
        <div className="flex flex-1 items-center justify-center">
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Icon name="layers" size={15} />
            Loading report builder…
          </p>
        </div>
        <div className="hidden w-[78px] shrink-0 border-l border-hairline lg:block" />
      </div>
    </div>
  );
}

function Shell() {
  const { state, dispatch } = useBuilder();

  // Editor shortcuts. Typing in a field must never trigger them, except Escape,
  // which is how you get out of an inline rename.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (event.key === 'Escape') {
        if (typing) (target as HTMLInputElement).blur();
        else dispatch({ type: 'select', selection: null });
        return;
      }

      if (typing) return;

      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection) {
        event.preventDefault();
        dispatch({
          type: 'removeWidget',
          sectionId: state.selection.sectionId,
          widgetId: state.selection.widgetId,
        });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, state.selection]);

  return (
    <div className="builder-root flex h-screen flex-col overflow-hidden bg-plane">
      <BuilderTopbar />

      <div className="flex min-h-0 flex-1">
        {!state.preview && (
          <aside className="hidden h-full w-[268px] shrink-0 border-r border-hairline bg-surface lg:block">
            {state.selection ? <Inspector /> : <PagesRail />}
          </aside>
        )}

        <Canvas />

        {!state.preview && (
          <div className="hidden h-full lg:block">
            <LibraryRail />
          </div>
        )}
      </div>
    </div>
  );
}

export function BuilderApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <Skeleton />;

  return (
    <BuilderProvider>
      <Shell />
    </BuilderProvider>
  );
}
