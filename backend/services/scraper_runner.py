"""
Orchestrates all scrapers and saves results to Supabase.
Maps the Tender dataclass (from scraper/base.py) to the Supabase schema.
"""

import logging
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from db.supabase_client import get_client
from scraper import ALL_SCRAPERS

logger = logging.getLogger(__name__)


def _load_scraper_config() -> dict:
    """Load scraper config from Supabase settings or return sensible defaults."""
    try:
        client = get_client()
        result = client.table("settings").select("value").eq(
            "key", "scraper_config"
        ).limit(1).execute()
        if result.data:
            import json
            return json.loads(result.data[0]["value"]) if isinstance(result.data[0]["value"], str) else result.data[0]["value"]
    except Exception:
        pass
    return {}


async def run_all_scrapers() -> list[str]:
    """
    Runs all scrapers, upserts tenders into Supabase.
    Returns list of newly inserted Supabase tender UUIDs.
    """
    client = get_client()
    new_ids = []
    config = _load_scraper_config()

    for ScraperClass in ALL_SCRAPERS:
        platform_name = getattr(ScraperClass, 'PLATFORM_NAME', ScraperClass.__name__)

        run_record = client.table("scrape_runs").insert({
            "platform": platform_name,
            "status": "running",
        }).execute()
        run_id = run_record.data[0]["id"]

        try:
            scraper = ScraperClass(config=config)
            tenders = scraper.fetch()
            logger.info(f"{platform_name}: {len(tenders)} gefunden")

            platform_new = 0
            for t in tenders:
                # Support both English (Tender) and German (Ausschreibung) field names
                external_id = (getattr(t, 'id', None) or
                               getattr(t, 'externe_id', None) or "")
                if not external_id:
                    continue

                tender_data = {
                    "external_id":      str(external_id),
                    "platform":         getattr(t, 'platform', getattr(t, 'plattform', platform_name)),
                    "title":            getattr(t, 'title', getattr(t, 'titel', '')) or '',
                    "client":           getattr(t, 'client', getattr(t, 'auftraggeber', None)) or None,
                    "deadline":         _safe_date(getattr(t, 'deadline', getattr(t, 'frist', None))),
                    "publication_date": _safe_date(getattr(t, 'publication_date', getattr(t, 'veroeffentlicht', None))),
                    "description":      (getattr(t, 'description', getattr(t, 'beschreibung', None)) or '')[:3000],
                    "url":              getattr(t, 'detail_url', getattr(t, 'url', None)) or None,
                    "pdf_url":          getattr(t, 'pdf_url', None) or None,
                }

                result = client.table("tenders").upsert(
                    tender_data,
                    on_conflict="external_id,platform",
                ).execute()

                if result.data:
                    new_ids.append(result.data[0]["id"])
                    platform_new += 1

            client.table("scrape_runs").update({
                "status":        "success",
                "tenders_found": len(tenders),
                "tenders_new":   platform_new,
                "finished_at":   "now()",
            }).eq("id", run_id).execute()

        except Exception as e:
            logger.error(f"{platform_name} Fehler: {e}")
            client.table("scrape_runs").update({
                "status":        "error",
                "error_message": str(e)[:500],
                "finished_at":   "now()",
            }).eq("id", run_id).execute()

    logger.info(f"Scraping gesamt: {len(new_ids)} neue Ausschreibungen")
    return new_ids


def _safe_date(value) -> str | None:
    """Returns YYYY-MM-DD string or None."""
    if not value:
        return None
    s = str(value).strip()
    if len(s) >= 10 and s[4] == '-':
        return s[:10]
    return None
