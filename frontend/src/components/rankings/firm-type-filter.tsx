import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FIRM_TYPES, type FirmType } from '@/types/common'

type FirmTypeFilterProps = {
  value: 'all' | FirmType
  onChange: (value: 'all' | FirmType) => void
}

export function FirmTypeFilter({ value, onChange }: FirmTypeFilterProps) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-64">
      <span className="text-xs font-medium text-muted-foreground">Firm type</span>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as 'all' | FirmType)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Filter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {FIRM_TYPES.map((ft) => (
            <SelectItem key={ft.value} value={ft.value}>
              {ft.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
