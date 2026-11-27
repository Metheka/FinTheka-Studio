@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 24 com npm e abra este arquivo novamente.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 (
  echo Este projeto precisa de Node.js 24 ou superior.
  pause
  exit /b 1
)
if not exist "node_modules\@electric-sql\pglite\package.json" (
  echo Instalando dependencias. Esta primeira etapa precisa de internet.
  call npm ci
  if errorlevel 1 (
    echo Nao foi possivel instalar. Confira a conexao e tente novamente.
    pause
    exit /b 1
  )
)
echo Abra http://127.0.0.1:5000 depois que o servidor iniciar.
echo Apresentacao com Supabase online. Precisa de internet.
call npm start
pause
