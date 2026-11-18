import asyncio
import logging
import os
import time
import uuid
from collections import defaultdict, deque
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, IndexModel
from pymongo.errors import DuplicateKeyError
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_DAYS = 30

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("usahora")

INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("email", ASCENDING)], name="email", unique=True), IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "businesses": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "records": [
        IndexModel([("business_id", ASCENDING), ("entity", ASCENDING), ("id", ASCENDING)], name="biz_entity_id", unique=True),
        IndexModel([("business_id", ASCENDING), ("server_updated_at", ASCENDING)], name="biz_srv_updated"),
    ],
    "sync_ops": [IndexModel([("business_id", ASCENDING), ("op_id", ASCENDING)], name="biz_op", unique=True)],
    "backups": [IndexModel([("business_id", ASCENDING), ("created_at", ASCENDING)], name="biz_created")],
}

# Immutable financial / stock records: never overwritten once stored.
IMMUTABLE = {"sales", "stockMovements", "payments"}
ENTITIES = {
    "products", "stockMovements", "customers", "suppliers", "sales", "payments", "purchases",
    "finance", "invoices", "bills", "docs", "activities",
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


app = FastAPI(title="USAHORA API")


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# ---------------- Rate limit (simple in-memory, per IP) ----------------
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request, key: str, limit: int = 10, window: int = 60) -> None:
    # Right-most X-Forwarded-For entry is the one added by our ingress (client cannot spoof it).
    fwd = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    ip = request.headers.get("x-real-ip") or (fwd[-1] if fwd else None) or (request.client.host if request.client else "unknown")
    q = _hits[f"{key}:{ip}"]
    t = time.time()
    while q and q[0] < t - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi dalam 1 menit.")
    q.append(t)


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    business_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class BusinessIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str = Field("", max_length=300)
    phone: str = Field("", max_length=40)
    email: str = Field("", max_length=120)
    currency: str = "IDR"
    invoice_footer: str = Field("", max_length=500)
    tax_enabled: bool = False
    tax_rate: float = Field(11, ge=0, le=100)
    bank_info: str = Field("", max_length=300)


class SyncOp(BaseModel):
    op_id: str = Field(min_length=8, max_length=64)
    entity: str
    record_id: str = Field(min_length=1, max_length=64)
    action: Literal["upsert", "delete"]
    payload: Optional[dict[str, Any]] = None
    base_updated_at: Optional[str] = None
    created_at: str


class SyncPushIn(BaseModel):
    ops: list[SyncOp] = Field(max_length=500)
    force: bool = False


class BackupIn(BaseModel):
    data: dict[str, Any]


# ---------------- Auth helpers ----------------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def make_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user["id"], "iat": now, "exp": now + timedelta(days=JWT_DAYS)}, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    err = HTTPException(401, "Sesi tidak valid. Silakan masuk kembali.")
    if not cred:
        raise err
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.InvalidTokenError:
        raise err
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user:
        raise err
    return user


def public_user(u: dict) -> dict:
    return {"id": u["id"], "name": u["name"], "email": u["email"], "business_id": u["business_id"]}


async def get_business(bid: str) -> dict:
    return await db.businesses.find_one({"id": bid}, {"_id": 0}) or {}


# ---------------- Auth routes ----------------
@api.post("/auth/register", status_code=201)
async def register(body: RegisterIn, request: Request):
    rate_limit(request, "register")
    email = str(body.email).lower().strip()
    bid = str(uuid.uuid4())
    user = {"id": str(uuid.uuid4()), "name": body.name.strip(), "email": email, "password_hash": hash_pw(body.password),
            "business_id": bid, "created_at": now_iso()}
    try:
        await db.users.insert_one(dict(user))
    except DuplicateKeyError:
        raise HTTPException(409, "Email sudah terdaftar")
    biz = {"id": bid, "owner_id": user["id"], "name": body.business_name.strip(), "address": "", "phone": "", "email": email,
           "currency": "IDR", "invoice_footer": "Terima kasih atas kepercayaan Anda.", "tax_enabled": False, "tax_rate": 11,
           "bank_info": "", "created_at": now_iso(), "updated_at": now_iso()}
    await db.businesses.insert_one(dict(biz))
    return {"access_token": make_token(user), "user": public_user(user), "business": biz}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    rate_limit(request, "login")
    rate_limit(request, f"login-email:{str(body.email).lower()}", limit=10, window=300)
    user = await db.users.find_one({"email": str(body.email).lower().strip()}, {"_id": 0})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "Email atau kata sandi salah")
    return {"access_token": make_token(user), "user": public_user(user), "business": await get_business(user["business_id"])}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {"user": public_user(user), "business": await get_business(user["business_id"])}


