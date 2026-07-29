"""Pure domain logic — no database, no framework.

These modules are deliberately dependency-free (stdlib only) so the tricky bits
— fee arithmetic and matchmaking grouping — can be unit-tested in isolation and
reasoned about without spinning up Postgres.
"""
