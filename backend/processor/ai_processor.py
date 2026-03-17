"""
TenderWatch – KI-Verarbeitung
Nutzt Claude API für:
1. Relevanz-Scoring (0-10)
2. 20-Wort-Zusammenfassung
3. Extraktion von Leistungen aus dem Ausschreibungstext
"""

import os
import json
import logging
import re
from anthropic import Anthropic

from scraper.base import Tender

logger = logging.getLogger(__name__)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


def load_keywords_from_db() -> dict:
    """Lädt aktuelle Keywords aus Supabase."""
    try:
        from db.supabase_client import get_client
        client_db = get_client()
        result = client_db.table("keywords").select("keyword, category").eq("approved", True).execute()
        keywords = {"primary": [], "secondary": []}
        for row in result.data:
            if row.get("category") == "leistung":
                keywords["primary"].append(row["keyword"])
            else:
                keywords["secondary"].append(row["keyword"])
        return keywords
    except Exception:
        return {"primary": [], "secondary": []}


def load_priority_clients() -> list[str]:
    try:
        from db.supabase_client import get_client
        client_db = get_client()
        result = client_db.table("keywords").select("keyword").eq("category", "firma").eq("approved", True).execute()
        return [r["keyword"] for r in result.data if r.get("keyword")]
    except Exception:
        return []


def keyword_score(tender: Tender, keywords: dict, priority_clients: list) -> tuple[int, list]:
    """
    Schnelles Keyword-Matching OHNE API-Call.
    Gibt (score, matched_keywords) zurück.
    """
    text = f"{tender.title} {tender.description} {tender.services}".lower()
    matched = []
    score = 0

    for kw in keywords.get("primary", []):
        if kw.lower() in text:
            score += 3
            matched.append(kw)

    for kw in keywords.get("secondary", []):
        if kw.lower() in text:
            score += 1
            matched.append(kw)

    # Priority Client Bonus
    client_text = tender.client.lower()
    for pc in priority_clients:
        if pc.lower() in client_text:
            score += 2
            break

    return min(score, 10), matched


