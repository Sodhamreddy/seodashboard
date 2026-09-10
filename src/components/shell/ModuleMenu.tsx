'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { MODULE_COLUMNS, PLANNED_MODULES } from '@/lib/nav';

/**
 * The whole product on one panel.
 *
 * The sidebar lists every tool as an equal row, which works at seventeen and
 * stops working well before forty. This gives the shape instead: modules as
 * columns, each tool with the one-line blurb `nav.ts` already carries, and a
 * dot for how live it is. The modules that do not exist yet appear in the same
 * grid marked planned — a roadmap the team can see from inside the product
 * beats one in a document nobody opens, and it stops "is that built?" being a
 * question you have to ask someone.
 */
export function ModuleMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Same dismissal contract as the client switcher beside it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // A navigation closes the panel; without this it stays open over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Browse modules"
        className={cx(
          'hidden h-9 items-center gap-2 rounded-lg border px-3 text-2xs font-medium transition-colors md:flex',
          open
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink',
        )}
      >
        <Icon name="grid" size={14} />
        Modules
        <Icon name="chevronDown" size={12} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed inset-x-3 top-[4.35rem] z-50 max-h-[min(34rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-hairline bg-surface-raised shadow-lift lg:inset-x-auto lg:right-7 lg:w-[min(66rem,calc(100vw-4rem))]"
        >
          <div className="grid gap-px bg-hairline sm:grid-cols-2 xl:grid-cols-4">
            {MODULE_COLUMNS.map((column) => (
              <section key={column.title} className="bg-surface-raised p-3.5">
                <p className="mb-2 flex items-baseline justify-between gap-2 text-2xs font-bold uppercase tracking-[0.09em] text-ink-muted">
                  {column.title}
                  <span className="tnum font-mono text-2xs font-normal tracking-normal text-ink-muted">
                    {column.items.length}
                  </span>
                </p>

                <ul className="space-y-0.5">
                  {column.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cx(
                            'flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors',
                            active
                              ? 'bg-accent-soft text-accent'
                              : 'text-ink hover:bg-surface-sunken',
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cx(
                              'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                              item.mode === 'real'
                                ? 'bg-status-good'
                                : item.mode === 'partial'
                                  ? 'bg-accent'
                                  : 'bg-status-warning',
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium leading-tight">
                              {item.label}
                            </span>
                            <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                              {item.blurb}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {/* Planned modules — same grid, so the gap in the product is
                visible rather than implied by absence. */}
            {PLANNED_MODULES.map((module) => (
              <section key={module.title} className="bg-surface-raised p-3.5">
                <p className="mb-2 flex items-baseline justify-between gap-2 text-2xs font-bold uppercase tracking-[0.09em] text-ink-muted">
                  {module.title}
                  <span className="rounded bg-surface-sunken px-1.5 font-mono text-2xs font-normal normal-case tracking-normal text-ink-muted">
                    {module.state}
                  </span>
                </p>
                <ul className="space-y-0.5">
                  {module.items.map((item) => (
                    <li key={item.label} className="flex items-start gap-2 px-2 py-1.5">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium leading-tight text-ink-secondary">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                          {item.blurb}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline bg-surface-sunken px-3.5 py-2.5 font-mono text-2xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-good" />
              live
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
              live where connected
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-warning" />
              seeded provider
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink-muted" />
              planned
            </span>
            <Link
              href="/automations"
              className="ml-auto text-accent underline underline-offset-2"
            >
              Full registry with run status
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
