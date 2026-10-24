# Architecture

An asynchronous queue listens to PF2e's native end-turn hook on the active GM. A persisted combatant round marker prevents duplicate processing. Only a frightened combatant's current scene is inspected; off-scene world actors/tokens are never scanned. Turn advancement does not wait for recovery or a save.

Free-standing frightened sources decrease through ConditionManager. Parent-locked sources remain intact and establish a floor. Actor overrides supply a minimum or full hold. Prepared native Aura of Despair/dirge-of-doom auras contribute a floor using native containsToken geometry.

Dread runes are identified from equipped/invested prepared armor property runes. Native distance and individual vision are checked; disabled NPC sight yields a GM-only adjudication card. Native saves carry a request/index. The active GM validates ownership, token, check type, DC and outcome before resolving. Multiple saves finish before the decrease; failed floors combine. No socket handler is added.

Pending cards survive reloads. Changed frightened values are left for GM adjudication. Later turns do not accumulate another pending recovery; rewinds do not reverse prior recovery. Workbench pauses automatic turn handling to prevent double reduction.
