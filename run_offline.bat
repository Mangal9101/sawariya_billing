@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   SAWARIYA BILLING - OFFLINE MODE
echo ==========================================
echo.

where py >nul 2>&1
if %errorlevel%==0 (
    set "PY=py"
) else (
    set "PY=python"
)

if not exist "venv\Scripts\python.exe" (
    echo Creating local virtual environment...
    %PY% -m venv venv
    if errorlevel 1 goto :error
)

echo Installing/updating required packages...
venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto :error

echo.
echo Starting Sawariya Billing locally...
echo Database: sawariya_billing.db
echo Open: http://127.0.0.1:8000
echo Press Ctrl+C to stop.
echo.

venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
goto :eof

:error
echo.
echo ERROR: Setup failed.
pause
exit /b 1
