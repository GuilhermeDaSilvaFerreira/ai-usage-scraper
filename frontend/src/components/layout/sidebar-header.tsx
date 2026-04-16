import { Link } from 'react-router-dom'

import { Separator } from '@/components/ui/separator'

export function SidebarHeader() {
  return (
    <>
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
    </>
  )
}
