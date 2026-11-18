# Iteration 3 check: did cashier-created doc / sale reach the server? (read-only)
import os, requests
API = os.environ["EXPO_BACKEND_URL"].rstrip("/") + "/api"
tok = requests.post(f"{API}/auth/login", json={"email": "demo@usahora.id", "password": "Usahora123"}).json()["access_token"]
recs = requests.get(f"{API}/sync/pull", headers={"Authorization": f"Bearer {tok}"}).json()["records"]
docs = [r for r in recs if r["entity"] == "docs" and r.get("data") and "TEST_CashierDoc" in str(r["data"].get("title"))]
print("TEST_CashierDoc on server:", len(docs))
sales = [r for r in recs if r["entity"] == "sales" and r.get("data") and r["data"].get("number") == "TRX-261118-000125"]
print("cashier sale TRX-261118-000125 on server:", len(sales), sales[0]["data"].get("cashier_name") if sales else None)
nums = [r["data"]["number"] for r in recs if r["entity"] == "sales" and r.get("data") and not r["deleted"]]
dups = {n for n in nums if nums.count(n) > 1}
print("duplicate sale numbers:", dups)
print("entities in activities by cashier:", sum(1 for r in recs if r["entity"] == "activities"))
