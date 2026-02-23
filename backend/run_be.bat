@echo off
SETLOCAL EnableDelayedExpansion

echo Checking for virtual environment...
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if !errorlevel! neq 0 (
        echo Error: Failed to create virtual environment.
        pause
        exit /b !errorlevel!
    )
) else (
    echo Virtual environment already exists.
)

echo Activating virtual environment...
call venv\Scripts\activate
if !errorlevel! neq 0 (
    echo Error: Failed to activate virtual environment.
    pause
    exit /b !errorlevel!
)

echo Checking/Installing dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
if !errorlevel! neq 0 (
    echo Error: Failed to install dependencies.
    pause
    exit /b !errorlevel!
)

echo Starting Backend Server...
uvicorn app.main:app --reload
if !errorlevel! neq 0 (
    echo Error: Backend server crashed or failed to start.
    pause
)

deactivate
ENDLOCAL
