#!/usr/bin/env bash
set -Eeuo pipefail

# OwnMessenger Linux Installer
#
# Funktionen:
# - installiert Node.js/npm und benötigte Pakete
# - erstellt eigenen Systembenutzer "ownmessenger"
# - kopiert Server nach /opt/ownmessenger/server_linux
# - führt npm install als Benutzer ownmessenger aus
# - startet Node.js NICHT als root
# - erstellt systemd-Service mit Autostart nach Reboot
# - fragt optional nach einer Domain
# - prüft, ob die Domain auf die Server-IP zeigt
# - installiert/konfiguriert Caddy als HTTPS-Reverse-Proxy
#
# Nutzung:
#   ./install.sh
#   ./install.sh --install-start
#   ./install.sh --install-start --domain bg-island.de
#   ./install.sh --domain bg-island.de
#   ./install.sh --git-update
#   ./install.sh --logs
#   ./install.sh --status

APP_NAME="OwnMessenger"

SERVICE_NAME="ownmessenger"
APP_USER="ownmessenger"
APP_GROUP="ownmessenger"
APP_HOME="/opt/ownmessenger"
INSTALL_DIR="${APP_HOME}/server_linux"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

CADDY_SERVICE="caddy"
CADDYFILE="/etc/caddy/Caddyfile"

REQUIRED_NODE_MAJOR=18
PREFERRED_NODE_MAJOR=20
APT_UPDATED=0

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SOURCE_DIR"

DOMAIN=""
ASSUME_YES=0
SKIP_DOMAIN=0

log() {
    echo "[${APP_NAME}] $*"
}

warn() {
    echo "[Hinweis] $*" >&2
}

fail() {
    echo "[Fehler] $*" >&2
    exit 1
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

run_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        if ! command_exists sudo; then
            fail "Dieses Script benötigt Root-Rechte oder sudo."
        fi
        sudo "$@"
    fi
}

run_as_app_user() {
    run_root runuser -u "$APP_USER" -- "$@"
}

is_apt_system() {
    command_exists apt-get
}

apt_update_once() {
    if [ "$APT_UPDATED" -eq 0 ]; then
        log "Aktualisiere Paketlisten..."
        run_root apt-get update
        APT_UPDATED=1
    fi
}

apt_install() {
    apt_update_once
    DEBIAN_FRONTEND=noninteractive run_root apt-get install -y "$@"
}

apt_install_if_available() {
    local available=()

    apt_update_once

    for pkg in "$@"; do
        if apt-cache show "$pkg" >/dev/null 2>&1; then
            available+=("$pkg")
        else
            warn "Paket nicht verfügbar und wird übersprungen: $pkg"
        fi
    done

    if [ "${#available[@]}" -gt 0 ]; then
        DEBIAN_FRONTEND=noninteractive run_root apt-get install -y "${available[@]}"
    fi
}

node_major_version() {
    if command_exists node; then
        node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

browser_path() {
    if command_exists chromium; then
        command -v chromium
    elif command_exists chromium-browser; then
        command -v chromium-browser
    elif command_exists google-chrome-stable; then
        command -v google-chrome-stable
    elif command_exists google-chrome; then
        command -v google-chrome
    else
        true
    fi
}

generate_token() {
    if command_exists openssl; then
        openssl rand -hex 32
    elif command_exists node; then
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    else
        date +%s%N | sha256sum | awk '{print $1}'
    fi
}

get_env_value() {
    local key="$1"
    local file="${APP_DIR}/.env"

    if [ ! -f "$file" ]; then
        return 0
    fi

    grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2- | sed 's/^["'\'']//;s/["'\'']$//'
}

set_env_value() {
    local key="$1"
    local value="$2"
    local file="${APP_DIR}/.env"

    local escaped_value
    escaped_value="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"

    if grep -qE "^${key}=" "$file"; then
        sed -i.bak "s/^${key}=.*/${key}=${escaped_value}/" "$file"
        rm -f "${file}.bak"
    else
        printf '\n%s=%s\n' "$key" "$value" >> "$file"
    fi
}

confirm_yes_no() {
    local prompt="$1"
    local default="${2:-n}"
    local answer=""

    if [ "$ASSUME_YES" -eq 1 ]; then
        return 0
    fi

    if [ "$default" = "y" ]; then
        read -r -p "${prompt} [J/n]: " answer
        answer="${answer:-j}"
    else
        read -r -p "${prompt} [j/N]: " answer
        answer="${answer:-n}"
    fi

    case "$answer" in
        j|J|ja|JA|y|Y|yes|YES)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

