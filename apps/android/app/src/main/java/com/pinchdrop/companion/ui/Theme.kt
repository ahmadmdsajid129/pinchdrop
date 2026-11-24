package com.pinchdrop.companion.ui

import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color

val BgDark = Color(0xFF0B1020)
val SurfaceDark = Color(0xFF141B34)
val Surface2Dark = Color(0xFF1C2547)
val PrimaryPurple = Color(0xFF7C5CFF)
val AccentCyan = Color(0xFF22D3EE)
val SuccessGreen = Color(0xFF34D399)
val WarnYellow = Color(0xFFFBBF24)
val DangerRed = Color(0xFFFB7185)
val TextLight = Color(0xFFE8ECFF)
val MutedSlate = Color(0xFF8B94B8)

val PinchDropColorScheme = darkColorScheme(
    background = BgDark,
    surface = SurfaceDark,
    surfaceVariant = Surface2Dark,
    primary = PrimaryPurple,
    secondary = AccentCyan,
    tertiary = SuccessGreen,
    error = DangerRed,
    onBackground = TextLight,
    onSurface = TextLight
)
