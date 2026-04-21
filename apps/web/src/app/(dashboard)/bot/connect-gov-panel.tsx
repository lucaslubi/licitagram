'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Painel "Conectar conta Compras.gov.br" — versão com chave única.
 *
 * Fluxo novo:
 *   1. User clica "Gerar meu atalho"
 *   2. Backend cria uma chave única (UUID) válida por 10min associada à
 *      company+user dele
 *   3. Frontend constrói o bookmarklet COM a chave embutida
 *   4. User arrasta esse bookmarklet específico pra barra de favoritos
 *   5. User abre Compras.gov.br, loga e clica no atalho
 *   6. O atalho POSTa tokens + chave pro /bot/connect-callback
 *   7. Backend valida chave (não precisa de cookie), salva tokens, marca
 *      chave como usada
 *
 * Isso resolve o bug onde o cookie do Licitagram podia não passar quando
 * a aba nova abria.
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
  const [connectKey, setConnectKey] = useState<string | null>(null)
  const [keyExpiresAt, setKeyExpiresAt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
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

  const generateKey = useCallback(async () => {
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/bot/connect-link', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setGenError(data.error || `HTTP ${res.status}`)
        return
      }
      setConnectKey(data.key)
      setKeyExpiresAt(data.expires_at)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setGenerating(false)
    }
  }, [])

  // Contador regressivo de validade da chave
  const [remaining, setRemaining] = useState<number>(0)
  useEffect(() => {
    if (!keyExpiresAt) return
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(keyExpiresAt).getTime() - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) {
        setConnectKey(null)
        setKeyExpiresAt(null)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [keyExpiresAt])

  // Gera o código do bookmarklet com a chave embutida
  const getBookmarkletCode = (key: string): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://licitagram.com'
    return `
(function(){
  var KEY = "${key}";
  var ORIGIN = "${origin}";
  function looksJwt(v){return /^[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]+$/.test(String(v||"").trim());}
  function decode(t){try{var p=t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");while(p.length%4)p+="=";return JSON.parse(atob(p));}catch(e){return null;}}
  function scan(v,out,d){if(d>4||!v)return;if(typeof v==="string"){if(looksJwt(v))out.push(v);else{try{scan(JSON.parse(v),out,d+1);}catch(e){}}}else if(Array.isArray(v)){for(var i=0;i<v.length&&i<50;i++)scan(v[i],out,d+1);}else if(typeof v==="object"){var k=Object.keys(v);for(var i=0;i<k.length&&i<80;i++)scan(v[k[i]],out,d+1);}}
  var cands=[];var st=[];try{st.push(localStorage);}catch(e){}try{st.push(sessionStorage);}catch(e){}
  for(var s=0;s<st.length;s++){var stg=st[s];try{for(var i=0;i<stg.length;i++){var v=stg.getItem(stg.key(i));if(v)scan(v,cands,0);}}catch(e){}}
  var acc=null,ref=null,accExp=0,refExp=0;
  cands.forEach(function(t){var p=decode(t);if(!p||typeof p!=="object")return;var exp=p.exp||0;if(p.id_sessao!==undefined&&p.identificacao_fornecedor===undefined){if(exp>refExp){refExp=exp;ref=t;}}else if(p.identificacao_fornecedor!==undefined){if(exp>accExp){accExp=exp;acc=t;}}});
  if(!acc){alert("Nao encontramos seu login no Compras.gov.br. Verifique se voce esta logado na area do fornecedor e tente de novo.");return;}
  var form=document.createElement("form");form.method="POST";form.action=ORIGIN+"/bot/connect-callback";form.target="_blank";
  var k=document.createElement("input");k.type="hidden";k.name="key";k.value=KEY;form.appendChild(k);
  var a=document.createElement("input");a.type="hidden";a.name="accessToken";a.value=acc;form.appendChild(a);
  if(ref){var r=document.createElement("input");r.type="hidden";r.name="refreshToken";r.value=ref;form.appendChild(r);}
  document.body.appendChild(form);form.submit();form.remove();
})();
    `
      .replace(/\n\s+/g, '')
      .trim()
  }

  const bookmarkletHref = connectKey ? `javascript:${encodeURIComponent(getBookmarkletCode(connectKey))}` : '#'

  const copyBookmarklet = async () => {
    if (!connectKey) return
    try {
      await navigator.clipboard.writeText(bookmarkletHref)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* ignore */
    }
  }

  const mmss = (s: number) => {
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${String(r).padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">Conectar sua conta do Compras.gov.br</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pra dar lances automáticos, o robô precisa do seu login no site do Compras.gov.br.
          Conecte uma vez aqui e pronto.{' '}
          <span className="text-foreground">É seguro</span> — a gente só guarda uma chave
          temporária que te autoriza, igual um cartão de acesso. Seu CPF e senha do gov.br
          nunca são salvos.
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
            Siga o passo a passo abaixo. Leva menos de 2 minutos.
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

      {/* PASSO A PASSO — Fase 1: gerar atalho */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">
            1
          </span>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Gere seu atalho de conexão</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Clique no botão abaixo. Vamos criar um atalho único pra você, válido por 10 minutos.
            </p>

            {!connectKey ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={generateKey}
                  disabled={generating}
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {generating ? 'Gerando…' : '✨ Gerar meu atalho'}
                </button>
                {genError && (
                  <p className="mt-2 text-xs text-destructive">{genError}</p>
                )}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">
                  ✓ Atalho pronto
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  Válido por {mmss(remaining)}
                </span>
                <button
                  type="button"
                  onClick={generateKey}
                  disabled={generating}
                  className="text-[11px] text-muted-foreground underline hover:text-foreground"
                >
                  gerar outro
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PASSO 2: arrastar pra favoritos (só aparece se tem chave) */}
      {connectKey && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">
              2
            </span>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Arraste o botão abaixo pra barra de favoritos</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <strong>Segure o botão com o mouse</strong> e solte em cima da barra de favoritos
                do navegador (aquela faixa fina logo abaixo da barra de endereço).
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Se não estiver vendo a barra de favoritos: Chrome/Edge no Windows{' '}
                <Kbd>Ctrl+Shift+B</Kbd>, Mac <Kbd>⌘+Shift+B</Kbd>.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={bookmarkletHref}
                  draggable
                  onClick={(e) => {
                    e.preventDefault()
                    alert(
                      'Este botão é pra ARRASTAR pra barra de favoritos, não clicar aqui.\n\nSegure com o mouse e solte em cima da barra de favoritos.',
                    )
                  }}
                  className="inline-flex cursor-grab items-center gap-2 rounded-lg border-2 border-orange-500/50 bg-orange-500/10 px-5 py-3 text-base font-semibold text-orange-300 hover:bg-orange-500/20 active:cursor-grabbing"
                  title="Arraste este botão pra barra de favoritos"
                >
                  📌 Conectar Licitagram
                </a>
                <span className="text-[11px] text-muted-foreground">
                  ↑ arraste
                </span>
              </div>

              <details className="mt-3 text-[11px]">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Não consigo arrastar — tem outro jeito?
                </summary>
                <div className="mt-2 space-y-2 rounded border border-border bg-card/40 p-3 text-muted-foreground">
                  <p>Copie o código do atalho e adicione como favorito manual:</p>
                  <button
                    onClick={copyBookmarklet}
                    className="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    {copied ? '✓ Código copiado!' : 'Copiar código do atalho'}
                  </button>
                  <ol className="ml-4 mt-2 list-decimal space-y-0.5">
                    <li>Clique com o botão direito na barra de favoritos</li>
                    <li>Escolha &quot;Adicionar página&quot; (ou &quot;Novo favorito&quot;)</li>
                    <li>
                      Nome: <code className="font-mono">Conectar Licitagram</code>
                    </li>
                    <li>URL: cole o código que você copiou</li>
                    <li>Salvar</li>
                  </ol>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* PASSO 3: entrar no Compras (só aparece se tem chave) */}
      {connectKey && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">
              3
            </span>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Entre no Compras.gov.br</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Abra em{' '}
                <a
                  href="https://www.compras.gov.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  compras.gov.br
                </a>{' '}
                (outra aba) e faça seu login normal com CPF e senha do gov.br.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Vá até a <strong className="text-foreground">área do fornecedor</strong> — aquela tela que mostra seus pregões.
                É ali que o robô encontra os dados dele.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PASSO 4: clicar no atalho (só aparece se tem chave) */}
      {connectKey && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">
              4
            </span>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Com o Compras logado, clique no favorito</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Na barra de favoritos, clique em <strong>📌 Conectar Licitagram</strong>.
                Uma nova aba nossa vai abrir com{' '}
                <span className="text-emerald-400">✅ Conta conectada</span>.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pronto — pode fechar as abas. Seu robô já tem a autorização dele pra dar lances.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Aviso de validade */}
      {connectKey && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-400/80">
          ⏳ Seu atalho expira em <strong>{mmss(remaining)}</strong>. Se demorar demais, clique em{' '}
          <strong>gerar outro</strong> e comece de novo.
        </div>
      )}
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
