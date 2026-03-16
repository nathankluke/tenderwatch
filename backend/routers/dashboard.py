import os
import logging
from fastapi import APIRouter, Depends, Query, BackgroundTasks, HTTPException
from typing import Optional
from middleware.auth import get_user_id
from db.supabase_client import get_client

router = APIRouter()
logger = logging.getLogger("dashboard")


@router.get("")
async def get_dashboard(
    profile_id: Optional[str] = Query(None),
    user_id: str = Depends(get_user_id),
):
    client = get_client()

    def _enrich(tenders: list, scores: dict, keywords: dict, statuses: dict) -> list:
        return [
            {
                **t,
                "score": scores.get(t["id"]),
                "matched_keywords": keywords.get(t["id"], []),
                "status": statuses.get(t["id"]),
            }
            for t in tenders
        ]

    # Working On
    working_result = client.table("tender_status").select(
        "tender_id, status, updated_at, tenders(*)"
    ).eq("user_id", user_id).eq("status", "working_on").order(
        "updated_at", desc=True
    ).limit(10).execute()
    working_tenders = [
        {**row["tenders"], "status": "working_on"}
        for row in working_result.data
        if row.get("tenders")
    ]

    # Interested
    interested_result = client.table("tender_status").select(
        "tender_id, status, updated_at, tenders(*)"
    ).eq("user_id", user_id).eq("status", "interested").order(
        "updated_at", desc=True
    ).limit(10).execute()
    interested_tenders = [
        {**row["tenders"], "status": "interested"}
        for row in interested_result.data
        if row.get("tenders")
    ]

    # Recent Tenders (scored for this profile)
    recent_query = client.table("tenders").select(
        "id, external_id, platform, title, client, deadline, publication_date, summary, url, pdf_url, created_at"
    ).order("created_at", desc=True).limit(20)
    recent_result = recent_query.execute()
    recent = recent_result.data

    tender_ids = [t["id"] for t in recent]
    scores_map, keywords_map, status_map = {}, {}, {}

    if tender_ids:
        if profile_id:
            scores_result = client.table("tender_scores").select(
                "tender_id, score, matched_keywords"
            ).eq("profile_id", profile_id).in_("tender_id", tender_ids).execute()
            for s in scores_result.data:
                scores_map[s["tender_id"]] = s["score"]
                keywords_map[s["tender_id"]] = s["matched_keywords"] or []

        status_result = client.table("tender_status").select(
            "tender_id, status"
        ).eq("user_id", user_id).in_("tender_id", tender_ids).execute()
        status_map = {s["tender_id"]: s["status"] for s in status_result.data}

    recent_enriched = sorted(
        _enrich(recent, scores_map, keywords_map, status_map),
        key=lambda x: (x["score"] or 0),
        reverse=True,
    )

    # Completed (bid / no_bid)
    completed_result = client.table("tender_status").select(
        "tender_id, status, updated_at, tenders(*)"
    ).eq("user_id", user_id).in_("status", ["bid", "no_bid"]).order(
        "updated_at", desc=True
    ).limit(20).execute()
    completed_tenders = [
        {**row["tenders"], "status": row["status"]}
        for row in completed_result.data
        if row.get("tenders")
    ]

    # Last scrape info
    try:
        last_scrape = client.table("scrape_runs").select(
            "started_at, status"
        ).order("started_at", desc=True).limit(1).execute()
        last_scrape_at = last_scrape.data[0]["started_at"] if last_scrape.data else None
        last_scrape_status = last_scrape.data[0]["status"] if last_scrape.data else None
    except Exception:
        last_scrape_at = None
        last_scrape_status = None

    return {
        "working_on": working_tenders,
        "interested": interested_tenders,
        "completed": completed_tenders,
        "recent_tenders": recent_enriched,
        "last_scrape_at": last_scrape_at,
        "last_scrape_status": last_scrape_status,
    }


@router.post("/scan")
async def trigger_scan(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_user_id),
):
    """User-facing manual scan trigger."""
    service_key = os.getenv("INTERNAL_SERVICE_SECRET", "change-me-in-production")
    try:
        import httpx
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(
                "http://127.0.0.1:8000/internal/run-scrapers",
                headers={"X-Service-Key": service_key},
                timeout=10,
            )
            resp.raise_for_status()
            return {"status": "started"}
    except ImportError:
        # httpx not installed, try running pipeline directly in background
        logger.warning("httpx not installed, running pipeline directly")
        try:
            from routers.internal import _run_pipeline
            background_tasks.add_task(_run_pipeline)
            return {"status": "started"}
        except Exception as e:
            raise HTTPException(500, f"Scan konnte nicht gestartet werden: {e}")
    except Exception as e:
        logger.error(f"Scan trigger failed: {e}")
        # Fallback: try running pipeline directly
        try:
            from routers.internal import _run_pipeline
            background_tasks.add_task(_run_pipeline)
            return {"status": "started"}
        except Exception as e2:
            raise HTTPException(500, f"Scan konnte nicht gestartet werden: {e2}")
