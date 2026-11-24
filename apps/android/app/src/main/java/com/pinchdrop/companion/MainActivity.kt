package com.pinchdrop.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Description
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinchdrop.companion.ui.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = PinchDropColorScheme) {
                CompanionHomeScreen()
            }
        }
    }
}

@Composable
fun CompanionHomeScreen() {
    var isConnected by remember { mutableStateOf(true) }
    var activeProgress by remember { mutableStateOf(0.72f) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // App Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "PinchDrop Companion",
                fontSize = 20.sp,
                color = AccentCyan
            )
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (isConnected) SuccessGreen.copy(alpha = 0.2f) else DangerRed.copy(alpha = 0.2f),
                border = androidx.compose.foundation.BorderStroke(1.dp, if (isConnected) SuccessGreen else DangerRed)
            ) {
                Text(
                    text = if (isConnected) "● Connected" else "Disconnected",
                    fontSize = 12.sp,
                    color = if (isConnected) SuccessGreen else DangerRed,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }

        // Quick Grab Actions Card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Surface2Dark, RoundedCornerShape(16.dp))
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(text = "QUICK GRAB ACTIONS", fontSize = 11.sp, color = MutedSlate)

                QuickActionButton(
                    icon = Icons.Default.CameraAlt,
                    label = "Grab Latest Photo",
                    color = PrimaryPurple
                )
                QuickActionButton(
                    icon = Icons.Default.ContentPaste,
                    label = "Grab System Clipboard",
                    color = AccentCyan
                )
                QuickActionButton(
                    icon = Icons.Default.Description,
                    label = "Scan Document (ML Kit)",
                    color = WarnYellow
                )
            }
        }

        // Active Transfers Card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceDark),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Surface2Dark, RoundedCornerShape(16.dp))
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(text = "ACTIVE TRANSFERS (PC ➔ PHONE)", fontSize = 11.sp, color = MutedSlate)

                Text(text = "4K_Broll_Sequence.mp4", fontSize = 14.sp, color = TextLight)
                LinearProgressIndicator(
                    progress = { activeProgress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = PrimaryPurple,
                    trackColor = Surface2Dark
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "72% · 38 MB/s", fontSize = 11.sp, color = MutedSlate)
                    Text(text = "BLAKE3 Verified", fontSize = 11.sp, color = SuccessGreen)
                }
            }
        }
    }
}

@Composable
fun QuickActionButton(icon: ImageVector, label: String, color: androidx.compose.ui.graphics.Color) {
    Button(
        onClick = { /* Grab action */ },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Surface2Dark)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = color)
            Text(text = label, color = TextLight, fontSize = 14.sp)
        }
    }
}
