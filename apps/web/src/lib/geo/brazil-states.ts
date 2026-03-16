/**
 * GeoJSON dos estados brasileiros.
 * Carregado dinamicamente no cliente via fetch (evita ~200KB no bundle JS).
 */
export const BRAZIL_GEOJSON_URL =
  'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson'

/**
 * Mapeia propriedade 'name' do GeoJSON para sigla UF.
 */
export const STATE_NAME_TO_UF: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amazonas': 'AM', 'Amapá': 'AP',
  'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
  'Minas Gerais': 'MG', 'Mato Grosso do Sul': 'MS', 'Mato Grosso': 'MT',
  'Pará': 'PA', 'Paraíba': 'PB', 'Pernambuco': 'PE', 'Piauí': 'PI',
  'Paraná': 'PR', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
  'Rondônia': 'RO', 'Roraima': 'RR', 'Rio Grande do Sul': 'RS',
  'Santa Catarina': 'SC', 'Sergipe': 'SE', 'São Paulo': 'SP',
  'Tocantins': 'TO',
}
