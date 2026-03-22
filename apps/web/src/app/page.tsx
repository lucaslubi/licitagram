'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MobileMenu } from '@/components/mobile-menu'

/* ────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────── */

const COMPARISON_ROWS: Array<[string, string, string, string]> = [
  ['Mapeamento de R$ 1,5 tri em oportunidades', 'Exclusivo', '\u2014', '\u2014'],
  ['Mapa de calor georreferenciado', 'Exclusivo', '\u2014', '\u2014'],
  ['Score de probabilidade de vitoria', '\u2713', '\u2014', '\u2014'],
  ['Motor de correlacao entre entidades', 'Exclusivo', '\u2014', '\u2014'],
  ['Consultor IA por edital', '\u2713', 'Parcial', '\u2014'],
  ['Compliance automatico com certidoes', '\u2713', 'Parcial', '\u2014'],
  ['Deteccao de fraude', 'Exclusivo', '\u2014', '\u2014'],
  ['Monitoramento 24/7 multi-portal', '\u2713', '\u2713', '\u2014'],
  ['Sala de Operacoes tatica', 'Exclusivo', '\u2014', '\u2014'],
  ['Drive inteligente por edital', '\u2713', '\u2014', '\u2014'],
]

const PLANS = [
  {
    name: 'Monitoramento',
    price: 'R$ 197',
    period: '/mes',
    description: 'Para quem esta comecando a monitorar oportunidades.',
    features: [
      'Monitoramento de editais',
      'Filtros por CNAE e regiao',
      'Alertas por e-mail e Telegram',
      'Ate 3 usuarios',
      'Suporte por chat',
    ],
    cta: 'Comecar gratis',
    ctaLink: '/register',
    highlighted: false,
    dark: false,
  },
  {
    name: 'Inteligencia',
    price: 'R$ 497',
    period: '/mes',
    badge: 'Mais escolhido',
    description: 'Para empresas que querem vencer com dados.',
    features: [
      'Tudo do Monitoramento',
      'Mapa de Inteligencia',
      'Score de probabilidade',
      'Consultor IA por edital',
      'Sala de Operacoes',
      'Compliance automatico',
      'Drive inteligente',
      'Ate 10 usuarios',
      'Suporte prioritario',
    ],
    cta: 'Comecar gratis',
    ctaLink: '/register',
    highlighted: true,
    dark: false,
  },
  {
    name: 'Dominancia',
    price: 'R$ 997',
    period: '/mes',
    description: 'Para operacoes que exigem cobertura total.',
    features: [
      'Tudo do Inteligencia',
      'Multi-CNPJ',
      'API de integracao',
      'Deteccao de fraude',
      'Relatorios avancados',
      'Usuarios ilimitados',
      'Gerente de conta dedicado',
    ],
    cta: 'Falar com a equipe',
    ctaLink: '/register',
    highlighted: false,
    dark: false,
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para governos e instituicoes financeiras.',
    features: [
      'Deteccao de fraude em licitacoes',
      'Analise de risco de credito',
      'Modulos de compliance institucional',
      'Integracao com sistemas internos',
      'SLA dedicado',
      'Implantacao assistida',
    ],
    cta: 'Falar com a equipe',
    ctaLink: '/register',
    highlighted: false,
    dark: true,
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Cadastre sua empresa',
    desc: 'Informe seu CNPJ. O sistema importa dados da Receita Federal, identifica seus CNAEs e configura o monitoramento automaticamente.',
  },
  {
    step: '02',
    title: 'A IA mapeia oportunidades',
    desc: 'O motor de inteligencia cruza seu perfil com milhares de editais em tempo real e calcula a probabilidade de vitoria de cada um.',
  },
  {
    step: '03',
    title: 'Analise na Sala de Operacoes',
    desc: 'Cada oportunidade relevante aparece com score, historico de concorrentes, analise de compliance e recomendacao do consultor IA.',
  },
  {
    step: '04',
    title: 'Decida com confianca',
    desc: 'Acesse documentos, certidoes e analises em um unico lugar. Submeta sua proposta sabendo exatamente suas chances.',
  },
]

const FLAGS = [
  { emoji: '\u{1F1E7}\u{1F1F7}', highlight: true },
  { emoji: '\u{1F1F2}\u{1F1FD}', highlight: false },
  { emoji: '\u{1F1E8}\u{1F1F4}', highlight: false },
  { emoji: '\u{1F1E8}\u{1F1F1}', highlight: false },
  { emoji: '\u{1F1E6}\u{1F1F7}', highlight: false },
  { emoji: '\u{1F1F5}\u{1F1EA}', highlight: false },
  { emoji: '\u{1F1FA}\u{1F1FE}', highlight: false },
  { emoji: '\u{1F1E7}\u{1F1F4}', highlight: false },
  { emoji: '\u{1F1E6}\u{1F1F4}', highlight: false },
  { emoji: '\u{1F1E8}\u{1F1FB}', highlight: false },
]