require_linux() {
    if [ "$(uname -s)" != "Linux" ]; then
        fail "Dieses Script ist nur für Linux gedacht."
    fi

    if ! is_apt_system; then
        fail "Dieses Script unterstützt aktuell apt-basierte Systeme wie Debian, Ubuntu und Pop!_OS."
    fi
}

install_basic_packages() {
    log "Installiere Basispakete..."

    apt_install_if_available \
        ca-certificates \
        curl \
        wget \
        gnupg \
        git \
        rsync \
        build-essential \
        python3 \
        make \
        g++ \
        openssl \
        ffmpeg
}

install_browser_dependencies() {
    log "Installiere Browser-Abhängigkeiten..."

    apt_install_if_available \
        libnss3 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libgtk-3-0 \
        libgbm1 \
        libxss1 \
        libxshmfence1 \
        libasound2 \
        libasound2t64 \
        fonts-liberation \
        xdg-utils
}

install_chromium_if_missing() {
    local chrome
    chrome="$(browser_path || true)"

    if [ -n "$chrome" ]; then
        log "Browser gefunden: $chrome"
        return 0
    fi

    log "Chromium/Chrome wurde nicht gefunden. Versuche Chromium zu installieren..."

    apt_update_once

    if apt-cache show chromium >/dev/null 2>&1; then
        apt_install chromium
    elif apt-cache show chromium-browser >/dev/null 2>&1; then
        apt_install chromium-browser
    else
        warn "Kein Chromium-Paket gefunden. WhatsApp-Web/Puppeteer kann eventuell nicht starten."
    fi

    chrome="$(browser_path || true)"

    if [ -n "$chrome" ]; then
        log "Browser nach Installation gefunden: $chrome"
    else
        warn "Es wurde kein Chromium/Chrome-Binary gefunden."
    fi
}

install_clamav_if_available() {
    if command_exists clamscan; then
        log "clamscan gefunden: $(command -v clamscan)"
        return 0
    fi

    log "clamscan wurde nicht gefunden. Versuche ClamAV zu installieren..."

    apt_install_if_available clamav clamav-daemon clamav-freshclam

    if command_exists freshclam; then
        log "Aktualisiere ClamAV-Signaturen, falls möglich..."
        run_root freshclam || warn "freshclam konnte nicht erfolgreich ausgeführt werden. Das ist nicht kritisch."
    fi

    if command_exists clamscan; then
        log "clamscan gefunden: $(command -v clamscan)"
    else
        warn "clamscan wurde nicht gefunden. Virenprüfung läuft dann nicht oder nur eingeschränkt."
    fi
}

install_nodesource_node() {
    log "Installiere Node.js ${PREFERRED_NODE_MAJOR}.x über NodeSource..."

    apt_install_if_available ca-certificates curl gnupg

    if curl -fsSL "https://deb.nodesource.com/setup_${PREFERRED_NODE_MAJOR}.x" | run_root bash -; then
        apt_install nodejs
    else
        warn "NodeSource-Installation fehlgeschlagen. Versuche Node.js/npm über die Distribution zu installieren."
        apt_install_if_available nodejs npm
    fi
}

install_nodejs_and_npm() {
    local major
    major="$(node_major_version)"

    if [ "$major" -ge "$REQUIRED_NODE_MAJOR" ]; then
        log "Node.js gefunden: $(node -v)"
    else
        if command_exists node; then
            warn "Node.js ist zu alt: $(node -v). Benötigt wird Node.js ${REQUIRED_NODE_MAJOR} oder neuer."
        else
            log "Node.js wurde nicht gefunden."
        fi

        install_nodesource_node
    fi

    major="$(node_major_version)"

    if [ "$major" -lt "$REQUIRED_NODE_MAJOR" ]; then
        warn "NodeSource konnte keine passende Node.js-Version installieren. Versuche apt-Fallback..."
        apt_install_if_available nodejs npm
        major="$(node_major_version)"
    fi

    if [ "$major" -lt "$REQUIRED_NODE_MAJOR" ]; then
        fail "Node.js ${REQUIRED_NODE_MAJOR} oder neuer konnte nicht installiert werden. Aktuell: $(command_exists node && node -v || echo 'nicht installiert')"
    fi

    log "Node.js nach Installation: $(node -v)"

    if ! command_exists npm; then
        warn "npm wurde nicht gefunden. Installiere npm separat..."
        apt_install_if_available npm
    fi

    if ! command_exists npm; then
        fail "npm konnte nicht installiert werden. Bitte manuell prüfen: apt-get install -y npm"
    fi

    log "npm gefunden: $(npm -v)"
}

