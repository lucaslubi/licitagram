import Link from 'next/link'
import Image from 'next/image'
import { MobileMenu } from '@/components/mobile-menu'

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
            <a href="#inteligencia" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Inteligência
            </a>
            <a href="#mapa" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Mapa
            </a>
            <a href="#pricing" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Preços
            </a>
            <a href="#plataforma" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Plataforma
            </a>
            <a href="#governos" className="text-body-sm text-[#69695D] hover:text-[#26292E] transition-all duration-150 ease-in-out">
              Para Governos
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
        {/* Background video — native MP4, loop, no controls */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute top-1/2 left-1/2 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 object-cover"
          >
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
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
                href="#inteligencia"
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

      {/* ── 1. Manifesto / "Por que existimos" ── */}
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

      {/* ── 2. Mapa de Inteligência (dark bg) ── */}
      <section id="mapa" className="py-20 sm:py-28 bg-[#26292E]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Feature exclusivo · O único do mundo</p>
            <h2 className="text-display-lg text-white text-balance mb-6">
              Veja onde o dinheiro do governo está.{' '}
              <span className="text-[#69695D]">E exatamente onde você vai ganhar.</span>
            </h2>
            <p className="text-body-lg text-[#9C9C90] leading-relaxed">
              O Mapa de Inteligência é o único instrumento de visualização de compras públicas do seu tipo no mundo. Em uma tela, você vê o Brasil inteiro: cada estado iluminado pelo volume de oportunidades compatíveis com o seu perfil.
            </p>
          </div>

          {/* Oportunidades Super Quentes */}
          <div className="max-w-4xl mx-auto mb-16">
            <div className="p-8 rounded-[20px] border border-white/[0.08] bg-[#2D2F33]">
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-flex text-caption px-3 py-1.5 rounded-[1000px] bg-[#F43E01]/10 text-[#F43E01] font-semibold">
                  85%+ de probabilidade
                </span>
              </div>
              <h3 className="text-heading font-semibold text-white mb-3">Oportunidades Super Quentes</h3>
              <p className="text-body-sm text-[#9C9C90] leading-relaxed">
                Acima de 85% de probabilidade de vitória — calculada com base no seu CNPJ, setor, histórico e capacidades técnicas. O sistema destaca automaticamente as disputas onde sua empresa tem vantagem real.
              </p>
            </div>
          </div>

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
            ].map((item) => (
              <div
                key={item.title}
                className="group p-6 rounded-[20px] border border-white/[0.08] bg-[#2D2F33] hover:border-[#F43E01]/30 hover:bg-[#2D2F33]/80 transition-all duration-[250ms] ease-in-out"
              >
                <h3 className="font-semibold text-white mb-2 text-body">{item.title}</h3>
                <p className="text-body-sm text-[#9C9C90] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Três Camadas de Inteligência (light bg) ── */}
      <section id="inteligencia" className="py-20 sm:py-28 bg-[#FAFAF8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Por que não há comparação possível</p>
            <h2 className="text-display-lg text-[#26292E] text-balance">
              Três camadas de inteligência{' '}
              <span className="text-[#69695D]">que não existem em lugar nenhum.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
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
            ].map((item) => (
              <div key={item.layer} className="relative group">
                <div className="p-8 rounded-[20px] border border-black/[0.08] bg-white hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:border-[#F43E01]/20 transition-all duration-[250ms] ease-in-out">
                  <span className="text-overline text-[#F43E01] font-mono">{item.layer}</span>
                  <h3 className="text-heading font-semibold text-[#26292E] mt-3 mb-3">{item.title}</h3>
                  <p className="text-body-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Sala de Operações (warm bg) ── */}
      <section id="plataforma" className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Funcionalidade exclusiva no mercado</p>
            <h2 className="text-display-lg text-[#26292E] text-balance mb-6">
              Antes de entrar em qualquer disputa,{' '}
              <span className="text-[#69695D]">você já sabe o resultado provável.</span>
            </h2>
            <p className="text-body-lg text-[#69695D] leading-relaxed max-w-2xl mx-auto">
              A Sala de Operações é o centro de comando da sua estratégia. Antes de cada pregão, você recebe um dossiê completo com o histórico de cada concorrente, padrão de lances, win rate e vínculos societários.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
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
            ].map((item) => (
              <div key={item.title} className="relative group">
                <div className="p-8 rounded-[20px] border border-black/[0.08] bg-white hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:border-[#F43E01]/20 transition-all duration-[250ms] ease-in-out">
                  <h3 className="text-heading font-semibold text-[#26292E] mb-3">{item.title}</h3>
                  <p className="text-body-sm text-[#69695D] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Compliance e Certidões (dark bg) ── */}
      <section className="py-20 sm:py-28 bg-[#26292E]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Verificação automática · Sem sair da plataforma</p>
            <h2 className="text-display-lg text-white text-balance mb-6">
              Você está apto para licitar agora?{' '}
              <span className="text-[#69695D]">A resposta leva três segundos.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {[
              'Certidão Negativa de Débitos Federais',
              'Regularidade FGTS',
              'Certidão Negativa de Débitos Trabalhistas (TST)',
              'CNDT — Certidão de Débitos Tributários',
              'Consulta de Impedimentos e Sanções',
              'Validação de CNAEs compatíveis',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 p-5 rounded-[20px] border border-white/[0.08] bg-[#2D2F33]">
                <svg className="w-5 h-5 text-[#F43E01] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-body-sm text-[#CECEBF]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Consultor IA (light bg) ── */}
      <section className="py-20 sm:py-28 bg-[#FAFAF8]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Presente em cada licitação · Exclusivo</p>
          <h2 className="text-display-lg text-[#26292E] text-balance mb-6">
            Cada edital tem um especialista{' '}
            <span className="text-[#69695D]">esperando sua pergunta.</span>
          </h2>
          <p className="text-body-lg text-[#69695D] max-w-2xl mx-auto leading-relaxed mb-12">
            O Consultor de IA lê o edital inteiro e responde qualquer dúvida sobre cláusulas, exigências técnicas, prazos e riscos. Sem baixar nada, sem sair da plataforma. E toda análise pode ser exportada em PDF profissional com a identidade da sua empresa.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                title: 'Análise instantânea',
                desc: 'Pergunte sobre qualquer cláusula ou exigência do edital e receba respostas fundamentadas em segundos.',
              },
              {
                title: 'Exportação em PDF',
                desc: 'Gere relatórios profissionais com a identidade visual da sua empresa, prontos para apresentar à diretoria.',
              },
              {
                title: 'Histórico completo',
                desc: 'Todas as consultas ficam salvas no Drive Licitagram. Conhecimento que se acumula e nunca se perde.',
              },
            ].map((item) => (
              <div key={item.title} className="p-8 rounded-[20px] border border-black/[0.08] bg-white hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:border-[#F43E01]/20 transition-all duration-[250ms] ease-in-out">
                <h3 className="text-heading font-semibold text-[#26292E] mb-3">{item.title}</h3>
                <p className="text-body-sm text-[#69695D] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Drive Licitagram (warm bg) ── */}
      <section className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Memória institucional · Sempre acessível</p>
          <h2 className="text-display-lg text-[#26292E] text-balance mb-6">
            Tudo que a sua empresa produz{' '}
            <span className="text-[#69695D]">nunca se perde.</span>
          </h2>
          <p className="text-body-lg text-[#69695D] max-w-2xl mx-auto leading-relaxed mb-12">
            Cada análise, consulta ao Consultor IA, dossiê pré-pregão e PDF exportado vai automaticamente para o repositório institucional da sua empresa. É a memória do seu departamento de licitações, organizada e pesquisável.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                title: 'Organização automática',
                desc: 'Documentos organizados por licitação, data e tipo — sem esforço manual.',
              },
              {
                title: 'Busca inteligente',
                desc: 'Encontre qualquer documento ou análise anterior em segundos com busca por conteúdo.',
              },
              {
                title: 'Acesso compartilhado',
                desc: 'Toda a equipe acessa o mesmo repositório. Conhecimento que pertence à empresa, não à pessoa.',
              },
            ].map((item) => (
              <div key={item.title} className="p-8 rounded-[20px] border border-black/[0.08] bg-white hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:border-[#F43E01]/20 transition-all duration-[250ms] ease-in-out">
                <h3 className="text-heading font-semibold text-[#26292E] mb-3">{item.title}</h3>
                <p className="text-body-sm text-[#69695D] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. Como Funciona (4 steps) ── */}
      <section className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-4xl mx-auto px-4 text-center mb-4">
          <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Como funciona</p>
          <h2 className="text-display-lg text-[#26292E] text-balance">
            Do cadastro à vitória,{' '}
            <span className="text-[#69695D]">em 4 passos.</span>
          </h2>
        </div>

        <div className="max-w-6xl mx-auto px-4 mt-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                step: '01',
                title: 'Perfil',
                desc: 'Informe seu CNPJ e o sistema busca automaticamente CNAEs, área de atuação e dados na Receita Federal.',
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
                desc: 'O agente autônomo executa sua estratégia de lances com precisão cirúrgica. Você define os limites, ele executa.',
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

      {/* ── Portals (warm bg) ── */}
      <section className="py-20 sm:py-28 bg-[#FAFAF8]">
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
      <section id="testimonials" className="py-20 sm:py-28 bg-[#F3F3EE]">
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

      {/* ── 9. Comparison Table (3 columns) ── */}
      <section className="py-20 sm:py-28 bg-[#FAFAF8]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Comparativo</p>
            <h2 className="text-display text-[#26292E] text-balance">
              Licitagram vs. Outros vs. Manual
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black/[0.08]">
                  <th className="text-body-sm font-semibold text-[#26292E] text-left py-4 pr-4">Funcionalidade</th>
                  <th className="text-body-sm font-semibold text-[#F43E01] text-center py-4 px-4">Licitagram</th>
                  <th className="text-body-sm font-semibold text-[#69695D] text-center py-4 px-4">Outros</th>
                  <th className="text-body-sm font-semibold text-[#69695D] text-center py-4 pl-4">Manual</th>
                </tr>
              </thead>
              <tbody className="text-body-sm">
                {COMPARISON_ROWS.map(([feature, licitagram, outros, manual]) => (
                  <tr key={feature as string} className="border-b border-black/[0.04]">
                    <td className="py-3.5 pr-4 text-[#26292E]">{feature as string}</td>
                    <td className="py-3.5 px-4 text-center">
                      {licitagram === 'Exclusivo' ? (
                        <span className="inline-flex text-caption px-2.5 py-1 rounded-[1000px] bg-[#F43E01]/10 text-[#F43E01] font-semibold">Exclusivo</span>
                      ) : licitagram === true ? (
                        <svg className="w-5 h-5 text-[#F43E01] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-[#CECEBF]">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {outros === 'Parcial' ? (
                        <span className="text-[#9C9C90] text-caption">Parcial</span>
                      ) : outros === true ? (
                        <svg className="w-5 h-5 text-[#69695D] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-[#CECEBF]">&mdash;</span>
                      )}
                    </td>
                    <td className="py-3.5 pl-4 text-center">
                      {manual === true ? (
                        <svg className="w-5 h-5 text-[#69695D] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

      {/* ── 10. Pricing (updated text) ── */}
      <section id="pricing" className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Escolha sua posição</p>
            <h2 className="text-display text-[#26292E] text-balance mb-4">
              Inteligência que escala com o seu nível de ambição.
            </h2>
            <p className="text-body-lg text-[#69695D]">14 dias gratuitos em qualquer plano. Sem compromisso.</p>
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
      <section id="faq" className="py-20 sm:py-28 bg-[#FAFAF8]">
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

      {/* ── 11. Detecção de Fraude — Para Governos (dark bg) ── */}
      <section id="governos" className="py-20 sm:py-28 bg-[#26292E]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Para governos, TCEs e órgãos de controle</p>
            <h2 className="text-display-lg text-white text-balance mb-6">
              A mesma inteligência que você usa para ganhar{' '}
              <span className="text-[#69695D]">é a que usamos para garantir que o jogo seja justo.</span>
            </h2>
            <p className="text-body-lg text-[#9C9C90] leading-relaxed max-w-2xl mx-auto">
              Nosso motor de correlação com 64 milhões de entidades é a ferramenta mais poderosa de compliance e detecção de fraudes em licitações da América Latina.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {[
              {
                title: 'Tribunais de Contas (TCEs)',
                desc: 'Detecção de cartéis, empresas de fachada e conluio em licitações estaduais e municipais.',
              },
              {
                title: 'Órgãos de Controle',
                desc: 'Análise de vínculos societários ocultos e padrões de fraude em contratações públicas.',
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
                title: 'Empresas Públicas',
                desc: 'Verificação de idoneidade de fornecedores e monitoramento de risco contratual.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="group p-6 rounded-[20px] border border-white/[0.08] bg-[#2D2F33] hover:border-[#F43E01]/30 hover:bg-[#2D2F33]/80 transition-all duration-[250ms] ease-in-out"
              >
                <h3 className="font-semibold text-white mb-2 text-body">{item.title}</h3>
                <p className="text-body-sm text-[#9C9C90] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 12. Expansão ── */}
      <section className="py-20 sm:py-28 bg-[#F3F3EE]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-overline uppercase text-[#F43E01] tracking-widest mb-4">Visão de longo prazo</p>
          <h2 className="text-display-lg text-[#26292E] text-balance mb-6">
            Brasil primeiro.{' '}
            <span className="text-[#69695D]">América Latina a seguir.</span>
          </h2>
          <p className="text-body-lg text-[#69695D] max-w-2xl mx-auto leading-relaxed mb-12">
            Estamos construindo a infraestrutura de inteligência de compras governamentais para todo o continente. O Brasil é o começo.
          </p>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-4xl sm:text-5xl">
            {['🇧🇷', '🇲🇽', '🇨🇴', '🇨🇱', '🇦🇷', '🇵🇪', '🇺🇾', '🇧🇴', '🇦🇴', '🇨🇻'].map((flag, i) => (
              <span key={i} className="inline-block hover:scale-110 transition-transform duration-150 ease-in-out">{flag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 13. CTA Section (Orange block) ── */}
      <section className="py-20 sm:py-28 bg-[#F43E01] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-display-lg text-white text-balance mb-6">
            Seus concorrentes ainda procuram licitações em portais. Você já pode ver onde o dinheiro está.
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

      {/* ── 14. Footer (dark) ── */}
      <footer className="py-16 bg-[#26292E] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10">
            <div className="sm:col-span-2 md:col-span-1">
              <div className="flex items-center mb-4">
                <Image src="/logo.png" alt="Licitagram" width={140} height={32} className="h-8 w-auto brightness-0 invert" />
              </div>
              <p className="text-body-sm text-[#9C9C90] leading-relaxed">
                O maior sistema privado de inteligência de compras governamentais da América Latina.
              </p>
            </div>
            <div>
              <h4 className="text-overline uppercase text-[#69695D] mb-4 tracking-widest">Produto</h4>
              <ul className="space-y-3 text-body-sm">
                <li><a href="#inteligencia" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Inteligência</a></li>
                <li><a href="#mapa" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Mapa</a></li>
                <li><a href="#plataforma" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Sala de Operações</a></li>
                <li><a href="#faq" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Consultor de IA</a></li>
                <li><span className="text-[#CECEBF]">Drive</span></li>
                <li><a href="#pricing" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Planos</a></li>
                <li><span className="text-[#69695D]">API (em breve)</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-overline uppercase text-[#69695D] mb-4 tracking-widest">Plataforma</h4>
              <ul className="space-y-3 text-body-sm">
                <li><a href="#governos" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Para TCEs</a></li>
                <li><span className="text-[#CECEBF]">Para bancos</span></li>
                <li><span className="text-[#CECEBF]">Para empresas</span></li>
                <li><span className="text-[#69695D]">Status</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-overline uppercase text-[#69695D] mb-4 tracking-widest">Legal</h4>
              <ul className="space-y-3 text-body-sm">
                <li><span className="text-[#69695D]">Termos de Uso</span></li>
                <li><span className="text-[#69695D]">Política de Privacidade</span></li>
                <li><Link href="/login" className="text-[#CECEBF] hover:text-white transition-all duration-150 ease-in-out">Entrar</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/[0.08] text-center space-y-2">
            <p className="text-caption text-[#69695D]">&copy; 2026 Licitagram · ZeepCode Group Technology LLC · Florida, USA</p>
            <p className="text-caption text-[#69695D]">Serving Brazil · Expanding LatAm</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
