"""
TenderWatch – Deutsche Plattformen Scraper
Abdeckt: evergabe-online.de, evergabe.de, service.bund.de,
         dtvp.de, subreport-elvis.de, vergabe24.de,
         deutsches-ausschreibungsblatt.de
"""

import logging
import re
import hashlib
from datetime import datetime, timedelta
from bs4 import BeautifulSoup

from .base import BaseScraper, Tender

logger = logging.getLogger(__name__)


class EvergabeOnlineScraper(BaseScraper):
    PLATFORM_NAME = "evergabe-online.de"
    BASE_URL = "https://www.evergabe-online.de"

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("evergabe_online", {}).get("enabled", True):
            return []
        logger.info("[evergabe-online] Starte Suche...")
        return self._search_rss_or_html()

    def _search_rss_or_html(self) -> list[Tender]:
        tenders = []
        keywords = self._get_keywords()

        for kw in keywords[:5]:  # Wichtigste Keywords
            url = f"{self.BASE_URL}/tenders/public?keyword={kw}&cpvCodes=71000000,71300000,71500000"
            resp = self.get(url)
            if not resp:
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
            tenders.extend(self._parse_table(soup, kw))

        return self._dedupe(tenders)

    def _parse_table(self, soup: BeautifulSoup, keyword: str) -> list[Tender]:
        tenders = []
        rows = soup.find_all("tr", class_=re.compile(r"tender|result|row", re.I))
        if not rows:
            rows = soup.find_all("div", class_=re.compile(r"tender|result|notice", re.I))

        for row in rows[:20]:
            try:
                link = row.find("a", href=True)
                if not link:
                    continue

                title = self.clean_text(link.get_text())
                href = link["href"]
                if not href.startswith("http"):
                    href = self.BASE_URL + href

                cells = row.find_all(["td", "div"])
                client = self.clean_text(cells[1].get_text()) if len(cells) > 1 else ""
                date = self.clean_text(cells[-1].get_text()) if cells else ""

                tid = hashlib.md5(href.encode()).hexdigest()

                tenders.append(Tender(
                    id=f"EVERGABE_{tid}",
                    platform=self.PLATFORM_NAME,
                    title=title,
                    client=client,
                    detail_url=href,
                    publication_date=self.parse_date(date),
                ))
            except Exception as e:
                logger.debug(f"[{self.PLATFORM_NAME}] Parse-Fehler: {e}")

        return tenders

    def _get_keywords(self) -> list[str]:
        from database.models import get_connection
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT word FROM keywords WHERE active=1 AND priority='primary' ORDER BY id")
        words = [r[0] for r in cur.fetchall()]
        conn.close()
        return words or ["Bauüberwachung", "Bauoberleitung", "Vertragsmanagement"]

    def _dedupe(self, tenders: list) -> list:
        seen = set()
        unique = []
        for t in tenders:
            if t.id not in seen:
                seen.add(t.id)
                unique.append(t)
        return unique


class ServiceBundScraper(BaseScraper):
    """
    service.bund.de – Zentrales Ausschreibungsportal des Bundes.
    Bietet RSS-Feeds nach Kategorien.
    """
    PLATFORM_NAME = "service.bund.de"
    BASE_URL = "https://www.service.bund.de"
    RSS_URLS = [
        "https://www.service.bund.de/IMPORTE/Ausschreibungen/Auftragsbekanntmachungen/rssfeed.feed",
    ]

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("service_bund", {}).get("enabled", True):
            return []
        logger.info("[service.bund.de] Lese RSS-Feed...")
        tenders = []
        for rss_url in self.RSS_URLS:
            tenders.extend(self._parse_rss(rss_url))
        logger.info(f"[service.bund.de] {len(tenders)} Einträge gelesen.")
        return tenders

    def _parse_rss(self, url: str) -> list[Tender]:
        import xml.etree.ElementTree as ET
        resp = self.get(url)
        if not resp:
            return []

        tenders = []
        try:
            root = ET.fromstring(resp.content)
            ns = {"atom": "http://www.w3.org/2005/Atom"}

            # Versuche Atom und RSS Format
            items = root.findall(".//item") or root.findall(".//atom:entry", ns)

            for item in items[:50]:
                title_el = item.find("title") or item.find("atom:title", ns)
                link_el = item.find("link") or item.find("atom:link", ns)
                desc_el = item.find("description") or item.find("atom:summary", ns)
                date_el = item.find("pubDate") or item.find("atom:published", ns)

                title = self.clean_text(title_el.text if title_el is not None else "")
                link = (link_el.text or link_el.get("href", "")) if link_el is not None else ""
                desc = self.clean_text(desc_el.text if desc_el is not None else "")
                pub_date = self.parse_date(date_el.text if date_el is not None else "")

                if not title or not link:
                    continue

                tid = hashlib.md5(link.encode()).hexdigest()

                tenders.append(Tender(
                    id=f"SBUND_{tid}",
                    platform=self.PLATFORM_NAME,
                    title=title,
                    description=desc,
                    detail_url=link,
                    publication_date=pub_date,
                    country="DE",
                ))
        except ET.ParseError as e:
            logger.error(f"[service.bund.de] XML-Parse-Fehler: {e}")

        return tenders


