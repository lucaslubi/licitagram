'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemRow {
  item_number: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
}

interface LicitacaoData {
  numero: string
  modalidade: string
  uasg: string
  orgao: string
  objeto: string
}

interface EmpresaData {
  razao_social: string
  cnpj: string
  endereco: string
  cep: string
  telefone: string
  email: string
  banco: string
  agencia: string
  conta: string
  representante_nome: string
  representante_cpf: string
  representante_cargo: string
}

interface InitialData {
  proposalId?: string
  matchId?: string
  tenderId?: string
  templateType?: string
  licitacao: LicitacaoData
  empresa: EmpresaData
  items: Array<Record<string, unknown>>
  valorMensal?: number
  valorGlobal: number
  validadeDias: number
  prazoEntrega: string
  declarations: string[]
  cidade: string
  observacoes: string
  status: string
}

interface ProposalWizardProps {
  initialData: InitialData
}

const TEMPLATE_OPTIONS = [
  {
    value: 'bens',
    title: 'Bens',
    description: 'Proposta para fornecimento de bens e materiais',
    icon: '📦',
  },
  {
    value: 'servicos',
    title: 'Servicos Continuados',
    description: 'Proposta para prestação de serviços continuados',
    icon: '🔧',
  },
  {
    value: 'tic_saas',
    title: 'TIC / SaaS',
    description: 'Proposta para solucoes de TI e software como servico',
    icon: '💻',
  },
]

const UNIT_OPTIONS = ['UN', 'CX', 'PCT', 'KG', 'L', 'M', 'M2', 'M3', 'HR', 'DIA', 'MES', 'ANO', 'SV', 'LICENCA']

const DECLARATION_OPTIONS = [
  { key: 'exequibilidade', label: 'Declaracao de Exequibilidade' },
  { key: 'tributos_inclusos', label: 'Tributos e encargos inclusos nos precos' },
  { key: 'conhecimento_edital', label: 'Conhecimento integral do edital' },
  { key: 'validade_proposta', label: 'Validade da proposta conforme prazo indicado' },
  { key: 'me_epp', label: 'Declaracao ME/EPP (se aplicavel)' },
  { key: 'sem_vinculo', label: 'Sem vinculo com o orgao licitante' },
]

