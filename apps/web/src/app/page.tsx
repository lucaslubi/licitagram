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
import { createClient } from '@supabase/supabase-js'
import { PricingCards } from '@/components/pricing/PricingCards'

async function getSiteSettings() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data } = await supabase.from('site_settings').select('*').eq('id', 1).single()
    return data
  } catch {
    return null
  }
}

function getWhatsAppUrl(phone: string, message: string) {
  const cleanPhone = phone.replace(/\D/g, '')
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
}

// Plans data moved to PricingCards client component for billing toggle

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
    q: 'Por que o Licitagram custa mais que outras plataformas?',
    a: 'Porque o Licitagram não é uma plataforma de busca de editais. É uma infraestrutura completa de inteligência artificial, dados corporativos e automação jurídica. Oferecemos AI Matching com score de probabilidade, gerador de propostas comerciais, pesquisa de preços IN 65/2021, inteligência competitiva com 5 módulos, robô de lances com IA estratégica, detecção de anomalias com 67 milhões de CNPJs, grafo societário e compliance checker. Nenhum concorrente entrega 10% disso.',
  },
  {
    q: 'O que acontece nos 7 dias grátis?',
    a: 'Você tem acesso completo ao plano escolhido por 7 dias, sem precisar de cartão de crédito. Se não fizer sentido para a sua operação, basta não continuar. Sem burocracia, sem multa, sem pegadinha.',
  },
  {
    q: 'O Licitagram substitui o Painel de Preços do governo?',
    a: 'Sim. O Painel de Preços oficial (pafranel.planejamento.gov.br) foi descontinuado e os dados eram limitados ao ComprasNet federal. O Licitagram agrega dados de preços de todos os portais — federais, estaduais e municipais — com tendência temporal e filtros por região, órgão e item. É a base de preços mais completa do Brasil hoje.',
  },
  {
    q: 'Preciso de treinamento para usar?',
    a: 'Não. O Licitagram foi projetado para ser intuitivo. Basta informar seu CNPJ e a plataforma configura tudo automaticamente — CNAEs, área de atuação, certidões pendentes. No plano Enterprise, oferecemos onboarding dedicado se necessário.',
  },
  {
    q: 'E se eu já uso outra plataforma de licitações?',
    a: 'Muitos clientes migram de outras ferramentas para o Licitagram. Você pode testar em paralelo durante os 7 dias grátis e comparar os resultados. A diferença na qualidade dos matches, na profundidade da inteligência competitiva e na automação de propostas fica evidente logo nos primeiros dias.',
  },
  {
    q: 'Os dados do Licitagram são confiáveis?',
    a: 'Sim. Todos os dados são extraídos de fontes oficiais públicas (PNCP, ComprasNet, portais estaduais e municipais, Receita Federal, CEIS, CNEP, TCU). Não inventamos dados. Cada informação tem rastreabilidade completa até a fonte original. Se um dado muda na fonte, ele muda no Licitagram.',
  },
  {
    q: 'Como funciona o pagamento?',
    a: 'Aceitamos cartão de crédito com cobrança mensal recorrente via Stripe. Você pode cancelar a qualquer momento, sem multa, e mantém acesso até o fim do período pago. Para o plano Enterprise, também oferecemos faturamento por boleto e contrato anual com desconto.',
  },
]

const COMPARISON_BEFORE_AFTER: { before: string; after: string }[] = [
  { before: 'Buscar licitações manualmente em dezenas de portais', after: '+200.000 licitações monitoradas automaticamente por IA' },
  { before: 'Ler editais inteiros para saber se vale a pena', after: 'AI Matching com score 0-100 — a IA lê por você' },
  { before: 'Montar propostas do zero a cada licitação', after: 'Gerador de Propostas Comerciais em 2 minutos (Lei 14.133)' },
  { before: 'Pesquisar preços em planilhas e sistemas descontinuados', after: 'Preços de Mercado em tempo real com tendência temporal' },
  { before: 'Não saber quem são os concorrentes', after: 'Inteligência Competitiva com 5 módulos e ranking por IA' },
  { before: 'Dar lances no escuro durante pregões', after: 'Robô de Lances com IA estratégica e Pré-Disputa' },
  { before: 'Não detectar fraudes, cartéis ou empresas de fachada', after: 'Detecção de Anomalias + Grafo Societário com 67M+ CNPJs' },
  { before: 'Verificar documentos manualmente antes de cada licitação', after: 'Compliance Checker automático — cruza edital com seus docs' },
]


