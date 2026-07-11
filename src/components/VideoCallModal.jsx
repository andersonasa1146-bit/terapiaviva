// Fase 2: teleconsulta integrada (Daily.co). Embed minimo via iframe do
// Daily Prebuilt — nao exige SDK no frontend, a propria pagina do Daily ja
// traz video, audio, chat e controles prontos.
export default function VideoCallModal({ roomUrl, onClose }) {
  if (!roomUrl) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 10 }}>
        <button className="btn btn-sm" onClick={onClose} style={{ background: '#fff' }}>✕ Fechar</button>
      </div>
      <iframe
        src={roomUrl}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Teleconsulta"
      />
    </div>
  )
}
