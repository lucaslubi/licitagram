# 🤖 Guia do Robô de Lances

**Licitagram** — Automação de lances em pregões eletrônicos do Compras.gov.br

---

## O que é o Robô de Lances?

O robô faz os lances por você nos pregões eletrônicos, seguindo a estratégia que você configurou. Ele dispara lances em milissegundos, respeita o preço mínimo que você definiu e nunca lança abaixo do seu piso.

**Principais vantagens:**

- 🚀 **Rápido** — 50 a 200 milissegundos por lance (um humano leva 3 a 5 segundos)
- 🛡️ **Seguro** — nunca lança abaixo do piso que você definir
- 📅 **Agendado** — cadastre vários pregões de uma vez e o robô dispara cada um no horário certo
- 👁️ **Transparente** — você acompanha tudo ao vivo e tem histórico completo

---

## Preparação inicial (faz uma vez só)

### Passo 1 — Conecte sua conta do Compras.gov.br

> Isso é necessário porque o robô precisa da sua autorização pra dar lances em seu nome.

1. Entre no Licitagram → menu **Robô de Lances**
2. Na aba **"Conectar Conta Gov.br"**, clique em **✨ Gerar meu atalho**
3. Um botão laranja **📌 Conectar Licitagram** vai aparecer
4. **Arraste esse botão** (segura com o mouse e solta) pra barra de favoritos do seu navegador
   > 💡 Se a barra de favoritos não estiver aparecendo: Chrome/Edge aperta **Ctrl+Shift+B** (Windows) ou **⌘+Shift+B** (Mac)
