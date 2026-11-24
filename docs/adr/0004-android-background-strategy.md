# ADR-0004: Android 15 dataSync Compliant Background Strategy

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Decision Makers** | Lead Mobile Engineer |

## Context
Android 15 introduces strict execution caps on `dataSync` foreground services, limiting them to **6 hours per rolling 24-hour period**. Exceeding this budget triggers immediate system termination of the service. Furthermore, OEM battery optimization systems frequently terminate long-running background daemons.

## Decision
1. PinchDrop will **NOT** maintain an always-on background `dataSync` service on Android.
2. Background file transfers must utilize **WorkManager** with user-initiated data transfer jobs.
3. The companion app maintains an active session only while in the foreground, during an active transfer, or when summoned via user Quick Settings tiles.
4. The app implements `onTimeout()` callbacks to handle OS service preemption gracefully.

## Consequences
- **Positive:** Full compliance with Google Play Store Android 15 policies; battery drain is negligible.
- **Negative:** Phone must be active or user must tap a tile to initiate PC-to-phone delivery if disconnected.

[← Return to Architecture Index](../../architecture.md)
