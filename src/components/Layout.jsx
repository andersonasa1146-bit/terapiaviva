import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileNav from './MobileNav'

export default function Layout() {
  return (
    <div className="shell">
      <TopBar />
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
