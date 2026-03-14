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

from database.models import get_connection
from scraper.base import Tender

logger = logging.getLogger(__name__)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


def load_keywords_from_db() -> dict:
    """Lädt aktuelle Keywords aus der Datenbank."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT word, priority FROM keywords WHERE active=1")
    rows = cur.fetchall()
    conn.close()

    keywords = {"primary": [], "secondary": []}
    for row in rows:
        keywords[row["priority"]].append(row["word"])
    return keywords


def load_priority_clients() -> list[str]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT name FROM priority_clients WHERE active=1")
    clients = [r[0] for r in cur.fetchall()]
    conn.close()
    return clients


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

    prompt = f"""Du bist ein Experte für öffentliche Ausschreibungen im Bereich Ingenieurdienstleistungen.

Analysiere diese Ausschreibung:

TITEL: {tender.title}
AUFTRAGGEBER: {tender.client}
PLATTFORM: {tender.platform}
BESCHREIBUNG: {tender.description[:1500] if tender.description else "Nicht verfügbar"}

WICHTIGE KEYWORDS (Primär): {kw_list_primary}
WENIGER WICHTIGE KEYWORDS (Sekundär): {kw_list_secondary}

Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung):
{{
  "summary": "Zusammenfassung in maximal 20 deutschen Wörtern",
  "services": "Extrahierte Leistungen aus der Ausschreibung (kommagetrennt)",
  "score": <Zahl 0-10: 0=nicht relevant, 10=perfekt passend für Ingenieurdienstleistungen>,
  "score_reason": "Ein kurzer Satz warum dieser Score"
}}

Scoring-Kriterien:
- 8-10: Bauüberwachung, Bauoberleitung, Claim/Contract Management direkt gesucht
- 5-7: Verwandte Ingenieurleistungen, Projektsteuerung, technische Überwachung  
- 2-4: Möglicherweise relevant, aber unklar
- 0-1: Nicht relevant (Bauleistungen, Lieferungen, IT, etc.)"""

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
    """Speichert Tenders in DB. Gibt Anzahl neuer Einträge zurück."""
    conn = get_connection()
    cur = conn.cursor()
    new_count = 0

    for tender in tenders:
        if tender.score < 1:
            continue  # Irrelevante Tenders nicht speichern

        try:
            cur.execute("""
                INSERT OR IGNORE INTO tenders
                    (id, platform, title, client, services, description, summary,
                     score, matched_keywords, publication_date, deadline,
                     pdf_url, detail_url, country, cpv_codes)
                VALUES
                    (:id, :platform, :title, :client, :services, :description, :summary,
                     :score, :matched_keywords, :publication_date, :deadline,
                     :pdf_url, :detail_url, :country, :cpv_codes)
            """, tender.to_dict())

            if cur.rowcount > 0:
                new_count += 1
        except Exception as e:
            logger.error(f"[DB] Fehler beim Speichern von '{tender.title}': {e}")

    conn.commit()
    conn.close()
    logger.info(f"[DB] {new_count} neue Ausschreibungen gespeichert.")
    return new_count
