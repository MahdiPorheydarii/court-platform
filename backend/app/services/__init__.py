"""Service layer: the imperative shell around the pure domain logic.

Services own transactions and side effects (DB writes, notifications, realtime
pushes). Pure business rules live in ``app.domain``.
"""