create_app_user() {
    log "Prüfe Systembenutzer ${APP_USER}..."

    if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
        run_root groupadd --system "$APP_GROUP"
        log "Gruppe ${APP_GROUP} wurde erstellt."
    fi

    if ! id "$APP_USER" >/dev/null 2>&1; then
        run_root useradd \
            --system \
            --gid "$APP_GROUP" \
            --home-dir "$APP_HOME" \
            --create-home \
            --shell /bin/bash \
            "$APP_USER"
        log "Benutzer ${APP_USER} wurde erstellt."
    else
        log "Benutzer ${APP_USER} existiert bereits."
    fi

    run_root mkdir -p "$APP_HOME"
    run_root chown -R "${APP_USER}:${APP_GROUP}" "$APP_HOME"
}

sync_to_install_dir() {
    if [ "$SOURCE_DIR" = "$INSTALL_DIR" ]; then
        APP_DIR="$INSTALL_DIR"
        cd "$APP_DIR"
        return 0
    fi

    log "Kopiere Server-Dateien nach ${INSTALL_DIR}..."

    run_root mkdir -p "$INSTALL_DIR"

    if command_exists rsync; then
        run_root rsync -a \
            --delete \
            --exclude ".git" \
            --exclude "node_modules" \
            --exclude ".env" \
            --exclude ".wwebjs_auth" \
            --exclude ".wwebjs_cache" \
            --exclude "sessions" \
            --exclude "logs" \
            --exclude "tmp" \
            --exclude "uploads" \
            --exclude "downloads" \
            --exclude "media" \
            --exclude "data" \
            "${SOURCE_DIR}/" "${INSTALL_DIR}/"
    else
        warn "rsync wurde nicht gefunden. Verwende cp-Fallback."
        run_root cp -a "${SOURCE_DIR}/." "$INSTALL_DIR/"
    fi

    APP_DIR="$INSTALL_DIR"
    run_root chown -R "${APP_USER}:${APP_GROUP}" "$APP_HOME"
    cd "$APP_DIR"
}

prepare_env_file() {
    log "Prüfe .env-Konfiguration..."

    cd "$APP_DIR"

    if [ ! -f ".env" ]; then
        if [ -f ".env.linux.example" ]; then
            cp ".env.linux.example" ".env"
            log ".env wurde aus .env.linux.example erstellt."
        elif [ -f ".env.example" ]; then
            cp ".env.example" ".env"
            log ".env wurde aus .env.example erstellt."
        else
            cat > ".env" <<'EOF'
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
APP_TOKEN=
EOF
            log ".env wurde neu erstellt."
        fi
    else
        log ".env ist bereits vorhanden."
    fi

    if ! grep -qE "^PORT=" ".env"; then
        printf '\nPORT=3000\n' >> ".env"
    fi

    # Für HTTPS über Caddy soll Node.js nur lokal erreichbar sein.
    if grep -qE "^HOST=" ".env"; then
        sed -i.bak "s/^HOST=.*/HOST=127.0.0.1/" ".env"
        rm -f ".env.bak"
    else
        printf '\nHOST=127.0.0.1\n' >> ".env"
    fi

    if ! grep -qE "^APP_TOKEN=" ".env"; then
        printf '\nAPP_TOKEN=\n' >> ".env"
    fi

    local current_token
    current_token="$(get_env_value APP_TOKEN || true)"

    if [ -z "$current_token" ]; then
        local new_token
        new_token="$(generate_token)"
        set_env_value "APP_TOKEN" "$new_token"

        echo
        log "Neuer App-Key wurde erzeugt:"
        echo "$new_token"
        echo
        warn "Diesen App-Key später in der Android-App eintragen."
    else
        log "APP_TOKEN ist bereits gesetzt."
    fi

    local chrome
    chrome="$(browser_path || true)"

    if [ -n "$chrome" ]; then
        if ! grep -qE "^(CHROME_PATH|CHROME_EXECUTABLE_PATH|PUPPETEER_EXECUTABLE_PATH)=" ".env"; then
            set_env_value "CHROME_EXECUTABLE_PATH" "$chrome"
            set_env_value "PUPPETEER_EXECUTABLE_PATH" "$chrome"
            log "Browser-Pfad wurde in .env gesetzt: $chrome"
        fi
    fi

    if [ -n "$DOMAIN" ]; then
        set_env_value "PUBLIC_DOMAIN" "$DOMAIN"
        set_env_value "PUBLIC_URL" "https://${DOMAIN}"
    fi

    run_root chown "${APP_USER}:${APP_GROUP}" ".env"
    run_root chmod 600 ".env"
}

