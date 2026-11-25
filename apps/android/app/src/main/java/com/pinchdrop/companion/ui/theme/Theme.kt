package com.pinchdrop.companion.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.pinchdrop.companion.data.ThemeMode

/** Aurora palette: the same tokens as the desktop theme.css (design.md). */
@Immutable
data class PdColors(
    val bg: Color,
    val bg2: Color,
    val surface: Color,
    val surface2: Color,
    val line: Color,
    val primary: Color,
    val accent: Color,
    val success: Color,
    val warn: Color,
    val danger: Color,
    val text: Color,
    val soft: Color,
    val muted: Color,
    val isDark: Boolean,
)

val DarkPd = PdColors(
    bg = Color(0xFF0B1020), bg2 = Color(0xFF0E1428), surface = Color(0xFF141B34), surface2 = Color(0xFF1C2547),
    line = Color(0xFF24324F), primary = Color(0xFF7C5CFF), accent = Color(0xFF22D3EE), success = Color(0xFF34D399),
    warn = Color(0xFFFBBF24), danger = Color(0xFFFB7185), text = Color(0xFFE8ECFF), soft = Color(0xFFC7CEEA),
    muted = Color(0xFF8B94B8), isDark = true,
)

val LightPd = PdColors(
    bg = Color(0xFFF5F7FF), bg2 = Color(0xFFECEFFB), surface = Color(0xFFFFFFFF), surface2 = Color(0xFFE6EAF8),
    line = Color(0xFFD5DBEE), primary = Color(0xFF6A4BF5), accent = Color(0xFF0891B2), success = Color(0xFF059669),
    warn = Color(0xFFB45309), danger = Color(0xFFE11D48), text = Color(0xFF111833), soft = Color(0xFF39425F),
    muted = Color(0xFF5E6787), isDark = false,
)

val LocalPd = staticCompositionLocalOf { DarkPd }

object Pd {
    val colors: PdColors
        @Composable get() = LocalPd.current
}

@Composable
fun PinchDropTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val pd = if (dark) DarkPd else LightPd
    val scheme = if (dark) {
        darkColorScheme(
            background = pd.bg, surface = pd.surface, surfaceVariant = pd.surface2, primary = pd.primary,
            onPrimary = Color.White, secondary = pd.accent, error = pd.danger, onBackground = pd.text,
            onSurface = pd.text, onSurfaceVariant = pd.muted, outline = pd.line,
        )
    } else {
        lightColorScheme(
            background = pd.bg, surface = pd.surface, surfaceVariant = pd.surface2, primary = pd.primary,
            onPrimary = Color.White, secondary = pd.accent, error = pd.danger, onBackground = pd.text,
            onSurface = pd.text, onSurfaceVariant = pd.muted, outline = pd.line,
        )
    }
    CompositionLocalProvider(LocalPd provides pd) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
