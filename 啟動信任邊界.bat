@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 信任邊界 Demo

rem =====================================================
rem 信任邊界 Local Demo Launcher
rem 雙擊執行：打包網站 -> 啟動 server -> 打開瀏覽器
rem API key 只從 .env 讀取，這個檔案裡沒有任何 key
rem =====================================================

netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo 8787 埠已經被使用，可能有另一個 server 視窗還開著。
  echo 請先關閉那個視窗，或在那裡按 Ctrl + C，再重新雙擊這個檔案。
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 第一次執行，正在安裝套件...
  call npm install || goto :error
)

echo.
echo [1/3] 正在打包網站...
call npm run build || goto :error

echo.
echo [2/3] 3 秒後自動打開瀏覽器：http://localhost:8787
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:8787"

echo.
echo [3/3] 啟動 server。展示結束後，直接關閉這個視窗即可。
echo.
call npm run server
goto :eof

:error
echo.
echo 啟動失敗，請把上面的訊息截圖給開發者。
pause
exit /b 1
