# postgres-audit-log-repository

Drizzle-backed persistence for the activity log of a site — implements
[`AuditLogPort`](../../ports/src/lib/audit-log.port.ts)
(`DrizzleAuditLogRepository`, table `audit_events`), see
[ADR-0130](../../../docs/adr/0130-the-site-keeps-a-log-of-who-did-what.md).

## What it keeps, and what it will not

An entry is the action, who did it, what it was done to and when. The table has
no column for an address and none for a request body, and the application's
role has no right to change a row once it is written: entries are added, read,
and removed by the scheduled clean-up (`PostgresExpiredRecords`,
`deleteAuditEventsBefore`).

The actor is read from the account as it is now, not copied: a person who
changes their name is the same person in the log, and an account that is gone
leaves an entry with no actor rather than a stale one.
