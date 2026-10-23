@echo off
rem Rocky on the desktop, beta: double-click to set up (first time) and start the pet and the control window.
rem Leave this window open while he runs: closing it stops him. Quit from his right-click menu or the tray icon.
setlocal
cd /d "%~dp0"
title Rocky desktop - beta

set "PY=python"
py -3.13 -V >nul 2>nul && set "PY=py -3.13"
if not exist ".venv\Scripts\python.exe" (
  echo First run: making a Python environment in server\.venv ...
  %PY% -m venv .venv
  if errorlevel 1 goto nopython
)
if not exist ".venv\desktop-installed.txt" (
  echo Installing what Rocky needs, one time, a few minutes ...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt -r requirements-desktop.txt
  if errorlevel 1 goto failed
  echo installed> ".venv\desktop-installed.txt"
)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Made server\.env from .env.example. Put your LLM_API_KEY in it, and FISH_AUDIO_API_KEY for his own voice.
  echo Save it, close Notepad, then press a key here.
  start "" /wait notepad ".env"
  pause
)
echo Starting Rocky. His first start downloads about 160 MB of speech models.
".venv\Scripts\python.exe" desktop.py %*
if errorlevel 1 pause
exit /b 0

:nopython
echo Python 3.13 wasn't found. Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
pause
exit /b 1

:failed
echo Installing failed: see the messages above.
pause
exit /b 1
