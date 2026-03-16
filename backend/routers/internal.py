"""
Internal endpoints – protected by X-Service-Key header, NOT user JWT.
Called by the APScheduler process on the same machine.
"""

import os
from fastapi import APIRouter, Header, HTTPException, BackgroundTasks

router = APIRouter()
SERVICE_KEY = os.getenv("INTERNAL_SERVICE_SECRET", "change-me-in-production")


def _verify_key(x_service_key: str = Header(...)):
    if x_service_key != SERVICE_KEY:
        raise HTTPException(403, "Forbidden")


@router.post("/run-scrapers")
async def run_scrapers(
    background_tasks: BackgroundTasks,
    x_service_key: str = Header(...),
    profile_id: str = None,
):
    _verify_key(x_service_key)
    background_tasks.add_task(_run_pipeline, profile_id=profile_id)
    return {"status": "started"}


async def _run_pipeline(profile_id: str = None):
    """Full pipeline: scrape → score → email. Runs in background."""
    from services.scraper_runner import run_all_scrapers
    from services.scoring_service import score_new_tenders
    from services.email_service import send_digests

    import logging
    logger = logging.getLogger("pipeline")
    logger.info(f"Pipeline gestartet (profile_id={profile_id})")

    try:
        new_tender_ids = await run_all_scrapers()
        logger.info(f"Scraping: {len(new_tender_ids)} neue Ausschreibungen")

        await score_new_tenders(new_tender_ids)
        logger.info("Scoring abgeschlossen")

        await send_digests()
        logger.info("E-Mail Digest versendet")

    except Exception as e:
        logger.error(f"Pipeline Fehler: {e}")
