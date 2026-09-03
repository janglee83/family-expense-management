from fastapi import APIRouter

from app.api.v1 import auth, categories, expenses, families, ping, receipts

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
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
