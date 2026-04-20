'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Meta {
  orgaoRazaoSocial: string
  orgaoNomeFantasia: string | null
  orgaoCnpj: string
  orgaoLogoUrl: string | null
  localidade: string | null
  numeroProcesso: string
  objeto: string
  responsavelNome: string
  responsavelCargo: string | null
  dataEmissao: string
  modeloUsado: string | null
  aprovadoEm: string | null
}

interface Props {
  title: string
  /**
   * Nome descritivo usado pelo browser como filename default do PDF
   * ("Save as PDF"). Override document.title → override filename sugerido.
   * Formato: "ETP - Objeto truncado - Proc 2026-001".
   */
  filenameTitle: string
  content: string
  status: string
  meta: Meta
}

export function PrintClient({ title, filenameTitle, content, status, meta }: Props) {
  useEffect(() => {
    // Override document.title DINAMICAMENTE antes de chamar print — é o
    // que o Chrome/Safari/Firefox usam como sugestão de filename no
    // diálogo "Save as PDF". A metadata do Next seta o title mas o
    // template "%s · LicitaGram Gov" do root layout poluiria o PDF.
    // Aqui pegamos controle direto e limpamos o sufixo institucional.
    const prevTitle = document.title
    document.title = filenameTitle

    // Auto-dispara print dialog após render completo
    const t = setTimeout(() => window.print(), 400)
    return () => {
      clearTimeout(t)
      document.title = prevTitle
    }
  }, [filenameTitle])

  return (
    <div className="print-root">
      <style jsx global>{`
        @page {
          size: A4;
          margin: 22mm 18mm 24mm 22mm;
        }
        @media print {
          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-content {
            font-size: 11pt !important;
          }
        }
        @media screen {
          .print-root {
            background: #f3f4f6;
            min-height: 100vh;
            padding: 32px 16px;
          }
          .print-sheet {
            max-width: 210mm;
            margin: 0 auto;
            background: #fff;
            color: #0f172a;
            padding: 56px 48px;
            box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
            border-radius: 4px;
          }
        }
        .print-sheet {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          line-height: 1.6;
          color: #0f172a;
        }
        .print-header {
          border-bottom: 2px solid #0f172a;
          padding-bottom: 14px;
          margin-bottom: 24px;
        }
        .print-header-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 10px;
        }
        .print-orgao {
          font-size: 12pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          margin: 0;
        }
        .print-orgao-meta {
          font-size: 9pt;
          color: #475569;
          margin-top: 3px;
        }
        .print-orgao-logo {
          max-height: 56px;
          max-width: 120px;
          object-fit: contain;
          margin-left: 16px;
        }
        .print-title {
          font-size: 16pt;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin: 8px 0 4px;
        }
        .print-subtitle {
          font-size: 10pt;
          color: #475569;
          margin: 0;
        }
        .print-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px 24px;
          padding: 12px 0;
          margin-bottom: 20px;
          border-top: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          font-size: 10pt;
        }
        .print-meta-label {
          font-weight: 600;
          color: #334155;
        }
        .print-meta-value {
          color: #0f172a;
        }
        .print-content {
          font-size: 11pt;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .print-footer {
          margin-top: 36px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          font-size: 8.5pt;
          color: #64748b;
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }
        .print-footer-left {
          max-width: 70%;
        }
        .print-action-bar {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          justify-content: center;
          gap: 10px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 16px;
        }
      `}</style>

      <div className="no-print print-action-bar">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir / Salvar como PDF
        </Button>
        <Button variant="outline" onClick={() => window.close()}>
          Fechar
        </Button>
      </div>

      <article className="print-sheet">
        <header className="print-header">
          <div className="print-header-top">
            <div>
              <p className="print-orgao">
                {meta.orgaoNomeFantasia ?? meta.orgaoRazaoSocial}
              </p>
              <p className="print-orgao-meta">
                {meta.orgaoNomeFantasia ? `${meta.orgaoRazaoSocial} · ` : ''}
                CNPJ {meta.orgaoCnpj}
                {meta.localidade ? ` · ${meta.localidade}` : ''}
              </p>
            </div>
            {meta.orgaoLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.orgaoLogoUrl}
                alt={meta.orgaoNomeFantasia ?? meta.orgaoRazaoSocial}
                className="print-orgao-logo"
              />
            ) : null}
          </div>
          <h1 className="print-title">{title}</h1>
          <p className="print-subtitle">Processo administrativo nº {meta.numeroProcesso}</p>
        </header>

        <dl className="print-meta-grid">
          <div>
            <dt className="print-meta-label">Objeto</dt>
            <dd className="print-meta-value">{meta.objeto}</dd>
          </div>
          <div>
            <dt className="print-meta-label">Data de emissão</dt>
            <dd className="print-meta-value">{meta.dataEmissao}</dd>
          </div>
          <div>
            <dt className="print-meta-label">Responsável</dt>
            <dd className="print-meta-value">
              {meta.responsavelNome}
              {meta.responsavelCargo ? ` — ${meta.responsavelCargo}` : ''}
            </dd>
          </div>
          <div>
            <dt className="print-meta-label">Status</dt>
            <dd className="print-meta-value">
              {status === 'aprovado' ? 'Aprovado' : status === 'publicado' ? 'Publicado' : status === 'gerado' ? 'Gerado' : status}
              {meta.aprovadoEm ? ` · aprovado em ${new Date(meta.aprovadoEm).toLocaleDateString('pt-BR')}` : ''}
            </dd>
          </div>
        </dl>

        <section className="print-content">
          {content.trim().length > 0 ? content : 'Artefato ainda não gerado.'}
        </section>

        <footer className="print-footer">
          <div className="print-footer-left">
            Documento emitido em {meta.dataEmissao}. Fundamentado na Lei 14.133/2021 e
            jurisprudência do TCU correlata.
          </div>
          <div>
            Processo nº {meta.numeroProcesso}
          </div>
        </footer>
      </article>
    </div>
  )
}
