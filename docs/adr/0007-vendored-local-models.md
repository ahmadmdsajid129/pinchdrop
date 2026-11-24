# ADR-0007: Vendored Local Models and Zero Runtime CDN

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Decision Makers** | Lead Security Engineer, Lead Product Designer |

## Context
Web applications frequently rely on external Content Delivery Networks (CDNs) such as jsDelivr, unpkg, or Google CDN to load model weights and WASM runtimes. In desktop software, external CDN fetching introduces security vulnerabilities, privacy tracking risks, and complete failure when offline.

## Decision
All MediaPipe Tasks-Vision WASM binaries, HandLandmarker `.task` model weights, UI fonts (Inter, Poppins, JetBrains Mono), and icons are **locally vendored and bundled** inside the application distribution.
The desktop application and all documentation/PDF generation scripts must function with zero network access.

## Consequences
- **Positive:** 100% offline-first reliability; zero user tracking; instant application startup.
- **Negative:** Increases application installer size by approximately 15–25 MB (well within our <60 MB target).

[← Return to Architecture Index](../../architecture.md)
