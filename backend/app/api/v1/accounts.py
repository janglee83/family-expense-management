import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification
from app.core.permissions import require_owner_admin_or_creator
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.account import Account, AccountType
from app.models.family_member import FamilyMember
from app.models.user import User
from app.schemas.finance import AccountResponse, CreateAccountRequest, UpdateAccountRequest

router = APIRouter()


def _to_account_response(account: Account) -> AccountResponse:
    available_credit: int | None = None
    if account.account_type == AccountType.CREDIT_CARD and account.credit_limit is not None:
        available_credit = account.credit_limit - account.current_balance

    return AccountResponse(
        id=account.id,
        family_id=account.family_id,
        created_by_user_id=account.created_by_user_id,
        name=account.name,
        account_type=account.account_type,
        currency_code=account.currency_code,
        current_balance=account.current_balance,
        is_active=account.is_active,
        credit_limit=account.credit_limit,
        statement_closing_day=account.statement_closing_day,
        payment_due_day=account.payment_due_day,
        minimum_payment=account.minimum_payment,
        statement_balance=account.statement_balance,
        available_credit=available_credit,
    )


async def _get_account_or_404(
    family_id: uuid.UUID, account_id: uuid.UUID, session: AsyncSession
) -> Account:
    account = await session.scalar(
        select(Account).where(Account.id == account_id, Account.family_id == family_id)
    )
    if account is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="ACCOUNT_NOT_FOUND",
            message="Account not found",
        )
    return account


@router.get("/")
async def list_accounts(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[AccountResponse]:
    result = await session.scalars(
        select(Account).where(Account.family_id == family_id).order_by(Account.created_at)
    )
    return [_to_account_response(item) for item in result.all()]


@router.get("/{account_id}")
async def get_account(
    family_id: uuid.UUID,
    account_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AccountResponse:
    account = await _get_account_or_404(family_id, account_id, session)
    return _to_account_response(account)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_account(
    family_id: uuid.UUID,
    payload: CreateAccountRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AccountResponse:
    async with locked_write(session, tables=("accounts", "notifications")):
        account = Account(
            family_id=family_id,
            created_by_user_id=user.id,
            name=payload.name,
            account_type=payload.account_type,
            currency_code=payload.currency_code,
            current_balance=payload.opening_balance,
            is_active=True,
            credit_limit=payload.credit_limit,
            statement_closing_day=payload.statement_closing_day,
            payment_due_day=payload.payment_due_day,
            minimum_payment=payload.minimum_payment,
            statement_balance=(
                payload.opening_balance
                if payload.account_type == AccountType.CREDIT_CARD
                else 0
            ),
        )
        session.add(account)
        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} created account \"{account.name}\".",
            actor_user_id=user.id,
        )

    return _to_account_response(account)


@router.patch("/{account_id}")
async def update_account(
    family_id: uuid.UUID,
    account_id: uuid.UUID,
    payload: UpdateAccountRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AccountResponse:
    async with locked_write(session, tables=("accounts", "notifications")):
        account = await _get_account_or_404(family_id, account_id, session)
        require_owner_admin_or_creator(membership, account.created_by_user_id)

        if payload.name is not None:
            account.name = payload.name
        if payload.is_active is not None:
            account.is_active = payload.is_active

        credit_fields = {
            "credit_limit",
            "statement_closing_day",
            "payment_due_day",
            "minimum_payment",
        }
        if account.account_type != AccountType.CREDIT_CARD:
            provided_credit_fields = [
                field_name for field_name in credit_fields if field_name in payload.model_fields_set
            ]
            if provided_credit_fields:
                raise_api_error(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    code="ACCOUNT_CREDIT_CARD_FIELDS_FORBIDDEN",
                    message="Credit card fields are allowed only for credit card accounts",
                )
        else:
            if payload.credit_limit is not None:
                account.credit_limit = payload.credit_limit
            if payload.statement_closing_day is not None:
                account.statement_closing_day = payload.statement_closing_day
            if payload.payment_due_day is not None:
                account.payment_due_day = payload.payment_due_day
            if payload.minimum_payment is not None:
                account.minimum_payment = payload.minimum_payment

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} updated account \"{account.name}\".",
            actor_user_id=user.id,
        )

    return _to_account_response(account)
