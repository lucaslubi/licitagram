// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Lance {
  id: string
  tempo: string
  valor: number
  tipo: 'nosso' | 'concorrente' | 'sistema'
  executado_por: 'robo' | 'manual' | 'sistema'
  posicao_apos: number
  empresa?: string
}

interface EstadoDisputa {
  fase: 'aguardando' | 'lances' | 'encerrado'
  nosso_lance: number
  melhor_lance: number
  nossa_posicao: number
  total_concorrentes: number
  lances_executados: number
  lances_max: number
  tempo_restante?: string
  status_robo: 'ativo' | 'pausado' | 'standby' | 'encerrado'
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const lancesMock: Lance[] = [
  { id: '1', tempo: '10:04:22', valor: 210000, tipo: 'sistema', executado_por: 'sistema', posicao_apos: 0, empresa: 'Sistema' },
  { id: '2', tempo: '10:04:35', valor: 198000, tipo: 'concorrente', executado_por: 'sistema', posicao_apos: 1, empresa: 'EQUATORIAL GOIAS' },
  { id: '3', tempo: '10:05:02', valor: 195000, tipo: 'nosso', executado_por: 'robo', posicao_apos: 1 },
  { id: '4', tempo: '10:05:48', valor: 193000, tipo: 'concorrente', executado_por: 'sistema', posicao_apos: 2, empresa: 'EQUATORIAL GOIAS' },
  { id: '5', tempo: '10:06:19', valor: 191000, tipo: 'nosso', executado_por: 'robo', posicao_apos: 1 },
  { id: '6', tempo: '10:07:02', valor: 189500, tipo: 'concorrente', executado_por: 'sistema', posicao_apos: 2, empresa: 'TELEFONICA BRASIL' },
  { id: '7', tempo: '10:07:38', valor: 187000, tipo: 'nosso', executado_por: 'robo', posicao_apos: 1 },
]

const estadoInicial: EstadoDisputa = {
  fase: 'lances',
  nosso_lance: 187000,
  melhor_lance: 187000,
  nossa_posicao: 1,
  total_concorrentes: 5,
  lances_executados: 3,
  lances_max: 20,
  status_robo: 'ativo',
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; label: string; pulse: boolean }> = {
    ativo: { color: '#f97316', label: '🤖 ROBÔ ATIVO', pulse: true },
    pausado: { color: '#eab308', label: '⏸ PAUSADO', pulse: false },
    standby: { color: '#3b82f6', label: '◉ STANDBY', pulse: true },
    encerrado: { color: '#64748b', label: '■ ENCERRADO', pulse: false },
  }
  const c = cfg[status] || cfg.encerrado
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: `${c.color}18`, border: `1px solid ${c.color}44`,
      borderRadius: 6, padding: '6px 14px',
    }}>
      {c.pulse && <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, animation: 'pulse 1.2s infinite' }} />}
      <span style={{ fontSize: 11, fontWeight: 800, color: c.color, letterSpacing: 2 }}>{c.label}</span>
    </div>
  )
}

