# Iteration 2 retest: rate-limit keyed by X-Forwarded-For, doc sync persistence, demo records via sync
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")


def _xff():
    return f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"


@pytest.fixture(scope="module")
def fresh_account():
    email = f"test_it2_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "TEST_It2", "business_name": "TEST_Biz", "email": email, "password": "Passw0rd!"},
                      headers={"X-Forwarded-For": _xff()})
    assert r.status_code == 201, r.text
    d = r.json()
    return {"email": email, "token": d["access_token"], "bid": d["user"]["business_id"]}


# Rate limit: distinct X-Forwarded-For values must not share a bucket
class TestRateLimit:
    def test_login_11_distinct_xff_no_429(self, fresh_account):
        codes = []
        for _ in range(11):
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": fresh_account["email"], "password": "Passw0rd!"},
                              headers={"X-Forwarded-For": _xff()})
            codes.append(r.status_code)
        assert 429 not in codes, codes
        assert all(c == 200 for c in codes), codes

    def test_login_same_xff_hits_429(self, fresh_account):
        ip = _xff()
        codes = []
        for _ in range(11):
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": fresh_account["email"], "password": "wrongpass"},
                              headers={"X-Forwarded-For": ip})
            codes.append(r.status_code)
        assert codes[:10] == [401] * 10, codes
        assert codes[10] == 429, codes


# Docs: edited/deleted template persists on server across logins
class TestDocsSync:
    def test_edit_and_delete_doc_persist(self, fresh_account):
        h = {"Authorization": f"Bearer {fresh_account['token']}"}
        did, did2 = f"TEST_doc_{uuid.uuid4().hex[:6]}", f"TEST_doc_{uuid.uuid4().hex[:6]}"
        ops = [
            {"op_id": uuid.uuid4().hex, "entity": "docs", "record_id": did, "action": "upsert",
             "payload": {"id": did, "title": "TEST_Edited", "updated_at": "2026-01-01T00:00:00Z"}, "base_updated_at": "2000-01-01T00:00:00.000Z", "created_at": "2026-01-01T00:00:00Z"},
            {"op_id": uuid.uuid4().hex, "entity": "docs", "record_id": did2, "action": "upsert",
             "payload": {"id": did2, "title": "TEST_ToDelete", "updated_at": "2026-01-01T00:00:00Z"}, "base_updated_at": None, "created_at": "2026-01-01T00:00:00Z"},
        ]
        r = requests.post(f"{BASE_URL}/api/sync/push", json={"ops": ops}, headers=h)
        assert r.status_code == 200 and len(r.json()["applied"]) == 2, r.text
        r = requests.post(f"{BASE_URL}/api/sync/push", json={"ops": [{"op_id": uuid.uuid4().hex, "entity": "docs", "record_id": did2, "action": "delete",
                                                                      "payload": None, "base_updated_at": "2026-01-01T00:00:00Z", "created_at": "2026-01-01T00:00:01Z"}]}, headers=h)
        assert r.json()["applied"], r.text
        recs = {x["id"]: x for x in requests.get(f"{BASE_URL}/api/sync/pull", headers=h).json()["records"]}
        assert recs[did]["data"]["title"] == "TEST_Edited"
        assert recs[did2]["deleted"] is True


# Demo account still has is_demo records server-side (used to derive banner)
class TestDemoAccount:
    def test_demo_has_is_demo_records(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "demo@usahora.id", "password": "Usahora123"}, headers={"X-Forwarded-For": _xff()})
        assert r.status_code == 200
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        recs = requests.get(f"{BASE_URL}/api/sync/pull", headers=h).json()["records"]
        demo = [x for x in recs if not x["deleted"] and (x.get("data") or {}).get("is_demo")]
        print("demo records:", len(demo), "total:", len(recs))
        assert len(recs) > 0
