/**
 * Guia do Robô de Lances — versão print-friendly pro cliente.
 * URL: /bot/guia
 *
 * Exporta pro PDF via Ctrl+P / Imprimir → "Salvar como PDF".
 */

import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Guia — Robô de Lances',
}

// Força render dinâmico — página estava timeoutando na pré-renderização
// estática do Next durante o build do Vercel. Render por request evita o
// deadlock.
export const dynamic = 'force-dynamic'

export default function GuiaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 print:max-w-none print:px-0 print:py-4">
      {/* Botão voltar + imprimir (só no screen, somem no print) */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/bot"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Voltar ao Robô de Lances
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => typeof window !== 'undefined' && window.print()}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
          >
            🖨️ Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Cabeçalho */}
      <header className="mb-10 border-b border-border pb-6 print:border-b-2 print:border-black">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
          Licitagram
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground print:text-black">
          Guia do Robô de Lances
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Como automatizar seus lances em pregões eletrônicos do Compras.gov.br
        </p>
      </header>

      {/* O que é */}
      <Section title="O que é o Robô de Lances?">
        <p>
          O robô faz os lances por você nos pregões eletrônicos do Compras.gov.br,
          seguindo a estratégia que você configurou. Dispara lances em milissegundos,
          respeita seu preço mínimo e <strong>nunca</strong> lança abaixo do piso que
          você definir.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <Li emoji="🚀">
            <strong>Rápido</strong> — 50 a 200 milissegundos por lance. Um humano leva
            3 a 5 segundos.
          </Li>
          <Li emoji="🛡️">
            <strong>Seguro</strong> — nunca lança abaixo do piso que você definir.
          </Li>
          <Li emoji="📅">
            <strong>Agendado</strong> — cadastre vários pregões da semana de uma vez e
            o robô dispara cada um no horário exato.
          </Li>
          <Li emoji="👁️">
            <strong>Transparente</strong> — você acompanha tudo ao vivo e tem histórico
            completo de cada lance.
          </Li>
        </ul>
      </Section>

      {/* Parte 1 — Conectar */}
      <Section title="Parte 1 — Conecte sua conta do Compras.gov.br" subtitle="Faça isso uma vez só">
        <Callout>
          O robô precisa da sua autorização pra dar lances em seu nome. Conecte
          uma vez e ele opera sozinho.
        </Callout>

        <Step n={1} title="Abra o Robô de Lances no Licitagram">
          <p>Entre no menu do lado e clique em <strong>Robô de Lances</strong>.</p>
        </Step>

        <Step n={2} title='Clique em "Gerar meu atalho"'>
          <p>
            Na aba <strong>Conectar Conta Gov.br</strong>, clique em <strong>✨ Gerar meu
            atalho</strong>. Você vai ver um botão laranja <strong>📌 Conectar Licitagram</strong> aparecer,
            com um cronômetro de 10 minutos.
          </p>
        </Step>

        <Step n={3} title="Arraste o botão pra barra de favoritos">
          <p>
            Segure o botão laranja com o mouse e arraste pra barra de favoritos do
            navegador (aquela faixa fina abaixo da barra de endereço).
          </p>
          <Tip>
            Se a barra de favoritos não estiver aparecendo, aperte{' '}
            <Kbd>Ctrl+Shift+B</Kbd> (Windows) ou <Kbd>⌘+Shift+B</Kbd> (Mac).
          </Tip>
        </Step>

        <Step n={4} title="Faça login no Compras.gov.br">
          <p>
            Em outra aba, abra <strong>compras.gov.br</strong> e faça login normalmente
            com seu CPF e senha do gov.br. Vá até a <strong>área do fornecedor</strong>
            (tela que mostra seus pregões).
          </p>
        </Step>

        <Step n={5} title="Com o Compras logado, clique no favorito que você criou">
          <p>
            Clique em <strong>📌 Conectar Licitagram</strong> na barra de favoritos.
            Uma aba do Licitagram vai abrir mostrando{' '}
            <strong className="text-emerald-500">✅ Conta conectada</strong> com seu
            CNPJ. Pronto, está tudo configurado.
          </p>
        </Step>

        <SecurityNote>
          Seu CPF e senha do gov.br <strong>NUNCA</strong> são salvos no Licitagram.
          Guardamos apenas uma chave temporária de autorização, que renova automaticamente
          enquanto você usa o sistema.
        </SecurityNote>
      </Section>

      {/* Parte 2 — Agendar */}
      <Section title="Parte 2 — Agendar um pregão">
        <h3 className="mt-2 text-sm font-semibold text-foreground">
          Antes de começar, tenha em mãos:
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          <Li emoji="🔢">
            <strong>ID do pregão</strong> — aquele número grande tipo{' '}
            <code className="font-mono text-xs">98957106000712025</code>
            <br />
            <span className="text-xs text-muted-foreground">
              Dica: entre no pregão no Compras.gov.br e copie da URL (parte{' '}
              <code className="font-mono">?compra=</code>)
            </span>
          </Li>
          <Li emoji="📅">
            <strong>Data e hora da disputa</strong> (como está no edital, horário de Brasília)
          </Li>
          <Li emoji="💰">
            <strong>Piso de preço</strong> — o menor valor pelo qual você aceita
            vencer. <strong>O robô NUNCA lança abaixo desse valor.</strong>
          </Li>
        </ul>

        <h3 className="mt-6 text-sm font-semibold text-foreground">Passo a passo:</h3>

        <Step n={1} title='Abra a aba "Agendar em Lote" no Robô de Lances'>
          <p>Você vai ver uma tabela vazia com colunas pra preencher.</p>
        </Step>

        <Step n={2} title="Preencha os campos da linha:">
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-card/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Campo</th>
                  <th className="px-3 py-2 font-medium">O que colocar</th>
                  <th className="px-3 py-2 font-medium">Exemplo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-3 py-2 font-semibold">Portal</td>
                  <td className="px-3 py-2">Seu login conectado</td>
                  <td className="px-3 py-2 font-mono text-[11px]">Compras.gov.br · sua empresa</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Pregão ID</td>
                  <td className="px-3 py-2">Número do pregão</td>
                  <td className="px-3 py-2 font-mono text-[11px]">98957106000712025</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Disputa em</td>
                  <td className="px-3 py-2">Data e hora (BRT)</td>
                  <td className="px-3 py-2 font-mono text-[11px]">25/04/2026 14:00</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Piso (R$)</td>
                  <td className="px-3 py-2">Seu preço mínimo</td>
                  <td className="px-3 py-2 font-mono text-[11px]">45000,00</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Modo</td>
                  <td className="px-3 py-2">Como o robô atua</td>
                  <td className="px-3 py-2 font-mono text-[11px]">Auto Lance</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Step>

        <Step n={3} title="Repita pra cada pregão que quer agendar">
          <p>
            Clique em <strong>+ Linha</strong> pra adicionar outro. Pode agendar até 100 de
            uma vez.
          </p>
        </Step>

        <Step n={4} title='Clique em "Agendar em lote"'>
          <p>
            Você vai ver uma confirmação com quantas sessões foram criadas, quantas ficaram
            agendadas pra depois e quantas já disparam agora.
          </p>
        </Step>

        <h3 className="mt-6 text-sm font-semibold text-foreground">
          Qual modo escolher?
        </h3>
        <div className="mt-2 space-y-2 text-sm">
          <ModeCard name="Observar" desc="Só assiste o pregão, anota tudo, não lança" when="Primeiro teste num pregão novo, pra ver se o robô interpreta tudo certo" />
          <ModeCard name="Supervisor" desc="Configura seu piso no portal e deixa o sistema nativo do Compras.gov.br lançar" when="Se você confia no auto-bid do próprio portal" />
          <ModeCard name="Auto Lance" desc="O Licitagram dispara cada lance ativamente, com estratégia inteligente" when="Modo recomendado — máxima performance" accent />
        </div>

        <Callout variant="tip">
          <strong>Recomendação:</strong> Na primeira vez usando o robô, agende o mesmo pregão
          em <strong>Observar</strong> primeiro. Depois que ver que o robô interpretou tudo
          certo, cancela essa sessão de teste e cria uma nova em <strong>Auto Lance</strong>.
        </Callout>
      </Section>

      {/* Parte 3 — Acompanhar */}
      <Section title="Parte 3 — Acompanhar ao vivo">
        <p>
          Na aba <strong>Sessões Ativas</strong> do Robô de Lances, cada pregão tem um card
          mostrando o estado atual:
        </p>

        <div className="mt-4 space-y-2 text-sm">
          <StatusRow color="violet" label="Agendado" desc="Aguardando o horário da disputa começar" />
          <StatusRow color="amber" label="Pendente" desc="Prestes a começar — sistema vai pegar em segundos" />
          <StatusRow color="blue" label="Ativo" desc="Disputando agora! Spinner azul e lances em tempo real" />
          <StatusRow color="emerald" label="Concluído" desc="Pregão terminou — total de lances registrado" />
          <StatusRow color="red" label="Falhou" desc="Erro — clique em Replay forense pra detalhes" />
        </div>

        <h3 className="mt-6 text-sm font-semibold text-foreground">
          Cada card tem botões úteis:
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>• <strong>Pausar</strong> — congela enquanto ativo (você pode retomar depois)</li>
          <li>• <strong>Iniciar agora</strong> — força início antes do horário (em caso de disputa antecipada)</li>
          <li>• <strong>Cancelar</strong> — mata a sessão permanentemente</li>
          <li>• <strong>Replay forense</strong> — timeline detalhada de tudo que aconteceu (cada lance, cada decisão)</li>
        </ul>
      </Section>

      {/* Parte 4 — CSV */}
      <Section title="Parte 4 — Importar vários pregões de uma vez (CSV)">
        <p>
          Se você tem muitos pregões pra cadastrar, clique em <strong>Importar CSV</strong> na
          aba "Agendar em Lote" e use este formato:
        </p>

        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card/60 p-3 font-mono text-[11px] leading-relaxed">{`config_id,pregao_id,scheduled_at,min_price,mode
