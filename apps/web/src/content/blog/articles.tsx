/**
 * Blog articles — TSX components with frontmatter-like metadata.
 * Zero-dependency alternative to MDX: each article exports its metadata
 * plus a React component. The [slug] route resolves slug → component.
 *
 * To add an article:
 *   1. Append a new entry to ARTICLES
 *   2. Export the article's component below
 *   3. Ship. Sitemap + RSS update automatically from ARTICLES.
 */

import type { ReactNode } from 'react'

export interface ArticleMeta {
  slug: string
  title: string
  description: string
  keywords: string[]
  publishedAt: string // ISO date
  updatedAt?: string
  author: string
  readingTimeMin: number
  category: 'legislacao' | 'estrategia' | 'como-fazer' | 'tecnologia' | 'mercado'
  heroImage?: string
}

export interface Article {
  meta: ArticleMeta
  Component: () => ReactNode
}

// ─── Shared components ───────────────────────────────────────────────────

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-semibold tracking-tight text-foreground mt-10 mb-4 scroll-mt-20">
      {children}
    </h2>
  )
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">{children}</h3>
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-base leading-relaxed text-muted-foreground mb-4">{children}</p>
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-6 space-y-2 mb-4 text-muted-foreground">{children}</ul>
}

function Callout({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'tip'; children: ReactNode }) {
  const styles = {
    info: 'border-blue-500/30 bg-blue-500/5',
    warn: 'border-amber-500/30 bg-amber-500/5',
    tip: 'border-emerald-500/30 bg-emerald-500/5',
  }
  return (
    <aside className={`rounded-xl border ${styles[kind]} p-4 my-6 text-sm text-foreground`}>
      {children}
    </aside>
  )
}

// ─── ARTICLE 1 ──────────────────────────────────────────────────────────

