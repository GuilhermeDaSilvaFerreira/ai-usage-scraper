import { useState } from 'react'

import { Button } from '@/components/ui/button'

type Props = {
  page: number
  totalPages: number
  total: number
  label?: string
  onPageChange: (page: number) => void
}

export function PageNav({ page, totalPages, total, label, onPageChange }: Props) {
  const [jumpValue, setJumpValue] = useState('')

  const canPrev = page > 1
  const canNext = totalPages > 0 && page < totalPages

  function handleJump() {
    const n = Number(jumpValue)
    if (!Number.isFinite(n) || n < 1 || n > totalPages) return
    onPageChange(n)
    setJumpValue('')
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {total} {label ?? 'total'} · page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={totalPages}
            placeholder="Page"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            className="h-7 w-18 rounded-md border border-border bg-background px-2 text-sm tabular-nums outline-none focus:border-ring"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleJump}>
            Go
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canPrev}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
