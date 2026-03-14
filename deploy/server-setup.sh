#!/bin/bash
# TenderWatch – Hetzner Server Setup Script
# Run once as root on a fresh Ubuntu 24.04 server
# Usage: bash server-setup.sh

set -e

echo "=== TenderWatch Server Setup ==="

# ── 1. System update ──────────────────────────────────────────────
apt-get update && apt-get upgrade -y
apt-get install -y nginx certbot python3-certbot-nginx python3.12 python3.12-venv \
    python3-pip unzip git curl ufw

# ── 2. Firewall ────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo "Firewall konfiguriert"

# ── 3. Create app user ────────────────────────────────────────────
if ! id tenderwatch &>/dev/null; then
    useradd -m -s /bin/bash tenderwatch
    echo "User 'tenderwatch' erstellt"
fi

# ── 4. Create directory structure ─────────────────────────────────
mkdir -p /opt/tenderwatch-saas
chown tenderwatch:tenderwatch /opt/tenderwatch-saas

# ── 5. Copy project (assumes ZIP was uploaded to /tmp) ───────────
if [ -f /tmp/tenderwatch-saas.zip ]; then
    unzip -o /tmp/tenderwatch-saas.zip -d /opt/
    chown -R tenderwatch:tenderwatch /opt/tenderwatch-saas
    echo "Projekt entpackt"
else
    echo "HINWEIS: /tmp/tenderwatch-saas.zip nicht gefunden."
    echo "Bitte erst ZIP hochladen: scp tenderwatch-saas.zip root@<IP>:/tmp/"
fi

# ── 6. Python virtualenv + dependencies ──────────────────────────
cd /opt/tenderwatch-saas
python3.12 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r backend/requirements.txt
chown -R tenderwatch:tenderwatch /opt/tenderwatch-saas/venv
echo "Python-Abhängigkeiten installiert"

# ── 7. .env file ─────────────────────────────────────────────────
if [ ! -f /opt/tenderwatch-saas/backend/.env ]; then
    cp /opt/tenderwatch-saas/backend/.env.example /opt/tenderwatch-saas/backend/.env
    echo ""
    echo "⚠️  WICHTIG: Bitte .env ausfüllen:"
    echo "   nano /opt/tenderwatch-saas/backend/.env"
fi

# ── 8. Nginx config ───────────────────────────────────────────────
cp /opt/tenderwatch-saas/deploy/nginx.conf /etc/nginx/sites-available/tenderwatch
ln -sf /etc/nginx/sites-available/tenderwatch /etc/nginx/sites-enabled/tenderwatch
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Nginx konfiguriert"

# ── 9. Systemd services ───────────────────────────────────────────
cp /opt/tenderwatch-saas/deploy/tenderwatch-api.service /etc/systemd/system/
cp /opt/tenderwatch-saas/deploy/tenderwatch-scheduler.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tenderwatch-api tenderwatch-scheduler
echo "Systemd Services registriert (noch nicht gestartet)"

# ── 10. TLS with Let's Encrypt ────────────────────────────────────
echo ""
echo "=== Nächster Schritt: TLS-Zertifikat erstellen ==="
echo "Führe aus:"
echo "  certbot --nginx -d api.tenderw.com"
echo ""
echo "Dann Services starten:"
echo "  systemctl start tenderwatch-api tenderwatch-scheduler"
echo ""
echo "=== Setup abgeschlossen ==="
