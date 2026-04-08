'use client'

import { useState } from 'react'
import {
  Compass,
  X,
  Building2,
  MapPin,
  FileSearch,
  PenTool,
  ShieldAlert,
  Swords,
  ChevronRight,
  BellRing,
} from 'lucide-react'
import Link from 'next/link'

interface StepProps {
  icon: React.ReactNode
  title: string
  description: string
  tips: string[]
  linkTo: string
  linkText: string
  delay: string
}

function PlaybookStep({ icon, title, description, tips, linkTo, linkText, delay }: StepProps) {
  return (
    <div
      className="relative pl-8 pb-8 last:pb-0 before:absolute before:left-[15px] before:top-8 before:bottom-0 before:w-[1px] before:bg-border last:before:hidden animate-in fade-in"
      style={{ animationDelay: delay, animationFillMode: 'both' }}
    >
      <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-foreground z-10">
        {icon}
      </div>
      <div className="bg-card border border-border p-4 rounded-xl hover:border-foreground/20 transition-colors group">
        <h3 className="text-foreground font-semibold text-sm mb-1.5 flex items-center justify-between">
          <span>{title}</span>
        </h3>
        <p className="text-muted-foreground text-xs leading-relaxed mb-3">{description}</p>
        
        {tips.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-foreground/40 shrink-0 mt-1.5" />
                <span className="text-muted-foreground text-[11px] leading-snug">{tip}</span>
              </div>
            ))}
          </div>
        )}

        <Link
          href={linkTo}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/70 hover:text-foreground transition-colors group-hover:underline"
        >
          {linkText}
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

export function GlobalPlaybook() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="sidebar-nav-item w-full flex items-center gap-2 hover:bg-secondary/50 rounded-md px-2 py-1.5 transition-colors text-muted-foreground hover:text-foreground"
      >
        <Compass size={16} className="sidebar-nav-icon shrink-0" />
        <span className="sidebar-nav-label text-[13px] font-medium">Guia da Plataforma</span>
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-[9999] w-full sm:w-[460px] bg-background border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shrink-0">
            <div>
              <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                <Compass className="w-4 h-4" />
                Guia Licitagram
              </h2>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                Fluxo operacional da plataforma
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-border min-h-0 bg-secondary/10">
            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
              Siga esta rota lógica para garantir que a plataforma extraia as melhores oportunidades e gere propostas automaticamente.
            </p>

            <div className="relative">
              <PlaybookStep
                delay="0ms"
                icon={<Building2 className="w-3.5 h-3.5" />}
                title="1. Preenchimento de Dados"
                description="O sistema precisa documentar quem é sua empresa e o que ela vende."
                tips={[
                  'Nas Configurações da Empresa, insira seu CNPJ para sincronização com a base da Receita Federal.',
                  'Na área de Certidões, faça o upload dos seus atestados para que a Inteligência cruze os requisitos e valide se você está apto a participar.',
                ]}
                linkTo="/company"
                linkText="Gerenciar Empresa"
              />

              <PlaybookStep
                delay="50ms"
                icon={<BellRing className="w-3.5 h-3.5" />}
                title="2. Notificações Inteligentes"
                description="Ative seus sensores para ser avisado antes da concorrência."
                tips={[
                  'Conecte seu WhatsApp, Telegram e Email nas Configurações. Refine alertas por palavra-chave, UF, Score IA e valor.',
                  'No plano Enterprise, use a função multi-empresas para direcionar editais para CNPJs específicos do seu grupo.',
                  'Dica de Ouro: Ao clicar em "Interesse" no alerta do Telegram pelo celular, a licitação entra instantaneamente no Pipeline Kanban da equipe no escritório.',
                ]}
                linkTo="/settings"
                linkText="Configurar Alertas"
              />

              <PlaybookStep
                delay="100ms"
                icon={<MapPin className="w-3.5 h-3.5" />}
                title="3. Radar de Oportunidades"
                description="O mapa e as listas serão povoados com licitações altamente segmentadas em todo o país."
                tips={[
                  'Bata o olho no Mapa para focar em Estados menos concorridos e com menor concentração de adversários diretos.',
                  'Explore as Oportunidades e classifique pelo Score gerado pela Inteligência Artificial, dando prioridade para matches de 80 a 100.',
                ]}
                linkTo="/opportunities"
                linkText="Ver Oportunidades"
              />

              <PlaybookStep
                delay="150ms"
                icon={<FileSearch className="w-3.5 h-3.5" />}
                title="4. Desconstrução do Edital & Pipeline"
                description="Não perca horas lendo PDFs. Abra o edital interessante e analise na Sala do Edital."
                tips={[
                  'Bata papo com o Consultor IA embeddedado. Ele extrai requisitos e faz análises de risco rapidamente.',
                  'Você pode baixar as respostas dele em PDF e armazenar no seu Licitagram Drive.',
                  'Altere o status para "Em Análise" no menu drop-down da página para que ela vá para o seu Pipeline Kanban.',
                ]}
                linkTo="/pipeline"
                linkText="Ir para Meu Pipeline"
              />

              <PlaybookStep
                delay="200ms"
                icon={<PenTool className="w-3.5 h-3.5" />}
                title="5. Fábrica de Propostas"
                description="Faça a matemática do leilão e documente sem esforço as formalidades exigidas."
                tips={[
                  'Use a Calculadora de Precificação em anexo para descobrir precisamente o seu BDI.',
                  'Encontrou exigências esdrúxulas? Acione o gerador inteligente na aba Oportunidade para redigir uma Impugnação baseada no TCU.',
                  'Tudo validado? Clique em "Gerar Proposta" para extrair itens com CNPJ formatados para a Lei 14.133 automaticamente.',
                ]}
                linkTo="/proposals"
                linkText="Meus Documentos"
              />

              <PlaybookStep
                delay="250ms"
                icon={<ShieldAlert className="w-3.5 h-3.5" />}
                title="6. Mapeamento de Fraude"
                description="Descubra antecipadamente o comportamento de quem você está enfrentando."
                tips={[
                  'Nas páginas detalhadas, o Detector de Risco vasculha cartéis ou monopólios (empresas com mesmos sócios).',
                  'Vá em "Inteligência Competitiva" caso queira analisar a taxa de sucesso geral dos CNPJs dos rivais que baterem no seu lote.',
                ]}
                linkTo="/competitors"
                linkText="Espionagem Competitiva"
              />

              <PlaybookStep
                delay="300ms"
                icon={<Swords className="w-3.5 h-3.5" />}
                title="7. Sala de Guerra & Automação"
                description="Na hora de arrematar os preços no pregão, use as ferramentas defensivas."
                tips={[
                  'Rastreie o histórico dos preços já praticados naquele item para entender qual seria um lance plausível no seu negócio.',
                  'Configure o Robô Autônomo caso prefira varrer lotes escalonadamente cobrindo os limites impostos, mas sem aguentar desvalorizações excessivas.',
                ]}
                linkTo="/bot"
                linkText="Acessar o Agente de Lances"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
