import uuid
from datetime import date, timedelta
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
from app.models.account import Account
from app.models.category import Category
from app.models.family_member import FamilyMember
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User
from app.schemas.subscriptions import (
    CreateSubscriptionRequest,
    SubscriptionResponse,
    SubscriptionSummaryResponse,
    UpdateSubscriptionRequest,
)
from app.services.finance_engine import (
    UPCOMING_RENEWAL_WINDOW_DAYS,
    SubscriptionBillingCycle as ServiceBillingCycle,
    SubscriptionPlan,
    build_subscription_totals,
)

router = APIRouter()


def _to_service_cycle(value: str) -> ServiceBillingCycle:
    return ServiceBillingCycle(value)


async def _validate_category(
    family_id: uuid.UUID,
    category_id: uuid.UUID | None,
    session: AsyncSession,
) -> None:
    if category_id is None:
        return
    category = await session.get(Category, category_id)
    if category is None or (category.family_id is not None and category.family_id != family_id):
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="SUBSCRIPTION_CATEGORY_INVALID",
            message="category_id is not valid for this family",
        )


async def _validate_account(
    family_id: uuid.UUID,
    account_id: uuid.UUID | None,
    session: AsyncSession,
) -> None:
    if account_id is None:
        return
    account = await session.scalar(select(Account).where(Account.id == account_id, Account.family_id == family_id))
    if account is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="SUBSCRIPTION_ACCOUNT_INVALID",
            message="account_id is not valid for this family",
        )


async def _get_subscription_or_404(
    family_id: uuid.UUID,
    subscription_id: uuid.UUID,
    session: AsyncSession,
) -> Subscription:
    subscription = await session.scalar(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.family_id == family_id,
        )
    )
    if subscription is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SUBSCRIPTION_NOT_FOUND",
            message="Subscription not found",
        )
    return subscription


@router.get("/", response_model=list[SubscriptionResponse])
async def list_subscriptions(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Subscription]:
    result = await session.scalars(
        select(Subscription).where(Subscription.family_id == family_id).order_by(Subscription.created_at)
    )
    return list(result.all())


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=SubscriptionResponse)
async def create_subscription(
    family_id: uuid.UUID,
    payload: CreateSubscriptionRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Subscription:
    async with locked_write(session, tables=("subscriptions", "categories", "accounts", "notifications")):
        await _validate_category(family_id, payload.category_id, session)
        await _validate_account(family_id, payload.account_id, session)

        subscription = Subscription(
            family_id=family_id,
            created_by_user_id=user.id,
            name=payload.name,
            merchant=payload.merchant,
            amount=payload.amount,
            currency_code=payload.currency_code,
            billing_cycle=payload.billing_cycle,
            next_billing_date=payload.next_billing_date,
            category_id=payload.category_id,
            account_id=payload.account_id,
            status=payload.status,
            cancellation_url=str(payload.cancellation_url) if payload.cancellation_url else None,
        )
        session.add(subscription)

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} added subscription \"{subscription.name}\".",
            actor_user_id=user.id,
        )

    return subscription


@router.patch("/{subscription_id}", response_model=SubscriptionResponse)
async def update_subscription(
    family_id: uuid.UUID,
    subscription_id: uuid.UUID,
    payload: UpdateSubscriptionRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Subscription:
    async with locked_write(session, tables=("subscriptions", "categories", "accounts", "notifications")):
        subscription = await _get_subscription_or_404(family_id, subscription_id, session)
        require_owner_admin_or_creator(membership, subscription.created_by_user_id)

        if "category_id" in payload.model_fields_set:
            await _validate_category(family_id, payload.category_id, session)
        if "account_id" in payload.model_fields_set:
            await _validate_account(family_id, payload.account_id, session)

        if payload.name is not None:
            subscription.name = payload.name
        if payload.merchant is not None:
            subscription.merchant = payload.merchant
        if payload.amount is not None:
            subscription.amount = payload.amount
        if payload.billing_cycle is not None:
            subscription.billing_cycle = payload.billing_cycle
        if payload.next_billing_date is not None:
            subscription.next_billing_date = payload.next_billing_date
        if "category_id" in payload.model_fields_set:
            subscription.category_id = payload.category_id
        if "account_id" in payload.model_fields_set:
            subscription.account_id = payload.account_id
        if payload.status is not None:
            subscription.status = payload.status
        if "cancellation_url" in payload.model_fields_set:
            subscription.cancellation_url = (
                str(payload.cancellation_url) if payload.cancellation_url is not None else None
            )

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} updated subscription \"{subscription.name}\".",
            actor_user_id=user.id,
        )

    return subscription


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    family_id: uuid.UUID,
    subscription_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    async with locked_write(session, tables=("subscriptions", "notifications")):
        subscription = await _get_subscription_or_404(family_id, subscription_id, session)
        require_owner_admin_or_creator(membership, subscription.created_by_user_id)

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} deleted subscription \"{subscription.name}\".",
            actor_user_id=user.id,
        )
        await session.delete(subscription)


@router.get("/summary")
async def get_subscription_summary(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SubscriptionSummaryResponse:
    result = await session.scalars(
        select(Subscription)
        .where(Subscription.family_id == family_id, Subscription.status == SubscriptionStatus.ACTIVE)
        .order_by(Subscription.next_billing_date)
    )
    subscriptions = list(result.all())
    today = date.today()

    totals = build_subscription_totals(
        [
            SubscriptionPlan(
                name=item.name,
                amount=item.amount,
                billing_cycle=_to_service_cycle(item.billing_cycle.value),
                next_billing_date=item.next_billing_date,
            )
            for item in subscriptions
        ],
        as_of=today,
    )

    window_end = today + timedelta(days=UPCOMING_RENEWAL_WINDOW_DAYS)
    return SubscriptionSummaryResponse(
        monthly_total=totals.monthly_total,
        yearly_total=totals.yearly_total,
        upcoming_subscription_ids=[
            item.id for item in subscriptions if today <= item.next_billing_date <= window_end
        ],
    )
