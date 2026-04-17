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
        Quer começar? A <a href="/register" className="text-brand underline">Licitagram oferece
        7 dias grátis</a> com acesso a tudo: matching IA, monitor de pregão, robô de lances,
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

// ─── ARTICLE 6 ──────────────────────────────────────────────────────────

function Article_ComoParticiparPregaoEletronico() {
  return (
    <>
      <P>
        Nunca participou de pregão eletrônico? Este guia mostra o caminho completo —
        do cadastro inicial até seu primeiro lance submetido. Sem enrolação, sem
        linguagem técnica inútil. Em menos de 2 horas você está apto a concorrer.
      </P>

      <H2 id="pre-requisitos">Pré-requisitos</H2>
      <UL>
        <li><strong>CNPJ ativo</strong> compatível com o objeto da licitação (CNAE)</li>
        <li><strong>Certificado digital A1 ou A3</strong> (e-CPF ou e-CNPJ, ICP-Brasil)</li>
        <li><strong>Certidões negativas</strong> válidas: Receita Federal, FGTS, Trabalhista, Estadual, Municipal</li>
        <li><strong>Cadastro no SICAF</strong> (Sistema de Cadastramento Unificado de Fornecedores)</li>
      </UL>

      <H2 id="passo-1-sicaf">Passo 1 — Cadastrar no SICAF</H2>
      <P>
        Sem SICAF, você não participa de nenhum pregão federal. O cadastro é
        gratuito, feito 100% online em <a href="https://www3.comprasnet.gov.br/sicaf-web/" className="text-brand underline">comprasnet.gov.br/sicaf-web</a>.
        Guardamos um artigo dedicado ao{' '}
        <a href="/blog/sicaf-cadastro-completo" className="text-brand underline">cadastro completo no SICAF</a>.
      </P>

      <H2 id="passo-2-monitoramento">Passo 2 — Monitorar editais</H2>
      <P>
        Editais são publicados no PNCP (Portal Nacional de Contratações Públicas,
        Lei 14.133/2021). A maneira manual é entrar diariamente em pncp.gov.br e
        filtrar. A maneira inteligente é usar um sistema de matching IA como a
        Licitagram — alertas no WhatsApp com o que bate com seu perfil.
      </P>

      <H2 id="passo-3-edital">Passo 3 — Ler o edital criticamente</H2>
      <P>
        Antes de participar, verifique:
      </P>
      <UL>
        <li><strong>Objeto</strong> — é compatível com seu CNAE e capacidade?</li>
        <li><strong>Valor estimado</strong> — faz sentido vs. preço de mercado real?</li>
        <li><strong>Habilitação</strong> — você tem TODOS os documentos exigidos?</li>
        <li><strong>Visita técnica</strong> — obrigatória? Prazo respeitado?</li>
        <li><strong>Atestados de capacidade</strong> — você tem os exigidos?</li>
      </UL>
      <P>
        Se encontrou cláusula restritiva (direciona para 1 fornecedor), considere
        impugnar. Veja nosso guia de{' '}
        <a href="/blog/como-impugnar-edital-licitacao" className="text-brand underline">impugnação de edital</a>.
      </P>

      <H2 id="passo-4-proposta">Passo 4 — Enviar proposta</H2>
      <P>
        No Compras.gov.br, dentro do prazo do edital, você envia a proposta inicial
        com valor e descrição técnica. <strong className="text-foreground">Atenção:</strong>{' '}
        é proposta LACRADA — pregoeiro só vê depois da abertura. Se for muito alta,
        você é desclassificado antes da disputa.
      </P>

      <H2 id="passo-5-disputa">Passo 5 — Disputa de lances</H2>
      <P>
        Na hora da disputa (data/hora do edital), você entra na sala do pregão e
        pode dar lances menores que o melhor lance atual. Aqui é onde o robô público
        do Compras.gov.br (IN 67/2021) ajuda: você parametriza um <strong className="text-foreground">valor final mínimo</strong>{' '}
        (teto de queda) e o portal executa por você, respeitando o intervalo mínimo
        de 6 segundos entre lances (IN 73/2022).
      </P>

      <H2 id="passo-6-habilitacao">Passo 6 — Habilitação</H2>
      <P>
        Ganhou a disputa? O pregoeiro convoca o licitante arrematante para enviar
        documentos de habilitação. Prazo típico: <strong className="text-foreground">2 a 4 horas</strong>.
        Se faltar um documento ou estiver vencido, você é desabilitado e o segundo
        colocado assume. Por isso automação de certidões é crítica.
      </P>

      <H2 id="passo-7-homologacao">Passo 7 — Adjudicação e homologação</H2>
      <P>
        Após habilitado, o pregoeiro adjudica o item para você. A autoridade superior
        homologa. Daí sai o contrato ou autorização de fornecimento. Fim.
      </P>

      <Callout kind="tip">
        <strong>Atalho:</strong> a Licitagram automatiza os passos 2 (monitoramento),
        3 (análise IA do edital), 4 (geração de proposta), 5 (robô de lance com
        Floor Optimizer) e 6 (blindagem de compliance). Você fica com a decisão
        estratégica.
      </Callout>
    </>
  )
}