prepare_directories() {
    log "Erstelle benötigte Ordner..."

    cd "$APP_DIR"

    mkdir -p \
        logs \
        data \
        tmp \
        uploads \
        downloads \
        media \
        sessions \
        .wwebjs_auth \
        .wwebjs_cache

    run_root chown -R "${APP_USER}:${APP_GROUP}" "$APP_HOME"
}

install_npm_dependencies() {
    cd "$APP_DIR"

    if [ ! -f "package.json" ]; then
        fail "package.json wurde im Installationsordner nicht gefunden: $APP_DIR"
    fi

    if ! command_exists npm; then
        fail "npm fehlt. Installation kann nicht fortgesetzt werden."
    fi

    log "Installiere npm-Abhängigkeiten als Benutzer ${APP_USER}..."

    run_root chown -R "${APP_USER}:${APP_GROUP}" "$APP_HOME"

    run_as_app_user bash -lc "
        cd '$APP_DIR'
        npm config set fund false >/dev/null 2>&1 || true
        npm config set audit false >/dev/null 2>&1 || true
        npm install
    "
}

detect_start_command() {
    cd "$APP_DIR"

    if [ ! -f "package.json" ]; then
        fail "package.json wurde nicht gefunden."
    fi

    if grep -qE '"start"[[:space:]]*:' package.json; then
        echo "$(command -v npm) start"
    elif [ -f "server.js" ]; then
        echo "$(command -v node) server.js"
    elif [ -f "index.js" ]; then
        echo "$(command -v node) index.js"
    elif [ -f "app.js" ]; then
        echo "$(command -v node) app.js"
    else
        fail "Kein Start-Script gefunden. Bitte package.json prüfen."
    fi
}

create_systemd_service() {
    if ! command_exists systemctl; then
        fail "systemd/systemctl wurde nicht gefunden. Autostart nach Reboot kann nicht eingerichtet werden."
    fi

    local start_cmd
    local node_bin
    local npm_bin
    local path_env

    start_cmd="$(detect_start_command)"
    node_bin="$(command -v node)"
    npm_bin="$(command -v npm)"
    path_env="$(dirname "$node_bin"):$(dirname "$npm_bin"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

    log "Erstelle systemd-Service: ${SERVICE_FILE}"
    log "Service-Benutzer: ${APP_USER}"
    log "Installationsordner: ${APP_DIR}"
    log "Start-Befehl: ${start_cmd}"

    local tmp_file
    tmp_file="$(mktemp)"

    cat > "$tmp_file" <<EOF
[Unit]
Description=OwnMessenger Node.js Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=HOME=${APP_HOME}
Environment=PATH=${path_env}
EnvironmentFile=-${APP_DIR}/.env
ExecStart=/bin/bash -lc 'cd "${APP_DIR}" && exec ${start_cmd}'
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=30
SyslogIdentifier=${SERVICE_NAME}
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    run_root mv "$tmp_file" "$SERVICE_FILE"
    run_root chmod 644 "$SERVICE_FILE"

    run_root systemctl daemon-reload
    run_root systemctl enable "$SERVICE_NAME"

    log "systemd-Service wurde erstellt und für Autostart aktiviert."
}

start_service() {
    create_systemd_service

    log "Starte ${SERVICE_NAME}.service..."
    run_root systemctl restart "$SERVICE_NAME"

    sleep 2

    if run_root systemctl is-active --quiet "$SERVICE_NAME"; then
        log "Server läuft über systemd als Benutzer ${APP_USER}."
    else
        warn "Service ist nicht aktiv. Zeige Status:"
        run_root systemctl status "$SERVICE_NAME" --no-pager || true
        fail "Server konnte nicht gestartet werden."
    fi
}

stop_service() {
    if command_exists systemctl; then
        run_root systemctl stop "$SERVICE_NAME" || true
        log "Service wurde gestoppt."
    else
        warn "systemctl wurde nicht gefunden."
    fi
}

