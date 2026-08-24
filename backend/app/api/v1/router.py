from fastapi import APIRouter

from app.api.v1 import auth, families, ping

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(families.router, prefix="/families", tags=["families"])
