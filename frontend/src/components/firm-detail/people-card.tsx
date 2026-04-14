import { AgGridReact } from 'ag-grid-react'
import { Users } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { defaultColDef, defaultGridOptions, gridTheme } from '@/lib/grid'
import type { Person } from '@/types/person'

import { peopleColDefs } from './column-defs'

type PeopleCardProps = {
  people: Person[]
}

export function PeopleCard({ people }: PeopleCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" />
          Key people
        </CardTitle>
        <CardDescription>
          People linked to this firm for AI-related roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No key people found"
            description="People appear after the people collection stage runs."
          />
        ) : (
          <div className="ag-theme-custom" style={{ width: '100%' }}>
            <AgGridReact<Person>
              theme={gridTheme}
              rowData={people}
              columnDefs={peopleColDefs}
              defaultColDef={defaultColDef}
              {...defaultGridOptions}
              pagination
              paginationPageSize={20}
              paginationPageSizeSelector={[10, 20, 50]}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