restart_service() {
    if [ ! -f "$SERVICE_FILE" ]; then
        create_systemd_service
    fi

    run_root systemctl daemon-reload
    run_root systemctl restart "$SERVICE_NAME"

    sleep 2

    if run_root systemctl is-active --quiet "$SERVICE_NAME"; then
        log "Service wurde neu gestartet."
    else
        warn "Service ist nicht aktiv. Zeige Status:"
        run_root systemctl status "$SERVICE_NAME" --no-pager || true
        fail "Neustart fehlgeschlagen."
    fi
}

disable_service() {
    if command_exists systemctl; then
        run_root systemctl disable "$SERVICE_NAME" || true
        log "Autostart wurde deaktiviert."
    else
        warn "systemctl wurde nicht gefunden."
    fi
}

show_logs() {
    if ! command_exists journalctl; then
        fail "journalctl wurde nicht gefunden."
    fi

    run_root journalctl -u "$SERVICE_NAME" -f
}

show_service_status() {
    if command_exists systemctl; then
        run_root systemctl status "$SERVICE_NAME" --no-pager || true
    else
        warn "systemctl wurde nicht gefunden."
    fi
}

sanitize_domain() {
    local input="$1"

    input="${input#http://}"
    input="${input#https://}"
    input="${input%%/*}"
    input="${input%%:*}"
    input="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

    printf '%s' "$input"
}

