/**
 * Comprehensive CNAE Division Database
 *
 * All 87 CNAE divisions (2-digit codes) with:
 * - Portuguese name
 * - Detailed description for AI context
 * - Specific keywords for matching (normalized, no accents)
 *
 * Source: IBGE CNAE 2.3 (Classificação Nacional de Atividades Econômicas)
 */

export interface CNAEDivision {
  nome: string
  descricao: string
  keywords: string[]
}

export const CNAE_DIVISIONS: Record<string, CNAEDivision> = {
  // ── SEÇÃO A: Agricultura, Pecuária, Silvicultura, Pesca ──
  '01': {
    nome: 'Agricultura, Pecuária e Serviços Relacionados',
    descricao: 'Cultivo de lavouras temporárias e permanentes, horticultura, floricultura, produção de sementes, mudas, pecuária bovina, suína, aves, ovinos, caprinos, apicultura, aquicultura, serviços de preparação de terreno, colheita, irrigação',
    keywords: ['agricultura', 'pecuaria', 'plantio', 'colheita', 'lavoura', 'safra', 'semente', 'muda', 'irrigacao', 'bovino', 'suino', 'avicultura', 'gado', 'rebanho', 'hortalica', 'fruta', 'grao', 'cereal', 'soja', 'milho', 'cafe', 'cana', 'algodao', 'fertilizante', 'defensivo', 'agrotoxico', 'agropecuario', 'rural', 'fazenda', 'sitio'],
  },
  '02': {
    nome: 'Produção Florestal',
    descricao: 'Silvicultura, extração de madeira, produção de carvão vegetal, coleta de produtos florestais não-madeireiros, reflorestamento, manejo florestal, eucalipto, pinus',
    keywords: ['florestal', 'silvicultura', 'madeira', 'reflorestamento', 'eucalipto', 'pinus', 'carvao', 'lenha', 'desmatamento', 'manejo', 'floresta', 'arvore', 'serraria', 'tora', 'celulose'],
  },
  '03': {
    nome: 'Pesca e Aquicultura',
    descricao: 'Pesca em água salgada e doce, aquicultura marinha e de água doce, criação de peixes, camarões, moluscos, crustáceos',
    keywords: ['pesca', 'aquicultura', 'peixe', 'camarao', 'marisco', 'crustaceo', 'pescado', 'frigorifico', 'tilapia', 'tambaqui', 'piscicultura', 'tanque', 'viveiro'],
  },

  // ── SEÇÃO B: Indústrias Extrativas ──
  '05': {
    nome: 'Extração de Carvão Mineral',
    descricao: 'Extração de carvão mineral, linhito',
    keywords: ['carvao mineral', 'mineracao', 'extracao', 'mina', 'linhito'],
  },
  '06': {
    nome: 'Extração de Petróleo e Gás Natural',
    descricao: 'Extração de petróleo, gás natural, xisto betuminoso, areias betuminosas, serviços de apoio à extração de petróleo e gás',
    keywords: ['petroleo', 'gas natural', 'extracao', 'perfuracao', 'poco', 'plataforma', 'refinaria', 'combustivel', 'hidrocarboneto', 'oleoduto', 'gasoduto', 'offshore'],
  },
  '07': {
    nome: 'Extração de Minerais Metálicos',
    descricao: 'Extração de minério de ferro, alumínio, estanho, manganês, metais preciosos, minerais metálicos não-ferrosos',
    keywords: ['mineracao', 'minerio', 'ferro', 'aluminio', 'manganes', 'ouro', 'cobre', 'zinco', 'niquel', 'bauxita', 'metalico', 'extracao', 'lavra', 'mina'],
  },
  '08': {
    nome: 'Extração de Minerais Não-Metálicos',
    descricao: 'Extração de pedra, areia, argila, calcário, gesso, amianto, fosfato, potássio, sal marinho, pedras preciosas',
    keywords: ['pedra', 'areia', 'argila', 'calcario', 'gesso', 'granito', 'marmore', 'brita', 'cascalho', 'sal', 'fosfato', 'minerais', 'pedreira', 'jazida'],
  },
  '09': {
    nome: 'Atividades de Apoio à Extração de Minerais',
    descricao: 'Atividades de apoio à extração de petróleo e gás e à extração de minerais',
    keywords: ['apoio mineracao', 'perfuracao', 'sondagem', 'prospecao', 'geologia', 'geofisica'],
  },

  // ── SEÇÃO C: Indústrias de Transformação ──
  '10': {
    nome: 'Fabricação de Produtos Alimentícios',
    descricao: 'Abate e fabricação de produtos de carne, conservas de frutas, óleos e gorduras, laticínios, moagem, fabricação de amidos, rações, produtos de padaria, açúcar, chocolate, massas alimentícias',
    keywords: ['alimento', 'alimenticio', 'comida', 'carne', 'frigorífico', 'laticinio', 'leite', 'queijo', 'pao', 'padaria', 'acucar', 'chocolate', 'conserva', 'oleo', 'gordura', 'farinha', 'cereal', 'racao', 'massa', 'biscoito', 'embutido', 'suco', 'polpa', 'genero alimenticio', 'cesta basica', 'produto alimenticio'],
  },
  '11': {
    nome: 'Fabricação de Bebidas',
    descricao: 'Fabricação de bebidas alcoólicas e não-alcoólicas, cerveja, vinho, destilados, refrigerantes, água mineral, sucos',
    keywords: ['bebida', 'cerveja', 'vinho', 'destilado', 'cachaca', 'refrigerante', 'agua mineral', 'suco', 'alcoolico', 'engarrafamento'],
  },
  '12': {
    nome: 'Fabricação de Produtos do Fumo',
    descricao: 'Processamento industrial do fumo, fabricação de cigarros e cigarrilhas',
    keywords: ['fumo', 'tabaco', 'cigarro', 'cigarrilha'],
  },
  '13': {
    nome: 'Fabricação de Produtos Têxteis',
    descricao: 'Preparação e fiação de fibras têxteis, tecelagem, fabricação de tecidos de malha, acabamentos em fios e tecidos',
    keywords: ['textil', 'tecido', 'fibra', 'fiacao', 'tecelagem', 'malha', 'algodao', 'poliester', 'linha', 'fio', 'trama', 'urdume', 'estamparia'],
  },
  '14': {
    nome: 'Confecção de Artigos do Vestuário e Acessórios',
    descricao: 'Confecção de roupas e acessórios, uniformes, roupas profissionais, camisetas, calças, vestidos',
    keywords: ['vestuario', 'roupa', 'uniforme', 'confeccao', 'camisa', 'calca', 'vestido', 'jaqueta', 'farda', 'epi', 'epis', 'moda', 'costura', 'bordado', 'fardamento', 'camiseta', 'jaleco', 'avental', 'vestimenta', 'equipamento protecao individual', 'luva', 'bota', 'capacete', 'fardamento escolar'],
  },
  '15': {
    nome: 'Preparação de Couros e Fabricação de Artigos de Couro',
    descricao: 'Curtimento e preparação de couro, fabricação de artigos para viagem, bolsas, calçados',
    keywords: ['couro', 'curtume', 'calcado', 'sapato', 'bota', 'tenis', 'bolsa', 'mala', 'artigo viagem'],
  },
  '16': {
    nome: 'Fabricação de Produtos de Madeira',
    descricao: 'Desdobramento de madeira, fabricação de embalagens de madeira, artefatos de tanoaria, madeira laminada, compensada',
    keywords: ['madeira', 'compensado', 'mdf', 'laminado', 'serrado', 'movel', 'embalagem madeira', 'palete', 'carpintaria', 'marcenaria'],
  },
  '17': {
    nome: 'Fabricação de Celulose, Papel e Produtos de Papel',
    descricao: 'Fabricação de celulose, papel e papelão, embalagens de papel e papelão, papel para escritório, papel higiênico',
    keywords: ['papel', 'celulose', 'papelao', 'embalagem', 'caixa', 'papel higienico', 'impressao', 'grafica', 'caderno', 'envelope'],
  },
  '18': {
    nome: 'Impressão e Reprodução de Gravações',
    descricao: 'Atividades de impressão de jornais, livros, material de publicidade, impressão de rótulos e etiquetas, pré-impressão, acabamento gráfico',
    keywords: ['impressao', 'grafica', 'impresso', 'livro', 'jornal', 'banner', 'folder', 'cartaz', 'rotulo', 'etiqueta', 'adesivo', 'offset', 'serigrafia', 'plotagem', 'carne', 'boleto', 'material grafico', 'servico grafico', 'encadernacao', 'publicacao'],
  },
  '19': {
    nome: 'Fabricação de Coque e Derivados de Petróleo',
    descricao: 'Coquerias, fabricação de produtos derivados do petróleo, refino, fabricação de biocombustíveis',
    keywords: ['coque', 'petroleo', 'refino', 'combustivel', 'gasolina', 'diesel', 'querosene', 'asfalto', 'biocombustivel', 'etanol', 'biodiesel'],
  },
  '20': {
    nome: 'Fabricação de Produtos Químicos',
    descricao: 'Fabricação de produtos químicos orgânicos e inorgânicos, resinas, elastômeros, fibras, defensivos, desinfetantes, sabões, detergentes, produtos de limpeza, tintas, vernizes, fertilizantes, adubos',
    keywords: ['quimico', 'produto quimico', 'reagente', 'solvente', 'resina', 'tinta', 'verniz', 'adesivo', 'detergente', 'sabao', 'limpeza', 'desinfetante', 'fertilizante', 'adubo', 'defensivo', 'agrotoxico', 'laboratorio'],
  },
  '21': {
    nome: 'Fabricação de Produtos Farmoquímicos e Farmacêuticos',
    descricao: 'Fabricação de produtos farmoquímicos, medicamentos para uso humano e veterinário, preparações farmacêuticas',
    keywords: ['farmaceutico', 'medicamento', 'remedio', 'farmaco', 'droga', 'vacina', 'insumo farmaceutico', 'laboratorio', 'farmacia', 'capsulas', 'comprimido', 'injetavel', 'farmacia basica', 'farmacia municipal', 'material hospitalar', 'material medico', 'produto farmaceutico'],
  },
  '22': {
    nome: 'Fabricação de Produtos de Borracha e de Material Plástico',
    descricao: 'Fabricação de pneumáticos, câmaras de ar, artefatos de borracha, laminados e embalagens plásticas, tubos e acessórios plásticos',
    keywords: ['borracha', 'plastico', 'pneu', 'pneumatico', 'tubo plastico', 'embalagem plastica', 'sacola', 'filme', 'pet', 'polietileno', 'pvc', 'polipropileno', 'injecao plastica'],
  },
  '23': {
    nome: 'Fabricação de Produtos de Minerais Não-Metálicos',
    descricao: 'Fabricação de vidro, artigos de vidro, cimento, artefatos de concreto, cerâmica, produtos cerâmicos, refratários, pedras e mármores',
    keywords: ['vidro', 'cimento', 'concreto', 'ceramica', 'tijolo', 'telha', 'porcelanato', 'argamassa', 'gesso', 'cal', 'marmore', 'granito', 'piso', 'revestimento', 'bloco', 'laje'],
  },
  '24': {
    nome: 'Metalurgia',
    descricao: 'Produção de ferro-gusa, ferro e aço, siderurgia, metalurgia de metais não-ferrosos, fundição',
    keywords: ['metalurgia', 'aco', 'ferro', 'siderurgia', 'fundicao', 'laminacao', 'aluminio', 'cobre', 'zinco', 'metal', 'liga metalica', 'chapa', 'perfil'],
  },
  '25': {
    nome: 'Fabricação de Produtos de Metal',
    descricao: 'Fabricação de estruturas metálicas, tanques, caldeiras, forjaria, estamparia, metalurgia do pó, usinagem, soldagem, tratamento de metais',
    keywords: ['metal', 'metalico', 'estrutura metalica', 'serralheria', 'caldeiraria', 'usinagem', 'soldagem', 'ferramentaria', 'estamparia', 'parafuso', 'porca', 'chapa', 'tubo metalico', 'grade', 'portao', 'cerca', 'placa', 'sinalizacao viaria', 'placa sinalizacao'],
  },
  '26': {
    nome: 'Fabricação de Equipamentos de Informática, Eletrônicos e Ópticos',
    descricao: 'Fabricação de componentes eletrônicos, computadores, equipamentos de comunicação, equipamentos de medição, instrumentos ópticos, mídias virgens',
    keywords: ['equipamento informatica', 'computador', 'notebook', 'monitor', 'impressora', 'servidor', 'storage', 'switch', 'roteador', 'eletronico', 'componente', 'placa', 'circuito', 'camera', 'optico', 'instrumento', 'medicao', 'scanner', 'equipamento tecnologia', 'tablet', 'desktop', 'microcomputador', 'nobreak', 'estabilizador'],
  },
  '27': {
    nome: 'Fabricação de Máquinas, Aparelhos e Materiais Elétricos',
    descricao: 'Fabricação de geradores, transformadores, motores elétricos, equipamentos para distribuição de energia, baterias, pilhas, lâmpadas, cabos elétricos, fios',
    keywords: ['eletrico', 'gerador', 'transformador', 'motor eletrico', 'bateria', 'pilha', 'lampada', 'luminaria', 'led', 'cabo eletrico', 'fio eletrico', 'disjuntor', 'quadro eletrico', 'tomada', 'interruptor'],
  },
  '28': {
    nome: 'Fabricação de Máquinas e Equipamentos',
    descricao: 'Fabricação de motores, bombas, compressores, equipamentos de transmissão, máquinas-ferramenta, tratores, máquinas agrícolas, máquinas para construção e mineração',
    keywords: ['maquina', 'equipamento', 'motor', 'bomba', 'compressor', 'trator', 'colheitadeira', 'retroescavadeira', 'empilhadeira', 'guincho', 'guindaste', 'ferramenta', 'industrial'],
  },
  '29': {
    nome: 'Fabricação de Veículos Automotores',
    descricao: 'Fabricação de automóveis, caminhões, ônibus, cabines, carrocerias, reboques, semi-reboques, peças e acessórios para veículos',
    keywords: ['veiculo', 'automovel', 'carro', 'caminhao', 'onibus', 'carroceria', 'reboque', 'peca automotiva', 'motor veiculo', 'transmissao', 'freio', 'ambulancia', 'van', 'utilitario', 'automotor', 'veiculo automotor', 'veiculo passeio', 'caminhonete', 'micro-onibus'],
  },
  '30': {
    nome: 'Fabricação de Outros Equipamentos de Transporte',
    descricao: 'Construção de embarcações, veículos ferroviários, aeronaves, veículos militares, motocicletas, bicicletas',
    keywords: ['embarcacao', 'navio', 'barco', 'lancha', 'ferroviario', 'vagao', 'locomotiva', 'aeronave', 'aviao', 'helicoptero', 'motocicleta', 'bicicleta'],
  },
  '31': {
    nome: 'Fabricação de Móveis',
    descricao: 'Fabricação de móveis de madeira, metal, plástico, estofados, colchões, móveis para escritório, cozinha, dormitórios',
    keywords: ['movel', 'mobiliario', 'armario', 'mesa', 'cadeira', 'estante', 'sofa', 'colchao', 'estofado', 'movel escritorio', 'movel planejado', 'divisoria', 'bancada', 'divisoria modular', 'prateleira', 'arquivo aco', 'gaveteiro', 'balcao'],
  },
  '32': {
    nome: 'Fabricação de Produtos Diversos',
    descricao: 'Fabricação de artigos de joalheria e bijuteria, instrumentos musicais, artigos de esporte, brinquedos, equipamentos médico-odontológicos',
    keywords: ['joalheria', 'bijuteria', 'brinquedo', 'esporte', 'artigo esportivo', 'instrumento musical', 'medico hospitalar', 'odontologico', 'protese', 'ortese', 'equipamento hospitalar', 'hospitalar', 'equipamento medico', 'material odontologico'],
  },
  '33': {
    nome: 'Manutenção, Reparação e Instalação de Máquinas e Equipamentos',
    descricao: 'Manutenção e reparação de máquinas e equipamentos industriais, comerciais, instalação de máquinas, manutenção de equipamentos eletrônicos, ópticos',
    keywords: ['manutencao', 'reparacao', 'reparo', 'conserto', 'instalacao', 'maquina', 'equipamento', 'industrial', 'preventiva', 'corretiva', 'calibracao', 'assistencia tecnica'],
  },

  // ── SEÇÃO D: Eletricidade e Gás ──
  '35': {
    nome: 'Eletricidade, Gás e Outras Utilidades',
    descricao: 'Geração, transmissão e distribuição de energia elétrica, produção e distribuição de gás, produção e distribuição de vapor, água quente e ar condicionado',
    keywords: ['energia', 'eletricidade', 'energia eletrica', 'geracao', 'transmissao', 'distribuicao', 'subestacao', 'gas', 'utilidade', 'concessionaria', 'fotovoltaico', 'solar', 'eolica', 'iluminacao publica', 'iluminacao', 'rede eletrica', 'poste', 'luminaria', 'lampada', 'led'],
  },

  // ── SEÇÃO E: Água, Esgoto, Resíduos ──
  '36': {
    nome: 'Captação, Tratamento e Distribuição de Água',
    descricao: 'Captação, tratamento e distribuição de água potável, dessalinização, saneamento',
    keywords: ['agua', 'tratamento agua', 'saneamento', 'distribuicao agua', 'captacao', 'dessalinizacao', 'estacao tratamento', 'eta', 'potavel', 'poco artesiano', 'poco', 'abastecimento agua', 'agua potavel', 'hipoclorito', 'carro pipa', 'cisterna'],
  },
  '37': {
    nome: 'Esgoto e Atividades Relacionadas',
    descricao: 'Gestão de redes de esgoto, coleta e tratamento de esgoto, disposição final',
    keywords: ['esgoto', 'efluente', 'tratamento esgoto', 'ete', 'fossa', 'rede coletora', 'saneamento', 'fossa septica', 'fossa septica', 'ligacao domiciliar esgoto', 'estacao elevatoria'],
  },
  '38': {
    nome: 'Coleta, Tratamento e Disposição de Resíduos',
    descricao: 'Coleta de resíduos não-perigosos e perigosos, tratamento e disposição de resíduos, recuperação de materiais, reciclagem',
    keywords: ['residuo', 'lixo', 'coleta', 'reciclagem', 'aterro', 'residuo solido', 'residuo perigoso', 'descarte', 'compostagem', 'incineracao', 'sucata', 'aterro sanitario', 'coleta lixo', 'coleta residuo', 'lixeira', 'caçamba'],
  },
  '39': {
    nome: 'Descontaminação e Outros Serviços de Gestão de Resíduos',
    descricao: 'Descontaminação e outros serviços de gestão de resíduos, remediação ambiental',
    keywords: ['descontaminacao', 'remediacao', 'ambiental', 'limpeza ambiental', 'solo contaminado'],
  },

  // ── SEÇÃO F: Construção ──
  '41': {
    nome: 'Construção de Edifícios',
    descricao: 'Incorporação de empreendimentos imobiliários, construção de edifícios residenciais e comerciais, reforma, restauração, ampliação de edificações',
    keywords: ['construcao', 'edificio', 'predio', 'obra', 'residencial', 'comercial', 'reforma', 'restauracao', 'ampliacao', 'alvenaria', 'fundacao', 'estrutura', 'incorporacao', 'empreiteira', 'construtora', 'obra civil', 'engenharia civil', 'reforma predial', 'construcao civil', 'modulo habitacional', 'habitacional', 'edificacao'],
  },
  '42': {
    nome: 'Obras de Infraestrutura',
    descricao: 'Construção de rodovias, ferrovias, obras de arte especiais, pontes, viadutos, túneis, redes de transportes, barragens, usinas, redes de telecomunicações, distribuição de água, gás, esgoto',
    keywords: ['infraestrutura', 'rodovia', 'estrada', 'ferrovia', 'ponte', 'viaduto', 'tunel', 'barragem', 'usina', 'pavimentacao', 'asfalto', 'terraplenagem', 'drenagem', 'saneamento', 'rede', 'tubulacao', 'adutora', 'drenagem pluvial', 'drenagem urbana', 'galeria pluvial', 'sinalizacao viaria', 'meio fio', 'sarjeta', 'cbuq', 'obra infraestrutura'],
  },
  '43': {
    nome: 'Serviços Especializados para Construção',
    descricao: 'Demolição, preparação de terreno, instalações elétricas, hidráulicas, ar condicionado, obras de acabamento, pintura, revestimento, impermeabilização',
    keywords: ['demolicao', 'terraplenagem', 'instalacao eletrica', 'instalacao hidraulica', 'ar condicionado', 'climatizacao', 'acabamento', 'pintura', 'revestimento', 'impermeabilizacao', 'gesso', 'forro', 'piso', 'azulejo', 'esquadria', 'vidracaria', 'telhado', 'cobertura', 'reforma predial', 'manutencao predial', 'servico engenharia', 'instalacao', 'eletrica', 'hidraulica', 'pintura predial', 'pintura interna', 'pintura externa', 'divisoria'],
  },

  // ── SEÇÃO G: Comércio ──
  '45': {
    nome: 'Comércio e Reparação de Veículos Automotores e Motocicletas',
    descricao: 'Comércio de veículos automotores, comércio de peças e acessórios, manutenção e reparação de veículos, comércio de motocicletas',
    keywords: ['veiculo', 'automovel', 'carro', 'moto', 'peca', 'acessorio', 'oficina', 'mecanica', 'concessionaria', 'pneu', 'oleo', 'lubrificante', 'funilaria', 'veiculo automotor', 'veiculo passeio', 'caminhonete', 'ambulancia', 'manutencao veiculo', 'reparo veiculo', 'frota', 'peca veiculo'],
  },
  '46': {
    nome: 'Comércio por Atacado',
    descricao: 'Comércio atacadista de matérias-primas, produtos intermediários, máquinas, equipamentos, materiais de construção, produtos alimentícios, bebidas, artigos de escritório, informática',
    keywords: ['atacado', 'atacadista', 'distribuidor', 'distribuicao', 'fornecimento', 'material', 'equipamento', 'maquina', 'materia prima', 'produto', 'insumo', 'material construcao', 'material escritorio', 'material eletrico', 'material informatica', 'material hospitalar', 'material limpeza'],
  },
  '47': {
    nome: 'Comércio Varejista',
    descricao: 'Comércio varejista de mercadorias em geral, produtos alimentícios, combustíveis, material de construção, equipamentos de informática, artigos de escritório, papelaria, farmácia',
    keywords: ['varejo', 'varejista', 'loja', 'comercio', 'venda', 'produto', 'mercadoria', 'supermercado', 'papelaria', 'informatica', 'material construcao', 'farmacia', 'magazine', 'livraria', 'otica', 'combustivel', 'abastecimento', 'gasolina', 'diesel', 'etanol', 'posto combustivel', 'fornecimento combustivel'],
  },

  // ── SEÇÃO H: Transporte ──
  '49': {
    nome: 'Transporte Terrestre',
    descricao: 'Transporte ferroviário de carga e passageiros, transporte rodoviário de carga, transporte rodoviário coletivo de passageiros, transporte por dutos, transporte escolar, fretamento',
    keywords: ['transporte', 'frete', 'carga', 'passageiro', 'rodoviario', 'ferroviario', 'onibus', 'caminhao', 'logistica', 'mudanca', 'escolar', 'fretamento', 'taxi', 'motorista'],
  },
  '50': {
    nome: 'Transporte Aquaviário',
    descricao: 'Transporte marítimo de cabotagem e longo curso, navegação interior, transporte por balsas, ferries',
    keywords: ['aquaviario', 'maritimo', 'navegacao', 'navio', 'balsa', 'cabotagem', 'fluvial', 'porto'],
  },
  '51': {
    nome: 'Transporte Aéreo',
    descricao: 'Transporte aéreo de passageiros e carga',
    keywords: ['aereo', 'aviacao', 'aviao', 'aeronave', 'voo', 'aeroporto', 'carga aerea', 'frete aereo', 'passagem aerea', 'bilhete aereo'],
  },
  '52': {
    nome: 'Armazenamento e Atividades Auxiliares dos Transportes',
    descricao: 'Armazenamento, carga e descarga, operação de terminais, estacionamento, operação de portos, aeroportos, agenciamento de cargas',
    keywords: ['armazenamento', 'armazem', 'deposito', 'terminal', 'porto', 'aeroporto', 'estacionamento', 'carga', 'descarga', 'logistica', 'operador', 'agenciamento'],
  },
  '53': {
    nome: 'Correio e Outras Atividades de Entrega',
    descricao: 'Atividades de correio, atividades de malote e entrega, courier, encomenda',
    keywords: ['correio', 'entrega', 'malote', 'encomenda', 'courier', 'sedex', 'carta', 'correspondencia'],
  },

  // ── SEÇÃO I: Alojamento e Alimentação ──
  '55': {
    nome: 'Alojamento',
    descricao: 'Hotéis, pousadas, apart-hotéis, motéis, albergues, campings',
    keywords: ['hotel', 'pousada', 'hospedagem', 'alojamento', 'resort', 'apart', 'hostel', 'camping', 'acomodacao'],
  },
  '56': {
    nome: 'Alimentação',
    descricao: 'Restaurantes, lanchonetes, bares, serviços de catering, bufê, fornecimento de refeições, cantina',
    keywords: ['restaurante', 'alimentacao', 'refeicao', 'comida', 'lanchonete', 'bar', 'catering', 'bufe', 'cantina', 'cozinha', 'marmita', 'quentinha', 'coffee break', 'cafe', 'gastronomia', 'buffet', 'alimentacao escolar', 'merenda', 'refeicao transportada', 'fornecimento refeicao'],
  },

  // ── SEÇÃO J: Informação e Comunicação ──
  '58': {
    nome: 'Edição e Edição Integrada à Impressão',
    descricao: 'Edição de livros, jornais, revistas, edição integrada à impressão, edição de software',
    keywords: ['edicao', 'editora', 'livro', 'revista', 'jornal', 'publicacao', 'conteudo', 'editorial'],
  },
  '59': {
    nome: 'Atividades Cinematográficas, Produção de Vídeos e de Programas de Televisão',
    descricao: 'Produção cinematográfica, audiovisual, gravação de som, produção musical, pós-produção',
    keywords: ['cinema', 'filme', 'video', 'producao audiovisual', 'televisao', 'tv', 'gravacao', 'edicao video', 'fotografia', 'animacao', 'streaming'],
  },
  '60': {
    nome: 'Atividades de Rádio e Televisão',
    descricao: 'Atividades de rádio, atividades de televisão aberta e por assinatura',
    keywords: ['radio', 'televisao', 'tv', 'emissora', 'broadcasting', 'transmissao', 'programacao'],
  },
  '61': {
    nome: 'Telecomunicações',
    descricao: 'Telecomunicações por fio, sem fio, satélite, operadoras de televisão por assinatura, provedores de internet, telefonia fixa e móvel, banda larga',
    keywords: ['telecomunicacao', 'telefonia', 'internet', 'banda larga', 'fibra optica', 'wifi', 'rede', 'provedor', 'operadora', 'movel', 'celular', 'satelite', 'comunicacao', 'voip', 'link', 'dados'],
  },
  '62': {
    nome: 'Atividades dos Serviços de Tecnologia da Informação',
    descricao: 'Desenvolvimento de programas de computador sob encomenda e customizáveis, consultoria em tecnologia da informação, suporte técnico, manutenção e outros serviços em TI, desenvolvimento de software, aplicativos, sistemas, cloud computing, segurança da informação, processamento de dados, hosting, integração de sistemas, automação, inteligência artificial, business intelligence, ERP, CRM, help desk, infraestrutura de TI',
    keywords: ['software', 'sistema', 'aplicativo', 'programa', 'desenvolvimento', 'programacao', 'tecnologia', 'informacao', 'computador', 'digital', 'cloud', 'nuvem', 'hosting', 'hospedagem', 'dados', 'seguranca informacao', 'rede', 'infraestrutura ti', 'suporte tecnico', 'help desk', 'erp', 'crm', 'integracao', 'automacao', 'web', 'mobile', 'app', 'banco dados', 'servidor', 'backup', 'monitoramento', 'devops', 'consultoria ti', 'outsourcing', 'terceirizacao ti', 'licenca software', 'saas', 'plataforma', 'portal', 'site', 'website', 'ciberseguranca'],
  },
  '63': {
    nome: 'Atividades de Prestação de Serviços de Informação',
    descricao: 'Tratamento de dados, hosting, provedores de serviços de aplicação, portais de busca, agências de notícias, serviços de informação',
    keywords: ['dados', 'tratamento dados', 'hosting', 'provedor', 'portal', 'busca', 'informacao', 'conteudo', 'agencia noticias', 'datacenter', 'processamento', 'armazenamento dados'],
  },

  // ── SEÇÃO K: Atividades Financeiras ──
  '64': {
    nome: 'Atividades de Serviços Financeiros',
    descricao: 'Bancos comerciais, bancos de investimento, crédito, financeiras, holdings, consórcios',
    keywords: ['banco', 'financeiro', 'credito', 'financeira', 'holding', 'investimento', 'consorcio', 'pagamento', 'fintech'],
  },
  '65': {
    nome: 'Seguros, Resseguros e Previdência Complementar',
    descricao: 'Seguros de vida, saúde, automóvel, previdência complementar, resseguro, planos de saúde',
    keywords: ['seguro', 'seguradora', 'previdencia', 'resseguro', 'plano saude', 'apolice', 'sinistro', 'corretagem seguro', 'seguro veiculo', 'seguro frota', 'seguro patrimonial', 'seguro vida', 'contratacao seguro'],
  },
  '66': {
    nome: 'Atividades Auxiliares dos Serviços Financeiros',
    descricao: 'Administração de bolsas e mercados, corretagem de valores, seguros, câmbio, administração de fundos',
    keywords: ['bolsa', 'corretora', 'cambio', 'fundo investimento', 'administracao', 'valores mobiliarios', 'acao'],
  },

  // ── SEÇÃO L: Atividades Imobiliárias ──
  '68': {
    nome: 'Atividades Imobiliárias',
    descricao: 'Compra, venda, aluguel e administração de imóveis próprios e de terceiros, intermediação imobiliária, condomínios',
    keywords: ['imobiliario', 'imovel', 'aluguel', 'locacao imovel', 'condominio', 'imobiliaria', 'administracao imovel', 'compra', 'venda', 'intermediacao', 'avaliacao imovel', 'desapropriacao', 'locacao sala', 'locacao predio'],
  },

  // ── SEÇÃO M: Atividades Profissionais, Científicas e Técnicas ──
  '69': {
    nome: 'Atividades Jurídicas, Contábeis e de Auditoria',
    descricao: 'Atividades jurídicas, advocacia, contabilidade, auditoria, consultoria e assessoria tributária, fiscal, trabalhista',
    keywords: ['juridico', 'advocacia', 'advogado', 'contabilidade', 'contador', 'auditoria', 'fiscal', 'tributario', 'trabalhista', 'assessoria juridica', 'consultoria contabil', 'consultoria juridica', 'consultoria tributaria', 'medidas judiciais', 'assessoria contabil', 'prestacao contas', 'auditoria independente', 'contabil', 'pericia contabil'],
  },
  '70': {
    nome: 'Atividades de Sedes de Empresas e de Consultoria em Gestão Empresarial',
    descricao: 'Sedes de empresas, unidades administrativas locais, consultoria em gestão empresarial, assessoria em planejamento, organização, controle, gestão de projetos, estudos, diagnósticos, treinamentos corporativos',
    keywords: ['consultoria', 'gestao', 'assessoria', 'planejamento', 'estrategia', 'organizacao', 'projeto', 'diagnostico', 'treinamento', 'capacitacao', 'mapeamento', 'processos', 'bpo', 'mentoria', 'coaching', 'consultoria administrativa', 'consultoria empresarial', 'assessoria administrativa'],
  },
  '71': {
    nome: 'Serviços de Arquitetura e Engenharia',
    descricao: 'Serviços de engenharia civil, elétrica, mecânica, ambiental, arquitetura, testes e análises técnicas, projetos, laudos, perícias, topografia, cartografia, geologia',
    keywords: ['engenharia', 'arquitetura', 'projeto', 'laudo', 'pericia', 'topografia', 'levantamento', 'calculo', 'estrutural', 'geotecnia', 'sondagem', 'ensaio', 'teste', 'analise tecnica', 'fiscalizacao obra', 'supervisao', 'gerenciamento obra', 'meio ambiente', 'estudo ambiental', 'impacto ambiental', 'rima', 'eia', 'licenciamento ambiental', 'consultoria ambiental', 'avaliacao imovel'],
  },
  '72': {
    nome: 'Pesquisa e Desenvolvimento Científico',
    descricao: 'Pesquisa e desenvolvimento experimental em ciências naturais, sociais, humanidades, engenharia, tecnologia',
    keywords: ['pesquisa', 'desenvolvimento', 'cientifico', 'inovacao', 'laboratorio', 'experimento', 'estudo', 'investigacao', 'p&d', 'patente'],
  },
  '73': {
    nome: 'Publicidade e Pesquisa de Mercado',
    descricao: 'Agências de publicidade, atividades de publicidade, pesquisa de mercado, opinião pública, design gráfico, comunicação visual, marketing digital',
    keywords: ['publicidade', 'propaganda', 'marketing', 'agencia', 'comunicacao', 'design', 'grafico', 'visual', 'marca', 'branding', 'pesquisa mercado', 'midia', 'campanha', 'digital', 'redes sociais', 'social media', 'seo', 'criacao'],
  },
  '74': {
    nome: 'Outras Atividades Profissionais, Científicas e Técnicas',
    descricao: 'Design, fotografia, tradução, interpretação, atividades veterinárias, perícias técnicas, consultoria ambiental',
    keywords: ['design', 'fotografia', 'traducao', 'interprete', 'veterinario', 'pericia', 'consultoria ambiental', 'certificacao', 'estudo ambiental', 'impacto ambiental', 'meio ambiente', 'licenciamento ambiental'],
  },
  '75': {
    nome: 'Atividades Veterinárias',
    descricao: 'Atividades veterinárias para animais domésticos e de produção',
    keywords: ['veterinario', 'animal', 'clinica veterinaria', 'pet', 'zootecnia'],
  },

  // ── SEÇÃO N: Atividades Administrativas e Serviços Complementares ──
  '77': {
    nome: 'Aluguéis Não-Imobiliários e Gestão de Ativos Intangíveis',
    descricao: 'Locação de veículos, máquinas e equipamentos, aluguel de objetos pessoais, gestão de ativos intangíveis, franquias',
    keywords: ['aluguel', 'locacao', 'leasing', 'veiculo', 'maquina', 'equipamento', 'franquia'],
  },
  '78': {
    nome: 'Seleção, Agenciamento e Locação de Mão-de-Obra',
    descricao: 'Seleção e agenciamento de mão-de-obra, locação de mão-de-obra temporária, fornecimento de pessoal terceirizado',
    keywords: ['mao de obra', 'terceirizacao', 'pessoal', 'temporario', 'recrutamento', 'selecao', 'recursos humanos', 'rh', 'agenciamento'],
  },
  '79': {
    nome: 'Agências de Viagens e Operadores Turísticos',
    descricao: 'Agências de viagens, operadores turísticos, serviços de reservas, passagens aéreas, hospedagem, turismo',
    keywords: ['viagem', 'turismo', 'passagem', 'hospedagem', 'reserva', 'agencia viagem', 'operadora turismo', 'passagem aerea', 'bilhete passagem', 'agenciamento viagem', 'emissao passagem'],
  },
  '80': {
    nome: 'Atividades de Vigilância, Segurança e Investigação',
    descricao: 'Atividades de vigilância e segurança privada, armada e desarmada, segurança patrimonial, escolta, monitoramento eletrônico, alarmes, CFTV, portaria, controle de acesso',
    keywords: ['vigilancia', 'seguranca', 'patrimonial', 'armada', 'desarmada', 'monitoramento', 'alarme', 'cftv', 'camera', 'portaria', 'controle acesso', 'vigila', 'ronda', 'escolta', 'blindagem', 'extintor', 'incendio', 'sinalizacao seguranca', 'brigada', 'bombeiro civil'],
  },
  '81': {
    nome: 'Serviços para Edifícios e Atividades Paisagísticas',
    descricao: 'Limpeza em prédios e domicílios, dedetização, desinfecção, desinsetização, imunização, higienização, atividades paisagísticas, jardinagem, poda, manutenção de áreas verdes, serviços de facilities, zeladoria, copeiragem',
    keywords: ['limpeza', 'conservacao', 'zeladoria', 'facilities', 'jardinagem', 'paisagismo', 'poda', 'area verde', 'dedetizacao', 'desinsetizacao', 'desinfeccao', 'higienizacao', 'copeira', 'manutencao predial', 'faxina', 'asseio'],
  },
  '82': {
    nome: 'Serviços de Escritório e Apoio Administrativo',
    descricao: 'Fotocópias, digitalização, atividades de teleatendimento, call center, organização de feiras, congressos, exposições, serviços de apoio administrativo, secretariado, recepção, telefonista',
    keywords: ['escritorio', 'administrativo', 'apoio', 'secretariado', 'recepcao', 'telefonista', 'call center', 'teleatendimento', 'cobranca', 'fotocopia', 'digitalizacao', 'evento', 'congresso', 'feira', 'convencao', 'organizacao evento'],
  },

  // ── SEÇÃO O: Administração Pública ──
  '84': {
    nome: 'Administração Pública, Defesa e Seguridade Social',
    descricao: 'Administração pública em geral, regulação, defesa civil, segurança pública, justiça, relações exteriores, previdência social',
    keywords: ['administracao publica', 'governo', 'defesa', 'seguridade', 'previdencia', 'seguranca publica', 'justica', 'regulacao'],
  },

  // ── SEÇÃO P: Educação ──
  '85': {
    nome: 'Educação',
    descricao: 'Educação infantil, ensino fundamental, médio, superior, técnico, profissional, cursos de idiomas, informática, preparatórios, treinamento, capacitação, ensino a distância (EAD)',
    keywords: ['educacao', 'ensino', 'escola', 'universidade', 'faculdade', 'curso', 'treinamento', 'capacitacao', 'formacao', 'instrutor', 'professor', 'aula', 'ead', 'distancia', 'profissional', 'tecnico', 'idioma', 'preparatorio', 'palestra', 'workshop', 'solucao educacional', 'educacional', 'curso online', 'on-line', 'pedagogico', 'didatico', 'aluno', 'estudante', 'creche', 'educacao infantil', 'escolar', 'material didatico', 'livro didatico', 'biblioteca'],
  },

  // ── SEÇÃO Q: Saúde e Serviços Sociais ──
  '86': {
    nome: 'Atividades de Atenção à Saúde Humana',
    descricao: 'Atividades de atendimento hospitalar, atenção ambulatorial, serviços de diagnóstico e terapia, urgência, emergência, clínica médica, odontologia, fisioterapia, nutrição, psicologia, fonoaudiologia, enfermagem',
    keywords: ['saude', 'hospital', 'clinica', 'medico', 'enfermagem', 'ambulatorio', 'cirurgia', 'diagnostico', 'exame', 'laboratorio', 'imagem', 'raio x', 'tomografia', 'ressonancia', 'odontologia', 'fisioterapia', 'nutricao', 'psicologia', 'farmacia', 'uti', 'urgencia', 'emergencia', 'laudo', 'eletrocardiograma', 'ultrassonografia', 'endoscopia', 'paciente', 'area medica', 'servico saude', 'prestacao servico saude', 'ambulancia', 'laudo medico', 'odontologico', 'consultorio', 'reabilitacao', 'oftalmologia', 'oftalmologico', 'catarata', 'atendimento medico', 'procedimento medico', 'unidade saude', 'hospitalar', 'medico hospitalar', 'sus'],
  },
  '87': {
    nome: 'Atividades de Atenção à Saúde Humana Integradas com Assistência Social',
    descricao: 'Atividades de assistência social com alojamento, cuidados de enfermagem, atenção ao deficiente físico e mental, idosos, dependentes químicos',
    keywords: ['assistencia social', 'abrigo', 'asilo', 'idoso', 'deficiente', 'reabilitacao', 'internacao', 'cuidado', 'acolhimento', 'acolhimento institucional', 'casa repouso', 'vulnerabilidade', 'lar'],
  },
  '88': {
    nome: 'Serviços de Assistência Social sem Alojamento',
    descricao: 'Serviços de assistência social sem alojamento, creche, orientação e assistência social',
    keywords: ['assistencia social', 'creche', 'orientacao', 'social', 'comunitario', 'vulnerabilidade', 'cras', 'creas', 'centro referencia', 'assistencia', 'acolhimento'],
  },

  // ── SEÇÃO R: Artes, Cultura, Esporte e Recreação ──
  '90': {
    nome: 'Atividades Artísticas, Criativas e de Espetáculos',
    descricao: 'Artes cênicas, espetáculos, atividades de artistas, teatro, dança, música, circo',
    keywords: ['arte', 'espetaculo', 'teatro', 'danca', 'musica', 'show', 'evento cultural', 'circo', 'artista', 'cantor', 'banda', 'apresentacao artistica', 'show artistico', 'dupla', 'musico', 'carnaval', 'festa', 'teatral', 'grupo teatral', 'sonorizacao', 'iluminacao palco', 'palco'],
  },
  '91': {
    nome: 'Atividades Ligadas ao Patrimônio Cultural e Ambiental',
    descricao: 'Bibliotecas, arquivos, museus, patrimônio histórico, jardins botânicos, zoológicos, parques nacionais, reservas ecológicas',
    keywords: ['biblioteca', 'museu', 'arquivo', 'patrimonio', 'historico', 'cultural', 'zoologico', 'botanico', 'parque', 'reserva'],
  },
  '92': {
    nome: 'Atividades de Exploração de Jogos de Azar e Apostas',
    descricao: 'Casas de bingo, loterias, apostas',
    keywords: ['jogo', 'aposta', 'loteria', 'bingo', 'cassino'],
  },
  '93': {
    nome: 'Atividades Esportivas e de Recreação e Lazer',
    descricao: 'Gestão de instalações esportivas, clubes de futebol, academias, atividades de condicionamento físico, atividades recreativas e de lazer, parques de diversões',
    keywords: ['esporte', 'esportivo', 'academia', 'futebol', 'clube', 'recreacao', 'lazer', 'parque', 'piscina', 'quadra', 'ginasio', 'arbitragem', 'volei', 'basquete', 'futsal', 'bocha', 'atletismo', 'competicao esportiva', 'evento esportivo'],
  },

  // ── SEÇÃO S: Outras Atividades de Serviços ──
  '94': {
    nome: 'Atividades de Organizações Associativas',
    descricao: 'Atividades de organizações associativas patronais, empresariais, profissionais, sindicatos, associações de defesa de direitos, partidos políticos, cooperativas',
    keywords: ['associacao', 'sindicato', 'cooperativa', 'patronal', 'empresarial', 'profissional', 'ong', 'entidade'],
  },
  '95': {
    nome: 'Reparação e Manutenção de Equipamentos de Informática e Comunicação',
    descricao: 'Reparação e manutenção de computadores, equipamentos periféricos, equipamentos de comunicação, aparelhos eletrodomésticos, objetos pessoais',
    keywords: ['reparacao', 'manutencao', 'computador', 'informatica', 'impressora', 'notebook', 'celular', 'comunicacao', 'eletrodomestico', 'conserto', 'assistencia tecnica'],
  },
  '96': {
    nome: 'Outras Atividades de Serviços Pessoais',
    descricao: 'Lavanderias, cabeleireiros, atividades de estética, funerárias, atividades de bem-estar físico',
    keywords: ['lavanderia', 'cabeleireiro', 'estetica', 'funeraria', 'barbearia', 'spa', 'tatuagem', 'processamento roupa', 'enxoval', 'lavagem', 'higienizacao roupa', 'passadoria'],
  },

  // ── SEÇÃO T: Serviços Domésticos ──
  '97': {
    nome: 'Serviços Domésticos',
    descricao: 'Serviços domésticos em residências, empregados domésticos',
    keywords: ['domestico', 'empregado', 'residencia'],
  },

  // ── SEÇÃO U: Organismos Internacionais ──
  '99': {
    nome: 'Organismos Internacionais e Outras Instituições Extraterritoriais',
    descricao: 'Organismos internacionais, embaixadas, consulados',
    keywords: ['internacional', 'embaixada', 'consulado', 'onu', 'organizacao internacional'],
  },
}

