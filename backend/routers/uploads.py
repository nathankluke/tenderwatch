import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from middleware.auth import get_user_id
from db.supabase_client import get_client

router = APIRouter()
BUCKET = "pdf-uploads"


@router.post("/{profile_id}/upload-pdf")
async def upload_pdf(
    profile_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_user_id),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Nur PDF-Dateien erlaubt")

    client = get_client()

    # Verify profile
    profile = client.table("profiles").select("id").eq("id", profile_id).eq(
        "user_id", user_id
    ).single().execute()
    if not profile.data:
        raise HTTPException(404, "Profil nicht gefunden")

    # Upload to Supabase Storage
    file_bytes = await file.read()
    storage_path = f"{user_id}/{profile_id}/{uuid.uuid4()}/{file.filename}"
    client.storage.from_(BUCKET).upload(
        storage_path,
        file_bytes,
        file_options={"content-type": "application/pdf"},
    )

    # Create DB record (status: processing)
    upload_record = client.table("pdf_uploads").insert({
        "profile_id": profile_id,
        "user_id": user_id,
        "storage_path": storage_path,
        "filename": file.filename,
        "status": "processing",
    }).execute()
    upload_id = upload_record.data[0]["id"]

    # Extract text + keywords via Claude
    try:
        from services.pdf_service import extract_text_from_bytes
        from services.ai_service import extract_keywords_from_text

        text = extract_text_from_bytes(file_bytes)
        if not text:
            raise ValueError("Kein Text extrahiert")

        keywords = await extract_keywords_from_text(text)

        # Update DB record
        client.table("pdf_uploads").update({
            "status": "pending_approval",
            "extracted_keywords": keywords,
        }).eq("id", upload_id).execute()

        return {
            "upload_id": upload_id,
            "filename": file.filename,
            "extracted_keywords": keywords,
            "status": "pending_approval",
        }

    except Exception as e:
        client.table("pdf_uploads").update({
            "status": "error",
            "error_message": str(e)[:500],
        }).eq("id", upload_id).execute()
        raise HTTPException(500, f"Verarbeitung fehlgeschlagen: {e}")


@router.post("/{profile_id}/upload-pdf/{upload_id}/approve")
async def approve_pdf_keywords(
    profile_id: str,
    upload_id: str,
    body: dict,
    user_id: str = Depends(get_user_id),
):
    """Save the user-approved keywords from a PDF upload."""
    client = get_client()
    keywords = body.get("keywords", [])

    if keywords:
        rows = [
            {
                "profile_id": profile_id,
                "user_id": user_id,
                "keyword": kw["keyword"].strip(),
                "category": kw.get("category", "leistung"),
                "source": "pdf_extracted",
                "approved": True,
            }
            for kw in keywords
            if kw.get("keyword", "").strip()
        ]
        client.table("keywords").upsert(
            rows, on_conflict="profile_id,keyword"
        ).execute()

    client.table("pdf_uploads").update({"status": "approved"}).eq(
        "id", upload_id
    ).execute()
    return {"saved": len(keywords)}


@router.get("/{profile_id}/uploads")
async def list_uploads(profile_id: str, user_id: str = Depends(get_user_id)):
    client = get_client()
    result = client.table("pdf_uploads").select(
        "id, filename, status, created_at, extracted_keywords"
    ).eq("profile_id", profile_id).eq("user_id", user_id).order(
        "created_at", desc=True
    ).execute()
    return result.data
