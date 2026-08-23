from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class PingResponse(BaseModel):
    status: str
    message: str


@router.get("/ping", response_model=PingResponse)
async def ping() -> PingResponse:
    return PingResponse(status="ok", message="pong")
