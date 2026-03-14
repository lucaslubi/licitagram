'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { lookupCNPJ, saveCompany, loadCompanyData } from '@/actions/company'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const PORTES = [
  { value: 'mei', label: 'MEI' },
  { value: 'me', label: 'Microempresa (ME)' },
  { value: 'epp', label: 'Empresa de Pequeno Porte (EPP)' },
  { value: 'medio', label: 'Médio Porte' },
  { value: 'grande', label: 'Grande Porte' },
]

export default function CompanyPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [company, setCompany] = useState({
    id: '',
    cnpj: '',
    razao_social: '',
    nome_fantasia: '',
    porte: '',
    uf: '',
    municipio: '',
    cnae_principal: '',
    cnaes_secundarios: [] as string[],
    descricao_servicos: '',
    capacidades: [] as string[],
    certificacoes: [] as string[],
    palavras_chave: [] as string[],
  })

  const [newCnae, setNewCnae] = useState('')
  const [newCapacidade, setNewCapacidade] = useState('')
  const [newCertificacao, setNewCertificacao] = useState('')
  const [newPalavra, setNewPalavra] = useState('')

  useEffect(() => {
    loadCompany()
  }, [])

  // Normalize arrays from DB — split any comma-separated strings into individual items
  function normalizeArray(arr: string[] | null | undefined): string[] {
    if (!arr || arr.length === 0) return []
    return arr.flatMap((item) =>
      item.includes(',') ? item.split(',').map((s) => s.trim()).filter(Boolean) : [item.trim()]
    ).filter(Boolean)
  }

  async function loadCompany() {
    const result = await loadCompanyData()
    if (result.data) {
      setCompany({
        id: result.data.id,
        cnpj: result.data.cnpj || '',
        razao_social: result.data.razao_social || '',
        nome_fantasia: result.data.nome_fantasia || '',
        porte: result.data.porte || '',
        uf: result.data.uf || '',
        municipio: result.data.municipio || '',
        cnae_principal: result.data.cnae_principal || '',
        cnaes_secundarios: normalizeArray(result.data.cnaes_secundarios),
        descricao_servicos: result.data.descricao_servicos || '',
        capacidades: normalizeArray(result.data.capacidades),
        certificacoes: normalizeArray(result.data.certificacoes),
        palavras_chave: normalizeArray(result.data.palavras_chave),
      })
    }
    setLoading(false)
  }

  async function fetchCNPJ() {
    const clean = company.cnpj.replace(/\D/g, '')
    if (clean.length !== 14) {
      showMessage('CNPJ deve ter 14 dígitos', 'error')
      return
    }

    setFetching(true)
    const result = await lookupCNPJ(clean)
    setFetching(false)

    if (result.error) {
      showMessage(result.error, 'error')
      return
    }

    if (result.data) {
      const data = result.data
      setCompany((prev) => ({
        ...prev,
        razao_social: data.nome || prev.razao_social,
        nome_fantasia: data.fantasia || prev.nome_fantasia,
        uf: data.uf || prev.uf,
        municipio: data.municipio || prev.municipio,
        porte: data.porte?.toLowerCase().includes('micro') ? 'me' : prev.porte,
        cnae_principal:
          data.atividade_principal?.[0]?.code?.replace(/[.-]/g, '') || prev.cnae_principal,
        cnaes_secundarios:
          data.atividades_secundarias
            ?.map((a: { code: string }) => a.code.replace(/[.-]/g, ''))
            .filter(Boolean) || prev.cnaes_secundarios,
      }))
      showMessage('Dados do CNPJ carregados!', 'success')
    }
  }

  async function handleSave() {
    if (!company.cnpj.replace(/\D/g, '') || !company.razao_social) {
      showMessage('CNPJ e Razão Social são obrigatórios', 'error')
      return
    }

    setSaving(true)
    setMessage('')

    const payload = {
      cnpj: company.cnpj.replace(/\D/g, ''),
      razao_social: company.razao_social,
      nome_fantasia: company.nome_fantasia,
      porte: company.porte,
      uf: company.uf,
      municipio: company.municipio,
      cnae_principal: company.cnae_principal,
      cnaes_secundarios: company.cnaes_secundarios,
      descricao_servicos: company.descricao_servicos,
      capacidades: company.capacidades,
      certificacoes: company.certificacoes,
      palavras_chave: company.palavras_chave,
    }

    const result = await saveCompany(payload, company.id || undefined)

    if (result.error) {
      showMessage('Erro ao salvar: ' + result.error, 'error')
    } else if (result.id) {
      setCompany((prev) => ({ ...prev, id: result.id! }))
      const matchMsg = result.matchesFound && result.matchesFound > 0
        ? ` ${result.matchesFound} matches encontrados com base no seu perfil.`
        : ' Matches serão atualizados automaticamente.'
      showMessage(
        (company.id ? 'Empresa atualizada com sucesso!' : 'Empresa cadastrada com sucesso!') + matchMsg,
        'success',
      )
    }
    setSaving(false)
  }

  function showMessage(msg: string, type: 'success' | 'error' | 'info') {
    setMessage(msg)
    setMessageType(type)
  }

  function addTag(
    field: 'cnaes_secundarios' | 'capacidades' | 'certificacoes' | 'palavras_chave',
    value: string,
  ) {
    if (!value.trim()) return
    setCompany((prev) => ({
      ...prev,
      [field]: [...prev[field], value.trim()],
    }))
  }

  function removeTag(
    field: 'cnaes_secundarios' | 'capacidades' | 'certificacoes' | 'palavras_chave',
    index: number,
  ) {
    setCompany((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }))
  }

  if (loading) return <div className="text-gray-400">Carregando...</div>

  const msgColors = {
    success: 'bg-emerald-50 text-emerald-700',
    error: 'bg-red-50 text-red-700',
    info: 'bg-brand/5 text-brand',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Perfil da Empresa</h1>

      {message && (
        <div className={`mb-4 p-3 rounded-md text-sm ${msgColors[messageType]}`}>{message}</div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados Básicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>CNPJ</Label>
                <Input
                  value={company.cnpj}
                  onChange={(e) => setCompany({ ...company, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={fetchCNPJ} disabled={fetching}>
                  {fetching ? 'Consultando...' : 'Consultar'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Razão Social</Label>
                <Input
                  value={company.razao_social}
                  onChange={(e) => setCompany({ ...company, razao_social: e.target.value })}
                />
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input
                  value={company.nome_fantasia}
                  onChange={(e) => setCompany({ ...company, nome_fantasia: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Porte</Label>
                <select
                  value={company.porte}
                  onChange={(e) => setCompany({ ...company, porte: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione</option>
                  {PORTES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>UF</Label>
                <select
                  value={company.uf}
                  onChange={(e) => setCompany({ ...company, uf: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Município</Label>
                <Input
                  value={company.municipio}
                  onChange={(e) => setCompany({ ...company, municipio: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>CNAE Principal</Label>
              <Input
                value={company.cnae_principal}
                onChange={(e) => setCompany({ ...company, cnae_principal: e.target.value })}
                placeholder="Ex: 6201501"
              />
            </div>

            <div>
              <Label>Descrição dos Serviços</Label>
              <textarea
                value={company.descricao_servicos}
                onChange={(e) => setCompany({ ...company, descricao_servicos: e.target.value })}
                placeholder="Descreva os principais serviços e produtos que a empresa oferece. Quanto mais detalhado, melhor será o matching com as licitações."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qualificações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <TagInput
              label="CNAEs Secundários"
              tags={company.cnaes_secundarios}
              value={newCnae}
              onChange={setNewCnae}
              onAdd={() => {
                addTag('cnaes_secundarios', newCnae)
                setNewCnae('')
              }}
              onRemove={(i) => removeTag('cnaes_secundarios', i)}
              placeholder="Código CNAE"
            />
            <TagInput
              label="Capacidades Técnicas"
              tags={company.capacidades}
              value={newCapacidade}
              onChange={setNewCapacidade}
              onAdd={() => {
                addTag('capacidades', newCapacidade)
                setNewCapacidade('')
              }}
              onRemove={(i) => removeTag('capacidades', i)}
              placeholder="Ex: Fornecimento de TI"
            />
            <TagInput
              label="Certificações"
              tags={company.certificacoes}
              value={newCertificacao}
              onChange={setNewCertificacao}
              onAdd={() => {
                addTag('certificacoes', newCertificacao)
                setNewCertificacao('')
              }}
              onRemove={(i) => removeTag('certificacoes', i)}
              placeholder="Ex: ISO 9001"
            />
            <TagInput
              label="Palavras-chave"
              tags={company.palavras_chave}
              value={newPalavra}
              onChange={setNewPalavra}
              onAdd={() => {
                addTag('palavras_chave', newPalavra)
                setNewPalavra('')
              }}
              onRemove={(i) => removeTag('palavras_chave', i)}
              placeholder="Ex: software, consultoria"
            />
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
          {saving ? 'Salvando e buscando matches...' : company.id ? 'Atualizar Empresa' : 'Cadastrar Empresa'}
        </Button>
      </div>
    </div>
  )
}

function TagInput({
  label,
  tags,
  value,
  onChange,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string
  tags: string[]
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  onRemove: (i: number) => void
  placeholder: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2 mt-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
        />
        <Button variant="outline" onClick={onAdd} type="button">
          +
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {tags.map((tag, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => onRemove(i)}
            >
              {tag} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
