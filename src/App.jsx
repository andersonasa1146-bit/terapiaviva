import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import MFAChallenge from './components/MFAChallenge'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Patients from './pages/Patients'
import PatientFile from './pages/PatientFile'
import Anamnese from './pages/Anamnese'
import PublicAnamnese from './pages/PublicAnamnese'
import Agenda from './pages/Agenda'
import AIPanel from './pages/AIPanel'
import Prayer from './pages/Prayer'
import Biblical from './pages/Biblical'
import Financial from './pages/Financial'
import Config from './pages/Config'
import Alerts from './pages/Alerts'
import TeamAccept from './pages/TeamAccept'
import AuditLog from './pages/AuditLog'
import AdminPanel from './pages/AdminPanel'

function Private({ children }) {
  const { session, loading, mfaChecked, mfaPending } = useAuth()
  if (loading || (session && !mfaChecked)) return <div style={{ padding: 40 }}>Carregando...</div>
  if (!session) return <Navigate to="/login" replace />
  if (mfaPending) return <MFAChallenge />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/a/:token" element={<PublicAnamnese />} />
      <Route path="/equipe/aceitar/:token" element={<TeamAccept />} />

      <Route path="/" element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="alertas" element={<Alerts />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientFile />} />
        <Route path="anamnese" element={<Anamnese />} />
        <Route path="anamnese/:id" element={<Anamnese />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="ia" element={<AIPanel />} />
        <Route path="prayer" element={<Prayer />} />
        <Route path="biblical" element={<Biblical />} />
        <Route path="financial" element={<Financial />} />
        <Route path="auditoria" element={<AuditLog />} />
        <Route path="admin" element={<AdminPanel />} />
        <Route path="config" element={<Config />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
