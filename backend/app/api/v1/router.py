from fastapi import APIRouter

from app.api.v1 import ping

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
