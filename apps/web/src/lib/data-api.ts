/**
 * Client module for the enrichment API on VPS2.
 * All functions degrade gracefully — the app continues without enrichment data on errors.
 */

const DATA_API_URL = process.env.ENRICHMENT_API_URL || 'http://85.31.60.53:3998'

export async function enrichCNPJ(cnpj: string) {
  try {
    const res = await fetch(`${DATA_API_URL}/api/empresa/${cnpj}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 }, // cache 24h
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getSocios(cnpj: string) {
  try {
    const res = await fetch(`${DATA_API_URL}/api/socios/${cnpj}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.socios || []
  } catch {
    return []
  }
}

export async function checkSancoes(cnpj: string) {
  try {
    const res = await fetch(`${DATA_API_URL}/api/sancoes/${cnpj}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 }, // cache 1h
    })
    if (!res.ok) return { sancionado: false, sancoes: [] }
    return res.json()
  } catch {
    return { sancionado: false, sancoes: [] }
  }
}

export async function getGrafoSocietario(cnpj: string, depth: number = 1) {
  try {
    const res = await fetch(`${DATA_API_URL}/api/grafo/${cnpj}?depth=${depth}`, {
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
