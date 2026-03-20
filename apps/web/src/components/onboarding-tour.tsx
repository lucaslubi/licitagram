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
            element: '#dashboard-overview',
            popover: {
              title: 'Seu Painel',
              description:
                'Aqui você vê um resumo de todas as suas licitações, matches e alertas.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#nav-opportunities',
            popover: {
              title: 'Oportunidades',
              description:
                'Encontre licitações compatíveis com sua empresa, filtradas e ranqueadas por IA.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-competitors',
            popover: {
              title: 'Concorrentes',
              description:
                'Analise seus concorrentes, veja rankings, segmentos e estratégias para superá-los.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#nav-map',
            popover: {
              title: 'Mapa',
              description:
                'Visualize licitações por região no mapa interativo do Brasil.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#ai-consultant-button',
            popover: {
              title: 'Consultor IA',
              description:
                'Seu assistente inteligente. Pergunte qualquer coisa, peça relatórios, tire dúvidas.',
              side: 'top',
              align: 'center',
            },
          },
          {
            element: '#nav-settings',
            popover: {
              title: 'Configurações',
              description:
                'Ajuste palavras-chave, notificações, plano e preferências.',
              side: 'right',
              align: 'start',
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
        --driver-theme-color: #F97316 !important;
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
        background-color: #F97316 !important;
        color: #fff !important;
        border: none !important;
      }
      .licitagram-tour-popover .driver-popover-next-btn:hover,
      .licitagram-tour-popover .driver-popover-close-btn:hover {
        background-color: #EA580C !important;
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