function Article_ComoGanharPregaoEletronico() {
  return (
    <>
      <P>
        Ganhar um pregão eletrônico em 2026 não é mais sobre digitar rápido. A Lei 14.133/2021
        e as instruções normativas SEGES/ME 67/2021 e 73/2022 mudaram o jogo: o que decide
        hoje é <strong className="text-foreground">parametrização correta</strong>,
        <strong className="text-foreground"> preço de referência real</strong> e
        <strong className="text-foreground"> velocidade de reação a mensagens do pregoeiro</strong>.
      </P>

      <H2 id="como-funciona">Como funciona o pregão eletrônico hoje</H2>
      <P>
        Na prática, o pregão eletrônico tem 5 fases claras: publicação do edital no PNCP,
        envio de propostas, abertura, disputa de lances, e habilitação. A fase de disputa
        é onde o robô público (instituído pela IN 67/2021) entra — você parametriza um
        valor final mínimo e o intervalo de decremento, e o portal do Compras.gov.br
        executa os lances automaticamente em seu nome.
      </P>

      <H2 id="erros-caros">Os 5 erros mais caros em pregão</H2>
      <UL>
        <li><strong>Valor final mínimo errado.</strong> 73% dos licitantes perdem pregões porque param antes do concorrente. Base o cálculo em preço de mercado real (NF-e), não no edital.</li>
        <li><strong>Ignorar o chat do pregoeiro.</strong> Diligências e convocações têm prazo curto — muitas vezes menos de 2h. Monitoramento em tempo real com alerta WhatsApp é obrigatório.</li>
        <li><strong>Não validar CNDs.</strong> 1 em cada 5 licitantes é desabilitado na fase de habilitação por certidão vencida. Automação de certidões é commodity.</li>
        <li><strong>Parametrização tímida do robô público.</strong> O robô oficial decrementa pelo step mínimo até o teto — se seu teto for conservador, você perde de quem colocou teto agressivo.</li>
        <li><strong>Não ler o edital com IA.</strong> Cláusulas restritivas (exigência de atestado específico, marca) eliminam participação. Um assistente jurídico-IA detecta em segundos.</li>
      </UL>

      <H2 id="estrategia-2026">A estratégia vencedora em 2026</H2>
      <P>
        A fórmula que venceu os dois últimos trimestres entre os top 5% de licitantes:
      </P>
      <UL>
        <li><strong>Floor baseado em preço de mercado.</strong> Não confie só em valor homologado histórico. Cruze com NF-e e preços praticados. Licitagram tem acesso a 4 fontes (PNCP + Dados Abertos + BPS Saúde + Painel de Preços).</li>
        <li><strong>Modo supervisor &gt; modo auto-bid.</strong> Em 2026 o TCU tolera o robô público (IN 67/2021), mas alguns TCEs estaduais questionam robôs terceiros. Use o robô oficial, só parametrizando melhor que os concorrentes.</li>
        <li><strong>Forensic Replay pós-pregão.</strong> Perdeu? Analise. Entenda em qual milissegundo o concorrente bateu seu floor. É como assistir o próprio jogo em câmera lenta.</li>
        <li><strong>Score do Órgão Pagador.</strong> Não adianta ganhar pregão de órgão que paga em 180 dias. Priorize UASGs com histórico de pagamento &lt;30 dias.</li>
      </UL>

      <H2 id="ferramentas">Ferramentas que o top 5% usa</H2>
      <P>
        Além da Licitagram (óbvio), o toolkit do licitante tier-1:
      </P>
      <UL>
        <li>Sistema de monitoramento de chat em tempo real (Licitagram Monitor de Pregão)</li>
        <li>Inteligência de preços multi-fonte (Licitagram Preços de Mercado)</li>
        <li>Robô de lances com Forensic Replay (Licitagram Supreme Bot)</li>
        <li>Automação de certidões (Blindagem de Compliance)</li>
        <li>Gerador automático de impugnação para edital com cláusula restritiva</li>
      </UL>

      <Callout kind="tip">
        <strong>Dica prática:</strong> antes de participar, rode sempre o Pre-Dispute Checklist.
        24h antes do pregão, a IA extrai cláusulas de risco do edital, confere CNDs, valida
        preço de referência vs. histórico, e manda resumo no WhatsApp. Se tiver 3 alertas,
        você escolhe: participar corrigindo, ou desistir e focar em outra oportunidade.
      </Callout>

      <H2 id="conclusao">Conclusão</H2>
      <P>
        Ganhar pregão eletrônico em 2026 é menos sobre velocidade de clique e mais sobre
        inteligência de parametrização. Quem domina valor final mínimo baseado em NF-e real,
        monitora chat em tempo real, e usa Forensic Replay para aprender — está no top 5%.
      </P>
      <P>
        Quer começar? A <a href="/signup" className="text-brand underline">Licitagram oferece
        14 dias grátis</a> com acesso a tudo: matching IA, monitor de pregão, robô de lances,
        preços de mercado e compliance automático.
      </P>
    </>
  )
}

// ─── ARTICLE 2 ──────────────────────────────────────────────────────────

