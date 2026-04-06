/**
 * Lead Engine — Module Index
 *
 * Exporta todos os componentes do Lead Engine para uso externo:
 * - Scoring functions
 * - Population worker
 * - API route handlers
 * - Opt-out utilities
 */

export {
  calcularScoreLead,
  gerarMotivoQualificacao,
  filtrarEmailGenerico,
  mapPorteRfb,
  EMAIL_GENERICO_REGEX,
  type LeadScoringInput,
  type LeadScoringResult,
} from './scoring'

export { populateLeads } from './populate-leads.worker'

export {
  handleListLeads,
  handleLeadDetail,
  handleLeadDashboard,
  handleExportCsv,
  handleOptOut,
  generateOptOutToken,
  verifyOptOutToken,
} from './lead-api-routes'
