"""
LICITAGRAM BOT — Classe base abstrata para integração com portais de licitação.

Este módulo define a interface comum que todos os portais de licitação
devem implementar para funcionar com o LICITAGRAM BOT.
"""

import json
import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from datetime import datetime

from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

from ..logger import LicitagramBotLogger


class PortalBase(ABC):
    """
    Classe base abstrata para portais de licitação do LICITAGRAM BOT.

    Define a interface comum para todas as implementações de portais
    de licitação suportados pelo sistema.
    """

    def __init__(self, headless: bool = True, logger: Optional[LicitagramBotLogger] = None):
        """
        Inicializa o portal base do LICITAGRAM BOT.

        Args:
            headless: Se True, executa o navegador em modo headless (sem interface gráfica)
            logger: Instância do logger para registrar eventos
        """
        self.headless = headless
        self.logger = logger or LicitagramBotLogger()
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.logged_in: bool = False
        self.session_data: Optional[Dict] = None

    # -------------------------------------------------------------------------
    # Abstract methods — must be implemented by each portal
    # -------------------------------------------------------------------------

    @abstractmethod
    def login(self, username: str, password: str) -> bool:
        """
        Realiza login no portal de licitações.

        Args:
            username: Identificador do usuário (CPF, CNPJ, etc.)
            password: Senha de acesso

        Returns:
            True se login bem-sucedido, False caso contrário
        """
        ...

    @abstractmethod
    def search_auctions(self,
                        keywords: Optional[List[str]] = None,
                        start_date: Optional[datetime] = None,
                        end_date: Optional[datetime] = None,
                        auction_type: Optional[str] = None) -> List[Dict]:
        """
        Busca licitações no portal.

        Args:
            keywords: Lista de palavras-chave para busca
            start_date: Data de início para filtro
            end_date: Data de fim para filtro
            auction_type: Tipo de licitação

        Returns:
            Lista de licitações encontradas
        """
        ...

    @abstractmethod
    def get_auction_details(self, auction_id: str) -> Dict:
        """
        Obtém detalhes de uma licitação específica.

        Args:
            auction_id: Identificador da licitação

        Returns:
            Dicionário com detalhes da licitação
        """
        ...

    @abstractmethod
    def submit_proposal(self,
                        auction_id: str,
                        item_id: str,
                        price: float,
                        additional_data: Optional[Dict] = None) -> bool:
        """
        Submete uma proposta para um item de licitação.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item
            price: Valor da proposta
            additional_data: Dados adicionais específicos do portal

        Returns:
            True se proposta enviada com sucesso, False caso contrário
        """
        ...

    @abstractmethod
    def get_current_price(self, auction_id: str, item_id: str) -> Optional[float]:
        """
        Obtém o preço atual de um item em licitação.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item

        Returns:
            Preço atual ou None se não disponível
        """
        ...

    @abstractmethod
    def submit_bid(self, auction_id: str, item_id: str, bid_value: float) -> bool:
        """
        Submete um lance para um item em licitação.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item
            bid_value: Valor do lance

        Returns:
            True se lance enviado com sucesso, False caso contrário
        """
        ...

    @abstractmethod
    def get_ranking(self, auction_id: str, item_id: str) -> List[Dict]:
        """
        Obtém o ranking atual de um item em licitação.

        Args:
            auction_id: Identificador da licitação
            item_id: Identificador do item

        Returns:
            Lista de participantes com seus lances, ordenada por classificação
        """
        ...

    # -------------------------------------------------------------------------
    # Session management
    # -------------------------------------------------------------------------

    def save_session(self, filepath: str) -> bool:
        """
        Salva os dados da sessão atual em um arquivo JSON.

        Args:
            filepath: Caminho para salvar o arquivo de sessão

        Returns:
            True se salvo com sucesso, False caso contrário
        """
        if self.session_data is None:
            self.logger.warning("LICITAGRAM BOT — Nenhum dado de sessão para salvar")
            return False

        try:
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w') as f:
                json.dump(self.session_data, f, indent=2, default=str)
            self.logger.info(f"LICITAGRAM BOT — Sessão salva em {filepath}")
            return True
        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao salvar sessão: {str(e)}")
            return False

    def load_session(self, filepath: str) -> bool:
        """
        Carrega dados de sessão de um arquivo JSON.

        Args:
            filepath: Caminho do arquivo de sessão

        Returns:
            True se carregado com sucesso, False caso contrário
        """
        if not os.path.exists(filepath):
            self.logger.warning(f"LICITAGRAM BOT — Arquivo de sessão não encontrado: {filepath}")
            return False

        try:
            with open(filepath, 'r') as f:
                self.session_data = json.load(f)

            # Restaura cookies no contexto do navegador se disponível
            if self.context and 'cookies' in self.session_data:
                self.context.add_cookies(self.session_data['cookies'])
                self.logged_in = True

            self.logger.info(f"LICITAGRAM BOT — Sessão carregada de {filepath}")
            return True
        except Exception as e:
            self.logger.error(f"LICITAGRAM BOT — Erro ao carregar sessão: {str(e)}")
            return False

    # -------------------------------------------------------------------------
    # Browser lifecycle
    # -------------------------------------------------------------------------

    def _initialize_browser(self) -> None:
        """
        Inicializa o navegador Playwright para o LICITAGRAM BOT.
        """
        if self.browser is None:
            self.logger.info("LICITAGRAM BOT — Inicializando navegador")
            playwright = sync_playwright().start()
            self.browser = playwright.chromium.launch(headless=self.headless)
            self.context = self.browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
            )
            self.page = self.context.new_page()

    def _close_browser(self) -> None:
        """
        Fecha o navegador Playwright do LICITAGRAM BOT.
        """
        if self.browser:
            self.logger.info("LICITAGRAM BOT — Fechando navegador")
            self.context.close()
            self.browser.close()
            self.browser = None
            self.context = None
            self.page = None
