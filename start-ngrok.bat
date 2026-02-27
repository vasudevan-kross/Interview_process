@echo off
echo ============================================
echo   Starting ngrok tunnel for Full Stack App
echo ============================================
echo.

:: Kill any existing ngrok processes
taskkill /f /im ngrok.exe >nul 2>&1
timeout /t 2 /nobreak >nul

set STATIC_DOMAIN=https://misdictated-claudine-nontangentially.ngrok-free.dev

:: Update frontend .env.local
echo Updating frontend\.env.local...
powershell -Command ^
  "$envFile = 'frontend\.env.local'; " ^
  "$content = Get-Content $envFile -Raw; " ^
  "$content = $content -replace 'NEXT_PUBLIC_FRONTEND_URL=.*', 'NEXT_PUBLIC_FRONTEND_URL=%STATIC_DOMAIN%'; " ^
  "$content | Set-Content $envFile -NoNewline; " ^
  "Write-Host '  Updated frontend\.env.local'"

:: Update backend .env
echo Updating backend\.env...
powershell -Command ^
  "$envFile = 'backend\.env'; " ^
  "$content = Get-Content $envFile -Raw; " ^
  "$content = $content -replace 'FRONTEND_URL=.*', 'FRONTEND_URL=%STATIC_DOMAIN%'; " ^
  "$content = $content -replace 'ALLOWED_ORIGINS=.*', 'ALLOWED_ORIGINS=http://localhost:3000,%STATIC_DOMAIN%'; " ^
  "$content | Set-Content $envFile -NoNewline; " ^
  "Write-Host '  Updated backend\.env'"

echo.
echo ============================================
echo   Starting single ngrok tunnel on Next.js:
echo   %STATIC_DOMAIN%
echo.
echo   Interviewer accesses: http://localhost:3000
echo   Candidates access:    %STATIC_DOMAIN%
echo.
echo   (API calls are automatically proxied via Next.js)
echo.
echo   Press Ctrl+C to stop ngrok.
echo ============================================
echo.

:: Start ngrok directly pointing to Next.js port 3000 using the static domain
ngrok http --url=%STATIC_DOMAIN% 3000

