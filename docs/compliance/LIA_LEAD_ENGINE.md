# Legitimate Interest Assessment (LIA) — Lead Engine

**Documento:** LIA-001
**Versão:** v1.0
**Data de Elaboração:** 06/04/2026
**Responsável:** ZeepCode Tecnologia LTDA
**Próxima Revisão:** 06/10/2026 (semestral)
**Aplicável a:** Módulo Lead Engine do Licitagram

---

## 1. Finalidade do Tratamento

O tratamento de dados de Pessoas Jurídicas (PJ) visa identificar e contatar fornecedores ativos no setor público brasileiro que podem se beneficiar dos serviços do Licitagram — plataforma de inteligência em licitações públicas.

**Dados tratados:**
- Razão social, CNPJ, endereço e CNAE (dados públicos da RFB)
- Histórico de participação em licitações públicas (dados públicos do PNCP/ComprasGov)
- Email institucional genérico (contato@, comercial@, licitacoes@ — NUNCA emails nominais de pessoas físicas)
- Telefone comercial (publicado pela empresa em cadastros públicos)
- Situação em listas de sanções (CEIS/CNEP/CEPIM — dados públicos)

**Dados NÃO tratados:**
- CPF, nome, email ou telefone de sócios ou funcionários (pessoas físicas)
- Dados do quadro societário (tabela `socios` da RFB é explicitamente excluída)
- Dados bancários, financeiros ou sensíveis
- Dados de pessoas físicas em qualquer contexto

## 2. Base Legal

**Art. 7º, IX da Lei 13.709/2018 (LGPD):**
"O tratamento de dados pessoais somente poderá ser realizado nas seguintes hipóteses: (...) IX - quando necessário para atender aos interesses legítimos do controlador ou de terceiro, exceto no caso de prevalecerem direitos e liberdades fundamentais do titular que exijam a proteção dos dados pessoais."

**Observação importante:** Os dados tratados são predominantemente de Pessoas Jurídicas. A LGPD aplica-se primariamente a dados de pessoas naturais (Art. 1º). Contudo, adotamos as mesmas salvaguardas por cautela e boa prática.

## 3. Teste de Necessidade

O tratamento é necessário porque:

1. **Identificação de mercado:** Sem acesso aos dados de participação em licitações, é impossível identificar quais empresas são fornecedoras ativas do governo e poderiam se beneficiar do Licitagram.

2. **Qualificação de leads:** O scoring proprietário (baseado em volume de participação, taxa de vitória, ticket médio e "dor de perda") permite direcionar comunicações relevantes apenas para empresas com alta probabilidade de interesse.

3. **Personalização da oferta:** Dados de histórico permitem recomendar o plano adequado (Essencial, Profissional, Enterprise) e gerar mensagens relevantes.

4. **Não há alternativa menos intrusiva:** Os dados são públicos (RFB + PNCP). Não é possível alcançar o mesmo resultado sem processá-los.

## 4. Teste de Balanceamento

### 4.1 Interesse Legítimo da ZeepCode

- Prospecção comercial B2B direcionada
- Economia de recursos ao contatar apenas leads qualificados
- Oferta de serviço relevante que agrega valor ao lead

### 4.2 Impacto nos Titulares (PJs)

- **Mínimo:** Todos os dados são públicos e de Pessoa Jurídica
- **Sem surpresa:** Fornecedores do governo esperam ser contatados por empresas do ecossistema
- **Benefício potencial:** O Licitagram pode genuinamente ajudar essas empresas a ganhar mais licitações
- **Sem dados sensíveis:** Nenhum dado de pessoa física é tratado

### 4.3 Conclusão do Balanceamento

O interesse legítimo da ZeepCode **prevalece** porque:
- Os dados são exclusivamente de PJ e de fontes públicas
- O impacto nos titulares é mínimo ou positivo
- Existem salvaguardas robustas implementadas (ver seção 5)

## 5. Salvaguardas Implementadas

### 5.1 Técnicas (implementadas no código)

| # | Salvaguarda | Implementação |
|---|------------|---------------|
| 1 | **Filtro de email genérico** | Regex valida que apenas emails tipo contato@, comercial@, licitacoes@ são armazenados. Emails nominais (joao.silva@) são descartados na ingestão. |
| 2 | **Tabela socios OFF-LIMITS** | O módulo Lead Engine não acessa a tabela `socios` da RFB em nenhum endpoint ou worker. |
| 3 | **Opt-out automático** | Link HMAC-assinado em todo CSV exportado. Página de confirmação com data e motivo. |
| 4 | **Opt-out irrevogável no reimport** | UPSERT nunca sobrescreve campos de contato de leads com opt_out = true. |
| 5 | **Nunca deletar registros** | Leads com opt-out mantêm registro para evitar reimportação. Apenas flags são alterados. |
| 6 | **Bloqueio de exportação LGPD** | Middleware impede exportação de leads com opt_out ou bloqueado_disparo, independente de filtro. |
| 7 | **Audit log completo** | Toda exportação, opt-out, bloqueio e edição é registrada em admin_leads_audit_log. |
| 8 | **Rate limit de exportação** | Máximo 5.000 leads por export, 3 exports por dia por admin. |
| 9 | **Desqualificação por sanção** | Empresas em CEIS/CNEP/CEPIM recebem score 0 e bloqueio automático. |
| 10 | **Base legal em cada registro** | Campo base_legal_lgpd preenchido automaticamente com referência a este documento. |

### 5.2 Organizacionais

- Acesso restrito à área admin com autenticação obrigatória (`requirePlatformAdmin()`)
- Permissões granulares por seção (`checkAdminPermission()`)
- Documento LIA revisado semestralmente
- Treinamento da equipe sobre uso adequado dos dados

## 6. Direitos dos Titulares

Embora os dados sejam de PJ, garantimos:

| Direito | Como é atendido |
|---------|----------------|
| **Opt-out** | Link automático em toda comunicação. Processamento imediato. |
| **Acesso** | Via solicitação a contato@licitagram.com.br — resposta em 15 dias. |
| **Correção** | Via solicitação — dados corrigidos na próxima atualização. |
| **Eliminação** | Não aplicável (dados públicos de PJ), mas opt-out garante cessação de contato. |
| **Portabilidade** | Não aplicável a dados de PJ de fonte pública. |

## 7. Registro de Revisões

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| v1.0 | 06/04/2026 | ZeepCode | Documento inicial |

---

*Este documento atende ao Art. 10, §2º da LGPD e constitui registro formal do Legitimate Interest Assessment para o módulo Lead Engine do Licitagram.*
