# 0004. Stock as a movement ledger

Status: accepted

Context: remaining quantity of a medication must stay correct when doses are taken, refills happen and corrections are made.

Decision: `stock_movements` (`refill`, `dose`, `adjustment`) with signed quantities; remaining stock is the sum. A taken dose writes its movement in the same transaction as the status change, and only when stock is tracked (a refill or adjustment exists), so people who never track stock get no alerts.

Consequences: full audit trail and no counter that can drift. Reads aggregate movements, which is cheap at this scale. Low-stock alerts are deduplicated per refill cycle.
