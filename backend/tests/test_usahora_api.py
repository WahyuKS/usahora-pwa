# USAHORA backend API regression tests: auth, business, sync (idempotency/immutable/conflict/isolation), backup
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _register(name="TEST_user"):
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": name, "business_name": "TEST_Biz", "email": email, "password": "Password123"})
    if r.status_code == 429:
        time.sleep(61)
        r = requests.post(f"{API}/auth/register", json={"name": name, "business_name": "TEST_Biz", "email": email, "password": "Password123"})
    assert r.status_code == 201, r.text
    return email, r.json()


@pytest.fixture(scope="module")
def user_a():
    email, data = _register("TEST_A")
    return {"email": email, "token": data["access_token"], "data": data}


@pytest.fixture(scope="module")
def user_b():
    email, data = _register("TEST_B")
    return {"email": email, "token": data["access_token"], "data": data}


def H(t):
    return {"Authorization": f"Bearer {t}"}


def op(entity, rid, payload=None, action="upsert", base=None):
    return {"op_id": uuid.uuid4().hex, "entity": entity, "record_id": rid, "action": action, "payload": payload,
            "base_updated_at": base, "created_at": "2026-01-10T00:00:00Z"}


# Auth module
class TestAuth:
    def test_register_returns_token_and_business(self, user_a):
        d = user_a["data"]
        assert d["user"]["email"] == user_a["email"]
        assert d["business"]["name"] == "TEST_Biz"
        assert "_id" not in d["business"]

    def test_register_duplicate_409(self, user_a):
        r = requests.post(f"{API}/auth/register", json={"name": "x", "business_name": "x", "email": user_a["email"], "password": "Password123"})
        assert r.status_code == 409

    def test_register_short_password_422(self):
        r = requests.post(f"{API}/auth/register", json={"name": "x", "business_name": "x", "email": "test_short@example.com", "password": "123"})
        assert r.status_code == 422

    def test_login_wrong_401(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": "wrongpass1"})
        assert r.status_code == 401

    def test_login_ok_and_me(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"].upper(), "password": "Password123"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        me = requests.get(f"{API}/auth/me", headers=H(tok))
        assert me.status_code == 200 and me.json()["user"]["email"] == user_a["email"]

    def test_me_no_token_401(self):
        assert requests.get(f"{API}/auth/me").status_code == 401


# Business settings
class TestBusiness:
    def test_update_business_persists(self, user_a):
        r = requests.put(f"{API}/business", headers=H(user_a["token"]), json={"name": "TEST_Biz2", "address": "Jl. Test", "tax_enabled": True, "tax_rate": 11})
        assert r.status_code == 200 and r.json()["name"] == "TEST_Biz2"
        me = requests.get(f"{API}/auth/me", headers=H(user_a["token"])).json()
        assert me["business"]["address"] == "Jl. Test" and me["business"]["tax_enabled"] is True


# Sync module
class TestSync:
    def test_push_idempotent_same_op(self, user_a):
        o = op("products", "TEST_p1", {"id": "TEST_p1", "name": "TEST_Prod", "updated_at": "2026-01-10T00:00:00Z"})
        r1 = requests.post(f"{API}/sync/push", headers=H(user_a["token"]), json={"ops": [o]}).json()
        r2 = requests.post(f"{API}/sync/push", headers=H(user_a["token"]), json={"ops": [o]}).json()
        assert o["op_id"] in r1["applied"]
        assert o["op_id"] in r2["duplicates"]

    def test_immutable_sale_not_overwritten(self, user_a):
        t = H(user_a["token"])
        requests.post(f"{API}/sync/push", headers=t, json={"ops": [op("sales", "TEST_s1", {"id": "TEST_s1", "total": 1000})]})
        r = requests.post(f"{API}/sync/push", headers=t, json={"ops": [op("sales", "TEST_s1", {"id": "TEST_s1", "total": 9999})]}).json()
        assert len(r["duplicates"]) == 1
        recs = requests.get(f"{API}/sync/pull", headers=t).json()["records"]
        s = [x for x in recs if x["id"] == "TEST_s1"][0]
        assert s["data"]["total"] == 1000

    def test_conflict_detection_products(self, user_a):
        t = H(user_a["token"])
        requests.post(f"{API}/sync/push", headers=t, json={"ops": [op("products", "TEST_p2", {"id": "TEST_p2", "name": "v1", "updated_at": "2026-01-10T05:00:00Z"})]})
        r = requests.post(f"{API}/sync/push", headers=t, json={"ops": [op("products", "TEST_p2", {"id": "TEST_p2", "name": "v2", "updated_at": "2026-01-10T06:00:00Z"}, base="2026-01-10T01:00:00Z")]}).json()
        assert len(r["conflicts"]) == 1 and r["conflicts"][0]["server"]["name"] == "v1"
        # force overrides
        r2 = requests.post(f"{API}/sync/push", headers=t, json={"force": True, "ops": [op("products", "TEST_p2", {"id": "TEST_p2", "name": "v2", "updated_at": "2026-01-10T06:00:00Z"}, base="2026-01-10T01:00:00Z")]}).json()
        assert len(r2["applied"]) == 1

    def test_unknown_entity_rejected(self, user_a):
        r = requests.post(f"{API}/sync/push", headers=H(user_a["token"]), json={"ops": [op("hackers", "TEST_x", {})]}).json()
        assert len(r["rejected"]) == 1

    def test_delete_then_pull_marks_deleted(self, user_a):
        t = H(user_a["token"])
        requests.post(f"{API}/sync/push", headers=t, json={"ops": [op("products", "TEST_p1", action="delete")]})
        recs = requests.get(f"{API}/sync/pull", headers=t).json()["records"]
        assert [x for x in recs if x["id"] == "TEST_p1"][0]["deleted"] is True

    def test_business_isolation(self, user_a, user_b):
        recs = requests.get(f"{API}/sync/pull", headers=H(user_b["token"])).json()["records"]
        assert not any(x["id"].startswith("TEST_") for x in recs)
        st = requests.get(f"{API}/sync/status", headers=H(user_b["token"])).json()
        assert st["records"] == 0

    def test_business_id_forced_by_server(self, user_a, user_b):
        t = H(user_b["token"])
        requests.post(f"{API}/sync/push", headers=t, json={"ops": [op("customers", "TEST_c1", {"id": "TEST_c1", "business_id": user_a["data"]["business"]["id"]})]})
        recs = requests.get(f"{API}/sync/pull", headers=t).json()["records"]
        c = [x for x in recs if x["id"] == "TEST_c1"][0]
        assert c["data"]["business_id"] == user_b["data"]["business"]["id"]


# Backup module
class TestBackup:
    def test_backup_latest_404_then_create(self, user_b):
        t = H(user_b["token"])
        assert requests.get(f"{API}/backup/latest", headers=t).status_code == 404
        assert requests.post(f"{API}/backup", headers=t, json={"data": {"app": "other"}}).status_code == 400
        r = requests.post(f"{API}/backup", headers=t, json={"data": {"app": "usahora", "v": 1}})
        assert r.status_code == 200
        latest = requests.get(f"{API}/backup/latest", headers=t).json()
        assert latest["id"] == r.json()["id"] and latest["data"]["v"] == 1 and "_id" not in latest
