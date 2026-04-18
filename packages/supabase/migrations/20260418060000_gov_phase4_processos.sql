-- ============================================================
-- LICITAGOV: Phase 4+ (Processos + Artefatos — DFD, ETP, TR, Edital, etc.)
-- ============================================================
-- RLS policies completas em processos/artefatos/riscos_identificados.
-- RPCs públicas p/ CRUD de processos e lifecycle de artefatos (criar,
-- marcar gerando, salvar conteúdo, aprovar).
-- ============================================================

-- ------------------------------------------------------------
-- RLS PROCESSOS
-- ------------------------------------------------------------
CREATE POLICY p_processos_select_own ON licitagov.processos
  FOR SELECT TO authenticated
  USING (orgao_id = licitagov.current_orgao_id());

CREATE POLICY p_processos_admin_insert ON licitagov.processos
  FOR INSERT TO authenticated
  WITH CHECK (
    licitagov.current_user_is_admin() AND orgao_id = licitagov.current_orgao_id()
  );

CREATE POLICY p_processos_admin_update ON licitagov.processos
  FOR UPDATE TO authenticated
  USING (licitagov.current_user_is_admin() AND orgao_id = licitagov.current_orgao_id())
  WITH CHECK (orgao_id = licitagov.current_orgao_id());

-- ------------------------------------------------------------
-- RLS ARTEFATOS
-- ------------------------------------------------------------
CREATE POLICY p_artefatos_select_own ON licitagov.artefatos
  FOR SELECT TO authenticated
  USING (
    processo_id IN (
      SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id()
    )
  );

CREATE POLICY p_artefatos_admin_write ON licitagov.artefatos
  FOR INSERT TO authenticated
  WITH CHECK (
    licitagov.current_user_is_admin() AND
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );

CREATE POLICY p_artefatos_admin_update ON licitagov.artefatos
  FOR UPDATE TO authenticated
  USING (
    licitagov.current_user_is_admin() AND
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  )
  WITH CHECK (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );

-- ------------------------------------------------------------
-- RLS RISCOS_IDENTIFICADOS
-- ------------------------------------------------------------
CREATE POLICY p_riscos_select_own ON licitagov.riscos_identificados
  FOR SELECT TO authenticated
  USING (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );

CREATE POLICY p_riscos_admin_write ON licitagov.riscos_identificados
  FOR ALL TO authenticated
  USING (
    licitagov.current_user_is_admin() AND
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  )
  WITH CHECK (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );

-- ------------------------------------------------------------
-- RLS PRECOS (pesquisa + estimativa)
-- ------------------------------------------------------------
CREATE POLICY p_precos_pesquisa_select_own ON licitagov.precos_pesquisa
  FOR SELECT TO authenticated
  USING (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );
CREATE POLICY p_precos_pesquisa_admin_write ON licitagov.precos_pesquisa
  FOR ALL TO authenticated
  USING (
    licitagov.current_user_is_admin() AND
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  )
  WITH CHECK (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );

CREATE POLICY p_precos_estimativa_select_own ON licitagov.precos_estimativa
  FOR SELECT TO authenticated
  USING (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );
CREATE POLICY p_precos_estimativa_admin_write ON licitagov.precos_estimativa
  FOR ALL TO authenticated
  USING (
    licitagov.current_user_is_admin() AND
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  )
  WITH CHECK (
    processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  );

