import { cookies } from 'next/headers';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { Icon } from '@/components/ui/Icon';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { getActiveDomain } from '@/lib/domain';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  const domain = getActiveDomain();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[266px] shrink-0 border-r border-hairline bg-surface lg:block">
        <Sidebar username={session?.u ?? 'user'} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar domain={domain} username={session?.u ?? 'user'} />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-7 lg:py-8">
          <div className="mx-auto min-w-0 max-w-[1440px]">{children}</div>
        </main>

        {/* Status strip — the shell's footer line, mirroring the reference. */}
        <footer className="mt-2 border-t border-hairline px-4 lg:px-7">
          <div className="status-strip mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 rounded-t-card px-4 py-3 text-2xs text-ink-secondary">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-status-good"
                style={{ boxShadow: '0 0 0 3px var(--tint-good)' }}
              />
              <span className="font-medium text-ink">All systems operational</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="clock" size={12} />
              On-page tools run live · provider panels seeded
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Icon name="shield" size={12} className="text-accent" />
              Signed session · {domain}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
