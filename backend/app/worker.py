import uuid

from celery import Celery
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.models.receipt import Receipt, ReceiptStatus

_settings = get_settings()

celery_app = Celery("family_expense", broker=_settings.redis_url, backend=_settings.redis_url)
celery_app.conf.task_ignore_result = True

_sync_engine = create_engine(_settings.database_url)
SyncSessionLocal = sessionmaker(bind=_sync_engine)


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)  # type: ignore[untyped-decorator]
def process_receipt(self: object, receipt_id: str) -> None:
    with SyncSessionLocal() as session:
        receipt = session.get(Receipt, uuid.UUID(receipt_id))
        if receipt is None:
            return
        try:
            receipt.status = ReceiptStatus.PROCESSING.value
            session.commit()
        except Exception as exc:
            session.rollback()
            receipt.status = ReceiptStatus.FAILED.value
            receipt.error_message = str(exc)
            session.commit()
            raise
