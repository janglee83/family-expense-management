import time

import jwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_hash_password_and_verify_roundtrip() -> None:
    password_hash = hash_password("correct-password")

    assert verify_password("correct-password", password_hash) is True


def test_verify_password_rejects_wrong_password() -> None:
    password_hash = hash_password("correct-password")

    assert verify_password("wrong-password", password_hash) is False


def test_verify_password_returns_false_for_malformed_hash() -> None:
    # A corrupt/malformed password_hash raises argon2.exceptions.InvalidHash,
    # not VerifyMismatchError — verify_password must treat that as "not
    # authenticated" too, rather than letting it propagate as a 500.
    assert verify_password("correct-password", "not-a-real-argon2-hash") is False


def test_create_and_decode_access_token_roundtrip() -> None:
    token = create_access_token("user-123")

    payload = decode_access_token(token)

    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"


def test_decode_access_token_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "0")
    get_settings.cache_clear()
    try:
        token = create_access_token("user-123")
        time.sleep(1.1)

        with pytest.raises(jwt.ExpiredSignatureError):
            decode_access_token(token)
    finally:
        get_settings.cache_clear()


def test_decode_access_token_rejects_tampered_token() -> None:
    token = create_access_token("user-123")
    header, payload, signature = token.split(".")
    tampered_payload = payload[:-1] + ("A" if payload[-1] != "A" else "B")
    tampered = f"{header}.{tampered_payload}.{signature}"

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(tampered)


def test_generate_refresh_token_returns_unique_values() -> None:
    assert generate_refresh_token() != generate_refresh_token()


def test_hash_token_is_deterministic_and_not_reversible_looking() -> None:
    raw = generate_refresh_token()

    assert hash_token(raw) == hash_token(raw)
    assert hash_token(raw) != raw
