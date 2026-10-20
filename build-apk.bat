@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Masareef - Build APK
cd /d "%~dp0"
echo.
echo ===== Masareef: building the Android APK =====
echo.

where node >nul 2>nul || (echo [X] Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)

if not exist node_modules (
  echo [1/4] Installing packages - first time only...
  call npm install || (echo [X] npm install failed & pause & exit /b 1)
) else (
  echo [1/4] Packages already installed
)

rem ================= find a JDK 21 or newer =================
echo [2/4] Looking for Java 21+ ...
set "JDK="
call :tryjdk "%ProgramFiles%\Android\Android Studio\jbr"
for /d %%D in ("%LOCALAPPDATA%\Programs\Android Studio*") do call :tryjdk "%%~D\jbr"
for /d %%D in ("%ProgramFiles%\Android\Android Studio*") do call :tryjdk "%%~D\jbr"
if defined JAVA_HOME call :tryjdk "%JAVA_HOME%"
for /d %%D in ("%ProgramFiles%\Microsoft\jdk-2*") do call :tryjdk "%%~D"
for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-2*") do call :tryjdk "%%~D"
for /d %%D in ("%ProgramFiles%\Java\jdk-2*") do call :tryjdk "%%~D"
for /d %%D in ("%ProgramFiles%\Zulu\zulu-2*") do call :tryjdk "%%~D"
for /d %%D in ("%USERPROFILE%\.jdks\*") do call :tryjdk "%%~D"

if not defined JDK (
  echo       Java 21 not found - installing Microsoft OpenJDK 21 with winget...
  winget install --id Microsoft.OpenJDK.21 -e --silent --accept-package-agreements --accept-source-agreements
  for /d %%D in ("%ProgramFiles%\Microsoft\jdk-21*") do call :tryjdk "%%~D"
)
if not defined JDK (
  echo [X] Could not get Java 21. Install it from https://learn.microsoft.com/java/openjdk/download#openjdk-21 then run this again.
  pause & exit /b 1
)
set "JAVA_HOME=%JDK%"
set "PATH=%JDK%\bin;%PATH%"
echo       Java: %JDK%

rem ================= Android SDK =================
set "SDK=%ANDROID_HOME%"
if "%SDK%"=="" set "SDK=%ANDROID_SDK_ROOT%"
if "%SDK%"=="" set "SDK=%LOCALAPPDATA%\Android\Sdk"
if not exist "%SDK%" (echo [X] Android SDK not found at %SDK%. Open Android Studio once so it downloads the SDK. & pause & exit /b 1)
echo sdk.dir=%SDK:\=\\%> android\local.properties
echo       SDK:  %SDK%

echo [3/4] Building the app - first build downloads Gradle and takes a few minutes...
cd android
call gradlew.bat --stop >nul 2>nul
call gradlew.bat assembleDebug --no-daemon
if errorlevel 1 (cd .. & echo. & echo [X] Build failed - send the error above to Claude & pause & exit /b 1)
cd ..

copy /Y android\app\build\outputs\apk\debug\app-debug.apk masareef.apk >nul
echo.
echo [4/4] Done!  APK: %CD%\masareef.apk
echo        Send it to your phone (WhatsApp / USB / Google Drive) and install it.
echo.
explorer /select,"%CD%\masareef.apk"
pause
exit /b 0

rem ---- sets JDK if %1 contains a java.exe whose major version is >= 21
:tryjdk
if defined JDK exit /b 0
set "C=%~1"
if not exist "%C%\bin\java.exe" exit /b 0
set "VER="
"%C%\bin\java.exe" -version 2> "%TEMP%\masareef_jv.txt"
for /f "tokens=3" %%V in ('findstr /i "version" "%TEMP%\masareef_jv.txt"') do set "VER=%%~V"
if not defined VER exit /b 0
for /f "delims=." %%M in ("%VER%") do set "MAJOR=%%M"
if !MAJOR! GEQ 21 set "JDK=%C%"
exit /b 0
