import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgGridReact } from 'ag-grid-react'
import { Users } from 'lucide-react'

import { getOutreachCampaignByPerson } from '@/api/outreach'
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
import type { CellClickedEvent } from 'ag-grid-community'

import { peopleColDefs } from './column-defs'

type PeopleCardProps = {
  people: Person[]
}

export function PeopleCard({ people }: PeopleCardProps) {
  const navigate = useNavigate()

  const handleCellClicked = useCallback(
    async (e: CellClickedEvent<Person>) => {
      if (e.colDef.field !== 'full_name' || !e.data) return
      try {
        const campaign = await getOutreachCampaignByPerson(e.data.id)
        navigate(`/campaigns/${campaign.id}`)
      } catch {
        // no campaign found — ignore
      }
    },
    [navigate],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" />
          Key people
        </CardTitle>
        <CardDescription>
          People linked to this firm for AI-related roles. Click a name to view their
          outreach campaign.
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
              onCellClicked={handleCellClicked}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
