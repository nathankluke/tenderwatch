from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import get_user_id
from db.supabase_client import get_client
from models.schemas import KeywordCreate

router = APIRouter()


@router.get("/{profile_id}/keywords")
async def list_keywords(profile_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    result = client.table("keywords").select("*").eq("profile_id", profile_id).eq(
        "user_id", user_id
    ).order("category").order("keyword").execute()
    return result.data


@router.post("/{profile_id}/keywords", status_code=201)
async def add_keyword(
    profile_id: str,
    body: KeywordCreate,
    user_id: str = Depends(get_user_id),
):
    client = get_client()
    # Verify profile belongs to user
    profile = client.table("profiles").select("id").eq("id", profile_id).eq(
        "user_id", user_id
    ).single().execute()
    if not profile.data:
        raise HTTPException(404, "Profil nicht gefunden")

    result = client.table("keywords").insert({
        "profile_id": profile_id,
        "user_id": user_id,
        "keyword": body.keyword.strip(),
        "category": body.category,
        "source": "manual",
        "approved": True,
    }).execute()
    return result.data[0]


@router.delete("/{profile_id}/keywords/{keyword_id}", status_code=204)
async def delete_keyword(
    profile_id: str,
    keyword_id: str,
    user_id: str = Depends(get_user_id),
):
    client = get_client()
    client.table("keywords").delete().eq("id", keyword_id).eq(
        "profile_id", profile_id
    ).eq("user_id", user_id).execute()


@router.post("/{profile_id}/keywords/approve")
async def approve_keywords(
    profile_id: str,
    body: dict,  # {keywords: [{keyword, category}]}
    user_id: str = Depends(get_user_id),
):
    """Bulk-insert keywords that the user approved from a PDF extraction."""
    client = get_client()
    # Verify profile
    profile = client.table("profiles").select("id").eq("id", profile_id).eq(
        "user_id", user_id
    ).single().execute()
    if not profile.data:
        raise HTTPException(404, "Profil nicht gefunden")

    keywords = body.get("keywords", [])
    if not keywords:
        return {"inserted": 0}

    rows = [
        {
            "profile_id": profile_id,
            "user_id": user_id,
            "keyword": kw["keyword"].strip(),
            "category": kw.get("category", "leistung"),
            "source": kw.get("source", "pdf_extracted"),
            "approved": True,
        }
        for kw in keywords
        if kw.get("keyword", "").strip()
    ]

    result = client.table("keywords").upsert(
        rows, on_conflict="profile_id,keyword"
    ).execute()
    return {"inserted": len(result.data)}
