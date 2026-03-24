import Link from 'next/link'
import Image from 'next/image'
import { MobileMenu } from '@/components/mobile-menu'
import {
  ScrollReveal,
  CountUp,
  StickyLabel,
  ClipRevealSection,
  StickyHeader,
} from '@/components/landing/ScrollEffects'

const PLANS = [
  {
    name: 'Monitoramento',
    price: 'R$ 197',
    period: '/mês',
    features: [
      'Monitoramento contínuo de todos os portais',
      'Motor de compatibilidade com score por edital',
      'Alertas em tempo real via Telegram',
      'Pipeline e gestão de oportunidades',
      'Verificação básica de certidões',
      '1 usuário',
    ],
    cta: 'Começar Grátis',
    highlighted: false,
  },
  {
    name: 'Inteligência',
    price: 'R$ 497',
    period: '/mês',
    features: [
      'Tudo do Monitoramento, sem limites',
      'Mapa de Inteligência com oportunidades super quentes',
      'Dossiê pré-pregão com histórico de concorrentes',
      'Consultor de IA em cada licitação',
      'Exportação em PDF de todas as análises',
      'Drive Licitagram ilimitado',
      'Certidões automáticas em todos os portais',
      'Alertas WhatsApp + Telegram',
      'Até 5 usuários',
    ],
    cta: 'Teste Grátis 14 dias',
    highlighted: true,
  },
  {
    name: 'Dominância',
    price: 'R$ 997',
    period: '/mês',
    features: [
      'Tudo do Inteligência',
      'Sala de Operações com agente autônomo de disputa',
      'Detecção de vínculos societários e risco de cartel',
      'Relatório técnico para impugnação',
      'Multi-CNPJ ilimitado',
      'API de integração B2B',
      'Usuários ilimitados',
      'Suporte dedicado',
    ],
    cta: 'Falar com a Equipe',
    highlighted: false,
  },
]

const TESTIMONIALS = [
  {
    quote: 'Antes gastava horas procurando licitações em vários portais. Agora o Licitagram faz isso em segundos e ainda me diz quais são as melhores.',
    author: 'Carlos M.',
    role: 'Diretor Comercial',
    company: 'Empresa de TI',
  },
  {
    quote: 'O compliance automático é sensacional. Sabemos na hora se temos todos os documentos para participar de uma licitação.',
    author: 'Ana P.',
    role: 'Gerente de Licitações',
    company: 'Engenharia Civil',
  },
  {
    quote: 'Ganhamos 3 licitações no primeiro mês usando o match score da IA. O retorno sobre investimento foi imediato.',
    author: 'Roberto S.',
    role: 'CEO',
    company: 'Serviços de Limpeza',
  },
]

const FAQ = [
  {
    q: 'Quanto tempo leva para começar a receber oportunidades?',
    a: 'Após cadastrar sua empresa e informar seu CNPJ, a IA começa a analisar licitações imediatamente. Você recebe os primeiros matches em minutos.',
  },
  {
    q: 'Quais portais de licitações são monitorados?',
    a: 'Monitoramos o PNCP (federal), Compras.gov.br (federal), BEC SP (estadual) e Portal de Compras MG (estadual), com novos portais sendo adicionados constantemente.',
  },
  {
    q: 'Como funciona o score de compatibilidade?',
    a: 'Nossa IA analisa os CNAEs da empresa, area de atuação, certificações e capacidades técnicas, e cruza com os requisitos e objeto de cada licitação, gerando um score de 0 a 100.',
  },
  {
    q: 'Posso cancelar a assinatura a qualquer momento?',
    a: 'Sim, todos os planos podem ser cancelados a qualquer momento sem multa. Você mantém acesso até o fim do período pago.',
  },
  {
    q: 'Os alertas do Telegram são em tempo real?',
    a: 'Sim. Assim que uma nova licitação compativel e identificada pela IA, um alerta e enviado ao seu Telegram com score, resumo e link direto.',
  },
  {
    q: 'Preciso de conhecimento técnico para usar?',
    a: 'Não. O Licitagram foi feito para ser simples. Basta informar seu CNPJ e a plataforma faz o resto automaticamente.',
  },
]