-- ------------------------------------------------------------
-- RPC: public.create_processo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_processo(
  p_objeto TEXT,
  p_tipo VARCHAR(30),
  p_modalidade VARCHAR(30) DEFAULT NULL,
  p_setor_requisitante_id UUID DEFAULT NULL,
  p_valor_estimado NUMERIC DEFAULT NULL,
  p_campanha_pca_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_processo_id UUID;
  v_numero TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'must be authenticated'; END IF;
  IF v_orgao_id IS NULL THEN RAISE EXCEPTION 'usuário sem órgão'; END IF;
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador pode criar processo';
  END IF;
  IF p_objeto IS NULL OR length(trim(p_objeto)) < 5 THEN
    RAISE EXCEPTION 'objeto obrigatório (min 5 chars)';
  END IF;
  IF p_tipo NOT IN ('material', 'servico', 'obra', 'servico_engenharia') THEN
    RAISE EXCEPTION 'tipo inválido';
  END IF;

  -- Gera numero_interno simples: YYYY/NNNN
  SELECT to_char(NOW(), 'YYYY') || '/' || LPAD(
    (COALESCE((
      SELECT MAX(split_part(numero_interno, '/', 2)::INTEGER)
      FROM licitagov.processos
      WHERE orgao_id = v_orgao_id
        AND numero_interno LIKE to_char(NOW(), 'YYYY') || '/%'
    ), 0) + 1)::TEXT, 4, '0')
  INTO v_numero;

  INSERT INTO licitagov.processos (
    orgao_id, campanha_pca_id, numero_interno, objeto, tipo, modalidade,
    valor_estimado, setor_requisitante_id, agente_contratacao_id, fase_atual
  )
  VALUES (
    v_orgao_id, p_campanha_pca_id, v_numero, p_objeto, p_tipo, p_modalidade,
    p_valor_estimado, p_setor_requisitante_id, v_user_id, 'dfd'
  )
  RETURNING id INTO v_processo_id;

  RETURN v_processo_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_processo(TEXT, VARCHAR(30), VARCHAR(30), UUID, NUMERIC, UUID) TO authenticated;

-- ------------------------------------------------------------
-- RPC: list_processos (para lista + dashboard)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_processos()
RETURNS TABLE (
  id UUID,
  numero_interno VARCHAR(100),
  objeto TEXT,
  tipo VARCHAR(30),
  modalidade VARCHAR(30),
  fase_atual VARCHAR(30),
  valor_estimado NUMERIC,
  setor_nome TEXT,
  criado_em TIMESTAMPTZ,
  artefatos_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    p.id, p.numero_interno, p.objeto, p.tipo, p.modalidade, p.fase_atual,
    p.valor_estimado,
    s.nome,
    p.criado_em,
    (SELECT COUNT(*) FROM licitagov.artefatos a WHERE a.processo_id = p.id AND a.status IN ('gerado', 'aprovado', 'publicado'))
  FROM licitagov.processos p
  LEFT JOIN licitagov.setores s ON s.id = p.setor_requisitante_id
  WHERE p.orgao_id = licitagov.current_orgao_id()
  ORDER BY p.criado_em DESC
$$;
GRANT EXECUTE ON FUNCTION public.list_processos() TO authenticated;

-- ------------------------------------------------------------
-- RPC: get_processo_detail (processo + todos artefatos agregados)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_processo_detail(p_processo_id UUID)
RETURNS TABLE (
  id UUID,
  numero_interno VARCHAR(100),
  objeto TEXT,
  tipo VARCHAR(30),
  modalidade VARCHAR(30),
  criterio_julgamento VARCHAR(30),
  modo_disputa VARCHAR(30),
  valor_estimado NUMERIC,
  fase_atual VARCHAR(30),
  setor_nome TEXT,
  criado_em TIMESTAMPTZ,
  artefatos JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT
    p.id, p.numero_interno, p.objeto, p.tipo, p.modalidade,
    p.criterio_julgamento, p.modo_disputa, p.valor_estimado, p.fase_atual,
    s.nome,
    p.criado_em,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'tipo', a.tipo,
        'versao', a.versao,
        'status', a.status,
        'modelo_usado', a.modelo_usado,
        'tokens_input', a.tokens_input,
        'tokens_output', a.tokens_output,
        'criado_em', a.criado_em,
        'aprovado_em', a.aprovado_em
      ) ORDER BY a.criado_em)
      FROM licitagov.artefatos a
      WHERE a.processo_id = p.id
    ), '[]'::jsonb)
  FROM licitagov.processos p
  LEFT JOIN licitagov.setores s ON s.id = p.setor_requisitante_id
  WHERE p.id = p_processo_id AND p.orgao_id = licitagov.current_orgao_id()
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_processo_detail(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RPC: upsert_artefato
-- Cria ou atualiza um artefato (tipo × processo × versao). Usado pelos
-- geradores de IA para persistir markdown conforme stream.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_artefato(
  p_processo_id UUID,
  p_tipo VARCHAR(30),
  p_conteudo_markdown TEXT,
  p_modelo_usado VARCHAR(50),
  p_tokens_input INTEGER DEFAULT NULL,
  p_tokens_output INTEGER DEFAULT NULL,
  p_tempo_geracao_ms INTEGER DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT 'gerado',
  p_citacoes JSONB DEFAULT NULL,
  p_compliance JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_artefato_id UUID;
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM licitagov.processos WHERE id = p_processo_id AND orgao_id = v_orgao_id
  ) THEN RAISE EXCEPTION 'processo não pertence ao órgão'; END IF;

  INSERT INTO licitagov.artefatos (
    processo_id, tipo, versao, conteudo_markdown, status,
    modelo_usado, tokens_input, tokens_output, tempo_geracao_ms,
    citacoes_juridicas, compliance_status, criado_por
  )
  VALUES (
    p_processo_id, p_tipo, 1, p_conteudo_markdown, p_status,
    p_modelo_usado, p_tokens_input, p_tokens_output, p_tempo_geracao_ms,
    p_citacoes, p_compliance, auth.uid()
  )
  ON CONFLICT (processo_id, tipo, versao) WHERE versao = 1 DO UPDATE
    SET conteudo_markdown = EXCLUDED.conteudo_markdown,
        status = EXCLUDED.status,
        modelo_usado = EXCLUDED.modelo_usado,
        tokens_input = EXCLUDED.tokens_input,
        tokens_output = EXCLUDED.tokens_output,
        tempo_geracao_ms = EXCLUDED.tempo_geracao_ms,
        citacoes_juridicas = EXCLUDED.citacoes_juridicas,
        compliance_status = EXCLUDED.compliance_status,
        atualizado_em = NOW()
  RETURNING id INTO v_artefato_id;

  RETURN v_artefato_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_artefato(UUID, VARCHAR(30), TEXT, VARCHAR(50), INTEGER, INTEGER, INTEGER, VARCHAR(20), JSONB, JSONB) TO authenticated;

-- Índice único para suportar o ON CONFLICT acima
CREATE UNIQUE INDEX IF NOT EXISTS uq_artefato_processo_tipo_v1
  ON licitagov.artefatos (processo_id, tipo) WHERE versao = 1;

-- ------------------------------------------------------------
-- RPC: approve_artefato
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_artefato(p_artefato_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;

  UPDATE licitagov.artefatos a
  SET status = 'aprovado', aprovado_por = auth.uid(), aprovado_em = NOW(), atualizado_em = NOW()
  WHERE a.id = p_artefato_id
    AND a.processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = v_orgao_id);

  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_artefato(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RPC: get_artefato
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_artefato(p_processo_id UUID, p_tipo VARCHAR(30))
RETURNS TABLE (
  id UUID,
  versao INTEGER,
  conteudo_markdown TEXT,
  status VARCHAR(20),
  modelo_usado VARCHAR(50),
  citacoes_juridicas JSONB,
  compliance_status JSONB,
  aprovado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT a.id, a.versao, a.conteudo_markdown, a.status, a.modelo_usado,
         a.citacoes_juridicas, a.compliance_status, a.aprovado_em, a.criado_em
  FROM licitagov.artefatos a
  WHERE a.processo_id = p_processo_id
    AND a.tipo = p_tipo
    AND a.versao = 1
    AND a.processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_artefato(UUID, VARCHAR(30)) TO authenticated;

-- ------------------------------------------------------------
-- RPC: set_processo_fase
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_processo_fase(p_processo_id UUID, p_fase VARCHAR(30))
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;
  IF p_fase NOT IN ('dfd','etp','riscos','precos','tr','compliance','parecer','edital','publicacao','publicado','cancelado') THEN
    RAISE EXCEPTION 'fase inválida: %', p_fase;
  END IF;

  UPDATE licitagov.processos
  SET fase_atual = p_fase, atualizado_em = NOW()
  WHERE id = p_processo_id AND orgao_id = licitagov.current_orgao_id();
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_processo_fase(UUID, VARCHAR(30)) TO authenticated;

-- ------------------------------------------------------------
-- RPC: save_riscos (substitui todos riscos do processo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_riscos(p_processo_id UUID, p_riscos JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
DECLARE
  v_orgao_id UUID := licitagov.current_orgao_id();
  v_risco JSONB;
  v_count INTEGER := 0;
BEGIN
  IF NOT licitagov.current_user_is_admin() THEN
    RAISE EXCEPTION 'apenas admin/coordenador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM licitagov.processos WHERE id = p_processo_id AND orgao_id = v_orgao_id) THEN
    RAISE EXCEPTION 'processo não pertence ao órgão';
  END IF;

  DELETE FROM licitagov.riscos_identificados WHERE processo_id = p_processo_id;
  FOR v_risco IN SELECT * FROM jsonb_array_elements(p_riscos) LOOP
    INSERT INTO licitagov.riscos_identificados (
      processo_id, fase, descricao, probabilidade, impacto, nivel_risco,
      responsavel, tratamento, mitigacao
    )
    VALUES (
      p_processo_id,
      NULLIF(v_risco->>'fase', ''),
      v_risco->>'descricao',
      NULLIF(v_risco->>'probabilidade', ''),
      NULLIF(v_risco->>'impacto', ''),
      NULLIF(v_risco->>'nivel_risco', ''),
      NULLIF(v_risco->>'responsavel', ''),
      NULLIF(v_risco->>'tratamento', ''),
      NULLIF(v_risco->>'mitigacao', '')
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_riscos(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- RPC: list_riscos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_riscos(p_processo_id UUID)
RETURNS TABLE (
  id UUID,
  fase VARCHAR(30),
  descricao TEXT,
  probabilidade VARCHAR(10),
  impacto VARCHAR(10),
  nivel_risco VARCHAR(10),
  responsavel VARCHAR(20),
  tratamento TEXT,
  mitigacao TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = licitagov, public, pg_temp
AS $$
  SELECT r.id, r.fase, r.descricao, r.probabilidade, r.impacto, r.nivel_risco,
         r.responsavel, r.tratamento, r.mitigacao
  FROM licitagov.riscos_identificados r
  WHERE r.processo_id = p_processo_id
    AND r.processo_id IN (SELECT id FROM licitagov.processos WHERE orgao_id = licitagov.current_orgao_id())
  ORDER BY r.criado_em
$$;
GRANT EXECUTE ON FUNCTION public.list_riscos(UUID) TO authenticated;

COMMENT ON FUNCTION public.create_processo IS 'Phase 4+: cria processo de licitação, gera numero_interno sequencial YYYY/NNNN.';
COMMENT ON FUNCTION public.upsert_artefato IS 'Lifecycle de artefatos (DFD, ETP, TR, Edital, etc.) — chamado pelos geradores IA.';