function Article_IN732022() {
  return (
    <>
      <P>
        A Instrução Normativa SEGES/ME nº 73, de 30 de setembro de 2022, redefiniu as regras
        do pregão eletrônico no Compras.gov.br. A mudança mais importante para quem litiga:
        o <strong className="text-foreground">intervalo mínimo de 6 segundos entre lances
        do mesmo licitante</strong>. Se você tinha um bot submetendo a cada 3s, está
        violando a IN 73.
      </P>

      <H2 id="o-que-e">O que é a IN 73/2022</H2>
      <P>
        É a norma que regulamenta a Lei 14.133/2021 no Compras.gov.br. Consolida a IN 67/2021
        (que criou o robô público) com ajustes operacionais que afetam a parametrização de
        qualquer robô terceiro e os prazos internos da disputa.
      </P>

      <H2 id="5-mudancas">As 5 mudanças que impactam licitantes</H2>
      <UL>
        <li><strong>Intervalo mínimo de 6s entre lances do mesmo licitante.</strong> Antes era 20s (TCU acórdão 2019/2010). Agora é 6s — mais ágil, mas o edital pode exigir valor maior.</li>
        <li><strong>Valor final mínimo sigiloso.</strong> Você parametriza um floor que nem o pregoeiro vê — só o portal consulta para executar. Fim da guerra de espelhos.</li>
        <li><strong>Fase de encerramento aleatório mantida.</strong> Entre 0 e 30 minutos adicionais após o tempo visível. Ninguém sabe quando fecha — mata a sniper bid.</li>
        <li><strong>Convocação para contraproposta.</strong> Pregoeiro pode chamar o primeiro colocado para reduzir lance. Prazo de resposta: 2h. Quem não tem WhatsApp monitorando, perde.</li>
        <li><strong>Diligências formalizadas.</strong> Antes era informal via chat. Agora tem prazo e formato. Automação de monitoramento é obrigatória para quem participa de 10+ pregões/mês.</li>
      </UL>

      <H2 id="compliance">Como estar em compliance</H2>
      <P>
        Se você usa robô próprio (não o oficial do Compras.gov.br), precisa garantir:
      </P>
      <UL>
        <li>Intervalo &ge; 6s entre lances do mesmo item (ou o que o edital especificar)</li>
        <li>Respeito à fase aleatória — NÃO tente prever quando fecha</li>
        <li>Log auditável de cada lance (timestamp + valor + confirmação do portal)</li>
        <li>Identificação clara do licitante responsável (não é anônimo — CNPJ é público)</li>
      </UL>

      <Callout kind="warn">
        <strong>Atenção TCE:</strong> Alguns TCEs estaduais (notadamente TCE-PR) têm posição
        mais restritiva sobre robôs terceiros, mesmo compliant com IN 73. Para pregões estaduais,
        consulte o parecer jurídico específico. O robô público do Compras.gov.br continua
        incontestável.
      </Callout>

      <H2 id="licitagram-ln73">Como a Licitagram implementa IN 73/2022</H2>
      <P>
        O Licitagram Supreme Bot, por padrão, opera em <strong>modo supervisor</strong> — só
        parametriza o floor no robô público oficial. Zero risco jurídico. No modo
        <strong> auto-bid</strong>, respeitamos o intervalo mínimo configurável (padrão 6s)
        e logamos cada lance com timestamp UTC e confirmação XHR do portal.
      </P>

      <P>
        Toda sessão gera um <a href="/bot" className="text-brand underline">Forensic Replay</a>
        completo: timeline, latências, lances rivais, fases. É seu registro auditável para
        qualquer impugnação.
      </P>
    </>
  )
}

// ─── ARTICLE 3 ──────────────────────────────────────────────────────────

