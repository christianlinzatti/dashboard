@echo off
rem Sonic-Bridge unter Windows starten (Doppelklick genuegt).
rem Beim ersten Start sucht das Setup die Govee-Lampen und schreibt bridge\config.json.
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte Node.js LTS ^(mind. 22.18^) installieren: https://nodejs.org
  echo oder:  winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
if errorlevel 1 (
  echo Node.js ist zu alt ^(mind. 22.18 noetig^). Bitte die aktuelle LTS-Version installieren.
  pause
  exit /b 1
)

if not exist node_modules\ws (
  echo Installiere Abhaengigkeiten ...
  call npm ci --omit=dev --ignore-scripts
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist bridge\config.json (
  node bridge\setup.ts
  if errorlevel 1 ( pause & exit /b 1 )
)

node bridge\main.ts bridge\config.json
pause
