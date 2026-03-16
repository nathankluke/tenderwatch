"""
TenderWatch – Mercell Scraper
Plattform: https://s2c.mercell.com
Nutzt Login-Session für Zugriff auf Ausschreibungen.
"""

import os
import logging
import re
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

from .base import BaseScraper, Tender

logger = logging.getLogger(__name__)


class MercellScraper(BaseScraper):
    PLATFORM_NAME = "Mercell"
    BASE_URL = "https://s2c.mercell.com"
    LOGIN_URL = "https://s2c.mercell.com/login"
    SEARCH_URL = "https://s2c.mercell.com/api/notices/search"

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.email = os.getenv("MERCELL_EMAIL", "")
        self.password = os.getenv("MERCELL_PASSWORD", "")
        self._logged_in = False

    def _login(self) -> bool:
        """Meldet sich bei Mercell an und speichert die Session."""
        if not self.email or not self.password:
            logger.error("[Mercell] Keine Login-Daten in .env konfiguriert.")
            return False

        # Zuerst Login-Seite holen (CSRF-Token)
        resp = self.get(self.LOGIN_URL)
        if not resp:
            return False

        soup = BeautifulSoup(resp.text, "html.parser")
        csrf_token = ""
        csrf_input = soup.find("input", {"name": "__RequestVerificationToken"})
        if csrf_input:
            csrf_token = csrf_input.get("value", "")

        # Login POST
        login_data = {
            "Email": self.email,
            "Password": self.password,
            "__RequestVerificationToken": csrf_token,
            "RememberMe": "false",
        }

        resp = self.post(self.LOGIN_URL, data=login_data, allow_redirects=True)
        if not resp:
            return False

        # Prüfen ob Login erfolgreich (keine Login-Seite mehr)
        if "logout" in resp.text.lower() or resp.url != self.LOGIN_URL:
            self._logged_in = True
            logger.info("[Mercell] Login erfolgreich.")
            return True
        else:
            logger.error("[Mercell] Login fehlgeschlagen – Zugangsdaten prüfen.")
            return False

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("mercell", {}).get("enabled", True):
            return []

        if not self._login():
            return []

        logger.info("[Mercell] Starte Suche...")
        tenders = []

        # Verschiedene Suchbegriffe durchgehen
        search_terms = [
            "Bauüberwachung", "Bauoberleitung", "Vertragsmanagement",
            "Nachtragsmanagement", "Claim Management", "Contract Management",
            "Ingenieur", "Projektsteuerung"
        ]

        seen_ids = set()
        for term in search_terms:
            results = self._search(term)
            for t in results:
                if t.id not in seen_ids:
                    seen_ids.add(t.id)
                    tenders.append(t)

        logger.info(f"[Mercell] {len(tenders)} Ausschreibungen gefunden.")
        return tenders

    def _search(self, query: str) -> list[Tender]:
        """Sucht nach einem Begriff über die Mercell-API."""
        date_from = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")

        # Mercell nutzt eine JSON-API für die Suche
        payload = {
            "query": query,
            "page": 1,
            "pageSize": 25,
            "publishedFrom": date_from,
            "countries": ["DE", "AT"],
            "noticeTypes": ["contract_notice", "prior_information_notice"],
            "sortBy": "publishedDate",
            "sortOrder": "desc",
        }

        resp = self.post(self.SEARCH_URL, json=payload)
        if not resp:
            # Fallback: Öffentliche Suchseite scrapen
            return self._scrape_search_page(query)

        try:
            data = resp.json()
            notices = data.get("notices", data.get("items", data.get("results", [])))
            return [self._parse_notice(n) for n in notices if n]
        except Exception as e:
            logger.warning(f"[Mercell] API-Antwort konnte nicht verarbeitet werden: {e}")
            return self._scrape_search_page(query)

    def _scrape_search_page(self, query: str) -> list[Tender]:
        """Fallback: HTML-Suche scrapen."""
        search_url = f"{self.BASE_URL}/today?q={query}"
        resp = self.get(search_url)
        if not resp:
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        tenders = []

        # Ausschreibungskarten finden (Struktur kann sich ändern)
        cards = soup.find_all("article", class_=re.compile(r"notice|tender|card", re.I))
        if not cards:
            cards = soup.find_all("div", class_=re.compile(r"notice|tender|result", re.I))

        for card in cards[:20]:
            try:
                t = self._parse_card(card)
                if t:
                    tenders.append(t)
            except Exception as e:
                logger.debug(f"[Mercell] Card-Parse-Fehler: {e}")

        return tenders

    def _parse_notice(self, notice: dict) -> Tender | None:
        """Parst ein Notice-Objekt aus der JSON-API."""
        notice_id = str(notice.get("id", notice.get("noticeId", "")))
        if not notice_id:
            return None

        title = notice.get("title", notice.get("name", ""))
        client = (
            notice.get("buyerName", "")
            or notice.get("contracting_authority", "")
            or notice.get("buyer", {}).get("name", "") if isinstance(notice.get("buyer"), dict) else ""
        )
        deadline_raw = notice.get("submissionDeadline", notice.get("deadline", ""))
        pub_date_raw = notice.get("publishedDate", notice.get("publicationDate", ""))

        detail_url = f"{self.BASE_URL}/notice/{notice_id}"
        pdf_url = notice.get("documentUrl", notice.get("pdfUrl", ""))

        return Tender(
            id=f"MERCELL_{notice_id}",
            platform=self.PLATFORM_NAME,
            title=self.clean_text(title),
            client=self.clean_text(client),
            description=self.clean_text(notice.get("description", ""))[:3000],
            publication_date=self.parse_date(pub_date_raw),
            deadline=self.parse_date(deadline_raw),
            detail_url=detail_url,
            pdf_url=pdf_url,
            country=notice.get("country", "DE"),
        )

    def _parse_card(self, card) -> Tender | None:
        """Parst eine HTML-Karte von der Suchergebnisseite."""
        link = card.find("a", href=True)
        title_el = card.find(["h2", "h3", "h4"], class_=re.compile(r"title|name", re.I))

        if not link or not title_el:
            return None

        title = self.clean_text(title_el.get_text())
        href = link["href"]
        if not href.startswith("http"):
            href = self.BASE_URL + href

        notice_id = re.search(r'/notice/(\d+)', href)
        tid = f"MERCELL_{notice_id.group(1)}" if notice_id else f"MERCELL_{hash(href)}"

        client_el = card.find(class_=re.compile(r"buyer|client|authority", re.I))
        client = self.clean_text(client_el.get_text()) if client_el else ""

        date_el = card.find(class_=re.compile(r"date|published", re.I))
        pub_date = self.parse_date(date_el.get_text()) if date_el else ""

        return Tender(
            id=tid,
            platform=self.PLATFORM_NAME,
            title=title,
            client=client,
            detail_url=href,
            publication_date=pub_date,
        )
