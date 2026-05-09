#!/usr/bin/env bash
set -e

# OwnMessenger Linux Installer / Starter
# Getestet/gedacht für Debian, Ubuntu und Pop!_OS.
# Das Script aktualisiert Paketlisten, installiert benötigte Pakete,
# erstellt bei Bedarf die .env, installiert npm-Abhängigkeiten und startet den Server.

APP_NAME="OwnMessenger"
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SERVER_DIR"

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

log() {
  echo -e "${GREEN}[OwnMessenger]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[Hinweis]${NC} $1"
}

err() {
  echo -e "${RED}[Fehler]${NC} $1"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ask_yes_no() {
  local prompt="$1"
  local default="${2:-y}"
  local answer

  if [ "$default" = "y" ]; then
    read -r -p "$prompt [J/n]: " answer
    answer="${answer:-j}"
  else
    read -r -p "$prompt [j/N]: " answer
    answer="${answer:-n}"
  fi

  case "$answer" in
    j|J|ja|JA|y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

detect_package_manager() {
  if need_cmd apt-get; then
    echo "apt"
  elif need_cmd dnf; then
    echo "dnf"
  elif need_cmd pacman; then
    echo "pacman"
  else
    echo "unknown"
  fi
}

install_system_packages() {
  local pm
  pm="$(detect_package_manager)"

  log "Prüfe Systempakete..."

  case "$pm" in
    apt)
      log "APT-System erkannt. Paketlisten werden aktualisiert..."
      sudo apt-get update

      if ask_yes_no "Systempakete aktualisieren? Das kann einige Minuten dauern." "y"; then
        sudo apt-get upgrade -y
      else
        warn "System-Upgrade übersprungen."
      fi

      log "Installiere benötigte Pakete für OwnMessenger..."
      sudo apt-get install -y \
        ca-certificates \
        curl \
        git \
        gnupg \
        build-essential \
        python3 \
        nodejs \
        npm \
        chromium-browser \
        chromium \
        ffmpeg \
        clamav \
        clamav-daemon \
        libnss3 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libxss1 \
        libasound2t64 \
        fonts-liberation \
        xdg-utils || true

      # Fallback für Distributionen ohne libasound2t64
      sudo apt-get install -y libasound2 || true
      ;;
    dnf)
      log "DNF-System erkannt."
      sudo dnf check-update || true

      if ask_yes_no "Systempakete aktualisieren? Das kann einige Minuten dauern." "y"; then
        sudo dnf upgrade -y
      else
        warn "System-Upgrade übersprungen."
      fi

      sudo dnf install -y \
        ca-certificates \
        curl \
        git \
        gcc-c++ \
        make \
        python3 \
        nodejs \
        npm \
        chromium \
        ffmpeg \
        clamav \
        clamav-update \
        nss \
        atk \
        gtk3 \
        libXScrnSaver \
        alsa-lib \
        liberation-fonts \
        xdg-utils || true
      ;;
    pacman)
      log "Pacman-System erkannt."
      sudo pacman -Sy

      if ask_yes_no "Systempakete aktualisieren? Das kann einige Minuten dauern." "y"; then
        sudo pacman -Syu --noconfirm
      else
        warn "System-Upgrade übersprungen."
      fi

      sudo pacman -S --needed --noconfirm \
        ca-certificates \
        curl \
        git \
        base-devel \
        python \
        nodejs \
        npm \
        chromium \
        ffmpeg \
        clamav \
        nss \
        atk \
        gtk3 \
        libxss \
        alsa-lib \
        ttf-liberation \
        xdg-utils || true
      ;;
    *)
      warn "Kein unterstützter Paketmanager erkannt."
      warn "Bitte manuell installieren: Node.js 18+, npm, Chromium/Chrome, ffmpeg, clamscan, git."
      ;;
  esac
}

install_newer_node_if_needed() {
  if ! need_cmd node; then
    warn "Node.js wurde nicht gefunden."
  else
    local major
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [ "$major" -ge 18 ]; then
      log "Node.js ist OK: $(node -v)"
      return 0
    fi
    warn "Node.js ist zu alt: $(node -v). Benötigt wird Node.js 18 oder neuer."
  fi

  if need_cmd apt-get; then
    warn "Versuche Node.js 20 LTS über NodeSource zu installieren..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    warn "Bitte Node.js 18 oder neuer manuell installieren."
  fi

  if need_cmd node; then
    log "Node.js nach Installation: $(node -v)"
  fi
}

prepare_clamav() {
  if need_cmd clamscan; then
    log "ClamAV gefunden: $(clamscan --version | head -n 1)"

    if need_cmd freshclam; then
      if ask_yes_no "ClamAV-Virensignaturen jetzt aktualisieren?" "y"; then
        sudo systemctl stop clamav-freshclam 2>/dev/null || true
        sudo freshclam || true
        sudo systemctl start clamav-freshclam 2>/dev/null || true
      fi
    fi
  else
    warn "clamscan wurde nicht gefunden. Virenprüfung läuft dann nicht oder nur eingeschränkt."
  fi
}

