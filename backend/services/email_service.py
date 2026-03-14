"""
Daily email digest per profile.
Adapted from TenderWatch v2 mailer to work with Supabase data.
"""

import os
import smtplib
import json
import logging
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from db.supabase_client import get_client

logger = logging.getLogger(__name__)


async def send_digests():
    """
    Find all profiles with daily_email_enabled=true,
    get the user's email, build and send the digest.
    """
    client = get_client()

    # Get all profiles with email enabled + user email
    profiles_result = client.table("profiles").select(
        "id, name, user_id, daily_email_enabled"
    ).eq("daily_email_enabled", True).execute()

    for profile in profiles_result.data:
        try:
            # Get user email via auth admin API
            user = client.auth.admin.get_user_by_id(profile["user_id"])
            email = user.user.email if user and user.user else None
            if not email:
                continue

            tenders = _get_todays_tenders(profile["id"])
            if not tenders:
                logger.info(f"Keine Ausschreibungen für {profile['name']} – kein E-Mail")
                continue

            # Build recipient list: user + distribution list
            recipients = [email]
            try:
                dist_result = client.table("email_recipients").select("email").eq(
                    "profile_id", profile["id"]
                ).execute()
                recipients += [r["email"] for r in dist_result.data if r["email"] != email]
            except Exception as e:
                logger.warning(f"Konnte E-Mail-Verteiler nicht laden: {e}")

            html = _build_html(tenders, profile["name"])
            _send_smtp(recipients, f"TenderWatch – {profile['name']} – {datetime.now().strftime('%d.%m.%Y')}", html)
            logger.info(f"Digest versendet an {', '.join(recipients)} für Profil '{profile['name']}'")

        except Exception as e:
            logger.error(f"Digest Fehler für Profil {profile['id']}: {e}")


def _get_todays_tenders(profile_id: str, min_score: int = 3, limit: int = 25) -> list:
    client = get_client()
    grenze = (datetime.now() - timedelta(days=1)).isoformat()

    scores_result = client.table("tender_scores").select(
        "tender_id, score, matched_keywords, tenders(*)"
    ).eq("profile_id", profile_id).gte("score", min_score).gte(
        "scored_at", grenze
    ).order("score", desc=True).limit(limit).execute()

    results = []
    for row in scores_result.data:
        if row.get("tenders"):
            results.append({
                **row["tenders"],
                "score": row["score"],
                "matched_keywords": row["matched_keywords"] or [],
            })
    return results


def _score_color(score: int) -> str:
    if score >= 8: return "#16a34a"
    if score >= 5: return "#d97706"
    if score >= 3: return "#6b7280"
    return "#9ca3af"


def _build_html(tenders: list, profile_name: str) -> str:
    datum = datetime.now().strftime("%d.%m.%Y")
    rows = ""
    for t in tenders:
        score = t.get("score", 0)
        farbe = _score_color(score)
        kws = ", ".join(t.get("matched_keywords") or [])
        links = ""
        if t.get("url"):
            links += f'<a href="{t["url"]}" style="color:#2563eb">Details</a>'
        if t.get("pdf_url"):
            links += f' · <a href="{t["pdf_url"]}" style="color:#2563eb">PDF</a>'

        rows += f"""
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:10px;text-align:center">
            <span style="background:{farbe};color:white;border-radius:12px;
              padding:3px 10px;font-weight:bold">{score}/10</span>
          </td>
          <td style="padding:10px">
            <div style="font-weight:600">{t.get('title','')}</div>
            <div style="color:#6b7280;font-size:12px">{t.get('client','') or ''} · {t.get('platform','')}</div>
            {"<div style='color:#374151;font-size:12px;margin-top:4px'>" + t.get('summary','') + "</div>" if t.get('summary') else ""}
            {"<div style='font-size:11px;color:#6b7280;margin-top:4px'>Keywords: " + kws + "</div>" if kws else ""}
            {"<div style='margin-top:6px;font-size:12px'>" + links + "</div>" if links else ""}
          </td>
          <td style="padding:10px;color:#6b7280;font-size:12px;white-space:nowrap">
            {t.get('deadline','') or '–'}
          </td>
        </tr>"""

    web_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return f"""<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0">
  <table width="100%" cellspacing="0" cellpadding="0">
    <tr><td style="background:#1e3a5f;padding:24px 32px">
      <h1 style="color:white;margin:0;font-size:22px">TenderWatch</h1>
      <p style="color:#93c5fd;margin:4px 0 0">{profile_name} · {datum}</p>
    </td></tr>
    <tr><td style="padding:24px 32px">
      <table width="100%" cellspacing="0">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:8px;width:80px">Score</th>
          <th style="padding:8px;text-align:left">Ausschreibung</th>
          <th style="padding:8px;width:90px">Frist</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </td></tr>
    <tr><td style="background:#1e3a5f;padding:16px 32px;text-align:center">
      <a href="{web_url}" style="color:#93c5fd;font-size:13px">TenderWatch öffnen</a>
    </td></tr>
  </table>
</body></html>"""


def _send_smtp(recipients: list, subject: str, html: str):
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")

    if not user or not password:
        logger.error("SMTP nicht konfiguriert")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText("TenderWatch – Bitte HTML-Ansicht verwenden.", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(user, recipients, msg.as_string())