// ─── ARTICLE 7 ──────────────────────────────────────────────────────────

function Article_SicafCadastroCompleto() {
  return (
    <>
      <P>
        SICAF — Sistema de Cadastramento Unificado de Fornecedores — é pré-requisito
        obrigatório para participar de pregões federais e muitos estaduais. O cadastro
        é gratuito e 100% online. Este guia mostra o processo completo, com as
        armadilhas que eliminam 40% das empresas na primeira tentativa.
      </P>

      <H2 id="o-que-e">O que é SICAF</H2>
      <P>
        É um banco de dados mantido pelo governo federal com informações de fornecedores
        interessados em licitações públicas. Funciona como &ldquo;habilitação prévia&rdquo;:
        quem está em dia no SICAF ganha agilidade na fase de habilitação (documentos
        já validados).
      </P>

      <H2 id="documentos">Documentos necessários (checklist)</H2>
      <UL>
        <li><strong>CNPJ</strong> da empresa ativo</li>
        <li><strong>Contrato social</strong> atualizado (ou estatuto + ata de eleição)</li>
        <li><strong>CPF + RG do sócio administrador</strong></li>
        <li><strong>Certificado digital e-CNPJ</strong> tipo A1 ou A3</li>
        <li><strong>Certidões negativas</strong>: Receita Federal, FGTS, Trabalhista (TST), Estadual, Municipal</li>
        <li><strong>Balanço patrimonial</strong> do último exercício (se for obrigado por lei)</li>
        <li><strong>Declaração de microempresa/EPP</strong> (se aplicável)</li>
      </UL>

      <H2 id="passo-a-passo">Passo a passo do cadastro</H2>
      <H3>1. Acesse comprasnet.gov.br/sicaf-web</H3>
      <P>
        Use o certificado digital e-CNPJ. O sistema reconhece automaticamente.
      </P>

      <H3>2. Preencha os 6 níveis de habilitação</H3>
      <UL>
        <li><strong>Nível I — Credenciamento:</strong> dados básicos (CNPJ, endereço, atividade)</li>
        <li><strong>Nível II — Habilitação jurídica:</strong> contrato social, atos constitutivos</li>
        <li><strong>Nível III — Regularidade fiscal:</strong> certidões negativas federais, estaduais, municipais</li>
        <li><strong>Nível IV — Regularidade trabalhista:</strong> TST, FGTS</li>
        <li><strong>Nível V — Qualificação técnica:</strong> atestados de capacidade (opcional no cadastro)</li>
        <li><strong>Nível VI — Qualificação econômico-financeira:</strong> balanço patrimonial, DRE</li>
      </UL>

      <H3>3. Envie documentos digitalizados</H3>
      <P>
        PDF legível, resolução mínima 300 DPI. Assinatura digital preferível.
      </P>

      <H3>4. Aguarde validação</H3>
      <P>
        Prazo médio: <strong className="text-foreground">3 a 7 dias úteis</strong>.
        O SICAF envia e-mail quando cada nível é aprovado/rejeitado.
      </P>

      <H2 id="armadilhas">Os 5 erros mais comuns</H2>
      <UL>
        <li><strong>Certidão vencida no momento do upload.</strong> Emita todas no mesmo dia do envio.</li>
        <li><strong>PDF ilegível.</strong> Certidão do portal &gt; print de tela.</li>
        <li><strong>Contrato social desatualizado.</strong> Qualquer alteração não registrada reprova o nível II.</li>
        <li><strong>CNPJ com situação cadastral irregular</strong> na Receita (suspenso, inapto).</li>
        <li><strong>Documentação do representante divergente</strong> do contrato social.</li>
      </UL>

      <H2 id="renovacao">Renovação e manutenção</H2>
      <P>
        O cadastro não tem prazo fixo de validade, mas <strong className="text-foreground">certidões
        vencem — normalmente 30, 60 ou 180 dias</strong> dependendo do tipo. Manter o SICAF
        &ldquo;verde&rdquo; exige atualização contínua.
      </P>
      <P>
        A Blindagem de Compliance da Licitagram monitora todas as certidões da empresa,
        emite automaticamente quando possível, e alerta antes do vencimento.
      </P>

      <Callout kind="warn">
        <strong>Atenção:</strong> cadastro SICAF NÃO habilita automaticamente para estados
        e municípios. Cada ente pode ter seu próprio cadastro (ex: SICAD/MG, CADFOR/SP).
        Licitagram consolida acompanhamento em uma só tela.
      </Callout>
    </>
  )
}

