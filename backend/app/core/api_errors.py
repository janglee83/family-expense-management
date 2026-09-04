from typing import Any, NoReturn

from fastapi import HTTPException


def raise_api_error(
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
    headers: dict[str, str] | None = None,
) -> NoReturn:
    payload: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        payload["details"] = details
    raise HTTPException(status_code=status_code, detail=payload, headers=headers)
