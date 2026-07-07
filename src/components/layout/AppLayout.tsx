import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import OnboardingModal from '../OnboardingModal'

export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-sage-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
      <OnboardingModal />
    </div>
  )
}
