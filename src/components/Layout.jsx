import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  return (
    <div className="shell">
      <TopBar />
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
