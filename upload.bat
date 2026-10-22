@echo off
REM ============================================================================
REM 声音标注系统 - Windows 上传脚本
REM 用法: upload.bat
REM ============================================================================

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo 声音标注系统 - 上传脚本
echo ==========================================
echo.

REM 配置信息
set SERVER_IP=8.148.188.140
set SSH_PORT=22
set SSH_USER=root
set REMOTE_PATH=/root/qzcjweb

REM 检�� WinSCP 或 Plink 是否安装
where winscp.com >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [错误] 未找到 WinSCP，请先安装 WinSCP
    echo 下载地址: https://winscp.net/download
    pause
    exit /b 1
)

echo [信息] 检测到 WinSCP 已安装

REM 打包项目（排除不必要的文件）
echo.
echo [步骤 1/3] 打包项目文件...

if exist qzcjweb.zip del qzcjweb.zip
if exist __pycache__ rmdir /s /q __pycache__ 2>nul
if exist node_modules rmdir /s /q node_modules 2>nul
if exist voice-h5\dist rmdir /s /q voice-h5\dist 2>nul
if exist voice-h5\node_modules rmdir /s /q voice-h5\node_modules 2>nul

REM 使用 7-Zip 或 WinRAR 压缩（如果有）
where 7z.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [信息] 使用 7-Zip 进行压缩...
    7z.exe a -r qzcjweb.zip ^
        *.py *.txt *.js *.md *.sh .env ecosystem.config.js nginx.conf requirements.txt ^
        voice-h5\*.json voice-h5\src voice-h5\public voice-h5\index.html ^
        -x!node_modules -x!__pycache__ -x!.git
) else (
    echo [警告] 未找到 7-Zip，使用系统默认压缩...
    REM 这里可以使用 PowerShell 进行压缩
    powershell -NoProfile -Command ^
        "Add-Type -Assembly 'System.IO.Compression.FileSystem'; [System.IO.Compression.ZipFile]::CreateFromDirectory('.', 'qzcjweb.zip')"
)

if exist qzcjweb.zip (
    for /F %%A in ('dir /b qzcjweb.zip ^| find /c /v ""') do set SIZE=%%A
    echo [成功] 项目已打包: qzcjweb.zip
) else (
    echo [错误] 打包失败
    pause
    exit /b 1
)

REM 上传到服务器
echo.
echo [步骤 2/3] 上传到服务器 %SERVER_IP%:%SSH_PORT% ...
echo [提示] 请输入 SSH 密码

REM 使用 SCP 或 WinSCP 上传
winscp.com /command ^
    "open scp://%SSH_USER%@%SERVER_IP%:%SSH_PORT% -password Yh2026888@@" ^
    "put qzcjweb.zip %REMOTE_PATH%/" ^
    "exit"

if !ERRORLEVEL! equ 0 (
    echo [成功] 文件已上传
) else (
    echo [错误] 上传失败，请检查网络或 SSH 密码
    pause
    exit /b 1
)

REM 远程执行部署脚本
echo.
echo [步骤 3/3] 远程执行部署脚本...
echo [提示] 这将连接到服务器并执行部署...

echo 即将连接到服务器执行部署命令：
echo 1. 解压文件
echo 2. 安装依赖
echo 3. 启动服务

pause

REM 使用 Plink 执行远程命令（Plink 是 PuTTY 的命令行版本）
where plink.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [信息] 使用 Plink 连接服务器...
    plink.exe -P %SSH_PORT% -l %SSH_USER% -pw Yh2026888@@ %SERVER_IP% ^
        "cd %REMOTE_PATH% && unzip -o qzcjweb.zip && bash deploy.sh"
) else (
    echo [警告] 未找到 Plink，请手动执行以下命令：
    echo.
    echo --- SSH 连接命令 ---
    echo ssh -p %SSH_PORT% %SSH_USER%@%SERVER_IP%
    echo 密码: Yh2026888@@
    echo.
    echo --- 手动执行命令 ---
    echo cd %REMOTE_PATH%
    echo unzip -o qzcjweb.zip
    echo bash deploy.sh
    echo.
)

echo.
echo ==========================================
echo ✓ 上传脚本执行完成
echo ==========================================
echo.

pause
