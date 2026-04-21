'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Painel "Conectar conta Compras.gov.br".
 *
 * Fluxo:
 *   1. Cliente faz login no Compras.gov.br normalmente (outra aba)
 *   2. Depois de logado, clica no bookmarklet "Conectar Licitagram"
 *      que extrai o JWT do localStorage/sessionStorage
 *   3. Bookmarklet abre popup do nosso domínio com os tokens via
 *      postMessage ou window.open?token=...
 *   4. Nossa página recebe, valida, e POST /api/bot/connect-token
 *
 * Alternativa manual: colar os JWTs direto (pra quem não quer bookmarklet).
 */

interface Connection {
  portal: string
  cnpj: string | null
  nome: string | null
  expires_in_minutes: number
  connected_at: string
  last_used_at: string | null
  is_expired: boolean
}

export function ConnectGovPanel() {
  const [conns, setConns] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [showPasteForm, setShowPasteForm] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [refreshTokenVal, setRefreshTokenVal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/connect-token')
      const data = await res.json()
      if (res.ok) setConns(data.connections || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const submit = useCallback(async () => {
    setError(null)
    setSuccess(null)
    if (!accessToken.trim()) {
      setError('Cole o accessToken primeiro')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/bot/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: accessToken.trim(),
          refreshToken: refreshTokenVal.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        return
      }
      setSuccess(
        `Conectado como ${data.cnpj ?? 'fornecedor'}${data.nome ? ' (' + data.nome + ')' : ''}. Token válido por ${data.expires_in_minutes} min.`,
      )
      setAccessToken('')
      setRefreshTokenVal('')
      setShowPasteForm(false)
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }, [accessToken, refreshTokenVal, loadStatus])

  // Bookmarklet: quando clicado na barra do navegador do cliente
  // (enquanto ele tá logado no Compras.gov.br), extrai tokens e
  // manda pro nosso endpoint via POST form em nova janela.
  //
  // O cliente ARRASTA esse link pra barra de favoritos dele.
  const bookmarkletCode = `
    (function(){
      function getOrigin(){return "${typeof window !== 'undefined' ? window.location.origin : 'https://licitagram.com'}";}
      function looksJwt(v){return /^[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]+$/.test(String(v||"").trim());}
      function decode(t){try{var p=t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");while(p.length%4)p+="=";return JSON.parse(atob(p));}catch(e){return null;}}
      function scan(v,out,d){if(d>4||!v)return;if(typeof v==="string"){if(looksJwt(v))out.push(v);else{try{scan(JSON.parse(v),out,d+1);}catch(e){}}}else if(Array.isArray(v)){for(var i=0;i<v.length&&i<50;i++)scan(v[i],out,d+1);}else if(typeof v==="object"){var k=Object.keys(v);for(var i=0;i<k.length&&i<80;i++)scan(v[k[i]],out,d+1);}}
      var cands=[];var st=[];try{st.push(localStorage);}catch(e){}try{st.push(sessionStorage);}catch(e){}
      for(var s=0;s<st.length;s++){var stg=st[s];try{for(var i=0;i<stg.length;i++){var v=stg.getItem(stg.key(i));if(v)scan(v,cands,0);}}catch(e){}}
      var acc=null,ref=null,accExp=0,refExp=0;
      cands.forEach(function(t){var p=decode(t);if(!p||typeof p!=="object")return;var exp=p.exp||0;if(p.id_sessao!==undefined&&p.identificacao_fornecedor===undefined){if(exp>refExp){refExp=exp;ref=t;}}else if(p.identificacao_fornecedor!==undefined){if(exp>accExp){accExp=exp;acc=t;}}});
      if(!acc){alert("Nenhum token de acesso encontrado. Faça login no Compras.gov.br e tente de novo.");return;}
      var form=document.createElement("form");form.method="POST";form.action=getOrigin()+"/bot/connect-callback";form.target="_blank";
      var a=document.createElement("input");a.type="hidden";a.name="accessToken";a.value=acc;form.appendChild(a);
      if(ref){var r=document.createElement("input");r.type="hidden";r.name="refreshToken";r.value=ref;form.appendChild(r);}
      document.body.appendChild(form);form.submit();form.remove();
    })();
  `
    .replace(/\n\s+/g, '')
    .trim()

  const bookmarkletHref = `javascript:${encodeURIComponent(bookmarkletCode)}`

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Conectar conta Compras.gov.br</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          O robô precisa do seu login no Compras.gov.br pra dar lances. Conecte uma vez e o token
          é renovado automaticamente enquanto válido.
        </p>
      </div>

      {/* Status atual */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          Carregando…
        </div>
      ) : conns.length === 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-400">Nenhuma conexão ativa</p>
          <p className="mt-1 text-xs text-amber-400/70">
            Use o bookmarklet abaixo ou cole o JWT manualmente pra conectar sua conta.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conns.map((c) => (
            <div
              key={c.portal}
              className={`rounded-xl border p-4 ${
                c.is_expired
                  ? 'border-destructive/30 bg-destructive/5'
                  : c.expires_in_minutes < 30
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-emerald-500/30 bg-emerald-500/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {c.portal === 'comprasgov' ? 'Compras.gov.br' : c.portal}
                  </p>
                  {c.cnpj && (
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      CNPJ {c.cnpj}
                    </p>
                  )}
                  {c.nome && (
                    <p className="text-xs text-muted-foreground">{c.nome}</p>
                  )}
                </div>
                <div className="text-right text-[11px]">
                  {c.is_expired ? (
                    <span className="font-medium text-destructive">Expirado — reconectar</span>
                  ) : (
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {c.expires_in_minutes} min restantes
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bookmarklet */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Opção 1 — Bookmarklet (recomendado)</h3>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            1. <strong className="text-foreground">Arraste o botão abaixo</strong> pra barra de favoritos do seu
            navegador
          </li>
          <li>2. Abra <code className="font-mono text-[11px]">compras.gov.br</code> em outra aba e faça seu login</li>
          <li>3. Com a página do Compras logada, clique no favorito que você acabou de criar</li>
          <li>4. Uma aba nossa abre com os tokens capturados — pronto, conectado.</li>
        </ol>
        <div className="mt-3">
          <a
            href={bookmarkletHref}
            className="inline-block rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
            onClick={(e) => {
              // Previne execução acidental — é pra ser arrastado
              e.preventDefault()
              alert('Arraste este botão para a barra de favoritos do navegador.')
            }}
          >
            📌 Conectar Licitagram (arraste para favoritos)
          </a>
        </div>
      </div>

      {/* Paste manual */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Opção 2 — Colar manualmente</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pra quem não pode usar bookmarklet. Abra o DevTools do Compras.gov.br e copie os
              tokens do localStorage ou sessionStorage.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasteForm((v) => !v)}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-secondary"
          >
            {showPasteForm ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>

        {showPasteForm && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Access Token (obrigatório)
              </label>
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="eyJhbGciOi..."
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] break-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Refresh Token (opcional — dá mais autonomia ao robô)
              </label>
              <textarea
                value={refreshTokenVal}
                onChange={(e) => setRefreshTokenVal(e.target.value)}
                placeholder="eyJhbGciOi..."
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] break-all"
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-400">
                {success}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? 'Conectando…' : 'Conectar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
