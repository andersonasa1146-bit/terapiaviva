import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileNav from './MobileNav'
import TrialBanner from './TrialBanner'

export default function Layout() {
  return (
    <div className="shell">
      <TopBar />
      <Sidebar />
      <main className="main">
        <TrialBanner />
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
