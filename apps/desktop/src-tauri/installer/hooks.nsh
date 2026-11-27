; v2: the program used to be pinchdrop-desktop.exe; it is now PinchDrop.exe.
; Close an older copy that's still running (it would otherwise keep the new one from starting)
; and remove the old file.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM pinchdrop-desktop.exe'
  nsExec::Exec 'taskkill /F /IM PinchDrop.exe'
  Sleep 500
  Delete "$INSTDIR\pinchdrop-desktop.exe"
!macroend

; The pinchdrop:// link PinchDrop registers for itself (the website's "Open in PinchDrop" button).
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\pinchdrop"
!macroend

; Always leave a desktop shortcut (Tauri skips it when installing over an older copy), unless the
; installer was started with /NS (no shortcuts).
!macro NSIS_HOOK_POSTINSTALL
  ${If} $NoShortcutMode <> 1
    ${IfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
