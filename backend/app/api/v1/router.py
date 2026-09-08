from fastapi import APIRouter

from app.api.v1 import (
    accounts,
    analytics,
    auth,
    categories,
    data_ops,
    expenses,
    families,
    goals,
    ledger_transactions,
    notifications,
    ping,
    receipts,
    split_expense_groups,
    split_expenses,
    subscriptions,
)

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    notifications.router, prefix="/notifications", tags=["notifications"]
)
api_router.include_router(families.router, prefix="/families", tags=["families"])
api_router.include_router(
    categories.router, prefix="/families/{family_id}/categories", tags=["categories"]
)
api_router.include_router(
    expenses.router, prefix="/families/{family_id}/expenses", tags=["expenses"]
)
api_router.include_router(
    receipts.router, prefix="/families/{family_id}/receipts", tags=["receipts"]
)
api_router.include_router(
    accounts.router, prefix="/families/{family_id}/accounts", tags=["accounts"]
)
api_router.include_router(
    ledger_transactions.router,
    prefix="/families/{family_id}/ledger-transactions",
    tags=["ledger-transactions"],
)
api_router.include_router(
    goals.router,
    prefix="/families/{family_id}/goals",
    tags=["goals"],
)
api_router.include_router(
    subscriptions.router,
    prefix="/families/{family_id}/subscriptions",
    tags=["subscriptions"],
)
api_router.include_router(
    split_expense_groups.router,
    prefix="/families/{family_id}/split-expense-groups",
    tags=["split-expense-groups"],
)
api_router.include_router(
    split_expenses.router,
    prefix="/families/{family_id}/split-expenses",
    tags=["split-expenses"],
)
api_router.include_router(
    analytics.router,
    prefix="/families/{family_id}/analytics",
    tags=["analytics"],
)
api_router.include_router(
    data_ops.router,
    prefix="/families/{family_id}",
    tags=["data-ops"],
)