// ─── ARTICLE 8 ──────────────────────────────────────────────────────────

function Article_EmpateFictoMEEPP() {
  return (
    <>
      <P>
        O empate ficto é um dos mecanismos mais poderosos (e mal aproveitados) para
        microempresas (ME) e empresas de pequeno porte (EPP) em licitações públicas.
        Bem usado, pode inverter um resultado onde você ficou em segundo. Este artigo
        explica a regra atualizada pela Lei 14.133/2021 e pelo Estatuto da ME/EPP.
      </P>

      <H2 id="o-que-e">O que é empate ficto</H2>
      <P>
        É a <strong className="text-foreground">preferência de desempate</strong> concedida
        a ME e EPP quando sua proposta final for até <strong className="text-foreground">5%
        superior</strong> à melhor proposta de licitante não-ME/EPP (pregão eletrônico).
        Em outras modalidades, o percentual pode chegar a 10%.
      </P>

      <H2 id="como-funciona">Como funciona na prática</H2>
      <UL>
        <li>Pregão eletrônico encerra a fase de lances com empresa grande (não-ME/EPP) em primeiro lugar por R$ 100.000</li>
        <li>Sua ME ficou em segundo com proposta de R$ 104.500 (4,5% acima)</li>
        <li>Por estar dentro da faixa de 5%, você é convocada a <strong>dar um novo lance menor que R$ 100.000</strong></li>
        <li>Prazo para esse novo lance: 5 minutos (pregão eletrônico, IN 73/2022)</li>
        <li>Se cobrir, você vence. Se não, a grande continua em primeiro.</li>
      </UL>

      <H2 id="requisitos">Requisitos para invocar</H2>
      <UL>
        <li>Estar <strong>declarada como ME ou EPP no SICAF</strong></li>
        <li>Faturamento respeitar limites atualizados (ME até R$ 360k/ano; EPP até R$ 4,8M/ano em 2026)</li>
        <li>Não pertencer a grupo econômico que exceda os limites</li>
        <li>Ter apresentado declaração específica na proposta</li>
      </UL>

      <H2 id="excecoes">Quando NÃO se aplica</H2>
      <UL>
        <li>Quando a primeira colocada JÁ é ME/EPP — empate ficto não vale entre duas ME</li>
        <li>Quando o valor estimado é inferior a R$ 80.000 e o edital usa outra preferência exclusiva para ME/EPP</li>
        <li>Em contratações diretas por dispensa ou inexigibilidade</li>
      </UL>

      <H2 id="tatica">Tática vencedora para ME/EPP</H2>
      <P>
        Conhecendo o empate ficto, a estratégia ótima muda:
      </P>
      <UL>
        <li><strong>Não precise &ldquo;queimar floor&rdquo; cedo.</strong> Pare um pouco acima do melhor lance do concorrente grande — você terá a chance de baixar no empate ficto.</li>
        <li><strong>Prepare o floor final antes.</strong> Quando for convocada, tem só 5 minutos. Calcule o custo + margem mínima ANTES, não na hora.</li>
        <li><strong>Use robô com detecção de empate ficto.</strong> O Licitagram Supreme Bot detecta automaticamente e te alerta com sugestão de lance ótimo.</li>
      </UL>

      <Callout kind="tip">
        <strong>Dica jurídica:</strong> alguns pregoeiros &ldquo;esquecem&rdquo; de convocar o
        empate ficto. Se você está em 2º dentro da faixa e a licitação foi encerrada
        sem sua convocação, <strong>impugne imediatamente</strong>. Tem jurisprudência
        pacífica a favor do licitante (TCU Acórdão 1.234/2018 entre outros).
      </Callout>
    </>
  )
}

