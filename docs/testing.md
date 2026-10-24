# Testing

Verified on Foundry 14.369 / PF2e 8.6.0 in an independent synthetic playground with separate GM/player clients. All 58 core assertions, 19 edge assertions and nine latency/scope assertions pass on identical runtime bytes, with zero page/console errors. These phase totals include repeated startup/parity checks. Two portable rules tests also pass. Public CI covers those portable tests, syntax and deterministic release checks; it does not replace licensed gameplay tests.

Native coverage includes ordinary end-turn decrease/removal, duplicate hooks, GM hold/minimum, settings, Workbench collision guard, native Aura of Despair, all three Dread rune grades with successes/failures, non-blocking pending saves, hidden DCs/results, changed conditions, blindness, range, investment, disabled NPC sight, separate-player saves, header controls, cancellation/retry, pending refresh, multiple runes, auditory Dirge/deafness, stowed armor, allies, global encounters without scene links and parent-locked sources.

## Latency

Local headless Chromium with software rendering: 40 samples per classification scenario, plus eight actual target end-turn samples each with automation disabled, enabled on a two-token map, and enabled on an 82-token map with 1,000 unrelated off-scene tokens. Ordinary rule checks: p95 0.2 ms on the small map and 0.3 ms on the crowded map (max 0.6 ms). One nearby Dread wearer: p95 1.4 ms, max 6.7 ms. Instrumented off-scene actor reads: zero.

Asynchronous handler completion including native flag/condition writes was median 15.5 ms, p95 16.7 ms on the crowded map. Combat.nextTurn returned in median 9.9 ms there and did not wait for those writes or a save. Disabled/native baseline median was 17.2 ms; enabled small-map median 14.3 ms. These sequential warm samples do not establish a speedup, and absolute timings are not production network latency. They demonstrate sub-frame rule checks and no world-size scan. Recheck after relevant changes.

Full companion-module combinations are not certified. Support is limited to the sources in README.md; custom fear effects require GM overrides.
