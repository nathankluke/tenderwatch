"""
TenderWatch – TED Europa Scraper
Offizielle REST API v3: https://api.ted.europa.eu/v3
API-Key kostenlos unter: https://api.ted.europa.eu/swagger-ui/index.html
"""

import os
import logging
from datetime import datetime, timedelta

from .base import BaseScraper, Tender

logger = logging.getLogger(__name__)

# CPV-Codes für Ingenieurdienstleistungen (relevant für unseren Anwendungsfall)
ENGINEERING_CPV = [
    "71000000",  # Architektur-, Bau-, Ingenieur- und Inspektionsdienstleistungen
    "71300000",  # Dienstleistungen von Ingenieurbüros
    "71310000",  # Beratung im Bereich Ingenieurwesen und Bauwesen
    "71311000",  # Beratungsleistungen im Bereich Bauingenieurwesen
    "71315000",  # Gebäudetechnik
    "71400000",  # Stadt- und Raumplanung sowie Landschaftsgestaltung
    "71500000",  # Dienstleistungen im Bauwesen
    "71520000",  # Bauaufsicht
    "71521000",  # Baustellenaufsichtsdienste
    "71530000",  # Beratende Dienstleistungen im Bauwesen
    "71540000",  # Bauverwaltungsdienstleistungen
    "71541000",  # Projektmanagement im Bauwesen
    "71600000",  # Technische Prüf-, Test- und Kontrolldienstleistungen
    "71630000",  # Technische Prüf- und Kontrolldienstleistungen
]


class TEDScraper(BaseScraper):
    PLATFORM_NAME = "TED Europa"
    API_BASE = "https://api.ted.europa.eu/v3"

    def __init__(self, config: dict | None = None):
        super().__init__(config)
        self.api_key = os.getenv("TED_API_KEY", "")
        if self.api_key:
            self.session.headers["Authorization"] = f"Bearer {self.api_key}"

    def fetch(self) -> list[Tender]:
        if not self.config.get("platforms", {}).get("ted", {}).get("enabled", True):
            return []

        logger.info("[TED] Starte Suche...")
        tenders = []

        # Suche der letzten 2 Tage (Puffer für Verzögerungen)
        date_from = (datetime.now() - timedelta(days=2)).strftime("%Y%m%d")
        countries = self.config.get("platforms", {}).get("ted", {}).get("countries", ["DE", "AT"])

        for cpv in ENGINEERING_CPV[:5]:  # Wichtigste CPV-Codes zuerst
            results = self._search(cpv=cpv, date_from=date_from, countries=countries)
            tenders.extend(results)

        # Deduplizieren nach ID
        seen = set()
        unique = []
        for t in tenders:
            if t.id not in seen:
                seen.add(t.id)
                unique.append(t)

        logger.info(f"[TED] {len(unique)} Ausschreibungen gefunden.")
        return unique

    def _search(self, cpv: str, date_from: str, countries: list) -> list[Tender]:
        """Führt eine API-Suche durch."""
        # TED API v3 Search Endpoint
        url = f"{self.API_BASE}/notices/search"

        payload = {
            "query": f"cpv:{cpv} AND publicationDate>={date_from}",
            "filters": {
                "BUYER_COUNTRY_CODE": countries,
                "NOTICE_TYPE": ["CN"],  # Contract Notices
            },
            "fields": [
                "ND", "TI", "CA_CE_CE", "PC", "DT", "CY",
                "TD", "CPV", "DS_DATE_DISPATCH", "DL_DATE_LIMIT"
            ],
            "page": 1,
            "pageSize": 50,
            "scope": "ACTIVE",
            "sortColumn": "DS_DATE_DISPATCH",
            "sortOrder": "DESC",
        }

        resp = self.post(url, json=payload)
        if not resp:
            return []

        data = resp.json()
        notices = data.get("notices", [])
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
        nd = notice.get("ND", "")
        title_obj = notice.get("TI", {})

        # Titel: deutsch bevorzugen
        title = (
            title_obj.get("DEU")
            or title_obj.get("DEU_de")
            or next(iter(title_obj.values()), "")
            if isinstance(title_obj, dict) else str(title_obj)
        )

        if not title:
            return None

        client_obj = notice.get("CA_CE_CE", {})
        client = (
            client_obj.get("DEU") or next(iter(client_obj.values()), "")
            if isinstance(client_obj, dict) else str(client_obj)
        )

        desc_obj = notice.get("TD", {})
        description = (
            desc_obj.get("DEU") or next(iter(desc_obj.values()), "")
            if isinstance(desc_obj, dict) else str(desc_obj)
        )

        cpv_list = notice.get("CPV", [])
        if isinstance(cpv_list, str):
            cpv_list = [cpv_list]

        pub_date = self.parse_date(notice.get("DS_DATE_DISPATCH", ""))
        deadline = self.parse_date(notice.get("DL_DATE_LIMIT", ""))

        detail_url = f"https://ted.europa.eu/udl?uri=TED:NOTICE:{nd}:TEXT:DE:HTML"
        pdf_url = f"https://ted.europa.eu/udl?uri=TED:NOTICE:{nd}:PDF:DE:HTML"

        return Tender(
            id=f"TED_{nd}",
            platform=self.PLATFORM_NAME,
            title=self.clean_text(title),
            client=self.clean_text(client),
            description=self.clean_text(description)[:3000],
            publication_date=pub_date,
            deadline=deadline,
            detail_url=detail_url,
            pdf_url=pdf_url,
            country=notice.get("CY", ""),
            cpv_codes=cpv_list,
        )
