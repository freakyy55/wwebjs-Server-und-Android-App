@echo off
cd /d "%~dp0"
echo Own Messenger Server wird gestoppt...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-server-windows.ps1"
echo.
echo Fertig. Falls noch ein altes Server-Fenster offen ist, kannst du es schliessen.
pause
