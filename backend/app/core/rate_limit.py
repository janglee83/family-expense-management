from app.core.redis import get_redis

LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60


def _rate_limit_key(email: str) -> str:
    return f"login_attempts:{email.lower()}"


async def is_login_rate_limited(email: str) -> bool:
    redis = get_redis()
    count = await redis.get(_rate_limit_key(email))
    return count is not None and int(count) >= LOGIN_ATTEMPT_LIMIT


async def record_failed_login(email: str) -> None:
    redis = get_redis()
    key = _rate_limit_key(email)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS)
