"""
Claude AI service – wraps ki_processor for keyword extraction from free text.
"""

import re
import json
import os
import logging
from anthropic import Anthropic

logger = logging.getLogger(__name__)
KI_MODELL = "claude-haiku-4-5-20251001"

_client = None

def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
    return _client


async def extract_keywords_from_text(text: str) -> list[dict]:
    """
    Extracts relevant keywords from a free-text tender or PDF.
    Returns list of {keyword, category} dicts.
    """
    prompt = f"""Du analysierst einen deutschen Vergabe-Text und extrahierst relevante Suchbegriffe.

TEXT:
{text[:3000]}

Antworte NUR mit diesem JSON-Array (kein Markdown):
[
  {{"keyword": "Bauüberwachung", "category": "leistung"}},
  {{"keyword": "TenneT", "category": "firma"}},
  {{"keyword": "Hochbau", "category": "allgemein"}}
]

Regeln:
- "leistung": Spezifische Leistungsarten (max. 10) – z.B. "Bauüberwachung", "Nachtragsmanagement"
- "firma": Auftraggeber-Namen (max. 5) – z.B. "TenneT", "Deutsche Bahn AG"
- "allgemein": Allgemeine Fachbegriffe (max. 8) – z.B. "Infrastruktur", "Energieversorgung"
- Keine generischen Begriffe wie "Vergabe", "Leistung", "Projekt"
- Nur auf Deutsch
- Bevorzuge zusammengesetzte Fachbegriffe"""

    try:
        client = _get_client()
        resp = client.messages.create(
            model=KI_MODELL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        text_resp = resp.content[0].text.strip()
        match = re.search(r'\[.*\]', text_resp, re.DOTALL)
        if match:
            keywords = json.loads(match.group())
            # Validate structure
            return [
                {"keyword": kw["keyword"], "category": kw.get("category", "leistung")}
                for kw in keywords
                if isinstance(kw, dict) and kw.get("keyword")
            ]
    except Exception as e:
        logger.error(f"Keyword-Extraktion Fehler: {e}")

    return []
