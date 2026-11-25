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

/** PinchDrop palette, matching the desktop app (theme.css): Apple-style light by default. */
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

/** Dark: iOS true black with graphite surfaces. */
val DarkPd = PdColors(
    bg = Color(0xFF000000), bg2 = Color(0xFF1C1C1E), surface = Color(0xFF1C1C1E), surface2 = Color(0xFF2C2C2E),
    line = Color(0xFF38383A), primary = Color(0xFF0A84FF), accent = Color(0xFF0A84FF), success = Color(0xFF30D158),
    warn = Color(0xFFFFD60A), danger = Color(0xFFFF453A), text = Color(0xFFFFFFFF), soft = Color(0xFFD1D1D6),
    muted = Color(0xFF98989F), isDark = true,
)

/** Light (default): iOS grouped look — soft grey ground, white cards, one confident blue. */
val LightPd = PdColors(
    bg = Color(0xFFF2F2F7), bg2 = Color(0xFFE9E9EE), surface = Color(0xFFFFFFFF), surface2 = Color(0xFFEFEFF4),
    line = Color(0xFFE5E5EA), primary = Color(0xFF007AFF), accent = Color(0xFF007AFF), success = Color(0xFF248A3D),
    warn = Color(0xFFB26A00), danger = Color(0xFFFF3B30), text = Color(0xFF1C1C1E), soft = Color(0xFF3A3A3C),
    muted = Color(0xFF6C6C70), isDark = false,
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