5. Em outra aba, abra [compras.gov.br](https://www.compras.gov.br/) e faça login normalmente (com seu CPF e senha do gov.br)
6. Vá até a **área do fornecedor** (tela que mostra seus pregões)
7. **Com a página do Compras aberta e logada**, clique no favorito **📌 Conectar Licitagram** que você criou
8. Uma nova aba vai abrir mostrando **✅ Conta conectada** com seu CNPJ

Pronto. O robô agora tem autorização pra operar em seu nome.

> ⚠️ Seu CPF e senha do gov.br **nunca** são salvos no Licitagram. Guardamos apenas uma chave temporária de autorização, que renova automaticamente enquanto você usa o sistema.

### Passo 2 — Confirme que seu portal está configurado

Na aba **"Portais Configurados"**, você deve ver sua empresa listada como ativa. Se não tiver, clique em **"Adicionar Portal"** e preencha seu CPF/login do gov.br (a senha é opcional no novo sistema).

---

## Agendar um pregão

### Informações que você precisa ter em mãos

- **ID do pregão** — aquele número grande tipo `98957106000712025`
  - 💡 Como achar: entre no pregão no Compras.gov.br e copie o número da URL (`?compra=`)
- **Data e hora exata da disputa** (como aparece no edital)
- **Piso de preço** — o menor valor pelo qual você aceita vencer. **O robô NUNCA lança abaixo disso.**

### Passo a passo

1. Na aba **"Agendar em Lote"**, preencha a tabela:

| Campo | O que colocar | Exemplo |
|---|---|---|
| **Portal** | Selecione seu login | Compras.gov.br (sua empresa) |
| **Pregão ID** | Número completo | `98957106000712025` |
| **Disputa em** | Data e hora (horário de Brasília) | `25/04/2026 14:00` |
| **Piso (R$)** | Preço mínimo aceitável | `45000,00` |
| **Modo** | Como o robô vai agir | **Auto Lance** |

2. Se quiser agendar vários pregões na mesma semana, clica **+ Linha** e preenche outro
3. Clica **"Agendar em lote"**

Você vai ver uma confirmação: *"N sessões criadas — X agendadas, Y imediatas"*.

### Modos de operação (o que escolher?)

| Modo | O que faz | Quando usar |
|---|---|---|
| **Observar** | Só assiste o pregão, anota tudo, **não lança** | Primeiro teste num pregão novo, pra ver se o robô interpreta tudo certo |
| **Supervisor** | Configura seu piso no portal e deixa o sistema do próprio Compras.gov.br dar os lances automaticamente | Se você confia no auto-bid nativo do portal |
| **Auto Lance** | O Licitagram dispara cada lance ativamente, com estratégia inteligente | Modo padrão, máxima performance |

**Recomendação**: Na primeira vez usando o robô num pregão, rode em **Observar** pra garantir que tudo está correto. Depois muda pra **Auto Lance**.

---

## Acompanhar ao vivo

Na aba **"Sessões Ativas"** você vê cards de cada pregão em andamento:

- 🟣 **Agendado** — aguardando o horário da disputa
- 🟡 **Pendente** — prestes a começar (pronto pra rodar)
- 🔵 **Ativo** — disputando agora (com spinner "Bot em execução…")
- 🟢 **Concluído** — pregão terminou com sucesso
- 🔴 **Falhou** — erro (olhe a mensagem pra entender)

Cada card mostra:
- Número de lances já dados
- Último valor lançado
- Estratégia em uso

**Botões úteis:**

- **Pausar** — congela enquanto ativo (você pode retomar depois)
- **Iniciar agora** — força início antes do horário (se a disputa for antecipada)
- **Cancelar** — mata a sessão permanentemente
- **Replay forense** — timeline detalhada de tudo que aconteceu (cada scan, cada lance, cada decisão)

---

## Importar vários pregões de uma vez via CSV

Se você tem muitos pregões pra cadastrar, clique em **Importar CSV** e use este formato:

```csv
config_id,pregao_id,scheduled_at,min_price,mode
[SEU ID],98957106000712025,2026-04-25 14:00,45000,auto_bid
[SEU ID],12345678000902025,2026-04-26 09:30,120000,supervisor
[SEU ID],55566677000122025,2026-04-27 15:00,38000,auto_bid
```

**Observações:**
- Separador pode ser **vírgula** (`,`) ou **ponto-e-vírgula** (`;`)
- Data pode ser ISO (`2026-04-25T14:00`) ou formato BR (`2026-04-25 14:00`)
- Se deixar `config_id` vazio, usa seu portal padrão
- Até 100 pregões por importação

---

## Regras de segurança (já ativas por padrão)

| Regra | O que faz |
|---|---|
| 🛡️ **Piso é lei** | Nunca lança abaixo do seu piso, nem se o mercado forçar |
| ⚡ **Limite de velocidade** | Máximo 2 lances por 100 milissegundos (evita banimento do portal) |
| 🔄 **Anti-duplicata** | Espera 6 segundos após cada lance pra não spammar o mesmo item |
| 🔑 **Renovação automática** | Enquanto possível, renova sua autorização sozinho |
| ⏰ **Teto de 6 horas** | Se o pregão durar mais que isso, sessão termina sozinha (proteção) |
| 📝 **Auditoria completa** | Cada lance, decisão e erro é gravado pra você conferir depois |

---

## Perguntas frequentes

### 🤔 Meu login do gov.br tem 2 fatores (autenticador, SMS). O robô pega isso?

Não precisa. Você faz o login normal no navegador (inclusive 2FA se tiver) e o atalho só captura a autorização depois que você já está logado. O robô usa essa autorização pra operar, sem precisar saber sua senha nem 2FA.

### 🔐 Meus dados estão seguros?

- Sua senha **nunca** é salva (nem o CPF)
- A chave de autorização é guardada criptografada no banco (padrão AES-256-GCM, mesmo que bancos usam)
- A chave expira sozinha (algumas horas) e renova automaticamente
- Só sua conta tem acesso aos seus dados (RLS no banco)

### ⏱️ Quanto tempo vale a conexão?

A autorização do Compras.gov.br dura algumas horas (geralmente 4 a 8). O robô renova automaticamente enquanto você tem o "refresh token" válido. Em caso de sessão longa do gov.br (dias sem acessar), você vai precisar reconectar manualmente — o sistema avisa quando isso acontecer.

### 📉 O que acontece se o mercado cair muito rápido?

O robô tenta acompanhar, mas respeita:
- Seu piso (nunca abaixo)
- Intervalo mínimo do edital (o portal pode exigir descontos mínimos)
- Limite de 2 lances por 100ms (não pra spammar)

Se o mercado cair abaixo do seu piso, ele simplesmente para de lançar. Você vê no card "⛔ Bloqueio de Chão".

### 💸 O robô pode me fazer vencer por um valor absurdamente baixo?

**Não.** Seu piso é a proteção absoluta. O robô nunca lança abaixo dele, nem se for pra ficar em 1º lugar. Isso é validado em cada tentativa de lance.

### 🆘 E se der erro no meio do pregão?

O sistema tenta se recuperar automaticamente (até 3 vezes). Se falhar definitivamente, marca a sessão como "Falhou" com uma mensagem explicando. Erros comuns:

- **"Token expirado"** → sua autorização venceu. Reconecte na aba "Conectar Conta Gov.br"
- **"Portal não responde"** → Compras.gov.br está fora do ar (raro)
- **"Item não encontrado"** → pregão pode ter sido cancelado

Cada erro fica registrado no histórico pra você revisar depois.

### 🔄 Posso editar uma sessão agendada?

Você pode **pausar** ou **cancelar** uma sessão. Se precisar mudar o piso ou estratégia, cancele a atual e agende uma nova — leva 10 segundos.

---

## Suporte

- 📧 **Email**: suporte@licitagram.com.br
- 💬 **WhatsApp**: dentro do app, botão "Ajuda"
- 📖 **Tutorial em vídeo**: licitagram.com.br/tutorial

**Antes de pedir suporte**, confira:
1. Sua conta está conectada? (aba "Conectar Conta Gov.br" mostra ✅?)
2. Sua assinatura está ativa?
3. Tem erro na sessão? Olha o "Replay forense" pra detalhes

---

> **Licitagram** — Vender pra governo ficou fácil.
> Versão do guia: 1.0 — Abril/2026
