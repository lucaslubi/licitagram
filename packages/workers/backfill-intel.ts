import 'dotenv/config';
import { db } from './src/lib/db';
import { fetchContratacaoItens, buildPncpId } from './src/scrapers/pncp-client';
import { fetchTenderResults } from './src/scrapers/pncp-results-client';


async function backfillToday() {
  console.log("--- STARTING BACKFILL FOR TODAY TENDERS ---");
  
  // Look back 30 days for a deep historical backfill
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: tenders, error: fetchError } = await db
    .from('tenders')
    .select('*')
    .gt('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (fetchError) {
    console.error("Error fetching tenders:", fetchError);
    return;
  }

  if (!tenders || tenders.length === 0) {
    console.log("No tenders found to backfill.");
    return;
  }

  console.log(`Found ${tenders.length} tenders to process.`);

  for (const tender of tenders) {
    try {
      const cnpj = tender.orgao_cnpj?.replace(/\D/g, '');
      const ano = tender.ano_compra;
      const seq = tender.sequencial_compra;
      const pncpId = tender.pncp_id;

      if (!cnpj || !ano || !seq) {
        console.warn(`⚠️ Skipping tender ${tender.numero_compra || tender.id}: Missing CNPJ, Ano or Sequencial.`);
        continue;
      }

      // 1. Fetch and Save Items
      const items = await fetchContratacaoItens(cnpj, ano, seq);
      if (items && items.length > 0) {
        const itemRows = items.map((item: any) => ({
          tender_id: tender.id,
          numero_item: item.numeroItem,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade_medida: item.unidadeMedida,
          valor_unitario_estimado: item.valorUnitarioEstimado,
          valor_total_estimado: item.valorTotalEstimado,
          situacao_id: item.situacaoItem,
          situacao_nome: item.situacaoItemNome,
          categoria_nome: item.itemCategoriaNome,
          criterio_julgamento_nome: item.criterioJulgamentoNome
        }));
        const { error: itemErr } = await db.from('tender_items').upsert(itemRows, { onConflict: 'tender_id,numero_item' });
        if (itemErr) console.error(`Failed items for ${tender.numero_compra}:`, itemErr);
        else console.log(`✅ Items saved for tender ${tender.numero_compra}`);
      }

      // 2. Fetch and Save Results (Winners/Prices)
      if (pncpId) {
        const results = await fetchTenderResults(pncpId);
        if (results && results.length > 0) {
            const winners = results.filter(r => r.vencedor);
            if (winners.length > 0) {
                const priceHistoryRows = winners.map(w => ({
                    tender_id: tender.id,
                    tender_item_number: w.item_numero,
                    cnpj_vencedor: w.cnpj,
                    nome_vencedor: w.nome,
                    valor_unitario_vencido: w.valor_proposta,
                    valor_total_vencido: w.valor_final,
                    data_homologacao: w.data_resultado || new Date().toISOString(),
                    marca: w.marca,
                    fabricante: w.fabricante
                }));
                const { error: priceErr } = await db.from('price_history').upsert(priceHistoryRows, { onConflict: 'tender_id,tender_item_number,cnpj_vencedor' });
                if (priceErr) console.error(`Failed prices for ${tender.numero_compra}:`, priceErr);
                else console.log(`💰 Winning prices saved for tender ${tender.numero_compra}`);
            }
        }
      }
    } catch (err) {
      console.error(`Error processing tender ${tender.id}:`, err);
    }
  }

  console.log("--- BACKFILL COMPLETED ---");
  process.exit(0);
}

backfillToday();
