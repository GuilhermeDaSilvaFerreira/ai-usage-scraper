import { Link, NavLink, Outlet } from 'react-router-dom'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  )

export function AppLayout() {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <aside className="sticky top-0 flex h-svh w-52 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col gap-1 px-3 py-4">
          <Link
            to="/"
            className="px-2 text-sm font-semibold tracking-tight whitespace-nowrap"
          >
            PE AI Intelligence
          </Link>
          <p className="px-2 text-xs text-muted-foreground">Internal analyst console</p>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col p-3">
          <div className="flex flex-col gap-0.5">
            <NavLink to="/" className={navLinkClass} end>
              Firms
            </NavLink>
            <NavLink to="/campaigns" className={navLinkClass}>
              Outreach Campaigns
            </NavLink>
          </div>
          <div className="mt-auto">
            <Separator className="mb-2" />
            <NavLink to="/jobs" className={navLinkClass}>
              Job Management
            </NavLink>
          </div>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
