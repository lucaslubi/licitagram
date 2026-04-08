'use client'

import { useState, useEffect } from 'react'
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
  Sparkles,
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
      className={`relative pl-8 pb-8 last:pb-0 before:absolute before:left-[15px] before:top-8 before:bottom-0 before:w-[2px] before:bg-[#2d2f33] last:before:hidden animate-fade-in`}
      style={{ animationDelay: delay, animationFillMode: 'both' }}
    >
      <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-[#1a1c1f] border border-[#2d2f33] flex items-center justify-center text-[#F43E01] shadow-sm shadow-orange-900/20 z-10">
        {icon}
      </div>
      <div className="bg-[#1a1c1f] border border-[#2d2f33] p-4 rounded-xl shadow-sm hover:border-orange-500/30 transition-colors group">
        <h3 className="text-white font-semibold text-sm mb-1.5 flex items-center justify-between">
          <span>{title}</span>
        </h3>
        <p className="text-gray-400 text-xs leading-relaxed mb-3">{description}</p>
        
        {tips.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-gray-300 text-[11px] leading-snug">{tip}</span>
              </div>
            ))}
          </div>
        )}

        <Link
          href={linkTo}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#F43E01] hover:text-orange-400 transition-colors group-hover:underline"
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
  const [pulse, setPulse] = useState(true)

  // Remove the pulse effect after the user initially opens the guide
  useEffect(() => {
    if (open) setPulse(false)
  }, [open])

  return (
    <>
      {/* Floating Button (Bottom Left) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-6 left-6 z-[9990] pl-3 pr-4 h-12 rounded-full bg-[#1a1c1f] border border-[hsl(18_80%_40%/0.35)] text-white shadow-lg shadow-black/50 hover:bg-[#23262a] hover:border-[hsl(18_80%_40%/0.6)] transition-all duration-300 flex items-center justify-center gap-2 group ${
            pulse ? 'animate-pulse ring-2 ring-[#F43E01]/20' : ''
          }`}
          aria-label="Abrir Guia Licitagram"
        >
          <div className="w-8 h-8 rounded-full bg-[#F43E01]/10 flex items-center justify-center text-[#F43E01] group-hover:scale-110 transition-transform">
            <Compass className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider">Playbook</span>
        </button>
      )}

      {/* Slide-over / Modal Window */}
      {open && (
        <div className="fixed bottom-0 left-0 md:bottom-6 md:left-6 z-[9999] w-full md:w-[460px] h-[85vh] md:h-auto md:max-h-[calc(100vh-48px)] bg-background/95 backdrop-blur-xl md:rounded-2xl shadow-2xl border border-[#2d2f33] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 md:slide-in-from-left-5 fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2d2f33] bg-[#1a1c1f]/80 shrink-0">
            <div>
              <h2 className="font-bold text-white flex items-center gap-2">
                <Compass className="w-5 h-5 text-[#F43E01]" />
                O Caminho da Vitória
              </h2>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">
                O fluxo completo do Licitagram
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-[#2d2f33] min-h-0 bg-black/20">
            <p className="text-xs text-gray-400 mb-6 leading-relaxed">
              O Licitagram opera 100% de forma autônoma se você seguir este fluxo vital. Deixe a IA trabalhar por você.
            </p>

            <div className="relative">
              {/* Step 1 */}
              <PlaybookStep
                delay="0ms"
                icon={<Building2 className="w-4 h-4" />}
                title="1. Setup Estratégico (O Motor)"
                description="Antes de qualquer coisa, ensine a plataforma quem você é. Ao preencher seus dados, o motor de IA começa a entender seu porte, limitações e forças."
                tips={[
                  'Insira o CNPJ na seção Empresa para buscar seus dados na Receita.',
                  'Declare seus CNAEs. Eles dirão onde a IA deve procurar.',
                  'Suba suas Certidões. Assim nosso Compliance Checker avisará sobre sua inabilitação futura.',
                ]}
                linkTo="/company"
                linkText="Configurar Dados da Empresa"
              />

              {/* Step 2 */}
              <PlaybookStep
                delay="100ms"
                icon={<MapPin className="w-4 h-4" />}
                title="2. Mapa & Oportunidades (O Radar)"
                description="Alguns minutos após o Setup, a IA já terá varrido milhares de editais mapeando o Brasil inteiro com tudo que se encaixa no seu CNPJ."
                tips={[
                  'Dica de Ouro: Olhe o mapa e foque nos Estados MENOS concorridos que costumam pagar bem.',
                  'Filtre pelas licitações com Score de IA acima de 75 (Alta Chance).',
                ]}
                linkTo="/map"
                linkText="Explorar o Mapa de Oportunidades"
              />

              {/* Step 3 */}
              <PlaybookStep
                delay="200ms"
                icon={<FileSearch className="w-4 h-4" />}
                title="3. Desconstrução do Edital & Drive"
                description="Achou uma licitação boa? Abra a página dela. Você não precisa ler o edital inteiro."
                tips={[
                  'Gere um resumo em PDF conversando com o Consultor IA na página da licitação.',
                  'Toda pergunta que você fizer fica salva no seu Licitagram Drive.',
                  'Marque o ícone de Favorito/Interesse para ela ir ao seu Pipeline Kanban.',
                ]}
                linkTo="/pipeline"
                linkText="Ver seu Pipeline de Editais"
              />

              {/* Step 4 */}
              <PlaybookStep
                delay="300ms"
                icon={<PenTool className="w-4 h-4" />}
                title="4. Fábrica de Propostas & Impugnações"
                description="Hora de agir estrategicamente antes de entrar no pregão. Não faça matemática amadora."
                tips={[
                  'Dentro da oportunidade, calcule o BDI automático.',
                  'Use o Precificador/Simulador para traçar o limite seguro de desconto.',
                  'Ache irregularidades? A IA redige a Impugnação pronta em 1 clique.',
                  'Confortável? Clique em "Gerar Proposta". Fica pronta em 5 minutos formatada em Lei 14.133.',
                ]}
                linkTo="/proposals"
                linkText="Gerenciar Propostas Geradas"
              />

              {/* Step 5 */}
              <PlaybookStep
                delay="400ms"
                icon={<ShieldAlert className="w-4 h-4" />}
                title="5. Radar Antifraude e Concorrentes"
                description="Você precisa saber quem é o inimigo que respira do outro lado."
                tips={[
                  'O Detector de Frades fará um pente fino alertando Laranjas ou Cartéis.',
                  'Cruze os CNPJs do mesmo lote com o Módulo de Inteligência Competitiva.',
                ]}
                linkTo="/competitors"
                linkText="Ver Inteligência Competitiva"
              />

              {/* Step 6 */}
              <PlaybookStep
                delay="500ms"
                icon={<Swords className="w-4 h-4" />}
                title="6. War Room & Robô de Lances"
                description="Tudo mapeado, validado e proposto? Ajuste a Margem de Guerra. Deixe a máquina assumir o teclado."
                tips={[
                  'Ao iniciar o Pregão, ative o Robô. O Agente Autônomo dá lances precisos com timing de vitória.',
                  'A Sala de Guerra te dá insights ao vivo durante o ataque e contra-ataque de preços.',
                ]}
                linkTo="/bot"
                linkText="Configurar o Robô"
              />
            </div>

            <div className="mt-8 pt-4 border-t border-[#2d2f33] text-center">
              <p className="text-[10px] text-gray-500 font-mono">
                Licitagram. Você mapeia, a máquina executa.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
