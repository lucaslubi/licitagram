'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { lookupCNPJ, saveCompany, loadCompanyData } from '@/actions/company'

const isValidCnaeCode = (s: string): boolean => /^\d{7}$/.test((s || '').replace(/\D/g, ''))

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
    // Campos para propostas comerciais
    endereco: '',
    cep: '',
    telefone: '',
    email: '',
    banco: '',
    agencia: '',
    conta: '',
    representante_nome: '',
    representante_cpf: '',
    representante_cargo: '',
  })

  const [newCnae, setNewCnae] = useState('')
  const [newCapacidade, setNewCapacidade] = useState('')
  const [newCertificacao, setNewCertificacao] = useState('')
  const [newPalavra, setNewPalavra] = useState('')
  const [generatingDesc, setGeneratingDesc] = useState(false)
  const [generatingKw, setGeneratingKw] = useState(false)

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
        endereco: result.data.endereco || '',
        cep: result.data.cep || '',
        telefone: result.data.telefone || '',
        email: result.data.email || '',
        banco: result.data.banco || '',
        agencia: result.data.agencia || '',
        conta: result.data.conta || '',
        representante_nome: result.data.representante_nome || '',
        representante_cpf: result.data.representante_cpf || '',
        representante_cargo: result.data.representante_cargo || '',
      })
    }
    setLoading(false)
  }

  async function fetchCNPJ(silent = false) {
    const clean = company.cnpj.replace(/\D/g, '')
    if (clean.length !== 14) {
      if (!silent) showMessage('CNPJ deve ter 14 dígitos', 'error')
      return
    }

    setFetching(true)
    const result = await lookupCNPJ(clean)
    setFetching(false)

    if (result.error) {
      if (!silent) showMessage(result.error, 'error')
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
        porte: data.porte?.toLowerCase().includes('micro')
          ? 'me'
          : data.porte?.toLowerCase().includes('pequeno')
            ? 'epp'
            : data.porte?.toLowerCase().includes('demais')
              ? 'medio'
              : prev.porte,
        cnae_principal:
          data.atividade_principal?.[0]?.code?.replace(/[.-]/g, '') || prev.cnae_principal,
        cnaes_secundarios:
          data.atividades_secundarias
            ?.map((a: { code: string }) => a.code.replace(/[.-]/g, ''))
            .filter((c: string) => /^\d{7}$/.test(c)) || prev.cnaes_secundarios,
        endereco: data.endereco || prev.endereco,
        cep: data.cep || prev.cep,
        telefone: data.telefone || prev.telefone,
        email: data.email || prev.email,
      }))
      showMessage(
        '✅ Dados preenchidos automaticamente pela Receita Federal. Revise e complete os campos restantes.',
        'success',
      )
    }
  }

  // Auto-fetch assim que o CNPJ atinge 14 dígitos — elimina o clique manual
  // no botão "Consultar" (era o ponto de falha que deixou o Seculus sem CNAE).
  useEffect(() => {
    const clean = company.cnpj.replace(/\D/g, '')
    if (clean.length === 14 && !company.id && !company.razao_social) {
      fetchCNPJ(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.cnpj])

  async function handleSave() {
    if (!company.cnpj.replace(/\D/g, '') || !company.razao_social) {
      showMessage('CNPJ e Razão Social são obrigatórios', 'error')
      return
    }

    // Validação de CNAE principal: obrigatório e deve ter 7 dígitos numéricos.
    // Sem ele, o worker de Inteligência Competitiva não consegue classificar concorrentes.
    const cnaePrincipalClean = (company.cnae_principal || '').replace(/\D/g, '')
    if (!isValidCnaeCode(cnaePrincipalClean)) {
      showMessage(
        '⚠️ CNAE principal é obrigatório e deve ter 7 dígitos numéricos (ex: 6201501). ' +
        'Dica: digite o CNPJ primeiro — nós buscamos o CNAE automaticamente na Receita Federal.',
        'error',
      )
      return
    }

    // Filtra cnaes_secundarios mantendo só códigos válidos — silenciosamente remove lixo
    const cleanedSecundarios = (company.cnaes_secundarios || [])
      .map((s) => (s || '').replace(/\D/g, ''))
      .filter(isValidCnaeCode)
    const removedCount = (company.cnaes_secundarios || []).length - cleanedSecundarios.length
    if (removedCount > 0) {
      // Atualiza o state para refletir a limpeza — usuário vê exatamente o que foi enviado
      setCompany((prev) => ({ ...prev, cnaes_secundarios: cleanedSecundarios }))
      showMessage(
        `Removemos ${removedCount} item(ns) dos CNAEs secundários que não eram códigos válidos. ` +
        'Use apenas códigos numéricos de 7 dígitos.',
        'info',
      )
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
      cnae_principal: cnaePrincipalClean,
      cnaes_secundarios: cleanedSecundarios,
      descricao_servicos: company.descricao_servicos,
      capacidades: company.capacidades,
      certificacoes: company.certificacoes,
      palavras_chave: company.palavras_chave,
      endereco: company.endereco,
      cep: company.cep,
      telefone: company.telefone,
      email: company.email,
      banco: company.banco,
      agencia: company.agencia,
      conta: company.conta,
      representante_nome: company.representante_nome,
      representante_cpf: company.representante_cpf,
      representante_cargo: company.representante_cargo,
    }

    const result = await saveCompany(payload, company.id || undefined)

    if (result.error) {
      showMessage('Erro ao salvar: ' + result.error, 'error')
    } else if (result.id) {
      setCompany((prev) => ({ ...prev, id: result.id! }))
      showMessage(
        (company.id ? 'Empresa atualizada!' : 'Empresa cadastrada!') +
        ' A IA vai buscar matches para o seu perfil em segundo plano. Pode continuar usando a plataforma.',
        'success',
      )
    }
    setSaving(false)
  }

  function showMessage(msg: string, type: 'success' | 'error' | 'info') {
    setMessage(msg)
    setMessageType(type)
  }

  async function generateDescription() {
    if (!company.cnae_principal) {
      showMessage('Preencha o CNAE principal antes de gerar a descrição', 'error')
      return
    }
    setGeneratingDesc(true)
    try {
      const res = await fetch('/api/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'description',
          razao_social: company.razao_social,
          cnae_principal: company.cnae_principal,
          cnaes_secundarios: company.cnaes_secundarios,
          capacidades: company.capacidades,
        }),
      })
      const data = await res.json()
      if (data.description) {
        setCompany((prev) => ({ ...prev, descricao_servicos: data.description }))
        showMessage('Descrição gerada pela IA! Revise e ajuste se necessário.', 'success')
      } else {
        showMessage(data.error || 'Erro ao gerar descrição', 'error')
      }
    } catch {
      showMessage('Erro de conexão ao gerar descrição', 'error')
    }
    setGeneratingDesc(false)
  }

  async function generateKeywords() {
    if (!company.cnae_principal) {
      showMessage('Preencha o CNAE principal antes de gerar palavras-chave', 'error')
      return
    }
    setGeneratingKw(true)
    try {
      const res = await fetch('/api/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'keywords',
          razao_social: company.razao_social,
          cnae_principal: company.cnae_principal,
          cnaes_secundarios: company.cnaes_secundarios,
          descricao_servicos: company.descricao_servicos,
          capacidades: company.capacidades,
          palavras_chave: company.palavras_chave,
        }),
      })
      const data = await res.json()
      if (data.keywords && data.keywords.length > 0) {
        setCompany((prev) => ({
          ...prev,
          palavras_chave: [...prev.palavras_chave, ...data.keywords],
        }))
        showMessage(`${data.keywords.length} palavras-chave geradas pela IA! Revise e remova as que não se aplicam.`, 'success')
      } else {
        showMessage(data.error || 'Nenhuma palavra-chave nova gerada', 'error')
      }
    } catch {
      showMessage('Erro de conexão ao gerar palavras-chave', 'error')
    }
    setGeneratingKw(false)
  }

  function addTag(
    field: 'cnaes_secundarios' | 'capacidades' | 'certificacoes' | 'palavras_chave',
    value: string,
  ) {
    if (!value.trim()) return
    // CNAEs secundários: só aceita código numérico de 7 dígitos
    if (field === 'cnaes_secundarios') {
      const clean = value.replace(/\D/g, '')
      if (!/^\d{7}$/.test(clean)) {
        showMessage(
          'CNAE secundário deve ser um código numérico de 7 dígitos (ex: 4751201). ' +
          'Categorias em texto livre não são aceitas — use os códigos oficiais da Receita.',
          'error',
        )
        return
      }
      setCompany((prev) => ({
        ...prev,
        cnaes_secundarios: [...prev.cnaes_secundarios, clean],
      }))
      return
    }
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
    success: 'bg-emerald-900/20 text-emerald-400',
    error: 'bg-red-900/20 text-red-400',
    info: 'bg-brand/10 text-brand',
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
                <Button variant="outline" onClick={() => fetchCNPJ(false)} disabled={fetching}>
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
              <Label>CNAE Principal <span className="text-red-400">*</span></Label>
              <Input
                value={company.cnae_principal}
                onChange={(e) => setCompany({ ...company, cnae_principal: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                placeholder="7 dígitos — ex: 6201501"
                inputMode="numeric"
                maxLength={7}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Digite o CNPJ no topo primeiro — buscamos o CNAE automaticamente na Receita Federal.
                Sem um CNAE válido, não conseguimos analisar concorrentes nem gerar o Radar Semanal.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Descrição dos Serviços</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateDescription}
                  disabled={generatingDesc || !company.cnae_principal}
                  className="text-xs h-7 px-3 gap-1"
                  type="button"
                >
                  {generatingDesc ? 'Gerando...' : 'Gerar com IA'}
                </Button>
              </div>
              <textarea
                value={company.descricao_servicos}
                onChange={(e) => setCompany({ ...company, descricao_servicos: e.target.value })}
                placeholder="Descreva os principais serviços e produtos que a empresa oferece. Ou clique em 'Gerar com IA' para criar automaticamente."
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
              onChange={(v) => setNewCnae(v.replace(/\D/g, '').slice(0, 7))}
              onAdd={() => {
                addTag('cnaes_secundarios', newCnae)
                setNewCnae('')
              }}
              onRemove={(i) => removeTag('cnaes_secundarios', i)}
              placeholder="7 dígitos — ex: 4751201"
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
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Palavras-chave</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateKeywords}
                  disabled={generatingKw || !company.cnae_principal}
                  className="text-xs h-7 px-3 gap-1"
                  type="button"
                >
                  {generatingKw ? 'Gerando...' : 'Sugerir com IA'}
                </Button>
              </div>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newPalavra}
                  onChange={(e) => setNewPalavra(e.target.value)}
                  placeholder="Ex: software, consultoria"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag('palavras_chave', newPalavra)
                      setNewPalavra('')
                    }
                  }}
                />
                <Button variant="outline" onClick={() => { addTag('palavras_chave', newPalavra); setNewPalavra('') }} type="button">
                  +
                </Button>
              </div>
              {company.palavras_chave.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {company.palavras_chave.map((tag, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeTag('palavras_chave', i)}
                    >
                      {tag} x
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dados para Propostas Comerciais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados para Propostas Comerciais</CardTitle>
            <p className="text-sm text-gray-400">Preencha uma vez — serão usados automaticamente em todas as propostas geradas.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Endereço completo</Label>
                <Input
                  value={company.endereco}
                  onChange={(e) => setCompany({ ...company, endereco: e.target.value })}
                  placeholder="Rua, número, bairro, cidade - UF"
                />
              </div>
              <div>
                <Label>CEP</Label>
                <Input
                  value={company.cep}
                  onChange={(e) => setCompany({ ...company, cep: e.target.value })}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={company.telefone}
                  onChange={(e) => setCompany({ ...company, telefone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div>
                <Label>E-mail da empresa</Label>
                <Input
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  placeholder="contato@empresa.com.br"
                  type="email"
                />
              </div>
            </div>

            <div className="border-t border-[#2d2f33] pt-4 mt-4">
              <p className="text-sm font-medium text-white mb-3">Dados Bancários</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Banco</Label>
                  <Input
                    value={company.banco}
                    onChange={(e) => setCompany({ ...company, banco: e.target.value })}
                    placeholder="Ex: Banco do Brasil"
                  />
                </div>
                <div>
                  <Label>Agência</Label>
                  <Input
                    value={company.agencia}
                    onChange={(e) => setCompany({ ...company, agencia: e.target.value })}
                    placeholder="0000-0"
                  />
                </div>
                <div>
                  <Label>Conta Corrente</Label>
                  <Input
                    value={company.conta}
                    onChange={(e) => setCompany({ ...company, conta: e.target.value })}
                    placeholder="00000-0"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[#2d2f33] pt-4 mt-4">
              <p className="text-sm font-medium text-white mb-3">Representante Legal</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Nome completo</Label>
                  <Input
                    value={company.representante_nome}
                    onChange={(e) => setCompany({ ...company, representante_nome: e.target.value })}
                    placeholder="Nome do representante"
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    value={company.representante_cpf}
                    onChange={(e) => setCompany({ ...company, representante_cpf: e.target.value })}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input
                    value={company.representante_cargo}
                    onChange={(e) => setCompany({ ...company, representante_cargo: e.target.value })}
                    placeholder="Ex: Diretor"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
          {saving ? 'Salvando...' : company.id ? 'Atualizar Empresa' : 'Cadastrar Empresa'}
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
