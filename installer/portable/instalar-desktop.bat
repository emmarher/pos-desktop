@echo off
REM installer/portable/instalar-desktop.bat — Instala/actualiza POS Desktop portable.
REM
REM Estrategia: REEMPLAZO (no hay desinstalador: app portable sin registro).
REM   - Origen: esta misma carpeta (USB o distribución) con pos-desktop.exe + version.txt
REM   - Destino: %LOCALAPPDATA%\POS Desktop\pos-desktop.exe (nombre estable; sin admin)
REM   - Accesos: Escritorio + Menú inicio (nombres estables, sobreviven updates)
REM   - Uso:   instalar-desktop.bat            (instala o actualiza)
REM            instalar-desktop.bat /startup   (además, auto-arranque al prender)
REM La barra de tareas NO se puede fijar por script (bloqueo de Windows):
REM el operador la fija manual una vez y sobrevive a updates por el nombre estable.
setlocal enabledelayedexpansion

set "SRC=%~dp0pos-desktop.exe"
set "VER_FILE=%~dp0version.txt"
set "DEST_DIR=%LOCALAPPDATA%\POS Desktop"
set "DEST=%DEST_DIR%\pos-desktop.exe"
set "DO_STARTUP=0"
if /i "%~1"=="/startup" set "DO_STARTUP=1"

if not exist "%SRC%" (
  echo [ERROR] No se encontró pos-desktop.exe junto a este instalador.
  pause
  exit /b 1
)
if not exist "%VER_FILE%" (
  echo [ERROR] No se encontró version.txt junto a este instalador.
  pause
  exit /b 1
)
set /p NEW_VER=<"%VER_FILE%"

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

REM Si ya está la misma versión, solo refrescar accesos y salir.
if exist "%DEST_DIR%\version.txt" (
  set /p CUR_VER=<"%DEST_DIR%\version.txt"
  if "!CUR_VER!"=="%NEW_VER%" (
    echo Versión %NEW_VER% ya instalada. Refrescando accesos...
    goto :shortcuts
  )
  echo Actualizando !CUR_VER! -^> %NEW_VER% ...
) else (
  echo Instalando versión %NEW_VER% ...
)

REM Cerrar instancia en ejecución para poder reemplazar el exe.
taskkill /F /IM pos-desktop.exe >nul 2>&1
timeout /t 2 /nobreak >nul

copy /Y "%SRC%" "%DEST%" >nul
if errorlevel 1 (
  echo [ERROR] No se pudo copiar. Cierra POS Desktop e intenta de nuevo.
  pause
  exit /b 1
)
copy /Y "%VER_FILE%" "%DEST_DIR%\version.txt" >nul

:shortcuts
REM Accesos Escritorio + Menú inicio (+ Startup opcional) vía WScript.Shell.
REM Se resuelven carpetas especiales por API (nombres localizados: Escritorio/Desktop).
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell);" ^
  "$t='%DEST%';" ^
  "$d=$s.SpecialFolders('Desktop')+'\POS Desktop.lnk';" ^
  "$m=$s.SpecialFolders('StartMenu')+'\Programs\POS Desktop.lnk';" ^
  "foreach($p in @($d,$m)){$l=$s.CreateShortcut($p);$l.TargetPath=$t;$l.WorkingDirectory='%DEST_DIR%';$l.Description='Punto de venta';$l.Save()};" ^
  "if($env:DO_STARTUP -eq '1'){Copy-Item $d ($s.SpecialFolders('Startup')+'\POS Desktop.lnk') -Force; 'Auto-arranque activado.'}"

echo.
echo POS Desktop %NEW_VER% listo en %DEST_DIR%
echo Accesos: Escritorio + Menú inicio. Fija a la barra manualmente una vez si lo deseas.
pause
