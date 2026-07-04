// Escalas clinicas padronizadas — PHQ-9 (depressao) e GAD-7 (ansiedade).
// Uso educacional/triagem: nao substitui avaliacao clinica formal.

export const SCALE_OPTIONS = [
  { v: 0, l: 'Nunca' },
  { v: 1, l: 'Varios dias' },
  { v: 2, l: 'Mais da metade dos dias' },
  { v: 3, l: 'Quase todos os dias' },
]

export const SCALES = {
  phq9: {
    label: 'PHQ-9 (Depressao)',
    intro: 'Nas ultimas 2 semanas, com que frequencia voce foi incomodado(a) por algum dos problemas abaixo?',
    maxScore: 27,
    riskItemIndex: 8, // "pensamentos de morte/se machucar" — atenção especial se > 0
    questions: [
      'Pouco interesse ou prazer em fazer as coisas',
      'Sentir-se pra baixo, deprimido(a) ou sem esperanca',
      'Dificuldade para pegar no sono, continuar dormindo ou dormir demais',
      'Sentir-se cansado(a) ou com pouca energia',
      'Falta de apetite ou comer demais',
      'Sentir-se mal consigo mesmo(a) — ou achar que e um fracasso ou que decepcionou sua familia ou a si mesmo(a)',
      'Dificuldade para se concentrar, como ler ou assistir TV',
      'Lentidao para se movimentar ou falar (percebida por outros); ou o contrario, muita inquietacao',
      'Pensamentos de que seria melhor estar morto(a) ou de se machucar de alguma forma',
    ],
    severity: (score) => {
      if (score <= 4) return 'Minima'
      if (score <= 9) return 'Leve'
      if (score <= 14) return 'Moderada'
      if (score <= 19) return 'Moderadamente severa'
      return 'Severa'
    },
  },
  gad7: {
    label: 'GAD-7 (Ansiedade)',
    intro: 'Nas ultimas 2 semanas, com que frequencia voce foi incomodado(a) por algum dos problemas abaixo?',
    maxScore: 21,
    riskItemIndex: null,
    questions: [
      'Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)',
      'Nao ser capaz de impedir ou controlar as preocupacoes',
      'Preocupar-se muito com diversas coisas',
      'Dificuldade para relaxar',
      'Ficar tao agitado(a) que se torna dificil permanecer parado(a)',
      'Ficar facilmente aborrecido(a) ou irritado(a)',
      'Sentir medo como se algo terrivel fosse acontecer',
    ],
    severity: (score) => {
      if (score <= 4) return 'Minima'
      if (score <= 9) return 'Leve'
      if (score <= 14) return 'Moderada'
      return 'Severa'
    },
  },
}

export function scoreScale(scaleKey, answers) {
  const def = SCALES[scaleKey]
  const total = answers.reduce((s, v) => s + (Number(v) || 0), 0)
  const severity = def.severity(total)
  const riskFlag = def.riskItemIndex != null && Number(answers[def.riskItemIndex]) > 0
  return { total, severity, riskFlag }
}
