# 0003. At-least-once email delivery

Status: accepted

Context: the worker can crash between sending an email and recording `sent`.

Decision: rows are claimed with a visibility timeout (`locked_until`) and reclaimed after a crash. Failures retry with exponential backoff and jitter, then become `failed`. The `dedupe_key` is used as the email `Message-ID` so downstream systems can drop duplicates.

The final status updates are fenced on `status = 'sending' AND attempts = <claimed value>`, so a worker that finishes late cannot overwrite a row that was reclaimed by another attempt. A row that keeps crashing its worker is marked `failed` once it reaches the maximum number of attempts. After a successful invitation email the one-time token and link are removed from the stored payload.

Consequences: in that rare crash window an email can be delivered twice. Exactly-once delivery over SMTP is not achievable, so the system is explicit about at-least-once and prevents duplicates at enqueue time.
