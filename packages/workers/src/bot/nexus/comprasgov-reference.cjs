// src/drivers/comprasgov_bidder.js

const COMPRASGOV_RUNTIME = String.raw`
if (typeof window.nxState === 'undefined') {
  window.nxState = function() {
    window.__nexusComprasGov = window.__nexusComprasGov || { accessToken: null, refreshToken: null, version: '6.0.1' };
    return window.__nexusComprasGov;
  };

  window.nxLooksLikeJwt = function(v) { return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(String(v || '').trim()); };

  window.nxDecodeJwtPayload = function(token) {
    try {
      var payload = String(token).split('.')[1];
      if (!payload) return null;
      payload = payload.replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      var raw = atob(payload);
      try {
        var escaped = '';
        for (var i = 0; i < raw.length; i++) escaped += '%' + ('00' + raw.charCodeAt(i).toString(16)).slice(-2);
        return JSON.parse(decodeURIComponent(escaped));
      } catch (_) { return JSON.parse(raw); }
    } catch (_) { return null; }
  };

  window.nxTokenExp = function(token) {
    var p = window.nxDecodeJwtPayload(token);
    return p && typeof p.exp === 'number' ? p.exp : 0;
  };

  window.nxIsValidToken = function(token, minBufferSec) {
    if (!window.nxLooksLikeJwt(token)) return false;
    var exp = window.nxTokenExp(token);
    var now = Math.floor(Date.now() / 1000);
    return exp > (now + (minBufferSec || 0));
  };

  window.nxCollectJwtStrings = function(value, out, depth) {
    if (depth > 4 || value === null || value === undefined) return;
    if (typeof value === 'string') { if (window.nxLooksLikeJwt(value)) out.push(value); return; }
    if (Array.isArray(value)) { for (var i = 0; i < value.length && i < 50; i++) window.nxCollectJwtStrings(value[i], out, depth + 1); return; }
    if (typeof value === 'object') { var keys = Object.keys(value); for (var j = 0; j < keys.length && j < 80; j++) window.nxCollectJwtStrings(value[keys[j]], out, depth + 1); }
  };

  window.nxFindBestTokens = function() {
    var candidates = [];
    var state = window.nxState();
    if (state.accessToken) candidates.push(state.accessToken);
    if (state.refreshToken) candidates.push(state.refreshToken);

    var storages = [];
    try { storages.push(window.localStorage); } catch (_) {}
    try { storages.push(window.sessionStorage); } catch (_) {}

    for (var s = 0; s < storages.length; s++) {
      var storage = storages[s];
      try {
        for (var i = 0; i < storage.length; i++) {
          var key = storage.key(i);
          var raw = storage.getItem(key);
          if (!raw) continue;
          if (window.nxLooksLikeJwt(raw)) { candidates.push(raw); continue; }
          try { window.nxCollectJwtStrings(JSON.parse(raw), candidates, 0); } catch (_) {}
        }
      } catch (_) {}
    }

    var access = [], refresh = [];
    for (var c = 0; c < candidates.length; c++) {
      var token = candidates[c];
      var payload = window.nxDecodeJwtPayload(token);
      if (!payload || typeof payload !== 'object') continue;
      var entry = { token: token, exp: payload.exp || 0, payload: payload };
      if (payload.id_sessao !== undefined && payload.identificacao_fornecedor === undefined) refresh.push(entry);
      else access.push(entry);
    }

    access.sort((a, b) => (b.exp || 0) - (a.exp || 0));
    refresh.sort((a, b) => (b.exp || 0) - (a.exp || 0));

    return { accessToken: access.length ? access[0].token : null, refreshToken: refresh.length ? refresh[0].token : null };
  };

  window.nxSaveLiveToken = function(token) {
    try { window.sessionStorage.setItem('nx_live_access_token', token); } catch(e){}
  };

  // 🛡️ CORREÇÃO: Busca mais ampla por IDs de 10 a 25 dígitos para evitar falhas caso o governo mude a URL
  window.nxGetCompraId = function() {
    var href = window.location.href;
    var url = new URL(href);
    var param = url.searchParams.get('compra');
    if (param) return param;
    var match = href.match(/compra=(\d+)/) || href.match(/\/(\d{10,25})\b/);
    if (match) return match[1];
    try {
        var sessionStr = sessionStorage.getItem('compra');
        if (sessionStr) { var sMatch = sessionStr.match(/(\d{10,25})/); if (sMatch) return sMatch[1]; }
    } catch(e){}
    var matchAny = href.match(/(\d{10,25})/);
    if (matchAny) return matchAny[1];
    return null;
  };

  window.nxNumber = function(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    var s = String(v).trim();
    if (!s) return null;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    s = s.replace(/[^0-9\.\-]/g, '');
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  window.nxPad2 = function(v) { return String(v).replace(/\D/g, '').padStart(2, '0'); };
  window.nxUpper = function(v) { return String(v || '').trim().toUpperCase(); };

  window.nxHeaders = function(token, extra) {
    var state = window.nxState();
    return Object.assign({
      accept: 'application/json, text/plain, */*',
      authorization: 'Bearer ' + token,
      'x-device-platform': 'web',
      'x-version-number': state.version || '6.0.1'
    }, extra || {});
  };

  window.nxFetchJSON = async function(url, opts) {
    var finalOpts = Object.assign({ credentials: 'include' }, opts || {});
    var timeout = finalOpts.timeout || 8000;
    delete finalOpts.timeout;

    var ctrl = new AbortController();
    var timer = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, timeout);

    try {
      finalOpts.signal = ctrl.signal;
      var res = await fetch(url, finalOpts);
      var text = await res.text();
      var data = null;
      try { data = JSON.parse(text); } catch (_) {}
      clearTimeout(timer);
      return { ok: res.ok, status: res.status, data: data, text: text };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, status: 0, error: e.message };
    }
  };

  window.nxRetoken = async function() {
    var state = window.nxState();
    var found = window.nxFindBestTokens();
    if (found.refreshToken) state.refreshToken = found.refreshToken;
    if (!window.nxIsValidToken(state.refreshToken, 5)) return { ok: false, error: 'NO_REFRESH' };

    var resp = await window.nxFetchJSON(window.location.origin + '/comprasnet-usuario/v2/sessao/fornecedor/retoken', {
      method: 'PUT',
      headers: window.nxHeaders(state.refreshToken)
    });

    if (resp.ok && resp.data && resp.data.accessToken) {
      state.accessToken = resp.data.accessToken;
      window.nxSaveLiveToken(state.accessToken); 
      if (resp.data.refreshToken) state.refreshToken = resp.data.refreshToken;
      return { ok: true, data: resp.data };
    }
    return { ok: false };
  };

  window.nxEnsureAccessToken = async function() {
    var state = window.nxState();
    if (window.nxIsValidToken(state.accessToken, 30)) { window.nxSaveLiveToken(state.accessToken); return state.accessToken; }
    
    var found = window.nxFindBestTokens();
    if (found.accessToken) state.accessToken = found.accessToken;
    if (window.nxIsValidToken(state.accessToken, 30)) { window.nxSaveLiveToken(state.accessToken); return state.accessToken; }

    var rt = await window.nxRetoken();
    if (rt.ok && window.nxIsValidToken(state.accessToken, 30)) return state.accessToken;
    
    if (found.accessToken) { window.nxSaveLiveToken(found.accessToken); return found.accessToken; }
    throw new Error('ACCESS_TOKEN_NAO_ENCONTRADO');
  };

  window.nxAuthorizedJSON = async function(url, opts) {
    var token = await window.nxEnsureAccessToken();
    var merged = Object.assign({}, opts || {});
    merged.headers = window.nxHeaders(token, merged.headers || {});

    var resp = await window.nxFetchJSON(url, merged);
    if (resp.status === 401 || resp.status === 403) {
      var rt = await window.nxRetoken();
      if (rt.ok) {
        merged.headers = window.nxHeaders(window.nxState().accessToken, opts?.headers || {});
        resp = await window.nxFetchJSON(url, merged);
      }
    }
    return resp;
  };

  window.nxLotLabel = function(raw) { return 'ITEM ' + window.nxPad2(raw.numero); };

  window.nxDiscoverModoDisputa = async function(compraId, apiHost) {
      try {
          var urlPart = apiHost + '/comprasnet-disputa/v1/compras/' + compraId + '/participacao';
          var resPart = await window.nxAuthorizedJSON(urlPart);
          if (resPart.ok && resPart.data) {
              var md = resPart.data.modoDisputa;
              if (!md && Array.isArray(resPart.data) && resPart.data.length > 0) md = resPart.data[0].modoDisputa;
              if (md) {
                  var mdUp = String(md).toUpperCase();
                  if (mdUp === 'AF') return 'ABERTO E FECHADO';
                  if (mdUp === 'FA') return 'FECHADO E ABERTO';
                  if (mdUp === 'A') return 'ABERTO';
                  if (mdUp === 'F') return 'FECHADO';
                  return mdUp;
              }
          }
      } catch(e) {}

      try {
          var text = document.body.innerText || '';
          var match = text.match(/Modo disputa:\s*(Aberto\/Fechado|Aberto e Fechado|Fechado e Aberto|Fechado\/Aberto|Aberto|Fechado)/i);
          if (match) return match[1].toUpperCase().replace('/', ' E ');
      } catch(e) {}
      
      return 'ABERTO E FECHADO'; 
  };

  window.clickTab = function(textStr) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var node;
      while ((node = walker.nextNode())) {
          if (node.nodeValue && node.nodeValue.toLowerCase().indexOf(textStr.toLowerCase()) !== -1) {
              var el = node.parentElement;
              if (el) { el.click(); return true; }
          }
      }
      return false;
  };

  window.forceClickHumanized = async function(el) {
      if (!el) return false;
      let sleep = ms => new Promise(r => setTimeout(r, ms));
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(50);
      try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); } catch(e){}
      await sleep(Math.floor(Math.random() * (60 - 20 + 1)) + 20);
      try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); } catch(e){}
      el.click();
      return true;
  };

  window.nxNormalizeShootableItem = function(raw, groupCtx, existing, modoDisputa) {
    var endStr = raw && (raw.dataHoraFimContagem || raw.dataHoraFimEtapaFechada || raw.dataHoraPrevistaEncerramento || raw.dataPrevistaFechamento);
    var endMs = endStr ? new Date(endStr).getTime() : null;
    var nowMs = Date.now();
    var tempo = endMs ? Math.max(0, Math.floor((endMs - nowMs) / 1000)) : 0;

    var melhorValor = window.nxNumber(raw && raw.melhorValorGeral && (raw.melhorValorGeral.valorCalculado !== undefined ? raw.melhorValorGeral.valorCalculado : raw.melhorValorGeral.valorInformado));
    var seuValor = window.nxNumber(raw && raw.melhorValorFornecedor && (raw.melhorValorFornecedor.valorCalculado !== undefined ? raw.melhorValorFornecedor.valorCalculado : raw.melhorValorFornecedor.valorInformado));
    
    var variacaoCrua = window.nxNumber(raw && raw.variacaoMinimaEntreLances);
    var tipoVariacao = raw && String(raw.tipoVariacaoMinimaEntreLances || '').toUpperCase();
    var intervaloMinimoAbsoluto = variacaoCrua;

    if (variacaoCrua !== null && variacaoCrua > 0 && tipoVariacao === 'P' && melhorValor !== null && melhorValor > 0) {
        intervaloMinimoAbsoluto = Math.ceil(((variacaoCrua / 100) * melhorValor) * 100) / 100;
    }

    var rawFase = window.nxUpper(raw && raw.fase);
    var detalhe = window.nxUpper(raw && raw.detalheSituacaoDisputaItem);
    var rawStatus = detalhe || rawFase || 'DESCONHECIDO';
    var mappedFase = 'aberta';
    var isAbertoPuro = (modoDisputa === 'ABERTO');

    if (rawFase === 'LA') {
        if (!detalhe) rawStatus = 'RECEBENDO LANCES';
        mappedFase = 'aberta';
    } else if (rawFase === 'AL') {
        if (!detalhe) rawStatus = 'RANDÔMICO';
        mappedFase = 'randomica';
        tempo = 999;
    } else if (rawFase === 'FE' || rawFase === 'LF') {
        if (isAbertoPuro) {
            if (!detalhe) rawStatus = 'ENCERRADO';
            mappedFase = 'encerrada';
            tempo = 0;
        } else {
            if (!detalhe) rawStatus = 'LANCE FINAL (FECHADA)';
            mappedFase = 'fechada';
        }
    } else if (rawFase === 'E') {
        if (!detalhe) rawStatus = 'ENCERRADO';
        mappedFase = 'encerrada';
        tempo = 0;
    } else if (rawFase === 'F') {
        if (!detalhe) rawStatus = 'AGUARDANDO DISPUTA';
        mappedFase = 'aguardando';
        tempo = 0;
    } else if (rawFase === 'S') {
        if (!detalhe) rawStatus = 'SUSPENSO';
        mappedFase = 'aguardando';
        tempo = 0;
    }

    var bloqueio = existing && existing.bloqueioTemporario ? existing.bloqueioTemporario : 0;
    if (bloqueio > nowMs) {
        rawStatus = 'AGUARDANDO COOLDOWN';
        mappedFase = 'bloqueado';
    }

    return {
      lote: window.nxLotLabel(raw),
      idServidor: raw.numero,
      status: rawStatus,
      isAberto: !!(raw && raw.podeEnviarLances) && !((raw && raw.desclassificado) === true),
      tempoSegundos: tempo,
      absoluteEndTime: endMs,
      fase: mappedFase,          
      faseOriginal: rawFase,     
      melhorValor: melhorValor,
      seuValor: seuValor,
      posicaoAtual: melhorValor !== null && seuValor !== null && Number(seuValor) <= Number(melhorValor) ? 1 : 99,
      intervaloMinimo: intervaloMinimoAbsoluto,
      methodDispute: null,
      grupoNumero: groupCtx ? groupCtx.numero : null,
      grupoIdentificador: groupCtx ? groupCtx.identificador : null,
      criterioValor: (raw && raw.criterioValor) || (groupCtx && groupCtx.criterioValor) || null,
      disputaPorValorUnitario: !!(raw && raw.disputaPorValorUnitario),
      podeEnviarLances: !!(raw && raw.podeEnviarLances),
      versaoItem: raw && raw.versaoItem !== undefined ? raw.versaoItem : null,
      versaoParticipante: raw && raw.versaoParticipante !== undefined ? raw.versaoParticipante : null,
      bloqueioTemporario: bloqueio,
      missCount: 0,
      lastMarketChange: existing ? existing.lastMarketChange : nowMs,
      lastMyBidTime: existing ? existing.lastMyBidTime : 0
    };
  };

  window.nxScrapeAguardandoDOM = async function() {
      let allItemsMap = new Map();
      let sleep = ms => new Promise(r => setTimeout(r, ms));

      async function forcarAberturaGavetas() {
          let botoes = document.querySelectorAll('button[data-test="btn-expandir"]');
          let abriuAlgo = false;
          for (let i = 0; i < botoes.length; i++) {
              if (botoes[i].getAttribute('aria-expanded') !== 'true') { botoes[i].click(); abriuAlgo = true; }
          }
          if(abriuAlgo) await sleep(800); 
      }

      function extrairPelaRegexComprovada() {
          let texto = document.body.innerText || "";
          let linhas = texto.split('\n');
          for(let i=0; i < linhas.length; i++){
              let l = linhas[i].trim();
              let isItem = /^0*(\d+)\s*[-–]?\s*[A-ZÁÉÍÓÚ]/i.test(l) || /^Item\s+0*(\d+)/i.test(l);
              if (isItem) {
                  let match = l.match(/^0*(\d+)/);
                  if (match) {
                      let num = parseInt(match[1], 10);
                      if (num > 0 && num < 10000) allItemsMap.set(num, { numero: num, fase: 'F', podeEnviarLances: false });
                  }
              }
          }
      }

      for(let p = 1; p <= 50; p++) {
          await forcarAberturaGavetas(); 
          extrairPelaRegexComprovada();

          let btnProximo = document.querySelector('.p-paginator-next, button[aria-label*="Next"], button[aria-label*="Próxima"]');
          if (!btnProximo || btnProximo.disabled || btnProximo.classList.contains('p-disabled') || btnProximo.getAttribute('aria-disabled') === 'true') break; 

          let textoAntes = document.body.innerText;
          await window.forceClickHumanized(btnProximo);

          let tempoEspera = 0;
          let mudou = false;
          while (tempoEspera < 8000) {
              await sleep(200);
              tempoEspera += 200;
              if (document.body.innerText !== textoAntes) { await sleep(500); mudou = true; break; }
          }
          if (!mudou) break;
      }
      return Array.from(allItemsMap.values());
  };

  window.nxScanRoom = async function(opts) {
    var options = opts || { deepScan: false };
    
    try {
      window.nxEnsureAccessToken().catch(e=>console.log(e));

      var compraId = window.nxGetCompraId();
      if (!compraId) throw new Error('ID do pregão não localizado. Você deve estar com a aba "Sala de Disputa" aberta.');

      var apiHost = window.location.hostname.includes('serpro.gov.br') ? window.location.origin : 'https://cnetmobile.estaleiro.serpro.gov.br';
      var globalModoDisputa = await window.nxDiscoverModoDisputa(compraId, apiHost);
      
      var allItemsMap = new Map();

      if (options.deepScan) {
          var clickedAg = window.clickTab('Aguardando disputa');
          if (clickedAg) {
              await new Promise(r => setTimeout(r, 2000)); 
              let domItems = await window.nxScrapeAguardandoDOM();
              domItems.forEach(item => { if (item && item.numero) allItemsMap.set(item.numero, item); });
          }
          window.clickTab('Em disputa');
          await new Promise(r => setTimeout(r, 1000)); 
      }

      var urlDisputa = apiHost + '/comprasnet-disputa/v1/compras/' + compraId + '/itens/em-disputa';
      var resDisputa = await window.nxAuthorizedJSON(urlDisputa);
      if (resDisputa.ok && resDisputa.data) {
          var arrDisputa = Array.isArray(resDisputa.data) ? resDisputa.data : (resDisputa.data.itens || []);
          arrDisputa.forEach(item => { if (item && item.numero) allItemsMap.set(item.numero, item); });
      }

      var allRawItems = Array.from(allItemsMap.values());
      var cachePatrulha = window.nexusLotsCache || [];

      if (allRawItems.length === 0 && !options.deepScan) {
          for(var k=0; k < cachePatrulha.length; k++) {
              cachePatrulha[k].missCount = (cachePatrulha[k].missCount || 0) + 1;
              if (cachePatrulha[k].isAberto && cachePatrulha[k].missCount > 6) { 
                  cachePatrulha[k].isAberto = false;
                  cachePatrulha[k].status = 'FORA DE COMBATE / AGUARDANDO';
                  cachePatrulha[k].fase = 'encerrada';
              }
          }
          return { sucesso: true, lots: cachePatrulha, modoDisputa: globalModoDisputa };
      }

      var processedLots = [];
      var promises = [];

      for (var i = 0; i < allRawItems.length; i++) {
        var raw = allRawItems[i];
        var existingLot = cachePatrulha.find(l => String(l.idServidor) === String(raw.numero));

        if (raw.tipo === 'G' || raw.numero < 0) {
          var groupUrl = apiHost + '/comprasnet-disputa/v1/compras/' + compraId + '/itens/em-disputa/' + raw.numero + '/itens-grupo';
          var groupPromise = window.nxAuthorizedJSON(groupUrl)
            .then(function(ctxRaw) {
              return function(groupRes) {
                if (groupRes.ok && Array.isArray(groupRes.data)) {
                  for (var j = 0; j < groupRes.data.length; j++) {
                    var gRaw = groupRes.data[j];
                    var gExisting = cachePatrulha.find(l => String(l.idServidor) === String(gRaw.numero));
                    processedLots.push(window.nxNormalizeShootableItem(gRaw, ctxRaw, gExisting, globalModoDisputa));
                  }
                }
              };
            }(raw)); 
          promises.push(groupPromise);
        } else {
          processedLots.push(window.nxNormalizeShootableItem(raw, null, existingLot, globalModoDisputa));
        }
      }

      if (promises.length > 0) await Promise.all(promises);

      if (options.deepScan) {
          window.nexusLotsCache = processedLots;
      } else {
          var newCache = [];
          for (var k=0; k < cachePatrulha.length; k++) {
              var oldItem = cachePatrulha[k];
              var foundNew = processedLots.find(l => String(l.idServidor) === String(oldItem.idServidor));
              
              if (foundNew) {
                  newCache.push(foundNew);
              } else {
                  oldItem.missCount = (oldItem.missCount || 0) + 1;
                  if (oldItem.missCount > 6) { 
                      if (oldItem.isAberto) {
                          oldItem.isAberto = false;
                          oldItem.status = 'FORA DE COMBATE / AGUARDANDO';
                          oldItem.fase = 'encerrada';
                      }
                  }
                  newCache.push(oldItem);
              }
          }
          
          var entirelyNew = processedLots.filter(l => !cachePatrulha.find(o => String(o.idServidor) === String(l.idServidor)));
          window.nexusLotsCache = newCache.concat(entirelyNew);
          window.nexusLotsCache.sort((a, b) => parseInt(String(a.lote).replace(/\D/g, '')||'0') - parseInt(String(b.lote).replace(/\D/g, '')||'0'));
      }
      
      try {
          var phaseMap = {};
          for(var m=0; m < window.nexusLotsCache.length; m++) {
              var lo = window.nexusLotsCache[m];
              phaseMap[lo.idServidor] = lo.faseOriginal || 'LA';
          }
          window.sessionStorage.setItem('nx_lot_phases', JSON.stringify(phaseMap));
      } catch(e) {}

      return { sucesso: true, lots: window.nexusLotsCache, modoDisputa: globalModoDisputa };

    } catch (e) {
      // 🛡️ A CURA DA TELA DE ERRO (Tratamos o catch de forma educada)
      return { sucesso: false, erro: e.message };
    }
  };
}
`;

