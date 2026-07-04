// Configuracao de marca/nicho por instalacao (modelo white-label: uma
// instalacao por cliente). Tudo aqui vem de variaveis de ambiente com
// valores padrao genericos — ajuste o .env de cada cliente sem tocar
// no codigo-fonte.
const env = import.meta.env

export const SITE = {
  appName: env.VITE_APP_NAME || 'TerapiaViva',
  therapistName: env.VITE_THERAPIST_NAME || '',
  city: env.VITE_CITY || '',
  church: env.VITE_CHURCH || '',
  traditionLabel: env.VITE_TRADITION_LABEL || 'Terapia com base biblica',
  loginVerse: env.VITE_LOGIN_VERSE || '',
  heroPhoto: env.VITE_HERO_PHOTO || '/foto.jpg',
  themeColor: env.VITE_THEME_COLOR || '#1D9E75',
}