function PosicaoIndicator({ pos, total }: { pos: number; total: number }) {
  const color = pos === 1 ? '#f97316' : pos === 2 ? '#eab308' : '#ef4444'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        border: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}12`,
        animation: pos === 1 ? 'glow 2s infinite' : 'none',
      }}>
        <span style={{ fontSize: 32, fontWeight: 900, color, fontFamily: '"IBM Plex Mono", monospace' }}>{pos}º</span>
      </div>
      <span style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>DE {total} LICITANTES</span>
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function PregaoLive() {
  const [estado, setEstado] = useState<EstadoDisputa>(estadoInicial)
  const [lances, setLances] = useState<Lance[]>(lancesMock)
  const [manualValue, setManualValue] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'error' } | null>(null)
  const [clock, setClock] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Simular novos lances chegando
  useEffect(() => {
    if (estado.fase !== 'lances' || estado.status_robo === 'encerrado') return

    const id = setInterval(() => {
      const isNosso = Math.random() > 0.6
      const lastVal = lances[lances.length - 1]?.valor || estado.nosso_lance
      const newVal = Math.round(lastVal * (0.988 + Math.random() * 0.008))

      if (newVal < 165000) {
        clearInterval(id)
        setEstado(p => ({ ...p, fase: 'encerrado', status_robo: 'encerrado' }))
        setToast({ msg: estado.nossa_posicao === 1 ? '🏆 VOCÊ GANHOU O PREGÃO!' : '📊 Pregão encerrado — veja o resultado', type: estado.nossa_posicao === 1 ? 'success' : 'warning' })
        return
      }

      const newLance: Lance = {
        id: String(Date.now()),
        tempo: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
        valor: newVal,
        tipo: isNosso ? 'nosso' : 'concorrente',
        executado_por: isNosso ? 'robo' : 'sistema',
        posicao_apos: isNosso ? 1 : 2,
        empresa: isNosso ? undefined : ['EQUATORIAL GOIAS', 'TELEFONICA BRASIL', 'GOVBRASIL TECH'][Math.floor(Math.random() * 3)],
      }

      setLances(p => [...p, newLance])
      setEstado(p => ({
        ...p,
        nosso_lance: isNosso ? newVal : p.nosso_lance,
        melhor_lance: newVal,
        nossa_posicao: isNosso ? 1 : (Math.random() > 0.5 ? 2 : p.nossa_posicao),
        lances_executados: isNosso ? p.lances_executados + 1 : p.lances_executados,
      }))

      if (!isNosso && Math.random() > 0.7) {
        setToast({ msg: `⚡ Superado por ${newLance.empresa} — robô contra-atacando`, type: 'warning' })
      }
    }, 4000 + Math.random() * 4000)

    return () => clearInterval(id)
  }, [estado.fase, estado.status_robo])

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [lances])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const toggleRobo = () => {
    const next = estado.status_robo === 'ativo' ? 'pausado' : 'ativo'
    setEstado(p => ({ ...p, status_robo: next }))
    setToast({ msg: next === 'ativo' ? '🤖 Robô retomado' : '⏸ Robô pausado — modo manual ativo', type: 'warning' })
  }

  const darLanceManual = () => {
    const val = parseFloat(manualValue.replace(/\D/g, ''))
    if (!val || val < estado.melhor_lance * 0.7) return

    const novoLance: Lance = {
      id: String(Date.now()),
      tempo: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      valor: val,
      tipo: 'nosso',
      executado_por: 'manual',
      posicao_apos: val < estado.melhor_lance ? 1 : 2,
    }
    setLances(p => [...p, novoLance])
    setEstado(p => ({
      ...p,
      nosso_lance: val,
      melhor_lance: Math.min(p.melhor_lance, val),
      nossa_posicao: val < p.melhor_lance ? 1 : p.nossa_posicao,
      lances_executados: p.lances_executados + 1,
    }))
    setManualValue('')
    setToast({ msg: `✓ Lance manual de ${fmt(val)} executado`, type: 'success' })
  }

  const diferenca = estado.nosso_lance - estado.melhor_lance
  const progressPct = (estado.lances_executados / estado.lances_max) * 100

  const s: Record<string, React.CSSProperties> = {
    root: {
      background: '#08090e',
      minHeight: '100vh',
      color: '#e2e8f0',
      fontFamily: '"IBM Plex Mono", "Courier New", monospace',
      display: 'flex', flexDirection: 'column',
    },
    header: {
      background: '#0a0b12',
      borderBottom: '1px solid #ffffff0a',
      padding: '12px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    main: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      gap: 1,
      background: '#ffffff08',
    },
    leftCol: {
      background: '#0a0b12',
      padding: 28,
      display: 'flex', flexDirection: 'column', gap: 24,
    },
    rightCol: {
      background: '#070810',
      display: 'flex', flexDirection: 'column',
    },
    metricGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12,
    },
    metricCard: {
      background: '#0f1018',
      border: '1px solid #ffffff08',
      borderRadius: 10,
      padding: '16px 18px',
    },
    metricLabel: { fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' as const },
    metricValue: { fontSize: 22, fontWeight: 800, letterSpacing: 1, fontFamily: '"IBM Plex Mono", monospace' },
    metricSub: { fontSize: 10, color: '#475569', marginTop: 4 },
    feedHeader: {
      padding: '14px 20px',
      borderBottom: '1px solid #ffffff08',
      fontSize: 10, color: '#334155', letterSpacing: 2,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    feed: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '8px 0',
    },
    lanceRow: (tipo: string): React.CSSProperties => ({
      padding: '10px 20px',
      borderBottom: '1px solid #ffffff04',
      display: 'flex', alignItems: 'center', gap: 12,
      background: tipo === 'nosso' ? '#f9731608' : 'transparent',
      borderLeft: `3px solid ${tipo === 'nosso' ? '#f97316' : tipo === 'concorrente' ? '#ef444430' : '#334155'}`,
    }),
    controlArea: {
      padding: 20,
      borderTop: '1px solid #ffffff08',
      display: 'flex', flexDirection: 'column', gap: 12,
    },
    manualInput: {
      display: 'flex', gap: 8,
    },
    input: {
      flex: 1, background: '#ffffff08', border: '1px solid #ffffff12',
      borderRadius: 6, padding: '10px 14px',
      color: '#f1f5f9', fontSize: 13, fontFamily: '"IBM Plex Mono", monospace',
      outline: 'none',
    },
    btn: (color: string, bg: string): React.CSSProperties => ({
      padding: '10px 18px', borderRadius: 6, cursor: 'pointer',
      background: bg, border: `1px solid ${color}44`,
      color, fontSize: 11, fontWeight: 700, letterSpacing: 1,
    }),
  }

  return (
    <div style={s.root}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes glow { 0%,100%{box-shadow:0 0 0 0 #f9731640} 50%{box-shadow:0 0 0 12px transparent} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e293b; }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', top: 70, right: 24, zIndex: 100,
          background: toast.type === 'success' ? '#22c55e18' : toast.type === 'error' ? '#ef444418' : '#f9731618',
          border: `1px solid ${toast.type === 'success' ? '#22c55e44' : toast.type === 'error' ? '#ef444444' : '#f9731644'}`,
          borderRadius: 8, padding: '12px 20px',
          fontSize: 12, fontWeight: 700,
          color: toast.type === 'success' ? '#22c55e' : toast.type === 'error' ? '#ef4444' : '#f97316',
          animation: 'slideIn 0.2s ease-out',
          maxWidth: 360,
        }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: estado.fase === 'lances' ? '#22c55e' : '#ef4444', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#64748b' }}>LICITAGRAM</span>
          <span style={{ color: '#1e293b' }}>|</span>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>Câmara Municipal · Pregão Eletrônico · PNCP</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <StatusBadge status={estado.status_robo} />
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', letterSpacing: 3, fontFamily: 'monospace' }}>{clock}</div>
        </div>
      </div>

      <div style={s.main}>

        {/* LEFT — MÉTRICAS + CONTROLES */}
        <div style={s.leftCol}>

          {/* MÉTRICAS PRINCIPAIS */}
          <div style={s.metricGrid}>
            <div style={{ ...s.metricCard, border: '1px solid #f9731622' }}>
              <div style={s.metricLabel}>Nosso lance</div>
              <div style={{ ...s.metricValue, color: '#f97316' }}>{fmt(estado.nosso_lance)}</div>
              <div style={s.metricSub}>
                {diferenca === 0 ? '= melhor lance' : `${fmt(Math.abs(diferenca))} ${diferenca > 0 ? 'acima' : 'abaixo'} do melhor`}
              </div>
            </div>

            <div style={{ ...s.metricCard, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PosicaoIndicator pos={estado.nossa_posicao} total={estado.total_concorrentes} />
            </div>

            <div style={{ ...s.metricCard, border: '1px solid #3b82f622' }}>
              <div style={s.metricLabel}>Melhor lance</div>
              <div style={{ ...s.metricValue, color: '#3b82f6' }}>{fmt(estado.melhor_lance)}</div>
              <div style={s.metricSub}>Menor valor da disputa</div>
            </div>
          </div>

          {/* PROGRESSO DE LANCES */}
          <div style={{ background: '#0f1018', border: '1px solid #ffffff08', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: '#334155', letterSpacing: 2 }}>LANCES EXECUTADOS PELO ROBÔ</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#f97316', fontFamily: 'monospace' }}>
                {estado.lances_executados}/{estado.lances_max}
              </span>
            </div>
            <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${progressPct}%`,
                background: progressPct > 75 ? '#ef4444' : progressPct > 50 ? '#f97316' : '#22c55e',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 9, color: '#334155' }}>0</span>
              <span style={{ fontSize: 9, color: progressPct > 75 ? '#ef4444' : '#334155' }}>
                {progressPct > 75 ? '⚠ Próximo do limite' : `${estado.lances_max - estado.lances_executados} restantes`}
              </span>
              <span style={{ fontSize: 9, color: '#334155' }}>{estado.lances_max}</span>
            </div>
          </div>

          {/* FASE DA DISPUTA */}
          <div style={{ background: '#0f1018', border: '1px solid #ffffff08', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 12 }}>FASE DA DISPUTA</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['Abertura', 'Lances', 'Negociação', 'Resultado'] as const).map((fase, i) => {
                const ativo = i === 1
                const done = i === 0
                return (
                  <div key={fase} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 6, textAlign: 'center',
                    background: ativo ? '#f9731618' : done ? '#22c55e12' : '#ffffff04',
                    border: `1px solid ${ativo ? '#f9731644' : done ? '#22c55e33' : '#ffffff08'}`,
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: ativo ? '#f97316' : done ? '#22c55e' : '#334155' }}>
                      {done ? '✓' : ativo ? '●' : '○'}
                    </div>
                    <div style={{ fontSize: 9, color: ativo ? '#f97316' : done ? '#22c55e' : '#334155', marginTop: 4 }}>{fase}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* CONTROLES */}
          <div style={{ background: '#0f1018', border: '1px solid #ffffff08', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ fontSize: 9, color: '#334155', letterSpacing: 2, marginBottom: 14 }}>CONTROLES</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <button style={s.btn(estado.status_robo === 'ativo' ? '#eab308' : '#22c55e', 'transparent')}
                onClick={toggleRobo}>
                {estado.status_robo === 'ativo' ? '⏸ PAUSAR ROBÔ' : '▶ RETOMAR ROBÔ'}
              </button>
              <button style={s.btn('#ef4444', 'transparent')}
                onClick={() => setEstado(p => ({ ...p, fase: 'encerrado', status_robo: 'encerrado' }))}>
                ■ ENCERRAR
              </button>
            </div>

            <div style={{ fontSize: 9, color: '#334155', letterSpacing: 1, marginBottom: 8 }}>LANCE MANUAL</div>
            <div style={s.manualInput}>
              <input
                type="number"
                placeholder="Ex: 185000"
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && darLanceManual()}
                style={s.input}
              />
              <button
                style={{ ...s.btn('#f97316', '#f9731618'), padding: '10px 20px', border: '1px solid #f9731644' }}
                onClick={darLanceManual}
              >
                ENVIAR
              </button>
            </div>
            <div style={{ fontSize: 9, color: '#1e293b', marginTop: 6 }}>
              Pressione Enter ou clique em Enviar para dar um lance manual
            </div>
          </div>

        </div>

        {/* RIGHT — FEED DE LANCES */}
        <div style={s.rightCol}>
          <div style={s.feedHeader}>
            <span>◈ FEED DE LANCES</span>
            <span style={{ color: '#f97316' }}>{lances.length} lances</span>
          </div>

          <div ref={feedRef} style={s.feed}>
            {lances.map((l, i) => (
              <div key={l.id} style={s.lanceRow(l.tipo)}>
                {/* Indicador */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: l.tipo === 'nosso' ? '#f97316' : l.tipo === 'concorrente' ? '#ef4444' : '#334155',
                  animation: i === lances.length - 1 ? 'pulse 0.5s 3' : 'none',
                }} />

                {/* Conteúdo */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{
                      fontSize: 14, fontWeight: 800,
                      color: l.tipo === 'nosso' ? '#f97316' : l.tipo === 'concorrente' ? '#ef4444' : '#475569',
                      fontFamily: 'monospace',
                    }}>
                      {fmt(l.valor)}
                    </span>
                    <span style={{ fontSize: 9, color: '#334155' }}>{l.tempo}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: 1,
                      color: l.tipo === 'nosso' ? '#f9731688' : l.tipo === 'concorrente' ? '#ef444488' : '#33415588',
                    }}>
                      {l.tipo === 'nosso' ? `NOSSO · ${l.executado_por === 'robo' ? '🤖 ROBÔ' : '👤 MANUAL'}` :
                       l.tipo === 'concorrente' ? l.empresa?.toUpperCase() : 'SISTEMA'}
                    </span>
                    {l.posicao_apos > 0 && (
                      <span style={{ fontSize: 9, color: l.posicao_apos === 1 ? '#22c55e' : '#64748b' }}>
                        → {l.posicao_apos}º lugar
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Indicador "ao vivo" */}
            {estado.fase === 'lances' && (
              <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'pulse 1s infinite' }} />
                <span style={{ fontSize: 9, color: '#334155' }}>Aguardando próximo lance...</span>
              </div>
            )}

            {estado.fase === 'encerrado' && (
              <div style={{
                margin: 16, padding: '16px 20px', borderRadius: 8,
                background: estado.nossa_posicao === 1 ? '#22c55e12' : '#ef444412',
                border: `1px solid ${estado.nossa_posicao === 1 ? '#22c55e33' : '#ef444433'}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{estado.nossa_posicao === 1 ? '🏆' : '📊'}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: estado.nossa_posicao === 1 ? '#22c55e' : '#ef4444', letterSpacing: 2, marginBottom: 6 }}>
                  {estado.nossa_posicao === 1 ? 'PREGÃO VENCIDO' : 'PREGÃO ENCERRADO'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {estado.nossa_posicao === 1
                    ? `Lance vencedor: ${fmt(estado.nosso_lance)}`
                    : `Posição final: ${estado.nossa_posicao}º lugar`
                  }
                </div>
              </div>
            )}
          </div>

          {/* MINI STATS BOTTOM */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #ffffff06', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Lances nossos', val: lances.filter(l => l.tipo === 'nosso').length },
              { label: 'Concorrentes', val: lances.filter(l => l.tipo === 'concorrente').length },
              { label: 'Total lances', val: lances.length },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#334155', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#475569', fontFamily: 'monospace' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
