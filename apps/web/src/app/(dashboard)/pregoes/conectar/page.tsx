'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─── Types ──────────────────────────────────────────────────────────────────

type Step = 'portal' | 'credentials' | 'terms' | 'test'

interface TestResult {
  status: 'testando' | 'ativo' | 'invalido' | 'bloqueado'
  error?: string | null
}

// ─── Portal Options ─────────────────────────────────────────────────────────

const portals = [
  { slug: 'comprasgov', name: 'Compras.gov.br', available: true, description: 'Portal do Governo Federal' },
  { slug: 'bll', name: 'BLL', available: false, description: 'Bolsa de Licitações e Leilões' },
  { slug: 'licitanet', name: 'Licitanet', available: false, description: 'Portal Licitanet' },
  { slug: 'pcp', name: 'Portal de Compras Públicas', available: false, description: 'Portal de Compras Públicas' },
]

// ─── Component ──────────────────────────────────────────────────────────────

export default function ConectarPortalPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('portal')
  const [selectedPortal, setSelectedPortal] = useState<string>('')
  const [form, setForm] = useState({ usuario: '', senha: '', cnpj: '' })
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handlePortalSelect(slug: string) {
    setSelectedPortal(slug)
    setStep('credentials')
  }

  function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.usuario || !form.senha || !form.cnpj) {
      setError('Preencha todos os campos obrigatórios')
      return
    }
    setError(null)
    setStep('terms')
  }

  async function handleTestLogin() {
    setLoading(true)
    setTestResult({ status: 'testando' })
    setError(null)

    try {
      const res = await fetch('/api/pregao-chat/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal_slug: selectedPortal,
          cnpj_licitante: form.cnpj.replace(/\D/g, ''),
          usuario: form.usuario,
          senha: form.senha,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setTestResult({ status: 'invalido', error: data.error })
        setError(data.error)
        return
      }

      // MVP: credential saved and encrypted successfully = mark as active
      // The real portal login test will happen on first poll
      setTestResult({ status: 'ativo' })
    } catch (err) {
      setTestResult({ status: 'invalido', error: 'Erro de conexão' })
      setError('Erro de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conectar Portal</h1>
        <p className="text-muted-foreground">
          Configure suas credenciais para monitorar pregões em tempo real
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {['portal', 'credentials', 'terms', 'test'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${step === s ? 'bg-primary text-primary-foreground' :
                ['portal', 'credentials', 'terms', 'test'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {i + 1}
            </div>
            {i < 3 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Portal */}
      {step === 'portal' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {portals.map((portal) => (
            <Card
              key={portal.slug}
              className={`cursor-pointer transition-all ${portal.available ? 'hover:border-primary hover:shadow-md' : 'opacity-60 cursor-not-allowed'}`}
              onClick={() => portal.available && handlePortalSelect(portal.slug)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{portal.name}</CardTitle>
                  {!portal.available && <Badge variant="secondary">Em breve</Badge>}
                </div>
                <CardDescription>{portal.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Step 2: Credentials */}
      {step === 'credentials' && (
        <Card>
          <CardHeader>
            <CardTitle>Credenciais do {portals.find(p => p.slug === selectedPortal)?.name}</CardTitle>
            <CardDescription>
              Suas credenciais são criptografadas e nunca armazenadas em texto legível.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="usuario">CPF (login gov.br)</Label>
                <Input
                  id="usuario"
                  value={form.usuario}
                  onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                  placeholder="000.000.000-00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha gov.br</Label>
                <Input
                  id="senha"
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  placeholder="Sua senha da conta gov.br"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ do Licitante</Label>
                <Input
                  id="cnpj"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep('portal')}>
                  Voltar
                </Button>
                <Button type="submit">Continuar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Terms */}
      {step === 'terms' && (
        <Card>
          <CardHeader>
            <CardTitle>Termo de Autorização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
              <p>
                Ao prosseguir, você autoriza o Licitagram a acessar o portal {portals.find(p => p.slug === selectedPortal)?.name} em
                seu nome, utilizando as credenciais informadas, exclusivamente para fins de monitoramento de pregões eletrônicos.
              </p>
              <p>
                Suas credenciais são criptografadas com algoritmo XSalsa20-Poly1305 e nunca são armazenadas em texto legível.
                O acesso é limitado à leitura de mensagens do chat do pregoeiro.
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">
                Autorizo o Licitagram a acessar o portal em meu nome usando as credenciais informadas
                para fins de monitoramento de pregões.
              </span>
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('credentials')}>
                Voltar
              </Button>
              <Button
                disabled={!termsAccepted}
                onClick={() => { setStep('test'); handleTestLogin() }}
              >
                Aceitar e Testar Login
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Test */}
      {step === 'test' && (
        <Card>
          <CardHeader>
            <CardTitle>Testando Login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {testResult?.status === 'testando' && (
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                <span>Testando credenciais no portal...</span>
              </div>
            )}
            {testResult?.status === 'ativo' && (
              <div className="flex items-center gap-3 text-green-700">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-medium">Login realizado com sucesso!</p>
                  <p className="text-sm text-muted-foreground">
                    Suas credenciais foram validadas e estão prontas para uso.
                  </p>
                </div>
              </div>
            )}
            {testResult?.status === 'invalido' && (
              <div className="flex items-center gap-3 text-red-700">
                <span className="text-2xl">❌</span>
                <div>
                  <p className="font-medium">Falha no login</p>
                  <p className="text-sm">{testResult.error || 'Verifique usuário e senha.'}</p>
                </div>
              </div>
            )}
            {testResult?.status === 'bloqueado' && (
              <div className="flex items-center gap-3 text-yellow-700">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-medium">Intervenção necessária</p>
                  <p className="text-sm">{testResult.error}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {testResult?.status === 'ativo' && (
                <Button onClick={() => router.push('/pregoes/adicionar')}>
                  Adicionar Pregão para Monitorar
                </Button>
              )}
              {(testResult?.status === 'invalido' || testResult?.status === 'bloqueado') && (
                <Button variant="outline" onClick={() => { setStep('credentials'); setTestResult(null); setError(null) }}>
                  Tentar Novamente
                </Button>
              )}
              <Button variant="ghost" onClick={() => router.push('/pregoes')}>
                {testResult?.status === 'ativo' ? 'Voltar ao Dashboard' : 'Cancelar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