// ─── ARTICLE 9 ──────────────────────────────────────────────────────────

function Article_ImpugnacaoEditalGuia() {
  return (
    <>
      <P>
        Encontrou cláusula restritiva em um edital que te exclui sem razão técnica
        legítima? Você pode impugnar. A nova Lei 14.133/2021 manteve o instituto e
        organizou os prazos. Este artigo mostra como identificar causa legítima,
        escrever a peça, protocolar e cobrar resposta.
      </P>

      <H2 id="quando">Quando impugnar</H2>
      <UL>
        <li><strong>Cláusula restritiva injustificada</strong> — exige atestado para marca/modelo específico sem razão técnica</li>
        <li><strong>Exigências desproporcionais</strong> — capital social exagerado, experiência mínima excessiva</li>
        <li><strong>Prazo de visita técnica inadequado</strong> — menos de 3 dias úteis</li>
        <li><strong>Objeto mal definido</strong> — descrição vaga que permite fornecer qualquer coisa</li>
        <li><strong>Violação ao princípio da competitividade</strong> — edital desenhado para um único fornecedor</li>
      </UL>

      <H2 id="prazos">Prazos — Lei 14.133/2021</H2>
      <UL>
        <li><strong>Qualquer cidadão</strong> pode impugnar até <strong>3 dias úteis</strong> antes da abertura da sessão pública</li>
        <li><strong>Órgão contratante</strong> tem <strong>3 dias úteis</strong> para decidir</li>
        <li>Se não decidir no prazo, vale o silêncio administrativo — jurisprudência favorável ao impugnante</li>
      </UL>

      <H2 id="template">Estrutura da peça de impugnação</H2>
      <P>
        Uma impugnação bem feita tem 5 partes:
      </P>
      <UL>
        <li><strong>Identificação</strong> — pregão, edital, órgão, impugnante (CNPJ + representante)</li>
        <li><strong>Tempestividade</strong> — datas (publicação do edital, prazo de 3 dias úteis)</li>
        <li><strong>Mérito</strong> — qual cláusula, por que é restritiva, qual princípio viola</li>
        <li><strong>Jurisprudência / doutrina</strong> — acórdãos do TCU, súmulas, Lei 14.133 artigos relevantes</li>
        <li><strong>Pedido</strong> — o que você quer (alterar cláusula X, suspender pregão, etc.)</li>
      </UL>

      <H2 id="dicas">Dicas que fazem diferença</H2>
      <UL>
        <li><strong>Seja técnico, não emotivo.</strong> Base cada alegação em artigo de lei.</li>
        <li><strong>Protocole no sistema correto.</strong> Compras.gov.br, BEC, BLL — cada um tem seu canal. Não vale e-mail.</li>
        <li><strong>Peça cópia da decisão.</strong> Pela LAI (Lei de Acesso à Informação) você tem direito à resposta formal.</li>
        <li><strong>Se indeferida, ainda pode representar no TCU.</strong> Acumula jurisprudência para próximas impugnações.</li>
      </UL>

      <H2 id="licitagram">Como a Licitagram acelera</H2>
      <P>
        O <strong className="text-foreground">Gerador de Impugnação</strong> da Licitagram
        lê o edital com IA, identifica cláusulas restritivas automaticamente, cruza com
        jurisprudência do TCU e gera a peça pronta para assinar. O que demorava 3-5 horas
        vira 15 minutos.
      </P>

      <Callout kind="warn">
        <strong>Importante:</strong> impugnar NÃO te impede de participar caso ela seja
        indeferida. Use sem medo de &ldquo;queimar filme&rdquo; — é direito seu e do
        interesse público.
      </Callout>
    </>
  )
}

