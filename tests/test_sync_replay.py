import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models import SyncReplayRecord
from app.services.sync_replay import begin_sync_replay, complete_sync_replay, fail_sync_replay


class _FakeUrl:
    def __init__(self, path: str):
        self.path = path


class _FakeRequest:
    def __init__(self, path: str, headers: dict[str, str] | None = None, method: str = "POST"):
        self.url = _FakeUrl(path)
        self.headers = headers or {}
        self.method = method


class SyncReplayTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        self.session_local = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        Base.metadata.create_all(self.engine, tables=[SyncReplayRecord.__table__])
        self.session_patch = patch("app.services.sync_replay.SessionLocal", self.session_local)
        self.session_patch.start()

    def tearDown(self):
        self.session_patch.stop()
        Base.metadata.drop_all(self.engine, tables=[SyncReplayRecord.__table__])
        self.engine.dispose()

    def test_returns_cached_response_for_duplicate_replay(self):
        request = _FakeRequest(
            "/transactions",
            headers={
                "x-sync-operation-id": "offline-op-1:transaction-create",
                "x-sync-fingerprint": "fp-1",
                "x-sync-replay-token": "token-1",
                "x-sync-operation": "transaction_create",
            },
        )
        payload = {"student_id": 1, "items": [{"book_id": 1, "quantity": 1}]}

        state = begin_sync_replay(request, payload, "transaction_create")
        self.assertTrue(state.enabled)
        response = complete_sync_replay(state, {"id": 55, "total_amount": 10}, 201)
        self.assertEqual(response.status_code, 201)

        second = begin_sync_replay(request, payload, "transaction_create")
        self.assertIsNotNone(second.duplicate_response)
        self.assertEqual(second.duplicate_response.status_code, 201)
        self.assertEqual(second.duplicate_response.headers["X-Sync-Replay-Status"], "duplicate")
        self.assertEqual(json.loads(second.duplicate_response.body.decode("utf-8"))["id"], 55)

    def test_rejects_same_operation_id_with_different_fingerprint(self):
        request = _FakeRequest(
            "/transactions",
            headers={
                "x-sync-operation-id": "offline-op-2:transaction-create",
                "x-sync-fingerprint": "fp-a",
                "x-sync-replay-token": "token-a",
                "x-sync-operation": "transaction_create",
            },
        )
        begin_sync_replay(request, {"first": True}, "transaction_create")

        conflicting_request = _FakeRequest(
            "/transactions",
            headers={
                "x-sync-operation-id": "offline-op-2:transaction-create",
                "x-sync-fingerprint": "fp-b",
                "x-sync-replay-token": "token-b",
                "x-sync-operation": "transaction_create",
            },
        )

        with self.assertRaises(HTTPException) as error:
            begin_sync_replay(conflicting_request, {"second": True}, "transaction_create")
        self.assertEqual(error.exception.status_code, 409)

    def test_marks_failed_replay_records(self):
        request = _FakeRequest(
            "/safe/emergency-withdrawals",
            headers={
                "x-sync-operation-id": "offline-op-3:emergency-withdrawal",
                "x-sync-fingerprint": "fp-c",
                "x-sync-replay-token": "token-c",
                "x-sync-operation": "emergency_withdrawal",
            },
        )
        state = begin_sync_replay(request, {"amount": 10}, "emergency_withdrawal")
        fail_sync_replay(state, "temporary failure", 503)

        with self.session_local() as session:
            record = session.query(SyncReplayRecord).filter_by(operation_id="offline-op-3:emergency-withdrawal").first()
            self.assertIsNotNone(record)
            self.assertEqual(record.status, "failed")
            self.assertEqual(record.response_status, 503)


if __name__ == "__main__":
    unittest.main()
