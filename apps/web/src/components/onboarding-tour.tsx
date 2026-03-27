'use client'

import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

interface OnboardingTourProps {
  onComplete: () => void
  autoStart?: boolean
}

export function OnboardingTour({ onComplete, autoStart = true }: OnboardingTourProps) {
  const started = useRef(false)

  useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true

    // Small delay to let the DOM settle after wizard closes
    const timeout = setTimeout(() => {
      const tourDriver = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: 'rgba(0, 0, 0, 0.6)',
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: 'licitagram-tour-popover',
        nextBtnText: 'Próximo',
        prevBtnText: 'Anterior',
        doneBtnText: 'Concluir',
        progressText: '{{current}} de {{total}}',
        onDestroyStarted: () => {
          tourDriver.destroy()
          onComplete()
        },
        steps: [
          {
            element: '#nav-map',
            popover: {
              title: '🗺️ Mapa de Inteligência',
              description:
                'Visualize todas as oportunidades no mapa do Brasil. Clique nos pins para ver detalhes e scores.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-opportunities',
            popover: {
              title: '🎯 Oportunidades',
              description:
                'Aqui a IA encontra licitações compatíveis com sua empresa, filtradas por score e relevância.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-pipeline',
            popover: {
              title: '📊 Pipeline',
              description:
                'Gerencie suas licitações em um kanban: Nova → Interesse → Participando → Venceu.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-dashboard',
            popover: {
              title: '📈 Dashboard',
              description:
                'Métricas e KPIs da sua operação: matches, score médio, taxa de conversão e performance.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-competitors',
            popover: {
              title: '🏆 Concorrentes',
              description:
                'Inteligência competitiva: veja quem são seus concorrentes, win rates e estratégias.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-bot',
            popover: {
              title: '🤖 Robô',
              description:
                'Automação de processos: emissão de certidões, preenchimento automático e mais.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-certidoes',
            popover: {
              title: '📋 Certidões',
              description:
                'Gerencie certidões da empresa: emissão automática, validade e alertas de vencimento.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-drive',
            popover: {
              title: '📁 Drive',
              description:
                'Repositório de documentos: editais, propostas, certidões e análises organizadas.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-empresa',
            popover: {
              title: '🏢 Empresa',
              description:
                'Configure o perfil da empresa: CNAEs, capacidades e descrição para a IA encontrar as melhores oportunidades.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-settings',
            popover: {
              title: '⚙️ Configurações',
              description:
                'Ajuste notificações, score mínimo, UFs de interesse e preferências.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#ai-consultant-button',
            popover: {
              title: '✨ Consultor IA',
              description:
                'Seu assistente inteligente disponível em qualquer tela. Pergunte sobre licitações, estratégias ou peça relatórios.',
              side: 'top',
              align: 'center',
            },
          },
        ],
      })

      tourDriver.drive()
    }, 400)

    return () => clearTimeout(timeout)
  }, [autoStart, onComplete])

  return (
    <style jsx global>{`
      .licitagram-tour-popover {
        --driver-theme-color: #F43E01 !important;
      }
      .licitagram-tour-popover .driver-popover {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 20px 60px -12px rgba(0, 0, 0, 0.25);
      }
      .licitagram-tour-popover .driver-popover-title {
        font-size: 16px;
        font-weight: 700;
        color: #111827;
      }
      .licitagram-tour-popover .driver-popover-description {
        font-size: 14px;
        color: #6B7280;
        line-height: 1.5;
      }
      .licitagram-tour-popover .driver-popover-progress-text {
        font-size: 12px;
        color: #9CA3AF;
      }
      .licitagram-tour-popover .driver-popover-navigation-btns button {
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        padding: 6px 16px;
      }
      .licitagram-tour-popover .driver-popover-next-btn,
      .licitagram-tour-popover .driver-popover-close-btn {
        background-color: #F43E01 !important;
        color: #fff !important;
        border: none !important;
      }
      .licitagram-tour-popover .driver-popover-next-btn:hover,
      .licitagram-tour-popover .driver-popover-close-btn:hover {
        background-color: #d63501 !important;
      }
      .licitagram-tour-popover .driver-popover-prev-btn {
        background-color: transparent !important;
        color: #6B7280 !important;
        border: 1px solid #D1D5DB !important;
      }
      .licitagram-tour-popover .driver-popover-prev-btn:hover {
        background-color: #F3F4F6 !important;
      }
      .driver-overlay {
        background-color: rgba(0, 0, 0, 0.6) !important;
      }
      .driver-active-element {
        box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.3) !important;
        border-radius: 8px;
      }
    `}</style>
  )
}
