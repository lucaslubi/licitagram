"""
LICITAGRAM BOT — Módulo para interação com o portal ComprasNet.

Este módulo implementa a interface para o portal de licitações ComprasNet
(www.comprasnet.gov.br), permitindo login, busca de licitações, envio de
propostas e lances automáticos.
"""

import os
import time
import json
from datetime import datetime
from typing import Dict, List, Optional, Union, Any
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

from .base import PortalBase
from ..logger import LicitagramBotLogger


class ComprasNetPortal(PortalBase):
    """
    Implementação da interface do LICITAGRAM BOT para o portal ComprasNet.

    Permite interação automatizada com o portal de licitações do Governo Federal.
    """

    BASE_URL = "https://www.comprasnet.gov.br"
    LOGIN_URL = "https://www.comprasnet.gov.br/seguro/loginPortal.asp"

    def __init__(self, headless: bool = True, logger: Optional[LicitagramBotLogger] = None):
        """
        Inicializa o portal ComprasNet do LICITAGRAM BOT.

        Args:
            headless: Se True, executa o navegador em modo headless (sem interface gráfica)
            logger: Instância do logger para registrar eventos
        """
        super().__init__(headless=headless, logger=logger)

    def login(self, username: str, password: str) -> bool:
        """
        Realiza login no portal ComprasNet.

        Args:
            username: CPF do usuário (apenas números)
            password: Senha de acesso

        Returns:
            True se login bem-sucedido, False caso contrário
        """
        try:
            self._initialize_browser()
            self.logger.info(f"LICITAGRAM BOT — Iniciando login no ComprasNet com usuário {username}")

            # Acessa a página de login
            self.page.goto(self.LOGIN_URL)

            # Verifica se a página carregou corretamente
            if "Portal de Compras do Governo Federal" not in self.page.title():
                self.logger.error("LICITAGRAM BOT — Página de login do ComprasNet não carregou corretamente")
                return False

            # Clica no botão de acesso ao sistema
            self.page.click('text="Acesso ao Sistema"')

            # Aguarda carregamento da página de login
            self.page.wait_for_selector('input[name="txtLogin"]')

            # Preenche o formulário de login
            self.page.fill('input[name="txtLogin"]', username)
            self.page.fill('input[name="txtSenha"]', password)

            # Clica no botão de login
            self.page.click('input[type="submit"]')

            # Verifica se o login foi bem-sucedido (aguarda redirecionamento)
            try:
                # Aguarda até 10 segundos pelo redirecionamento ou mensagem de erro
                self.page.wait_for_selector('a:has-text("Sair")', timeout=10000)
                self.logged_in = True
                self.logger.info("LICITAGRAM BOT — Login no ComprasNet realizado com sucesso")

                # Salva cookies e dados da sessão
                self.session_data = {
                    "cookies": self.context.cookies(),
                    "storage": self.page.evaluate("() => { return { localStorage: Object.entries(localStorage), sessionStorage: Object.entries(sessionStorage) } }")
                }

                return True
            except Exception as e:
                # Verifica se há mensagem de erro na página
                error_text = self.page.inner_text('body') if self.page.query_selector('body') else ""
                if "senha inválida" in error_text.lower() or "usuário inválido" in error_text.lower():
                    self.logger.error("LICITAGRAM BOT — Credenciais inválidas para o ComprasNet")
                else:
                    self.logger.error(f"LICITAGRAM BOT — Erro no login do ComprasNet: {str(e)}")
                return False

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao fazer login no ComprasNet: {str(e)}")
            return False

    def login_with_certificate(self, certificate_path: str, certificate_password: Optional[str] = None) -> bool:
        """
        Realiza login no portal ComprasNet usando certificado digital.

        Args:
            certificate_path: Caminho para o arquivo do certificado (.pfx)
            certificate_password: Senha do certificado, se necessário

        Returns:
            True se login bem-sucedido, False caso contrário
        """
        try:
            # Verifica se o arquivo do certificado existe
            if not os.path.exists(certificate_path):
                self.logger.error(f"LICITAGRAM BOT — Arquivo de certificado não encontrado: {certificate_path}")
                return False

            self._initialize_browser()
            self.logger.info("LICITAGRAM BOT — Iniciando login com certificado no ComprasNet")

            # Acessa a página de login
            self.page.goto(self.LOGIN_URL)

            # Clica na opção de login com certificado digital
            self.page.click('text="Acesso por Certificado Digital"')

            # Nota: Playwright não suporta diretamente a seleção de certificados.
            # Seria necessário usar uma abordagem alternativa, como:
            # 1. Configurar o navegador para usar o certificado automaticamente
            # 2. Usar uma extensão ou ferramenta externa
            self.logger.warning("LICITAGRAM BOT — Login com certificado digital não totalmente implementado")

            # Verifica se o login foi bem-sucedido
            try:
                # Aguarda até 10 segundos pelo redirecionamento ou elemento que indica sucesso
                self.page.wait_for_selector('a:has-text("Sair")', timeout=10000)
                self.logged_in = True
                self.logger.info("LICITAGRAM BOT — Login com certificado no ComprasNet realizado com sucesso")

                # Salva cookies e dados da sessão
                self.session_data = {
                    "cookies": self.context.cookies(),
                    "storage": self.page.evaluate("() => { return { localStorage: Object.entries(localStorage), sessionStorage: Object.entries(sessionStorage) } }")
                }

                return True
            except Exception as e:
                self.logger.error(f"LICITAGRAM BOT — Erro no login com certificado: {str(e)}")
                return False

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao fazer login com certificado no ComprasNet: {str(e)}")
            return False

    def search_auctions(self,
                        keywords: Optional[List[str]] = None,
                        start_date: Optional[datetime] = None,
                        end_date: Optional[datetime] = None,
                        auction_type: Optional[str] = None) -> List[Dict]:
        """
        Busca licitações no portal ComprasNet.

        Args:
            keywords: Lista de palavras-chave para busca
            start_date: Data de início para filtro
            end_date: Data de fim para filtro
            auction_type: Tipo de licitação (pregão, dispensa, etc.)

        Returns:
            Lista de licitações encontradas
        """
        if not self.logged_in:
            self.logger.error("LICITAGRAM BOT — É necessário estar logado para buscar licitações")
            return []

        try:
            self.logger.info("LICITAGRAM BOT — Buscando licitações no ComprasNet")

            # Navega para a página de consulta de licitações
            self.page.goto(f"{self.BASE_URL}/consultalicitacoes/ConsLicitacaoDia.asp")

            # Preenche os filtros de busca
            if start_date:
                start_date_str = start_date.strftime("%d/%m/%Y")
                self.page.fill('input[name="dt_publ_ini"]', start_date_str)

            if end_date:
                end_date_str = end_date.strftime("%d/%m/%Y")
                self.page.fill('input[name="dt_publ_fim"]', end_date_str)

            if auction_type:
                # Seleciona o tipo de licitação no dropdown
                self.page.select_option('select[name="tipo_modalidade"]', auction_type)

            if keywords and len(keywords) > 0:
                # Preenche o campo de palavras-chave
                keyword_str = " ".join(keywords)
                self.page.fill('input[name="txt_objeto"]', keyword_str)

            # Clica no botão de pesquisar
            self.page.click('input[type="submit"]')

            # Aguarda o carregamento dos resultados
            self.page.wait_for_selector('table')

            # Extrai os resultados da tabela
            results = []
            rows = self.page.query_selector_all('table tr:not(:first-child)')

            for row in rows:
                cells = row.query_selector_all('td')
                if len(cells) >= 5:
                    auction_data = {
                        "id": cells[0].inner_text().strip(),
                        "uasg": cells[1].inner_text().strip(),
                        "object": cells[2].inner_text().strip(),
                        "date": cells[3].inner_text().strip(),
                        "status": cells[4].inner_text().strip(),
                        "url": ""
                    }

                    # Tenta obter o link para a licitação
                    link = cells[0].query_selector('a')
                    if link:
                        href = link.get_attribute('href')
                        if href:
                            auction_data["url"] = f"{self.BASE_URL}/{href}"

                    results.append(auction_data)

            self.logger.info(f"LICITAGRAM BOT — Encontradas {len(results)} licitações no ComprasNet")
            return results

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao buscar licitações no ComprasNet: {str(e)}")
            return []

    def get_auction_details(self, auction_id: str) -> Dict:
        """
        Obtém detalhes de uma licitação específica no ComprasNet.

        Args:
            auction_id: Identificador da licitação

        Returns:
            Dicionário com detalhes da licitação
        """
        if not self.logged_in:
            self.logger.error("LICITAGRAM BOT — É necessário estar logado para obter detalhes de licitação")
            return {}

        try:
            self.logger.info(f"LICITAGRAM BOT — Obtendo detalhes da licitação {auction_id} no ComprasNet")

            # Navega para a página de detalhes da licitação
            self.page.goto(f"{self.BASE_URL}/pregao/pregoeiro/ata/ata.asp?co_no_uasg={auction_id.split('-')[0]}&numprp={auction_id.split('-')[1]}")

            # Aguarda o carregamento da página
            self.page.wait_for_selector('body')

            # Extrai os detalhes da licitação
            details = {
                "id": auction_id,
                "title": self.page.title(),
                "items": []
            }

            # Tenta extrair informações básicas
            try:
                details["description"] = self.page.inner_text('td:has-text("Objeto:")')
                details["opening_date"] = self.page.inner_text('td:has-text("Data de Abertura:")')
                details["status"] = self.page.inner_text('td:has-text("Status:")')
            except Exception:
                self.logger.warning(f"LICITAGRAM BOT — Não foi possível extrair todas as informações básicas da licitação {auction_id}")

            # Tenta extrair itens da licitação
            try:
                item_rows = self.page.query_selector_all('table:has(th:has-text("Item")) tr:not(:first-child)')

                for row in item_rows:
                    cells = row.query_selector_all('td')
                    if len(cells) >= 4:
                        item = {
                            "item_id": cells[0].inner_text().strip(),
                            "description": cells[1].inner_text().strip(),
                            "quantity": cells[2].inner_text().strip(),
                            "unit": cells[3].inner_text().strip()
                        }

                        # Tenta obter o valor de referência, se disponível
                        if len(cells) >= 5:
                            item["reference_value"] = cells[4].inner_text().strip()

                        details["items"].append(item)
            except Exception:
                self.logger.warning(f"LICITAGRAM BOT — Não foi possível extrair itens da licitação {auction_id}")

            self.logger.info(f"LICITAGRAM BOT — Detalhes da licitação {auction_id} obtidos com sucesso")
            return details

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao obter detalhes da licitação {auction_id}: {str(e)}")
            return {"id": auction_id, "error": str(e)}

    def submit_proposal(self,
                        auction_id: str,
                        item_id: str,
                        price: float,
                        additional_data: Optional[Dict] = None) -> bool:
        """
        Submete uma proposta para um item de licitação no ComprasNet.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item
            price: Valor da proposta
            additional_data: Dados adicionais específicos do portal

        Returns:
            True se proposta enviada com sucesso, False caso contrário
        """
        if not self.logged_in:
            self.logger.error("LICITAGRAM BOT — É necessário estar logado para submeter proposta")
            return False

        try:
            self.logger.info(f"LICITAGRAM BOT — Submetendo proposta para item {item_id} da licitação {auction_id}")

            # Navega para a página de propostas da licitação
            uasg, pregao = auction_id.split('-')
            self.page.goto(f"{self.BASE_URL}/pregao/fornec/proposta.asp?prgcod={pregao}&uasg={uasg}")

            # Aguarda o carregamento da página
            self.page.wait_for_selector('body')

            # Verifica se estamos na página correta
            if "Proposta" not in self.page.title():
                self.logger.error("LICITAGRAM BOT — Não foi possível acessar a página de propostas")
                return False

            # Localiza o campo de valor para o item específico
            price_input = self.page.query_selector(f'input[name="vl_proposta_{item_id}"]')
            if not price_input:
                self.logger.error(f"LICITAGRAM BOT — Campo de proposta não encontrado para item {item_id}")
                return False

            # Preenche o valor da proposta
            price_str = f"{price:.2f}".replace('.', ',')
            price_input.fill(price_str)

            # Preenche dados adicionais se fornecidos
            if additional_data:
                for field_name, field_value in additional_data.items():
                    field_input = self.page.query_selector(f'input[name="{field_name}"]')
                    if field_input:
                        field_input.fill(str(field_value))

            # Clica no botão de enviar proposta
            self.page.click('input[type="submit"][value*="Enviar"]')

            # Aguarda confirmação
            try:
                self.page.wait_for_selector('text="Proposta enviada com sucesso"', timeout=10000)
                self.logger.info(f"LICITAGRAM BOT — Proposta enviada com sucesso para item {item_id}")
                return True
            except Exception:
                self.logger.error(f"LICITAGRAM BOT — Não foi possível confirmar envio da proposta para item {item_id}")
                return False

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao submeter proposta: {str(e)}")
            return False

    def get_current_price(self, auction_id: str, item_id: str) -> Optional[float]:
        """
        Obtém o preço atual de um item em licitação no ComprasNet.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item

        Returns:
            Preço atual ou None se não disponível
        """
        if not self.logged_in:
            self.logger.error("LICITAGRAM BOT — É necessário estar logado para obter preço atual")
            return None

        try:
            self.logger.info(f"LICITAGRAM BOT — Obtendo preço atual do item {item_id} da licitação {auction_id}")

            # Navega para a sala de disputa
            uasg, pregao = auction_id.split('-')
            self.page.goto(f"{self.BASE_URL}/pregao/fornec/salaDeFornecedor.asp?prgcod={pregao}&uasg={uasg}")

            # Aguarda carregamento
            self.page.wait_for_selector('body')

            # Tenta extrair o preço atual do item
            price_element = self.page.query_selector(f'td[id="melhorLance_{item_id}"]')
            if price_element:
                price_text = price_element.inner_text().strip()
                # Remove formatação brasileira (R$ 1.234,56 -> 1234.56)
                price_text = price_text.replace('R$', '').replace('.', '').replace(',', '.').strip()
                price = float(price_text)
                self.logger.info(f"LICITAGRAM BOT — Preço atual do item {item_id}: R$ {price:.2f}")
                return price
            else:
                self.logger.warning(f"LICITAGRAM BOT — Elemento de preço não encontrado para item {item_id}")
                return None

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao obter preço atual: {str(e)}")
            return None

    def submit_bid(self, auction_id: str, item_id: str, bid_value: float) -> bool:
        """
        Submete um lance para um item em licitação no ComprasNet.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item
            bid_value: Valor do lance

        Returns:
            True se lance enviado com sucesso, False caso contrário
        """
        if not self.logged_in:
            self.logger.error("LICITAGRAM BOT — É necessário estar logado para submeter lance")
            return False

        try:
            self.logger.info(f"LICITAGRAM BOT — Submetendo lance de R$ {bid_value:.2f} para item {item_id} da licitação {auction_id}")

            # Localiza o campo de lance
            bid_input = self.page.query_selector(f'input[name="vlLance_{item_id}"]')
            if not bid_input:
                self.logger.error(f"LICITAGRAM BOT — Campo de lance não encontrado para item {item_id}")
                return False

            # Preenche o valor do lance (formato brasileiro)
            bid_str = f"{bid_value:.2f}".replace('.', ',')
            bid_input.fill(bid_str)

            # Clica no botão de enviar lance
            self.page.click(f'input[id="btnEnviarLance_{item_id}"]')

            # Aguarda confirmação
            try:
                self.page.wait_for_selector('text="Lance enviado com sucesso"', timeout=5000)
                self.logger.info(f"LICITAGRAM BOT — Lance enviado com sucesso: R$ {bid_value:.2f}")
                return True
            except Exception:
                # Verifica se há mensagem de erro
                error_el = self.page.query_selector('.mensagemErro')
                if error_el:
                    error_msg = error_el.inner_text()
                    self.logger.error(f"LICITAGRAM BOT — Erro ao enviar lance: {error_msg}")
                else:
                    self.logger.warning("LICITAGRAM BOT — Não foi possível confirmar envio do lance")
                return False

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao submeter lance: {str(e)}")
            return False

    def get_ranking(self, auction_id: str, item_id: str) -> List[Dict]:
        """
        Obtém o ranking atual de um item em licitação no ComprasNet.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item

        Returns:
            Lista de participantes com seus lances, ordenada por classificação
        """
        if not self.logged_in:
            self.logger.error("LICITAGRAM BOT — É necessário estar logado para obter ranking")
            return []

        try:
            self.logger.info(f"LICITAGRAM BOT — Obtendo ranking do item {item_id} da licitação {auction_id}")

            # Tenta extrair a tabela de ranking
            ranking_rows = self.page.query_selector_all(f'table[id="tblRanking_{item_id}"] tr:not(:first-child)')

            ranking = []
            for row in ranking_rows:
                cells = row.query_selector_all('td')
                if len(cells) >= 3:
                    entry = {
                        "position": cells[0].inner_text().strip(),
                        "supplier": cells[1].inner_text().strip(),
                        "bid_value": cells[2].inner_text().strip()
                    }
                    ranking.append(entry)

            self.logger.info(f"LICITAGRAM BOT — Ranking obtido com {len(ranking)} participantes")
            return ranking

        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao obter ranking: {str(e)}")
            return []
