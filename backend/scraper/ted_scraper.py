"""
TenderWatch – TED Europa Scraper
Offizielle REST API v3: https://api.ted.europa.eu/v3
Docs: https://docs.ted.europa.eu/api/latest/search.html
No API key required for search.
"""

import logging

from .base import BaseScraper, Tender

logger = logging.getLogger(__name__)


class TEDScraper(BaseScraper):
    PLATFORM_NAME = "TED Europa"
    SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search"

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

    def fetch(self, keywords: list[str] | None = None) -> list[Tender]:
        """
        Sucht TED-Ausschreibungen basierend auf Keywords.
        Ohne Keywords werden nur CPV 71xxx (Ingenieur) in DE gesucht.
        Mit Keywords wird gezielt nach diesen Begriffen gesucht.
        """
        if not keywords:
            keywords = self.config.get("keywords", [])

        if not keywords:
            logger.warning("[TED] Keine Keywords konfiguriert, überspringe.")
            return []

        logger.info(f"[TED] Suche mit {len(keywords)} Keywords: {keywords[:5]}...")
        all_tenders = []

        # Suche pro Keyword (max 5 um API nicht zu überlasten)
        for kw in keywords[:5]:
            results = self._search_keyword(kw)
            all_tenders.extend(results)

        # Deduplizieren
        seen = set()
        unique = []
        for t in all_tenders:
            if t.id not in seen:
                seen.add(t.id)
                unique.append(t)

        logger.info(f"[TED] {len(unique)} Ausschreibungen gefunden.")
        return unique

    def _search_keyword(self, keyword: str) -> list[Tender]:
        """Sucht nach einem Keyword in deutschen Ausschreibungen."""
        # Suche in Titel und Beschreibung, nur Deutschland + Österreich,
        # nur Vergabebekanntmachungen (cn-standard), letzte 14 Tage
        days_back = self.config.get("days_back", 14)

        query = (
            f'notice-type = cn-standard '
            f'AND organisation-country-buyer IN (DEU, AUT) '
            f'AND publication-date >= today(-{days_back}) '
            f'AND (notice-title ~ "{keyword}" OR description-lot ~ "{keyword}")'
        )

        payload = {
            "query": query,
            "fields": self.RESULT_FIELDS,
            "limit": 20,
            "page": 1,
        }

        logger.info(f"[TED] Suche: '{keyword}'")
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
        logger.info(f"[TED] '{keyword}': {len(notices)} von {total} Ergebnissen")

        tenders = []
        for notice in notices:
            try:
                t = self._parse_notice(notice)
                if t:
                    tenders.append(t)
            except Exception as e:
                logger.warning(f"[TED] Fehler beim Parsen: {e}")

        return tenders

    def _parse_notice(self, notice: dict) -> Tender | None:
        pub_number = notice.get("publication-number", "")
        if not pub_number:
            return None

        title = self._get_text(notice.get("notice-title", {}))
        if not title:
            return None

        client = self._get_text(notice.get("buyer-name", {}))
        description = self._get_text(notice.get("description-lot", {}))

        cpv_list = notice.get("classification-cpv", [])
        if isinstance(cpv_list, str):
            cpv_list = [cpv_list]

        pub_date = self.parse_date(notice.get("publication-date", ""))

        deadlines = notice.get("deadline-receipt-tender-date-lot", [])
        deadline = ""
        if deadlines and isinstance(deadlines, list):
            valid = [d for d in deadlines if d and d != "-"]
            if valid:
                deadline = self.parse_date(valid[0])

        # Links
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
            for key in ["deu", "DEU", "ger", "GER"]:
                val = obj.get(key)
                if val:
                    return val[0] if isinstance(val, list) and val else str(val)
            for key in ["eng", "ENG"]:
                val = obj.get(key)
                if val:
                    return val[0] if isinstance(val, list) and val else str(val)
            for val in obj.values():
                if isinstance(val, list) and val:
                    return val[0]
                if isinstance(val, str) and val:
                    return val
        if isinstance(obj, list):
            return obj[0] if obj else ""
        return str(obj)
