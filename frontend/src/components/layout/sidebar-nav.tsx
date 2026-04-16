import { NavLink } from 'react-router-dom'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  )

export function SidebarNav() {
  return (
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
  )
}
