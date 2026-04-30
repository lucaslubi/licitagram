# Como configurar o Auto-Pilot™

## 1. Conectar a conta gov.br

1. Vá em **Bot → Conectar Conta Gov.br**
2. Use o bookmarklet (1 clique no portal logado)
3. Pronto — não precisa colocar senha aqui

## 2. Iniciar uma sessão

1. **Bot → Nova sessão**
2. **Pregão**: cole o ID (ex: `12001305900022026`) ou URL
3. **Modo**:
   - **Supervisor**: bot só observa, manda alertas (sem riscos)
   - **Auto Bid**: bot dispara lances automaticamente — **exige piso**
   - **Shadow**: roda o engine mas não dispara (debug)
4. **Piso (min_price) — obrigatório em Auto Bid**: valor mínimo absoluto.
   O robô NUNCA vai lançar abaixo disso. Sem piso, a sessão é recusada
   no momento do agendamento (mensagem: "Configure um piso antes de
   iniciar uma sessão auto_bid").

## 3. Configurar item-a-item (opcional)

Botão **"Configurar itens do pregão"** abre o modal:
- **Piso global**: aplica o mesmo valor a todos os itens ativos
- **Hierarquia**: piso por item > piso global > piso da tela anterior
- **Ativar / Desativar todos**: ligar ou desligar de uma vez
- Header mostra **X/Y ativos** ao vivo
- **Salvar configuração**: confirma + toast verde

Se você fechar sem salvar, o robô usa o **piso da tela anterior** pra todos.

## 4. Controles ao vivo durante a disputa

Durante uma sessão ativa, você pode (sem reiniciar):

- **Pausar**: bot para de disparar mas mantém sessão gov.br quente.
  Latência: < 1 s entre clicar e parar.
- **Retomar**: volta a operar.
- **Panic Stop**: cancela definitivamente, libera o lock da conta, e
  marca como "Cancelado pelo operador".
- **Editar piso ao vivo**: muda `min_price` sem reiniciar; engine aplica
  em até 1 s e emite `strategy_updated`.
- **Editar modo / rate-limit / stop-loss**: idem, via mesma rota.

Tudo via `PATCH /api/bot/sessions/:id/strategy` (UI cuida).

## 5. Stop-loss automático (opcional)

Configure em `strategy_config`:

```json
{ "stopLossPct": 30, "stopLossWindowSec": 60 }
```

Se o melhor preço de algum item cair **30% em 60 s**, o bot pausa
sozinho e emite `stop_loss_triggered`. Você decide se retoma ou
cancela.

## 6. Rate-limit do bot

Por padrão:
- Mínimo de **3 s** entre lances do bot
- Máximo de **15 lances/min** (janela móvel)

Pra ajustar (em `strategy_config`):

```json
{ "minDelayBetweenOwnBidsMs": 5000, "maxBidsPerMinute": 10 }
```

## 7. Observability

Tudo o que o bot faz (e **por que NÃO faz**) vira evento em
`bot_events`. Eventos importantes pra entender uma sessão silenciosa:

- `our_bid_skip` — bot decidiu não disparar; payload tem `reason`
  (ex.: `chao_invalido_ou_zero`, `rate_limit_min_delay_3000ms`,
  `bloqueio_chao`, etc.)
- `floor_breach_prevented` — bot ia disparar mas piso atualizado
  bloqueou na hora
- `strategy_updated` — UI editou ao vivo, engine recebeu
- `stop_loss_triggered` — pausou sozinho

## 8. Erros mais comuns

| Mensagem | Causa | Como resolver |
|---|---|---|
| `Configure um piso antes de iniciar` | min_price ausente em auto_bid | Preencher piso |
| `Outra sessão dessa empresa já está rodando` | F8 lock | Cancelar a outra antes |
| `Conta Compras.gov.br não conectada` | sem bot_tokens | Conectar via bookmarklet |
| `chao_invalido_ou_zero` em our_bid_skip | piso = null no DB (raro pós-F2) | Reiniciar com piso preenchido |
