import { supabase } from './lib/supabase';
import { scrapeReceita } from './scrapers/certidao-receita';
import { mirrorExternalFileToDrive } from './lib/drive';

async function test() {
  const cnpj = '44172703000172';
  console.log('--- TEST START ---');
  console.log('CNPJ:', cnpj);
  
  const { data: company } = await supabase.from('companies')
    .select('id, name')
    .eq('cnpj', cnpj)
    .maybeSingle();

  if (!company) {
    console.error('Empresa não encontrada no banco de dados!');
    return;
  }
  
  console.log('Testando para empresa:', company.name);
  console.log('Iniciando scrape (Headless Browser)...');
  
  const result = await scrapeReceita(cnpj);
  console.log('Resultado do Scrape:', JSON.stringify(result, null, 2));

  if (result.pdf_url && result.pdf_url.startsWith('http')) {
    console.log('PDF encontrado! Iniciando espelhamento para o Drive...');
    const storagePath = await mirrorExternalFileToDrive(
      result.pdf_url, 
      company.id, 
      'teste_licitagram_drive.pdf'
    );
    console.log('SUCESSO! Arquivo salvo em:', storagePath);
  } else {
    console.log('Nenhum PDF para espelhar ou erro no portal. Detalhes:', result.detalhes);
  }
}

test().catch(err => {
  console.error('--- TEST FAILED ---');
  console.error(err);
});
