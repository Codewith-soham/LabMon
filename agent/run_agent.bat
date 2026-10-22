@echo off
setlocal
title LABMON PC Health Card Collector

echo ========================================================
echo          LABMON - PC Health Card Agent
echo ========================================================
echo.

REM Locate Python: check venv first, otherwise system python
if exist "venv\Scripts\python.exe" (
    set "PYTHON_CMD=venv\Scripts\python.exe"
) else (
    set "PYTHON_CMD=python"
)

REM Verify dependencies
%PYTHON_CMD% -c "import psutil, requests" 2>nul
if %errorlevel% neq 0 (
    echo Installing required libraries [psutil, requests]...
    %PYTHON_CMD% -m pip install -r requirements.txt
)

echo.
%PYTHON_CMD% collector.py %*
echo.
pause
