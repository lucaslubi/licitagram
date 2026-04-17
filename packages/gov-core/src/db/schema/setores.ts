import { uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
import { licitagov, orgaos } from './orgaos'
import { usuarios } from './usuarios'

export const setores = licitagov.table('setores', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgaoId: uuid('orgao_id').notNull().references(() => orgaos.id, { onDelete: 'cascade' }),
  nome: text('nome').notNull(),
  sigla: text('sigla'),
  responsavelId: uuid('responsavel_id').references(() => usuarios.id, { onDelete: 'set null' }),
  ativo: boolean('ativo').notNull().default(true),
  metadados: jsonb('metadados').$type<Record<string, unknown>>().default({}),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type Setor = typeof setores.$inferSelect
export type NovoSetor = typeof setores.$inferInsert
