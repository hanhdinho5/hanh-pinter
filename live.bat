@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Lan dau chay: dang cai thu vien...
  call pnpm install
)
echo Admin:   http://localhost:5173/admin
echo OBS:     http://localhost:5173/overlay  (1080 x 1920)
start "ptp-client" cmd /c "cd /d %~dp0client && pnpm dev"
start "" cmd /c "timeout /t 6 >nul & start http://localhost:5173/admin"
rem Server sap thi tu bat lai sau 5 giay; server tu noi lai TikTok da luu.
:chay
cd /d "%~dp0server"
call pnpm start
echo [%date% %time%] Server bi tat, tu bat lai sau 5 giay...
timeout /t 5 >nul
goto chay
