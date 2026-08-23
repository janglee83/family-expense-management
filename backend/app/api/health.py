from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import get_session_factory

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok"}
