'use client'

import { useEffect, useState } from 'react'

/**
 * Demonstração interativa do Robô de Lances — cliente assiste e entende
 * sem precisar conectar conta. Simula o fluxo real com dados mock e
 * animações CSS.
 *
 * Cenas:
 *   1. Intro — "o que é o robô" com 3 números de impacto
 *   2. Conectar conta (screenshot estilizado do bookmarklet)
 *   3. Configurar itens — modal simulado com items aparecendo 1 a 1
 *   4. Robô em ação — lances caindo em tempo real (simulação)
 *   5. Resultado — você ganhou!
 *   6. CTA — "começar agora"
 */

interface Item {
  numero: number
  descricao: string
  piso: number
  ativo: boolean
  lancando?: boolean
  melhorLance?: number
  seuLance?: number
  posicao?: 1 | 99
}

const DEMO_ITEMS: Item[] = [
  { numero: 1, descricao: 'Caneta esferográfica azul', piso: 1.8, ativo: true },
  { numero: 2, descricao: 'Papel A4 75g, pacote 500 folhas', piso: 22, ativo: true },
  { numero: 3, descricao: 'Pasta cartão duplex', piso: 3.5, ativo: true },
  { numero: 4, descricao: 'Notebook i5 8GB SSD 256GB', piso: 2900, ativo: true },
  { numero: 5, descricao: 'Monitor LED 24" Full HD', piso: 700, ativo: true },
  { numero: 6, descricao: 'Cadeira ergonômica mesh', piso: 390, ativo: true },
  { numero: 7, descricao: 'Mesa 1.20m MDF', piso: 300, ativo: false },
  { numero: 8, descricao: 'Tóner HP LaserJet', piso: 270, ativo: true },
]

type Cena = 'intro' | 'conectar' | 'configurar' | 'disputa' | 'vitoria'

