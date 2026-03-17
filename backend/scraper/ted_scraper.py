"""
TenderWatch – TED Europa Scraper
Offizielle REST API v3: https://api.ted.europa.eu/v3
Docs: https://docs.ted.europa.eu/api/latest/search.html
No API key required for search.
"""

import logging

from .base import BaseScraper, Tender

logger = logging.getLogger(__name__)

# CPV-Codes aus dem Suchprofil
PRIMARY_CPV = [
    "71540000",  # Construction management services
    "71521000",  # Construction supervision services
    "79421000",  # Project management services
    "71311300",  # Infrastructure consultancy
    "79411000",  # Management consulting
]

SECONDARY_CPV = [
    "71300000",  # Engineering services
    "71530000",  # Construction consultancy services
    "79000000",  # Business services
    "71541000",  # Bauverwaltungsdienstleistungen
    "71520000",  # Bauaufsicht
]


class TEDScraper(BaseScraper):
    PLATFORM_NAME = "TED Europa"
    SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search"

    RESULT_FIELDS = [
        "publication-number",
        "notice-title",
        "buyer-name",
        "buyer-country",
        "publication-date",
        "classification-cpv",
        "deadline-receipt-tender-date-lot",
        "description-lot",
        "estimated-value-lot",
    ]

    def __init__(self, config: dict | None = None):
        super().__init__(config)

    def fetch(self, keywords: list[str] | None = None) -> list[Tender]:
        """
        Zweistufige Suche:
        1. Nach spezifischen Auftraggebern (TSOs etc.) — breit
        2. Nach Keywords + CPV-Codes — gezielt
        """
        if not keywords:
            keywords = self.config.get("keywords", [])

        days_back = self.config.get("days_back", 30)
        buyers = self.config.get("buyers", [])

        all_tenders = []

        # Strategie 1: Suche nach Auftraggebern (z.B. TenneT, Amprion)
        if buyers:
            results = self._search_by_buyers(buyers, days_back)
            all_tenders.extend(results)
            logger.info(f"[TED] Auftraggeber-Suche: {len(results)} Ergebnisse")

        # Strategie 2: Suche nach Keywords in Titel/Beschreibung
        if keywords:
            for kw in keywords[:8]:
                results = self._search_keyword(kw, days_back)
                all_tenders.extend(results)

        # Strategie 3: Suche nach primären CPV-Codes
        cpv_results = self._search_by_cpv(PRIMARY_CPV, days_back)
        all_tenders.extend(cpv_results)
        logger.info(f"[TED] CPV-Suche: {len(cpv_results)} Ergebnisse")

        # Deduplizieren
        seen = set()
        unique = []
        for t in all_tenders:
            if t.id not in seen:
                seen.add(t.id)
                unique.append(t)

        logger.info(f"[TED] Gesamt: {len(unique)} eindeutige Ausschreibungen")
        return unique

    def _search_by_buyers(self, buyers: list[str], days_back: int) -> list[Tender]:
        """Suche nach bestimmten Auftraggebern."""
        buyer_clauses = " OR ".join(f'buyer-name ~ "{b}"' for b in buyers)
        query = (
            f'notice-type = cn-standard '
            f'AND publication-date >= today(-{days_back}) '
            f'AND ({buyer_clauses})'
        )
        return self._execute_search(query, f"Auftraggeber: {', '.join(buyers[:3])}")

    def _search_keyword(self, keyword: str, days_back: int) -> list[Tender]:
        """Suche nach einem Keyword in DE/AT Ausschreibungen."""
        query = (
            f'notice-type = cn-standard '
            f'AND organisation-country-buyer IN (DEU, AUT) '
            f'AND publication-date >= today(-{days_back}) '
            f'AND (notice-title ~ "{keyword}" OR description-lot ~ "{keyword}")'
        )
        return self._execute_search(query, f"Keyword: {keyword}")

    def _search_by_cpv(self, cpv_codes: list[str], days_back: int) -> list[Tender]:
        """Suche nach CPV-Codes in DE/AT."""
        cpv_str = ", ".join(cpv_codes)
        query = (
            f'notice-type = cn-standard '
            f'AND organisation-country-buyer IN (DEU, AUT) '
            f'AND publication-date >= today(-{days_back}) '
            f'AND classification-cpv IN ({cpv_str})'
        )
        return self._execute_search(query, f"CPV: {cpv_str[:40]}")

    def _execute_search(self, query: str, label: str) -> list[Tender]:
        """Führt eine TED-Suche aus und gibt Tender-Objekte zurück."""
        payload = {
            "query": query,
            "fields": self.RESULT_FIELDS,
            "limit": 50,
            "page": 1,
        }

        logger.info(f"[TED] {label}")
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
        logger.info(f"[TED] {label}: {len(notices)} von {total} Ergebnissen")

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

        # Estimated value
        est_values = notice.get("estimated-value-lot", [])
        estimated_value = ""
        if est_values and isinstance(est_values, list):
            valid = [v for v in est_values if v and v != "-"]
            if valid:
                estimated_value = str(valid[0])

        # Links
        detail_url = f"https://ted.europa.eu/de/notice/-/detail/{pub_number}"
        pdf_url = ""

        links = notice.get("links", {})
        if links:
            html_links = links.get("html", {})
            pdf_links = links.get("pdf", {})
            if html_links:
                detail_url = (
                    html_links.get("DEU")
                    or html_links.get("ENG")
                    or next(iter(html_links.values()), detail_url)
                )
            if pdf_links:
                pdf_url = (
                    pdf_links.get("DEU")
                    or pdf_links.get("ENG")
                    or next(iter(pdf_links.values()), "")
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
