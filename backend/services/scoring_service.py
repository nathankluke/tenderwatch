"""
Scores new tenders against all user profiles using keyword matching + Claude.
"""

import logging
from db.supabase_client import get_client

logger = logging.getLogger(__name__)


async def score_new_tenders(tender_ids: list[str]):
    """
    For each new tender:
    1. Fetch all profiles with their keywords
    2. Run keyword_score() from the existing processor
    3. Run Claude summary (ki_verarbeite_ausschreibung) for score >= 2
    4. Save scores to tender_scores table
    5. Update tenders.summary with Claude output
    """
    if not tender_ids:
        return

    client = get_client()
    from processor.ai_processor import keyword_score, ai_process_tender
    from scraper.base import Tender

    # Fetch all tenders to score
    tenders_result = client.table("tenders").select("*").in_("id", tender_ids).execute()
    tenders = tenders_result.data

    # Fetch all profiles + their keywords
    profiles_result = client.table("profiles").select("id, user_id").execute()
    profiles = profiles_result.data

    for profile in profiles:
        profile_id = profile["id"]
        user_id    = profile["user_id"]

        kw_result = client.table("keywords").select(
            "keyword, category"
        ).eq("profile_id", profile_id).eq("approved", True).execute()

        # Build keyword dict expected by keyword_score()
        keywords_dict    = {"primary": [], "secondary": []}
        priority_clients = []
        for kw in kw_result.data:
            cat = kw["category"]
            if cat == "leistung":
                keywords_dict["primary"].append(kw["keyword"])
            elif cat == "firma":
                priority_clients.append(kw["keyword"])
            else:
                keywords_dict["secondary"].append(kw["keyword"])

        if not any(keywords_dict.values()) and not priority_clients:
            continue

        for row in tenders:
            # Build a Tender object from the Supabase row
            t = Tender(
                id=row["external_id"],
                platform=row["platform"],
                title=row.get("title", ""),
                client=row.get("client", "") or "",
                description=row.get("description", "") or "",
                summary=row.get("summary", "") or "",
                deadline=row.get("deadline", "") or "",
                publication_date=row.get("publication_date", "") or "",
            )

            # Step 1: fast keyword score
            score, matched = keyword_score(t, keywords_dict, priority_clients)

            # Step 2: Claude scoring — always runs to get accurate relevance score
            if score >= 1:
                try:
                    result = ai_process_tender(t, keywords_dict)
                    summary  = result.get("summary", "")
                    ai_score = result.get("score", score)
                    if isinstance(ai_score, (int, float)):
                        score = min(10, max(0, int(ai_score)))
                    if summary:
                        client.table("tenders").update(
                            {"summary": summary}
                        ).eq("id", row["id"]).execute()
                except Exception as e:
                    logger.warning(f"Claude Fehler ({row['id']}): {e}")

            # Save score
            client.table("tender_scores").upsert({
                "tender_id":       row["id"],
                "profile_id":      profile_id,
                "user_id":         user_id,
                "score":           score,
                "matched_keywords": matched,
            }, on_conflict="tender_id,profile_id").execute()

    logger.info(f"Scoring: {len(tenders)} Ausschreibungen × {len(profiles)} Profile")
