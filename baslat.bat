@echo off
chcp 65001 >nul
cls
echo ======================================================
echo             EMANET TAKIP SISTEMI BASLATILIYOR
echo ======================================================
echo.
echo [1/2] Sunucu hazirlaniyor...
echo Tarayici 2 saniye icinde otomatik acilacaktir.
echo Kapatmak icin bu pencereyi kapatabilirsiniz.
echo.

:: Sunucu ayaga kalktiktan sonra tarayiciyi ac (ERR_CONNECTION_REFUSED engellenir)
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

echo [2/2] Sunucu baslatiliyor...
echo.
node server.js
echo.
echo Sunucu kapandi.
pause