class DTVPScraper(BaseScraper):
    """dtvp.de (Cosinex) – nutzt öffentliche Suchseite."""
    PLATFORM_NAME = "dtvp.de"
    BASE_URL = "https://www.dtvp.de"
    SEARCH_URL = "https://www.dtvp.de/vergabestellen/ausschreibungen"

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("dtvp", {}).get("enabled", True):
            return []
        logger.info("[dtvp.de] Starte Suche...")
        return self._search("Ingenieur")

    def _search(self, query: str) -> list[Tender]:
        resp = self.get(f"{self.SEARCH_URL}?q={query}")
        if not resp:
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        tenders = []

        # DTVP-spezifische Selektoren
        for item in soup.select(".tender-item, .notice-item, tr.result")[:25]:
            try:
                link = item.find("a", href=True)
                if not link:
                    continue
                title = self.clean_text(link.get_text())
                href = link["href"]
                if not href.startswith("http"):
                    href = self.BASE_URL + href

                client_el = item.find(class_=re.compile(r"client|vergabestelle|authority"))
                client = self.clean_text(client_el.get_text()) if client_el else ""

                date_el = item.find(class_=re.compile(r"date|datum"))
                pub_date = self.parse_date(date_el.get_text()) if date_el else ""

                tid = hashlib.md5(href.encode()).hexdigest()
                tenders.append(Tender(
                    id=f"DTVP_{tid}",
                    platform=self.PLATFORM_NAME,
                    title=title,
                    client=client,
                    detail_url=href,
                    publication_date=pub_date,
                    country="DE",
                ))
            except Exception as e:
                logger.debug(f"[dtvp.de] Parse-Fehler: {e}")

        logger.info(f"[dtvp.de] {len(tenders)} Ausschreibungen gefunden.")
        return tenders


class SubreportScraper(BaseScraper):
    """subreport-elvis.de – Suche über öffentliche URL."""
    PLATFORM_NAME = "subreport-elvis.de"
    BASE_URL = "https://www.subreport-elvis.de"

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("subreport", {}).get("enabled", True):
            return []
        logger.info("[subreport] Starte Suche...")
        tenders = []
        for term in ["Bauüberwachung", "Bauoberleitung", "Ingenieurleistung"]:
            resp = self.get(f"{self.BASE_URL}/E.html?search_string={term}&qs=1")
            if not resp:
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
            for row in soup.find_all("tr", class_=re.compile(r"data|tender|result"))[:10]:
                cells = row.find_all("td")
                if len(cells) < 3:
                    continue
                link = row.find("a", href=True)
                if not link:
                    continue
                href = link["href"]
                if not href.startswith("http"):
                    href = self.BASE_URL + href
                title = self.clean_text(cells[0].get_text())
                client = self.clean_text(cells[1].get_text()) if len(cells) > 1 else ""
                tid = hashlib.md5(href.encode()).hexdigest()
                tenders.append(Tender(
                    id=f"SUBREPORT_{tid}",
                    platform=self.PLATFORM_NAME,
                    title=title,
                    client=client,
                    detail_url=href,
                    country="DE",
                ))
        logger.info(f"[subreport] {len(tenders)} Ausschreibungen gefunden.")
        return tenders


class Vergabe24Scraper(BaseScraper):
    """vergabe24.de – öffentliche Suche."""
    PLATFORM_NAME = "vergabe24.de"
    BASE_URL = "https://www.vergabe24.de"

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("vergabe24", {}).get("enabled", True):
            return []
        logger.info("[vergabe24] Starte Suche...")
        resp = self.get(f"{self.BASE_URL}/ausschreibungen?q=Ingenieur&leistungsart=Dienstleistung")
        if not resp:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        tenders = []
        for item in soup.select(".tender, .notice, .result-item")[:20]:
            link = item.find("a", href=True)
            if not link:
                continue
            title = self.clean_text(link.get_text())
            href = link["href"]
            if not href.startswith("http"):
                href = self.BASE_URL + href
            client_el = item.find(class_=re.compile(r"client|vergabestelle"))
            client = self.clean_text(client_el.get_text()) if client_el else ""
            tid = hashlib.md5(href.encode()).hexdigest()
            tenders.append(Tender(
                id=f"V24_{tid}",
                platform=self.PLATFORM_NAME,
                title=title,
                client=client,
                detail_url=href,
                country="DE",
            ))
        logger.info(f"[vergabe24] {len(tenders)} Ausschreibungen gefunden.")
        return tenders
