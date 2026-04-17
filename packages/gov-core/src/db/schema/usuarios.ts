import { uuid, varchar, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
import { licitagov, orgaos } from './orgaos'

export const usuarios = licitagov.table('usuarios', {
  id: uuid('id').primaryKey(),
  orgaoId: uuid('orgao_id').notNull().references(() => orgaos.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  nomeCompleto: text('nome_completo').notNull(),
  cpf: varchar('cpf', { length: 11 }),
  cargo: text('cargo'),
  papel: varchar('papel', { length: 30 }).notNull().default('requisitante'),
  mfaHabilitado: boolean('mfa_habilitado').notNull().default(false),
  ultimoAcessoEm: timestamp('ultimo_acesso_em', { withTimezone: true }),
  metadados: jsonb('metadados').$type<Record<string, unknown>>().default({}),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type Usuario = typeof usuarios.$inferSelect
export type NovoUsuario = typeof usuarios.$inferInsert
