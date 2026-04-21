'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Painel "Conectar conta Compras.gov.br" — versão amigável pra leigo.
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
  const [copied, setCopied] = useState(false)

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
      setError('Cole o primeiro código (accessToken) no campo de cima')
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
        `Pronto! Conectado como ${data.cnpj ?? 'fornecedor'}${data.nome ? ' (' + data.nome + ')' : ''}.`,
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

  // Script que o cliente vai colar como link de favorito
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
      if(!acc){alert("Nao encontramos seu login no Compras.gov.br. Verifique se voce esta logado na pagina.");return;}
      var form=document.createElement("form");form.method="POST";form.action=getOrigin()+"/bot/connect-callback";form.target="_blank";
      var a=document.createElement("input");a.type="hidden";a.name="accessToken";a.value=acc;form.appendChild(a);
      if(ref){var r=document.createElement("input");r.type="hidden";r.name="refreshToken";r.value=ref;form.appendChild(r);}
      document.body.appendChild(form);form.submit();form.remove();
    })();
  `
    .replace(/\n\s+/g, '')
    .trim()

  const bookmarkletHref = `javascript:${encodeURIComponent(bookmarkletCode)}`

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletHref)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">Conectar sua conta do Compras.gov.br</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pra dar lances automáticos, precisamos do seu login no site do Compras.gov.br.
          Conecte uma vez aqui e o robô vai dar lance por você.{' '}
          <span className="text-foreground">É seguro</span> — a gente só guarda uma chave
          temporária que te autoriza, igual um cartão de acesso. Seu CPF e senha nunca são
          salvos.
        </p>
      </div>

      {/* Status atual */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          Carregando…
        </div>
      ) : conns.length === 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="font-medium text-amber-400">Ainda sem conta conectada</p>
          <p className="mt-1 text-xs text-amber-400/80">
            Siga o passo a passo abaixo. Leva 2 minutos.
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
                    {c.is_expired ? '⚠️ Conexão expirou — reconecte' : '✅ Conectado'}
                  </p>
                  {c.nome && <p className="mt-1 text-sm text-foreground">{c.nome}</p>}
                  {c.cnpj && (
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      CNPJ {c.cnpj}
                    </p>
                  )}
                </div>
                {!c.is_expired && (
                  <div className="text-right text-[11px] font-mono tabular-nums text-muted-foreground">
                    Vence em {c.expires_in_minutes} min
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PASSO A PASSO VISUAL */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">
            📌
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Como conectar — jeito mais fácil</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Você vai criar um &quot;atalho mágico&quot; na barra do navegador. Depois é só clicar nele
              quando estiver logado no Compras.gov.br.
            </p>
          </div>
        </div>

        {/* Passo 1 */}
        <div className="mt-5 space-y-4 pl-11">
          <Step number={1} title="Deixe a barra de favoritos aparecendo no navegador">
            <p>
              No Chrome/Edge: aperte <Kbd>Ctrl+Shift+B</Kbd> (Windows) ou{' '}
              <Kbd>⌘+Shift+B</Kbd> (Mac) pra mostrar a barra de favoritos (aquela faixa fina
              logo abaixo da barra de endereço).
            </p>
            <p className="mt-1 text-muted-foreground">
              Se você já vê essa barra, pode pular pro próximo passo.
            </p>
          </Step>

          <Step number={2} title="Arraste o botão laranja abaixo pra essa barra">
            <p>
              Segure o botão com o mouse e solte em cima da barra de favoritos. Ele vira um
              link salvo lá.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={bookmarkletHref}
                draggable
                onClick={(e) => {
                  e.preventDefault()
                  alert(
                    'Este botão é pra você ARRASTAR pra barra de favoritos do seu navegador, não clicar aqui.\n\nSegure com o mouse e solte em cima da barra de favoritos.',
                  )
                }}
                className="inline-flex cursor-grab items-center gap-2 rounded-lg border-2 border-orange-500/50 bg-orange-500/10 px-4 py-2.5 text-sm font-medium text-orange-300 hover:bg-orange-500/20 active:cursor-grabbing"
                title="Arraste este botão pra barra de favoritos"
              >
                📌 Conectar Licitagram
              </a>
              <span className="text-[11px] text-muted-foreground">
                ↑ arraste este botão
              </span>
            </div>

            <details className="mt-3 text-[11px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Não consigo arrastar — tem outro jeito?
              </summary>
              <div className="mt-2 space-y-1.5 rounded border border-border bg-card/40 p-2 text-muted-foreground">
                <p>Sim! Copie o código do atalho e adicione manualmente:</p>
                <ol className="ml-4 list-decimal space-y-1">
                  <li>
                    Clique em &quot;Copiar código do atalho&quot; abaixo
                    <button
                      onClick={copyBookmarklet}
                      className="ml-2 rounded border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-secondary"
                    >
                      {copied ? '✓ Copiado' : 'Copiar código do atalho'}
                    </button>
                  </li>
                  <li>Clique com o botão direito na barra de favoritos → &quot;Adicionar página&quot;</li>
                  <li>
                    Nome: <code className="font-mono">Conectar Licitagram</code>
                  </li>
                  <li>URL: cole o código que você copiou</li>
                  <li>Salvar</li>
                </ol>
              </div>
            </details>
          </Step>

          <Step number={3} title="Abra o Compras.gov.br e faça seu login normal">
            <p>
              Em outra aba, vá em{' '}
              <a
                href="https://www.compras.gov.br/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                compras.gov.br
              </a>{' '}
              e faça login como você já faz todo dia (com CPF e senha do gov.br).
            </p>
            <p className="mt-1 text-muted-foreground">
              Entre na área do fornecedor — aquela tela que mostra seus pregões.
            </p>
          </Step>

          <Step number={4} title="Com a página do Compras aberta e logada, clique no favorito">
            <p>
              Clique no atalho <strong>📌 Conectar Licitagram</strong> que você acabou de
              criar lá em cima na barra.
            </p>
            <p className="mt-1 text-muted-foreground">
              Uma nova aba nossa vai abrir com <span className="text-emerald-400">✅ Conta conectada</span>.
              Pronto — o robô tem o que precisa pra dar lance.
            </p>
          </Step>
        </div>
      </div>

      {/* Avançado — colar manualmente */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Não deu certo com o favorito?
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tem um jeito manual pra quem tem restrição no navegador do trabalho. Requer
              conhecimento técnico.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasteForm((v) => !v)}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
          >
            {showPasteForm ? 'Fechar' : 'Abrir jeito manual'}
          </button>
        </div>

        {showPasteForm && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="rounded-md border border-border bg-background/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Como pegar os códigos:</p>
              <ol className="ml-4 mt-1 list-decimal space-y-0.5">
                <li>No Compras.gov.br logado, aperte <Kbd>F12</Kbd> (abre as ferramentas do desenvolvedor)</li>
                <li>Clique na aba <strong>Application</strong> (ou <strong>Armazenamento</strong>)</li>
                <li>Do lado esquerdo: abra <strong>Local Storage</strong> → clique no endereço do Compras</li>
                <li>
                  Procure chaves que tenham valores grandes começando com <code>eyJ...</code> — esses são os
                  tokens. Copie e cole abaixo.
                </li>
              </ol>
            </div>

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Primeiro código (accessToken) — obrigatório
              </label>
              <textarea
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Cole aqui algo parecido com eyJhbGciOiJSUzI1NiJ9..."
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] break-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Segundo código (refreshToken) — opcional mas recomendado
              </label>
              <textarea
                value={refreshTokenVal}
                onChange={(e) => setRefreshTokenVal(e.target.value)}
                placeholder="Cole aqui se encontrar um segundo token eyJ..."
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-[11px] break-all"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Com esse segundo código, o robô renova a sessão sozinho e não precisa te
                pedir pra conectar de novo toda hora.
              </p>
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
              {submitting ? 'Conectando…' : 'Conectar com esses códigos'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
        {number}
      </span>
      <div className="flex-1 text-sm text-foreground/90">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1 text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] shadow-sm">
      {children}
    </kbd>
  )
}
