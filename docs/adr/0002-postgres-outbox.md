# 0002. Postgres outbox as the job queue

Status: accepted

Context: reminders, missed-dose alerts, low-stock alerts and invitation emails must be sent reliably, with no extra infrastructure.

Decision: a `notification_outbox` table with a unique `dedupe_key`. Enqueueing is set-based SQL (`INSERT ... SELECT ... ON CONFLICT DO NOTHING`), so running a cycle twice is harmless. Dispatch claims rows with `FOR UPDATE SKIP LOCKED` in one statement, so several workers can run together.

Consequences: no broker to operate and everything is testable on a real database. Throughput is bounded by Postgres, which is ample here. A dedicated queue would only be needed at much higher volume.
