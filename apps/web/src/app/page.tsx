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
    q: 'Por que o LICITAGRAM custa mais que outras plataformas?',
    a: 'Porque o LICITAGRAM não é uma plataforma. É o primeiro sistema operacional multi-agentes de IA para licitações da América Latina. Você não está pagando por uma ferramenta de busca com filtros — está ativando um exército de 9 agentes autônomos de inteligência artificial: Prospector para inteligência B2B, Agente de Combate para lances autônomos, GeoRadar para visão regional, Guardian para compliance automático, Oráculo de Preços conforme IN 65/2021 e Agente Antifraude com 67M+ CNPJs. Nenhuma ferramenta no mercado possui sequer um desses agentes. O LICITAGRAM possui nove.',
  },
  {
    q: 'O que acontece nos 7 dias grátis?',
    a: 'Você ativa o exército completo do plano escolhido por 7 dias, sem precisar de cartão de crédito. Seus agentes começam a operar imediatamente. Se não fizer sentido para a sua operação, basta não continuar. Sem burocracia, sem multa, sem pegadinha.',
  },
  {
    q: 'O LICITAGRAM substitui o Painel de Preços do governo?',
    a: 'Sim. O Painel de Preços oficial foi descontinuado e os dados eram limitados ao ComprasNet federal. O Agente de Precificação do LICITAGRAM agrega dados de preços de todos os portais — federais, estaduais e municipais — com tendência temporal e filtros por região, órgão e item. É a base de preços mais completa do Brasil.',
  },
  {
    q: 'Preciso de treinamento para usar?',
    a: 'Não. O LICITAGRAM foi projetado para que os agentes façam o trabalho pesado. Basta informar seu CNPJ e o sistema configura tudo automaticamente — CNAEs, área de atuação, certidões pendentes. Os 9 agentes se calibram ao seu perfil em segundos. No plano Enterprise, oferecemos onboarding dedicado para operações de alta complexidade.',
  },
  {
    q: 'E se eu já uso outra plataforma de licitações?',
    a: 'Muitas empresas migram de ferramentas convencionais para o LICITAGRAM. Você pode testar em paralelo durante os 7 dias grátis. A diferença entre operar com uma ferramenta de busca e comandar um exército multi-agentes de IA fica evidente nas primeiras horas — não nos primeiros dias.',
  },
  {
    q: 'Os dados do LICITAGRAM são confiáveis?',
    a: 'Todos os dados são extraídos de fontes oficiais públicas (PNCP, ComprasNet, portais estaduais e municipais, Receita Federal, CEIS, CNEP, TCU). Cada informação tem rastreabilidade completa até a fonte original. Os agentes não inventam dados — processam, cruzam e entregam inteligência verificável.',
  },
  {
    q: 'Como funciona o pagamento?',
    a: 'Aceitamos cartão de crédito com cobrança mensal recorrente via Stripe. Você pode cancelar a qualquer momento, sem multa, e mantém acesso até o fim do período pago. Para o plano Enterprise, também oferecemos faturamento por boleto e contrato anual com desconto.',
  },
]

const COMPARISON_BEFORE_AFTER: { before: string; after: string }[] = [
  { before: 'Buscar licitações manualmente em dezenas de portais', after: 'Agente de Targeting: +200.000 licitações monitoradas automaticamente com score' },
  { before: 'Ler editais inteiros para saber se vale a pena', after: 'Agente Jurídico: AI Matching com score 0-100 — o agente lê, analisa e decide por você' },
  { before: 'Montar propostas do zero a cada licitação', after: 'Agente de Propostas: Proposta comercial completa em 2 minutos (Lei 14.133)' },
  { before: 'Pesquisar preços em planilhas e sistemas descontinuados', after: 'Agente de Precificação: Oráculo de Preços em tempo real com tendência temporal' },
  { before: 'Não saber quem são os concorrentes', after: 'Agente Prospector: Dossiê completo com win-rate, preços e prospecção B2B' },
  { before: 'Dar lances no escuro durante pregões', after: 'Agente de Combate: Robô de Lances com IA estratégica e execução autônoma' },
  { before: 'Não detectar fraudes, cartéis ou empresas de fachada', after: 'Agente Antifraude: Grafo Societário com 67M+ CNPJs cruzados em tempo real' },
  { before: 'Verificar documentos manualmente antes de cada licitação', after: 'Agente Guardian: Automação completa de certidões CNDs no piloto automático' },
]


