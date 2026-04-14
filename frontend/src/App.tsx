import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/app-layout'
import { FirmDetailPage } from '@/pages/firm-detail'
import { PipelinePage } from '@/pages/pipeline'
import { RankingsPage } from '@/pages/rankings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<RankingsPage />} />
          <Route path="firms/:id" element={<FirmDetailPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
