import { useState } from 'react'

const VERSES = [
  { r:'Filipenses 4:7', t:'A paz de Deus, que excede todo entendimento, guardara os vossos coracoes e as vossas mentes.' },
  { r:'Jeremias 29:11', t:'Porque sou eu que conheco os planos que tenho para voces, diz o Senhor.' },
  { r:'Salmo 46:1', t:'Deus e o nosso refugio e fortaleza, socorro bem presente na angustia.' },
  { r:'2 Corintios 1:3-4', t:'Deus de toda consolacao, o qual nos consola em todas as nossas tribulacoes.' },
  { r:'Romanos 8:28', t:'Sabemos que todas as coisas cooperam para o bem daqueles que amam a Deus.' },
]

const TEMAS = [
  'Ansiedade e paz','Casamento e familia','Perdao e restauracao',
  'Identidade em Cristo','Luto e perda','Proposito e vocacao',
]

export default function Biblical() {
  const [i, setI] = useState(0)
  const v = VERSES[i]
  return (
    <div style={{padding:14}}>
      <div style={{marginBottom:12}}><h2 style={{fontSize:15,fontWeight:600}}>📖 Recursos Biblicos</h2></div>
      <div style={{background:'linear-gradient(135deg,#1a4a3a,#2d6e52)',borderRadius:'var(--r)',padding:18,color:'#fff',marginBottom:12,position:'relative'}}>
        <div style={{fontSize:10,opacity:.7,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5}}>Versiculo de hoje</div>
        <div style={{fontSize:13,lineHeight:1.7,fontStyle:'italic',marginBottom:7}}>"{v.t}"</div>
        <div style={{fontSize:11,opacity:.7}}>— {v.r}</div>
        <div style={{position:'absolute',bottom:10,right:12,display:'flex',gap:5}}>
          <button className="btn btn-sm" onClick={()=>setI((i-1+VERSES.length)%VERSES.length)} style={{background:'rgba(255,255,255,.15)',borderColor:'transparent',color:'#fff',padding:'3px 8px'}}>‹</button>
          <button className="btn btn-sm" onClick={()=>setI((i+1)%VERSES.length)} style={{background:'rgba(255,255,255,.15)',borderColor:'transparent',color:'#fff',padding:'3px 8px'}}>›</button>
        </div>
      </div>
      <div className="card">
        <div className="chdr">Temas frequentes no consultorio</div>
        {TEMAS.map(t => (
          <div key={t} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 13px',borderBottom:'1px solid var(--bdr)',fontSize:12}}>
            {t}
            <button className="btn btn-sm">Ver versiculos</button>
          </div>
        ))}
      </div>
    </div>
  )
}
