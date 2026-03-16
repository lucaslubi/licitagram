/**
 * Centro geográfico aproximado de cada UF brasileira.
 * Usado para posicionar markers e labels no mapa.
 */
export const UF_CENTERS: Record<string, { lat: number; lng: number; name: string; region: string }> = {
  AC: { lat: -9.97, lng: -67.81, name: 'Acre', region: 'Norte' },
  AL: { lat: -9.57, lng: -36.78, name: 'Alagoas', region: 'Nordeste' },
  AM: { lat: -3.12, lng: -60.02, name: 'Amazonas', region: 'Norte' },
  AP: { lat: 0.90, lng: -52.00, name: 'Amapá', region: 'Norte' },
  BA: { lat: -12.97, lng: -38.51, name: 'Bahia', region: 'Nordeste' },
  CE: { lat: -3.72, lng: -38.54, name: 'Ceará', region: 'Nordeste' },
  DF: { lat: -15.78, lng: -47.93, name: 'Distrito Federal', region: 'Centro-Oeste' },
  ES: { lat: -20.32, lng: -40.34, name: 'Espírito Santo', region: 'Sudeste' },
  GO: { lat: -16.68, lng: -49.25, name: 'Goiás', region: 'Centro-Oeste' },
  MA: { lat: -2.53, lng: -44.28, name: 'Maranhão', region: 'Nordeste' },
  MG: { lat: -19.92, lng: -43.94, name: 'Minas Gerais', region: 'Sudeste' },
  MS: { lat: -20.44, lng: -54.65, name: 'Mato Grosso do Sul', region: 'Centro-Oeste' },
  MT: { lat: -15.60, lng: -56.10, name: 'Mato Grosso', region: 'Centro-Oeste' },
  PA: { lat: -1.46, lng: -48.50, name: 'Pará', region: 'Norte' },
  PB: { lat: -7.12, lng: -34.86, name: 'Paraíba', region: 'Nordeste' },
  PE: { lat: -8.05, lng: -34.87, name: 'Pernambuco', region: 'Nordeste' },
  PI: { lat: -5.09, lng: -42.80, name: 'Piauí', region: 'Nordeste' },
  PR: { lat: -25.43, lng: -49.27, name: 'Paraná', region: 'Sul' },
  RJ: { lat: -22.91, lng: -43.17, name: 'Rio de Janeiro', region: 'Sudeste' },
  RN: { lat: -5.79, lng: -35.21, name: 'Rio Grande do Norte', region: 'Nordeste' },
  RO: { lat: -8.76, lng: -63.90, name: 'Rondônia', region: 'Norte' },
  RR: { lat: 2.82, lng: -60.67, name: 'Roraima', region: 'Norte' },
  RS: { lat: -30.03, lng: -51.23, name: 'Rio Grande do Sul', region: 'Sul' },
  SC: { lat: -27.60, lng: -48.55, name: 'Santa Catarina', region: 'Sul' },
  SE: { lat: -10.91, lng: -37.07, name: 'Sergipe', region: 'Nordeste' },
  SP: { lat: -23.55, lng: -46.64, name: 'São Paulo', region: 'Sudeste' },
  TO: { lat: -10.18, lng: -48.33, name: 'Tocantins', region: 'Norte' },
}

export const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const
export type Region = typeof REGIONS[number]
