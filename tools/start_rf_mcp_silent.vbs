' =========================================================================
' RF WORKSPACE PRO - SILENT AUTOSTART SCRIPT (CHẠY ẨN 100% CÙNG WINDOWS)
' =========================================================================
Set WshShell = CreateObject("WScript.Shell")
Dim workingDir
workingDir = "C:\Users\ADMIN\RF_Workspace_Pro"

WshShell.CurrentDirectory = workingDir

' 0 = Ẩn hoàn toàn cửa sổ CMD/Console (SW_HIDE)
' False = Chạy ngầm không block tiến trình
WshShell.Run """C:\Program Files\nodejs\node.exe"" tools\rf-mcp-bridge.mjs", 0, False