const STEPS = [
  'Template',
  'Itens e Precos',
  'Dados da Empresa',
  'Revisao',
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalWizard({ initialData }: ProposalWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(initialData.templateType ? 1 : 0)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [proposalId, setProposalId] = useState(initialData.proposalId || '')

  // Step 1: Template
  const [templateType, setTemplateType] = useState(initialData.templateType || '')

  // Step 2: Items
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (initialData.items.length > 0) {
      return initialData.items.map((item, i) => ({
        item_number: (item.item_number as number) || i + 1,
        description: (item.description as string) || '',
        quantity: Number(item.quantity) || 1,
        unit: (item.unit as string) || 'UN',
        unit_price: Number(item.unit_price) || 0,
        total_price: Number(item.total_price) || 0,
      }))
    }
    return [{ item_number: 1, description: '', quantity: 1, unit: 'UN', unit_price: 0, total_price: 0 }]
  })

  // Step 3: Company data
  const [licitacao, setLicitacao] = useState<LicitacaoData>(initialData.licitacao)
  const [empresa, setEmpresa] = useState<EmpresaData>(initialData.empresa)
  const [validadeDias, setValidadeDias] = useState(initialData.validadeDias)
  const [prazoEntrega, setPrazoEntrega] = useState(initialData.prazoEntrega)
  const [declarations, setDeclarations] = useState<string[]>(initialData.declarations)
  const [cidade, setCidade] = useState(initialData.cidade)
  const [observacoes, setObservacoes] = useState(initialData.observacoes)

  // Computed valor global
  const valorGlobal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.total_price, 0)
  }, [items])

  // ─── Item Handlers ─────────────────────────────────────────────────────────

  const updateItem = useCallback((index: number, field: keyof ItemRow, value: string | number) => {
    setItems(prev => {
      const updated = [...prev]
      const item = { ...updated[index] }

      if (field === 'description' || field === 'unit') {
        item[field] = value as string
      } else if (field === 'quantity' || field === 'unit_price') {
        item[field] = Number(value) || 0
        item.total_price = item.quantity * item.unit_price
      }

      updated[index] = item
      return updated
    })
  }, [])

  const addItem = useCallback(() => {
    setItems(prev => [
      ...prev,
      { item_number: prev.length + 1, description: '', quantity: 1, unit: 'UN', unit_price: 0, total_price: 0 },
    ])
  }, [])

  const removeItem = useCallback((index: number) => {
    setItems(prev => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, item_number: i + 1 }))
    })
  }, [])

  // ─── Declaration Toggle ─────────────────────────────────────────────────────

  const toggleDeclaration = useCallback((key: string) => {
    setDeclarations(prev =>
      prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]
    )
  }, [])

  // ─── Build payload ──────────────────────────────────────────────────────────

  const buildPayload = useCallback(() => ({
    template_type: templateType,
    match_id: initialData.matchId || null,
    tender_id: initialData.tenderId || null,
    licitacao_numero: licitacao.numero,
    licitacao_modalidade: licitacao.modalidade,
    licitacao_uasg: licitacao.uasg,
    licitacao_orgao: licitacao.orgao,
    licitacao_objeto: licitacao.objeto,
    empresa_razao_social: empresa.razao_social,
    empresa_cnpj: empresa.cnpj,
    empresa_endereco: empresa.endereco,
    empresa_cep: empresa.cep,
    empresa_telefone: empresa.telefone,
    empresa_email: empresa.email,
    empresa_banco: empresa.banco,
    empresa_agencia: empresa.agencia,
    empresa_conta: empresa.conta,
    representante_nome: empresa.representante_nome,
    representante_cpf: empresa.representante_cpf,
    representante_cargo: empresa.representante_cargo,
    items,
    valor_global: valorGlobal,
    validade_dias: validadeDias,
    prazo_entrega: prazoEntrega,
    declarations,
    cidade,
    observacoes,
  }), [templateType, initialData, licitacao, empresa, items, valorGlobal, validadeDias, prazoEntrega, declarations, cidade, observacoes])

  // ─── Save Draft ─────────────────────────────────────────────────────────────

  const saveDraft = useCallback(async () => {
    setSaving(true)
    try {
      const payload = { ...buildPayload(), status: 'draft' }
      let res: Response

      if (proposalId) {
        res = await fetch(`/api/proposals/${proposalId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      if (!proposalId && data.proposal?.id) {
        setProposalId(data.proposal.id)
      }

      return data.proposal?.id || proposalId
    } catch (err) {
      console.error('Save draft error:', err)
      alert('Erro ao salvar rascunho. Tente novamente.')
      return null
    } finally {
      setSaving(false)
    }
  }, [buildPayload, proposalId])

  // ─── Generate DOCX ─────────────────────────────────────────────────────────

  const generateDocx = useCallback(async () => {
    setGenerating(true)
    try {
      // Save first
      const id = await saveDraft()
      if (!id) return

      const res = await fetch(`/api/proposals/${id}/generate-docx`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate')

      // Trigger download
      const link = document.createElement('a')
      link.href = data.url
      link.download = data.filename || 'proposta.docx'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Generate DOCX error:', err)
      alert('Erro ao gerar DOCX. Tente novamente.')
    } finally {
      setGenerating(false)
    }
  }, [saveDraft])

  // ─── Mark as Ready ─────────────────────────────────────────────────────────

  const markReady = useCallback(async () => {
    setSaving(true)
    try {
      const id = await saveDraft()
      if (!id) return

      const res = await fetch(`/api/proposals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }

      router.push('/proposals')
    } catch (err) {
      console.error('Mark ready error:', err)
      alert('Erro ao marcar como pronta.')
    } finally {
      setSaving(false)
    }
  }, [saveDraft, router])

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const canGoNext = step === 0 ? !!templateType : true

  // ─── Render Steps ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-[#2d2f33]" />}
            <button
              onClick={() => i <= step ? setStep(i) : null}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                i === step
                  ? 'bg-[#F43E01] text-white'
                  : i < step
                    ? 'bg-[#2d2f33] text-white cursor-pointer'
                    : 'bg-[#1a1c1f] text-gray-500'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-[10px]">
                {i < step ? '✓' : i + 1}
              </span>
              {label}
            </button>
          </div>
        ))}
      </div>

      {/* ── Step 0: Template Selection ─────────────────────────────────────── */}
      {step === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TEMPLATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTemplateType(opt.value)}
              className={`text-left p-6 rounded-xl border-2 transition-all ${
                templateType === opt.value
                  ? 'border-[#F43E01] bg-[#F43E01]/5'
                  : 'border-[#2d2f33] bg-[#1a1c1f] hover:border-[#3d3f43]'
              }`}
            >
              <div className="text-3xl mb-3">{opt.icon}</div>
              <h3 className="text-lg font-bold text-white mb-1">{opt.title}</h3>
              <p className="text-sm text-gray-400">{opt.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Step 1: Items & Prices ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card className="border-[#2d2f33] bg-[#1a1c1f]">
          <CardHeader>
            <CardTitle>Itens da Proposta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Licitacao info row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 p-4 bg-[#23262a] rounded-lg">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Numero da Licitacao</label>
                <Input
                  value={licitacao.numero}
                  onChange={e => setLicitacao(prev => ({ ...prev, numero: e.target.value }))}
                  className="bg-[#1a1c1f] border-[#2d2f33] text-white"
                  placeholder="Ex: PE 001/2026"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Orgao</label>
                <Input
                  value={licitacao.orgao}
                  onChange={e => setLicitacao(prev => ({ ...prev, orgao: e.target.value }))}
                  className="bg-[#1a1c1f] border-[#2d2f33] text-white"
                />
              </div>
            </div>

            {/* Items table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d2f33]">
                    <th className="text-left p-2 text-gray-400 font-medium w-10">#</th>
                    <th className="text-left p-2 text-gray-400 font-medium">Descricao</th>
                    <th className="text-left p-2 text-gray-400 font-medium w-20">Qtd</th>
                    <th className="text-left p-2 text-gray-400 font-medium w-28">Unidade</th>
                    <th className="text-left p-2 text-gray-400 font-medium w-32">Valor Unit.</th>
                    <th className="text-left p-2 text-gray-400 font-medium w-32">Valor Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-[#2d2f33]">
                      <td className="p-2 text-gray-500">{item.item_number}</td>
                      <td className="p-2">
                        <Input
                          value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          className="bg-[#23262a] border-[#2d2f33] text-white text-sm"
                          placeholder="Descricao do item"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          className="bg-[#23262a] border-[#2d2f33] text-white text-sm"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={item.unit}
                          onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-full rounded-md bg-[#23262a] border border-[#2d2f33] text-white text-sm px-2 py-2"
                        >
                          {UNIT_OPTIONS.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={item.unit_price || ''}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                          className="bg-[#23262a] border-[#2d2f33] text-white text-sm"
                          placeholder="0,00"
                        />
                      </td>
                      <td className="p-2 text-emerald-400 font-medium">
                        R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                          title="Remover item"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              onClick={addItem}
              variant="ghost"
              className="text-[#F43E01] hover:text-white hover:bg-[#2d2f33]"
            >
              + Adicionar Item
            </Button>

            {/* Global value footer */}
            <div className="flex items-center justify-end gap-4 p-4 bg-[#23262a] rounded-lg mt-4">
              <span className="text-lg font-bold text-white">VALOR GLOBAL:</span>
              <span className="text-xl font-bold text-emerald-400">
                R$ {valorGlobal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Company Data & Declarations ─────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Company data */}
          <Card className="border-[#2d2f33] bg-[#1a1c1f]">
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Razao Social</label>
                  <Input
                    value={empresa.razao_social}
                    onChange={e => setEmpresa(prev => ({ ...prev, razao_social: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">CNPJ</label>
                  <Input
                    value={empresa.cnpj}
                    onChange={e => setEmpresa(prev => ({ ...prev, cnpj: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Endereco</label>
                  <Input
                    value={empresa.endereco}
                    onChange={e => setEmpresa(prev => ({ ...prev, endereco: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">CEP</label>
                  <Input
                    value={empresa.cep}
                    onChange={e => setEmpresa(prev => ({ ...prev, cep: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Telefone</label>
                  <Input
                    value={empresa.telefone}
                    onChange={e => setEmpresa(prev => ({ ...prev, telefone: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">E-mail</label>
                  <Input
                    value={empresa.email}
                    onChange={e => setEmpresa(prev => ({ ...prev, email: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank details */}
          <Card className="border-[#2d2f33] bg-[#1a1c1f]">
            <CardHeader>
              <CardTitle>Dados Bancarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Banco</label>
                  <Input
                    value={empresa.banco}
                    onChange={e => setEmpresa(prev => ({ ...prev, banco: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Agencia</label>
                  <Input
                    value={empresa.agencia}
                    onChange={e => setEmpresa(prev => ({ ...prev, agencia: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Conta</label>
                  <Input
                    value={empresa.conta}
                    onChange={e => setEmpresa(prev => ({ ...prev, conta: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Legal representative */}
          <Card className="border-[#2d2f33] bg-[#1a1c1f]">
            <CardHeader>
              <CardTitle>Representante Legal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Nome</label>
                  <Input
                    value={empresa.representante_nome}
                    onChange={e => setEmpresa(prev => ({ ...prev, representante_nome: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">CPF</label>
                  <Input
                    value={empresa.representante_cpf}
                    onChange={e => setEmpresa(prev => ({ ...prev, representante_cpf: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Cargo</label>
                  <Input
                    value={empresa.representante_cargo}
                    onChange={e => setEmpresa(prev => ({ ...prev, representante_cargo: e.target.value }))}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Declarations */}
          <Card className="border-[#2d2f33] bg-[#1a1c1f]">
            <CardHeader>
              <CardTitle>Declaracoes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {DECLARATION_OPTIONS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => toggleDeclaration(key)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      declarations.includes(key)
                        ? 'bg-[#F43E01] border-[#F43E01]'
                        : 'border-[#2d2f33] group-hover:border-gray-500'
                    }`}
                  >
                    {declarations.includes(key) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-300">{label}</span>
                </label>
              ))}
            </CardContent>
          </Card>

          {/* Additional fields */}
          <Card className="border-[#2d2f33] bg-[#1a1c1f]">
            <CardHeader>
              <CardTitle>Informações Adicionais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Validade (dias)</label>
                  <Input
                    type="number"
                    value={validadeDias}
                    onChange={e => setValidadeDias(Number(e.target.value) || 60)}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Prazo de Entrega</label>
                  <Input
                    value={prazoEntrega}
                    onChange={e => setPrazoEntrega(e.target.value)}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                    placeholder="Ex: 30 dias corridos"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Cidade</label>
                  <Input
                    value={cidade}
                    onChange={e => setCidade(e.target.value)}
                    className="bg-[#23262a] border-[#2d2f33] text-white"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-gray-400 block mb-1">Observacoes</label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  className="w-full rounded-md bg-[#23262a] border border-[#2d2f33] text-white text-sm px-3 py-2 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-[#F43E01]"
                  placeholder="Observacoes adicionais..."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 3: Preview & Download ──────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Preview */}
          <Card className="border-[#2d2f33] bg-[#1a1c1f]">
            <CardHeader>
              <CardTitle>Resumo da Proposta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Template */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-[#F43E01] text-[#F43E01]">
                  {TEMPLATE_OPTIONS.find(t => t.value === templateType)?.title || templateType}
                </Badge>
              </div>

              {/* Licitacao info */}
              <div className="p-4 bg-[#23262a] rounded-lg space-y-2">
                <h4 className="text-sm font-medium text-gray-400 uppercase">Licitacao</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Numero:</span> <span className="text-white">{licitacao.numero || '-'}</span></div>
                  <div><span className="text-gray-500">Modalidade:</span> <span className="text-white">{licitacao.modalidade || '-'}</span></div>
                  <div><span className="text-gray-500">Orgao:</span> <span className="text-white">{licitacao.orgao || '-'}</span></div>
                  <div><span className="text-gray-500">UASG:</span> <span className="text-white">{licitacao.uasg || '-'}</span></div>
                </div>
                {licitacao.objeto && (
                  <div className="text-sm">
                    <span className="text-gray-500">Objeto:</span>
                    <p className="text-white mt-1">{licitacao.objeto}</p>
                  </div>
                )}
              </div>

              {/* Items summary */}
              <div className="p-4 bg-[#23262a] rounded-lg">
                <h4 className="text-sm font-medium text-gray-400 uppercase mb-3">Itens ({items.length})</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2d2f33]">
                      <th className="text-left py-2 text-gray-500">#</th>
                      <th className="text-left py-2 text-gray-500">Descricao</th>
                      <th className="text-right py-2 text-gray-500">Qtd</th>
                      <th className="text-right py-2 text-gray-500">Unit.</th>
                      <th className="text-right py-2 text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.item_number} className="border-b border-[#2d2f33]/50">
                        <td className="py-2 text-gray-400">{item.item_number}</td>
                        <td className="py-2 text-white">{item.description || '-'}</td>
                        <td className="py-2 text-right text-gray-300">{item.quantity} {item.unit}</td>
                        <td className="py-2 text-right text-gray-300">
                          R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-right text-emerald-400 font-medium">
                          R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end mt-3 pt-3 border-t border-[#2d2f33]">
                  <span className="text-lg font-bold text-white mr-4">VALOR GLOBAL:</span>
                  <span className="text-lg font-bold text-emerald-400">
                    R$ {valorGlobal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Company summary */}
              <div className="p-4 bg-[#23262a] rounded-lg space-y-2">
                <h4 className="text-sm font-medium text-gray-400 uppercase">Empresa</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Razao Social:</span> <span className="text-white">{empresa.razao_social}</span></div>
                  <div><span className="text-gray-500">CNPJ:</span> <span className="text-white">{empresa.cnpj}</span></div>
                  <div><span className="text-gray-500">Representante:</span> <span className="text-white">{empresa.representante_nome}</span></div>
                  <div><span className="text-gray-500">Cidade:</span> <span className="text-white">{cidade}</span></div>
                </div>
              </div>

              {/* Declarations */}
              <div className="p-4 bg-[#23262a] rounded-lg">
                <h4 className="text-sm font-medium text-gray-400 uppercase mb-2">Declaracoes</h4>
                <div className="flex flex-wrap gap-2">
                  {declarations.map(d => {
                    const opt = DECLARATION_OPTIONS.find(o => o.key === d)
                    return (
                      <Badge key={d} variant="outline" className="text-xs border-[#2d2f33] text-gray-300">
                        {opt?.label || d}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={saveDraft}
              disabled={saving}
              variant="ghost"
              className="border border-[#2d2f33] text-gray-300 hover:text-white hover:bg-[#2d2f33]"
            >
              {saving ? 'Salvando...' : 'Salvar Rascunho'}
            </Button>
            <Button
              onClick={generateDocx}
              disabled={generating || saving}
              className="bg-[#F43E01] hover:bg-[#d63600] text-white"
            >
              {generating ? 'Gerando...' : 'Gerar DOCX'}
            </Button>
            <Button
              onClick={markReady}
              disabled={saving}
              variant="ghost"
              className="border border-emerald-800/30 text-emerald-400 hover:bg-emerald-900/20"
            >
              Marcar como Pronta
            </Button>
          </div>
        </div>
      )}

      {/* ── Navigation buttons ──────────────────────────────────────────────── */}
      {step < 3 && (
        <div className="flex justify-between mt-8">
          <Button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            variant="ghost"
            className="text-gray-400 hover:text-white hover:bg-[#2d2f33]"
          >
            Voltar
          </Button>
          <Button
            onClick={() => setStep(s => Math.min(3, s + 1))}
            disabled={!canGoNext}
            className="bg-[#F43E01] hover:bg-[#d63600] text-white"
          >
            Proximo
          </Button>
        </div>
      )}
    </div>
  )
}