// ─── ARTICLE 10 ─────────────────────────────────────────────────────────

function Article_DispensaInexigibilidade() {
  return (
    <>
      <P>
        Dispensa e inexigibilidade são as formas de <strong className="text-foreground">contratação
        direta</strong> — sem licitação. A Lei 14.133/2021 reformulou os limites, hipóteses e
        procedimentos. Quem entende essas regras encontra oportunidades invisíveis para quem
        só monitora pregão.
      </P>

      <H2 id="dispensa">Dispensa de licitação</H2>
      <P>
        Aplicável quando a licitação é <strong className="text-foreground">possível</strong> mas
        a lei dispensa por conveniência. Principais hipóteses (art. 75, Lei 14.133):
      </P>
      <UL>
        <li><strong>Valor</strong> — obras/serviços até R$ 100k (ME/EPP: R$ 165k) e bens/serviços até R$ 54.021,47 (valores atualizados 2026)</li>
        <li><strong>Emergência ou calamidade pública</strong> — desde que caracterizada urgência real</li>
        <li><strong>Licitação deserta</strong> — duas vezes sem interessados</li>
        <li><strong>Bens produzidos por órgãos da administração</strong></li>
        <li><strong>Pesquisa e desenvolvimento tecnológico</strong></li>
      </UL>

      <H2 id="inexigibilidade">Inexigibilidade de licitação</H2>
      <P>
        Aplicável quando a licitação é <strong className="text-foreground">inviável</strong> —
        não há competição possível. Hipóteses (art. 74):
      </P>
      <UL>
        <li><strong>Fornecedor exclusivo</strong> — único no mercado, comprovado por atestado</li>
        <li><strong>Serviços técnicos especializados de natureza predominantemente intelectual</strong> — consultoria com profissionais de notória especialização</li>
        <li><strong>Artistas consagrados</strong> pela crítica especializada ou pela opinião pública</li>
        <li><strong>Credenciamento</strong> quando todos podem ser contratados (atendimento contínuo)</li>
      </UL>

      <H2 id="oportunidade">Por que é oportunidade</H2>
      <P>
        90% dos licitantes ignoram contratação direta porque acham que &ldquo;não sai pregão&rdquo;.
        Errado: dispensas e inexigibilidades são publicadas no PNCP (pela 14.133) e tem
        <strong className="text-foreground"> procedimento simplificado de cotação prévia</strong>.
        Se você atende a hipótese — cadastrou produto no marketplace do governo, tem
        certificação exclusiva, etc. — pode ser chamado direto.
      </P>

      <H2 id="licitagram">Monitoramento via Licitagram</H2>
      <P>
        O Licitagram indexa <strong className="text-foreground">dispensas e inexigibilidades</strong>
        publicadas no PNCP junto com pregões tradicionais. Filtro:{' '}
        &ldquo;Modalidade = Dispensa&rdquo; ou &ldquo;Inexigibilidade&rdquo;. Muitos clientes
        descobrem nichos onde são praticamente monopolistas e pode preencher anos de
        receita estável.
      </P>

      <Callout kind="tip">
        <strong>Regra de ouro:</strong> dispensa por valor exige <strong>3 cotações</strong>{' '}
        prévias para comprovar &ldquo;economicidade&rdquo;. Se você ainda não foi cotado pelo
        órgão, entre em contato com a setoral de compras ANTES do processo — posicionamento
        comercial precoce.
      </Callout>
    </>
  )
}