@api.put("/business")
async def update_business(body: BusinessIn, user: dict = Depends(current_user)):
    data = {**body.model_dump(), "updated_at": now_iso()}
    await db.businesses.update_one({"id": user["business_id"]}, {"$set": data})
    return await get_business(user["business_id"])


# ---------------- Sync ----------------
@api.post("/sync/push")
async def sync_push(body: SyncPushIn, user: dict = Depends(current_user)):
    bid = user["business_id"]
    applied, duplicates, conflicts, rejected = [], [], [], []
    for op in body.ops:
        if op.entity not in ENTITIES:
            rejected.append({"op_id": op.op_id, "reason": "Entitas tidak dikenal"})
            continue
        if await db.sync_ops.find_one({"business_id": bid, "op_id": op.op_id}, {"_id": 1}):
            duplicates.append(op.op_id)  # idempotency: already applied earlier
            continue
        key = {"business_id": bid, "entity": op.entity, "id": op.record_id}
        existing = await db.records.find_one(key, {"_id": 0})
        if op.entity in IMMUTABLE and existing and not existing.get("deleted"):
            if op.action == "upsert":
                duplicates.append(op.op_id)  # same immutable record already stored: never apply twice
                await db.sync_ops.insert_one({"business_id": bid, "op_id": op.op_id, "at": now_iso()})
                continue
        if (not body.force and existing and op.entity not in IMMUTABLE and op.base_updated_at
                and existing.get("updated_at") and existing["updated_at"] > op.base_updated_at):
            conflicts.append({"op_id": op.op_id, "entity": op.entity, "record_id": op.record_id,
                              "server": existing.get("data"), "server_updated_at": existing.get("updated_at")})
            continue
        if op.action == "delete":
            update = {"deleted": True, "updated_at": now_iso(), "server_updated_at": now_iso()}
        else:
            payload = dict(op.payload or {})
            payload["business_id"] = bid  # server decides the business, never the client
            update = {"data": payload, "deleted": False, "updated_at": payload.get("updated_at") or now_iso(),
                      "server_updated_at": now_iso()}
        await db.records.update_one(key, {"$set": update}, upsert=True)
        try:
            await db.sync_ops.insert_one({"business_id": bid, "op_id": op.op_id, "at": now_iso()})
        except DuplicateKeyError:
            pass
        applied.append(op.op_id)
    return {"applied": applied, "duplicates": duplicates, "conflicts": conflicts, "rejected": rejected, "server_time": now_iso()}


@api.get("/sync/pull")
async def sync_pull(since: Optional[str] = None, user: dict = Depends(current_user)):
    q: dict[str, Any] = {"business_id": user["business_id"]}
    if since:
        q["server_updated_at"] = {"$gt": since}
    docs = await db.records.find(q, {"_id": 0}).sort("server_updated_at", 1).to_list(20000)
    return {"records": [{"entity": d["entity"], "id": d["id"], "deleted": d.get("deleted", False), "data": d.get("data")} for d in docs],
            "server_time": now_iso()}


@api.get("/sync/status")
async def sync_status(user: dict = Depends(current_user)):
    count = await db.records.count_documents({"business_id": user["business_id"], "deleted": False})
    return {"records": count, "server_time": now_iso()}


# ---------------- Cloud backup ----------------
@api.post("/backup")
async def create_backup(body: BackupIn, user: dict = Depends(current_user)):
    if body.data.get("app") != "usahora":
        raise HTTPException(400, "Format backup tidak valid")
    doc = {"id": str(uuid.uuid4()), "business_id": user["business_id"], "created_at": now_iso(), "data": body.data}
    await db.backups.insert_one(dict(doc))
    return {"id": doc["id"], "created_at": doc["created_at"]}


@api.get("/backup/latest")
async def latest_backup(user: dict = Depends(current_user)):
    doc = await db.backups.find_one({"business_id": user["business_id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if not doc:
        raise HTTPException(404, "Belum ada backup cloud")
    return doc


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def start_index_build():
    app.state.index_task = asyncio.create_task(ensure_indexes())


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
