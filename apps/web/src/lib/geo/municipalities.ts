import { UF_CENTERS } from './uf-centers'

/**
 * Dataset público com coordenadas de todos os municípios brasileiros.
 * Fonte: kelvins/Municipios-Brasileiros (dados IBGE)
 */
const MUNICIPALITIES_CSV_URL =
  'https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv'

interface MunicipalityCoord {
  lat: number
  lng: number
}

// Cache em memória (server-side, persiste entre requests no mesmo processo)
let municipalityCache: Map<string, MunicipalityCoord> | null = null

/**
 * Normaliza nome do município para busca (remove acentos, lowercase).
 */
function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Carrega e parseia o CSV de municípios do IBGE.
 * Retorna Map com chave "municipio_normalizado|uf" → { lat, lng }
 */
async function loadMunicipalities(): Promise<Map<string, MunicipalityCoord>> {
  if (municipalityCache) return municipalityCache

  try {
    const res = await fetch(MUNICIPALITIES_CSV_URL, { next: { revalidate: 86400 } }) // cache 24h
    const text = await res.text()
    const lines = text.split('\n')

    const map = new Map<string, MunicipalityCoord>()

    // Header: codigo_ibge,nome,latitude,longitude,capital,codigo_uf
    // UF codes: https://www.ibge.gov.br/explica/codigos-dos-municipios.php
    const UF_CODE_MAP: Record<string, string> = {
      '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA',
      '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE',
      '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE',
      '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
      '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT',
      '52': 'GO', '53': 'DF',
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const parts = line.split(',')
      if (parts.length < 6) continue

      const nome = parts[1]
      const lat = parseFloat(parts[2])
      const lng = parseFloat(parts[3])
      const codigoUf = parts[5]

      if (isNaN(lat) || isNaN(lng)) continue

      const uf = UF_CODE_MAP[codigoUf] || ''
      if (!uf) continue

      const key = `${normalize(nome)}|${uf}`
      map.set(key, { lat, lng })
    }

    municipalityCache = map
    return map
  } catch (error) {
    console.error('Failed to load municipalities:', error)
    return new Map()
  }
}

/**
 * Resolve coordenadas para um município + UF.
 * Retorna as coordenadas exatas ou fallback para o centro do estado.
 */
export async function getMunicipalityCoords(
  municipio: string | null,
  uf: string | null,
): Promise<MunicipalityCoord | null> {
  if (!uf) return null

  const ufCenter = UF_CENTERS[uf]
  if (!ufCenter) return null

  if (!municipio) {
    return { lat: ufCenter.lat, lng: ufCenter.lng }
  }

  const municipalities = await loadMunicipalities()
  const key = `${normalize(municipio)}|${uf}`
  const coords = municipalities.get(key)

  if (coords) return coords

  // Fallback: centro do estado
  return { lat: ufCenter.lat, lng: ufCenter.lng }
}

/**
 * Resolve coordenadas para múltiplos municípios de uma vez (batch).
 * Retorna Map com chave "municipio|uf" → coords.
 */
export async function batchGetMunicipalityCoords(
  items: Array<{ municipio: string | null; uf: string | null }>,
): Promise<Map<string, MunicipalityCoord>> {
  const municipalities = await loadMunicipalities()
  const result = new Map<string, MunicipalityCoord>()

  for (const item of items) {
    const { municipio, uf } = item
    if (!uf) continue

    const resultKey = `${municipio || ''}|${uf}`
    if (result.has(resultKey)) continue

    const ufCenter = UF_CENTERS[uf]
    if (!ufCenter) continue

    if (!municipio) {
      result.set(resultKey, { lat: ufCenter.lat, lng: ufCenter.lng })
      continue
    }

    const lookupKey = `${normalize(municipio)}|${uf}`
    const coords = municipalities.get(lookupKey)

    result.set(resultKey, coords || { lat: ufCenter.lat, lng: ufCenter.lng })
  }

  return result
}
