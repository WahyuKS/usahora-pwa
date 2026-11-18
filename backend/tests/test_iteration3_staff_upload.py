# Iteration 3: staff (cashier) accounts, role restrictions, sync filtering, file upload/download
import io
import os
import struct
import time
import uuid
import zlib

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
OWNER = ("demo@usahora.id", "Usahora123")
CASHIER = ("kasir@usahora.id", "Kasir12345")


def tiny_png() -> bytes:
    raw = b"\x00\xff\x00\x00"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def login(email, pw):
    for _ in range(3):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
        if r.status_code != 429:
            return r
        time.sleep(30)
    return r


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner():
    r = login(*OWNER)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def cashier():
    r = login(*CASHIER)
    if r.status_code != 200:
        pytest.skip(f"cashier login failed {r.status_code} {r.text}")
    return r.json()


@pytest.fixture(scope="module")
def other_biz():
    r = requests.post(f"{API}/auth/register", json={"name": "TEST_Other", "business_name": "TEST_OtherBiz",
                      "email": f"test_other_{uuid.uuid4().hex[:8]}@example.com", "password": "Passw0rd123"}, timeout=30)
    assert r.status_code == 201, r.text
    return r.json()


# --- login role ---
def test_login_roles(owner, cashier):
    assert owner["user"]["role"] == "owner"
    assert cashier["user"]["role"] == "cashier"
    assert cashier["user"]["business_id"] == owner["user"]["business_id"]
    assert cashier["business"]["name"] == owner["business"]["name"]


