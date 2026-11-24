# ADR-0003: Stage Tray & Grab → Catch Architecture

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Decision Makers** | Lead Product Designer, Lead Systems Architect |

## Context
A laptop webcam physically points upward and outward at the user's face, hands, and upper torso. The webcam cannot see inside a smartphone screen, nor can third-party Android apps (such as Google Photos) be directly manipulated by laptop vision. We must deliver an experience that feels like pinching an item off the phone while respecting physical device limits.

## Decision
We adopt the **Grab → Catch** model:
1. **Grab (Phone):** User taps *Share → PinchDrop* in Google Photos (or taps a Quick Settings tile). The phone transmits a lightweight thumbnail and metadata over local TLS.
2. **Armed (PC):** The PC enters an **ARMED state for 30 seconds**, showing a floating thumbnail chip over the cursor.
3. **Catch (Air Gesture):** User pinches anywhere in mid-air in front of the PC camera. The thumbnail snaps to their hand cursor and is dropped onto a folder zone.
4. **Fallback:** Uncaught items settle into the PC **Stage Tray**.

## Consequences
- **Positive:** Achieves a seamless "two-step" physical transfer illusion with 100% technical feasibility.
- **Negative:** Requires user to execute one initial tap on the phone (or zero taps via PC Peek mode).

[← Return to Architecture Index](../../architecture.md)