function Article_NovaLeiLicitacoesGuia() {
  return (
    <>
      <P>
        A <strong className="text-foreground">Lei 14.133/2021</strong> substituiu a Lei 8.666/1993
        e a 10.520/2002 (pregão). Em 2026, é a ÚNICA lei vigente para licitações públicas — o
        período de transição acabou. Se sua empresa ainda opera como se fosse 8.666, você
        está perdendo oportunidades e se expondo a anulação.
      </P>

      <H2 id="principais">Principais mudanças da 14.133</H2>
      <UL>
        <li><strong>PNCP centralizado.</strong> Todos os editais DEVEM ser publicados no Portal Nacional de Contratações Públicas (pncp.gov.br). Fim do garimpo por diário oficial.</li>
        <li><strong>Diálogo competitivo.</strong> Nova modalidade para contratações complexas. Permite negociação iterativa antes da proposta final.</li>
        <li><strong>Credenciamento formalizado.</strong> Virou modalidade própria. Útil para serviços de demanda contínua (telemedicina, coleta de lixo).</li>
        <li><strong>Habilitação antes da proposta.</strong> Em alguns casos, você já chega com documentos validados — reduz tempo de disputa.</li>
        <li><strong>Parcela mínima de MPE.</strong> Empresas de pequeno porte têm preferência em certos objetos (até R$80k para bens/serviços).</li>
      </UL>

      <H2 id="modalidades">Modalidades em 2026</H2>
      <UL>
        <li><strong>Concorrência</strong> — regra geral, qualquer valor</li>
        <li><strong>Pregão</strong> — bens e serviços comuns, menor preço</li>
        <li><strong>Concurso</strong> — trabalhos técnicos, artísticos, científicos</li>
        <li><strong>Leilão</strong> — alienação de bens públicos</li>
        <li><strong>Diálogo competitivo</strong> — inovação, contratações complexas</li>
        <li><strong>Credenciamento</strong> — serviços de demanda aberta</li>
      </UL>

      <H2 id="riscos">Riscos para quem ignora</H2>
      <P>
        Continuar operando sob 8.666 em 2026 pode:
      </P>
      <UL>
        <li>Anular sua participação por desconformidade (cláusulas obsoletas na proposta)</li>
        <li>Perder prazos de impugnação (14.133 mudou cronograma)</li>
        <li>Não usufruir das preferências para MPE (8.666 tinha regras diferentes)</li>
        <li>Ficar cego para editais publicados SÓ no PNCP (diários oficiais estão esvaziando)</li>
      </UL>

      <H2 id="passos">Passos concretos para se adequar</H2>
      <UL>
        <li>Configure monitoramento no PNCP (Licitagram faz isso nativo)</li>
        <li>Revise seus modelos de proposta à luz da 14.133 (Fábrica de Propostas atualiza automático)</li>
        <li>Treine equipe em diálogo competitivo e credenciamento</li>
        <li>Assine parecer jurídico atualizado</li>
      </UL>
    </>
  )
}

// ─── ARTICLE 4 ──────────────────────────────────────────────────────────

function Article_CalcularValorFinalMinimo() {
  return (
    <>
      <P>
        O <strong className="text-foreground">valor final mínimo</strong> é o número mais
        importante que você vai calcular em um pregão. É o chão abaixo do qual seu robô
        (ou você) não desce. Se for baixo demais, você deixa dinheiro na mesa. Se for alto
        demais, perde para o concorrente. Este artigo mostra como o top 10% calcula.
      </P>

      <H2 id="base">A base: custo real + margem mínima saudável</H2>
      <P>
        Começa pelo trivial: custo direto + custo indireto + encargos + BDI + margem mínima.
        Mas <em>esse</em> é o mínimo ABSOLUTO, não o tático. Se você parar aí, perde sempre.
      </P>

      <H2 id="mercado">Cruze com preço de mercado real</H2>
      <P>
        Aqui está o salto. Preço de mercado REAL (não homologado) mostra onde o mercado
        está praticando AGORA. Três fontes:
      </P>
      <UL>
        <li><strong>NF-e emitidas.</strong> Via Transparência estadual ou NFe.io — mostra preço de venda B2B/B2G recente.</li>
        <li><strong>PNCP — itens homologados.</strong> Preço que GANHOU pregões similares nos últimos 90 dias.</li>
        <li><strong>Painel de Preços do governo federal.</strong> Referência oficial.</li>
      </UL>
      <P>
        Quando 3 fontes convergem em uma faixa, você tem o <em>preço-verdade</em>. Seu floor
        deveria ficar 2-5% abaixo disso.
      </P>

      <H2 id="concorrente">Analise o concorrente histórico</H2>
      <P>
        Quem costuma atender esse UASG? Puxe histórico. Existem 3 perfis típicos:
      </P>
      <UL>
        <li><strong>Concorrente agressivo.</strong> Sempre chega a 0.5% do teto estimado. Seu floor precisa ser mais agressivo.</li>
        <li><strong>Concorrente conservador.</strong> Para em 5-8% do teto. Seu floor pode ser 3%.</li>
        <li><strong>Concorrente oportunista.</strong> Só aparece em pregões específicos. Verifique se é um deles.</li>
      </UL>

      <H2 id="orgao">Pondere pela qualidade do órgão pagador</H2>
      <P>
        Prazo de pagamento varia de 15 a 180 dias entre órgãos. Calcule o custo financeiro:
      </P>
      <UL>
        <li>Órgão que paga em 30d: margem pode ser 10%</li>
        <li>Órgão que paga em 90d: margem mínima 15% (custo de capital)</li>
        <li>Órgão com histórico de calote: evite ou margem 25%+</li>
      </UL>
      <P>
        Licitagram tem um Score de Órgão Pagador por UASG. Use antes de calcular o floor.
      </P>

      <H2 id="formula">A fórmula consolidada</H2>
      <Callout kind="tip">
        <strong>Floor ótimo</strong> = máx(<br />
        &nbsp;&nbsp;custo + margem mínima operacional,<br />
        &nbsp;&nbsp;preço-verdade de mercado × 0.97,<br />
        &nbsp;&nbsp;último lance do concorrente agressivo histórico × 0.99<br />
        ) × (1 + prêmio de risco do órgão pagador)
      </Callout>

      <P>
        O Licitagram Floor Optimizer executa essa fórmula automaticamente. Você só aprova.
      </P>
    </>
  )
}

