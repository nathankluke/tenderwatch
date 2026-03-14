from fastapi import APIRouter, Depends, HTTPException
from middleware.auth import get_user_id
from db.supabase_client import get_client
from models.schemas import ProfileCreate, ProfileUpdate

router = APIRouter()


@router.get("")
async def list_profiles(user_id: str = Depends(get_user_id)):
    client = get_client()
    result = client.table("profiles").select("*").eq("user_id", user_id).order(
        "created_at"
    ).execute()
    return result.data


@router.post("", status_code=201)
async def create_profile(body: ProfileCreate, user_id: str = Depends(get_user_id)):
    client = get_client()
    result = client.table("profiles").insert({
        "user_id": user_id,
        "name": body.name,
        "description": body.description,
    }).execute()
    return result.data[0]


@router.get("/{profile_id}")
async def get_profile(profile_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    result = client.table("profiles").select("*").eq("id", profile_id).eq(
        "user_id", user_id
    ).single().execute()
    if not result.data:
        raise HTTPException(404, "Profil nicht gefunden")
    return result.data


@router.put("/{profile_id}")
async def update_profile(
    profile_id: str,
    body: ProfileUpdate,
    user_id: str = Depends(get_user_id),
):
    client = get_client()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "Keine Änderungen angegeben")
    updates["updated_at"] = "now()"
    result = client.table("profiles").update(updates).eq("id", profile_id).eq(
        "user_id", user_id
    ).execute()
    return result.data[0]


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(profile_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    client.table("profiles").delete().eq("id", profile_id).eq(
        "user_id", user_id
    ).execute()


@router.put("/{profile_id}/email-toggle")
async def toggle_email(profile_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    # Get current value
    current = client.table("profiles").select("daily_email_enabled").eq(
        "id", profile_id
    ).eq("user_id", user_id).single().execute()
    if not current.data:
        raise HTTPException(404, "Profil nicht gefunden")
    new_val = not current.data["daily_email_enabled"]
    result = client.table("profiles").update({"daily_email_enabled": new_val}).eq(
        "id", profile_id
    ).eq("user_id", user_id).execute()
    return {"daily_email_enabled": new_val}