def ai_process_tender(tender: Tender, keywords: dict) -> dict:
    """
    Ruft Claude API für Zusammenfassung und verfeinertes Scoring auf.
    Nur für Tenders mit Keyword-Score >= 2.
    """
    kw_list_primary = ", ".join(keywords.get("primary", []))
    kw_list_secondary = ", ".join(keywords.get("secondary", []))

    prompt = f"""Du bist ein Experte für öffentliche Ausschreibungen im europäischen Infrastrukturmarkt, spezialisiert auf Dienstleistungen für Übertragungsnetzbetreiber (TSOs) und Infrastrukturprojekte.

Analysiere diese Ausschreibung und bewerte ihre Relevanz:

TITEL: {tender.title}
AUFTRAGGEBER: {tender.client}
BESCHREIBUNG: {tender.description[:2000] if tender.description else "Nicht verfügbar"}

SCORING-KRITERIEN:

Score 9-10 (Höchste Relevanz – direkt ausgeschrieben):
• Claim Management, Contract Management, Commercial Management
• Procurement Cost Management, Nachtragsprüfung, Contract Administration
• Bauüberwachung, Bauoberleitung, Construction Management
• Owner's Engineer / Owner's Representative, Fremdüberwachung von Bauleistungen

Score 6-8 (Hohe Relevanz):
• Project Management, Program Management, PMO / Project Controls
• Terminplanung / Scheduling, Kostencontrolling / Cost Control, Projektsteuerung
• Kombination aus Planung + Bauüberwachung oder Projektmanagement

Score 3-5 (Mittlere Relevanz – möglicherweise interessant):
• Verwandte Ingenieurleistungen mit Bezug zu Infrastruktur/Energie
• Ausschreibungen die zusätzlich Planungsleistungen enthalten wenn Bauüberwachung/PM Teil davon

Score 0-2 (Nicht relevant – automatisch ausfiltern):
• Reine Bauleistungen (Erd-, Kabel-, Tiefbauarbeiten ohne Überwachung)
• Reine Lieferleistungen (Equipment, Kabel, Komponenten)
• Reine Test- oder Inbetriebnahmeleistungen
• Reine Studien oder Gutachten ohne Projektbezug
• IT-Dienstleistungen, Reinigung, Catering, Wartung

BONUS (erhöht Score um 1-2 Punkte):
• Auftraggeber ist TenneT, Amprion, TransnetBW, 50Hertz oder deren Töchter
• Bezug zu Projekten: SuedLink, OstWestLink, NordWestLink, Rheinquerung, Terra-U
• Hochspannungsinfrastruktur, Offshore-Windanbindung, Netzausbau

Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung):
{{
  "summary": "Zusammenfassung in maximal 20 deutschen Wörtern",
  "services": "Extrahierte ausgeschriebene Leistungen (kommagetrennt)",
  "score": <Ganzzahl 0-10>,
  "score_reason": "Ein präziser Satz warum dieser Score"
}}"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()

        # JSON extrahieren
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            return {
                "summary": result.get("summary", ""),
                "services": result.get("services", ""),
                "score": max(0, min(10, int(result.get("score", 0)))),
                "score_reason": result.get("score_reason", ""),
            }
    except json.JSONDecodeError as e:
        logger.warning(f"[AI] JSON-Parse-Fehler für '{tender.title}': {e}")
    except Exception as e:
        logger.error(f"[AI] API-Fehler für '{tender.title}': {e}")

    return {"summary": "", "services": "", "score": 0, "score_reason": ""}


def process_tenders(tenders: list[Tender]) -> list[Tender]:
    """
    Verarbeitet eine Liste von Tenders:
    1. Keyword-Matching (schnell, ohne API)
    2. KI-Verarbeitung für relevante Tenders (Score >= 2)
    """
    keywords = load_keywords_from_db()
    priority_clients = load_priority_clients()

    processed = []
    ai_calls = 0

    for tender in tenders:
        # Schritt 1: Schnelles Keyword-Matching
        score, matched = keyword_score(tender, keywords, priority_clients)
        tender.matched_keywords = matched
        tender.score = score

        # Schritt 2: KI nur für potenziell relevante Tenders
        if score >= 2:
            logger.info(f"[AI] Verarbeite: {tender.title[:60]}... (Score: {score})")
            ai_result = ai_process_tender(tender, keywords)

            if ai_result["summary"]:
                tender.summary = ai_result["summary"]
            if ai_result["services"]:
                tender.services = ai_result["services"]
            # KI-Score kann Keyword-Score überschreiben (KI ist genauer)
            if ai_result["score"] > 0:
                tender.score = ai_result["score"]
            ai_calls += 1
        else:
            tender.summary = f"Kein Keyword-Treffer für Ingenieurdienstleistungen."

        processed.append(tender)

    logger.info(f"[AI] Verarbeitung abgeschlossen. {ai_calls} KI-Calls für {len(tenders)} Tenders.")
    return processed


def save_tenders_to_db(tenders: list[Tender]) -> int:
    """Speichert Tenders in Supabase. Gibt Anzahl neuer Einträge zurück."""
    from db.supabase_client import get_client
    client_db = get_client()
    new_count = 0

    for tender in tenders:
        if tender.score < 1:
            continue

        try:
            tender_data = {
                "external_id": tender.id,
                "platform": tender.platform,
                "title": tender.title,
                "client": tender.client,
                "description": (tender.description or "")[:3000],
                "summary": tender.summary,
                "url": tender.detail_url,
                "pdf_url": tender.pdf_url,
                "publication_date": tender.publication_date or None,
                "deadline": tender.deadline or None,
            }
            result = client_db.table("tenders").upsert(
                tender_data, on_conflict="external_id,platform"
            ).execute()
            if result.data:
                new_count += 1
        except Exception as e:
            logger.error(f"[DB] Fehler beim Speichern von '{tender.title}': {e}")

    logger.info(f"[DB] {new_count} neue Ausschreibungen gespeichert.")
    return new_count
