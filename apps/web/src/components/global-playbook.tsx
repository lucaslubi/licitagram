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
                description="O sistema precisa conhecer sua empresa para encontrar o que você vende."
                tips={[
                  'Preencha seus dados na seção Empresa para buscar dados na Receita.',
                  'Inclua as palavras-chave exatas dos produtos/serviços que você oferece.',
                ]}
                linkTo="/company"
                linkText="Ir para Empresa"
              />

              <PlaybookStep
                delay="50ms"
                icon={<MapPin className="w-3.5 h-3.5" />}
                title="2. Encontrar Oportunidades no Mapa"
                description="Em minutos, o mapa é populado com as licitações ativas em todo o Brasil."
                tips={[
                  'Analise onde estão os Estados menos concorridos.',
                  'Volte no mapa e encontre a oportunidade com maior chance matemática de vencer.',
                ]}
                linkTo="/map"
                linkText="Abrir Mapa Estratégico"
              />

              <PlaybookStep
                delay="100ms"
                icon={<FileSearch className="w-3.5 h-3.5" />}
                title="3. Entender o Edital"
                description="Abra a página da licitação escolhida e converse com o Consultor IA."
                tips={[
                  'Tire qualquer dúvida sobre os requisitos e prazos em formato de chat.',
                  'Suas perguntas e os resumos podem ser salvos em PDF no Licitagram Drive.',
                  'Marque o indicativo de interesse na página para acompanhá-la em seu Pipeline.',
                ]}
                linkTo="/pipeline"
                linkText="Visualizar Pipeline"
              />

              <PlaybookStep
                delay="150ms"
                icon={<PenTool className="w-3.5 h-3.5" />}
                title="4. Geração Rápida de Proposta"
                description="Com a oportunidade validada, a plataforma gera a proposta ou impugnação que demoraria horas em apenas 5 minutos."
                tips={[
                  'Faça o cálculo de BDI dentro da própria página.',
                  'Use o gerador de propostas para extrair os itens formatados pela Lei 14.133 automaticamente.',
                ]}
                linkTo="/proposals"
                linkText="Gerador de Propostas"
              />

              <PlaybookStep
                delay="200ms"
                icon={<ShieldAlert className="w-3.5 h-3.5" />}
                title="5. War Room & Detecção de Fraudes"
                description="Conheça o histórico de quem está disputando com você."
                tips={[
                  'O detector de fraudes analisa concorrentes em tempo real apontando irregularidades e base para impugnações.',
                  'A inteligência aponta o Win Rate da sua concorrência no nicho.',
                ]}
                linkTo="/competitors"
                linkText="Analisar Concorrentes"
              />

              <PlaybookStep
                delay="250ms"
                icon={<Swords className="w-3.5 h-3.5" />}
                title="6. Robô de Lances Automático"
                description="Durante o pregão, execute a disputa de forma inteligente."
                tips={[
                  'A IA acompanha a disputa ao vivo na War Room.',
                  'O Robô dá lances semáforos preservando sua margem mínima de lucro.',
                ]}
                linkTo="/bot"
                linkText="Configurar Robô"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
