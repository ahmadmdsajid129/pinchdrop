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

/** PinchDrop palette, matching the website and the desktop app (theme.css): Night by default. */
@Immutable
data class PdColors(
    val bg: Color,
    val bg2: Color,
    val surface: Color,
    val surface2: Color,
    val line: Color,
    val primary: Color,
    /** Text and icons on the primary colour (ink on amber, paper on ink). */
    val onPrimary: Color,
    val accent: Color,
    val success: Color,
    val warn: Color,
    val danger: Color,
    val text: Color,
    val soft: Color,
    val muted: Color,
    val isDark: Boolean,
)

/** Night (default): the website's near-black with amber. */
val DarkPd = PdColors(
    bg = Color(0xFF07080B), bg2 = Color(0xFF0E1015), surface = Color(0xFF161922), surface2 = Color(0xFF1F232E),
    line = Color(0xFF2A2E3A), primary = Color(0xFFFFC53D), onPrimary = Color(0xFF15130F), accent = Color(0xFFFFC53D),
    success = Color(0xFF30D158), warn = Color(0xFFFFB020), danger = Color(0xFFFF6363), text = Color(0xFFF4F4F6),
    soft = Color(0xFFCDD0D8), muted = Color(0xFFA1A6B4), isDark = true,
)

/** Paper: the website's cream pages, ink buttons, dark amber links. */
val LightPd = PdColors(
    bg = Color(0xFFF6F1E7), bg2 = Color(0xFFEDE5D6), surface = Color(0xFFFFFDF7), surface2 = Color(0xFFF0E9DC),
    line = Color(0xFFDED4C2), primary = Color(0xFF15130F), onPrimary = Color(0xFFF6F1E7), accent = Color(0xFF9A6200),
    success = Color(0xFF0B7A3B), warn = Color(0xFF9A6200), danger = Color(0xFFC02626), text = Color(0xFF15130F),
    soft = Color(0xFF4A4338), muted = Color(0xFF6B6152), isDark = false,
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
            onPrimary = pd.onPrimary, secondary = pd.accent, error = pd.danger, onBackground = pd.text,
            onSurface = pd.text, onSurfaceVariant = pd.muted, outline = pd.line,
        )
    } else {
        lightColorScheme(
            background = pd.bg, surface = pd.surface, surfaceVariant = pd.surface2, primary = pd.primary,
            onPrimary = pd.onPrimary, secondary = pd.accent, error = pd.danger, onBackground = pd.text,
            onSurface = pd.text, onSurfaceVariant = pd.muted, outline = pd.line,
        )
    }
    val view = androidx.compose.ui.platform.LocalView.current
    if (!view.isInEditMode) {
        androidx.compose.runtime.SideEffect {
            val window = (view.context as? android.app.Activity)?.window ?: return@SideEffect
            val bars = androidx.core.view.WindowCompat.getInsetsController(window, view)
            bars.isAppearanceLightStatusBars = !dark
            bars.isAppearanceLightNavigationBars = !dark
        }
    }
    CompositionLocalProvider(LocalPd provides pd) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