export default async function LandingPage() {
  const settings = await getSiteSettings()
  const isImplementation = settings?.sales_mode === 'implementation' || !settings
  const whatsappUrl = isImplementation
    ? getWhatsAppUrl(settings?.consultant_whatsapp || '+5511999999999', settings?.consultant_message || 'Olá! Gostaria de saber mais sobre o Licitagram.')
    : ''
  const ctaHref = isImplementation ? whatsappUrl : '/register'
  const ctaText = isImplementation ? 'Falar com Consultor' : 'Criar Conta'
  const ctaHeroText = isImplementation ? 'Agendar Implementação' : 'Começar agora — 7 dias grátis'

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
            <a
              href={ctaHref}
              target={isImplementation ? '_blank' : undefined}
              rel={isImplementation ? 'noopener noreferrer' : undefined}
              className="text-sm font-medium px-4 py-2 bg-[#F43E01] text-white rounded-full hover:bg-[#D63500] transition-all duration-200"
            >
              {ctaText}
            </a>
            {/* Mobile menu button */}
            <MobileMenu />
          </div>
        </div>
      </StickyHeader>

      {/* ── Hero — Centered layout ── */}
      <section className="relative bg-[#1A1C1F] overflow-hidden">
        {/* Video background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-[#1A1C1F]/75" />
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
          <div className="max-w-3xl mx-auto text-center">
            <div>
              <ScrollReveal>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-6">
                  A NOVA INTELIG&Ecirc;NCIA DAS COMPRAS P&Uacute;BLICAS NO BRASIL
                </p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.08] mb-6">
                  Menos de 1% das empresas brasileiras vendem para o governo.{' '}
                  <span className="bg-gradient-to-r from-white via-[#F43E01] to-[#FF6B3D] bg-clip-text text-transparent">
                    O Licitagram existe para mudar isso.
                  </span>
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-base sm:text-lg text-white mb-8 max-w-xl mx-auto leading-relaxed">
                  Mais de 200.000 licitações monitoradas por mês. 67 milhões de CNPJs cruzados em tempo real. Inteligência artificial que encontra, analisa e prepara tudo para você licitar — em minutos, não em dias.
                </p>
              </ScrollReveal>
              <ScrollReveal delay={300}>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <a
                    href={ctaHref}
                    target={isImplementation ? '_blank' : undefined}
                    rel={isImplementation ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center justify-center px-7 py-3.5 bg-[#F43E01] text-white rounded-full text-sm font-medium hover:bg-[#D63500] transition-all duration-200 shadow-lg shadow-[#F43E01]/20"
                  >
                    {ctaHeroText}
                    <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </a>
                  <a
                    href="#inteligencia"
                    className="inline-flex items-center justify-center px-7 py-3.5 border border-white/10 text-[#8B8B8B] rounded-full text-sm font-medium hover:border-white/25 hover:text-white transition-all duration-200"
                  >
                    Ver a plataforma ao vivo
                  </a>
                </div>
                <p className="mt-5 text-xs text-[#555]">Sem cartão de crédito para testar. Cancele quando quiser.</p>
              </ScrollReveal>
            </div>

          </div>
        </div>
      </section>

      {/* ── Stats bar — 5 metrics ── */}
      <section className="border-y border-[#1A1C1F]/[0.08] bg-[#F5F5F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 sm:gap-8 text-center">
            <ScrollReveal delay={0}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  +<CountUp end={200} suffix="K" duration={2000} />
                </p>
                <p className="text-sm text-[#69695D] mt-2">licitações/mês monitoradas</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={80}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  R$1tri+
                </p>
                <p className="text-sm text-[#69695D] mt-2">em oportunidades mapeadas</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={160}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#F43E01] tracking-tight">
                  <CountUp end={67} suffix="M+" duration={2000} />
                </p>
                <p className="text-sm text-[#69695D] mt-2">CNPJs cruzados em tempo real</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={240}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  <CountUp end={26} suffix="" duration={2000} />
                </p>
                <p className="text-sm text-[#69695D] mt-2">estados cobertos em tempo real</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={320}>
              <div>
                <p className="font-mono text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight">
                  &lt;2 min
                </p>
                <p className="text-sm text-[#69695D] mt-2">para gerar uma proposta</p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── 01 — O Problema ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <StickyLabel>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">01 — O problema</p>
              </StickyLabel>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                R$ 2 trilhões em compras públicas.{' '}
                <span className="text-[#8B8B8B]">Menos de 1% das empresas participam.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed mb-6">
                Todo ano, o governo brasileiro gasta mais de R$ 2 trilhões comprando produtos e serviços. É o maior comprador do país. Mas a imensa maioria das empresas brasileiras — mais de 99% — nunca vendeu um real para o governo.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed mb-8">
                Não é porque não querem. É porque o processo é complexo demais, fragmentado demais, opaco demais. São dezenas de portais diferentes, milhares de editais por semana, documentos que mudam conforme a lei, e concorrentes que você nem sabe quem são.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={400}>
              <p className="text-lg text-[#F43E01] font-semibold max-w-2xl mx-auto">
                O Licitagram nasceu para abrir esse mercado.
              </p>
            </ScrollReveal>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 02 — O que é o Licitagram ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="mapa" className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">02 — O que é o Licitagram</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                  A inteligência por trás de R$ 2 trilhões{' '}
                  <span className="text-[#69695D]">em compras públicas.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
                  O Licitagram não é mais uma plataforma de busca de editais. É a primeira infraestrutura de dados e inteligência artificial construída para tornar o mercado de licitações acessível para qualquer empresa brasileira.
                </p>
              </ScrollReveal>
            </div>

            {/* Mapa de Inteligência — Video Demo */}
            <ScrollReveal delay={300}>
              <div className="mb-16 max-w-4xl mx-auto">
                <div className="relative rounded-2xl overflow-hidden border border-[#E5E5E0]/30 shadow-2xl">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full h-auto"
                  >
                    <source src="/mapa-demo.webm" type="video/webm" />
                  </video>
                  {/* Logo watermark — bottom-left */}
                  {/* Black bar to cover username + logo on top */}
                  <div className="absolute bottom-0 left-0 w-48 h-10 bg-black pointer-events-none" />
                  <img
                    src="/logo-branca.png"
                    alt="Licitagram"
                    className="absolute bottom-1 left-2 h-8 opacity-95 drop-shadow-lg pointer-events-none z-10"
                  />
                </div>
                <p className="text-center text-sm text-[#69695D] mt-4">Mapa de Inteligência — Oportunidades geolocalizadas com score de compatibilidade em tempo real</p>
              </div>
            </ScrollReveal>

            {/* Para quem — 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                {
                  title: 'Para quem vende para o governo',
                  desc: 'Sua empresa recebe oportunidades filtradas por IA, com score de compatibilidade. Gera propostas em 2 minutos. Sabe quem são seus concorrentes, quanto eles cobram, e onde estão mais fracos.',
                },
                {
                  title: 'Para quem compra para o governo',
                  desc: 'O Painel de Preços do governo foi descontinuado. O Licitagram tem dados de preços mais completos, de todos os portais — federais, estaduais e municipais — com tendência temporal e filtros por região.',
                },
                {
                  title: 'Para quem fiscaliza o governo',
                  desc: 'Cruzamos 67 milhões de CNPJs com dados de sócios, sanções, endereços e histórico de licitações. Detectamos cartéis, empresas de fachada e vínculos societários ocultos automaticamente.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 100}>
                  <div className="group p-8 rounded-2xl border border-[#E5E5E0]/50 bg-white shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-[#F43E01]/20 transition-all duration-300 h-full">
                    <h3 className="text-lg font-semibold text-[#1A1C1F] mb-3">{item.title}</h3>
                    <p className="text-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 03 — 9 Features ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section id="inteligencia" className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">03 — O que você ganha</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance">
                  9 módulos que não existem{' '}
                  <span className="text-[#8B8B8B]">em nenhum outro lugar.</span>
                </h2>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  num: '01',
                  title: 'Inteligência Artificial que entende a sua empresa',
                  desc: 'A IA lê cada edital publicado no Brasil e calcula um score de 0 a 100 de compatibilidade com o perfil da sua empresa — CNAEs, porte, região, histórico.',
                },
                {
                  num: '02',
                  title: 'Gerador de Propostas Comerciais',
                  desc: 'Em 2 minutos, a IA gera uma proposta completa, formatada conforme a Lei 14.133, com os dados da sua empresa preenchidos. Pronta para enviar.',
                },
                {
                  num: '03',
                  title: 'Preços de Mercado em Tempo Real',
                  desc: 'O substituto real do Painel de Preços do governo (descontinuado). Dados de todos os portais — federais, estaduais e municipais — com tendência temporal.',
                },
                {
                  num: '04',
                  title: 'Pesquisa de Preços IN 65/2021',
                  desc: 'Relatório automático de pesquisa de preços conforme a Instrução Normativa 65/2021. Pronto para anexar ao processo. Em minutos, não em dias.',
                },
                {
                  num: '05',
                  title: 'Inteligência Competitiva com 5 Módulos',
                  desc: 'Saiba quem são seus concorrentes, quanto cobram, onde ganham, onde perdem, e quais editais estão disputando agora. Ranking por IA com win rate.',
                },
                {
                  num: '06',
                  title: 'Robô de Lances com Estratégia',
                  desc: 'Não é um robô que só executa. É um agente que pensa. Analisa o padrão de lances dos concorrentes, calcula o lance ótimo e executa com precisão.',
                },
                {
                  num: '07',
                  title: 'Detecção de Anomalias',
                  desc: '67 milhões de CNPJs cruzados em tempo real. 5 tipos de alerta: cartel, empresa de fachada, sócios em comum, endereço compartilhado, padrão de lance.',
                },
                {
                  num: '08',
                  title: 'Grafo Societário',
                  desc: 'Visualize as conexões entre empresas, sócios, endereços e contratos. Descubra quem está por trás de cada CNPJ — e como eles se conectam entre si.',
                },
                {
                  num: '09',
                  title: 'Compliance Checker',
                  desc: 'A IA cruza as exigências do edital com os documentos da sua empresa e diz exatamente o que está faltando — antes de você investir tempo na proposta.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.num} delay={i * 80}>
                  <div className="group h-full">
                    <div className="p-8 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:border-[#F43E01]/30 hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 h-full">
                      <span className="font-mono text-xs text-[#F43E01] uppercase tracking-wider">{item.num}</span>
                      <h3 className="text-lg font-semibold text-white mt-3 mb-3">{item.title}</h3>
                      <p className="text-sm text-[#8B8B8B] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            {/* Video Demo com moldura e efeito de entrada */}
            <ScrollReveal delay={400}>
              <div className="mt-16 max-w-4xl mx-auto">
                <div className="relative rounded-2xl overflow-hidden border border-white/[0.12] bg-white/[0.04] shadow-2xl shadow-[#F43E01]/5">
                  {/* Moldura superior simulando browser */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.06] border-b border-white/[0.08]">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                    <div className="flex-1 mx-4">
                      <div className="h-6 rounded-md bg-white/[0.06] flex items-center px-3">
                        <span className="text-[10px] text-white/30 font-mono">app.licitagram.com.br/dashboard</span>
                      </div>
                    </div>
                  </div>
                  {/* Video */}
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-auto"
                  >
                    <source src="/videos/demo-inteligencia.mp4" type="video/mp4" />
                  </video>
                  {/* Glow sutil embaixo */}
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-[#F43E01]/10 blur-2xl rounded-full" />
                </div>
              </div>
            </ScrollReveal>
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

      {/* ── 05 — Compliance e Certidões ── */}
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

      {/* ── 07 — Alertas Multicanal ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">07 — Alertas inteligentes &middot; Exclusivo</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                  Cada oportunidade chega até você.{' '}
                  <span className="text-[#8B8B8B]">Onde você estiver.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#A0A0A0] max-w-2xl mx-auto leading-relaxed">
                  Somos a única plataforma que envia alertas em tempo real por WhatsApp e Telegram simultaneamente. Enquanto outros te mandam um e-mail genérico no dia seguinte, você já está com o edital na mão.
                </p>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <ScrollReveal delay={100}>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 hover:border-[#25D366]/30 transition-all duration-300">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-[#25D366]/10 flex items-center justify-center">
                      <svg className="w-7 h-7 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">WhatsApp</h3>
                      <p className="text-sm text-[#25D366] font-medium">Exclusivo Licitagram</p>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {[
                      'Alerta instantâneo com score e resumo',
                      'Link direto para o edital completo',
                      'Resumo do dossiê de concorrentes',
                      'Notificação de prazo encerrando',
                      'Relatório diário consolidado',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-[#25D366] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-[#E5E5E0]">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={200}>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 hover:border-[#0088cc]/30 transition-all duration-300">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-[#0088cc]/10 flex items-center justify-center">
                      <svg className="w-7 h-7 text-[#0088cc]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Telegram</h3>
                      <p className="text-sm text-[#0088cc] font-medium">Exclusivo Licitagram</p>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {[
                      'Bot dedicado com comandos interativos',
                      'Filtros personalizados por UF e score',
                      'Alerta com análise IA embutida',
                      'Notificação de novos concorrentes',
                      'Resumo semanal de oportunidades',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-[#0088cc] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-[#E5E5E0]">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            </div>

            {/* Phone frame with Telegram demo video — vertical */}
            <ScrollReveal delay={300}>
              <div className="mt-16 flex flex-col items-center">
                <div className="relative mx-auto w-[220px] sm:w-[260px]">
                  {/* Phone frame — portrait */}
                  <div className="relative rounded-[2.5rem] border-[5px] border-[#333] bg-black overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/5" style={{ aspectRatio: '9/19.5' }}>
                    {/* Dynamic Island */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-black rounded-full z-10" />
                    {/* Video fills the phone screen */}
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="auto"
                      className="absolute inset-0 w-full h-full object-cover"
                    >
                      <source src="/telegram-demo.webm" type="video/webm" />
                    </video>
                    {/* Home indicator */}
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-white/20 rounded-full z-10" />
                  </div>
                </div>
                <p className="text-xs text-[#69695D] mt-4 text-center">Alertas em tempo real direto no Telegram</p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={400}>
              <div className="mt-12 text-center">
                <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full border border-[#F43E01]/20 bg-[#F43E01]/5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F43E01] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#F43E01]" />
                  </span>
                  <span className="text-sm text-[#F43E01] font-medium">Nenhum concorrente oferece alertas WhatsApp + Telegram simultaneamente</span>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── 08 — Drive Licitagram ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <StickyLabel>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">08 — Memória institucional &middot; Sempre acessível</p>
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

      {/* ── 09 — Como Funciona (4 steps) ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center mb-4">
            <ScrollReveal>
              <StickyLabel>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">09 — Como funciona</p>
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
                { name: '+ 160 Portais', badge: 'Estaduais e Municipais' },
                { name: 'Diários Oficiais', badge: 'Todas as Esferas' },
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

      {/* ── Testimonials — HIDDEN: enable via admin toggle when ready ── */}
      {false && <ClipRevealSection className="bg-[#F5F5F0]">
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
      </ClipRevealSection>}

      {/* ── Por que o Licitagram — Comparison Table ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-16">
              <ScrollReveal>
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Por que o Licitagram</p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight text-balance">
                  Como era. Como é agora.
                </h2>
              </ScrollReveal>
            </div>
            <ScrollReveal delay={200}>
              <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.04]">
                      <th className="text-sm font-mono font-semibold text-red-400/80 text-left py-4 px-6">Como era</th>
                      <th className="text-sm font-mono font-semibold text-[#F43E01] text-left py-4 px-6">Com o Licitagram</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {COMPARISON_BEFORE_AFTER.map((row) => (
                      <tr key={row.before} className="border-b border-white/[0.04]">
                        <td className="py-3.5 px-6 text-[#8B8B8B]">
                          <span className="flex items-start gap-2">
                            <span className="text-red-500/50 shrink-0 mt-0.5">&times;</span>
                            {row.before}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-[#E5E5E0]">
                          <span className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-[#F43E01] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {row.after}
                          </span>
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

      {/* ── Pricing / Implementation CTA ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="pricing" className="py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4">
            {isImplementation ? (
              /* ── Implementation Mode: Consultant CTA ── */
              <>
                <div className="text-center mb-12">
                  <ScrollReveal>
                    <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Implementação Personalizada</p>
                  </ScrollReveal>
                  <ScrollReveal delay={100}>
                    <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-4">
                      Cada operação é única. Sua implementação também.
                    </h2>
                  </ScrollReveal>
                  <ScrollReveal delay={200}>
                    <p className="text-lg text-[#69695D] max-w-2xl mx-auto">
                      Trabalhamos com implementação dedicada para garantir que sua equipe extraia o máximo da plataforma desde o primeiro dia.
                    </p>
                  </ScrollReveal>
                </div>
                <div className="max-w-3xl mx-auto">
                  <ScrollReveal delay={300}>
                    <div className="bg-white rounded-2xl border-2 border-[#F43E01]/20 shadow-lg p-8 sm:p-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-[#F43E01]/10 flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-[#F43E01]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                        </svg>
                      </div>
                      <h3 className="text-2xl font-bold text-[#1A1C1F] mb-3">Fale com nosso time</h3>
                      <p className="text-[#69695D] mb-8 max-w-lg mx-auto">
                        Nossa equipe vai entender sua operação, configurar a plataforma para seus CNAEs e garantir que cada oportunidade relevante chegue até você.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#25D366] text-white rounded-full text-sm font-semibold hover:bg-[#20BD5A] transition-all duration-200 shadow-lg shadow-[#25D366]/20"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          WhatsApp
                        </a>
                        <a
                          href="#contact-form"
                          className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#F43E01] text-white rounded-full text-sm font-semibold hover:bg-[#D63500] transition-all duration-200 shadow-lg shadow-[#F43E01]/20"
                        >
                          Agendar Demonstração
                        </a>
                      </div>
                      <p className="text-sm text-[#69695D] mt-6">Resposta em até 2 horas em dias úteis</p>
                    </div>
                  </ScrollReveal>
                </div>
              </>
            ) : (
              /* ── Self-Service Mode: Pricing Cards ── */
              <>
                <div className="text-center mb-16">
                  <ScrollReveal>
                    <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Planos e preços</p>
                  </ScrollReveal>
                  <ScrollReveal delay={100}>
                    <h2 className="text-3xl sm:text-4xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-4">
                      Escolha o plano certo para o tamanho da sua ambição.
                    </h2>
                  </ScrollReveal>
                  <ScrollReveal delay={200}>
                    <p className="text-base text-[#69695D] max-w-3xl mx-auto leading-relaxed">
                      Todos os planos incluem 7 dias grátis. Sem compromisso. O produto fala por si.
                    </p>
                  </ScrollReveal>
                  <ScrollReveal delay={250}>
                    <div className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F43E01]/5 border border-[#F43E01]/20">
                      <span className="text-sm text-[#F43E01] font-medium">Sem cartão de crédito para testar. Cancele quando quiser.</span>
                    </div>
                  </ScrollReveal>
                </div>
                <PricingCards />
              </>
            )}
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

      {/* ── Para Servidores Públicos ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section id="governos" className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Para órgãos públicos</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                  Servidores públicos: pesquisa de preços em 5 minutos,{' '}
                  <span className="text-[#69695D]">não em 2 dias.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
                  O Painel de Preços do governo foi descontinuado. O Licitagram é o substituto completo: dados de preços de todos os portais, relatório de pesquisa de preços conforme IN 65/2021 gerado automaticamente, pronto para anexar ao processo.
                </p>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {[
                {
                  title: 'Pesquisa de Preços IN 65/2021',
                  desc: 'Relatório gerado automaticamente com dados de múltiplas fontes oficiais, pronto para anexar ao processo administrativo.',
                },
                {
                  title: 'Base de Preços mais completa do Brasil',
                  desc: 'Agregamos preços de todos os portais — federais, estaduais e municipais — com filtros por região, órgão e período.',
                },
                {
                  title: 'Tendência temporal de preços',
                  desc: 'Veja como o preço de cada item evolui ao longo do tempo. Identifique superfaturamento e negocie com dados.',
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

      {/* ── Tribunais de Contas ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <ScrollReveal>
                <StickyLabel>
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Para tribunais de contas e órgãos de controle</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                  Tribunais de Contas: 67 milhões de CNPJs{' '}
                  <span className="text-[#8B8B8B]">cruzados contra cada licitação.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#8B8B8B] leading-relaxed max-w-2xl mx-auto">
                  Nosso motor de correlação cruza cada licitação com 67 milhões de entidades corporativas. Detectamos cartéis, empresas de fachada, vínculos societários ocultos e padrões de conluio automaticamente.
                </p>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {[
                {
                  title: 'Detecção de Cartéis',
                  desc: 'Identificação automática de padrões de conluio: lances combinados, rodízio de vencedores, preços artificialmente altos.',
                },
                {
                  title: 'Empresas de Fachada',
                  desc: 'Cruzamento de sócios, endereços e dados cadastrais para identificar empresas criadas para fraudar licitações.',
                },
                {
                  title: 'Grafo Societário',
                  desc: 'Visualização das conexões entre empresas, sócios e contratos. Quem está por trás de cada CNPJ.',
                },
                {
                  title: 'Alertas de Anomalia',
                  desc: '5 tipos de alerta em tempo real: cartel, fachada, sócios em comum, endereço compartilhado, padrão de lance.',
                },
                {
                  title: 'Auditoria Preventiva',
                  desc: 'Cruzamento automático de dados corporativos e históricos de licitações antes da homologação.',
                },
                {
                  title: 'Relatórios para Investigação',
                  desc: 'Dossiês completos exportáveis com todas as evidências, prontos para instrução de processos.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.title} delay={i * 80}>
                  <div className="group p-6 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:border-[#F43E01]/30 hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 h-full">
                    <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                    <p className="text-sm text-[#8B8B8B] leading-relaxed">{item.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── Conformidade Legal ── */}
      <ClipRevealSection className="bg-[#F5F5F0]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Conformidade legal</p>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                Jurídico por quem entende.{' '}
                <span className="text-[#69695D]">Tecnologia por quem constrói.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#69695D] max-w-2xl mx-auto leading-relaxed mb-8">
                Cada funcionalidade do Licitagram que envolve a Lei 14.133/2021, pesquisa de preços ou compliance foi projetada e validada por especialistas em direito administrativo e licitações públicas. Conformidade não é opcional — é requisito.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full border border-[#E5E5E0]/50 bg-white shadow-sm">
                <span className="text-sm text-[#4A4A45] font-medium">100% conforme com a Lei 14.133/2021</span>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </ClipRevealSection>

      {/* ── ROI Section ── */}
      <ClipRevealSection className="bg-[#1A1C1F]">
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollReveal>
              <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">Retorno sobre investimento</p>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                Uma licitação ganha{' '}
                <span className="text-[#8B8B8B]">paga o Licitagram por um ano.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed mb-8">
                O plano Profissional custa R$ 697/mês. Uma única licitação ganha — mesmo de pequeno porte — paga o investimento do ano inteiro. O ROI não é uma projeção. É aritmética.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                {[
                  { value: '+200.000', label: 'licitações monitoradas por mês' },
                  { value: '67 milhões', label: 'de CNPJs cruzados em tempo real' },
                  { value: 'R$ 1+ trilhão', label: 'em oportunidades mapeadas' },
                ].map((item, i) => (
                  <ScrollReveal key={item.value} delay={i * 100}>
                    <div className="p-8 rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:border-[#F43E01]/30 hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1">
                      <p className="font-mono text-3xl sm:text-4xl font-bold text-[#F43E01] tracking-tight mb-2">{item.value}</p>
                      <p className="text-sm text-[#8B8B8B]">{item.label}</p>
                    </div>
                  </ScrollReveal>
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
              O mercado de R$ 2 trilhões está aberto. A pergunta é se você vai entrar.
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <p className="text-lg text-white/70 mb-10">
              7 dias grátis. Sem cartão de crédito. Sem compromisso. O produto fala por si.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <a
              href={ctaHref}
              target={isImplementation ? '_blank' : undefined}
              rel={isImplementation ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-[#F43E01] rounded-full text-sm font-semibold hover:bg-white/90 transition-all duration-200 shadow-lg"
            >
              {isImplementation ? 'Falar com Consultor' : 'Começar Agora — 7 dias grátis'}
              <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
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
              <p className="text-sm text-[#8B8B8B] leading-relaxed mb-3">
                Inteligência de dados para licitações públicas no Brasil. +200.000 licitações/mês monitoradas por IA. 67M+ CNPJs cruzados em tempo real.
              </p>
              <p className="text-xs text-[#555] leading-relaxed">
                Todos os dados são extraídos de fontes oficiais públicas: PNCP, Compras.gov.br, Receita Federal e Portal da Transparência.
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
