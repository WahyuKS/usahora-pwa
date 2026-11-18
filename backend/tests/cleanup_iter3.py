# Cleanup helper: soft-deletes TEST_sale_* records created by test_iteration3 (by exact ids found)
import os, uuid, requests
API = os.environ["EXPO_BACKEND_URL"].rstrip("/") + "/api"
tok = requests.post(f"{API}/auth/login", json={"email": "demo@usahora.id", "password": "Usahora123"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
recs = requests.get(f"{API}/sync/pull", headers=H).json()["records"]
ids = [r for r in recs if r["id"].startswith("TEST_sale_") and not r["deleted"]]
ops = [{"op_id": uuid.uuid4().hex, "entity": r["entity"], "record_id": r["id"], "action": "delete", "created_at": "2026-01-01T00:00:00Z"} for r in ids]
print("deleting", [r["id"] for r in ids])
if ops:
    print(requests.post(f"{API}/sync/push", headers=H, json={"ops": ops}).json()["applied"])
