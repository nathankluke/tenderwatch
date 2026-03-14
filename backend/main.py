"""
TenderWatch SaaS – FastAPI Backend
Runs on Hetzner VPS, consumed by the Next.js frontend on Vercel.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import profiles, keywords, tenders, dashboard, uploads, internal, email_recipients

load_dotenv()

app = FastAPI(title="TenderWatch API", version="1.0.0")

# CORS – allow only Vercel frontend + local dev
ALLOWED_ORIGINS = [
    os.getenv("FRONTEND_URL", "http://localhost:3000"),
    "https://tenderw.com",
    "https://www.tenderw.com",
    "https://tenderwatch.vercel.app",
    "https://tenderwatch-iota.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
app.include_router(keywords.router, prefix="/profiles", tags=["keywords"])
app.include_router(tenders.router, prefix="/tenders", tags=["tenders"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(uploads.router, prefix="/profiles", tags=["uploads"])
app.include_router(internal.router, prefix="/internal", tags=["internal"])
app.include_router(email_recipients.router, prefix="/profiles", tags=["email_recipients"])


@app.get("/health")
async def health():
    from db.supabase_client import get_client
    try:
        client = get_client()
        result = client.table("scrape_runs").select("started_at").order(
            "started_at", desc=True
        ).limit(1).execute()
        last = result.data[0]["started_at"] if result.data else None
    except Exception:
        last = None
    return {"status": "ok", "last_scrape": last}
