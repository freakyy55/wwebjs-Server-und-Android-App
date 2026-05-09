#!/usr/bin/env bash
set -Eeuo pipefail

# OwnMessenger Linux Installer
# Erstellt einen systemd-Service, damit der Node.js-Server nach Reboot automatisch startet.
#
# Nutzung:
#   ./install.sh
#   ./install.sh --install-start
#   ./install.sh --start
#   ./install.sh --stop
#   ./install.sh --restart
#   ./install.sh --logs
#   ./install.sh --status
#   ./install.sh --key
#   ./install.sh --git-update

APP_NAME="OwnMessenger"
SERVICE_NAME="ownmessenger"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

REQUIRED_NODE_MAJOR=18
PREFERRED_NODE_MAJOR=20
APT_UPDATED=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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
    local file=".env"

    if [ ! -f "$file" ]; then
        return 0
    fi

    grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2- | sed 's/^["'\'']//;s/["'\'']$//'
}

set_env_value() {
    local key="$1"
    local value="$2"
    local file=".env"

    local escaped_value
    escaped_value="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"

    if grep -qE "^${key}=" "$file"; then
        sed -i.bak "s/^${key}=.*/${key}=${escaped_value}/" "$file"
        rm -f "${file}.bak"
    else
        printf '\n%s=%s\n' "$key" "$value" >> "$file"
    fi
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
        fail "npm konnte nicht installiert werden. Bitte manuell prüfen: apt install -y npm"
    fi

    log "npm gefunden: $(npm -v)"
}

prepare_env_file() {
    log "Prüfe .env-Konfiguration..."

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
APP_TOKEN=
EOF
            log ".env wurde neu erstellt."
        fi
    else
        log ".env ist bereits vorhanden."
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
}

prepare_directories() {
    log "Erstelle benötigte Ordner..."

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
}

install_npm_dependencies() {
    if [ ! -f "package.json" ]; then
        fail "package.json wurde im aktuellen Ordner nicht gefunden: $SCRIPT_DIR"
    fi

    if ! command_exists npm; then
        fail "npm fehlt. Installation kann nicht fortgesetzt werden."
    fi

    log "Installiere npm-Abhängigkeiten..."

    npm config set fund false >/dev/null 2>&1 || true
    npm config set audit false >/dev/null 2>&1 || true

    npm install
}