create_env() {
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
PORT=3000
HOST=127.0.0.1
APP_TOKEN=
UPLOAD_DIR=./uploads
DB_PATH=./data/own_messenger.sqlite
PROVIDER=wwebjs
MAX_WA_ACCOUNTS=5
PUBLIC_BASE_URL=https://DEINE-DOMAIN
REQUIRE_HTTPS=1
TRUST_PROXY=1
SECURE_MEDIA_CLAMAV=auto
CLAMSCAN_PATH=/usr/bin/clamscan
FFMPEG_PATH=/usr/bin/ffmpeg
EOF
      log ".env wurde neu erstellt."
    fi
  fi

  ensure_env_value "HOST" "127.0.0.1"
  ensure_env_value "PORT" "3000"
  ensure_env_value "MAX_WA_ACCOUNTS" "5"
  ensure_env_value "FFMPEG_PATH" "/usr/bin/ffmpeg"
  ensure_env_value "CLAMSCAN_PATH" "/usr/bin/clamscan"
  ensure_env_value "SECURE_MEDIA_CLAMAV" "auto"
  ensure_env_value "REQUIRE_HTTPS" "1"
  ensure_env_value "TRUST_PROXY" "1"

  if ! grep -q '^PUBLIC_BASE_URL=' ".env"; then
    echo "PUBLIC_BASE_URL=https://DEINE-DOMAIN" >> ".env"
  fi

  if grep -q '^APP_TOKEN=$' ".env" || ! grep -q '^APP_TOKEN=' ".env"; then
    local token
    if need_cmd openssl; then
      token="$(openssl rand -hex 32)"
    else
      token="$(date +%s%N | sha256sum | cut -d' ' -f1)"
    fi

    if grep -q '^APP_TOKEN=' ".env"; then
      sed -i "s#^APP_TOKEN=.*#APP_TOKEN=$token#" ".env"
    else
      echo "APP_TOKEN=$token" >> ".env"
    fi

    echo
    log "Neuer App-Key wurde erzeugt:"
    echo "$token"
    echo
    warn "Diesen App-Key später in der Android-App eintragen."
  fi

  mkdir -p data uploads
}

ensure_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" ".env"; then
    if [ -z "$(grep "^${key}=" ".env" | head -n1 | cut -d= -f2-)" ]; then
      sed -i "s#^${key}=.*#${key}=${value}#" ".env"
    fi
  else
    echo "${key}=${value}" >> ".env"
  fi
}

install_npm_packages() {
  log "Installiere npm-Abhängigkeiten..."
  npm install
}

show_connection_info() {
  local token
  local port
  local public_url

  token="$(grep '^APP_TOKEN=' .env | head -n1 | cut -d= -f2-)"
  port="$(grep '^PORT=' .env | head -n1 | cut -d= -f2-)"
  public_url="$(grep '^PUBLIC_BASE_URL=' .env | head -n1 | cut -d= -f2-)"

  echo
  echo "============================================================"
  echo " OwnMessenger ist vorbereitet"
  echo "============================================================"
  echo
  echo "Server-Port: ${port:-3000}"
  echo "App-Key:     ${token:-nicht gesetzt}"
  echo "URL für App: ${public_url:-https://DEINE-DOMAIN}"
  echo
  echo "Wichtig:"
  echo "- In der Android-App sollte eine HTTPS-URL eingetragen werden."
  echo "- Der App-Key muss in Server und App gleich sein."
  echo "- Bis zu 5 WhatsApp-Nummern/Accounts pro Server sind vorgesehen."
  echo "- Medien können verarbeitet, Metadaten bereinigt und per Virenscanner geprüft werden."
  echo
  echo "Beim ersten Start QR-Code mit WhatsApp scannen:"
  echo "WhatsApp → Verknüpfte Geräte → Gerät verknüpfen"
  echo
}

start_server() {
  show_connection_info
  log "Starte Server..."
  npm start
}

main_menu() {
  while true; do
    clear
    echo "=========================================="
    echo " OwnMessenger Linux install.sh"
    echo "=========================================="
    echo
    echo "1) Alles installieren/vorbereiten und Server starten"
    echo "2) Nur installieren/vorbereiten"
    echo "3) Server starten"
    echo "4) App-Key anzeigen"
    echo "5) Beenden"
    echo
    read -r -p "Auswahl: " choice

    case "$choice" in
      1)
        install_system_packages
        install_newer_node_if_needed
        prepare_clamav
        create_env
        install_npm_packages
        start_server
        ;;
      2)
        install_system_packages
        install_newer_node_if_needed
        prepare_clamav
        create_env
        install_npm_packages
        log "Installation/Vorbereitung abgeschlossen."
        read -r -p "Weiter mit Enter..."
        ;;
      3)
        create_env
        if [ ! -d "node_modules" ]; then
          install_npm_packages
        fi
        start_server
        ;;
      4)
        create_env
        echo
        echo "App-Key:"
        grep '^APP_TOKEN=' .env | cut -d= -f2-
        echo
        read -r -p "Weiter mit Enter..."
        ;;
      5)
        exit 0
        ;;
      *)
        warn "Ungültige Auswahl."
        read -r -p "Weiter mit Enter..."
        ;;
    esac
  done
}

if [ "${1:-}" = "--start" ]; then
  install_system_packages
  install_newer_node_if_needed
  prepare_clamav
  create_env
  install_npm_packages
  start_server
else
  main_menu
fi
