from fastapi import APIRouter, Depends, Query
from typing import Optional
from middleware.auth import get_user_id
from db.supabase_client import get_client

router = APIRouter()


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

    # ── Working On ───────────────────────────────────────────────
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

    # ── Interested ───────────────────────────────────────────────
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

    # ── Recent Tenders (scored for this profile) ─────────────────
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

    # ── Last scrape info ─────────────────────────────────────────
    last_scrape = client.table("scrape_runs").select(
        "started_at, status"
    ).order("started_at", desc=True).limit(1).execute()
    last_scrape_at = last_scrape.data[0]["started_at"] if last_scrape.data else None
    last_scrape_status = last_scrape.data[0]["status"] if last_scrape.data else None

    return {
        "working_on": working_tenders,
        "interested": interested_tenders,
        "recent_tenders": recent_enriched,
        "last_scrape_at": last_scrape_at,
        "last_scrape_status": last_scrape_status,
    }