detect_start_command() {
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
    local service_user
    local service_group
    local node_bin
    local npm_bin
    local path_env

    start_cmd="$(detect_start_command)"
    service_user="$(id -un)"
    service_group="$(id -gn)"
    node_bin="$(command -v node)"
    npm_bin="$(command -v npm)"
    path_env="$(dirname "$node_bin"):$(dirname "$npm_bin"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

    log "Erstelle systemd-Service: ${SERVICE_FILE}"
    log "Service-Benutzer: ${service_user}"
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
User=${service_user}
Group=${service_group}
WorkingDirectory=${SCRIPT_DIR}
Environment=NODE_ENV=production
Environment=PATH=${path_env}
EnvironmentFile=-${SCRIPT_DIR}/.env
ExecStart=/bin/bash -lc 'cd "${SCRIPT_DIR}" && exec ${start_cmd}'
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=30
SyslogIdentifier=${SERVICE_NAME}

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
        log "Server läuft über systemd."
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

show_status() {
    echo
    log "Status:"
    echo "Ordner:      $SCRIPT_DIR"
    echo "Node.js:     $(command_exists node && node -v || echo 'nicht gefunden')"
    echo "npm:         $(command_exists npm && npm -v || echo 'nicht gefunden')"
    echo "Browser:     $(browser_path || echo 'nicht gefunden')"
    echo "clamscan:    $(command_exists clamscan && command -v clamscan || echo 'nicht gefunden')"

    if [ -f ".env" ]; then
        local token
        token="$(get_env_value APP_TOKEN || true)"
        if [ -n "$token" ]; then
            echo "APP_TOKEN:   gesetzt"
        else
            echo "APP_TOKEN:   leer"
        fi
    else
        echo ".env:        nicht vorhanden"
    fi

    if command_exists systemctl; then
        echo "Service:     $(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || echo 'nicht eingerichtet')"
        echo "Läuft:       $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo 'nicht aktiv')"
    else
        echo "Service:     systemctl nicht gefunden"
    fi

    echo
}

show_app_key() {
    if [ ! -f ".env" ]; then
        fail ".env wurde nicht gefunden."
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
    repo_root="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"

    if [ -z "$repo_root" ]; then
        fail "Dieser Ordner ist kein Git-Repository."
    fi

    log "Aktualisiere Projekt aus Git: $repo_root"

    git -C "$repo_root" fetch origin
    git -C "$repo_root" pull --ff-only

    log "Git-Update abgeschlossen."

    if [ -f "$SCRIPT_DIR/package.json" ]; then
        install_npm_dependencies
    fi

    if command_exists systemctl && systemctl list-unit-files | grep -q "^${SERVICE_NAME}.service"; then
        restart_service
    fi
}

install_everything() {
    require_linux
    install_basic_packages
    install_nodejs_and_npm
    install_browser_dependencies
    install_chromium_if_missing
    install_clamav_if_available
    prepare_env_file
    prepare_directories
    install_npm_dependencies
    create_systemd_service
    show_status
}

install_and_start() {
    install_everything
    start_service
}

print_menu() {
    clear || true
    echo "=========================================="
    echo " OwnMessenger Linux Installer"
    echo "=========================================="
    echo
    echo "1) Alles installieren/vorbereiten und Server dauerhaft starten"
    echo "2) Nur installieren/vorbereiten und Autostart-Service einrichten"
    echo "3) Server starten"
    echo "4) Server neu starten"
    echo "5) Server stoppen"
    echo "6) Server-Logs anzeigen"
    echo "7) App-Key anzeigen"
    echo "8) Status anzeigen"
    echo "9) Aus Git aktualisieren und Server neu starten"
    echo "10) Autostart deaktivieren"
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
                start_service
                read -r -p "Fertig. Enter drücken..."
                ;;
            4)
                restart_service
                read -r -p "Fertig. Enter drücken..."
                ;;
            5)
                stop_service
                read -r -p "Fertig. Enter drücken..."
                ;;
            6)
                show_logs
                ;;
            7)
                show_app_key
                read -r -p "Enter drücken..."
                ;;
            8)
                show_status
                show_service_status
                read -r -p "Enter drücken..."
                ;;
            9)
                git_update
                read -r -p "Fertig. Enter drücken..."
                ;;
            10)
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

case "${1:-}" in
    --install)
        install_everything
        ;;
    --start)
        start_service
        ;;
    --install-start)
        install_and_start
        ;;
    --restart)
        restart_service
        ;;
    --stop)
        stop_service
        ;;
    --logs)
        show_logs
        ;;
    --key)
        show_app_key
        ;;
    --status)
        show_status
        show_service_status
        ;;
    --git-update)
        git_update
        ;;
    --disable-autostart)
        disable_service
        ;;
    --help|-h)
        echo "Nutzung:"
        echo "  ./install.sh                     Menü öffnen"
        echo "  ./install.sh --install           Installieren und systemd-Autostart einrichten"
        echo "  ./install.sh --install-start     Installieren, Autostart einrichten und starten"
        echo "  ./install.sh --start             Server starten"
        echo "  ./install.sh --restart           Server neu starten"
        echo "  ./install.sh --stop              Server stoppen"
        echo "  ./install.sh --logs              Live-Logs anzeigen"
        echo "  ./install.sh --key               App-Key anzeigen"
        echo "  ./install.sh --status            Status anzeigen"
        echo "  ./install.sh --git-update        Aus Git aktualisieren und Server neu starten"
        echo "  ./install.sh --disable-autostart Autostart deaktivieren"
        ;;
    "")
        main_menu
        ;;
    *)
        fail "Unbekannter Parameter: $1"
        ;;
esac