module.exports = {
    id: 'comprasgov',
    version: '1.2.6', // 🛡️ Evita crash no IPC se faltar dados
    nome: 'Compras.gov.br (DOM Scanner HFT)',
    minCooldown: 0,
    capabilities: {
        supportsDeepAttach: true,
        supportsAutoFilter: true,
        supportsRandomClosing: true,
        supportsOpenClosedMode: true,
        supportsRankingProbe: false,
        usesApiDirectly: true, 
        usesHtmlScraping: true,
        hasSecondaryCombatPhase: true,
        ignoresClosedPhase: false
    },

    getBackendShootConfig: (lotNumber, bid, idServidor, artifacts) => {
        const urlObj = new URL(artifacts.url);
        let compraId = urlObj.searchParams.get('compra');
        
        if (!compraId) {
            const match = artifacts.url.match(/compra=(\d+)/) || artifacts.url.match(/\/(\d{10,25})\b/);
            if (match) compraId = match[1];
        }
        
        if (!compraId) {
            const sessionCompra = artifacts.storage.session?.find(e => e[0] === 'compra');
            if (sessionCompra) {
                const sMatch = sessionCompra[1].match(/(\d{10,25})/);
                if (sMatch) compraId = sMatch[1];
            }
        }
        
        if (!compraId) throw new Error('ID da compra não encontrado para o disparo nativo.');

        const apiHost = artifacts.url.includes('serpro.gov.br') ? urlObj.origin : 'https://cnetmobile.estaleiro.serpro.gov.br';
        const targetUrl = `${apiHost}/comprasnet-disputa/v1/compras/${compraId}/itens/${idServidor}/lances`;

        let bestToken = null;
        const liveTokenObj = artifacts.storage.session?.find(e => e[0] === 'nx_live_access_token');
        
        if (liveTokenObj && liveTokenObj[1]) {
            bestToken = liveTokenObj[1];
        } else {
            let candidates = [];
            const storages = [...(artifacts.storage.local || []), ...(artifacts.storage.session || [])];
            
            function extractJwts(value, depth = 0) {
                if (depth > 4 || !value) return;
                if (typeof value === 'string') {
                    if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value)) candidates.push(value);
                    else { try { extractJwts(JSON.parse(value), depth + 1); } catch(e) {} }
                } else if (Array.isArray(value)) {
                    for(let i=0; i<value.length && i<50; i++) extractJwts(value[i], depth + 1);
                } else if (typeof value === 'object') {
                    const keys = Object.keys(value);
                    for(let i=0; i<keys.length && i<50; i++) extractJwts(value[keys[i]], depth + 1);
                }
            }
            
            storages.forEach(entry => extractJwts(entry[1]));
            let maxExp = 0;
            
            candidates.forEach(token => {
                try {
                    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
                    const payload = JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
                    
                    if (payload && typeof payload.exp === 'number') {
                        if (payload.id_sessao === undefined || payload.identificacao_fornecedor !== undefined) {
                            if (payload.exp > maxExp) { maxExp = payload.exp; bestToken = token; }
                        }
                    }
                } catch(e) {}
            });
        }

        if (!bestToken) throw new Error('Token JWT de autenticação não encontrado.');

        let apiFaseItem = "LA";
        try {
            const phaseArtifact = artifacts.storage.session?.find(e => e[0] === 'nx_lot_phases');
            if (phaseArtifact && phaseArtifact[1]) {
                const phaseMap = JSON.parse(phaseArtifact[1]);
                if (phaseMap[idServidor]) apiFaseItem = phaseMap[idServidor];
            }
        } catch (e) {}

        if (apiFaseItem === 'FE') apiFaseItem = 'LF';

        const payload = {
            valorInformado: Math.floor(bid * 10000) / 10000,
            faseItem: apiFaseItem 
        };

        return {
            url: targetUrl,
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Authorization': `Bearer ${bestToken}`,
                'Content-Type': 'application/json',
                'User-Agent': artifacts.userAgent,
                'x-device-platform': 'web',
                'x-version-number': '6.0.1' 
            },
            body: JSON.stringify(payload)
        };
    },

    parseBackendShootResponse: (status, responseText) => {
        let data = {};
        try { data = JSON.parse(responseText); } catch(e) {}

        if (status === 200 || status === 201) return { sucesso: true, msg: 'LANCE ACEITO!' };
        if (status === 429) return { sucesso: false, erro: 'HTTP 429 (Too Many Requests). O servidor do Governo pediu pausa.', cooldownMs: 4000 };

        const erroMsg = data.message || data.error || `HTTP ${status}`;
        return { sucesso: false, erro: erroMsg, cooldownMs: 2000 }; 
    },

    // 🛡️ CORREÇÃO IPC: try-catch em volta das varreduras para impedir o crash "Script failed to execute"
    getDeepRoomScanScript: () => COMPRASGOV_RUNTIME + `
        (async function() {
            try { 
                return await window.nxScanRoom({ deepScan: true }); 
            } catch(e) { 
                return { sucesso: false, erro: e.message }; 
            } 
        })();
    `,

    getRoomScanScript: () => COMPRASGOV_RUNTIME + `
        (async function() {
            try {
                var cache = window.nexusLotsCache || [];
                var needsDeepScan = cache.length === 0;
                return await window.nxScanRoom({ deepScan: needsDeepScan });
            } catch(e) {
                return { sucesso: false, erro: e.message };
            }
        })();
    `,

    getAutoFilterScript: () => `(async function() { return { sucesso: true }; })();`,

    getShootScript: (loteStr, valorLance, idServidorOverride = null) => COMPRASGOV_RUNTIME + `
        (async function() {
            try {
                var cache = window.nexusLotsCache || [];
                var idServ = "${idServidorOverride}" || "${loteStr}";
                
                var lotData = cache.find(l => String(l.idServidor) === String(idServ));
                if (!lotData && cache.length > 0) {
                     var lotStrPad = "ITEM " + String("${loteStr}").replace(/\\D/g, '').padStart(2, '0');
                     lotData = cache.find(l => l.lote.includes(lotStrPad));
                     if(lotData) idServ = lotData.idServidor;
                }

                if (!idServ) return { sucesso: false, erro: 'ID do item não mapeado no Radar.' };

                var compraId = window.nxGetCompraId();
                if (!compraId) return { sucesso: false, erro: 'ID da compra não encontrado.' };

                var valorNum = parseFloat("${valorLance}");
                var valorFloat = Math.floor(valorNum * 10000) / 10000;
                
                var apiHost = window.location.hostname.includes('serpro.gov.br') ? window.location.origin : 'https://cnetmobile.estaleiro.serpro.gov.br';
                var apiUrl = apiHost + '/comprasnet-disputa/v1/compras/' + compraId + '/itens/' + idServ + '/lances';
                
                var payloadFase = (lotData && lotData.faseOriginal) ? lotData.faseOriginal : (lotData ? lotData.fase : "LA");
                if (payloadFase === 'FE') payloadFase = 'LF';

                var payload = {
                    valorInformado: valorFloat,
                    faseItem: payloadFase 
                };

                var res = await window.nxAuthorizedJSON(apiUrl, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    if (lotData) {
                        lotData.seuValor = valorFloat;
                        if(lotData.melhorValor === null || valorFloat < lotData.melhorValor) lotData.melhorValor = valorFloat;
                        lotData.posicaoAtual = 1;
                    }
                    return { sucesso: true, msg: 'LANCE ACEITO (R$ ' + valorFloat + ')' };
                } else {
                    if (res.status === 429) {
                        if (lotData) lotData.bloqueioTemporario = Date.now() + 4000; 
                        return { sucesso: false, erro: 'HTTP 429 (Too Many Requests). O servidor pediu pausa. Recuando 4s...' };
                    }
                    return { sucesso: false, erro: res.error || 'HTTP ' + res.status };
                }
            } catch (e) {
                return { sucesso: false, erro: 'FALHA NO DISPARO: ' + e.message };
            }
        })();
    `
};