export default async function LandingPage() {
  const settings = await getSiteSettings()
  const isImplementation = settings?.sales_mode === 'implementation' || !settings
  const whatsappUrl = isImplementation
    ? getWhatsAppUrl(settings?.consultant_whatsapp || '+5511999999999', settings?.consultant_message || 'Olá! Gostaria de saber mais sobre o Licitagram.')
    : ''
  const ctaHref = isImplementation ? whatsappUrl : '/register'
  const ctaText = isImplementation ? 'Falar com Consultor' : 'Criar Conta'
  const ctaHeroText = isImplementation ? 'Agendar Implementação' : 'Ativar meu exército de IA — 7 dias grátis'

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
                  O PRIMEIRO SISTEMA OPERACIONAL MULTI-AGENTES DE IA PARA LICITAÇÕES DA AMÉRICA LATINA
                </p>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.08] mb-6">
                  <span className="bg-gradient-to-r from-white via-[#F43E01] to-[#FF6B3D] bg-clip-text text-transparent">LICITAGRAM</span>{' '}
                  <span className="text-white">A era dos buscadores de editais satisfez quem queria participar. A era dos multi-agentes de IA foi construída para quem quer dominar.</span>
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-base sm:text-lg text-white mb-8 max-w-xl mx-auto leading-relaxed">
                  Enquanto o mercado inteiro opera com ferramentas que entregam listas e chamam isso de tecnologia, o LICITAGRAM comanda um exército de agentes autônomos de IA — cada um uma unidade de elite especializada — que operam em cadeia sincronizada sobre R$ 2 trilhões em compras públicas e 67 milhões de CNPJs cruzados em tempo real. Um agente descobre. Outro disseca o edital em segundos. Outro calcula o preço letal. Outro blinda seu compliance. Outro executa o lance com precisão cirúrgica. Você não opera uma ferramenta. Você comanda uma máquina de guerra autônoma que transforma dinheiro público em faturamento privado.
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
                <p className="mt-5 text-xs text-[#555]">Quem tem o exército de IA, vence. Quem tem uma ferramenta, assiste. Sem cartão de crédito para testar. Cancele quando quiser.</p>
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
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">01 — O campo de batalha</p>
              </StickyLabel>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance mb-6">
                  R$ 2 trilhões na mesa. Um exército de IA de um lado.{' '}
                  <span className="text-[#8B8B8B]">Ferramentas obsoletas do outro. Escolha o seu lado.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed mb-6">
                  Quem ainda opera com buscadores manuais, robozinhos de alerta e planilhas de preço está entrando num campo de batalha moderno com equipamento da guerra anterior. A distância entre a empresa que “participa” de licitações e a corporação que domina pregões é a mesma distância entre uma ferramenta genérica e um sistema operacional multi-agentes de IA.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={400}>
              <p className="text-lg text-[#F43E01] font-semibold max-w-2xl mx-auto">
                  O LICITAGRAM não foi construído para competir com ferramentas. Foi construído para torná-las irrelevantes.
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
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">02 — O sistema operacional</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                  Não é uma plataforma. É um exército de agentes autônomos de IA{' '}
                  <span className="text-[#69695D]">operando em cadeia pela sua vitória.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
                  O LICITAGRAM é o primeiro sistema operacional multi-agentes de inteligência artificial e estrutura de dados para licitações da América Latina. Cada agente é uma unidade autônoma de elite, treinada para uma missão específica na cadeia licitatória — e todos operam em sincronia, em tempo real, 24 horas por dia.
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
                  <div className="absolute bottom-0 left-0 w-24 h-5 bg-black pointer-events-none" />
                  <img
                    src="/logo-branca.png"
                    alt="Licitagram"
                    className="absolute bottom-0 left-0 h-5 opacity-95 drop-shadow-lg pointer-events-none z-10"
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
                  desc: 'Seus agentes de IA filtram oportunidades com score de compatibilidade, geram propostas em 2 minutos, mapeiam cada concorrente e calculam o preço exato para vencer mantendo sua margem. Você não busca licitações. Seus agentes trazem contratos.',
                },
                {
                  title: 'Para quem compra para o governo',
                  desc: 'O Painel de Preços do governo foi descontinuado. O LICITAGRAM possui a base de preços mais completa do Brasil — dados de todos os portais federais, estaduais e municipais — com tendência temporal, filtros por região e relatórios automáticos conforme IN 65/2021.',
                },
                {
                  title: 'Para quem fiscaliza o governo',
                  desc: 'Nosso agente antifraude cruza 67 milhões de CNPJs com dados de sócios, sanções, endereços e histórico de licitações. Detecta cartéis, empresas de fachada e vínculos societários ocultos automaticamente. Onde o olho humano falha, a rede multi-agentes encontra.',
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
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">03 — Seu exército</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight text-balance">
                  9 agentes autônomos de IA.{' '}
                  <span className="text-[#8B8B8B]">9 unidades de elite. Zero equivalente no mercado.</span>
                </h2>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  num: '01',
                  title: 'Agente de Targeting — GeoRadar',
                  desc: 'O agente de radar varre o território nacional e mapeia oportunidades geolocalizadas com Score Matemático (0-100), traduzindo sua viabilidade tática de vitória em tempo real. Enquanto ferramentas entregam listas genéricas, esse agente entrega alvos calculados.',
                },
                {
                  num: '02',
                  title: 'Agente de Propostas Autônomas',
                  desc: 'O agente de propostas fatia e extrai cada item governamental e entrega a proposta final juridicamente perfeita conforme a Lei 14.133 — documentada, blindada e pronta para protocolo. O que levava horas, um agente autônomo resolve em 2 minutos.',
                },
                {
                  num: '03',
                  title: 'Agente de Precificação Letal — Oráculo de Preços',
                  desc: 'O agente de precificação cruza dezenas de terabytes do histórico público e calcula o preço balístico fatal — aquele que desestabiliza oponentes e mantém sua margem hiper-lucrativa. Encerre para sempre o amadorismo de "adivinhar" o desconto.',
                },
                {
                  num: '04',
                  title: 'Agente de Inteligência B2B — Prospector',
                  desc: 'O agente de inteligência competitiva identifica seus agressores mercadológicos e potenciais clientes. Entrega o dossiê completo: win-rate absoluto, margem histórica de recuo e canais de contato direto para prospecção outbound. Você sabe tudo sobre eles. Eles não sabem nada sobre você.',
                },
                {
                  num: '05',
                  title: 'Agente Jurídico — Consultor IA',
                  desc: 'O agente jurídico processa editais monstruosos e os implode em 10 segundos via análise semântica. Descobriu direcionamento ilícito? O agente redige instantaneamente a impugnação fundamentada nos acórdãos estritos do TCU. Seu advogado de bolso que nunca dorme.',
                },
                {
                  num: '06',
                  title: 'Agente de Combate — Command Center',
                  desc: 'Na abertura do pregão, o agente de combate exibe indicadores críticos dos alvos na sua tela e executa metralhadas algorítmicas de lances até secar os rivais no limite exato que você determinou. Você define a estratégia. O agente executa com precisão cirúrgica.',
                },
                {
                  num: '07',
                  title: 'Agente Antifraude — Grafo de Infiltração',
                  desc: 'O agente antifraude cruza iterativamente 67 milhões de CNPJs no ato. Constata matematicamente se você está lutando contra corporações idôneas ou se três adversários no mesmo lote são testas-de-ferro mascarando o mesmo proprietário. A fraude acaba onde esse agente começa.',
                },
                {
                  num: '08',
                  title: 'Agente de Blindagem — Guardian Compliance',
                  desc: 'O agente de compliance mantém suas certidões CNDs atualizadas no piloto automático, monitorando vencimentos e revalidando documentos em tempo real. O fim da inabilitação por documentos vencidos. Seu flanco jurídico, permanentemente vedado.',
                },
                {
                  num: '09',
                  title: 'Agente de Auditoria — Balizamento Estratégico',
                  desc: 'O agente de auditoria gera relatórios de adequabilidade invioláveis nos ditames da IN 65/2021 do Governo Federal, criando lastro documental irrefutável contra denúncias ou auditorias imprecisas. Compliance automático, blindagem total.',
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
                  <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">04 — Vantagem Informacional Absoluta</p>
                </StickyLabel>
              </ScrollReveal>
              <ScrollReveal delay={100}>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                  Não lute no escuro. Injetamos na sua tela{' '}
                  <span className="text-[#69695D]">a planta-baixa invisível do inimigo.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
                  No Agente de Combate, o ruído governamental é convertido em tática letal. Antes da abertura do certame, o sistema computa e renderiza o seu Dossiê Estratégico exibindo a previsibilidade de lances, vulnerabilidades dos oponentes e o preço exato de entrada.
                </p>
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                {
                  title: 'Agente Prospector',
                  desc: 'Acesse o dossiê invisível: histórico de lances, win-rate, preços praticados e vínculos societários de cada concorrente antes do certame começar. Informção que vale mais do que qualquer lance.',
                },
                {
                  title: 'Agente GeoRadar',
                  desc: 'Mapeamento balístico de oportunidades por região. Saiba onde o dinheiro está fluindo, onde a concorrência é mais frágil e onde seus agentes devem concentrar a operação.',
                },
                {
                  title: 'Agente Guardian',
                  desc: 'Seu QG de documentos. O Agente Guardian monitora e revalida suas certidões em tempo real, garantindo inabilidade zero na hora da disputa. Compliance no piloto automático.',
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
                <p className="font-mono text-xs uppercase text-[#F43E01] tracking-[0.2em] mb-4">06 — Assimetria de Informação</p>
              </StickyLabel>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1C1F] tracking-tight text-balance mb-6">
                A assimetria de interpretação acabou.{' '}
                <span className="text-[#69695D]">A rede neural disseca os editais em segundos.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#69695D] max-w-2xl mx-auto leading-relaxed mb-12">
                O Agente Jurídico processa terabytes de regras do Governo. Ele digere centenas de páginas do seu edital, encontrando direcionamentos, exigências abusivas e armadilhas contratuais que humanos demorariam dias para caçar. A saída já é um plano de ataque exportado, blindado e pronto para impugnação.
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
                  O LICITAGRAM é a única plataforma que envia alertas em tempo real por WhatsApp e Telegram simultaneamente. Cada alerta contém o score de compatibilidade, resumo do edital e link direto. Enquanto ferramentas convencionais te mandam um e-mail no dia seguinte, seus agentes já calcularam o preço ideal.
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
                  <span className="text-sm text-[#F43E01] font-medium">Zero concorrente no mercado oferece alertas WhatsApp + Telegram com score de IA simultaneamente</span>
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
                Cada análise do Agente Jurídico, consulta ao Consultor IA, dossiê pré-pregão e PDF exportado vai automaticamente para o repositório institucional da sua empresa. É a memória estratégica do seu departamento de licitações, organizada, pesquisável e permanente.
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
                  desc: 'Informe seu CNPJ e o sistema busca automaticamente CNAEs, área de atuação e dados na Receita Federal. Os 9 agentes se calibram ao seu perfil em segundos, sem configuração manual.',
                },
                {
                  step: '02',
                  title: 'Descoberta contínua',
                  desc: 'O Agente de Targeting monitora 24/7 todos os portais e calcula um score de compatibilidade para cada edital. Você não vê ruído — vê apenas alvos qualificados.',
                },
                {
                  step: '03',
                  title: 'Inteligência antes da disputa',
                  desc: 'O Agente Prospector entrega o dossiê completo de cada oportunidade: concorrentes, histórico de preços e probabilidade de vitória — antes do pregão começar.',
                },
                {
                  step: '04',
                  title: 'Execução com precisão',
                  desc: 'O Agente de Combate executa sua estratégia de lances com precisão cirúrgica. Você define os limites e a lógica. O agente executa mais rápido e mais preciso do que qualquer humano.',
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
                +160 portais monitorados. Nenhum edital escapa.
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
                  Categoria diferente. Nível diferente. Era diferente.
                </h2>
              </ScrollReveal>
            </div>
            <ScrollReveal delay={200}>
              <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.04]">
                      <th className="text-sm font-mono font-semibold text-red-400/80 text-left py-4 px-6">Operar com ferramentas convencionais</th>
                      <th className="text-sm font-mono font-semibold text-[#F43E01] text-left py-4 px-6">Operar com o exército LICITAGRAM</th>
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
                      Trabalhamos com implementação dedicada para garantir que seu exército de agentes opere com máxima precisão desde o primeiro dia.
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
                  Servidores públicos: pesquisa de preços conforme IN 65/2021 em 5 minutos,{' '}
                  <span className="text-[#69695D]">não em 2 dias.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
                  O Painel de Preços do governo foi descontinuado. O LICITAGRAM é o substituto definitivo: dados de preços de todos os portais, relatório de pesquisa de preços conforme IN 65/2021 gerado automaticamente pelo Agente de Precificação, pronto para anexar ao processo.
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
                  <span className="text-[#8B8B8B]">cruzados pelo Agente Antifraude contra cada licitação.</span>
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <p className="text-lg text-[#8B8B8B] leading-relaxed max-w-2xl mx-auto">
                  O Agente Antifraude do LICITAGRAM cruza cada licitação com 67 milhões de entidades corporativas. Detecta cartéis, empresas de fachada, vínculos societários ocultos e padrões de conluio automaticamente — antes da homologação.
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
                <span className="text-[#69695D]">Tecnologia por quem constrói. Compliance por quem não aceita falha.</span>
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
                <span className="text-[#8B8B8B]">paga o LICITAGRAM por um ano. O ROI é aritmética, não projeção.</span>
              </h2>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-lg text-[#8B8B8B] max-w-2xl mx-auto leading-relaxed mb-8">
                O plano Profissional custa R$ 697/mês. Uma única licitação ganha — mesmo de pequeno porte — paga o investimento do ano inteiro. Enquanto você decide, seus concorrentes com LICITAGRAM já estão calculando o preço letal do próximo pregão.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                {[
                  { value: '+200.000', label: 'licitações monitoradas por mês' },
                  { value: '67 milhões', label: 'de CNPJs cruzados em tempo real' },
                  { value: 'R$ 2+ trilhões', label: 'em compras públicas monitoradas em tempo real' },
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
              Um exército de IA ou uma ferramenta obsoleta. O mercado de R$ 2 trilhões recompensa apenas um deles.
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <p className="text-lg text-white/70 mb-10">
              7 dias grátis. Sem cartão de crédito. Sem compromisso. Quem ativa o exército primeiro, vence primeiro.
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
                O primeiro — e único — sistema operacional multi-agentes de IA para licitações da América Latina. +200.000 licitações/mês monitoradas por 9 agentes autônomos de IA. 67M+ CNPJs cruzados em tempo real.
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
