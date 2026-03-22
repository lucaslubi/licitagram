import Link from 'next/link'
import Image from 'next/image'
import { MobileMenu } from '@/components/mobile-menu'

const FEATURES = [
  {
    title: 'Mapa de Inteligência',
    description: 'O único instrumento de visualização de compras públicas do seu tipo no mundo. Veja onde o dinheiro do governo está e onde você vai ganhar.',
  },
  {
    title: 'Oportunidades Super Quentes',
    description: 'Acima de 85% de probabilidade de vitória — calculada com base no seu CNPJ, setor, histórico e capacidades técnicas.',
  },
  {
    title: 'Dossiê Pré-Pregão',
    description: 'Antes de qualquer disputa, acesse o histórico completo de cada concorrente: padrão de lances, win rate e vínculos societários.',
  },
  {
    title: 'Detecção de Fraude',
    description: 'Cruzamento automático com 64 milhões de entidades corporativas. Identifica cartéis, empresas de fachada e conluio.',
  },
  {
    title: 'Consultor IA por Edital',
    description: 'Cada edital tem um especialista esperando sua pergunta. Sem baixar nada, com exportação em PDF profissional.',
  },
  {
    title: 'Certidões Automáticas',
    description: 'Conexão direta com Receita Federal, FGTS, TST e mais. Verifica habilitação completa com um clique.',
  },
  {
    title: 'Agente Autônomo de Disputa',
    description: 'Configure sua estratégia e limite. O agente executa cada lance com precisão cirúrgica e para quando você definir.',
  },
  {
    title: 'Drive Institucional',
    description: 'Toda análise, consulta e PDF exportado vai para o repositório da sua empresa. Conhecimento que nunca se perde.',
  },
]

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
    a: 'Nossa IA analisa os CNAEs da empresa, área de atuação, certificações e capacidades técnicas, e cruza com os requisitos e objeto de cada licitação, gerando um score de 0 a 100.',
  },
  {
    q: 'Posso cancelar a assinatura a qualquer momento?',
    a: 'Sim, todos os planos podem ser cancelados a qualquer momento sem multa. Você mantém acesso até o fim do período pago.',
  },
  {
    q: 'Os alertas do Telegram são em tempo real?',
    a: 'Sim. Assim que uma nova licitação compatível é identificada pela IA, um alerta é enviado ao seu Telegram com score, resumo e link direto.',
  },
  {
    q: 'Preciso de conhecimento técnico para usar?',
    a: 'Não. O Licitagram foi feito para ser simples. Basta informar seu CNPJ e a plataforma faz o resto automaticamente.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-black/[0.08] bg-[#FAFAF8]/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Image src="/logo.png" alt="Licitagram" width={232} height={52} className="h-10 sm:h-[3.27rem] w-auto" />
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Features
            </a>
            <a href="#pricing" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Preços
            </a>
            <a href="#testimonials" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Depoimentos
            </a>
            <a href="#faq" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden sm:inline text-body-sm font-medium text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="text-body-sm font-medium px-3 sm:px-4 py-2 bg-[#F43E01] text-white rounded-[1000px] hover:bg-[#C23101] transition-all duration-150 ease-in-out"
            >
              Criar Conta
            </Link>
            {/* Mobile menu button */}
            <MobileMenu />
          </div>
        </div>
      </header>

      {/* ── Hero — Dark section with YouTube background video ── */}
      <section className="relative bg-[#26292E] overflow-hidden">
        {/* YouTube background video — zoomed to crop YouTube UI */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <iframe
            src="https://www.youtube.com/embed/qqJws-fmGsk?autoplay=1&mute=1&loop=1&playlist=qqJws-fmGsk&controls=0&showinfo=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&playsinline=1&enablejsapi=1&start=20&origin=https://licitagram.com"
            title="Background video"
            allow="autoplay; encrypted-media"
            allowFullScreen
            className="absolute top-1/2 left-1/2 w-[177.78vh] min-w-[120%] min-h-[120%] -translate-x-1/2 -translate-y-1/2 scale-[1.35] border-0"
            style={{ aspectRatio: '16/9' }}
          />
        </div>
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-[#26292E]/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#26292E]/80 via-transparent to-[#26292E]/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(244,62,1,0.08),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          <div className="max-w-3xl">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">
              Sistema ativo · R$ 1,5 trilhão mapeado em tempo real
            </p>
            <h1 className="text-display-lg sm:text-display-xl text-white mb-3 text-balance leading-[1.1]">
              Cada real que o governo gasta,{' '}
              <span className="text-[#F43E01]">você sabe antes de todos.</span>
            </h1>
            <p className="text-body sm:text-body-lg text-[#9C9C90] mb-6 sm:mb-8 max-w-2xl leading-relaxed">
              O maior sistema privado de inteligência de compras governamentais da América Latina. Cruzamos em tempo real cada licitação publicada no Brasil com 64 milhões de entidades corporativas, detectamos padrões de fraude e entregamos vantagem competitiva que não existe em lugar nenhum do mercado.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-3.5 bg-[#F43E01] text-white rounded-[1000px] text-body-sm sm:text-body font-medium hover:bg-[#C23101] transition-all duration-150 ease-in-out shadow-lg shadow-[#F43E01]/20"
              >
                Começar agora — 14 dias grátis
                <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-3.5 border border-white/20 text-[#9C9C90] rounded-[1000px] text-body-sm sm:text-body font-medium hover:border-white/40 hover:text-white transition-all duration-150 ease-in-out"
              >
                Ver a plataforma ao vivo
              </a>
            </div>
            <p className="mt-6 text-caption text-[#69695D]">Sem cartão de crédito. Acesso imediato.</p>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-b border-black/[0.08] bg-[#F3F3EE]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            <div>
              <p className="text-heading-xl font-bold text-[#26292E]">R$ 1,5 tri</p>
              <p className="text-body-sm text-[#69695D] mt-1">Em oportunidades mapeadas</p>
            </div>
            <div>
              <p className="text-heading-xl font-bold text-[#26292E]">132.448+</p>
              <p className="text-body-sm text-[#69695D] mt-1">Editais monitorados</p>
            </div>
            <div>
              <p className="text-heading-xl font-bold text-[#F43E01]">64M</p>
              <p className="text-body-sm text-[#69695D] mt-1">Entidades cruzadas</p>
            </div>
            <div>
              <p className="text-heading-xl font-bold text-[#26292E]">R$ 1 tri</p>
              <p className="text-body-sm text-[#69695D] mt-1">Novas contratações/ano</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem / Pain section ── */}
      <section className="py-20 sm:py-28 bg-[#FAFAF8]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Por que existimos</p>
          <h2 className="text-display-lg text-[#26292E] text-balance mb-6">
            Cartéis operam há décadas.{' '}
            <span className="text-[#69695D]">Construímos o Licitagram para acabar com isso.</span>
          </h2>
          <p className="text-body-lg text-[#69695D] max-w-2xl mx-auto leading-relaxed">
            O governo brasileiro é o maior comprador do país. Empresas de fachada disputam editais milionários. Oportunidades são perdidas por quem não sabe que existem. Não é uma ferramenta de busca — é uma infraestrutura de inteligência do tipo que até hoje só existia dentro de governos.
          </p>
        </div>
      </section>

      {/* ── How it works (3 steps) ── */}
      <section className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-4xl mx-auto px-4 text-center mb-4">
          <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Como funciona</p>
          <h2 className="text-display-lg text-[#26292E] text-balance">
            Do cadastro à proposta,{' '}
            <span className="text-[#69695D]">em 3 passos simples.</span>
          </h2>
        </div>

        <div className="max-w-5xl mx-auto px-4 mt-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Cadastre sua empresa',
                desc: 'Informe CNPJ, CNAEs, área de atuação e documentos. Buscamos os dados automaticamente na Receita Federal.',
              },
              {
                step: '02',
                title: 'IA encontra matches',
                desc: 'Nossa IA analisa milhares de editais e calcula um score de compatibilidade para cada um.',
              },
              {
                step: '03',
                title: 'Receba e decida',
                desc: 'Alertas no Telegram, pipeline de oportunidades e análise de compliance para decidir rápido.',
              },
            ].map((item) => (
              <div key={item.step} className="relative group">
                <div className="p-8 rounded-[20px] border border-black/[0.08] bg-white hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:border-[#F43E01]/20 transition-all duration-[250ms] ease-in-out">
                  <span className="text-overline text-[#F43E01] font-mono">{item.step}</span>
                  <h3 className="text-heading font-semibold text-[#26292E] mt-3 mb-3">{item.title}</h3>
                  <p className="text-body-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid (dark section, no icons) ── */}
      <section id="features" className="py-20 sm:py-28 bg-[#26292E]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Features</p>
            <h2 className="text-display-lg text-white text-balance">
              Tudo que você precisa{' '}
              <span className="text-[#69695D]">para licitar.</span>
            </h2>
            <p className="text-body-lg text-[#9C9C90] mt-6">
              Do monitoramento à proposta, o Licitagram cobre todo o ciclo de licitações com ferramentas inteligentes.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-[20px] border border-white/[0.08] bg-[#2D2F33] hover:border-[#F43E01]/30 hover:bg-[#2D2F33]/80 transition-all duration-[250ms] ease-in-out"
              >
                <h3 className="font-semibold text-white mb-2 text-body">{feature.title}</h3>
                <p className="text-body-sm text-[#9C9C90] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portals (warm bg) ── */}
      <section className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Portais integrados</p>
          <h2 className="text-display text-[#26292E] text-balance mb-12">
            Monitoramento multi-portal em tempo real.
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {[
              { name: 'PNCP', badge: 'Federal' },
              { name: 'Compras.gov', badge: 'Federal' },
              { name: 'BEC SP', badge: 'Estadual' },
              { name: 'Portal MG', badge: 'Estadual' },
            ].map((portal) => (
              <div key={portal.name} className="p-4 sm:p-6 rounded-[20px] border border-black/[0.08] bg-white hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.04)] transition-all duration-[250ms] ease-in-out">
                <p className="text-heading font-semibold text-[#26292E] mb-2">{portal.name}</p>
                <span className="inline-flex text-caption px-2.5 py-1 rounded-[1000px] border border-[#F43E01]/20 bg-[#F43E01]/5 text-[#F43E01]">
                  {portal.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section id="testimonials" className="py-20 sm:py-28 bg-[#FAFAF8]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Depoimentos</p>
            <h2 className="text-display text-[#26292E] text-balance">
              Resultados de quem já usa.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.author}
                className="p-8 rounded-[20px] border border-black/[0.08] bg-white hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)] transition-all duration-[250ms] ease-in-out"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} className="w-4 h-4 text-[#F43E01]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-body text-[#26292E] leading-relaxed mb-6">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F43E01]/10 flex items-center justify-center">
                    <span className="text-[#F43E01] font-semibold text-body-sm">{t.author[0]}</span>
                  </div>
                  <div>
                    <p className="text-body-sm font-semibold text-[#26292E]">{t.author}</p>
                    <p className="text-caption text-[#69695D]">{t.role}, {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison Table ── */}
      <section className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Comparativo</p>
            <h2 className="text-display text-[#26292E] text-balance">
              Licitagram vs. método tradicional
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black/[0.08]">
                  <th className="text-body-sm font-semibold text-[#26292E] text-left py-4 pr-4">Funcionalidade</th>
                  <th className="text-body-sm font-semibold text-[#F43E01] text-center py-4 px-4">Licitagram</th>
                  <th className="text-body-sm font-semibold text-[#69695D] text-center py-4 pl-4">Manual</th>
                </tr>
              </thead>
              <tbody className="text-body-sm">
                {[
                  ['Monitoramento multi-portal', true, false],
                  ['Análise com IA', true, false],
                  ['Score de compatibilidade', true, false],
                  ['Alertas em tempo real', true, false],
                  ['Compliance automático', true, false],
                  ['Inteligência competitiva', true, false],
                  ['Gestão de certidões', true, false],
                  ['Disponível 24/7', true, false],
                ].map(([feature, licitagram, manual]) => (
                  <tr key={feature as string} className="border-b border-black/[0.04]">
                    <td className="py-3.5 pr-4 text-[#26292E]">{feature as string}</td>
                    <td className="py-3.5 px-4 text-center">
                      {licitagram ? (
                        <svg className="w-5 h-5 text-[#F43E01] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-[#CECEBF]">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3.5 pl-4 text-center">
                      {manual ? (
                        <svg className="w-5 h-5 text-[#F43E01] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-[#CECEBF]">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Pricing (warm bg) ── */}
      <section id="pricing" className="py-20 sm:py-28 bg-[#FAFAF8]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Planos</p>
            <h2 className="text-display text-[#26292E] text-balance mb-4">Planos e Preços</h2>
            <p className="text-body-lg text-[#69695D]">Escolha o plano ideal para o tamanho do seu negócio.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-8 rounded-[20px] border-2 bg-white transition-all duration-[250ms] ease-in-out ${
                  plan.highlighted
                    ? 'border-[#F43E01] shadow-[0_16px_48px_-8px_rgba(244,62,1,0.12),0_4px_12px_-2px_rgba(0,0,0,0.06)] md:scale-[1.02]'
                    : 'border-black/[0.08] hover:border-[#F43E01]/20 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)]'
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#F43E01] text-white text-caption font-semibold px-4 py-1 rounded-[1000px]">
                    Mais Popular
                  </span>
                )}
                <h3 className="text-heading font-bold text-[#26292E]">{plan.name}</h3>
                <div className="mt-4 mb-6">
                  <span className="text-display font-bold text-[#26292E]">{plan.price}</span>
                  <span className="text-body text-[#69695D]">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-body-sm">
                      <svg className="w-5 h-5 text-[#F43E01] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[#26292E]">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center py-3.5 rounded-[1000px] font-medium text-body transition-all duration-150 ease-in-out ${
                    plan.highlighted
                      ? 'bg-[#F43E01] text-white hover:bg-[#C23101] shadow-md shadow-[#F43E01]/20'
                      : 'bg-[#F3F3EE] text-[#26292E] hover:bg-[#E8E8DE]'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">FAQ</p>
            <h2 className="text-display text-[#26292E] text-balance">
              Perguntas frequentes
            </h2>
          </div>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-[10px] border border-black/[0.08] bg-white transition-all duration-[250ms] ease-in-out"
              >
                <summary className="flex items-center justify-between cursor-pointer px-6 py-5 text-body font-medium text-[#26292E] select-none list-none [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <svg className="w-5 h-5 text-[#69695D] shrink-0 ml-4 transition-transform duration-150 ease-in-out group-open:rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </summary>
                <div className="px-6 pb-5 text-body-sm text-[#69695D] leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section (Orange block) ── */}
      <section className="py-20 sm:py-28 bg-[#F43E01] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-display-lg text-white text-balance mb-6">
            Pare de perder licitações por falta de informação
          </h2>
          <p className="text-body-lg text-white/70 mb-10">
            Junte-se a empresas que já encontram as melhores oportunidades com IA.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-[#F43E01] rounded-[1000px] text-body-sm sm:text-body font-semibold hover:bg-white/90 transition-all duration-150 ease-in-out shadow-[0_16px_48px_-8px_rgba(0,0,0,0.12),0_4px_12px_-2px_rgba(0,0,0,0.06)]"
          >
            Começar Agora — Grátis por 14 dias
            <svg className="ml-2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Footer (dark) ── */}
      <footer className="py-16 bg-[#26292E] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10">
            <div className="sm:col-span-2 md:col-span-1">
              <div className="flex items-center mb-4">
                <Image src="/logo.png" alt="Licitagram" width={140} height={32} className="h-8 w-auto brightness-0 invert" />
              </div>
              <p className="text-body-sm text-[#9C9C90] leading-relaxed">
                Inteligência artificial para licitações públicas.
              </p>
            </div>
            <div>
              <h4 className="text-overline uppercase text-[#69695D] mb-4 tracking-widest">Produto</h4>
              <ul className="space-y-3 text-body-sm">
                <li><a href="#features" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Features</a></li>
                <li><a href="#pricing" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Preços</a></li>
                <li><Link href="/login" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Entrar</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-overline uppercase text-[#69695D] mb-4 tracking-widest">Recursos</h4>
              <ul className="space-y-3 text-body-sm">
                <li><span className="text-[#69695D]">Blog (em breve)</span></li>
                <li><span className="text-[#69695D]">API Docs (em breve)</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-overline uppercase text-[#69695D] mb-4 tracking-widest">Legal</h4>
              <ul className="space-y-3 text-body-sm">
                <li><span className="text-[#69695D]">Termos de Uso</span></li>
                <li><span className="text-[#69695D]">Política de Privacidade</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/[0.08] text-center">
            <p className="text-caption text-[#69695D]">&copy; 2026 Licitagram. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