/* ────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────── */

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  /* ── Sticky header background on scroll ── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── Scroll reveal via IntersectionObserver ── */
  useEffect(() => {
    const els = document.querySelectorAll('[data-animate]')
    if (!els.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-[#FAFAF8]" style={{ scrollBehavior: 'smooth' }}>
      {/* ── Inline styles for scroll-reveal animation ── */}
      <style>{`
        [data-animate] {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-in {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        .glow-orange {
          box-shadow: 0 0 80px 20px rgba(244, 62, 1, 0.15), 0 0 160px 60px rgba(244, 62, 1, 0.05);
        }
      `}</style>

      {/* ═══════════════════════════════════════════
          1. HEADER
          ═══════════════════════════════════════════ */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)] border-b border-black/[0.04]'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/logo.svg"
              alt="Licitagram"
              width={160}
              height={36}
              className={`h-8 w-auto transition-all duration-300 ${scrolled ? '' : 'brightness-0 invert'}`}
              priority
            />
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {[
              { href: '#inteligencia', label: 'Inteligencia' },
              { href: '#mapa', label: 'Mapa' },
              { href: '#plataforma', label: 'Plataforma' },
              { href: '#pricing', label: 'Precos' },
              { href: '#governos', label: 'Para Governos' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`text-[14px] font-medium tracking-wide transition-colors duration-200 ${
                  scrolled
                    ? 'text-[#69695D] hover:text-[#26292E]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={`hidden sm:inline-flex text-[14px] font-medium px-4 py-2 rounded-full transition-colors duration-200 ${
                scrolled
                  ? 'text-[#69695D] hover:text-[#26292E]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="hidden sm:inline-flex text-[14px] font-semibold px-5 py-2.5 bg-[#F43E01] text-white rounded-full hover:bg-[#D63600] transition-colors duration-200 shadow-lg shadow-[#F43E01]/20"
            >
              Solicitar acesso
              <span className="ml-1.5">&rarr;</span>
            </Link>
            <MobileMenu />
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════
          2. HERO
          ═══════════════════════════════════════════ */}
      <section className="relative bg-[#0A0A0F] overflow-hidden pt-[72px]">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(244,62,1,0.08),transparent_70%)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 lg:pt-36 pb-20 sm:pb-28">
          <div className="max-w-4xl mx-auto text-center">
            {/* Kicker */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] mb-8" data-animate>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]" />
              </span>
              <span className="text-[13px] text-white/50 font-medium tracking-wide">
                Sistema ativo &middot; R$ 1,5 trilhao mapeado em tempo real
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-[40px] sm:text-[56px] lg:text-[72px] font-bold text-white leading-[1.05] tracking-tight mb-6" data-animate>
              Cada real que o governo gasta, voce sabe{' '}
              <span className="bg-gradient-to-r from-[#F43E01] via-[#FF6B35] to-[#F43E01] bg-clip-text text-transparent">
                antes de todos.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-[16px] sm:text-[18px] lg:text-[20px] text-white/40 leading-relaxed max-w-2xl mx-auto mb-10" data-animate>
              O Licitagram nao e um buscador de editais. E o primeiro sistema de inteligencia que mapeia
              R$ 1,5 trilhao em contratacoes publicas, cruza dados de 64 milhoes de entidades e mostra
              exatamente onde esta o dinheiro — antes de qualquer concorrente.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6" data-animate>
              <Link
                href="/register"
                className="inline-flex items-center justify-center px-8 py-4 bg-[#F43E01] text-white rounded-full text-[16px] font-semibold hover:bg-[#D63600] transition-all duration-200 shadow-lg shadow-[#F43E01]/25 hover:shadow-xl hover:shadow-[#F43E01]/30 hover:-translate-y-0.5"
              >
                Comecar agora — 14 dias gratis
                <span className="ml-2">&rarr;</span>
              </Link>
              <a
                href="#plataforma"
                className="inline-flex items-center justify-center px-8 py-4 border border-white/[0.12] text-white/60 rounded-full text-[16px] font-medium hover:border-white/25 hover:text-white transition-all duration-200"
              >
                Ver a plataforma ao vivo
              </a>
            </div>
            <p className="text-[13px] text-white/25 tracking-wide" data-animate>
              Sem cartao de credito. Acesso imediato.
            </p>
          </div>

          {/* Hero image — floating browser mockup */}
          <div className="mt-16 sm:mt-20 max-w-5xl mx-auto" data-animate>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-b from-[#F43E01]/10 to-transparent rounded-3xl blur-2xl glow-orange" />
              <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#1A1A2E] shadow-2xl" style={{ animation: 'float 6s ease-in-out infinite' }}>
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-[#12121E] border-b border-white/[0.06]">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                    <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                    <div className="w-3 h-3 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white/[0.06] rounded-md px-3 py-1.5 text-[12px] text-white/30 text-center">
                      app.licitagram.com/dashboard
                    </div>
                  </div>
                </div>
                <Image
                  src="/screenshots/dashboard.png"
                  alt="Dashboard Licitagram"
                  width={1920}
                  height={1080}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3. STATS BAR
          ═══════════════════════════════════════════ */}
      <section className="relative bg-gradient-to-r from-[#F43E01] to-[#D63600]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12" data-animate>
            {[
              { value: 'R$ 1,5 trilhao', label: 'Em oportunidades mapeadas' },
              { value: '132.448+', label: 'Editais monitorados continuamente' },
              { value: '64 milhoes', label: 'Entidades corporativas cruzadas' },
              { value: 'R$ 1 trilhao', label: 'Em novas contratacoes por ano' },
            ].map((stat) => (
              <div key={stat.value} className="text-center">
                <p className="text-[24px] sm:text-[32px] font-bold text-white tracking-tight">{stat.value}</p>
                <p className="text-[13px] sm:text-[14px] text-white/60 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4. MANIFESTO
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#FAFAF8]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6" data-animate>
          <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold text-center mb-8">
            Manifesto
          </p>
          <div className="space-y-8 text-center">
            <p className="text-[20px] sm:text-[24px] lg:text-[28px] text-[#26292E] leading-relaxed font-medium">
              O mercado de licitacoes no Brasil movimenta R$ 1,5 trilhao por ano. A maior parte desse dinheiro
              e disputada no escuro — com informacao fragmentada, dados desatualizados e decisoes baseadas em achismo.
            </p>
            <div className="w-16 h-px bg-[#F43E01]/30 mx-auto" />
            <p className="text-[18px] sm:text-[20px] text-[#69695D] leading-relaxed">
              O Licitagram existe para mudar isso. Nos construimos o primeiro sistema de inteligencia que ve o mercado
              inteiro — cada edital, cada orgao, cada concorrente, cada padrao — e transforma essa visao em vantagem competitiva real.
            </p>
            <p className="text-[18px] sm:text-[20px] text-[#69695D] leading-relaxed italic border-l-4 border-[#F43E01] pl-6 text-left">
              &ldquo;Nao e sobre encontrar licitacoes. E sobre saber, antes de todo mundo, onde o dinheiro vai estar.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5. MAPA DE INTELIGENCIA
          ═══════════════════════════════════════════ */}
      <section id="mapa" className="py-24 sm:py-32 bg-[#0A0A0F] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16" data-animate>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] mb-6">
              <span className="text-[12px] text-[#F43E01] font-semibold tracking-wide uppercase">Feature exclusivo</span>
              <span className="text-[12px] text-white/30">&middot;</span>
              <span className="text-[12px] text-white/40">O unico do mundo</span>
            </div>
            <h2 className="text-[32px] sm:text-[44px] lg:text-[52px] font-bold text-white leading-[1.1] tracking-tight mb-6">
              Veja onde o dinheiro do governo esta.{' '}
              <span className="text-white/40">E exatamente onde voce vai ganhar.</span>
            </h2>
            <p className="text-[16px] sm:text-[18px] text-white/40 leading-relaxed">
              O Mapa de Inteligencia e a unica ferramenta do mundo que georreferencia oportunidades de licitacao em tempo real,
              mostrando a concentracao de gastos publicos por regiao, setor e orgao. Voce nao procura — voce ve.
            </p>
          </div>

          {/* Screenshot */}
          <div className="max-w-5xl mx-auto mb-16" data-animate>
            <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#1A1A2E] shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 bg-[#12121E] border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                  <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#28C840]" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-white/[0.06] rounded-md px-3 py-1.5 text-[12px] text-white/30 text-center">
                    app.licitagram.com/mapa
                  </div>
                </div>
              </div>
              <Image
                src="/screenshots/mapa.png"
                alt="Mapa de Inteligencia Licitagram"
                width={1920}
                height={1080}
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-animate>
            {[
              {
                title: 'Calor por relevancia, nao por volume',
                desc: 'O mapa prioriza regioes com maior probabilidade de vitoria para o seu perfil, nao apenas volume de editais.',
              },
              {
                title: 'Ranking de estados em tempo real',
                desc: 'Veja quais estados estao com maior concentracao de gastos no seu segmento neste exato momento.',
              },
              {
                title: 'Inteligencia geografica exclusiva',
                desc: 'Cruze dados geograficos com historico de concorrentes e padroes de contratacao de cada regiao.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="p-6 rounded-2xl border border-white/[0.06] bg-[#1A1A2E]/50 hover:border-[#F43E01]/20 transition-all duration-300"
              >
                <h3 className="text-[16px] font-semibold text-white mb-2">{card.title}</h3>
                <p className="text-[14px] text-white/40 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          6. SUPER QUENTES
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div data-animate>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F43E01]/10 mb-6">
                <span className="text-[20px]" role="img" aria-label="fogo">{'\u{1F525}'}</span>
                <span className="text-[13px] text-[#F43E01] font-bold tracking-wide">85%+ de probabilidade</span>
              </div>
              <h2 className="text-[32px] sm:text-[40px] font-bold text-[#26292E] leading-[1.1] tracking-tight mb-6">
                As oportunidades super quentes.{' '}
                <span className="text-[#69695D]">Acima de 85% de probabilidade de vitoria — para voce.</span>
              </h2>
              <p className="text-[16px] text-[#69695D] leading-relaxed mb-8">
                O sistema identifica editais com altissima probabilidade de vitoria baseando-se em criterios que nenhuma plataforma consegue cruzar:
              </p>
              <div className="space-y-4">
                {[
                  'Historico completo do orgao comprador',
                  'Padrao de precos praticados na regiao',
                  'Perfil dos concorrentes provaveis',
                  'Aderencia do seu CNAE e porte ao objeto',
                  'Complexidade do edital vs. sua experiencia',
                ].map((item, i) => (
                  <div key={item} className="flex items-start gap-4">
                    <span className="text-[24px] font-bold bg-gradient-to-b from-[#F43E01] to-[#D63600] bg-clip-text text-transparent leading-none mt-0.5">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[15px] text-[#26292E] font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative" data-animate>
              <div className="absolute -inset-8 bg-gradient-to-br from-[#F43E01]/5 to-transparent rounded-3xl" />
              <div className="relative bg-white rounded-2xl border border-black/[0.06] p-8 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-[14px] font-semibold text-[#26292E]">Oportunidades Super Quentes</span>
                  <span className="px-3 py-1 rounded-full bg-[#F43E01]/10 text-[#F43E01] text-[12px] font-bold">LIVE</span>
                </div>
                {[
                  { title: 'Servicos de TI — Prefeitura de SP', score: 94 },
                  { title: 'Manutencao predial — INSS', score: 91 },
                  { title: 'Material de escritorio — TRF-3', score: 88 },
                  { title: 'Consultoria em gestao — BNDES', score: 86 },
                ].map((opp) => (
                  <div key={opp.title} className="flex items-center justify-between py-3 border-t border-black/[0.04]">
                    <span className="text-[14px] text-[#26292E]">{opp.title}</span>
                    <span className={`text-[14px] font-bold ${opp.score >= 90 ? 'text-[#22C55E]' : 'text-[#F43E01]'}`}>
                      {opp.score}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          7. TRES CAMADAS DE INTELIGENCIA
          ═══════════════════════════════════════════ */}
      <section id="inteligencia" className="bg-[#0A0A0F]">
        {/* Section header */}
        <div className="py-24 sm:py-32 border-b border-white/[0.04]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center" data-animate>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
              Por que nao ha comparacao possivel
            </p>
            <h2 className="text-[32px] sm:text-[44px] lg:text-[52px] font-bold text-white leading-[1.1] tracking-tight">
              Tres camadas de inteligencia que nao existem{' '}
              <span className="text-white/30">em lugar nenhum.</span>
            </h2>
          </div>
        </div>

        {/* Layer 01 */}
        <div className="py-24 sm:py-32 border-b border-white/[0.04]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div data-animate>
                <span className="text-[64px] sm:text-[80px] font-bold text-white/[0.06] leading-none block mb-4">01</span>
                <h3 className="text-[28px] sm:text-[36px] font-bold text-white leading-tight mb-4">
                  O maior banco de dados de licitacoes da America Latina.
                </h3>
                <p className="text-[16px] text-white/40 leading-relaxed mb-6">
                  Enquanto outras plataformas indexam editais, nos construimos uma base de dados viva que conecta
                  editais, orgaos, empresas, socios, contratos, atas de registro de preco, penalidades e historico
                  completo de precos praticados.
                </p>
                <ul className="space-y-3">
                  {['132.448+ editais indexados', '64 milhoes de entidades cruzadas', 'Dados de todas as esferas governamentais'].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-[#F43E01] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[15px] text-white/60">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div data-animate>
                {/* Data visualization mockup */}
                <div className="relative bg-[#1A1A2E] rounded-2xl border border-white/[0.06] p-8 overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#F43E01]/5 rounded-full blur-3xl" />
                  <div className="space-y-4">
                    {[
                      { label: 'Editais processados', value: '132.448', pct: 92 },
                      { label: 'Entidades mapeadas', value: '64M', pct: 78 },
                      { label: 'Contratos indexados', value: '890K+', pct: 85 },
                      { label: 'Orgaos monitorados', value: '12.800', pct: 95 },
                    ].map((bar) => (
                      <div key={bar.label}>
                        <div className="flex justify-between text-[13px] mb-2">
                          <span className="text-white/50">{bar.label}</span>
                          <span className="text-white font-semibold">{bar.value}</span>
                        </div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#F43E01] to-[#FF6B35] rounded-full"
                            style={{ width: `${bar.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Layer 02 */}
        <div className="py-24 sm:py-32 border-b border-white/[0.04]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1" data-animate>
                {/* Network graph SVG */}
                <div className="relative bg-[#1A1A2E] rounded-2xl border border-white/[0.06] p-8 overflow-hidden">
                  <svg viewBox="0 0 400 300" className="w-full h-auto" fill="none">
                    <line x1="200" y1="150" x2="80" y2="60" stroke="rgba(244,62,1,0.3)" strokeWidth="1" />
                    <line x1="200" y1="150" x2="320" y2="60" stroke="rgba(244,62,1,0.3)" strokeWidth="1" />
                    <line x1="200" y1="150" x2="60" y2="200" stroke="rgba(244,62,1,0.2)" strokeWidth="1" />
                    <line x1="200" y1="150" x2="340" y2="220" stroke="rgba(244,62,1,0.2)" strokeWidth="1" />
                    <line x1="200" y1="150" x2="140" y2="260" stroke="rgba(244,62,1,0.15)" strokeWidth="1" />
                    <line x1="200" y1="150" x2="280" y2="260" stroke="rgba(244,62,1,0.15)" strokeWidth="1" />
                    <line x1="80" y1="60" x2="60" y2="200" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                    <line x1="320" y1="60" x2="340" y2="220" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                    <line x1="60" y1="200" x2="140" y2="260" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                    <line x1="340" y1="220" x2="280" y2="260" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                    <circle cx="200" cy="150" r="24" fill="rgba(244,62,1,0.15)" stroke="#F43E01" strokeWidth="2" />
                    <text x="200" y="154" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">MOTOR</text>
                    {[
                      { x: 80, y: 60, label: 'Editais', r: 16 },
                      { x: 320, y: 60, label: 'Orgaos', r: 16 },
                      { x: 60, y: 200, label: 'Empresas', r: 14 },
                      { x: 340, y: 220, label: 'Socios', r: 14 },
                      { x: 140, y: 260, label: 'Contratos', r: 12 },
                      { x: 280, y: 260, label: 'Precos', r: 12 },
                    ].map((node) => (
                      <g key={node.label}>
                        <circle cx={node.x} cy={node.y} r={node.r} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                        <text x={node.x} y={node.y + 4} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8">{node.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
              <div className="order-1 lg:order-2" data-animate>
                <span className="text-[64px] sm:text-[80px] font-bold text-white/[0.06] leading-none block mb-4">02</span>
                <h3 className="text-[28px] sm:text-[36px] font-bold text-white leading-tight mb-4">
                  Motor de correlacao que ve o que humanos nao conseguem.
                </h3>
                <p className="text-[16px] text-white/40 leading-relaxed mb-6">
                  O motor cruza editais com empresas participantes, socios, contratos anteriores, padroes de precos
                  e historico de cada orgao. O resultado e um mapa completo de relacoes que revela oportunidades invisiveis.
                </p>
                <ul className="space-y-3">
                  {['Correlacao entre entidades em tempo real', 'Deteccao automatica de padroes', 'Analise preditiva de resultados'].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-[#F43E01] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[15px] text-white/60">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Layer 03 */}
        <div className="py-24 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div data-animate>
                <span className="text-[64px] sm:text-[80px] font-bold text-white/[0.06] leading-none block mb-4">03</span>
                <h3 className="text-[28px] sm:text-[36px] font-bold text-white leading-tight mb-4">
                  Sistema que pensa e evolui sozinho.
                </h3>
                <p className="text-[16px] text-white/40 leading-relaxed mb-6">
                  A inteligencia do Licitagram nao e estatica. Cada interacao, cada edital analisado, cada resultado de licitacao
                  alimenta o sistema. Ele aprende quais oportunidades funcionam para o seu perfil e refina as recomendacoes continuamente.
                </p>
                <ul className="space-y-3">
                  {['Machine learning adaptativo por perfil', 'Feedback loop automatico', 'Recomendacoes que melhoram com o tempo'].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-[#F43E01] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[15px] text-white/60">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div data-animate>
                {/* Autonomous system visualization */}
                <div className="relative bg-[#1A1A2E] rounded-2xl border border-white/[0.06] p-8 overflow-hidden">
                  <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#F43E01]/5 rounded-full blur-3xl" />
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#F43E01]/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#F43E01]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[14px] text-white font-semibold">Auto-learning ativo</p>
                        <p className="text-[12px] text-white/30">Ultimo ajuste ha 4 minutos</p>
                      </div>
                    </div>
                    {[
                      { label: 'Precisao do modelo', value: '94.7%', trend: '+2.3%' },
                      { label: 'Padroes identificados', value: '1.847', trend: '+124 hoje' },
                      { label: 'Recomendacoes aceitas', value: '89%', trend: '+5% este mes' },
                    ].map((metric) => (
                      <div key={metric.label} className="flex items-center justify-between py-3 border-t border-white/[0.04]">
                        <span className="text-[13px] text-white/40">{metric.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[15px] text-white font-semibold">{metric.value}</span>
                          <span className="text-[11px] text-[#22C55E] font-medium">{metric.trend}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          8. SALA DE OPERACOES
          ═══════════════════════════════════════════ */}
      <section id="plataforma" className="py-24 sm:py-32 bg-[#0A0A0F] border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16" data-animate>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
              Sala de Operacoes
            </p>
            <h2 className="text-[32px] sm:text-[44px] lg:text-[52px] font-bold text-white leading-[1.1] tracking-tight mb-6">
              Antes de entrar em qualquer disputa,{' '}
              <span className="text-white/30">voce ja sabe o resultado provavel.</span>
            </h2>
            <p className="text-[16px] sm:text-[18px] text-white/40 leading-relaxed">
              A Sala de Operacoes reune tudo que voce precisa para tomar a decisao de participar ou nao — com dados,
              nao com intuicao.
            </p>
          </div>

          {/* Screenshot */}
          <div className="max-w-5xl mx-auto mb-16" data-animate>
            <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#1A1A2E] shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 bg-[#12121E] border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                  <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#28C840]" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-white/[0.06] rounded-md px-3 py-1.5 text-[12px] text-white/30 text-center">
                    app.licitagram.com/sala-operacoes
                  </div>
                </div>
              </div>
              <Image
                src="/screenshots/sala-operacoes.png"
                alt="Sala de Operacoes Licitagram"
                width={1920}
                height={1080}
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Feature bullets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto" data-animate>
            {[
              'Score de probabilidade de vitoria para cada edital',
              'Historico completo do orgao e dos concorrentes',
              'Analise automatica de requisitos e habilitacao',
              'Estimativa de preco baseada em contratos anteriores',
              'Timeline de prazos com alertas automaticos',
              'Recomendacao do consultor IA integrada',
            ].map((bullet) => (
              <div key={bullet} className="flex items-start gap-3">
                <span className="text-[#F43E01] mt-0.5 shrink-0">&rarr;</span>
                <span className="text-[14px] text-white/50 leading-relaxed">{bullet}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          9. COMPLIANCE / CERTIDOES
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div data-animate>
              <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
                Compliance automatico
              </p>
              <h2 className="text-[32px] sm:text-[40px] font-bold text-[#26292E] leading-[1.1] tracking-tight mb-6">
                Voce esta apto para licitar agora?{' '}
                <span className="text-[#69695D]">A resposta leva tres segundos.</span>
              </h2>
              <p className="text-[16px] text-[#69695D] leading-relaxed mb-8">
                O sistema monitora todas as suas certidoes, cruza com os requisitos de cada edital e mostra
                instantaneamente se voce esta habilitado a participar.
              </p>
              <div className="space-y-4">
                {[
                  'CND Federal, Estadual e Municipal',
                  'FGTS e Certidao Trabalhista',
                  'Balanco patrimonial e indices contabeis',
                  'Atestados de capacidade tecnica',
                  'Alertas automaticos de vencimento',
                  'Habilitacao completa. A qualquer momento. Com um clique.',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-[#22C55E] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-[15px] text-[#26292E]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div data-animate>
              <div className="relative rounded-xl overflow-hidden border border-black/[0.06] bg-white shadow-xl">
                <Image
                  src="/screenshots/certidoes.png"
                  alt="Gestao de Certidoes Licitagram"
                  width={960}
                  height={640}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          10. CONSULTOR IA
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#0A0A0F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1" data-animate>
              <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#1A1A2E] shadow-2xl">
                <Image
                  src="/screenshots/consultor.png"
                  alt="Consultor IA Licitagram"
                  width={960}
                  height={640}
                  className="w-full h-auto"
                />
              </div>
              {/* Chat bubbles */}
              <div className="mt-6 space-y-3">
                {[
                  'Qual o valor estimado deste edital?',
                  'Quais documentos preciso para habilitacao?',
                  'Quem ganhou licitacoes similares antes?',
                ].map((q) => (
                  <div key={q} className="inline-block mr-2 px-4 py-2.5 rounded-2xl rounded-bl-md bg-white/[0.06] border border-white/[0.08]">
                    <span className="text-[13px] text-white/50">{q}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 lg:order-2" data-animate>
              <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
                Consultor IA
              </p>
              <h2 className="text-[32px] sm:text-[40px] font-bold text-white leading-[1.1] tracking-tight mb-6">
                Cada edital tem um especialista{' '}
                <span className="text-white/30">esperando sua pergunta.</span>
              </h2>
              <p className="text-[16px] text-white/40 leading-relaxed mb-6">
                O Consultor IA le o edital inteiro, cruza com dados do sistema e responde qualquer pergunta em segundos.
                Nao e um chatbot generico — e um especialista que conhece aquele edital especifico.
              </p>
              <p className="text-[15px] text-white/50 italic border-l-2 border-[#F43E01] pl-4">
                Um clique. O edital inteiro. Um especialista disponivel. Sempre.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          11. DRIVE
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16" data-animate>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
              Drive Inteligente
            </p>
            <h2 className="text-[32px] sm:text-[40px] font-bold text-[#26292E] leading-[1.1] tracking-tight mb-6">
              Tudo que a sua empresa produz{' '}
              <span className="text-[#69695D]">nunca se perde.</span>
            </h2>
            <p className="text-[16px] text-[#69695D] leading-relaxed">
              Cada documento, proposta, certidao e analise fica organizada automaticamente por edital,
              acessivel a qualquer momento e compartilhavel com a equipe inteira.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto" data-animate>
            {[
              'Propostas e documentos por edital',
              'Certidoes com controle de validade',
              'Historico de participacoes',
              'Atas de registro de preco',
              'Contratos e aditivos',
              'Analises e relatorios gerados',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 p-4 rounded-xl border border-black/[0.06] bg-white">
                <svg className="w-5 h-5 text-[#F43E01] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-[14px] text-[#26292E] font-medium">{item}</span>
              </div>
            ))}
          </div>
          <p className="text-center mt-10 text-[15px] text-[#69695D] italic" data-animate>
            A inteligencia que voce produz hoje trabalha pela sua empresa para sempre.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          12. DETECCAO DE FRAUDE
          ═══════════════════════════════════════════ */}
      <section id="governos" className="py-24 sm:py-32 bg-[#0A0A0F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16" data-animate>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#DC2626] font-semibold mb-6">
              Deteccao de fraude
            </p>
            <h2 className="text-[32px] sm:text-[44px] font-bold text-white leading-[1.1] tracking-tight mb-6">
              A mesma inteligencia que voce usa para ganhar{' '}
              <span className="text-white/30">e a que usamos para garantir que o jogo seja justo.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto" data-animate>
            {/* For control organs */}
            <div className="p-8 rounded-2xl border border-white/[0.06] bg-[#1A1A2E]">
              <div className="w-12 h-12 rounded-xl bg-[#DC2626]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-[20px] font-bold text-white mb-3">Para orgaos de controle</h3>
              <p className="text-[14px] text-white/40 leading-relaxed mb-6">
                Tribunais de Contas, Controladorias e Ministerios Publicos.
              </p>
              <ul className="space-y-3">
                {[
                  'Deteccao de cartel e conluio entre licitantes',
                  'Identificacao de socios ocultos e laranjas',
                  'Analise de sobrepreco e superfaturamento',
                  'Mapeamento de redes de relacionamento suspeitas',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="text-[13px] text-white/50">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* For financial institutions */}
            <div className="p-8 rounded-2xl border border-white/[0.06] bg-[#1A1A2E]">
              <div className="w-12 h-12 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-[20px] font-bold text-white mb-3">Para instituicoes financeiras</h3>
              <p className="text-[14px] text-white/40 leading-relaxed mb-6">
                Bancos, seguradoras e fundos de investimento.
              </p>
              <ul className="space-y-3">
                {[
                  'Analise de risco de credito para licitantes',
                  'Due diligence automatizada de fornecedores',
                  'Monitoramento de carteira de contratos publicos',
                  'Alertas de riscos regulatorios e reputacionais',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="text-[13px] text-white/50">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          13. COMO FUNCIONA
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16" data-animate>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
              Como funciona
            </p>
            <h2 className="text-[32px] sm:text-[44px] font-bold text-[#26292E] leading-[1.1] tracking-tight">
              Quatro etapas.{' '}
              <span className="text-[#69695D]">O sistema faz o resto.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" data-animate>
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.step}
                className="relative p-6 rounded-2xl border border-black/[0.06] bg-white hover:shadow-lg hover:border-[#F43E01]/15 transition-all duration-300 group"
              >
                <span className="text-[48px] font-bold bg-gradient-to-b from-[#F43E01]/20 to-transparent bg-clip-text text-transparent leading-none block mb-4">
                  {step.step}
                </span>
                <h3 className="text-[16px] font-semibold text-[#26292E] mb-2">{step.title}</h3>
                <p className="text-[14px] text-[#69695D] leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          14. COMPARATIVO
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#0A0A0F]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16" data-animate>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
              Comparativo
            </p>
            <h2 className="text-[32px] sm:text-[44px] font-bold text-white leading-[1.1] tracking-tight mb-6">
              O que existe no mercado.{' '}
              <span className="text-white/30">E o que so o Licitagram tem.</span>
            </h2>
          </div>

          <div className="overflow-x-auto" data-animate>
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-[14px] font-semibold text-white/40 py-4 pr-4">Capacidade</th>
                  <th className="text-center text-[14px] font-semibold text-[#F43E01] py-4 px-4">Licitagram</th>
                  <th className="text-center text-[14px] font-semibold text-white/30 py-4 px-4">Outros</th>
                  <th className="text-center text-[14px] font-semibold text-white/30 py-4 pl-4">Manual</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(([cap, licit, outros, manual]) => (
                  <tr key={cap} className="border-b border-white/[0.04]">
                    <td className="py-4 pr-4 text-[14px] text-white/60">{cap}</td>
                    <td className="py-4 px-4 text-center">
                      {licit === 'Exclusivo' ? (
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-[#F43E01]/10 text-[#F43E01] text-[11px] font-bold tracking-wide">
                          EXCLUSIVO
                        </span>
                      ) : licit === '\u2713' ? (
                        <svg className="w-5 h-5 text-[#22C55E] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-white/20">&mdash;</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {outros === 'Parcial' ? (
                        <span className="text-[12px] text-white/30">Parcial</span>
                      ) : outros === '\u2713' ? (
                        <svg className="w-5 h-5 text-white/30 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-white/20">&mdash;</span>
                      )}
                    </td>
                    <td className="py-4 pl-4 text-center">
                      <span className="text-white/20">&mdash;</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          15. PRICING
          ═══════════════════════════════════════════ */}
      <section id="pricing" className="py-24 sm:py-32 bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-6" data-animate>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
              Planos
            </p>
            <h2 className="text-[32px] sm:text-[44px] font-bold text-[#26292E] leading-[1.1] tracking-tight mb-4">
              Inteligencia que escala{' '}
              <span className="text-[#69695D]">com o seu nivel de ambicao.</span>
            </h2>
            <p className="text-[16px] text-[#69695D]">
              14 dias gratuitos em qualquer plano. Sem compromisso.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-16" data-animate>
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col p-6 rounded-2xl border-2 transition-all duration-300 ${
                  plan.dark
                    ? 'bg-[#0A0A0F] border-white/[0.08] text-white'
                    : plan.highlighted
                    ? 'bg-white border-[#F43E01] shadow-xl shadow-[#F43E01]/10'
                    : 'bg-white border-black/[0.06] hover:border-[#F43E01]/20 hover:shadow-lg'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F43E01] text-white text-[11px] font-bold px-3 py-1 rounded-full tracking-wide">
                    {plan.badge}
                  </span>
                )}
                <div className="mb-6">
                  <h3 className={`text-[18px] font-bold mb-1 ${plan.dark ? 'text-white' : 'text-[#26292E]'}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-[13px] ${plan.dark ? 'text-white/40' : 'text-[#69695D]'}`}>
                    {plan.description}
                  </p>
                </div>
                <div className="mb-6">
                  <span className={`text-[36px] font-bold tracking-tight ${plan.dark ? 'text-white' : 'text-[#26292E]'}`}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-[14px] ${plan.dark ? 'text-white/40' : 'text-[#69695D]'}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <svg className={`w-4 h-4 shrink-0 mt-0.5 ${plan.dark ? 'text-white/30' : 'text-[#F43E01]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={`text-[13px] ${plan.dark ? 'text-white/50' : 'text-[#26292E]'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.ctaLink}
                  className={`block text-center py-3 rounded-full text-[14px] font-semibold transition-all duration-200 ${
                    plan.highlighted
                      ? 'bg-[#F43E01] text-white hover:bg-[#D63600] shadow-md shadow-[#F43E01]/20'
                      : plan.dark
                      ? 'bg-white/[0.08] text-white hover:bg-white/[0.12] border border-white/[0.08]'
                      : 'bg-[#F3F3EE] text-[#26292E] hover:bg-[#E8E8DE]'
                  }`}
                >
                  {plan.cta} &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          16. EXPANSAO
          ═══════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 bg-[#0A0A0F]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center" data-animate>
          <p className="text-[13px] uppercase tracking-[0.2em] text-[#F43E01] font-semibold mb-6">
            Expansao
          </p>
          <h2 className="text-[32px] sm:text-[44px] font-bold text-white leading-[1.1] tracking-tight mb-8">
            Brasil primeiro.{' '}
            <span className="text-white/30">America Latina a seguir.</span>
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-4 text-[40px] sm:text-[48px]">
            {FLAGS.map((flag, i) => (
              <span
                key={i}
                className={`${flag.highlight ? 'scale-125' : 'opacity-40 hover:opacity-70'} transition-opacity duration-300`}
                role="img"
              >
                {flag.emoji}
              </span>
            ))}
          </div>
          <p className="text-[14px] text-white/30 mt-8">
            O Licitagram esta sendo construido para mapear contratacoes publicas em toda a America Latina.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          17. CTA FINAL
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 sm:py-32 bg-gradient-to-br from-[#F43E01] to-[#D63600] overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.1),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.1),transparent_60%)]" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center" data-animate>
          <h2 className="text-[32px] sm:text-[44px] lg:text-[52px] font-bold text-white leading-[1.1] tracking-tight mb-6">
            Seus concorrentes ainda procuram licitacoes em portais.{' '}
            <span className="text-white/70">Voce ja pode ver onde o dinheiro esta.</span>
          </h2>
          <p className="text-[16px] sm:text-[18px] text-white/60 mb-10 max-w-xl mx-auto">
            Comece agora com 14 dias gratuitos. Sem cartao de credito. Sem compromisso.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-[#F43E01] rounded-full text-[16px] font-bold hover:bg-white/90 transition-all duration-200 shadow-xl hover:-translate-y-0.5"
            >
              Comecar agora — 14 dias gratis
              <span className="ml-2">&rarr;</span>
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-4 border border-white/30 text-white rounded-full text-[16px] font-medium hover:border-white/50 hover:bg-white/5 transition-all duration-200"
            >
              Falar com a equipe
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          18. FOOTER
          ═══════════════════════════════════════════ */}
      <footer className="py-16 sm:py-20 bg-[#0A0A0F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
            {/* Brand */}
            <div className="lg:col-span-2">
              <Image
                src="/logo.svg"
                alt="Licitagram"
                width={140}
                height={32}
                className="h-8 w-auto brightness-0 invert mb-4"
              />
              <p className="text-[14px] text-white/30 leading-relaxed max-w-xs">
                O primeiro sistema de inteligencia para contratacoes publicas. Mapeando R$ 1,5 trilhao em oportunidades em tempo real.
              </p>
            </div>

            {/* Produto */}
            <div>
              <h4 className="text-[12px] uppercase tracking-[0.15em] text-white/20 font-semibold mb-4">Produto</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Mapa de Inteligencia', href: '#mapa' },
                  { label: 'Sala de Operacoes', href: '#plataforma' },
                  { label: 'Consultor IA', href: '#inteligencia' },
                  { label: 'Precos', href: '#pricing' },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-[14px] text-white/40 hover:text-white transition-colors duration-200">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Empresa */}
            <div>
              <h4 className="text-[12px] uppercase tracking-[0.15em] text-white/20 font-semibold mb-4">Empresa</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Sobre', href: '#' },
                  { label: 'Blog', href: '#' },
                  { label: 'Carreiras', href: '#' },
                  { label: 'Contato', href: '#' },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-[14px] text-white/40 hover:text-white transition-colors duration-200">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-[12px] uppercase tracking-[0.15em] text-white/20 font-semibold mb-4">Legal</h4>
              <ul className="space-y-3">
                {[
                  { label: 'Termos de Uso', href: '#' },
                  { label: 'Politica de Privacidade', href: '#' },
                  { label: 'LGPD', href: '#' },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-[14px] text-white/40 hover:text-white transition-colors duration-200">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[13px] text-white/20">
              &copy; 2026 Licitagram &middot; ZeepCode Group Technology LLC &middot; Florida, USA
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-white/20 hover:text-white/40 transition-colors" aria-label="LinkedIn">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a href="#" className="text-white/20 hover:text-white/40 transition-colors" aria-label="Twitter">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
