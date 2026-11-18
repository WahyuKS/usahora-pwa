# Iteration 4: retest fixes - upload size guard, cashier docs rejected / customers applied, owner regression
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
OWNER = ("demo@usahora.id", "Usahora123")
CASHIER = ("kasir@usahora.id", "Kasir12345")
NOW = "2026-01-15T00:00:00Z"


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
    if r.status_code != 200:
        pytest.skip(f"owner login failed {r.status_code}")
    return r.json()


@pytest.fixture(scope="module")
def cashier():
    r = login(*CASHIER)
    if r.status_code != 200:
        pytest.skip(f"cashier login failed {r.status_code}")
    return r.json()


# Auth regression
def test_owner_and_cashier_login(owner, cashier):
    assert owner["user"]["role"] == "owner"
    assert cashier["user"]["role"] == "cashier"
    assert owner["user"]["business_id"] == cashier["user"]["business_id"]


# Upload: Content-Length > 6MB rejected with 400
def test_upload_over_6mb_400(owner):
    t = time.time()
    r = requests.post(f"{API}/upload", headers=h(owner["access_token"]),
                      files={"file": ("TEST_huge.png", b"\x00" * (7 * 1024 * 1024), "image/png")}, timeout=120)
    print(f"elapsed {time.time() - t:.1f}s")
    assert r.status_code == 400, r.text
    assert "5 MB" in r.json().get("detail", "")


def test_upload_between_5_and_6mb_400(owner):
    r = requests.post(f"{API}/upload", headers=h(owner["access_token"]),
                      files={"file": ("TEST_big.png", b"\x00" * (5 * 1024 * 1024 + 100), "image/png")}, timeout=120)
    assert r.status_code == 400


# Staff list regression
def test_staff_list_contains_kasir(owner):
    r = requests.get(f"{API}/staff", headers=h(owner["access_token"]), timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("staff", data.get("items", []))
    k = [s for s in items if s.get("email") == "kasir@usahora.id"]
    assert k and k[0].get("is_active") is True


# Cashier sync: docs rejected, customers applied & visible to owner, customer delete rejected
def test_cashier_docs_rejected_customer_applied(cashier, owner):
    doc_id, cust_id = f"TEST_doc_{uuid.uuid4().hex[:8]}", f"TEST_cust_{uuid.uuid4().hex[:8]}"
    ops = [
        {"op_id": uuid.uuid4().hex, "entity": "docs", "record_id": doc_id, "action": "upsert",
         "payload": {"id": doc_id, "title": "TEST_doc", "content": "x", "category": "SOP"}, "created_at": NOW},
        {"op_id": uuid.uuid4().hex, "entity": "customers", "record_id": cust_id, "action": "upsert",
         "payload": {"id": cust_id, "name": "TEST_CustIter4", "phone": "0812"}, "created_at": NOW},
    ]
    r = requests.post(f"{API}/sync/push", headers=h(cashier["access_token"]), json={"ops": ops}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert ops[0]["op_id"] in {x["op_id"] for x in d["rejected"]}
    assert ops[1]["op_id"] in d["applied"]
    # cashier cannot delete customers
    del_op = {"op_id": uuid.uuid4().hex, "entity": "customers", "record_id": cust_id, "action": "delete", "created_at": NOW}
    r = requests.post(f"{API}/sync/push", headers=h(cashier["access_token"]), json={"ops": [del_op]}, timeout=30)
    assert del_op["op_id"] in {x["op_id"] for x in r.json()["rejected"]}
    # owner sees the customer
    pull = requests.get(f"{API}/sync/pull", headers=h(owner["access_token"]), timeout=60).json()["records"]
    ids = {(x["entity"], x["id"]) for x in pull if not x["deleted"]}
    assert ("customers", cust_id) in ids
    assert ("docs", doc_id) not in ids
    # cleanup by owner (by id)
    r = requests.post(f"{API}/sync/push", headers=h(owner["access_token"]), json={"ops": [
        {"op_id": uuid.uuid4().hex, "entity": "customers", "record_id": cust_id, "action": "delete", "created_at": NOW}]}, timeout=30)
    assert r.status_code == 200