valid_domain() {
    local d="$1"

    if [ -z "$d" ]; then
        return 1
    fi

    if [[ "$d" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; then
        return 0
    fi

    return 1
}

ask_for_domain_if_needed() {
    if [ "$SKIP_DOMAIN" -eq 1 ]; then
        DOMAIN=""
        return 0
    fi

    if [ -n "$DOMAIN" ]; then
        DOMAIN="$(sanitize_domain "$DOMAIN")"
        if ! valid_domain "$DOMAIN"; then
            fail "Ungültige Domain: $DOMAIN"
        fi
        return 0
    fi

    echo
    echo "HTTPS-Domain einrichten"
    echo "Beispiel: bg-island.de oder test2.my-nav.eu"
    echo "Leer lassen, wenn du HTTPS/Caddy jetzt überspringen willst."
    echo

    local input=""
    read -r -p "Domain: " input

    input="$(sanitize_domain "$input")"

    if [ -z "$input" ]; then
        warn "Keine Domain angegeben. HTTPS/Caddy wird übersprungen."
        SKIP_DOMAIN=1
        DOMAIN=""
        return 0
    fi

    if ! valid_domain "$input"; then
        fail "Ungültige Domain: $input"
    fi

    DOMAIN="$input"
}

get_public_ipv4() {
    local ip=""

    if command_exists curl; then
        for url in \
            "https://api.ipify.org" \
            "https://ipv4.icanhazip.com" \
            "https://ifconfig.me/ip"
        do
            ip="$(curl -4fsS --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
            if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
                echo "$ip"
                return 0
            fi
        done
    fi

    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
        echo "$ip"
        return 0
    fi

    return 1
}

resolve_domain_ipv4() {
    local domain="$1"

    if command_exists getent; then
        getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u
        return 0
    fi

    return 1
}

check_domain_points_to_server() {
    local domain="$1"
    local public_ip=""
    local resolved_ips=""

    log "Prüfe DNS für Domain: $domain"

    public_ip="$(get_public_ipv4 || true)"
    resolved_ips="$(resolve_domain_ipv4 "$domain" || true)"

    echo
    echo "Server-IP laut Internet:"
    echo "${public_ip:-nicht ermittelbar}"
    echo
    echo "DNS-A-Record für ${domain}:"
    if [ -n "$resolved_ips" ]; then
        echo "$resolved_ips"
    else
        echo "keine IPv4-Adresse gefunden"
    fi
    echo

    if [ -z "$public_ip" ]; then
        warn "Die öffentliche Server-IP konnte nicht sicher ermittelt werden."
        if confirm_yes_no "Trotzdem mit dieser Domain fortfahren?" "n"; then
            return 0
        fi
        fail "Domain-Einrichtung abgebrochen."
    fi

    if [ -z "$resolved_ips" ]; then
        warn "Die Domain zeigt aktuell auf keine IPv4-Adresse."
        warn "Lege beim DNS-Anbieter einen A-Record an:"
        echo
        echo "Name:  @ oder Subdomain"
        echo "Typ:   A"
        echo "Wert:  $public_ip"
        echo "TTL:   3600"
        echo
        if confirm_yes_no "Trotzdem Caddy schon vorbereiten?" "n"; then
            return 0
        fi
        fail "Domain zeigt noch nicht auf diesen Server."
    fi

    if echo "$resolved_ips" | grep -qx "$public_ip"; then
        log "DNS passt: ${domain} zeigt auf ${public_ip}."
        return 0
    fi

    warn "DNS passt noch nicht."
    warn "Die Domain zeigt nicht auf die erkannte Server-IP."

    echo
    echo "Erwartet:"
    echo "$public_ip"
    echo
    echo "Aktuell gefunden:"
    echo "$resolved_ips"
    echo

    if confirm_yes_no "Trotzdem Caddy schon vorbereiten?" "n"; then
        return 0
    fi

    fail "Domain-Einrichtung abgebrochen. Bitte DNS-A-Record korrigieren."
}

install_caddy() {
    if command_exists caddy; then
        log "Caddy gefunden: $(caddy version 2>/dev/null || command -v caddy)"
        return 0
    fi

    log "Installiere Caddy für HTTPS-Reverse-Proxy..."
    apt_install_if_available caddy

    if ! command_exists caddy; then
        fail "Caddy konnte nicht installiert werden. Bitte Caddy manuell installieren oder Domain-Setup überspringen."
    fi

    log "Caddy installiert: $(caddy version 2>/dev/null || command -v caddy)"
}

configure_caddy() {
    local domain="$1"

    if [ -z "$domain" ]; then
        warn "Keine Domain angegeben. Caddy-Konfiguration wird übersprungen."
        return 0
    fi

    install_caddy

    run_root mkdir -p /etc/caddy

    if [ -f "$CADDYFILE" ]; then
        local backup="${CADDYFILE}.bak.$(date +%Y%m%d-%H%M%S)"
        run_root cp "$CADDYFILE" "$backup"
        log "Backup der alten Caddyfile erstellt: $backup"
    fi

    log "Schreibe Caddy-Konfiguration für ${domain}..."

    local tmp_file
    tmp_file="$(mktemp)"

    cat > "$tmp_file" <<EOF
${domain} {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
EOF

    run_root mv "$tmp_file" "$CADDYFILE"
    run_root chmod 644 "$CADDYFILE"

    if command_exists caddy; then
        run_root caddy validate --config "$CADDYFILE" || fail "Caddyfile ist ungültig."
    fi

    if command_exists systemctl; then
        run_root systemctl enable "$CADDY_SERVICE"
        run_root systemctl restart "$CADDY_SERVICE"

        sleep 2

        if run_root systemctl is-active --quiet "$CADDY_SERVICE"; then
            log "Caddy läuft."
        else
            warn "Caddy ist nicht aktiv. Status:"
            run_root systemctl status "$CADDY_SERVICE" --no-pager || true
            fail "Caddy konnte nicht gestartet werden."
        fi
    else
        warn "systemctl wurde nicht gefunden. Caddy wurde nicht als Service gestartet."
    fi

    log "HTTPS sollte erreichbar sein unter: https://${domain}"
}

configure_firewall_for_https() {
    if command_exists ufw; then
        local status
        status="$(ufw status 2>/dev/null | head -n 1 || true)"

        if echo "$status" | grep -qi "active\|aktiv"; then
            log "UFW ist aktiv. Öffne Port 80 und 443..."
            run_root ufw allow 80/tcp || true
            run_root ufw allow 443/tcp || true
            run_root ufw reload || true
        else
            log "UFW ist nicht aktiv oder nicht konfiguriert."
        fi
    fi
}

setup_domain_and_https() {
    ask_for_domain_if_needed

    if [ -z "$DOMAIN" ]; then
        return 0
    fi

    check_domain_points_to_server "$DOMAIN"

    APP_DIR="$INSTALL_DIR"
    cd "$APP_DIR"

    if [ -f ".env" ]; then
        set_env_value "HOST" "127.0.0.1"
        set_env_value "PUBLIC_DOMAIN" "$DOMAIN"
        set_env_value "PUBLIC_URL" "https://${DOMAIN}"
        run_root chown "${APP_USER}:${APP_GROUP}" ".env"
        run_root chmod 600 ".env"
    fi

    restart_service
    configure_firewall_for_https
    configure_caddy "$DOMAIN"

    echo
    log "Domain-Setup abgeschlossen."
    echo "URL: https://${DOMAIN}"
    echo
}

show_status() {
    echo
    log "Status:"
    echo "Quellordner:         $SOURCE_DIR"
    echo "Installationsordner: $APP_DIR"
    echo "Service-Benutzer:    $APP_USER"
    echo "Node.js:             $(command_exists node && node -v || echo 'nicht gefunden')"
    echo "npm:                 $(command_exists npm && npm -v || echo 'nicht gefunden')"
    echo "Browser:             $(browser_path || echo 'nicht gefunden')"
    echo "clamscan:            $(command_exists clamscan && command -v clamscan || echo 'nicht gefunden')"
    echo "Caddy:               $(command_exists caddy && (caddy version 2>/dev/null || command -v caddy) || echo 'nicht gefunden')"

    if [ -f "${APP_DIR}/.env" ]; then
        local token
        local host
        local port
        local public_url
        token="$(get_env_value APP_TOKEN || true)"
        host="$(get_env_value HOST || true)"
        port="$(get_env_value PORT || true)"
        public_url="$(get_env_value PUBLIC_URL || true)"

        if [ -n "$token" ]; then
            echo "APP_TOKEN:           gesetzt"
        else
            echo "APP_TOKEN:           leer"
        fi

        echo "HOST:                ${host:-nicht gesetzt}"
        echo "PORT:                ${port:-nicht gesetzt}"
        echo "PUBLIC_URL:          ${public_url:-nicht gesetzt}"
    else
        echo ".env:                nicht vorhanden"
    fi

    if command_exists systemctl; then
        echo "Service aktiviert:   $(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || echo 'nicht eingerichtet')"
        echo "Service läuft:       $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo 'nicht aktiv')"
        echo "Caddy aktiviert:     $(systemctl is-enabled "$CADDY_SERVICE" 2>/dev/null || echo 'nicht eingerichtet')"
        echo "Caddy läuft:         $(systemctl is-active "$CADDY_SERVICE" 2>/dev/null || echo 'nicht aktiv')"
    else
        echo "Service:             systemctl nicht gefunden"
    fi

    echo
}

show_app_key() {
    if [ ! -f "${APP_DIR}/.env" ]; then
        if [ -f "${INSTALL_DIR}/.env" ]; then
            APP_DIR="$INSTALL_DIR"
        else
            fail ".env wurde nicht gefunden."
        fi
    fi

    local token
    token="$(get_env_value APP_TOKEN || true)"

    if [ -z "$token" ]; then
        warn "APP_TOKEN ist leer."
    else
        echo
        log "App-Key:"
        echo "$token"
        echo
    fi
}

git_update() {
    if ! command_exists git; then
        fail "git wurde nicht gefunden."
    fi

    local repo_root
    repo_root="$(git -C "$SOURCE_DIR" rev-parse --show-toplevel 2>/dev/null || true)"

    if [ -z "$repo_root" ]; then
        fail "Dieser Quellordner ist kein Git-Repository."
    fi

    log "Aktualisiere Projekt aus Git: $repo_root"

    git -C "$repo_root" fetch origin
    git -C "$repo_root" pull --ff-only

    log "Git-Update abgeschlossen."

    sync_to_install_dir
    prepare_env_file
    prepare_directories
    install_npm_dependencies
    restart_service
}

install_everything() {
    require_linux
    install_basic_packages
    install_nodejs_and_npm
    install_browser_dependencies
    install_chromium_if_missing
    install_clamav_if_available
    create_app_user
    sync_to_install_dir
    prepare_env_file
    prepare_directories
    install_npm_dependencies
    create_systemd_service
    show_status
}

install_and_start() {
    install_everything
    start_service
    setup_domain_and_https
}

print_menu() {
    clear || true
    echo "=========================================="
    echo " OwnMessenger Linux Installer"
    echo "=========================================="
    echo
    echo "1) Alles installieren/vorbereiten, Domain abfragen und Server dauerhaft starten"
    echo "2) Nur installieren/vorbereiten und Autostart-Service einrichten"
    echo "3) Domain/HTTPS mit Caddy einrichten"
    echo "4) Server starten"
    echo "5) Server neu starten"
    echo "6) Server stoppen"
    echo "7) Server-Logs anzeigen"
    echo "8) App-Key anzeigen"
    echo "9) Status anzeigen"
    echo "10) Aus Git aktualisieren und Server neu starten"
    echo "11) Autostart deaktivieren"
    echo "0) Beenden"
    echo
}

main_menu() {
    while true; do
        print_menu
        read -r -p "Auswahl: " choice

        case "$choice" in
            1)
                install_and_start
                read -r -p "Fertig. Enter drücken..."
                ;;
            2)
                install_everything
                read -r -p "Fertig. Enter drücken..."
                ;;
            3)
                APP_DIR="$INSTALL_DIR"
                cd "$APP_DIR"
                setup_domain_and_https
                read -r -p "Fertig. Enter drücken..."
                ;;
            4)
                APP_DIR="$INSTALL_DIR"
                cd "$APP_DIR"
                start_service
                read -r -p "Fertig. Enter drücken..."
                ;;
            5)
                APP_DIR="$INSTALL_DIR"
                cd "$APP_DIR"
                restart_service
                read -r -p "Fertig. Enter drücken..."
                ;;
            6)
                stop_service
                read -r -p "Fertig. Enter drücken..."
                ;;
            7)
                show_logs
                ;;
            8)
                APP_DIR="$INSTALL_DIR"
                show_app_key
                read -r -p "Enter drücken..."
                ;;
            9)
                APP_DIR="$INSTALL_DIR"
                show_status
                show_service_status
                read -r -p "Enter drücken..."
                ;;
            10)
                git_update
                read -r -p "Fertig. Enter drücken..."
                ;;
            11)
                disable_service
                read -r -p "Fertig. Enter drücken..."
                ;;
            0)
                exit 0
                ;;
            *)
                warn "Ungültige Auswahl."
                sleep 1
                ;;
        esac
    done
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --domain)
                shift
                [ "$#" -gt 0 ] || fail "--domain benötigt einen Wert."
                DOMAIN="$1"
                ;;
            --yes|-y)
                ASSUME_YES=1
                ;;
            --skip-domain)
                SKIP_DOMAIN=1
                ;;
            --install|--start|--install-start|--restart|--stop|--logs|--key|--status|--git-update|--disable-autostart|--https|--help|-h)
                ACTION="$1"
                ;;
            *)
                if [ -z "${ACTION:-}" ]; then
                    ACTION="$1"
                else
                    fail "Unbekannter Parameter: $1"
                fi
                ;;
        esac
        shift
    done
}

