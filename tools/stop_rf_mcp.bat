@echo off
chcp 65001 >nul
echo Đang tắt tiến trình RF MCP Bridge chạy ngầm...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*rf-mcp-bridge*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Đã dừng tiến trình PID:' $_.ProcessId }"
echo Hoàn tất!
timeout /t 2 >nul

