-- Add unique constraints to allow upserting items and prices

ALTER TABLE public.tender_items
  ADD CONSTRAINT tender_items_tender_id_numero_item_key UNIQUE (tender_id, numero_item);

ALTER TABLE public.price_history
  ADD CONSTRAINT price_history_tender_id_tender_item_number_cnpj_vencedor_key UNIQUE (tender_id, tender_item_number, cnpj_vencedor);
