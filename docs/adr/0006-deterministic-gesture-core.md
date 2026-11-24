# ADR-0006: Pure Deterministic TypeScript Gesture Core

| Attribute | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Decision Makers** | Lead Interaction Engineer |

## Context
Gesture recognition logic that is intertwined with UI frameworks (React DOM, canvas contexts, or Tauri IPC) is difficult to test, impossible to benchmark in headless CI, and prone to regressions during UI refactoring.

## Decision
All signal smoothing (One-Euro filter), pose classification (pinch ratio calculation), and gesture state transitions (FSM) are isolated into a standalone pure TypeScript library: `@pinchdrop/gesture-core`.
The package includes a **replay test harness** that processes recorded JSON landmark fixtures without requiring a webcam or browser DOM.

## Consequences
- **Positive:** Unit test coverage floor of ≥ 90%; CI benchmarks false-trigger rates and jitter on every commit.
- **Negative:** UI components must pass raw landmark arrays into the core package via an event loop.

[← Return to Architecture Index](../../architecture.md)
