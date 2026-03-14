"""Email recipients CRUD per profile."""

from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import get_user_id
from db.supabase_client import get_client
from models.schemas import EmailRecipientCreate

router = APIRouter()


@router.get("/{profile_id}/email-recipients")
async def list_recipients(profile_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    # Verify profile ownership
    profile = client.table("profiles").select("id").eq("id", profile_id).eq(
        "user_id", user_id
    ).single().execute()
    if not profile.data:
        raise HTTPException(404, "Profil nicht gefunden")

    result = client.table("email_recipients").select("*").eq(
        "profile_id", profile_id
    ).order("created_at").execute()
    return result.data


@router.post("/{profile_id}/email-recipients", status_code=201)
async def add_recipient(
    profile_id: str,
    body: EmailRecipientCreate,
    user_id: str = Depends(get_user_id),
):
    client = get_client()
    # Verify profile ownership
    profile = client.table("profiles").select("id").eq("id", profile_id).eq(
        "user_id", user_id
    ).single().execute()
    if not profile.data:
        raise HTTPException(404, "Profil nicht gefunden")

    try:
        result = client.table("email_recipients").insert({
            "profile_id": profile_id,
            "user_id": user_id,
            "email": body.email,
            "name": body.name,
        }).execute()
        return result.data[0]
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(409, "E-Mail bereits vorhanden")
        raise


@router.delete("/{profile_id}/email-recipients/{recipient_id}", status_code=204)
async def remove_recipient(
    profile_id: str,
    recipient_id: str,
    user_id: str = Depends(get_user_id),
):
    client = get_client()
    client.table("email_recipients").delete().eq(
        "id", recipient_id
    ).eq("profile_id", profile_id).eq("user_id", user_id).execute()