// ─── ARTICLE 5 ──────────────────────────────────────────────────────────

function Article_PrecoMercadoLicitacao() {
  return (
    <>
      <P>
        Preço de referência do edital ≠ preço de mercado. Essa distinção, ignorada por 80%
        dos licitantes, decide quem ganha e quem perde. Este artigo explica a diferença e
        mostra como obter o preço de mercado REAL de qualquer item.
      </P>

      <H2 id="diferenca">A diferença crítica</H2>
      <P>
        <strong className="text-foreground">Preço de referência do edital:</strong> o número
        que o órgão público estima pagar. Geralmente baseado em cotações internas, tabela SINAPI,
        Painel de Preços. Quase sempre desatualizado 6-12 meses.
      </P>
      <P>
        <strong className="text-foreground">Preço de mercado real:</strong> o que fornecedores
        estão efetivamente vendendo AGORA. Varia por região, escala e fornecedor.
      </P>
      <P>
        Quando os dois divergem (e divergem muito), você tem oportunidade ou armadilha:
      </P>
      <UL>
        <li><strong>Edital R$ 100, mercado R$ 80</strong> → oportunidade. Você pode ganhar com margem cheia.</li>
        <li><strong>Edital R$ 100, mercado R$ 120</strong> → armadilha. Qualquer proposta compliant vai dar prejuízo.</li>
      </UL>

      <H2 id="fontes">4 fontes para descobrir preço de mercado real</H2>
      <UL>
        <li><strong>Notas fiscais eletrônicas (NF-e).</strong> Transparência estadual expõe NF-e emitidas. APIs como NFe.io consolidam. Mostra preço B2B praticado ontem.</li>
        <li><strong>PNCP — preços homologados recentes.</strong> Últimos 90 dias em UASGs similares. Licitagram indexa 2M+ registros.</li>
        <li><strong>Painel de Preços Planejamento.</strong> Federal, gratuito. Atualização mensal.</li>
        <li><strong>Banco de Preços em Saúde (BPS).</strong> Específico para medicamentos, insumos, equipamentos hospitalares.</li>
      </UL>

      <H2 id="como-usar">Como a Licitagram consolida</H2>
      <P>
        A página de <a href="/price-history" className="text-brand underline">Preços de Mercado</a>
        do Licitagram cruza as 4 fontes em tempo real e emite um <strong>Selo de Referência
        Validada</strong> quando 3 ou mais convergem. Essa é a base sólida para parametrizar
        floor no robô público ou no Supreme Bot.
      </P>

      <H2 id="exemplo">Exemplo prático</H2>
      <P>
        Pregão de <em>locação de gerador 250 KVA para uso contínuo</em>:
      </P>
      <UL>
        <li>Edital: R$ 180/dia (referência PNC)</li>
        <li>PNCP 90 dias: mediana R$ 165/dia (127 homologações)</li>
        <li>NFe B2B SP: mediana R$ 170/dia</li>
        <li>Painel Preços: R$ 175/dia</li>
        <li>Referência validada: R$ 168-172/dia</li>
      </UL>
      <P>
        Floor ótimo: 2% abaixo da referência = <strong>R$ 164/dia</strong>. Floor conservador
        (edital): R$ 176/dia — seu concorrente compra pelo edital e ganha.
      </P>

      <Callout kind="tip">
        A diferença de R$ 12/dia × 365 dias × contrato × confederação = cifras reais de
        milhões em pregões de escala. Dominar preço de mercado real é o #1 hábito do top 5%.
      </Callout>
    </>
  )
}

