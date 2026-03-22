'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCompanyContext } from '@/contexts/company-context'
import { addCompanyAction } from '@/actions/multi-company'

/** Format CNPJ as user types: 12.345.678/0001-99 */
function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

interface AddCompanyDialogProps {
  onClose: () => void
}

export function AddCompanyDialog({ onClose }: AddCompanyDialogProps) {
  const { addCompany, companies, maxCompanies } = useCompanyContext()
  const [cnpj, setCnpj] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [fantasia, setFantasia] = useState('')
  const [loading, setLoading] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const cleanCnpj = cnpj.replace(/\D/g, '')

  // Auto-fetch company data when CNPJ has 14 digits
  useEffect(() => {
    if (cleanCnpj.length !== 14) {
      setCompanyName('')
      setFantasia('')
      return
    }

    let cancelled = false
    setLookingUp(true)
    setError(null)

    fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
      headers: { Accept: 'application/json' },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.status === 'ERROR') {
          setError(data.message || 'CNPJ não encontrado')
        } else {
          setCompanyName(data.nome || '')
          setFantasia(data.fantasia || '')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Erro ao consultar CNPJ')
      })
      .finally(() => {
        if (!cancelled) setLookingUp(false)
      })

    return () => {
      cancelled = true
    }
  }, [cleanCnpj])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (cleanCnpj.length !== 14) {
      setError('CNPJ deve ter 14 dígitos')
      return
    }

    if (!companyName.trim()) {
      setError('Nome da empresa é obrigatório')
      return
    }

    // Check if CNPJ is already in the user's list
    if (companies.some((c) => c.cnpj === cleanCnpj)) {
      setError('Esta empresa já está vinculada à sua conta')
      return
    }

    setLoading(true)

    try {
      const result = await addCompanyAction({
        cnpj: cleanCnpj,
        razao_social: companyName.trim(),
        nome_fantasia: fantasia.trim() || null,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      if (result.company) {
        addCompany(result.company)
        setSuccess(true)
        // Auto-close after brief delay
        setTimeout(() => onClose(), 1500)
      }
    } catch {
      setError('Erro inesperado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Fechar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Adicionar Empresa
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Vincule mais um CNPJ à sua conta ({companies.length}/{maxCompanies})
        </p>

        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Empresa adicionada com sucesso!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="cnpj" className="text-sm font-medium text-gray-700">
                CNPJ
              </Label>
              <Input
                id="cnpj"
                type="text"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
                className="mt-1"
                disabled={loading}
                autoFocus
              />
            </div>

            {lookingUp && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Consultando Receita Federal...
              </p>
            )}

            {companyName && (
              <>
                <div>
                  <Label htmlFor="razao" className="text-sm font-medium text-gray-700">
                    Razão Social
                  </Label>
                  <Input
                    id="razao"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="mt-1"
                    disabled={loading}
                  />
                </div>

                {fantasia && (
                  <div>
                    <Label htmlFor="fantasia" className="text-sm font-medium text-gray-700">
                      Nome Fantasia
                    </Label>
                    <Input
                      id="fantasia"
                      type="text"
                      value={fantasia}
                      onChange={(e) => setFantasia(e.target.value)}
                      className="mt-1"
                      disabled={loading}
                    />
                  </div>
                )}
              </>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-brand hover:bg-brand/90 text-white"
                disabled={loading || cleanCnpj.length !== 14 || !companyName.trim()}
              >
                {loading ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
