package com.pinchdrop.companion.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.data.initials
import com.pinchdrop.companion.ui.theme.Pd

@Composable
fun PdCard(modifier: Modifier = Modifier, borderColor: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    val c = Pd.colors
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(c.surface)
            // Light: borderless white cards on the grey ground (iOS grouped). Dark: a hairline.
            .border(1.dp, borderColor ?: if (c.isDark) c.line else Color.Transparent, RoundedCornerShape(20.dp)),
        content = content,
    )
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        modifier = modifier.padding(start = 4.dp, top = 8.dp, bottom = 6.dp),
        color = Pd.colors.accent,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.8.sp,
    )
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 52.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(containerColor = Pd.colors.primary, contentColor = Color.White),
    ) { Text(text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, danger: Boolean = false) {
    val c = Pd.colors
    // iOS "tinted" button: soft colour fill, coloured label.
    val tint = if (danger) c.danger else c.primary
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = 48.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(containerColor = tint.copy(alpha = if (c.isDark) 0.22f else 0.12f), contentColor = tint),
        elevation = null,
    ) { Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun LinkButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    TextButton(onClick = onClick, modifier = modifier.heightIn(min = 48.dp)) {
        Text(text, color = Pd.colors.accent, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

/** "Coming in Phase N" — the honest marker for anything not built yet. */
@Composable
fun PhaseBadge(phase: Int, modifier: Modifier = Modifier) {
    val c = Pd.colors
    Text(
        "Coming in Phase $phase",
        modifier = modifier
            .clip(CircleShape)
            .background(c.warn.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        color = c.warn,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
fun DemoTag(modifier: Modifier = Modifier) {
    val c = Pd.colors
    Text(
        "DEMO",
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(c.warn)
            .padding(horizontal = 6.dp, vertical = 1.dp),
        color = Color(0xFF0B1020),
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
fun Avatar(name: String, color: Color, size: Int = 40) {
    Box(
        Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(color),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials(name), color = Color(0xFF0B1020), fontWeight = FontWeight.Bold, fontSize = (size * 0.38f).sp)
    }
}

/** A settings row: title, optional description, and a trailing control. */
@Composable
fun SettingRow(
    title: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    last: Boolean = false,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val c = Pd.colors
    Column(modifier) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, color = c.text, fontSize = 15.sp)
                if (description != null) Text(description, color = c.muted, fontSize = 13.sp, lineHeight = 18.sp)
            }
            trailing()
        }
        if (!last) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = c.surface2)
    }
}

/** A whole-row switch, so the label is the touch target (TalkBack reads it as one switch). */
@Composable
fun ToggleRow(title: String, checked: Boolean, onChange: (Boolean) -> Unit, description: String? = null, last: Boolean = false) {
    SettingRow(
        title = title,
        description = description,
        last = last,
        modifier = Modifier.toggleable(value = checked, role = Role.Switch, onValueChange = onChange),
    ) {
        Switch(
            checked = checked,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(checkedTrackColor = Pd.colors.primary, checkedThumbColor = Color.White),
        )
    }
}

@Composable
fun NavRow(title: String, onClick: () -> Unit, description: String? = null, last: Boolean = false, value: String? = null) {
    val c = Pd.colors
    SettingRow(title = title, description = description, last = last, modifier = Modifier.clickable(role = Role.Button, onClick = onClick)) {
        if (value != null) Text(value, color = c.soft, fontSize = 13.sp)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.muted)
    }
}

/** Segmented choice, e.g. Easy / Normal / Strict. */
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val c = Pd.colors
    Row(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(c.bg2)
            .border(1.dp, c.line, RoundedCornerShape(12.dp))
            .padding(3.dp)
            .selectableGroup(),
    ) {
        options.forEach { (value, label) ->
            val on = value == selected
            Box(
                Modifier
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (on) c.primary else Color.Transparent)
                    .selectable(selected = on, role = Role.RadioButton, onClick = { onSelect(value) })
                    .heightIn(min = 40.dp)
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, color = if (on) Color.White else c.soft, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
