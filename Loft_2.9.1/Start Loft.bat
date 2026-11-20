@echo off
cd /d "%~dp0"
if not exist node_modules\electron (
  echo First start: installing Loft, this takes a minute and needs internet once...
  call npm install
)
call npm start