// ─── Registry ────────────────────────────────────────────────────────────

export const ARTICLES: Article[] = [
  {
    meta: {
      slug: 'como-ganhar-pregao-eletronico-2026',
      title: 'Como ganhar pregão eletrônico em 2026: o guia definitivo',
      description: 'Estratégias reais que o top 5% de licitantes usa para ganhar pregões eletrônicos em 2026. Parametrização, monitoramento de chat, Forensic Replay e mais.',
      keywords: ['como ganhar pregão eletrônico', 'pregão 2026', 'estratégia pregão', 'licitação eletrônica', 'Compras.gov.br', 'robô lances', 'valor final mínimo'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 8,
      category: 'estrategia',
    },
    Component: Article_ComoGanharPregaoEletronico,
  },
  {
    meta: {
      slug: 'in-73-2022-o-que-muda-pregao-eletronico',
      title: 'IN 73/2022 no pregão eletrônico: o que muda na prática',
      description: 'Análise prática da Instrução Normativa SEGES/ME 73/2022: intervalo mínimo de 6s, valor final mínimo sigiloso, fase aleatória e compliance para robôs.',
      keywords: ['IN 73 2022', 'instrução normativa pregão', 'compliance robô licitação', 'intervalo mínimo lance', 'Compras.gov.br regras'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 6,
      category: 'legislacao',
    },
    Component: Article_IN732022,
  },
  {
    meta: {
      slug: 'nova-lei-licitacoes-14133-guia-completo',
      title: 'Nova Lei de Licitações 14.133/2021: guia completo para 2026',
      description: 'Tudo o que mudou com a Lei 14.133/2021 comparado à 8.666/1993. Modalidades, prazos, PNCP centralizado, diálogo competitivo e preferências MPE.',
      keywords: ['lei 14133', 'nova lei licitações', 'Lei 14.133/2021', 'PNCP', '14133 vs 8666', 'licitação 2026'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 7,
      category: 'legislacao',
    },
    Component: Article_NovaLeiLicitacoesGuia,
  },
  {
    meta: {
      slug: 'como-calcular-valor-final-minimo-pregao',
      title: 'Como calcular valor final mínimo no pregão eletrônico (com fórmula)',
      description: 'Fórmula completa para calcular o valor final mínimo (floor) em pregões eletrônicos. Custo + preço de mercado real + análise de concorrente + score do órgão pagador.',
      keywords: ['valor final mínimo pregão', 'como calcular floor licitação', 'parametrização robô público', 'IN 67 2021', 'valor mínimo sigiloso'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 7,
      category: 'como-fazer',
    },
    Component: Article_CalcularValorFinalMinimo,
  },
  {
    meta: {
      slug: 'preco-mercado-licitacao-como-descobrir',
      title: 'Preço de mercado em licitação: 4 fontes para descobrir o preço REAL',
      description: 'A diferença entre preço de referência do edital e preço de mercado real decide quem ganha pregão. Aprenda as 4 fontes que o top 5% consulta.',
      keywords: ['preço mercado licitação', 'preço referência pregão', 'banco de preços', 'painel de preços planejamento', 'pesquisa preço licitação'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 8,
      category: 'mercado',
    },
    Component: Article_PrecoMercadoLicitacao,
  },
]

export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.meta.slug === slug)
}

export function getAllArticles(): Article[] {
  return [...ARTICLES].sort(
    (a, b) => new Date(b.meta.publishedAt).getTime() - new Date(a.meta.publishedAt).getTime(),
  )
}