export function DemoClient() {
  const [cena, setCena] = useState<Cena>('intro')
  const [items, setItems] = useState<Item[]>(DEMO_ITEMS)
  const [loaded, setLoaded] = useState<number>(0) // quantos itens apareceram
  const [cycle, setCycle] = useState<number>(0)

  // Cena configurar: itens aparecem 1 a 1 com delay
  useEffect(() => {
    if (cena !== 'configurar') {
      setLoaded(0)
      return
    }
    if (loaded >= DEMO_ITEMS.length) return
    const t = setTimeout(() => setLoaded((n) => n + 1), 400)
    return () => clearTimeout(t)
  }, [cena, loaded])

  // Cena disputa: simula lances caindo em todos os itens ativos
  useEffect(() => {
    if (cena !== 'disputa') return
    const t = setInterval(() => {
      setItems((arr) =>
        arr.map((it) => {
          if (!it.ativo) return it
          const mercadoAtual = it.melhorLance ?? it.piso * 3
          const novo = Math.max(it.piso, mercadoAtual * (0.92 + Math.random() * 0.04))
          return {
            ...it,
            lancando: true,
            melhorLance: Number(novo.toFixed(2)),
            seuLance: Number(novo.toFixed(2)),
            posicao: 1,
          }
        }),
      )
      setCycle((c) => c + 1)
    }, 900)
    return () => clearInterval(t)
  }, [cena])

  const goVitoria = () => {
    setCena('vitoria')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Topo */}
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              Licitagram · Demonstração
            </p>
            <h1 className="mt-1 text-lg font-semibold">Robô de Lances em ação</h1>
          </div>
          <a
            href="/bot"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
          >
            Ir pro produto real →
          </a>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="mx-auto max-w-5xl p-6">
        {/* Stepper */}
        <div className="mb-8 flex flex-wrap gap-2 text-xs">
          {(['intro', 'conectar', 'configurar', 'disputa', 'vitoria'] as Cena[]).map(
            (c, idx) => {
              const active = cena === c
              const label = {
                intro: 'Introdução',
                conectar: '1. Conectar',
                configurar: '2. Configurar',
                disputa: '3. Operar',
                vitoria: '4. Vencer',
              }[c]
              return (
                <button
                  key={c}
                  onClick={() => setCena(c)}
                  className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                    active
                      ? 'bg-brand text-white'
                      : idx <= ['intro', 'conectar', 'configurar', 'disputa', 'vitoria'].indexOf(cena)
                        ? 'border border-brand/30 bg-brand/10 text-brand'
                        : 'border border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {label}
                </button>
              )
            },
          )}
        </div>

        {/* Cena: intro */}
        {cena === 'intro' && (
          <section className="space-y-8">
            <div className="text-center">
              <h2 className="font-display text-4xl font-bold tracking-tight">
                Seu robô de lances em <span className="text-brand">5 passos</span>
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                Automatiza os lances nos pregões do Compras.gov.br. Você define o piso, o robô
                faz o resto em milissegundos.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Stat number="50ms" label="por lance" desc="vs 3-5s de um humano" />
              <Stat number="24/7" label="operando" desc="acorda sozinho no horário da disputa" />
              <Stat number="100%" label="seu controle" desc="nunca lança abaixo do seu piso" />
            </div>

            <div className="text-center">
              <button
                onClick={() => setCena('conectar')}
                className="rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Ver como funciona →
              </button>
            </div>
          </section>
        )}

        {/* Cena: conectar */}
        {cena === 'conectar' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold">Passo 1 — Conectar sua conta (uma vez só)</h2>
            <p className="text-sm text-muted-foreground">
              Você arrasta um botão pra barra de favoritos. Depois que estiver logado no
              Compras.gov.br, clica nele e pronto — o robô tem autorização.
            </p>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand font-bold">
                  1
                </span>
                <p className="text-sm font-medium">Gerar atalho único no Licitagram</p>
              </div>
              <div className="ml-11 rounded-lg border-2 border-orange-500/50 bg-orange-500/10 px-5 py-3 inline-block">
                <span className="text-base font-semibold text-orange-300">📌 Conectar Licitagram</span>
              </div>
              <p className="mt-2 ml-11 text-xs text-muted-foreground">↑ arrastar pra barra de favoritos</p>

              <div className="mt-6 mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand font-bold">
                  2
                </span>
                <p className="text-sm font-medium">Abrir Compras.gov.br, fazer login, clicar no atalho</p>
              </div>

              <div className="ml-11 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-sm font-medium text-emerald-400">✅ Conta conectada</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">CNPJ 30.845.576/0001-10</p>
                <p className="text-xs text-muted-foreground">Fornecedor Exemplo S/A</p>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400/90">
              🔒 <strong>Seu CPF e senha nunca são guardados.</strong> A gente só fica com uma chave
              temporária (tipo cartão de acesso) que renova automaticamente.
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setCena('configurar')}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Próximo: configurar pregão →
              </button>
            </div>
          </section>
        )}

        {/* Cena: configurar */}
        {cena === 'configurar' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold">Passo 2 — Configurar um pregão</h2>
            <p className="text-sm text-muted-foreground">
              Informa o ID do pregão, clica em <strong>"Configurar por item"</strong>, o sistema
              busca os itens no Compras.gov.br e você define o piso de cada um.
            </p>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 font-mono text-xs tabular-nums text-muted-foreground">
                Pregão: 16818585900042026 · Disputa: 25/04/2026 14:00
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-card/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2 text-center">✓</th>
                      <th className="w-10 px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Descrição</th>
                      <th className="w-24 px-2 py-2 text-right">Piso R$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_ITEMS.slice(0, loaded).map((it) => (
                      <tr
                        key={it.numero}
                        className={`border-t border-border/60 ${!it.ativo ? 'opacity-40' : ''} animate-slide-in`}
                      >
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={it.ativo} readOnly className="h-4 w-4" />
                        </td>
                        <td className="px-2 py-2 font-mono tabular-nums">{it.numero}</td>
                        <td className="px-2 py-2">{it.descricao}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          R$ {it.piso.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {loaded < DEMO_ITEMS.length && (
                      <tr>
                        <td colSpan={4} className="py-3 text-center text-[10px] text-muted-foreground">
                          Buscando itens no Compras.gov.br…
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                💡 Cliente pode desmarcar itens que não quer operar (exemplo: item #7 está
                desativado — robô ignora).
              </p>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCena('conectar')}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
              >
                ← Voltar
              </button>
              <button
                onClick={() => setCena('disputa')}
                disabled={loaded < DEMO_ITEMS.length}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Próximo: ver o robô operando →
              </button>
            </div>
          </section>
        )}

        {/* Cena: disputa */}
        {cena === 'disputa' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold">
              Passo 3 — Robô em ação <span className="text-xs text-emerald-400">● disputa ao vivo</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Chegou a hora da disputa. O robô entra sozinho, vê todos os itens em tempo real e
              dispara lances em milissegundos respeitando seu piso. Ciclo #{cycle}.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              {items
                .filter((i) => i.ativo)
                .map((it) => {
                  const ganhando = it.posicao === 1
                  return (
                    <div
                      key={it.numero}
                      className={`rounded-lg border p-3 transition-all ${
                        ganhando
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            #{it.numero} · {it.descricao}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            piso R$ {it.piso.toFixed(2)}
                          </p>
                        </div>
                        {ganhando && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                            🏆 1º
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">seu lance:</span>
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {it.seuLance != null ? `R$ ${it.seuLance.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      {it.lancando && (
                        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-border">
                          <div className="h-full animate-pulse bg-brand" style={{ width: '100%' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>

            <div className="rounded-lg border border-border bg-card/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              <div>[LOG] {cycle * 900}ms — scan da sala: 7 itens em disputa</div>
              <div>[LOG] {cycle * 900 + 120}ms — item 1 mercado R$ {(items[0].melhorLance ?? items[0].piso * 3).toFixed(2)}, lançando R$ {items[0].seuLance?.toFixed(2) ?? '—'}</div>
              <div>[LOG] {cycle * 900 + 180}ms — item 4 mercado R$ {(items[3].melhorLance ?? items[3].piso * 3).toFixed(2)}, lançando R$ {items[3].seuLance?.toFixed(2) ?? '—'}</div>
              <div className="text-emerald-400">[LOG] {cycle * 900 + 250}ms — ✅ lances aceitos pelo portal</div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCena('configurar')}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
              >
                ← Voltar
              </button>
              <button
                onClick={goVitoria}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Pregão encerrado →
              </button>
            </div>
          </section>
        )}

        {/* Cena: vitoria */}
        {cena === 'vitoria' && (
          <section className="space-y-8 text-center">
            <div className="text-6xl">🏆</div>
            <h2 className="font-display text-4xl font-bold">Você venceu 6 de 7 itens!</h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">
              O robô fez {cycle} ciclos de lance em segundos. Seu piso foi respeitado em 100%
              dos casos. Tudo enquanto você fazia outra coisa.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              <Stat number={`${items.filter((i) => i.ativo && i.posicao === 1).length}/7`} label="itens ganhos" desc="taxa 86%" />
              <Stat number={`${cycle}`} label="lances dados" desc="em alguns segundos" />
              <Stat
                number={`R$ ${items
                  .filter((i) => i.ativo && i.seuLance)
                  .reduce((s, i) => s + (i.seuLance ?? 0), 0)
                  .toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                label="valor ganho"
                desc="contrato assinado"
              />
            </div>

            <div className="pt-4">
              <a
                href="/bot"
                className="inline-block rounded-lg bg-brand px-8 py-3 text-base font-medium text-white hover:bg-brand-dark"
              >
                Começar a usar agora →
              </a>
              <p className="mt-3 text-xs text-muted-foreground">
                Abre o Licitagram · Conecte sua conta Gov.br · Agende seus pregões
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-border px-6 py-4 text-center text-[11px] text-muted-foreground">
        Licitagram — Demonstração interativa. Dados simulados pra fins ilustrativos.
      </footer>

      <style jsx>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        :global(.animate-slide-in) {
          animation: slide-in 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}

function Stat({ number, label, desc }: { number: string; label: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-center">
      <p className="font-display text-3xl font-bold tracking-tight text-brand">{number}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
    </div>
  )
}
