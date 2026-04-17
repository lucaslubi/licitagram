/**
 * PrecosMercadoShowcase — dedicated module spotlight for Preços de Mercado.
 *
 * Sits just below the '14 módulos' grid. Uses the real recording at
 * public/videos/demo-precos.mp4 wrapped in the same browser chrome as the
 * map showcase. Light canvas, dark text, matches the rest of the site.
 */

export function PrecosMercadoShowcase() {
  return (
    <section
      id="precos-mercado"
      className="relative overflow-hidden bg-[#F5F5F0] border-y border-[#E5E5E0]"
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(26,28,31,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(26,28,31,.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 relative">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1 mb-5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-700 font-semibold">
              Tempo real · últimos 3 meses
            </span>
          </div>
          <p className="font-mono text-[10px] sm:text-xs uppercase text-[#F43E01] tracking-[0.24em] mb-4">
            Preços de Mercado · 4 fontes oficiais
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-semibold text-[#1A1C1F] tracking-tight leading-[1.05]">
            Preços atualizados em tempo real para precificar sem erro.
          </h2>
          <p className="text-lg text-[#69695D] mt-5 max-w-2xl mx-auto leading-relaxed">
            Cruzamento contínuo de PNCP, Dados Abertos, BPS Saúde e preços praticados no mercado —
            sempre com a janela móvel dos{' '}
            <strong className="text-[#1A1C1F]">últimos 90 dias</strong>. Sua precificação baseada
            no que está sendo pago AGORA, não no que valia há 2 anos.
          </p>
        </div>

        {/* Why it matters — 3 short proof points above the video */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 max-w-5xl mx-auto mb-10">
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#69695D] mb-1">Frescor</p>
            <p className="text-sm font-semibold text-[#1A1C1F]">Últimos 90 dias</p>
            <p className="text-xs text-[#69695D] mt-1">janela móvel contínua</p>
          </div>
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#69695D] mb-1">Ingestão</p>
            <p className="text-sm font-semibold text-[#1A1C1F]">A cada ciclo</p>
            <p className="text-xs text-[#69695D] mt-1">PNCP em tempo real</p>
          </div>
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#69695D] mb-1">IN 65/2021</p>
            <p className="text-sm font-semibold text-[#1A1C1F]">Relatório pronto</p>
            <p className="text-xs text-[#69695D] mt-1">pesquisa conforme lei</p>
          </div>
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#69695D] mb-1">Tempo</p>
            <p className="text-sm font-semibold text-[#1A1C1F]">Dias → segundos</p>
            <p className="text-xs text-[#69695D] mt-1">consulta completa</p>
          </div>
        </div>

        {/* Video with premium chrome */}
        <div className="relative max-w-5xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden bg-[#0F0F14] border border-white/[0.08] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.04)_inset]">
            {/* macOS-style title bar */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] bg-[#0A0A0F]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
              </div>
              <div className="flex-1 mx-4 flex items-center justify-center">
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-1 flex items-center gap-2 min-w-0 max-w-md w-full">
                  <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.105.895-2 2-2s2 .895 2 2-.895 2-2 2-2-.895-2-2zm-6 0c0-1.105.895-2 2-2s2 .895 2 2-.895 2-2 2-2-.895-2-2z" />
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                  </svg>
                  <span className="font-mono text-[11px] text-white/60 truncate">
                    licitagram.com/price-history
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-400 font-semibold">
                  live
                </span>
              </div>
            </div>

            {/* Video — natural aspect */}
            <div className="relative bg-black">
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="block w-full h-auto"
              >
                <source src="/videos/demo-precos.mp4" type="video/mp4" />
                <source src="/videos/demo-precos.webm" type="video/webm" />
              </video>
              {/* Mask for any identifying info in bottom-left */}
              <div
                className="absolute bottom-0 left-0 bg-black pointer-events-none"
                style={{ width: '18%', height: '7%' }}
                aria-hidden
              />
            </div>
          </div>
        </div>

        {/* 3 capability cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 max-w-5xl mx-auto mt-8">
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-5 hover:border-[#F43E01]/40 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F43E01]/10 border border-[#F43E01]/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#F43E01]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#1A1C1F] mb-1">Janela de 3 meses</h3>
                <p className="text-xs text-[#69695D] leading-relaxed">
                  Trabalhamos só com preços homologados nos últimos 90 dias. Descartamos o que está
                  desatualizado — sua referência é o que o mercado está pagando AGORA.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E5E0] rounded-xl p-5 hover:border-[#F43E01]/40 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#1A1C1F] mb-1">Relatório IN 65/2021</h3>
                <p className="text-xs text-[#69695D] leading-relaxed">
                  PDF profissional com a pesquisa de preços conforme a Instrução Normativa 65/2021,
                  pronto para anexar ao processo. O que levava dias vira segundos.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E5E0] rounded-xl p-5 hover:border-[#F43E01]/40 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#1A1C1F] mb-1">Tendência temporal + outliers</h3>
                <p className="text-xs text-[#69695D] leading-relaxed">
                  Mediana, P25, P75, variação 12 meses, deduplicação e remoção automática de outliers
                  adaptativa por faixa. Estatística robusta, sem achismo.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <a
            href="/register"
            className="inline-flex items-center gap-2 bg-[#F43E01] text-white rounded-full px-7 py-3.5 text-sm font-semibold hover:bg-[#D63500] transition-all shadow-[0_10px_30px_-5px_rgba(244,62,1,0.3)]"
          >
            Pesquisar preços agora — 7 dias grátis
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
