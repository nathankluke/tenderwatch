from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from middleware.auth import get_user_id
from db.supabase_client import get_client
from models.schemas import TenderStatusUpdate

router = APIRouter()


@router.get("")
async def list_tenders(
    profile_id: Optional[str] = Query(None),
    min_score: int = Query(0),
    platform: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user_id: str = Depends(get_user_id),
):
    client = get_client()

    # Base tender query
    query = client.table("tenders").select(
        "id, external_id, platform, title, client, deadline, publication_date, summary, url, pdf_url, created_at"
    )

    if platform:
        query = query.eq("platform", platform)
    if search:
        query = query.ilike("title", f"%{search}%")

    tenders_result = query.order("created_at", desc=True).range(
        offset, offset + limit - 1
    ).execute()
    tenders = tenders_result.data

    if not tenders:
        return []

    tender_ids = [t["id"] for t in tenders]

    # Get scores for this profile
    scores_map = {}
    keywords_map = {}
    if profile_id:
        scores_result = client.table("tender_scores").select(
            "tender_id, score, matched_keywords"
        ).eq("profile_id", profile_id).in_("tender_id", tender_ids).execute()
        for s in scores_result.data:
            scores_map[s["tender_id"]] = s["score"]
            keywords_map[s["tender_id"]] = s["matched_keywords"] or []

    # Get user's status for each tender
    status_result = client.table("tender_status").select(
        "tender_id, status"
    ).eq("user_id", user_id).in_("tender_id", tender_ids).execute()
    status_map = {s["tender_id"]: s["status"] for s in status_result.data}

    # Merge and filter by min_score
    result = []
    for t in tenders:
        tid = t["id"]
        score = scores_map.get(tid)
        if profile_id and score is not None and score < min_score:
            continue
        result.append({
            **t,
            "score": score,
            "matched_keywords": keywords_map.get(tid, []),
            "status": status_map.get(tid),
        })

    # Sort by score descending if profile given
    if profile_id:
        result.sort(key=lambda x: (x["score"] or 0), reverse=True)

    return result


@router.get("/{tender_id}")
async def get_tender(tender_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    result = client.table("tenders").select("*").eq("id", tender_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Ausschreibung nicht gefunden")
    tender = result.data

    # Status
    status_result = client.table("tender_status").select("status, notes").eq(
        "tender_id", tender_id
    ).eq("user_id", user_id).execute()
    tender["status"] = status_result.data[0]["status"] if status_result.data else None
    tender["notes"] = status_result.data[0].get("notes") if status_result.data else None

    return tender


@router.post("/{tender_id}/status")
async def set_status(
    tender_id: str,
    body: TenderStatusUpdate,
    user_id: str = Depends(get_user_id),
):
    client = get_client()
    client.table("tender_status").upsert({
        "tender_id": tender_id,
        "user_id": user_id,
        "profile_id": body.profile_id,
        "status": body.status,
        "notes": body.notes,
        "updated_at": "now()",
    }, on_conflict="tender_id,user_id").execute()
    return {"status": body.status}


@router.delete("/{tender_id}/status", status_code=204)
async def remove_status(tender_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    client.table("tender_status").delete().eq("tender_id", tender_id).eq(
        "user_id", user_id
    ).execute()


@router.post("/{tender_id}/extract-keywords")
async def extract_keywords_from_tender(
    tender_id: str,
    profile_id: str,
    user_id: str = Depends(get_user_id),
):
    """
    'Send Bekanntmachung' button: extracts keywords from this tender's
    description/summary and returns them for user approval.
    """
    client = get_client()
    tender = client.table("tenders").select(
        "title, client, description, summary"
    ).eq("id", tender_id).single().execute()
    if not tender.data:
        raise HTTPException(404, "Ausschreibung nicht gefunden")

    t = tender.data
    text = "\n".join(filter(None, [
        f"Titel: {t.get('title', '')}",
        f"Auftraggeber: {t.get('client', '')}",
        f"Zusammenfassung: {t.get('summary', '')}",
        f"Beschreibung: {t.get('description', '') or ''}",
    ]))

    from services.ai_service import extract_keywords_from_text
    keywords = await extract_keywords_from_text(text)
    return {"tender_id": tender_id, "extracted_keywords": keywords}
