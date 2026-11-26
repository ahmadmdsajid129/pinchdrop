; v2: the program used to be pinchdrop-desktop.exe; it is now PinchDrop.exe.
; Close an older copy that's still running (it would otherwise keep the new one from starting)
; and remove the old file.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM pinchdrop-desktop.exe'
  nsExec::Exec 'taskkill /F /IM PinchDrop.exe'
  Sleep 500
  Delete "$INSTDIR\pinchdrop-desktop.exe"
!macroend
