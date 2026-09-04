import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.account import Account, AccountType
from app.models.category import Category
from app.models.family_member import FamilyMember
from app.models.ledger_transaction import LedgerTransaction, LedgerTransactionType
from app.models.user import User
from app.schemas.finance import CreateLedgerTransactionRequest, LedgerTransactionResponse

router = APIRouter()

_BOTH_ACCOUNTS_REQUIRED_MESSAGE = "source_account_id and destination_account_id are required"


def _is_liability_account(account: Account) -> bool:
    return account.account_type in {AccountType.CREDIT_CARD, AccountType.LOAN}


async def _load_account_or_422(
    family_id: uuid.UUID,
    account_id: uuid.UUID,
    session: AsyncSession,
) -> Account:
    account = await session.scalar(
        select(Account)
        .where(Account.id == account_id, Account.family_id == family_id)
        .with_for_update()
    )
    if account is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_ACCOUNT_INVALID_FOR_FAMILY",
            message="account_id is not valid for this family",
        )
    if not account.is_active:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_ACCOUNT_INACTIVE",
            message="account is inactive",
        )
    return account


async def _validate_category(
    family_id: uuid.UUID,
    category_id: uuid.UUID,
    session: AsyncSession,
) -> None:
    category = await session.get(Category, category_id)
    if category is None or (category.family_id is not None and category.family_id != family_id):
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_CATEGORY_INVALID_FOR_FAMILY",
            message="category_id is not a valid category for this family",
        )


def _require_source_account(source_account: Account | None) -> Account:
    if source_account is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_SOURCE_ACCOUNT_REQUIRED",
            message="source_account_id is required",
        )
    return source_account


def _require_destination_account(destination_account: Account | None) -> Account:
    if destination_account is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_DESTINATION_ACCOUNT_REQUIRED",
            message="destination_account_id is required",
        )
    return destination_account


def _require_both_accounts(
    source_account: Account | None,
    destination_account: Account | None,
) -> tuple[Account, Account]:
    if source_account is None or destination_account is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_BOTH_ACCOUNTS_REQUIRED",
            message=_BOTH_ACCOUNTS_REQUIRED_MESSAGE,
        )
    return source_account, destination_account


def _apply_income(amount: int, destination_account: Account | None) -> None:
    destination = _require_destination_account(destination_account)
    if _is_liability_account(destination):
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_INVALID_INCOME_DESTINATION",
            message="Income must be posted to an asset account",
        )
    destination.current_balance += amount


def _apply_expense(amount: int, source_account: Account | None) -> None:
    source = _require_source_account(source_account)
    if source.account_type == AccountType.CREDIT_CARD:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_USE_CREDIT_CARD_PURCHASE",
            message="Use credit_card_purchase for credit card spending",
        )
    if _is_liability_account(source):
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_INVALID_EXPENSE_SOURCE",
            message="Expense must be posted from an asset account",
        )
    source.current_balance -= amount


def _apply_transfer(
    amount: int,
    source_account: Account | None,
    destination_account: Account | None,
) -> None:
    source, destination = _require_both_accounts(source_account, destination_account)
    if _is_liability_account(source) or _is_liability_account(destination):
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_TRANSFER_ASSET_ONLY",
            message="Transfer supports asset accounts only",
        )
    source.current_balance -= amount
    destination.current_balance += amount


def _apply_credit_card_purchase(amount: int, source_account: Account | None) -> None:
    source = _require_source_account(source_account)
    if source.account_type != AccountType.CREDIT_CARD:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_CREDIT_CARD_REQUIRED",
            message="source_account_id must be a credit card account",
        )
    source.current_balance += amount
    source.statement_balance += amount


def _apply_credit_card_payment(
    amount: int,
    source_account: Account | None,
    destination_account: Account | None,
) -> None:
    source, destination = _require_both_accounts(source_account, destination_account)
    if _is_liability_account(source):
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_INVALID_PAYMENT_SOURCE",
            message="Payment source must be an asset account",
        )
    if destination.account_type != AccountType.CREDIT_CARD:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_INVALID_PAYMENT_DESTINATION",
            message="Payment destination must be a credit card account",
        )
    if destination.current_balance < amount:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="LEDGER_CREDIT_CARD_OVERPAYMENT",
            message="Payment amount exceeds credit card liability",
        )

    source.current_balance -= amount
    destination.current_balance -= amount
    destination.statement_balance = max(destination.statement_balance - amount, 0)


def _apply_balance_effects(
    payload: CreateLedgerTransactionRequest,
    source_account: Account | None,
    destination_account: Account | None,
) -> None:
    if payload.transaction_type == LedgerTransactionType.INCOME:
        _apply_income(payload.amount, destination_account)
        return

    if payload.transaction_type == LedgerTransactionType.EXPENSE:
        _apply_expense(payload.amount, source_account)
        return

    if payload.transaction_type == LedgerTransactionType.TRANSFER:
        _apply_transfer(payload.amount, source_account, destination_account)
        return

    if payload.transaction_type == LedgerTransactionType.CREDIT_CARD_PURCHASE:
        _apply_credit_card_purchase(payload.amount, source_account)
        return

    if payload.transaction_type == LedgerTransactionType.CREDIT_CARD_PAYMENT:
        _apply_credit_card_payment(payload.amount, source_account, destination_account)
        return

    source, destination = _require_both_accounts(source_account, destination_account)
    source.current_balance -= payload.amount
    destination.current_balance += payload.amount


@router.get("/", response_model=list[LedgerTransactionResponse])
async def list_ledger_transactions(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[LedgerTransaction]:
    result = await session.scalars(
        select(LedgerTransaction)
        .where(LedgerTransaction.family_id == family_id)
        .order_by(LedgerTransaction.occurred_on.desc(), LedgerTransaction.created_at.desc())
    )
    return list(result.all())


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=LedgerTransactionResponse)
async def create_ledger_transaction(
    family_id: uuid.UUID,
    payload: CreateLedgerTransactionRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LedgerTransaction:
    async with locked_write(
        session,
        tables=("accounts", "ledger_transactions", "notifications"),
    ):
        source_account: Account | None = None
        destination_account: Account | None = None

        if payload.source_account_id is not None:
            source_account = await _load_account_or_422(
                family_id, payload.source_account_id, session
            )

        if payload.destination_account_id is not None:
            destination_account = await _load_account_or_422(
                family_id, payload.destination_account_id, session
            )

        if payload.category_id is not None:
            await _validate_category(family_id, payload.category_id, session)

        _apply_balance_effects(payload, source_account, destination_account)

        ledger_transaction = LedgerTransaction(
            family_id=family_id,
            created_by_user_id=user.id,
            transaction_type=payload.transaction_type,
            amount=payload.amount,
            occurred_on=payload.occurred_on,
            description=payload.description,
            category_id=payload.category_id,
            source_account_id=payload.source_account_id,
            destination_account_id=payload.destination_account_id,
        )
        session.add(ledger_transaction)

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} added a {payload.transaction_type.value} transaction.",
            actor_user_id=user.id,
        )

    return ledger_transaction
