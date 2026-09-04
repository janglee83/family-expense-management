import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.api_errors import raise_api_error
from app.core.config import get_settings
from app.core.rate_limit import (
    LOGIN_ATTEMPT_WINDOW_SECONDS,
    is_login_rate_limited,
    record_failed_login,
)
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse

router = APIRouter()

REFRESH_COOKIE_PATH = "/api/v1/auth"

# Precomputed at import time so login() always pays the Argon2 verify cost,
# even when the email doesn't exist — this closes a timing side channel that
# would otherwise leak whether an email is registered.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    secure = settings.env == "production"
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        samesite="lax",
        secure=secure,
        path=REFRESH_COOKIE_PATH,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path=REFRESH_COOKIE_PATH)


async def _issue_tokens_for_user(session: AsyncSession, response: Response, user: User) -> None:
    settings = get_settings()
    access_token = create_access_token(str(user.id))
    raw_refresh_token = generate_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw_refresh_token),
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await session.flush()
    _set_auth_cookies(response, access_token, raw_refresh_token)


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def register(
    payload: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    email = payload.email.lower()
    async with locked_write(session, tables=("users", "refresh_tokens")):
        existing = await session.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise_api_error(
                status_code=status.HTTP_409_CONFLICT,
                code="AUTH_EMAIL_ALREADY_REGISTERED",
                message="Email already registered",
            )

        user = User(
            email=email,
            password_hash=hash_password(payload.password),
            display_name=payload.display_name,
        )
        session.add(user)
        await session.flush()
        await _issue_tokens_for_user(session, response, user)
    return user


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    email = payload.email.lower()

    if await is_login_rate_limited(email):
        raise_api_error(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code="AUTH_LOGIN_RATE_LIMITED",
            message="Too many login attempts. Try again later.",
            headers={"Retry-After": str(LOGIN_ATTEMPT_WINDOW_SECONDS)},
        )

    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        # Always pay the Argon2 verify cost, even when there's no user to
        # compare against, so the response time doesn't reveal whether the
        # email is registered.
        verify_password(payload.password, _DUMMY_PASSWORD_HASH)
        await record_failed_login(email)
        raise_api_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTH_INVALID_CREDENTIALS",
            message="Invalid email or password",
        )
    if not verify_password(payload.password, user.password_hash):
        await record_failed_login(email)
        raise_api_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTH_INVALID_CREDENTIALS",
            message="Invalid email or password",
        )

    async with locked_write(session, tables=("refresh_tokens",)):
        await _issue_tokens_for_user(session, response, user)
    return user


@router.post("/refresh", response_model=UserResponse)
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    raw_refresh_token = request.cookies.get("refresh_token")
    if raw_refresh_token is None:
        raise_api_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTH_REFRESH_TOKEN_MISSING",
            message="Missing refresh token",
        )

    token_hash = hash_token(raw_refresh_token)
    async with locked_write(session, tables=("refresh_tokens",)):
        token_row = await session.scalar(
            select(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .with_for_update()
        )

        now = datetime.now(UTC)
        if token_row is None or token_row.revoked_at is not None or token_row.expires_at < now:
            raise_api_error(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="AUTH_REFRESH_TOKEN_INVALID",
                message="Invalid or expired refresh token",
            )

        token_row.revoked_at = now
        user = await session.get(User, token_row.user_id)
        if user is None or not user.is_active:
            raise_api_error(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="AUTH_REFRESH_TOKEN_INVALID",
                message="Invalid or expired refresh token",
            )

        await _issue_tokens_for_user(session, response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> None:
    raw_refresh_token = request.cookies.get("refresh_token")
    if raw_refresh_token is not None:
        token_hash = hash_token(raw_refresh_token)
        async with locked_write(session, tables=("refresh_tokens",)):
            token_row = await session.scalar(
                select(RefreshToken)
                .where(RefreshToken.token_hash == token_hash)
                .with_for_update()
            )
            if token_row is not None and token_row.revoked_at is None:
                token_row.revoked_at = datetime.now(UTC)

    _clear_auth_cookies(response)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
