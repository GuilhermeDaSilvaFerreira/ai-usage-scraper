import { Outlet } from 'react-router-dom'

import { SidebarHeader } from './sidebar-header'
import { SidebarNav } from './sidebar-nav'

export function AppLayout() {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <aside className="sticky top-0 flex h-svh w-52 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <SidebarHeader />
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
