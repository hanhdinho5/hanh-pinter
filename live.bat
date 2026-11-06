@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Node cai qua Laragon (neu co) -> dua vao PATH
if exist "D:\laragon\bin\nodejs\node-v22\node.exe" set "PATH=D:\laragon\bin\nodejs\node-v22;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js. Hay cai Node 22 tro len: https://nodejs.org
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay pnpm. Mo cmd va chay:  npm install -g pnpm
  pause
  exit /b 1
)

if not exist node_modules (
  echo Lan dau chay: dang cai thu vien...
  call pnpm install
  if errorlevel 1 (
    echo [LOI] Cai thu vien that bai. Kiem tra mang roi chay lai live.bat
    pause
    exit /b 1
  )
)

echo Admin:   http://localhost:5173/admin
echo Overlay: http://localhost:5173/overlay  (1080 x 1920) - them vao TikTok LIVE Studio / OBS
start "ptp-client" cmd /k "cd /d %~dp0client && pnpm dev"
start "" cmd /c "timeout /t 6 >nul & start http://localhost:5173/admin"
rem Server sap thi tu bat lai sau 5 giay; server tu noi lai TikTok da luu.
:chay
cd /d "%~dp0server"
call pnpm start
echo [%date% %time%] Server bi tat, tu bat lai sau 5 giay...
timeout /t 5 >nul
goto chay
