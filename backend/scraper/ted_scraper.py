"""
TenderWatch – TED Europa Scraper
Offizielle REST API v3: https://api.ted.europa.eu/v3
Docs: https://docs.ted.europa.eu/api/latest/search.html
No API key required for search.
"""

import logging
from datetime import datetime, timedelta

from .base import BaseScraper, Tender

logger = logging.getLogger(__name__)

# CPV-Codes für Ingenieurdienstleistungen
ENGINEERING_CPV = "71000000"  # Hauptgruppe: deckt alle 71xxx ab


class TEDScraper(BaseScraper):
    PLATFORM_NAME = "TED Europa"
    API_BASE = "https://api.ted.europa.eu/v3"
    SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search"

    # Felder die wir von der API abfragen
    RESULT_FIELDS = [
        "publication-number",
        "notice-title",
        "buyer-name",
        "publication-date",
        "classification-cpv",
        "deadline-receipt-tender-date-lot",
        "description-lot",
    ]

    def __init__(self, config: dict | None = None):
        super().__init__(config)

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("ted", {}).get("enabled", True):
            return []

        logger.info("[TED] Starte Suche...")
        tenders = []

        # Query: Deutsche Auftraggeber, Ingenieur-CPV, letzte 14 Tage
        days_back = self.config.get("platforms", {}).get("ted", {}).get("days_back", 14)
        countries = self.config.get("platforms", {}).get("ted", {}).get(
            "countries", ["DEU", "AUT"]
        )

        for country in countries:
            results = self._search_country(country, days_back)
            tenders.extend(results)

        # Deduplizieren
        seen = set()
        unique = []
        for t in tenders:
            if t.id not in seen:
                seen.add(t.id)
                unique.append(t)

        logger.info(f"[TED] {len(unique)} Ausschreibungen gefunden.")
        return unique

    def _search_country(self, country: str, days_back: int) -> list[Tender]:
        """Sucht Ausschreibungen für ein Land."""
        query = (
            f"notice-type = cn-standard "
            f"AND organisation-country-buyer = {country} "
            f"AND classification-cpv = {ENGINEERING_CPV} "
            f"AND publication-date >= today(-{days_back})"
        )

        payload = {
            "query": query,
            "fields": self.RESULT_FIELDS,
            "limit": 100,
            "page": 1,
        }

        logger.info(f"[TED] Suche: {country}, CPV {ENGINEERING_CPV}, letzte {days_back} Tage")
        resp = self.post(self.SEARCH_URL, json=payload)
        if not resp:
            return []

        try:
            data = resp.json()
        except Exception as e:
            logger.error(f"[TED] JSON-Parse-Fehler: {e}")
            return []

        notices = data.get("notices", [])
        total = data.get("totalNoticeCount", 0)
        logger.info(f"[TED] {country}: {len(notices)} von {total} geladen")

        tenders = []
        for notice in notices:
            try:
                t = self._parse_notice(notice)
                if t:
                    tenders.append(t)
            except Exception as e:
                logger.warning(f"[TED] Fehler beim Parsen: {e}")

        # Weitere Seiten laden (max 3 Seiten = 300 Ergebnisse)
        page = 2
        while len(notices) >= 100 and page <= 3:
            payload["page"] = page
            resp = self.post(self.SEARCH_URL, json=payload)
            if not resp:
                break
            try:
                data = resp.json()
                notices = data.get("notices", [])
                for notice in notices:
                    try:
                        t = self._parse_notice(notice)
                        if t:
                            tenders.append(t)
                    except Exception:
                        pass
                page += 1
            except Exception:
                break

        return tenders

    def _parse_notice(self, notice: dict) -> Tender | None:
        pub_number = notice.get("publication-number", "")
        if not pub_number:
            return None

        # Titel: deutsch bevorzugen
        title = self._get_text(notice.get("notice-title", {}))
        if not title:
            return None

        # Auftraggeber
        client = self._get_text(notice.get("buyer-name", {}))

        # Beschreibung
        description = self._get_text(notice.get("description-lot", {}))

        # CPV-Codes
        cpv_list = notice.get("classification-cpv", [])
        if isinstance(cpv_list, str):
            cpv_list = [cpv_list]

        # Veröffentlichungsdatum
        pub_date_raw = notice.get("publication-date", "")
        pub_date = self.parse_date(pub_date_raw)

        # Frist
        deadlines = notice.get("deadline-receipt-tender-date-lot", [])
        deadline = ""
        if deadlines and isinstance(deadlines, list):
            # Nimm die späteste Frist (bei mehreren Losen)
            valid = [d for d in deadlines if d and d != "-"]
            if valid:
                deadline = self.parse_date(valid[0])

        # Links aus der API-Antwort
        links = notice.get("links", {})
        html_links = links.get("html", {})
        pdf_links = links.get("pdf", {})

        detail_url = (
            html_links.get("DEU")
            or html_links.get("ENG")
            or next(iter(html_links.values()), "")
            if html_links else f"https://ted.europa.eu/de/notice/-/detail/{pub_number}"
        )
        pdf_url = (
            pdf_links.get("DEU")
            or pdf_links.get("ENG")
            or next(iter(pdf_links.values()), "")
            if pdf_links else ""
        )

        return Tender(
            id=f"TED_{pub_number}",
            platform=self.PLATFORM_NAME,
            title=self.clean_text(title),
            client=self.clean_text(client),
            description=self.clean_text(description)[:3000],
            publication_date=pub_date,
            deadline=deadline,
            detail_url=detail_url,
            pdf_url=pdf_url,
            country="DE",
            cpv_codes=cpv_list,
        )

    @staticmethod
    def _get_text(obj) -> str:
        """Extrahiert Text, bevorzugt Deutsch."""
        if not obj:
            return ""
        if isinstance(obj, str):
            return obj
        if isinstance(obj, dict):
            # Deutsch bevorzugen
            for key in ["deu", "DEU", "ger", "GER"]:
                val = obj.get(key)
                if val:
                    if isinstance(val, list):
                        return val[0] if val else ""
                    return str(val)
            # Englisch als Fallback
            for key in ["eng", "ENG"]:
                val = obj.get(key)
                if val:
                    if isinstance(val, list):
                        return val[0] if val else ""
                    return str(val)
            # Irgendeine Sprache
            for val in obj.values():
                if isinstance(val, list) and val:
                    return val[0]
                if isinstance(val, str) and val:
                    return val
        if isinstance(obj, list):
            return obj[0] if obj else ""
        return str(obj)
