@echo off
chcp 65001 >nul
setlocal
:: Bu dosyanin bulundugu klasore gec (yonetici olarak calistirilinca
:: varsayilan klasor C:\Windows\System32 oldugu icin server.js bulunamiyordu)
cd /d "%~dp0"
title Emanet Takip Sistemi
cls
echo ======================================================
echo             EMANET TAKIP SISTEMI BASLATILIYOR
echo ======================================================
echo.
echo   NOT: Bu dosyayi YONETICI olarak acmaniza GEREK YOKTUR.
echo        Normal cift tiklamayla calisir.
echo.

:: Windows "internetten indirildi" engelini kaldirmaya calis (varsa)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Include *.bat,*.ps1 -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>nul

if not exist "server.js" (
    echo [HATA] server.js bulunamadi.
    echo Lutfen bu dosyayi projenin kurulu oldugu klasorden calistirin.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [HATA] Kutuphaneler henuz kurulmamis.
    echo Lutfen once "kurulum.bat" dosyasini calistirin.
    echo.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi.
    echo Lutfen https://nodejs.org adresinden Node.js kurun ve tekrar deneyin.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -v 2^>nul') do echo   Node.js surumu: %%v
echo.

set OPEN_BROWSER=1
echo   [1/2] Sunucu hazirlaniyor...
echo   [2/2] Sunucu baslatiliyor (tarayici otomatik acilacak)...
echo.
echo   Kapatmak icin bu siyah pencereyi kapatin.
echo   ======================================================
echo.

node server.js
set SUNUCU_KODU=%ERRORLEVEL%

echo.
if not "%SUNUCU_KODU%"=="0" (
    echo   [BILGI] Sunucu durdu ^(cikis kodu: %SUNUCU_KODU%^).
    echo   - "portu zaten kullanimda" yaziyorsa: baska bir Emanet penceresi
    echo     zaten acik olabilir. O pencereyi kapatin ve tekrar deneyin.
    echo   - Baska bir hata yaziyorsa yukaridaki mesaji okuyun.
) else (
    echo   Sunucu kapatildi.
)
echo.
pause