// ─── ARTICLE 11 ─────────────────────────────────────────────────────────

function Article_CNDCertidoesNegativas() {
  return (
    <>
      <P>
        CND — Certidão Negativa de Débitos — é o documento que comprova que sua empresa
        está em dia com o fisco. Em licitação pública, é <strong className="text-foreground">obrigatória</strong>.
        Se qualquer uma estiver vencida no dia do pregão, você é desabilitado —
        independente do preço que ofereceu. Este artigo mostra quais CNDs você precisa,
        como emitir e como automatizar.
      </P>

      <H2 id="quais">Quais CNDs você precisa</H2>
      <UL>
        <li><strong>CND Federal (Receita + PGFN)</strong> — débitos tributários federais + dívida ativa. Validade 180 dias. Emissão gratuita em receita.fazenda.gov.br</li>
        <li><strong>CND Trabalhista (TST)</strong> — débitos trabalhistas. Validade 180 dias. Emissão em tst.jus.br</li>
        <li><strong>CND FGTS (Caixa)</strong> — regularidade com FGTS. Validade 30 dias. Emissão em consulta-crf.caixa.gov.br</li>
        <li><strong>CND Estadual</strong> — débitos ICMS e outros tributos estaduais. Validade variável (30-180 dias). Site da Secretaria da Fazenda estadual.</li>
        <li><strong>CND Municipal</strong> — ISS e outros tributos municipais. Validade 30-180 dias. Site da prefeitura sede.</li>
        <li><strong>Certidão de Falência e Recuperação Judicial</strong> — tribunal de justiça do estado. Validade 30-90 dias.</li>
      </UL>

      <H2 id="prazos">Prazos de validade — atenção</H2>
      <P>
        Cada certidão tem validade diferente. A mais curta (FGTS, 30 dias) dita seu
        ritmo de renovação. Quem participa de 10+ pregões/mês não pode emitir
        manualmente — vira um job full-time.
      </P>

      <H2 id="automacao">Automação de emissão</H2>
      <P>
        Alguns órgãos permitem emissão via API ou scraping automatizado. A Blindagem
        de Compliance da Licitagram:
      </P>
      <UL>
        <li>Monitora 8 certidões críticas em tempo real</li>
        <li>Alerta 7 dias antes de qualquer vencimento (WhatsApp + e-mail)</li>
        <li>Emite automaticamente as que permitem (Federal, TST, FGTS via portal público)</li>
        <li>Abre ticket prioritário pras que exigem ação manual</li>
        <li>Mantém repositório digitalizado e indexado, pronto para upload em pregão</li>
      </UL>

      <H2 id="problema">O problema mais caro</H2>
      <P>
        A causa #1 de desabilitação em pregão (segundo TCU) é{' '}
        <strong className="text-foreground">certidão vencida na data da habilitação</strong>.
        Quem tem 10 pregões simultâneos em 5 estados diferentes e 15 certidões cada —
        150 documentos vivos — não consegue controlar manualmente. Automação é o que
        separa profissional de amador.
      </P>

      <Callout kind="warn">
        <strong>Bizarro mas verdadeiro:</strong> alguns editais aceitam certidão positiva
        com efeito de negativa (você tem dívida parcelada em dia). Leia com atenção.
        A Licitagram sinaliza quando o edital permite essa alternativa.
      </Callout>
    </>
  )
}

// ─── ARTICLE 12 ─────────────────────────────────────────────────────────

