'use client'

/**
 * Página pública /calculadora-consultoria — funil do programa Partners.
 * Estilo é deliberadamente distinto do app autenticado (paleta laranja
 * institucional Licitagram, sem tokens do dashboard) — é landing de
 * conversão pra consultorias parceiras.
 *
 * Lead capturado vai pra POST /api/calculadora-consultoria que persiste
 * em trial_leads com source='partners-calculator'.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react'

const ENTERPRISE_ANUAL = 1497 * 12 // R$ 17.964
const SCENARIOS = [
  { rate: 0.5, label: 'Conservador', sub: '50% automado' },
  { rate: 0.7, label: 'Realista', sub: '70% automado' },
  { rate: 0.85, label: 'Agressivo', sub: '85% automado' },
] as const

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export function CalculadoraConsultoriaClient() {
  const [clientes, setClientes] = useState(10)
  const [ticket, setTicket] = useState(2000)
  const [horas, setHoras] = useState(8)
  const [automationRate, setAutomationRate] = useState(0.7)

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const result = useMemo(() => {
    const horasTotais = clientes * horas
    const horasLiberadas = horasTotais * automationRate
    const horasPorClienteNovo = horas * (1 - automationRate)
    const novosClientes = horasPorClienteNovo > 0
      ? Math.floor(horasLiberadas / horasPorClienteNovo)
      : 0
    const totalClientes = clientes + novosClientes
    const adicionalMes = novosClientes * ticket
    const adicionalAno = adicionalMes * 12
    const roi = ENTERPRISE_ANUAL > 0 ? adicionalAno / ENTERPRISE_ANUAL : 0
    return {
      horasLiberadas: Math.round(horasLiberadas),
      novosClientes,
      totalClientes,
      adicionalAno,
      roi: roi.toFixed(1),
    }
  }, [clientes, ticket, horas, automationRate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting || submitted) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/calculadora-consultoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          clientes,
          ticket,
          horas,
          automationRate,
          projection: result,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSubmitError(data?.error || 'Não foi possível enviar agora. Tente novamente.')
        setSubmitting(false)
        return
      }
      setSubmitted(true)
    } catch {
      setSubmitError('Erro de conexão. Tente novamente.')
      setSubmitting(false)
    }
  }

  // Inject scoped styles uma vez
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (document.getElementById('calc-partners-styles')) return
    const tag = document.createElement('style')
    tag.id = 'calc-partners-styles'
    tag.textContent = STYLES
    document.head.appendChild(tag)
  }, [])

  return (
    <div className="lg-calc-root">
      <header className="lg-header">
        <div className="lg-header-inner">
          <img
            src="https://licitagram.com/assets/email/licitagram_logo_email.png"
            alt="Licitagram"
            width={160}
            height={40}
          />
          <div className="lg-header-text">
            <h1>
              Licitagram <span style={{ color: '#F57709', fontWeight: 600 }}>| Partners</span>
            </h1>
            <p>Calculadora para consultorias</p>
          </div>
        </div>
      </header>

      <section className="lg-hero">
        <p className="lg-label">Programa Partners</p>
        <h2>Quanto sua consultoria pode faturar a mais com o Licitagram?</h2>
        <p>
          Ajuste os 3 inputs abaixo com a sua realidade. Veja em tempo real o impacto no seu
          faturamento, capacidade operacional e ROI.
        </p>
        <div className="lg-hero-pill">
          <span style={{ fontSize: 18 }}>⚡</span>
          <span>
            Partners aprovados também acessam nossa base proprietária de 50.000 empresas qualificadas
          </span>
        </div>
      </section>

      <div className="lg-container">
        <div className="lg-calc-grid">
          {/* INPUTS */}
          <div className="lg-card">
            <p className="lg-card-label">Sua operação hoje</p>
            <h3 className="lg-card-title">Conte-nos sobre sua consultoria</h3>

            <div className="lg-range-group">
              <div className="lg-range-header">
                <label htmlFor="clientes">Clientes ativos hoje</label>
                <span className="lg-value">{clientes}</span>
              </div>
              <p className="lg-hint">Quantas empresas sua consultoria atende atualmente.</p>
              <input
                id="clientes"
                type="range"
                min={3}
                max={100}
                step={1}
                value={clientes}
                onChange={(e) => setClientes(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="lg-input-group">
              <label htmlFor="ticket">Ticket médio mensal por cliente</label>
              <p className="lg-hint">Quanto sua consultoria fatura, em média, por cliente por mês.</p>
              <div className="lg-input-wrapper">
                <span className="lg-prefix">R$</span>
                <input
                  id="ticket"
                  type="number"
                  min={500}
                  step={100}
                  value={ticket}
                  onChange={(e) => setTicket(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="lg-range-group">
              <div className="lg-range-header">
                <label htmlFor="horas">Horas/semana por cliente (operacional)</label>
                <span className="lg-value">{horas}h</span>
              </div>
              <p className="lg-hint">
                Tempo gasto pela equipe por cliente em monitoramento, triagem e análise manual de editais.
              </p>
              <input
                id="horas"
                type="range"
                min={2}
                max={20}
                step={1}
                value={horas}
                onChange={(e) => setHoras(parseInt(e.target.value, 10))}
              />
            </div>

            <div>
              <p className="lg-card-label" style={{ marginTop: 8 }}>Cenário de automação</p>
              <div className="lg-scenario-tabs">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.rate}
                    type="button"
                    className={`lg-scenario-tab ${automationRate === s.rate ? 'active' : ''}`}
                    onClick={() => setAutomationRate(s.rate)}
                  >
                    {s.label}
                    <br />
                    <span style={{ fontWeight: 400, fontSize: 11, color: '#9a9a9d' }}>
                      {s.sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RESULTS */}
          <div className="lg-card lg-result-card">
            <p className="lg-card-label">Sua nova realidade</p>
            <h3 className="lg-card-title">Projeção com o Licitagram</h3>

            <div className="lg-result-block">
              <p className="lg-block-label">Capacidade operacional liberada</p>
              <p className="lg-big">
                {result.horasLiberadas}h
                <span style={{ fontSize: 18, color: '#a0a0a3' }}>/semana</span>
              </p>
              <p className="lg-small">
                Horas que sua equipe deixa de gastar em trabalho operacional manual.
              </p>
            </div>

            <div className="lg-result-block">
              <p className="lg-block-label">Capacidade para novos clientes</p>
              <p className="lg-big">
                +{result.novosClientes}{' '}
                <span style={{ fontSize: 18, color: '#a0a0a3' }}>clientes sem contratar</span>
              </p>
              <p className="lg-small">
                Total atendido:{' '}
                <strong style={{ color: '#fff' }}>{result.totalClientes} clientes</strong>
              </p>
            </div>

            <div className="lg-result-block">
              <p className="lg-block-label">Faturamento adicional anual</p>
              <p className="lg-big lg-highlight">+R$ {fmt(result.adicionalAno)}</p>
              <p className="lg-small">
                Receita extra com base no seu ticket médio atual, sem upsell.
              </p>
            </div>

            <div className="lg-result-block">
              <p className="lg-block-label">Retorno sobre investimento</p>
              <p style={{ marginBottom: 10 }}>
                <span className="lg-badge-roi">⚡ ROI de {result.roi}x ao ano</span>
              </p>
              <p className="lg-small">
                Custo Licitagram Enterprise: R$ 17.964/ano · Cada cliente novo ={' '}
                <strong style={{ color: '#fff' }}>100% margem</strong> sobre o custo fixo.
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="lg-cta-section">
        <h3>
          Quer receber esta projeção personalizada por email — junto com a proposta Partners?
        </h3>
        <p>
          Em 30 segundos você recebe a análise completa da sua consultoria, condições de acesso à base de{' '}
          <strong>50.000 empresas qualificadas</strong> e o desconto progressivo do programa.
        </p>

        <div className="lg-email-capture">
          <p className="lg-email-capture-title">📩 Receber projeção + proposta Partners</p>
          <p className="lg-email-capture-desc">
            Sem spam. Sem ligação automática. Você recebe o PDF e decide se quer conversar.
          </p>
          {submitted ? (
            <div className="lg-success-msg">
              ✅ Recebido! Em até 2 minutos a projeção chega no seu inbox.
            </div>
          ) : (
            <form className="lg-email-form" onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="seu-email@suaconsultoria.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
              <button type="submit" className="lg-btn" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar projeção →'}
              </button>
            </form>
          )}
          {submitError && (
            <p style={{ marginTop: 12, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              {submitError}
            </p>
          )}
        </div>

        <p style={{ marginTop: 24, fontSize: 13, color: '#7a7a7d' }}>
          Ou fale direto pelo WhatsApp:{' '}
          <a href="https://wa.me/13163069673" style={{ fontWeight: 700, color: '#F57709' }}>
            +1 (316) 306-9673
          </a>
        </p>
      </section>

      <footer className="lg-footer">
        <p>
          <strong>Licitagram Partners</strong> — programa exclusivo para consultorias de licitação
          <br />
          <strong>ZeepCode Group Technology LLC</strong> ·{' '}
          <a href="https://licitagram.com">licitagram.com</a>
        </p>
      </footer>
    </div>
  )
}

const STYLES = `
.lg-calc-root {
  --orange: #F57709;
  --orange-dark: #d96807;
  --orange-light: #fff5eb;
  --orange-border: #fbcca0;
  --dark: #1B1B1D;
  --gray-text: #4a4a4d;
  --gray-light: #7a7a7d;
  --bg: #f5f5f5;
  --white: #ffffff;
  --border: #ececec;
  background: var(--bg);
  color: var(--dark);
  line-height: 1.5;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
.lg-calc-root * { box-sizing: border-box; }
.lg-calc-root a { color: var(--orange); text-decoration: none; }

.lg-header { background: var(--dark); padding: 20px 0; }
.lg-header-inner { max-width: 1100px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; gap: 14px; }
.lg-header img { height: 40px; width: auto; }
.lg-header-text h1 { font-size: 18px; font-weight: 800; color: var(--white); letter-spacing: -0.3px; line-height: 1.2; margin: 0; }
.lg-header-text p { font-size: 11px; color: var(--orange); letter-spacing: 1px; text-transform: uppercase; font-weight: 600; margin-top: 2px; margin-bottom: 0; }

.lg-hero { padding: 56px 24px 32px; text-align: center; max-width: 760px; margin: 0 auto; }
.lg-hero .lg-label { font-size: 12px; font-weight: 700; color: var(--orange); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 16px; }
.lg-hero h2 { font-size: 38px; line-height: 1.15; font-weight: 800; color: var(--dark); letter-spacing: -1px; margin-bottom: 16px; }
.lg-hero p { font-size: 17px; color: var(--gray-text); max-width: 600px; margin: 0 auto; }
.lg-hero-pill { display: inline-flex; align-items: center; gap: 10px; margin-top: 24px; padding: 10px 18px; background: var(--orange-light); border: 1px solid var(--orange-border); border-radius: 999px; font-size: 13px; font-weight: 700; color: var(--orange); }

.lg-container { max-width: 1100px; margin: 0 auto 80px; padding: 0 24px; }
.lg-calc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 860px) { .lg-calc-grid { grid-template-columns: 1fr; } }

.lg-card { background: var(--white); border-radius: 16px; padding: 36px; box-shadow: 0 4px 24px rgba(27,27,29,0.08); }
.lg-card-label { font-size: 12px; font-weight: 700; color: var(--orange); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; }
.lg-card-title { font-size: 22px; font-weight: 800; color: var(--dark); letter-spacing: -0.5px; margin-bottom: 24px; margin-top: 0; }

.lg-input-group { margin-bottom: 24px; }
.lg-input-group label { display: block; font-size: 14px; font-weight: 600; color: var(--dark); margin-bottom: 8px; }
.lg-hint { font-size: 12px; color: var(--gray-light); margin-bottom: 10px; }
.lg-input-wrapper { position: relative; }
.lg-prefix { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-weight: 700; color: var(--gray-text); font-size: 16px; }
.lg-input-wrapper input { width: 100%; padding: 16px 20px 16px 40px; font-size: 18px; font-weight: 700; color: var(--dark); background: #fafafa; border: 2px solid var(--border); border-radius: 10px; font-family: inherit; transition: all 0.2s ease; }
.lg-input-wrapper input:focus { outline: none; border-color: var(--orange); background: var(--white); box-shadow: 0 0 0 3px rgba(245,119,9,0.15); }

.lg-range-group { margin-bottom: 24px; }
.lg-range-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.lg-range-header label { font-size: 14px; font-weight: 600; color: var(--dark); }
.lg-value { font-size: 18px; font-weight: 800; color: var(--orange); }
.lg-range-group input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; background: var(--border); border-radius: 3px; outline: none; }
.lg-range-group input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; background: var(--orange); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 8px rgba(245,119,9,0.4); transition: transform 0.15s ease; }
.lg-range-group input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); }
.lg-range-group input[type="range"]::-moz-range-thumb { width: 22px; height: 22px; background: var(--orange); border-radius: 50%; cursor: pointer; border: none; box-shadow: 0 2px 8px rgba(245,119,9,0.4); }

.lg-result-card { background: var(--dark); color: var(--white); position: relative; overflow: hidden; }
.lg-result-card::before { content: ''; position: absolute; top: -50%; right: -20%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(245,119,9,0.18) 0%, transparent 70%); pointer-events: none; }
.lg-result-card .lg-card-title { color: var(--white); }
.lg-result-card .lg-card-label { color: var(--orange); }
.lg-result-block { position: relative; z-index: 1; padding-bottom: 22px; margin-bottom: 22px; border-bottom: 1px solid #2a2a2d; }
.lg-result-block:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.lg-block-label { font-size: 12px; color: #a0a0a3; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; margin-bottom: 6px; }
.lg-big { font-size: 38px; font-weight: 800; color: var(--white); letter-spacing: -1px; line-height: 1; margin: 0 0 4px 0; }
.lg-big.lg-highlight { color: var(--orange); font-size: 44px; }
.lg-small { font-size: 13px; color: #a0a0a3; margin: 0; }
.lg-badge-roi { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; background: rgba(245,119,9,0.18); border: 1px solid rgba(245,119,9,0.4); border-radius: 999px; font-size: 13px; font-weight: 700; color: var(--orange); }

.lg-scenario-tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #fafafa; padding: 4px; border-radius: 10px; }
.lg-scenario-tab { flex: 1; padding: 10px; text-align: center; font-size: 13px; font-weight: 600; color: var(--gray-text); cursor: pointer; border-radius: 7px; transition: all 0.2s ease; background: transparent; border: none; font-family: inherit; }
.lg-scenario-tab.active { background: var(--white); color: var(--dark); box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
.lg-scenario-tab:hover:not(.active) { color: var(--dark); }

.lg-cta-section { max-width: 760px; margin: 60px auto 0; text-align: center; background: var(--white); border-radius: 16px; padding: 48px 36px; box-shadow: 0 4px 24px rgba(27,27,29,0.08); }
.lg-cta-section h3 { font-size: 28px; line-height: 1.25; font-weight: 800; color: var(--dark); letter-spacing: -0.6px; margin-bottom: 14px; margin-top: 0; }
.lg-cta-section p { font-size: 16px; color: var(--gray-text); margin-bottom: 28px; }

.lg-email-capture { background: var(--orange-light); border: 1px solid var(--orange-border); border-radius: 12px; padding: 24px; margin-top: 28px; text-align: left; }
.lg-email-capture-title { font-size: 13px; font-weight: 700; color: var(--orange); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.lg-email-capture-desc { font-size: 14px; color: var(--gray-text); margin-bottom: 14px; }
.lg-email-form { display: flex; gap: 8px; }
.lg-email-form input { flex: 1; padding: 14px 18px; font-size: 15px; background: var(--white); border: 2px solid var(--orange-border); border-radius: 8px; font-family: inherit; transition: border-color 0.2s ease; }
.lg-email-form input:focus { outline: none; border-color: var(--orange); }

.lg-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; background: var(--orange); color: var(--white); border: none; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 700; transition: background 0.2s ease; white-space: nowrap; }
.lg-btn:hover:not(:disabled) { background: var(--orange-dark); }
.lg-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.lg-success-msg { background: #d1fae5; color: #065f46; padding: 14px; border-radius: 8px; font-size: 14px; font-weight: 600; }

.lg-footer { background: var(--dark); padding: 40px 24px; text-align: center; }
.lg-footer p { color: #a0a0a3; font-size: 13px; margin: 0; }
.lg-footer p strong { color: var(--white); }
.lg-footer a { color: var(--orange); }

@media (max-width: 540px) {
  .lg-hero h2 { font-size: 28px; }
  .lg-card { padding: 28px 22px; }
  .lg-big { font-size: 30px; }
  .lg-big.lg-highlight { font-size: 36px; }
  .lg-cta-section { padding: 36px 22px; }
  .lg-cta-section h3 { font-size: 22px; }
  .lg-email-form { flex-direction: column; }
  .lg-email-form .lg-btn { width: 100%; }
}
`
