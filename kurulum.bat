@echo off
chcp 65001 >nul
cls
echo ======================================================
echo             EMANET TAKIP SISTEMI KURULUMU
echo ======================================================
echo.
echo Bu program, sistemi calistirmak icin gerekli
echo bilesenleri kontrol edecek ve kurulumu yapacaktir.
echo.

echo [1] Node.js kontrol ediliyor...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo HATA: Node.js bu bilgisayarda kurulu degil!
    echo.
    echo Lutfen once Node.js indirin ve kurun:
    echo https://nodejs.org/
    echo.
    echo Kurulum bittikten sonra bu pencereyi kapatip
    echo kurulum.bat dosyasini tekrar calistirin.
    echo.
    pause
    exit
)

echo [OK] Node.js kuruludur.
echo.
echo [2] Kutuphaneler kuruluyor (npm install)...
echo Bu islem internet hiziniza bagli olarak biraz zaman alabilir.
echo Lutfen bekleyin...
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo HATA: Kurulum sirasinda bir sorun olustu.
    echo Lutfen internet baglantinizi kontrol edip tekrar deneyin.
    echo.
    pause
    exit
)

echo.
echo ======================================================
echo          KURULUM BASARIYLA TAMAMLANDI!
echo ======================================================
echo.
echo Artik sistemi baslatmak icin baslat.bat dosyasini
echo cift tiklatarak calistirabilirsiniz.
echo.
pause
exit