/**
 * Mapping of related CNAE divisions.
 * If a company has CNAE from division X, tenders classified in related divisions
 * may also be relevant (at a lower confidence level).
 */
export const RELATED_DIVISIONS: Record<string, string[]> = {
  // TI & Telecomunicações
  '62': ['63', '95', '26', '61'],
  '63': ['62', '58', '73'],
  '61': ['62', '63'],
  '26': ['62', '27', '95'],
  '95': ['62', '33', '26'],

  // Construção & Engenharia
  '41': ['42', '43', '71', '23'],
  '42': ['41', '43', '71'],
  '43': ['41', '42', '33', '71', '27'],
  '71': ['41', '42', '43', '72', '74'],

  // Segurança, Limpeza & Facilities
  '80': ['81', '82'],
  '81': ['80', '82', '43'],
  '82': ['80', '81', '70', '78'],

  // Comércio
  '46': ['47', '77'],
  '47': ['46'],
  '45': ['29', '30'],

  // Consultoria & Profissionais
  '70': ['69', '82', '73', '72'],
  '69': ['70', '66'],
  '73': ['63', '70', '74', '59'],
  '74': ['73', '71', '72'],

  // Saúde
  '86': ['87', '88', '21', '32'],
  '87': ['86', '88'],
  '88': ['86', '87', '85'],

  // Educação & Pesquisa
  '85': ['72', '70'],
  '72': ['71', '85', '74'],

  // Indústria
  '10': ['11', '56', '46'],
  '11': ['10', '56'],
  '20': ['21', '22', '38'],
  '21': ['20', '86', '32'],
  '22': ['20', '25'],
  '24': ['25', '07'],
  '25': ['24', '28', '33'],
  '27': ['26', '28', '35', '43'],
  '28': ['27', '25', '33'],
  '29': ['30', '45'],
  '30': ['29', '50', '51'],
  '31': ['16'],
  '33': ['28', '43', '95'],

  // Transporte & Logística
  '49': ['50', '51', '52'],
  '50': ['49', '52'],
  '51': ['49', '52'],
  '52': ['49', '50', '51', '53'],
  '53': ['52'],

  // Alimentação & Hospedagem
  '55': ['56', '79'],
  '56': ['55', '10', '11'],

  // Energia, Água & Meio Ambiente
  '35': ['36', '42', '27'],
  '36': ['37', '38', '42'],
  '37': ['36', '38', '42'],
  '38': ['37', '39', '20'],
  '39': ['38', '71'],

  // Mídia & Cultura
  '58': ['59', '60', '63'],
  '59': ['58', '60', '73', '90'],
  '60': ['59', '58'],
  '90': ['59', '91', '93'],
  '91': ['90', '85'],
  '93': ['90', '91', '79'],

  // Financeiro & Imobiliário
  '64': ['65', '66'],
  '65': ['64', '66'],
  '66': ['64', '65', '69'],
  '68': ['41', '70'],

  // Mão-de-obra & Serviços
  '78': ['82', '81', '80'],
  '79': ['55', '93'],

  // Indústrias diversas
  '13': ['14'],
  '14': ['13', '15'],
  '15': ['14'],
  '16': ['31', '02'],
  '17': ['18'],
  '18': ['17', '58'],
  '23': ['41', '42', '43'],
  '32': ['86', '93'],
}

/**
 * Get all matching divisions for a company's CNAEs.
 * Returns direct matching divisions and related divisions.
 */
export function getCompanyDivisions(companyCnaes: string[]): {
  direct: Set<string>
  related: Set<string>
} {
  const direct = new Set<string>()
  const related = new Set<string>()

  for (const cnae of companyCnaes) {
    const div = cnae.substring(0, 2)
    direct.add(div)

    const relatedDivs = RELATED_DIVISIONS[div]
    if (relatedDivs) {
      for (const rd of relatedDivs) {
        if (!direct.has(rd)) {
          related.add(rd)
        }
      }
    }
  }

  return { direct, related }
}
