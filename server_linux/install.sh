#!/usr/bin/env bash
set -Eeuo pipefail

# OwnMessenger Linux Installer
# Unterstützt: Debian, Ubuntu, Pop!_OS und ähnliche apt-basierte Systeme

APP_NAME="OwnMessenger"
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

run_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        if ! command -v sudo >/dev/null 2>&1; then
            fail "Dieses Script benötigt Root-Rechte oder sudo."
        fi
        sudo "$@"
    fi
}

apt_update_once() {
    if [ "$APT_UPDATED" -eq 0 ]; then
        log "Aktualisiere Paketlisten..."
        run_root apt-get update
        APT_UPDATED=1
    fi
}

is_apt_system() {
    command -v apt-get >/dev/null 2>&1
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

command_exists() {
    command -v "$1" >/dev/null 2>&1
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

get_env_value() {
    local key="$1"
    local file=".env"

    if [ ! -f "$file" ]; then
        return 0
    fi

    grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2- | sed 's/^["'\'']//;s/["'\'']$//'
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
    if browser_path >/dev/null 2>&1 && [ -n "$(browser_path)" ]; then
        log "Browser gefunden: $(browser_path)"
        return 0
    fi

    log "Chromium/Chrome wurde nicht gefunden. Versuche Chromium zu installieren..."

    if apt-cache show chromium >/dev/null 2>&1; then
        apt_install chromium
    elif apt-cache show chromium-browser >/dev/null 2>&1; then
        apt_install chromium-browser
    else
        warn "Kein Chromium-Paket gefunden. WhatsApp-Web/Puppeteer kann eventuell nicht starten."
    fi

    if browser_path >/dev/null 2>&1 && [ -n "$(browser_path)" ]; then
        log "Browser nach Installation gefunden: $(browser_path)"
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
        warn "npm ist weiterhin nicht verfügbar. Versuche Corepack zu aktivieren..."
        if command_exists corepack; then
            run_root corepack enable || true
        fi
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

    local chrome_path
    chrome_path="$(browser_path || true)"

    if [ -n "$chrome_path" ]; then
        if ! grep -qE "^(CHROME_PATH|CHROME_EXECUTABLE_PATH|PUPPETEER_EXECUTABLE_PATH)=" ".env"; then
            set_env_value "CHROME_EXECUTABLE_PATH" "$chrome_path"
            log "CHROME_EXECUTABLE_PATH wurde in .env gesetzt: $chrome_path"
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

start_server() {
    if [ ! -f "package.json" ]; then
        fail "package.json wurde nicht gefunden."
    fi

    if ! command_exists npm; then
        fail "npm wurde nicht gefunden."
    fi

    show_status

    log "Starte Server..."

    if grep -qE '"start"[[:space:]]*:' package.json; then
        npm start
    elif [ -f "server.js" ]; then
        node server.js
    elif [ -f "index.js" ]; then
        node index.js
    elif [ -f "app.js" ]; then
        node app.js
    else
        fail "Kein Start-Script gefunden. Bitte package.json prüfen."
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
    show_status
}

print_menu() {
    clear || true
    echo "=========================================="
    echo " OwnMessenger Linux Installer"
    echo "=========================================="
    echo
    echo "1) Alles installieren/vorbereiten und Server starten"
    echo "2) Nur installieren/vorbereiten"
    echo "3) Server starten"
    echo "4) App-Key anzeigen"
    echo "5) Status anzeigen"
    echo "0) Beenden"
    echo
}

main_menu() {
    while true; do
        print_menu
        read -r -p "Auswahl: " choice

        case "$choice" in
            1)
                install_everything
                start_server
                ;;
            2)
                install_everything
                read -r -p "Fertig. Enter drücken..."
                ;;
            3)
                start_server
                ;;
            4)
                show_app_key
                read -r -p "Enter drücken..."
                ;;
            5)
                show_status
                read -r -p "Enter drücken..."
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
        start_server
        ;;
    --install-start)
        install_everything
        start_server
        ;;
    --key)
        show_app_key
        ;;
    --status)
        show_status
        ;;
    --help|-h)
        echo "Nutzung:"
        echo "  ./install.sh                 Menü öffnen"
        echo "  ./install.sh --install       Nur installieren/vorbereiten"
        echo "  ./install.sh --start         Server starten"
        echo "  ./install.sh --install-start Installieren und starten"
        echo "  ./install.sh --key           App-Key anzeigen"
        echo "  ./install.sh --status        Status anzeigen"
        ;;
    "")
        main_menu
        ;;
    *)
        fail "Unbekannter Parameter: $1"
        ;;
esac
