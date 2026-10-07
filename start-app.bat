@echo off
setlocal
:: ============================================================
::  Starts Redis, Ollama, backend and frontend.
::
::  Usage:
::    start-app.bat          local: dev frontend with hot reload, no ngrok
::    start-app.bat share    candidates: production frontend + ngrok tunnel
::
::  Each service opens in its own window; close a window to stop it.
:: ============================================================

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "MODE=dev"
set "NGROK=0"
if /i "%~1"=="share" (
    set "MODE=prod"
    set "NGROK=1"
)

echo ============================================
echo   AI Interview Platform  (frontend: %MODE%)
echo ============================================
echo.

:: ---- Docker / Redis ---------------------------------------
docker info >nul 2>&1
if not errorlevel 1 goto dockerready
echo [..] Docker is not running - starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
:waitdocker
ping -n 4 127.0.0.1 >nul
docker info >nul 2>&1
if errorlevel 1 goto waitdocker
:dockerready
echo [OK] Docker running
docker compose -f "%ROOT%\docker-compose.yml" up -d redis >nul 2>&1
if errorlevel 1 (echo [!!] Failed to start Redis) else (echo [OK] Redis on :6379)

:: ---- Ollama -----------------------------------------------
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo [..] Starting Ollama...
    start "Ollama" /min ollama serve
    ping -n 4 127.0.0.1 >nul
)
echo [OK] Ollama on :11434
for %%M in (qwen2.5:7b glm-ocr) do (
    ollama list | findstr /b /c:"%%M" >nul || (
        echo [!!] Model %%M missing - downloading in a separate window
        start "Pull %%M" cmd /k ollama pull %%M
    )
)

:: ---- Backend ----------------------------------------------
echo [..] Starting backend on :8000
start "Backend :8000" /D "%ROOT%\backend" cmd /k "venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: ---- Frontend ---------------------------------------------
if "%MODE%"=="dev" (
    echo [..] Starting frontend ^(dev^) on :3000
    start "Frontend :3000" /D "%ROOT%\frontend" cmd /k "npm run dev"
) else (
    echo [..] Building + starting frontend ^(production^) on :3000 - first build takes ~1 min
    start "Frontend :3000" /D "%ROOT%\frontend" cmd /k "npm run build && npm run start"
)

:: ---- ngrok ------------------------------------------------
if "%NGROK%"=="1" (
    echo [..] Starting ngrok tunnel
    start "ngrok" /D "%ROOT%" cmd /k start-ngrok.bat
)

echo.
echo ============================================
echo   Interviewer:  http://localhost:3000
if "%NGROK%"=="1" echo   Candidates:   https://misdictated-claudine-nontangentially.ngrok-free.dev
echo   API docs:     http://localhost:8000/docs
echo.
echo   Close the service windows to stop them.
echo ============================================
endlocal