ACTION=""

parse_args "$@"

case "${ACTION:-}" in
    --install)
        install_everything
        ;;
    --start)
        APP_DIR="$INSTALL_DIR"
        cd "$APP_DIR"
        start_service
        ;;
    --install-start)
        install_and_start
        ;;
    --restart)
        APP_DIR="$INSTALL_DIR"
        cd "$APP_DIR"
        restart_service
        ;;
    --stop)
        stop_service
        ;;
    --logs)
        show_logs
        ;;
    --key)
        APP_DIR="$INSTALL_DIR"
        show_app_key
        ;;
    --status)
        APP_DIR="$INSTALL_DIR"
        show_status
        show_service_status
        ;;
    --git-update)
        git_update
        ;;
    --https)
        APP_DIR="$INSTALL_DIR"
        cd "$APP_DIR"
        setup_domain_and_https
        ;;
    --disable-autostart)
        disable_service
        ;;
    --help|-h)
        echo "Nutzung:"
        echo "  ./install.sh                                      Menü öffnen"
        echo "  ./install.sh --install                            Installieren und systemd-Autostart einrichten"
        echo "  ./install.sh --install-start                      Installieren, Domain abfragen und starten"
        echo "  ./install.sh --install-start --domain bg-island.de"
        echo "  ./install.sh --https --domain bg-island.de        Nur HTTPS/Caddy einrichten"
        echo "  ./install.sh --start                              Server starten"
        echo "  ./install.sh --restart                            Server neu starten"
        echo "  ./install.sh --stop                               Server stoppen"
        echo "  ./install.sh --logs                               Live-Logs anzeigen"
        echo "  ./install.sh --key                                App-Key anzeigen"
        echo "  ./install.sh --status                             Status anzeigen"
        echo "  ./install.sh --git-update                         Aus Git aktualisieren und Server neu starten"
        echo "  ./install.sh --disable-autostart                  Autostart deaktivieren"
        echo
        echo "Optionen:"
        echo "  --domain DOMAIN    Domain direkt angeben"
        echo "  --skip-domain      Domain/HTTPS überspringen"
        echo "  --yes              Rückfragen automatisch mit Ja beantworten"
        ;;
    "")
        main_menu
        ;;
    *)
        fail "Unbekannter Parameter: ${ACTION}"
        ;;
esac