const COMPARISON_ROWS: [string, string | boolean, string | boolean, string | boolean][] = [
  ['Mapeamento de R$ 1,5 tri', 'Exclusivo', false, false],
  ['Mapa de calor georreferenciado', 'Exclusivo', false, false],
  ['Score de probabilidade por empresa', 'Exclusivo', false, false],
  ['Motor de correlação 64M entidades', 'Exclusivo', false, false],
  ['Detecção de cartel', 'Exclusivo', false, false],
  ['Agente autônomo de disputa', true, 'Parcial', false],
  ['Consultor IA com PDF', 'Exclusivo', false, false],
  ['Certidões automáticas', 'Exclusivo', false, false],
  ['Drive institucional', true, false, false],
  ['Monitoramento multi-portal', true, true, false],
]

const SYSTEM_STATUS = [
  { id: '01', label: 'Connecting', active: true },
  { id: '02', label: 'Matching', active: true },
  { id: '03', label: 'AI Triage', active: true },
  { id: '04', label: 'Alertas', active: true },
  { id: '05', label: 'Compliance', active: true },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      {/* ── Header ── */}
      <StickyHeader>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Image src="/logo.png" alt="Licitagram" width={232} height={52} className="h-10 sm:h-[3.27rem] w-auto" />
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#inteligencia" className="text-sm text-[#4A4A45] hover:text-[#1A1C1F] transition-colors duration-200">
              Inteligência
            </a>
            <a href="#mapa" className="text-sm text-[#4A4A45] hover:text-[#1A1C1F] transition-colors duration-200">
              Mapa
            </a>
            <a href="#pricing" className="text-sm text-[#4A4A45] hover:text-[#1A1C1F] transition-colors duration-200">
              Preços
            </a>
            <a href="#plataforma" className="text-sm text-[#4A4A45] hover:text-[#1A1C1F] transition-colors duration-200">
              Plataforma
            </a>
            <a href="#governos" className="text-sm text-[#4A4A45] hover:text-[#1A1C1F] transition-colors duration-200">
              Para Governos
            </a>
            <a href="#faq" className="text-sm text-[#4A4A45] hover:text-[#1A1C1F] transition-colors duration-200">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden sm:inline text-sm font-medium text-[#4A4A45] hover:text-[#1A1C1F] transition-colors duration-200"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium px-4 py-2 bg-[#F43E01] text-white rounded-full hover:bg-[#D63500] transition-all duration-200"
            >
              Criar Conta
            </Link>
            {/* Mobile menu button */}
            <MobileMenu />
          </div>
        </div>
      </StickyHeader>

      {/* ── Hero — Split layout: copy left, video + system status right ── */}
      <section className="relative bg-[#1A1C1F] overflow-hidden">
        {/* Subtle dot pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(244,62,1,0.08),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — Copy */}
            <div>
              <ScrollReveal>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-6">
                  SISTEMA ATIVO &middot; TEMPO REAL
                </p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.08] mb-6">
                  Cada real que o governo gasta,{' '}
                  <span className="bg-gradient-to-r from-white via-[#F43E01] to-[#FF6B3D] bg-clip-text text-transparent">
                    você sabe antes de todos.
                  </span>
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-base sm:text-lg text-[#8B8B8B] mb-8 max-w-xl leading-relaxed">
                  O maior sistema privado de inteligência de compras governamentais da América Latina. Cruzamos em tempo real cada licitação publicada no Brasil com 64 milhões de entidades corporativas, detectamos padrões de fraude e entregamos vantagem competitiva que não existe em lugar nenhum do mercado.
                </p>
              </ScrollReveal>
              <ScrollReveal delay={300}>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center px-7 py-3.5 bg-[#F43E01] text-white rounded-full text-sm font-medium hover:bg-[#D63500] transition-all duration-200 shadow-lg shadow-[#F43E01]/20"
                  >
                    Começar agora — 14 dias grátis
                    <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                  <a
                    href="#inteligencia"
                    className="inline-flex items-center justify-center px-7 py-3.5 border border-white/10 text-[#8B8B8B] rounded-full text-sm font-medium hover:border-white/25 hover:text-white transition-all duration-200"
                  >
                    Ver a plataforma ao vivo
                  </a>
                </div>
                <p className="mt-5 text-xs text-[#555]">Sem cartão de crédito. Acesso imediato.</p>
              </ScrollReveal>
            </div>

            {/* Right — Video + System Status */}
            <ScrollReveal delay={200} className="space-y-5">
              {/* Video container */}
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#202020] shadow-2xl shadow-black/40">
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  className="w-full aspect-video object-cover"
                >
                  <source src="/hero-bg.mp4" type="video/mp4" />
                </video>
              </div>

              {/* System Status Panel */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-sm">
                <p className="font-mono text-[10px] uppercase text-[#8B8B8B] tracking-[0.15em] mb-4">System Status</p>
                <div className="space-y-2.5">
                  {SYSTEM_STATUS.map((s) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-[#555]">{s.id}.</span>
                        <span className="text-sm text-[#E5E5E0]">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span className="font-mono text-[10px] text-green-500 uppercase tracking-wider">Online</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-y border-[#1A1C1F]/[0.08] bg-[#F5F5F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            <ScrollReveal delay={0}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  R$1,5tri
                </p>
                <p className="text-sm text-[#69695D] mt-2">Em oportunidades mapeadas</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  <CountUp end={132} suffix="K+" duration={2000} />
                </p>
                <p className="text-sm text-[#69695D] mt-2">Editais monitorados</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#F43E01] tracking-tight">
                  <CountUp end={64} suffix="M" duration={2000} />
                </p>
                <p className="text-sm text-[#69695D] mt-2">Entidades cruzadas</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  R$<CountUp end={1} suffix="" duration={2000} />tri
                </p>
                <p className="text-sm text-[#69695D] mt-2">Novas contratações/ano</p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── 01 — Manifesto / "Por que existimos" ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <StickyLabel>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">01 — Por que existimos</p>
              </StickyLabel>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                Cartéis operam há décadas.{' '}
                <span className="text-[#8B8B8B]">Construímos o Licitagram para acabar com isso.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed">
                O governo brasileiro é o maior comprador do país. Empresas de fachada disputam editais milionários. Oportunidades são perdidas por quem nao sabe que existem. Não é uma ferramenta de busca — é uma infraestrutura de inteligência do tipo que até hoje só existia dentro de governos.
              </p>
            </ScrollReveal>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 02 — Mapa de Inteligência ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="mapa" className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">02 — Feature exclusivo &middot; O único do mundo</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                  Veja onde o dinheiro do governo está.{' '}
                  <span className="text-[#69695D]">E exatamente onde você vai ganhar.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed">
                  O Mapa de Inteligência é o único instrumento de visualização de compras públicas do seu tipo no mundo. Em uma tela, você vê o Brasil inteiro: cada estado iluminado pelo volume de oportunidades compatíveis com o seu perfil.
                </p>
              </ScrollReveal>
            </div>

            {/* Oportunidades Super Quentes */}
            <ScrollReveal delay={100}>
              <div className="max-w-4xl mx-auto mb-16">
                <div className="p-8 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="inline-flex font-mono text-xs px-3 py-1.5 rounded-full bg-[#F43E01]/10 text-[#F43E01] font-semibold">
                      85%+ de probabilidade
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-[#1A1C1F] mb-3">Oportunidades Super Quentes</h3>
                  <p className="text-sm text-[#69695D] leading-relaxed">
                    Acima de 85% de probabilidade de vitória — calculada com base no seu CNPJ, setor, histórico e capacidades técnicas. O sistema destaca automaticamente as disputas onde sua empresa tem vantagem real.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* Features grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {[
                {
                  title: 'Calor por relevância',
                  desc: 'Cada região brilha de acordo com a densidade de oportunidades compatíveis com o seu perfil.',
                },
                {
                  title: 'Ranking de estados',
                  desc: 'Saiba quais estados concentram mais editais para o seu setor — e onde seus concorrentes são mais fracos.',
                },
                {
                  title: 'Inteligência geográfica',
                  desc: 'Identifique rotas de expansão: estados com alta demanda e baixa concorrência no seu nicho.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 100}>
                  <div className="group p-6 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#F43E01]/20 transition-all duration-300 h-full">
                    <h3 className="font-semibold text-[#1A1C1F] mb-2">{item.title}</h3>
                    <p className="text-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 03 — Tres Camadas de Inteligência ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section id="inteligencia" className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">03 — Por que não há comparação possível</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance">
                  Três camadas de inteligência{' '}
                  <span className="text-[#8B8B8B]">que não existem em lugar nenhum.</span>
                </h2>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  layer: 'Camada 1',
                  title: 'O maior banco de dados de compras públicas do Brasil',
                  desc: 'Agregamos em tempo real dados de todos os portais federais, estaduais e municipais. R$ 1,5 trilhão mapeado e crescendo a cada segundo.',
                },
                {
                  layer: 'Camada 2',
                  title: 'Motor de correlação com 64M entidades',
                  desc: 'Cruzamos cada licitação com 64 milhões de entidades corporativas. Detectamos cartéis, empresas de fachada, vínculos societários ocultos e padrões de conluio.',
                },
                {
                  layer: 'Camada 3',
                  title: 'Sistema autônomo que pensa, age e evolui',
                  desc: 'Agentes de IA que monitoram, analisam, geram dossiês, executam lances e aprendem com cada resultado. Inteligência que trabalha para você 24/7.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.layer} delay={i * 120}>
                  <div className="group h-full">
                    <div className="p-8 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:border-[#F43E01]/30 hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 h-full">
                      <span className="font-mono text-xs text-[#F43E01] uppercase tracking-wider">{item.layer}</span>
                      <h3 className="text-lg font-semibold text-white mt-3 mb-3">{item.title}</h3>
                      <p className="text-sm text-[#8B8B8B] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 04 — Sala de Operações ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="plataforma" className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">04 — Funcionalidade exclusiva no mercado</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                  Antes de entrar em qualquer disputa,{' '}
                  <span className="text-[#69695D]">você já sabe o resultado provável.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
                  A Sala de Operações é o centro de comando da sua estratégia. Antes de cada pregão, você recebe um dossiê completo com o histórico de cada concorrente, padrão de lances, win rate e vínculos societários.
                </p>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                {
                  title: 'Dossiê Pré-Pregão',
                  desc: 'Histórico completo de cada concorrente: padrão de lances, preços praticados, win rate e vínculos societários.',
                },
                {
                  title: 'Análise de Concorrentes',
                  desc: 'Saiba quem vai disputar antes do pregão começar. Conheça suas fraquezas e prepare uma estratégia superior.',
                },
                {
                  title: 'Agente Autônomo de Disputa',
                  desc: 'Configure sua estratégia e limite. O agente executa cada lance com precisão cirúrgica e para quando você definir.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 100}>
                  <div className="group h-full">
                    <div className="p-8 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#F43E01]/20 transition-all duration-300 h-full">
                      <h3 className="text-lg font-semibold text-[#1A1C1F] mb-3">{item.title}</h3>
                      <p className="text-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 05 — Compliance e Certidoes ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">05 — Verificação automática &middot; Sem sair da plataforma</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                  Você está apto para licitar agora?{' '}
                  <span className="text-[#8B8B8B]">A resposta leva três segundos.</span>
                </h2>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {[
                'Certidão Negativa de Débitos Federais',
                'Regularidade FGTS',
                'Certidão Negativa de Débitos Trabalhistas (TST)',
                'CNDT — Certidão de Débitos Tributários',
                'Consulta de Impedimentos e Sanções',
                'Validação de CNAEs compatíveis',
              ].map((item, i) => (
                <ScrollReveal key={item} delay={i * 80}>
                  <div className="flex items-start gap-3 p-5 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:border-white/[0.15] transition-all duration-300">
                    <svg className="w-5 h-5 text-[#F43E01] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-[#E5E5E0]">{item}</span>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 06 — Consultor IA ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <StickyLabel>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">06 — Presente em cada licitação &middot; Exclusivo</p>
              </StickyLabel>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                Cada edital tem um especialista{' '}
                <span className="text-[#69695D]">esperando sua pergunta.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#69695D] max-w-2xl mx-auto leading-relaxed mb-12">
                O Consultor de IA lê o edital inteiro e responde qualquer dúvida sobre cláusulas, exigências técnicas, prazos e riscos. Sem baixar nada, sem sair da plataforma. E toda análise pode ser exportada em PDF profissional com a identidade da sua empresa.
              </p>
            </ScrollReveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[
                {
                  title: 'Análise instantânea',
                  desc: 'Pergunte sobre qualquer cláusula ou exigência do edital e receba respostas fundamentadas em segundos.',
                },
                {
                  title: 'Exportação em PDF',
                  desc: 'Gere relatórios profissionais com a identidade visual da sua empresa, prontos para apresentar a diretoria.',
                },
                {
                  title: 'Histórico completo',
                  desc: 'Todas as consultas ficam salvas no Drive Licitagram. Conhecimento que se acumula e nunca se perde.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 100}>
                  <div className="p-8 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#F43E01]/20 transition-all duration-300 h-full">
                    <h3 className="text-lg font-semibold text-[#1A1C1F] mb-3">{item.title}</h3>
                    <p className="text-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 07 — Drive Licitagram ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <StickyLabel>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">07 — Memória institucional &middot; Sempre acessível</p>
              </StickyLabel>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                Tudo que a sua empresa produz{' '}
                <span className="text-[#8B8B8B]">nunca se perde.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed mb-12">
                Cada análise, consulta ao Consultor IA, dossiê pré-pregão e PDF exportado vai automaticamente para o repositório institucional da sua empresa. É a memória do seu departamento de licitações, organizada e pesquisável.
              </p>
            </ScrollReveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[
                {
                  title: 'Organização automática',
                  desc: 'Documentos organizados por licitação, data e tipo — sem esforco manual.',
                },
                {
                  title: 'Busca inteligente',
                  desc: 'Encontre qualquer documento ou análise anterior em segundos com busca por conteúdo.',
                },
                {
                  title: 'Acesso compartilhado',
                  desc: 'Toda a equipe acessa o mesmo repositório. Conhecimento que pertence à empresa, não à pessoa.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 100}>
                  <div className="p-8 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:border-[#F43E01]/30 hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 h-full">
                    <h3 className="text-lg font-semibold text-white mb-3">{item.title}</h3>
                    <p className="text-sm text-[#8B8B8B] leading-relaxed">{item.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 08 — Como Funciona (4 steps) ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center mb-4">
            <ScrollReveal>
              <StickyLabel>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">08 — Como funciona</p>
              </StickyLabel>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance">
                Do cadastro à vitória,{' '}
                <span className="text-[#69695D]">em 4 passos.</span>
              </h2>
            </ScrollReveal>
          </div>

          <div className="max-w-6xl mx-auto px-4 mt-16">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  step: '01',
                  title: 'Perfil',
                  desc: 'Informe seu CNPJ e o sistema busca automaticamente CNAEs, area de atuação e dados na Receita Federal.',
                },
                {
                  step: '02',
                  title: 'Descoberta contínua',
                  desc: 'A IA monitora 24/7 todos os portais e calcula um score de compatibilidade para cada edital.',
                },
                {
                  step: '03',
                  title: 'Inteligência antes da disputa',
                  desc: 'Receba o dossiê completo de cada oportunidade: concorrentes, histórico de preços e probabilidade de vitória.',
                },
                {
                  step: '04',
                  title: 'Execução com precisão',
                  desc: 'O agente autonomo executa sua estrategia de lances com precisão cirúrgica. Voce define os limites, ele executa.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.step} delay={i * 120}>
                  <div className="group h-full">
                    <div className="p-8 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#F43E01]/20 transition-all duration-300 h-full">
                      <span className="font-mono text-xs text-[#F43E01] uppercase tracking-wider">{item.step}</span>
                      <h3 className="text-lg font-semibold text-[#1A1C1F] mt-3 mb-3">{item.title}</h3>
                      <p className="text-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── Portals ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <ScrollReveal>
              <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Portais integrados</p>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight text-balance mb-12">
                Monitoramento multi-portal em tempo real.
              </h2>
            </ScrollReveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {[
                { name: 'PNCP', badge: 'Federal' },
                { name: 'Compras.gov', badge: 'Federal' },
                { name: 'BEC SP', badge: 'Estadual' },
                { name: 'Portal MG', badge: 'Estadual' },
              ].map((portal, i) => (
                <ScrollReveal key={portal.name} delay={i * 100}>
                  <div className="p-4 sm:p-6 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:border-[#F43E01]/30 hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1">
                    <p className="text-lg font-semibold text-white mb-2">{portal.name}</p>
                    <span className="inline-flex font-mono text-[10px] px-2.5 py-1 rounded-full border border-[#F43E01]/20 bg-[#F43E01]/5 text-[#F43E01] uppercase tracking-wider">
                      {portal.badge}
                    </span>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── Testimonials ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="testimonials" className="py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <ScrollReveal>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Depoimentos</p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight text-balance">
                  Resultados de quem já usa.
                </h2>
              </ScrollReveal>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, i) => (
                <ScrollReveal key={t.author} delay={i * 120}>
                  <div className="p-8 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#F43E01]/20 transition-all duration-300 h-full">
                    <div className="flex items-center gap-1 mb-4">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <svg key={s} className="w-4 h-4 text-[#F43E01]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-[#4A4A45] leading-relaxed mb-6">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#F43E01]/10 flex items-center justify-center">
                        <span className="text-[#F43E01] font-semibold text-sm">{t.author[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1A1C1F]">{t.author}</p>
                        <p className="text-xs text-[#69695D]">{t.role}, {t.company}</p>
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── Comparison Table ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4">
            <div className="text-center mb-16">
              <ScrollReveal>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Comparativo</p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight text-balance">
                  Licitagram vs. Outros vs. Manual
                </h2>
              </ScrollReveal>
            </div>
            <ScrollReveal delay={200}>
              <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.04]">
                      <th className="text-sm font-mono font-semibold text-[#E5E5E0] text-left py-4 px-6">Funcionalidade</th>
                      <th className="text-sm font-mono font-semibold text-[#F43E01] text-center py-4 px-4">Licitagram</th>
                      <th className="text-sm font-mono font-semibold text-[#8B8B8B] text-center py-4 px-4">Outros</th>
                      <th className="text-sm font-mono font-semibold text-[#8B8B8B] text-center py-4 px-4">Manual</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {COMPARISON_ROWS.map(([feature, licitagram, outros, manual]) => (
                      <tr key={feature as string} className="border-b border-white/[0.04]">
                        <td className="py-3.5 px-6 text-[#E5E5E0]">{feature as string}</td>
                        <td className="py-3.5 px-4 text-center">
                          {licitagram === 'Exclusivo' ? (
                            <span className="inline-flex font-mono text-[10px] px-2.5 py-1 rounded-full bg-[#F43E01]/10 text-[#F43E01] font-semibold uppercase tracking-wider">Exclusivo</span>
                          ) : licitagram === true ? (
                            <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-red-500/50 font-mono text-xs">&times;</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {outros === 'Parcial' ? (
                            <span className="text-[#8B8B8B] font-mono text-[10px] uppercase tracking-wider">Parcial</span>
                          ) : outros === true ? (
                            <svg className="w-5 h-5 text-green-500/60 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-red-500/50 font-mono text-xs">&times;</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {manual === true ? (
                            <svg className="w-5 h-5 text-green-500/60 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-red-500/50 font-mono text-xs">&times;</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── Pricing ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="pricing" className="py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <ScrollReveal>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Escolha sua posição</p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-4">
                  Inteligência que escala com o seu nível de ambição.
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D]">14 dias gratuitos em qualquer plano. Sem compromisso.</p>
              </ScrollReveal>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PLANS.map((plan, i) => (
                <ScrollReveal key={plan.name} delay={i * 120}>
                  <div
                    className={`relative p-8 rounded-2xl border-2 bg-white transition-all duration-300 hover:-translate-y-1 h-full ${
                      plan.highlighted
                        ? 'border-[#F43E01] shadow-[0_0_40px_-8px_rgba(244,62,1,0.2)] md:scale-[1.02]'
                        : 'border-[#E5E5E0]/50 shadow-sm hover:shadow-md hover:border-[#F43E01]/20'
                    }`}
                  >
                    {plan.highlighted && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#F43E01] text-white font-mono text-[10px] font-semibold px-4 py-1 rounded-full uppercase tracking-wider">
                        Mais Popular
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-[#1A1C1F]">{plan.name}</h3>
                    <div className="mt-4 mb-6">
                      <span className="font-mono text-4xl font-bold text-[#1A1C1F] tracking-tight">{plan.price}</span>
                      <span className="text-[#69695D] ml-1">{plan.period}</span>
                    </div>
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm">
                          <svg className="w-5 h-5 text-[#F43E01] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-[#4A4A45]">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/register"
                      className={`block text-center py-3.5 rounded-full font-medium text-sm transition-all duration-200 ${
                        plan.highlighted
                          ? 'bg-[#F43E01] text-white hover:bg-[#D63500] shadow-md shadow-[#F43E01]/20'
                          : 'bg-[#1A1C1F]/5 text-[#1A1C1F] border border-[#1A1C1F]/10 hover:bg-[#1A1C1F]/10'
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── FAQ ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section id="faq" className="py-20 sm:py-28">
          <div className="max-w-3xl mx-auto px-4">
            <div className="text-center mb-16">
              <ScrollReveal>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">FAQ</p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight text-balance">
                  Perguntas frequentes
                </h2>
              </ScrollReveal>
            </div>
            <div className="space-y-3">
              {FAQ.map((item, i) => (
                <ScrollReveal key={item.q} delay={i * 60}>
                  <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.04] transition-all duration-300 hover:border-white/[0.15]">
                    <summary className="flex items-center justify-between cursor-pointer px-6 py-5 text-sm font-medium text-white select-none list-none [&::-webkit-details-marker]:hidden">
                      <span>{item.q}</span>
                      <svg className="w-5 h-5 text-[#8B8B8B] shrink-0 ml-4 transition-transform duration-200 group-open:rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </summary>
                    <div className="px-6 pb-5 text-sm text-[#8B8B8B] leading-relaxed">
                      {item.a}
                    </div>
                  </details>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── Para Governos ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="governos" className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Para governos, TCEs e órgãos de controle</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                  A mesma inteligencia que você usa para ganhar{' '}
                  <span className="text-[#69695D]">é a que usamos para garantir que o jogo seja justo.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
                  Nosso motor de correlacao com 64 milhões de entidades e a ferramenta mais poderosa de compliance e detecção de fraudes em licitações da América Latina.
                </p>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {[
                {
                  title: 'Tribunais de Contas (TCEs)',
                  desc: 'Detecção de cartéis, empresas de fachada e conluio em licitações estaduais e municipais.',
                },
                {
                  title: 'Órgãos de Controle',
                  desc: 'Analise de vinculos societarios ocultos e padrões de fraude em contratacoes publicas.',
                },
                {
                  title: 'Bancos e Instituições Financeiras',
                  desc: 'Compliance de fornecedores governamentais e análise de risco em operações de crédito vinculadas a contratos públicos.',
                },
                {
                  title: 'Ministérios Públicos',
                  desc: 'Investigação de superfaturamento e direcionamento em processos licitatórios.',
                },
                {
                  title: 'Controladorias',
                  desc: 'Auditoria preventiva com cruzamento automático de dados corporativos e históricos de licitações.',
                },
                {
                  title: 'Empresas Publicas',
                  desc: 'Verificação de idoneidade de fornecedores e monitoramento de risco contratual.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 80}>
                  <div className="group p-6 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#F43E01]/20 transition-all duration-300 h-full">
                    <h3 className="font-semibold text-[#1A1C1F] mb-2">{item.title}</h3>
                    <p className="text-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── Expansao ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Visão de longo prazo</p>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                Brasil primeiro.{' '}
                <span className="text-[#8B8B8B]">América Latina a seguir.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed mb-12">
                Estamos construindo a infraestrutura de inteligência de compras governamentais para todo o continente. O Brasil e o comeco.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-4xl sm:text-5xl">
                {['\u{1F1E7}\u{1F1F7}', '\u{1F1F2}\u{1F1FD}', '\u{1F1E8}\u{1F1F4}', '\u{1F1E8}\u{1F1F1}', '\u{1F1E6}\u{1F1F7}', '\u{1F1F5}\u{1F1EA}', '\u{1F1FA}\u{1F1FE}', '\u{1F1E7}\u{1F1F4}', '\u{1F1E6}\u{1F1F4}', '\u{1F1E8}\u{1F1FB}'].map((flag, i) => (
                  <span key={i} className="inline-block hover:scale-110 transition-transform duration-200">{flag}</span>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── CTA Section (Orange block) ── */}
      <section className="py-20 sm:py-28 bg-[#F43E01] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
              Seus concorrentes ainda procuram licitacoes em portais. Voce ja pode ver onde o dinheiro está.
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <p className="text-lg text-white/70 mb-10">
              Junte-se a empresas que já encontram as melhores oportunidades com IA.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-[#F43E01] rounded-full text-sm font-semibold hover:bg-white/90 transition-all duration-200 shadow-lg"
            >
              Começar Agora — Grátis por 14 dias
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-16 bg-[#1A1C1F] border-t border-white/[0.06] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10">
            <div className="sm:col-span-2 md:col-span-1">
              <div className="flex items-center mb-4">
                <Image src="/logo.png" alt="Licitagram" width={140} height={32} className="h-8 w-auto brightness-0 invert" />
              </div>
              <p className="text-sm text-[#8B8B8B] leading-relaxed">
                O maior sistema privado de inteligência de compras governamentais da América Latina.
              </p>
            </div>
            <div>
              <h4 className="font-mono text-[10px] uppercase text-[#555] mb-4 tracking-[0.15em]">Produto</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#inteligencia" className="text-[#8B8B8B] hover:text-white transition-colors duration-200">Inteligência</a></li>
                <li><a href="#mapa" className="text-[#8B8B8B] hover:text-white transition-colors duration-200">Mapa</a></li>
                <li><a href="#plataforma" className="text-[#8B8B8B] hover:text-white transition-colors duration-200">Sala de Operações</a></li>
                <li><a href="#faq" className="text-[#8B8B8B] hover:text-white transition-colors duration-200">Consultor de IA</a></li>
                <li><span className="text-[#8B8B8B]">Drive</span></li>
                <li><a href="#pricing" className="text-[#8B8B8B] hover:text-white transition-colors duration-200">Planos</a></li>
                <li><span className="text-[#555]">API (em breve)</span></li>
              </ul>
            </div>
            <div>
              <h4 className="font-mono text-[10px] uppercase text-[#555] mb-4 tracking-[0.15em]">Plataforma</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#governos" className="text-[#8B8B8B] hover:text-white transition-colors duration-200">Para TCEs</a></li>
                <li><span className="text-[#8B8B8B]">Para bancos</span></li>
                <li><span className="text-[#8B8B8B]">Para empresas</span></li>
                <li><span className="text-[#555]">Status</span></li>
              </ul>
            </div>
            <div>
              <h4 className="font-mono text-[10px] uppercase text-[#555] mb-4 tracking-[0.15em]">Legal</h4>
              <ul className="space-y-3 text-sm">
                <li><span className="text-[#555]">Termos de Uso</span></li>
                <li><span className="text-[#555]">Política de Privacidade</span></li>
                <li><Link href="/login" className="text-[#8B8B8B] hover:text-white transition-colors duration-200">Entrar</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/[0.06] text-center space-y-2">
            <p className="text-xs text-[#555]">&copy; 2026 Licitagram &middot; ZeepCode Group Technology LLC &middot; Florida, USA</p>
            <p className="text-xs text-[#555]">Serving Brazil &middot; Expanding LatAm</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