function Article_ModalidadesLei14133() {
  return (
    <>
      <P>
        A Lei 14.133/2021 reestruturou as modalidades de licitação. Algumas foram
        extintas (convite, tomada de preços), outras nasceram (diálogo competitivo).
        Este artigo mostra cada uma, quando se aplica e qual a estratégia vencedora.
      </P>

      <H2 id="pregao">Pregão (eletrônico ou presencial)</H2>
      <P>
        Modalidade mais comum. Aplicada para bens e serviços comuns — padrões objetivos,
        disponíveis no mercado. Critério: menor preço ou maior desconto.
      </P>
      <P>
        <strong className="text-foreground">Quando:</strong> 95% dos casos. Se a licitação
        vai pra leilão de lances, é pregão.
      </P>

      <H2 id="concorrencia">Concorrência</H2>
      <P>
        Modalidade para obras, serviços de engenharia, alienação de bens imóveis. Também
        aplicada quando o pregão não se aplica (natureza não-comum).
      </P>
      <P>
        <strong className="text-foreground">Critérios:</strong> menor preço, melhor técnica,
        técnica e preço, ou maior retorno econômico (dependendo do objeto).
      </P>

      <H2 id="concurso">Concurso</H2>
      <P>
        Escolha de trabalho técnico, científico ou artístico. Prêmio para o vencedor.
        Raro para o licitante comum.
      </P>

      <H2 id="leilao">Leilão</H2>
      <P>
        Alienação de bens da administração pública. Você é COMPRADOR, não fornecedor.
        Usado para vender equipamentos, veículos, imóveis.
      </P>

      <H2 id="dialogo">Diálogo competitivo</H2>
      <P>
        <strong className="text-foreground">Novidade da Lei 14.133.</strong> Aplicável a
        contratações de inovação ou soluções complexas onde o órgão não consegue especificar
        o objeto final. Tem fase de diálogo iterativo antes da proposta final — parecido
        com RFP + RFQ do setor privado.
      </P>
      <P>
        <strong className="text-foreground">Oportunidade:</strong> fornecedores de tecnologia
        dominam essa modalidade. Ainda é subexplorado — em 2026 somente 2% dos processos
        federais usam diálogo competitivo.
      </P>

      <H2 id="credenciamento">Credenciamento</H2>
      <P>
        Nova modalidade formal. Quando todos os interessados que atendem aos requisitos
        podem ser contratados — demanda aberta e não-competitiva. Exemplos: telemedicina,
        coleta de resíduos, credenciamento de prestadores de serviços médicos para SUS.
      </P>

      <H2 id="extintas">Modalidades extintas</H2>
      <UL>
        <li><strong>Convite</strong> — extinto. Pequenas compras caem em dispensa por valor.</li>
        <li><strong>Tomada de Preços</strong> — extinto. Substituído por concorrência simplificada.</li>
        <li><strong>RDC (Regime Diferenciado de Contratações)</strong> — extinto. Absorvido pela 14.133.</li>
      </UL>

      <H2 id="estrategia">Estratégia por modalidade</H2>
      <UL>
        <li><strong>Pregão</strong> — preço é rei. Floor Optimizer bem parametrizado ganha.</li>
        <li><strong>Concorrência técnica/preço</strong> — investir em proposta técnica densa com atestados, certificações, equipe. Preço isolado não ganha.</li>
        <li><strong>Diálogo competitivo</strong> — relacionamento pré-edital é tudo. Participar das audiências públicas.</li>
        <li><strong>Credenciamento</strong> — volume. Se credencie em todos e deixe o órgão distribuir demanda.</li>
      </UL>

      <Callout kind="tip">
        A Licitagram filtra por modalidade e aprende o seu padrão de ganho. Se você
        converte 40% em pregões mas 2% em concorrências, o sistema prioriza os pregões
        nos alertas. Você decide se quer mudar.
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
  {
    meta: {
      slug: 'como-participar-pregao-eletronico-passo-a-passo',
      title: 'Como participar de pregão eletrônico: guia passo a passo',
      description: 'Nunca participou de pregão? Este guia mostra do cadastro SICAF ao primeiro lance submetido. Pré-requisitos, passos e armadilhas.',
      keywords: ['como participar pregão eletrônico', 'pregão eletrônico iniciante', 'primeira licitação', 'como fazer licitação', 'passo a passo pregão'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 6,
      category: 'como-fazer',
    },
    Component: Article_ComoParticiparPregaoEletronico,
  },
  {
    meta: {
      slug: 'sicaf-cadastro-completo',
      title: 'SICAF: cadastro completo passo a passo (2026)',
      description: 'Guia definitivo do cadastro SICAF — documentos, 6 níveis de habilitação, armadilhas que eliminam 40% das empresas. Atualizado 2026.',
      keywords: ['SICAF cadastro', 'como cadastrar SICAF', 'SICAF passo a passo', 'cadastro fornecedor governo', 'habilitação SICAF'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 7,
      category: 'como-fazer',
    },
    Component: Article_SicafCadastroCompleto,
  },
  {
    meta: {
      slug: 'empate-ficto-me-epp-licitacao',
      title: 'Empate ficto ME/EPP em licitação: a regra que inverte resultados',
      description: 'Microempresas e EPP têm preferência de desempate em licitações até 5% de diferença. Entenda a regra, requisitos e a tática vencedora.',
      keywords: ['empate ficto', 'ME EPP licitação', 'preferência microempresa pregão', 'desempate ME EPP', 'Lei Complementar 123'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 5,
      category: 'legislacao',
    },
    Component: Article_EmpateFictoMEEPP,
  },
  {
    meta: {
      slug: 'como-impugnar-edital-licitacao',
      title: 'Como impugnar edital de licitação: guia com template',
      description: 'Encontrou cláusula restritiva? Saiba quando e como impugnar edital sob a Lei 14.133/2021. Prazos, estrutura da peça e dicas práticas.',
      keywords: ['impugnar edital', 'impugnação licitação', 'como impugnar pregão', 'cláusula restritiva edital', 'Lei 14.133 impugnação'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 6,
      category: 'como-fazer',
    },
    Component: Article_ImpugnacaoEditalGuia,
  },
  {
    meta: {
      slug: 'dispensa-inexigibilidade-licitacao-14133',
      title: 'Dispensa e inexigibilidade: contratação direta na Lei 14.133',
      description: 'Quando a administração pode contratar sem licitação: hipóteses de dispensa e inexigibilidade, limites atualizados 2026 e oportunidades.',
      keywords: ['dispensa licitação', 'inexigibilidade licitação', 'contratação direta', 'Lei 14.133 dispensa', 'artigo 74 75 licitação'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 6,
      category: 'legislacao',
    },
    Component: Article_DispensaInexigibilidade,
  },
  {
    meta: {
      slug: 'cnd-certidoes-negativas-licitacao',
      title: 'CND e certidões negativas em licitação: guia + automação',
      description: 'Quais certidões negativas você precisa para participar de licitação pública. Prazos de validade, emissão e como automatizar.',
      keywords: ['CND licitação', 'certidão negativa débitos', 'certidões licitação', 'CND Federal TST FGTS', 'regularidade fiscal pregão'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 6,
      category: 'como-fazer',
    },
    Component: Article_CNDCertidoesNegativas,
  },
  {
    meta: {
      slug: 'modalidades-licitacao-lei-14133',
      title: 'Modalidades de licitação na Lei 14.133/2021: guia completo',
      description: 'Pregão, concorrência, concurso, leilão, diálogo competitivo e credenciamento — quando usar cada modalidade e estratégia vencedora.',
      keywords: ['modalidades licitação', 'pregão vs concorrência', 'diálogo competitivo', 'credenciamento 14133', 'licitação tipos'],
      publishedAt: '2026-04-17',
      author: 'Equipe Licitagram',
      readingTimeMin: 7,
      category: 'legislacao',
    },
    Component: Article_ModalidadesLei14133,
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
