// src/main/strategies.js
const MONEY_EPSILON = 0.000001;

function parseMoney(value) {
    if (value === null || value === undefined || value === '' || value === '---') {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    let normalized = String(value).trim().replace(/[^\d,.-]/g, '');
    if (!normalized) return null;

    if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',') && !normalized.includes('.')) {
        normalized = normalized.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function pickFirstNumber(...values) {
    for (const value of values) {
        const parsed = toFiniteNumber(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

function roundMoney(value, decimals = 4) {
    if (value === null || value === undefined) return null;
    // 🛡️ MÁGICA HFT: Arredondamento Tático DINÂMICO (Para baixo).
    // O factor ajusta-se para 2 casas (100) ou 4 casas (10000) consoante o portal.
    const factor = Math.pow(10, decimals);
    return Math.floor((value + Number.EPSILON) * factor) / factor;
}

function deny(reason) {
    return {
        allowed: false,
        bid: null,
        reason
    };
}

function allow(bid, reason) {
    return {
        allowed: true,
        bid,
        reason
    };
}

function evaluateBid(mercado, meu, chao, config, botConfig, faseAtual = 'aberta', intervaloMinimoEdital = null) {
    mercado = parseMoney(mercado);
    meu = parseMoney(meu);
    chao = parseMoney(chao);
    const puloObrigatorio = parseMoney(intervaloMinimoEdital);

    if (mercado === null) return deny('sem_referencia_mercado');
    if (chao === null || chao <= 0) return deny('chao_invalido_ou_zero');

    // 🎯 Extrai as casas decimais (prioriza a config do lote, depois a global, fallback para 4)
    const decimals = config.casasDecimais ?? botConfig.casasDecimais ?? 4;

    // 🔴 DOUTRINA FASE FECHADA (TIRO CEGO ÚNICO)
    if (faseAtual === 'fechada') {
        // 🛡️ TRAVA DO SNIPER: Se o nosso último lance (meu) já é menor que o valor congelado do mercado,
        // significa que nosso tiro cego já foi aceito pelo Governo. Abaixa a arma!
        if (meu !== null && mercado !== null && meu < mercado - MONEY_EPSILON) {
            return deny('tiro_cego_ja_efetuado_alvo_abatido');
        }

        const lanceFechadoCofre = parseMoney(config.lanceFechado); 
        
        if (lanceFechadoCofre !== null && lanceFechadoCofre >= chao) {
            // Trava extra para o valor configurado no cofre
            if (meu !== null && meu <= lanceFechadoCofre + MONEY_EPSILON) {
                return deny('tiro_cego_cofre_ja_atingido');
            }
            return allow(lanceFechadoCofre, 'tiro_cego_configurado_cofre');
        }
        
        const puloFechadoMin = pickFirstNumber(config.decMin, botConfig.puloMinimo, 0.01) ?? 0.01;
        const puloFechadoMax = pickFirstNumber(config.decMax, botConfig.puloMaximo, puloFechadoMin) ?? puloFechadoMin;
        const randomPulo = puloFechadoMin + Math.random() * (puloFechadoMax - puloFechadoMin);
        
        let tiroCego = roundMoney(mercado - randomPulo, decimals);
        if (tiroCego < chao) tiroCego = chao; 
        
        return allow(tiroCego, 'tiro_cego_calculado_motor');
    }

    // 🟢/🟡 DOUTRINA FASE ABERTA E RANDÔMICA
    if (meu !== null) {
        if (meu <= mercado + MONEY_EPSILON) {
            return deny('nosso_lance_ja_esta_na_frente');
        }
    }

    let decMin = pickFirstNumber(config.decMin, config.puloMinimo, botConfig.puloMinimo, 0.01) ?? 0.01;
    let decMax = pickFirstNumber(config.decMax, config.puloMaximo, botConfig.puloMaximo, decMin) ?? decMin;

    // 🛡️ OVERRIDE TÁTICO: Respeitar regra do Edital (Pulo Obrigatório)
    if (puloObrigatorio !== null && puloObrigatorio > 0) {
        if (decMin < puloObrigatorio) decMin = puloObrigatorio;
        if (decMax < puloObrigatorio) decMax = puloObrigatorio;
    }

    const minStep = Math.max(0.01, Math.min(decMin, decMax));
    const maxStep = Math.max(minStep, decMax);
    const randomStep = minStep + Math.random() * (maxStep - minStep);

    let suggestedBid = mercado - randomStep;

    if (suggestedBid < chao) {
        suggestedBid = chao;
    }

    suggestedBid = roundMoney(suggestedBid, decimals);

    // 🚨 A CURA DO LOTE 649 (Tiro no pé evitado)
    if (suggestedBid >= mercado - MONEY_EPSILON) {
        return deny('chao_nos_forca_a_empatar_ou_piorar');
    }

    if (suggestedBid < chao - MONEY_EPSILON) {
        return deny('abaixo_do_chao');
    }

    if (meu !== null && suggestedBid >= meu - MONEY_EPSILON) {
        return deny('lance_pior_ou_igual_ao_nosso');
    }

    return allow(suggestedBid, 'ataque_calculado');
}

module.exports = {
    evaluateBid
};