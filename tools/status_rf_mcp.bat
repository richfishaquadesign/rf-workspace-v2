@echo off
chcp 65001 >nul
echo ========================================================
echo   KIỂM TRA TRẠNG THÁI RF MCP BRIDGE CHẠY NGẦM
echo ========================================================
powershell -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*rf-mcp-bridge*' }; if ($procs) { Write-Host ' [OK] RF MCP Bridge ĐANG CHẠY NGẦM ỔN ĐỊNH!' -ForegroundColor Green; $procs | Format-Table ProcessId, CreationDate, CommandLine } else { Write-Host ' [OFF] MCP Bridge HIỆN KHÔNG CHẠY!' -ForegroundColor Red }"
echo.
echo 10 dòng log mới nhất:
powershell -Command "if (Test-Path 'bridge.log') { Get-Content 'bridge.log' -Tail 10 } else { Write-Host 'Chưa có file bridge.log' }"
echo.
pause

