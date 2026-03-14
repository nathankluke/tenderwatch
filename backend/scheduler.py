"""
APScheduler – runs daily at 05:30, triggers the scraping pipeline.
Run as a separate process: python scheduler.py
"""

import os
import logging
import httpx
from apscheduler.schedulers.blocking import BlockingScheduler
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("scheduler")

API_URL = os.getenv("API_URL", "http://localhost:8000")
SERVICE_KEY = os.getenv("INTERNAL_SERVICE_SECRET", "change-me-in-production")

scheduler = BlockingScheduler(timezone="Europe/Berlin")


@scheduler.scheduled_job("cron", hour=5, minute=30, id="daily_scrape")
def trigger_daily_scrape():
    logger.info("Täglicher Scan gestartet...")
    try:
        resp = httpx.post(
            f"{API_URL}/internal/run-scrapers",
            headers={"x-service-key": SERVICE_KEY},
            timeout=1800,  # 30 Minuten max
        )
        logger.info(f"Pipeline-Status: {resp.status_code} – {resp.json()}")
    except Exception as e:
        logger.error(f"Pipeline Fehler: {e}")


if __name__ == "__main__":
    logger.info("Scheduler läuft – täglich 05:30 Uhr (Europe/Berlin)")
    scheduler.start()