# --- staff CRUD ---
class TestStaff:
    state = {}

    def test_create_staff_owner(self, owner):
        email = f"test_staff_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/staff", headers=h(owner["access_token"]),
                          json={"name": "TEST_Kasir", "email": email, "password": "Kasir12345"}, timeout=30)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["role"] == "cashier" and d["email"] == email and "password_hash" not in d
        TestStaff.state.update(id=d["id"], email=email)

    def test_duplicate_staff_409(self, owner):
        r = requests.post(f"{API}/staff", headers=h(owner["access_token"]),
                          json={"name": "TEST_dup", "email": TestStaff.state["email"], "password": "Kasir12345"}, timeout=30)
        assert r.status_code == 409

    def test_duplicate_with_owner_email_409(self, owner):
        r = requests.post(f"{API}/staff", headers=h(owner["access_token"]),
                          json={"name": "TEST_dup", "email": "DEMO@usahora.id", "password": "Kasir12345"}, timeout=30)
        assert r.status_code == 409

    def test_cashier_cannot_create_staff(self, cashier):
        r = requests.post(f"{API}/staff", headers=h(cashier["access_token"]),
                          json={"name": "TEST_x", "email": f"test_x_{uuid.uuid4().hex[:6]}@example.com", "password": "Kasir12345"}, timeout=30)
        assert r.status_code == 403

    def test_cashier_cannot_list_staff(self, cashier):
        assert requests.get(f"{API}/staff", headers=h(cashier["access_token"]), timeout=30).status_code == 403

    def test_list_staff(self, owner):
        r = requests.get(f"{API}/staff", headers=h(owner["access_token"]), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        ids = [x["id"] for x in rows]
        assert TestStaff.state["id"] in ids
        assert any(x["email"] == "kasir@usahora.id" for x in rows)
        assert all("password_hash" not in x and "is_active" in x for x in rows)

    def test_deactivate_then_login_401(self, owner):
        # login first to get token, then deactivate -> existing token must also be invalid
        r = login(TestStaff.state["email"], "Kasir12345")
        assert r.status_code == 200
        tok = r.json()["access_token"]
        r = requests.patch(f"{API}/staff/{TestStaff.state['id']}?active=false", headers=h(owner["access_token"]), timeout=30)
        assert r.status_code == 200 and r.json()["ok"] is True
        assert login(TestStaff.state["email"], "Kasir12345").status_code == 401
        assert requests.get(f"{API}/auth/me", headers=h(tok), timeout=30).status_code == 401
        rows = requests.get(f"{API}/staff", headers=h(owner["access_token"]), timeout=30).json()
        assert [x for x in rows if x["id"] == TestStaff.state["id"]][0]["is_active"] is False

    def test_patch_unknown_404(self, owner):
        r = requests.patch(f"{API}/staff/nope-{uuid.uuid4()}?active=true", headers=h(owner["access_token"]), timeout=30)
        assert r.status_code == 404

    def test_cannot_patch_owner(self, owner):
        r = requests.patch(f"{API}/staff/{owner['user']['id']}?active=false", headers=h(owner["access_token"]), timeout=30)
        assert r.status_code == 404


# --- cashier restrictions ---
def test_cashier_business_backup_403(cashier, owner):
    biz = {k: v for k, v in owner["business"].items() if k in ("name", "address", "phone", "email", "currency", "invoice_footer", "tax_enabled", "tax_rate", "bank_info")}
    assert requests.put(f"{API}/business", headers=h(cashier["access_token"]), json=biz, timeout=30).status_code == 403
    assert requests.post(f"{API}/backup", headers=h(cashier["access_token"]), json={"data": {"app": "usahora"}}, timeout=30).status_code == 403
    assert requests.get(f"{API}/backup/latest", headers=h(cashier["access_token"]), timeout=30).status_code == 403


def test_cashier_sync_push_filtering(cashier):
    now = "2026-01-01T00:00:00Z"
    fin_id, sale_id = f"TEST_fin_{uuid.uuid4().hex[:8]}", f"TEST_sale_{uuid.uuid4().hex[:8]}"
    ops = [
        {"op_id": uuid.uuid4().hex, "entity": "finance", "record_id": fin_id, "action": "upsert",
         "payload": {"id": fin_id, "type": "expense", "amount": 1, "category": "TEST"}, "created_at": now},
        {"op_id": uuid.uuid4().hex, "entity": "sales", "record_id": sale_id, "action": "upsert",
         "payload": {"id": sale_id, "number": "TEST-TRX", "items": [], "total": 0, "is_demo": True}, "created_at": now},
        {"op_id": uuid.uuid4().hex, "entity": "products", "record_id": "TEST_prod_x", "action": "upsert",
         "payload": {"id": "TEST_prod_x", "name": "TEST"}, "created_at": now},
    ]
    r = requests.post(f"{API}/sync/push", headers=h(cashier["access_token"]), json={"ops": ops}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    rejected = {x["op_id"] for x in d["rejected"]}
    assert ops[0]["op_id"] in rejected and ops[2]["op_id"] in rejected
    assert ops[1]["op_id"] in d["applied"]


def test_cashier_sync_pull_entities(cashier, owner):
    r = requests.get(f"{API}/sync/pull", headers=h(cashier["access_token"]), timeout=60)
    assert r.status_code == 200
    ents = {x["entity"] for x in r.json()["records"]}
    assert ents <= {"products", "customers", "sales", "payments", "stockMovements", "docs"}, ents
    assert "products" in ents
    o = requests.get(f"{API}/sync/pull", headers=h(owner["access_token"]), timeout=60).json()
    assert len({x["entity"] for x in o["records"]}) >= len(ents)


# --- upload / files ---
class TestFiles:
    state = {}

    def test_upload_png_owner(self, owner):
        r = requests.post(f"{API}/upload", headers=h(owner["access_token"]),
                          files={"file": ("TEST_logo.png", tiny_png(), "image/png")}, timeout=120)
        assert r.status_code == 200, r.text
        assert r.json()["id"]
        TestFiles.state["id"] = r.json()["id"]

    def test_download_with_query_token(self, owner):
        fid = TestFiles.state["id"]
        r = requests.get(f"{API}/files/{fid}?token={owner['access_token']}", timeout=60)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/png")
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_download_with_bearer_and_cashier(self, cashier):
        r = requests.get(f"{API}/files/{TestFiles.state['id']}", headers=h(cashier["access_token"]), timeout=60)
        assert r.status_code == 200

    def test_download_no_token_401(self):
        assert requests.get(f"{API}/files/{TestFiles.state['id']}", timeout=30).status_code == 401

    def test_other_business_404(self, other_biz):
        r = requests.get(f"{API}/files/{TestFiles.state['id']}?token={other_biz['access_token']}", timeout=30)
        assert r.status_code == 404

    def test_upload_bad_type_400(self, owner):
        r = requests.post(f"{API}/upload", headers=h(owner["access_token"]),
                          files={"file": ("TEST.txt", b"hello", "text/plain")}, timeout=30)
        assert r.status_code == 400

    def test_upload_too_big_400(self, owner):
        r = requests.post(f"{API}/upload", headers=h(owner["access_token"]),
                          files={"file": ("TEST_big.png", b"\x00" * (5 * 1024 * 1024 + 10), "image/png")}, timeout=120)
        assert r.status_code == 400

    def test_cashier_upload_403(self, cashier):
        r = requests.post(f"{API}/upload", headers=h(cashier["access_token"]),
                          files={"file": ("TEST.png", tiny_png(), "image/png")}, timeout=30)
        assert r.status_code == 403
