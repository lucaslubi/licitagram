import { pgSchema, uuid, varchar, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'

export const licitagov = pgSchema('licitagov')

export const orgaos = licitagov.table('orgaos', {
  id: uuid('id').primaryKey().defaultRandom(),
  cnpj: varchar('cnpj', { length: 14 }).notNull().unique(),
  razaoSocial: text('razao_social').notNull(),
  nomeFantasia: text('nome_fantasia'),
  esfera: varchar('esfera', { length: 10 }).notNull(),
  poder: varchar('poder', { length: 20 }),
  uf: varchar('uf', { length: 2 }),
  municipio: text('municipio'),
  codigoIbge: varchar('codigo_ibge', { length: 7 }),
  naturezaJuridica: varchar('natureza_juridica', { length: 4 }),
  perfilRegulatorioId: uuid('perfil_regulatorio_id'),
  ativo: boolean('ativo').notNull().default(true),
  metadados: jsonb('metadados').$type<Record<string, unknown>>().default({}),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type Orgao = typeof orgaos.$inferSelect
export type NovoOrgao = typeof orgaos.$inferInsert
