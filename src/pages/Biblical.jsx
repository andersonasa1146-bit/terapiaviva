import { useState, useMemo } from 'react'
import { BIBLICAL_THEMES } from '../data/biblicalThemes'

const VERSES = [
  { r: 'Filipenses 4:7', t: 'A paz de Deus, que excede todo entendimento, guardara os vossos coracoes e as vossas mentes.' },
  { r: 'Jeremias 29:11', t: 'Porque sou eu que conheco os planos que tenho para voces, diz o Senhor.' },
  { r: 'Salmo 46:1', t: 'Deus e o nosso refugio e fortaleza, socorro bem presente na angustia.' },
  { r: '2 Corintios 1:3-4', t: 'Deus de toda consolacao, o qual nos consola em todas as nossas tribulacoes.' },
  { r: 'Romanos 8:28', t: 'Sabemos que todas as coisas cooperam para o bem daqueles que amam a Deus.' },
]

export default function Biblical() {
  const [i, setI] = useState(0)
  const [aberto, setAberto] = useState(null)
  const [busca, setBusca] = useState('')
  const v = VERSES[i]

  const temas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return BIBLICAL_THEMES
    return BIBLICAL_THEMES.filter(
      (t) =>
        t.tema.toLowerCase().includes(q) ||
        t.versos.some((vv) => vv.r.toLowerCase().includes(q) || vv.t.toLowerCase().includes(q)),
    )
  }, [busca])

  const copiar = (vv) => {
    navigator.clipboard?.writeText(`"${vv.t}" — ${vv.r}`).catch(() => {})
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📖 Recursos Biblicos</h2>
      </div>
      <div style={{ background: 'linear-gradient(135deg,#1a4a3a,#2d6e52)', borderRadius: 'var(--r)', padding: 18, color: '#fff', marginBottom: 12, position: 'relative' }}>
        <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Versiculo de hoje</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, fontStyle: 'italic', marginBottom: 7 }}>"{v.t}"</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>— {v.r}</div>
        <div style={{ position: 'absolute', bottom: 10, right: 12, display: 'flex', gap: 5 }}>
          <button className="btn btn-sm" onClick={() => setI((i - 1 + VERSES.length) % VERSES.length)} style={{ background: 'rgba(255,255,255,.15)', borderColor: 'transparent', color: '#fff', padding: '3px 8px' }}>‹</button>
          <button className="btn btn-sm" onClick={() => setI((i + 1) % VERSES.length)} style={{ background: 'rgba(255,255,255,.15)', borderColor: 'transparent', color: '#fff', padding: '3px 8px' }}>›</button>
        </div>
      </div>

      <div className="card">
        <div className="chdr" style={{ gap: 10 }}>
          <span>Temas frequentes no consultorio ({temas.length})</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tema, referencia ou palavra…"
            style={{ marginLeft: 'auto', border: '1px solid var(--bdr)', borderRadius: 6, padding: '4px 9px', fontSize: 11, outline: 'none', minWidth: 210, background: 'var(--card)' }}
          />
        </div>
        {temas.map((t) => {
          const exp = aberto === t.tema
          return (
            <div key={t.tema} style={{ borderBottom: '1px solid var(--bdr)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px', fontSize: 12 }}>
                {t.tema}
                <button className="btn btn-sm" onClick={() => setAberto(exp ? null : t.tema)}>
                  {exp ? 'Ocultar' : 'Ver versiculos'}
                </button>
              </div>
              {exp && (
                <div style={{ background: 'var(--card2)', padding: '4px 13px 10px' }}>
                  {t.versos.map((vv) => (
                    <div key={vv.r} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px dashed var(--bdr)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, lineHeight: 1.6, fontStyle: 'italic' }}>"{vv.t}"</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>— {vv.r}</div>
                      </div>
                      <button className="btn btn-sm" title="Copiar para usar na sessao" onClick={() => copiar(vv)} style={{ flexShrink: 0 }}>Copiar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {temas.length === 0 && (
          <div style={{ padding: '18px 13px', fontSize: 12, color: 'var(--txt3)', textAlign: 'center' }}>Nenhum tema encontrado para "{busca}".</div>
        )}
      </div>
    </div>
  )
}
