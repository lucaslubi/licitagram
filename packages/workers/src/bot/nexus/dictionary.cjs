// src/main/dictionary.js
const log = { info: console.log, warn: console.warn, error: console.error, debug: console.debug };

const NexusDictionary = {
    translate: function(portal, fasePreProcessada, statusPreProcessado, modoDisputa, isBloqueado) {
        const fase = String(fasePreProcessada || '').trim().toLowerCase();
        const status = String(statusPreProcessado || '').trim().toUpperCase();
        
        let result = {
            fase: fase || 'aguardando',
            aba: 'AGUARDANDO', 
            statusTxt: status || 'AGUARDANDO ABERTURA',
            isAberto: false
        };

        // 1. REGRAS GLOBAIS DE SEGURANÇA
        if (isBloqueado) {
            result.statusTxt = 'AGUARDANDO COOLDOWN';
            result.fase = 'bloqueado';
            result.aba = 'EM COMBATE'; 
            result.isAberto = true;
            return result;
        }

        // 🎯 CORREÇÃO CRÍTICA: Se o status for "FORA DE COMBATE", move para a aba correta e desliga o robô
        if (status.includes('FORA DE COMBATE') || status.includes('ENCERRAD') || status.includes('SUSPENSO')) {
            result.fase = 'encerrada';
            result.aba = 'FORA DE DISPUTA';
            result.statusTxt = status.includes('FORA DE COMBATE') ? 'LANCES FINALIZADOS' : status;
            result.isAberto = false;
            return result;
        }

        if (status.includes('NÃO INICIADO')) {
            result.statusTxt = 'AGUARDANDO ABERTURA';
            result.fase = 'aguardando';
            result.aba = 'AGUARDANDO';
            result.isAberto = false;
            return result;
        }

        // 2. ROTEAMENTO POR FASE (Lógica do Driver)
        if (fase === 'encerrada') {
            result.fase = 'encerrada';
            result.aba = 'FORA DE DISPUTA';
            result.statusTxt = 'LANCES FINALIZADOS';
            result.isAberto = false;
        } 
        else if (fase === 'fechada') {
            result.fase = 'fechada';
            result.aba = 'LANCE FINAL';
            result.statusTxt = 'LANCE FINAL (FECHADA)';
            result.isAberto = true;
        } 
        else if (fase === 'randomica') {
            result.fase = 'randomica';
            result.aba = 'EM COMBATE';
            result.statusTxt = 'RANDÔMICO (MORTE SÚBITA)';
            result.isAberto = true;
        } 
        else if (fase === 'prorrogacao' || fase === 'desempate' || fase === 'aberta') {
            result.fase = fase;
            result.aba = 'EM COMBATE';
            result.statusTxt = (status !== 'DESCONHECIDO' && status !== '') ? status : (fase === 'prorrogacao' ? 'PRORROGAÇÃO' : 'RECEBENDO LANCES');
            result.isAberto = true;
        } 

        return result;
    }
};

module.exports = NexusDictionary;