# ADR-0002: PC is Always Server, Phone is Always Client

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Decision Makers** | Lead Systems Architect |

## Context
In peer-to-peer mobile-to-desktop networking, establishing inbound socket connections directly into an Android smartphone is notoriously fragile. Android power management aggressively suspends background listening sockets, and carrier or Wi-Fi NAT environments often prevent direct PC-to-phone socket binding.

## Decision
The **PC always acts as the server**; the **Android phone always acts as the client**.
When files are sent from Phone to PC, the phone connects outward to the PC's Axum server.
When files are transferred from PC to Phone, the PC signals the client over an established bi-directional WebSocket, prompting the phone client to initiate an authenticated HTTP pull request.

## Consequences
- **Positive:** Reliable connection establishment; zero incoming port binding required on Android.
- **Negative:** Requires PC to manage local network address candidate discovery and mDNS broadcasting.

[← Return to Architecture Index](../../architecture.md)