[SEU ID],98957106000712025,2026-04-25 14:00,45000,auto_bid
[SEU ID],12345678000902025,2026-04-26 09:30,120000,supervisor
[SEU ID],55566677000122025,2026-04-27 15:00,38000,auto_bid`}</pre>

        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>• Separador pode ser vírgula (<code>,</code>) ou ponto-e-vírgula (<code>;</code>)</li>
          <li>• Data pode ser ISO (<code>2026-04-25T14:00</code>) ou BR (<code>2026-04-25 14:00</code>)</li>
          <li>• Se deixar <code>config_id</code> vazio, usa seu portal padrão</li>
          <li>• Até 100 pregões por importação</li>
        </ul>
      </Section>

      {/* Regras */}
      <Section title="Regras de segurança (já ativas por padrão)">
        <div className="mt-2 space-y-2">
          <Rule emoji="🛡️" title="Piso é lei" desc="Nunca lança abaixo do seu piso, nem se o mercado forçar" />
          <Rule emoji="⚡" title="Limite de velocidade" desc="Máximo 2 lances por 100ms (evita banimento do portal)" />
          <Rule emoji="🔄" title="Anti-duplicata" desc="Espera 6 segundos após cada lance pra não spammar o item" />
          <Rule emoji="🔑" title="Renovação automática" desc="Enquanto possível, renova sua autorização sozinho" />
          <Rule emoji="⏰" title="Teto de 6 horas" desc="Se o pregão durar mais, sessão termina sozinha (proteção)" />
          <Rule emoji="📝" title="Auditoria completa" desc="Cada lance, decisão e erro fica registrado pra conferência" />
        </div>
      </Section>

      {/* FAQ */}
      <Section title="Perguntas frequentes">
        <FAQ q="🤔 Meu login do gov.br tem autenticação em 2 fatores (2FA). O robô pega isso?">
          Não precisa. Você faz o login normal no navegador (inclusive 2FA se tiver) e o atalho
          só captura a autorização depois que você já está logado. O robô usa essa autorização,
          sem precisar saber sua senha nem 2FA.
        </FAQ>

        <FAQ q="🔐 Meus dados estão seguros?">
          <ul className="mt-1 space-y-1 pl-4">
            <li>• Sua senha <strong>nunca</strong> é salva (nem seu CPF)</li>
            <li>• A chave de autorização fica criptografada no banco (padrão AES-256-GCM)</li>
            <li>• A chave expira sozinha (algumas horas) e renova automaticamente</li>
            <li>• Só sua empresa tem acesso aos seus dados</li>
          </ul>
        </FAQ>

        <FAQ q="⏱️ Quanto tempo vale a conexão?">
          A autorização do Compras.gov.br dura algumas horas (geralmente 4 a 8). O robô renova
          automaticamente enquanto você tem o "refresh token" válido. Se passar muito tempo sem
          usar (dias), vai precisar reconectar — o sistema avisa quando isso acontece.
        </FAQ>

        <FAQ q="📉 E se o mercado cair muito rápido?">
          O robô acompanha, mas respeita seu piso (nunca abaixo), o intervalo mínimo do edital
          (o portal pode exigir decremento mínimo) e o limite de 2 lances por 100ms. Se o mercado
          passar abaixo do seu piso, ele simplesmente para de lançar — mostrando "⛔ Bloqueio de Chão"
          no card.
        </FAQ>

        <FAQ q="💸 O robô pode me fazer vencer por um valor absurdamente baixo?">
          <strong>Não.</strong> Seu piso é a proteção absoluta. O robô nunca lança abaixo dele,
          nem se for pra ficar em 1º lugar. Isso é validado antes de cada tentativa de lance.
        </FAQ>

        <FAQ q="🆘 E se der erro no meio do pregão?">
          O sistema tenta se recuperar automaticamente (até 3 vezes). Se falhar definitivamente,
          marca a sessão como "Falhou" com a mensagem explicando. Erros comuns:
          <ul className="mt-1 space-y-1 pl-4">
            <li>• <strong>Token expirado</strong> → reconecte na aba "Conectar Conta Gov.br"</li>
            <li>• <strong>Portal fora do ar</strong> → raro, aguarde e agende de novo</li>
            <li>• <strong>Item não encontrado</strong> → pregão foi cancelado</li>
          </ul>
          Tudo fica no histórico pra você revisar depois.
        </FAQ>

        <FAQ q="🔄 Posso editar uma sessão agendada?">
          Você pode <strong>pausar</strong> ou <strong>cancelar</strong> uma sessão. Se precisar
          mudar piso ou estratégia, cancele e agende nova — leva 10 segundos.
        </FAQ>
      </Section>

      {/* Suporte */}
      <Section title="Suporte">
        <ul className="space-y-1 text-sm">
          <li>📧 <strong>Email:</strong> suporte@licitagram.com.br</li>
          <li>💬 <strong>WhatsApp:</strong> dentro do app, botão "Ajuda"</li>
        </ul>

        <div className="mt-4 rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Antes de pedir suporte, confira:</strong>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>Sua conta está conectada? (aba "Conectar Conta Gov.br" mostra ✅?)</li>
            <li>Sua assinatura está ativa?</li>
            <li>Tem erro na sessão? Olhe o "Replay forense" pra detalhes.</li>
          </ol>
        </div>
      </Section>

      {/* Rodapé */}
      <footer className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground print:border-t-2 print:border-black">
        <p className="font-semibold text-foreground print:text-black">
          Licitagram — Vender pra governo ficou fácil.
        </p>
        <p className="mt-1">Guia v1.0 — Abril/2026</p>
      </footer>
    </div>
  )
}

// ─── Componentes ──────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10 break-inside-avoid print:mb-8">
      <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground print:text-black">
        {title}
      </h2>
      {subtitle && <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="text-sm leading-relaxed text-foreground/90 print:text-black">{children}</div>
    </section>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex gap-3 break-inside-avoid">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand print:border print:border-black print:bg-transparent print:text-black">
        {n}
      </span>
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-foreground print:text-black">{title}</h3>
        <div className="mt-1 text-sm text-muted-foreground print:text-black">{children}</div>
      </div>
    </div>
  )
}

function Li({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0">{emoji}</span>
      <span>{children}</span>
    </li>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
      {children}
    </kbd>
  )
}

function Callout({
  children,
  variant = 'info',
}: {
  children: React.ReactNode
  variant?: 'info' | 'tip'
}) {
  const color = variant === 'tip' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-brand/30 bg-brand/5'
  return (
    <div className={`my-4 rounded-lg border ${color} p-3 text-sm`}>{children}</div>
  )
}

function SecurityNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <strong className="text-amber-400">⚠️ Sobre sua segurança:</strong>{' '}
      <span className="text-amber-400/90">{children}</span>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 rounded border-l-2 border-primary/40 bg-primary/5 px-2 py-1 text-[11px] text-muted-foreground">
      💡 {children}
    </p>
  )
}

function ModeCard({ name, desc, when, accent }: { name: string; desc: string; when: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${accent ? 'border-brand/40 bg-brand/5' : 'border-border bg-card/40'}`}
    >
      <p className="text-sm font-semibold text-foreground print:text-black">
        {name}
        {accent && <span className="ml-2 text-[10px] font-normal text-brand">★ recomendado</span>}
      </p>
      <p className="mt-0.5 text-xs">{desc}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        <strong>Quando usar:</strong> {when}
      </p>
    </div>
  )
}

function StatusRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  const dot: Record<string, string> = {
    violet: 'bg-violet-500',
    amber: 'bg-amber-500',
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    red: 'bg-red-500',
  }
  return (
    <div className="flex items-center gap-3 rounded border border-border bg-card/40 px-3 py-2">
      <span className={`block h-2.5 w-2.5 rounded-full ${dot[color] || 'bg-gray-500'}`} />
      <div className="flex-1">
        <p className="text-xs font-semibold text-foreground print:text-black">{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

function Rule({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex gap-3 rounded border border-border bg-card/40 px-3 py-2">
      <span className="shrink-0 text-lg">{emoji}</span>
      <div>
        <p className="text-xs font-semibold text-foreground print:text-black">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 break-inside-avoid rounded-lg border border-border bg-card/40 p-3">
      <h3 className="text-sm font-semibold text-foreground print:text-black">{q}</h3>
      <div className="mt-1 text-xs text-muted-foreground">{children}</div>
    </div>
  )
}
