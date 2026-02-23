@echo off
SETLOCAL EnableDelayedExpansion

echo Checking for Node.js dependencies...
if not exist "node_modules" (
    echo node_modules not found. Installing dependencies...
    npm install
    if !errorlevel! neq 0 (
        echo Error: npm install failed.
        pause
        exit /b !errorlevel!
    )
) else (
    echo node_modules found. Skipping installation.
)

echo Starting Frontend Development Server...
npm run dev
if !errorlevel! neq 0 (
    echo Error: Frontend server failed to start.
    pause
)

ENDLOCAL
