"""
TenderWatch – Base Scraper
Gemeinsame Funktionen für alle Plattform-Scraper
"""

import re
import json
import hashlib
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


@dataclass
class Tender:
    """Einheitliches Datenmodell für alle Ausschreibungen."""
    id: str                          # Eindeutige ID (wird automatisch generiert falls leer)
    platform: str
    title: str
    client: str = ""
    services: str = ""
    description: str = ""
    summary: str = ""
    score: int = 0
    matched_keywords: list = field(default_factory=list)
    publication_date: str = ""
    deadline: str = ""
    pdf_url: str = ""
    detail_url: str = ""
    country: str = ""
    cpv_codes: list = field(default_factory=list)

    def __post_init__(self):
        if not self.id:
            # Fallback-ID aus URL oder Titel generieren
            raw = f"{self.platform}_{self.title}_{self.publication_date}"
            self.id = hashlib.md5(raw.encode()).hexdigest()

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "platform": self.platform,
            "title": self.title,
            "client": self.client,
            "services": self.services,
            "description": self.description[:2000],  # DB-Limit
            "summary": self.summary,
            "score": self.score,
            "matched_keywords": json.dumps(self.matched_keywords, ensure_ascii=False),
            "publication_date": self.publication_date,
            "deadline": self.deadline,
            "pdf_url": self.pdf_url,
            "detail_url": self.detail_url,
            "country": self.country,
            "cpv_codes": json.dumps(self.cpv_codes),
        }


class BaseScraper(ABC):
    """Abstrakte Basisklasse für alle Scraper."""

    PLATFORM_NAME = "base"
    REQUEST_TIMEOUT = 30
    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    }

    def __init__(self, config: dict | None = None):
        self.config = config if isinstance(config, dict) else {}
        self.session = self._build_session()

    def _build_session(self) -> requests.Session:
        session = requests.Session()
        retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        session.headers.update(self.HEADERS)
        return session

    @abstractmethod
    def fetch(self, keywords: list[str] | None = None) -> list[Tender]:
        """Holt Ausschreibungen von der Plattform. Muss überschrieben werden."""
        pass

    def get(self, url: str, **kwargs) -> Optional[requests.Response]:
        try:
            resp = self.session.get(url, timeout=self.REQUEST_TIMEOUT, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            logger.error(f"[{self.PLATFORM_NAME}] GET {url} fehlgeschlagen: {e}")
            return None

    def post(self, url: str, **kwargs) -> Optional[requests.Response]:
        try:
            resp = self.session.post(url, timeout=self.REQUEST_TIMEOUT, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            logger.error(f"[{self.PLATFORM_NAME}] POST {url} fehlgeschlagen: {e}")
            return None

    @staticmethod
    def clean_text(text: str) -> str:
        if not text:
            return ""
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    @staticmethod
    def parse_date(date_str: str) -> str:
        """Versucht verschiedene Datumsformate zu parsen, gibt ISO-String zurück."""
        if not date_str:
            return ""
        formats = [
            "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d.%m.%Y",
            "%d.%m.%Y %H:%M", "%Y-%m-%dT%H:%M:%SZ",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return date_str[:10] if len(date_str) >= 10 else date_str
