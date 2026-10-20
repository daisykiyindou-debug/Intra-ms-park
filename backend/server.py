"""MS Park Intranet — FastAPI backend with mocked HR data.

Authentication is simulated via the `X-Employee-Id` header — the frontend stores
the currently-logged-in user in localStorage and forwards it on every request.
Two demo users are seeded: Idriss Malonga (employee) and Marcus Siméo (admin).
"""
from __future__ import annotations

import contextvars
import logging
import os
import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, List, Optional
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="MS Park Intranet API")
api = APIRouter(prefix="/api")

# ─── Emergent Object Storage (uploads persistants entre déploiements)
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "mspark-intranet"
_storage_key: Optional[str] = None


def _init_storage(force: bool = False) -> Optional[str]:
    """Init une clé de session Object Storage. Idempotent."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        log.warning("Object Storage init failed: %s", e)
        return None


def _storage_put(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    if not key:
        raise HTTPException(503, "Stockage indisponible")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 404:
        # clé morte : re-init une fois
        key = _init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _storage_get(path: str) -> tuple[bytes, str]:
    key = _init_storage()
    if not key:
        raise HTTPException(503, "Stockage indisponible")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 404:
        # Vérifier si c'est la clé qui est morte vs objet inexistant
        key = _init_storage(force=True)
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    if resp.status_code == 404:
        raise HTTPException(404, "Fichier introuvable")
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")



logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger("mspark")

# ───────────────────────────────── Constants ─────────────────────────────────

ROLE_QUOTAS = {
    "employe": 20,
    "restauration": 30,
    "encadrement": 35,
}

CURRENT_EMPLOYEE_ID = "emp-idriss-malonga"  # default (used for seed)
ADMIN_EMPLOYEE_ID = "emp-marcus-simeo"

# Per-request current user (set by middleware from X-Employee-Id header)
_current_user_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user", default=CURRENT_EMPLOYEE_ID
)


def current_user() -> str:
    return _current_user_var.get()


async def require_admin() -> dict:
    """Raise 403 unless the current user is flagged is_admin=True."""
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not emp or not emp.get("is_admin"):
        raise HTTPException(403, "Accès administrateur requis")
    return emp


async def require_communication_editor() -> dict:
    """Legacy communication editor — accepts is_admin, full_admin, or the
    catch-all can_manage_communication role flag. Granular perms are checked
    per-endpoint via require_permission() to avoid privilege bleed."""
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not emp:
        raise HTTPException(403, "Accès refusé")
    if emp.get("is_admin") or emp.get("can_manage_communication"):
        return emp
    if "full_admin" in set(emp.get("permissions") or []):
        return emp
    raise HTTPException(403, "Accès communication requis")


# Communication-scoped granular perms — a user holding can_manage_communication
# is treated as if they had these too (single role flag).
_COMM_PERMS = {
    "publish_news", "edit_news", "manage_carousel", "manage_newsletter",
    "create_events", "edit_events", "create_forms",
}


async def require_permission(*perm_keys: str) -> dict:
    """Raise 403 unless the current user is is_admin OR has full_admin OR
    at least one of the listed granular permission keys. Users with the
    can_manage_communication legacy role flag additionally pass any
    communication-scoped perm check."""
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not emp:
        raise HTTPException(403, "Accès refusé")
    if emp.get("is_admin"):
        return emp
    perms = set(emp.get("permissions") or [])
    if "full_admin" in perms:
        return emp
    if any(k in perms for k in perm_keys):
        return emp
    if emp.get("can_manage_communication") and any(k in _COMM_PERMS for k in perm_keys):
        return emp
    raise HTTPException(403, "Permission requise")


def _has_permission(emp: dict, *perm_keys: str) -> bool:
    """Non-raising helper mirroring require_permission()."""
    if not emp:
        return False
    if emp.get("is_admin"):
        return True
    perms = set(emp.get("permissions") or [])
    if "full_admin" in perms:
        return True
    if any(k in perms for k in perm_keys):
        return True
    if emp.get("can_manage_communication") and any(k in _COMM_PERMS for k in perm_keys):
        return True
    return False


@api.post("/uploads")
async def upload_file(file: UploadFile = File(...)):
    """Accept an image (or any file) from the user's device gallery/pellicule and
    return a permanent URL served by Emergent Object Storage."""
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()[:10]
    # Guard against absurdly large uploads (server-side safety)
    max_bytes = 8 * 1024 * 1024  # 8 MB
    contents = await file.read()
    if len(contents) > max_bytes:
        raise HTTPException(413, "Fichier trop volumineux (max 8 Mo)")
    name = f"{uuid.uuid4().hex}{ext}"
    storage_path = f"{APP_NAME}/uploads/{name}"
    content_type = file.content_type or "application/octet-stream"
    # Try Emergent Object Storage first; if the universal key is out of credit
    # (402), the proxy is unavailable, or any other error, fall back to the
    # local legacy disk so uploads never break the UX.
    stored_path: Optional[str] = None
    try:
        result = _storage_put(storage_path, contents, content_type)
        stored_path = result.get("path") or storage_path
    except Exception as e:
        log.warning("Object Storage unavailable, falling back to local disk: %s", e)
        legacy_dir = Path("/app/backend/uploads")
        legacy_dir.mkdir(parents=True, exist_ok=True)
        (legacy_dir / name).write_bytes(contents)
        stored_path = None  # GET route falls through to disk when no storage_path
    # On garde la même URL publique — un GET /api/uploads/{name} rejoue depuis Object Storage ou disque
    await db.uploads.insert_one({
        "id": str(uuid.uuid4()),
        "name": name,
        "storage_path": stored_path,
        "local_disk": stored_path is None,
        "original_filename": file.filename,
        "content_type": content_type,
        "size": len(contents),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "url": f"/api/uploads/{name}",
        "name": file.filename,
        "content_type": content_type,
        "size": len(contents),
    }


@api.get("/uploads/{name}")
async def get_upload(name: str):
    """Serve a file previously uploaded via POST /uploads.
    Fast path : legacy disk local (les uploads pré-migration = 230+ fichiers).
    Object Storage utilisé uniquement pour les nouveaux uploads référencés en base."""
    # 1) Cherche en base : si présent → forcément un upload post-migration → Object Storage (ou disque local en fallback)
    doc = await db.uploads.find_one({"name": name}, {"_id": 0})
    if doc:
        sp = doc.get("storage_path")
        if sp:
            try:
                data, ct = _storage_get(sp)
                return Response(content=data, media_type=doc.get("content_type") or ct)
            except HTTPException as e:
                if e.status_code != 404:
                    raise
                # Fallthrough vers disque
            except Exception as e:
                log.warning("Object Storage GET failed, trying disk: %s", e)
        # Pas de storage_path (fallback disque lors de l'upload) → disque local
    # 2) Fast path disque (legacy) — pas d'appel réseau
    legacy = Path("/app/backend/uploads") / name
    if legacy.is_file():
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        ct_map = {
            "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
            "pdf": "application/pdf",
        }
        return Response(  # noqa: ephemeral-upload-storage — legacy read only
            content=legacy.read_bytes(),
            media_type=ct_map.get(ext, "application/octet-stream"),
        )
    raise HTTPException(404, "Fichier introuvable")



# ───────────────────────────────── Models ────────────────────────────────────

def _id() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _push_notification(
    employee_id: str,
    *,
    type: str,
    title: str,
    content: str,
    icon: str = "bell",
    link: str | None = None,
) -> None:
    """Insert a single notification row (safe: never raises)."""
    try:
        await db.notifications.insert_one({
            "id": _id(),
            "employee_id": employee_id,
            "type": type,
            "title": title,
            "content": content,
            "message": content,
            "icon": icon,
            "link": link,
            "read": False,
            "ts": _now(),
            "created_at": _now(),
        })
    except Exception as exc:  # pragma: no cover
        log.warning("push_notification failed for %s: %s", employee_id, exc)


async def _broadcast_notification(
    *,
    type: str,
    title: str,
    content: str,
    icon: str = "bell",
    link: str | None = None,
    exclude_ids: list[str] | None = None,
) -> None:
    """Send the same notification to every seeded employee (minus author)."""
    exclude = set(exclude_ids or [])
    emps = await db.employees.find({}, {"_id": 0, "id": 1}).to_list(500)
    docs = [
        {
            "id": _id(),
            "employee_id": e["id"],
            "type": type,
            "title": title,
            "content": content,
            "message": content,
            "icon": icon,
            "link": link,
            "read": False,
            "ts": _now(),
            "created_at": _now(),
        }
        for e in emps if e["id"] not in exclude
    ]
    if docs:
        await db.notifications.insert_many(docs)


class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    first_name: str
    last_name: str
    role: str
    role_category: str  # employe | restauration | encadrement
    department: str
    avatar: str
    email: str
    phone: str
    available: bool = True
    seniority_months: int = 0
    skills: List[str] = []
    manager: Optional[str] = None
    location: Optional[str] = None


class ScheduleEntry(BaseModel):
    id: str
    employee_id: str
    day: str  # YYYY-MM-DD
    start: Optional[str] = None  # HH:MM
    end: Optional[str] = None
    break_minutes: int = 0
    type: str = "shift"  # shift | off | leave | training | meeting
    location: Optional[str] = None
    manager: Optional[str] = None
    service: Optional[str] = None
    note: Optional[str] = None


class BadgingRecord(BaseModel):
    id: str
    employee_id: str
    day: str
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    break_minutes: int = 0
    worked_minutes: int = 0
    anomaly: Optional[str] = None  # late | missed_clock | early_leave | overtime
    note: Optional[str] = None


# ─── Custom Form Builder (admin/comm can craft forms with any field types)

class FormField(BaseModel):
    id: str
    type: str  # text | email | tel | textarea | select | checkbox | radio | date | file | number | url | section | rich | image
    label: str
    name: Optional[str] = None  # canonical key stored in the response (auto-generated if empty)
    required: bool = False
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    options: Optional[List[str]] = None  # for select/radio/checkbox
    # Optionnel : limites de capacité par option {option_label: max_count}
    # Ex : {"Créneau A": 15, "Créneau B": 10}. Ne s'applique qu'aux types
    # select/radio/checkbox. Quand la limite est atteinte, l'option devient
    # « Complet » et ne peut plus être choisie par de nouveaux répondants.
    option_limits: Optional[dict] = None
    # Rich-text block (type=rich): HTML content preserved as-is on the employee side.
    content_html: Optional[str] = None
    # Image block (type=image): displayed banner-style with an optional caption.
    image_url: Optional[str] = None
    image_alt: Optional[str] = None
    image_caption: Optional[str] = None
    # For "section" type: label = heading, help_text = paragraph


class CustomForm(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    fields: List[FormField] = []
    active: bool = True
    submit_label: Optional[str] = "Envoyer"
    success_message: Optional[str] = "Merci ! Votre formulaire a bien été envoyé."
    created_by: Optional[str] = None
    created_at: Optional[str] = None


class FormPayload(BaseModel):
    title: str
    description: Optional[str] = None
    fields: List[FormField] = []
    active: Optional[bool] = True
    submit_label: Optional[str] = "Envoyer"
    success_message: Optional[str] = "Merci ! Votre formulaire a bien été envoyé."
    audience_status_targets: Optional[List[str]] = []  # empty = all employees
    # Deadline (ISO datetime string). After this instant the form is closed
    # (read-only for admins in stats, hidden/refused for employees).
    closes_at: Optional[str] = None


class FormResponse(BaseModel):
    id: str
    form_id: str
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    answers: dict  # {field_name: value}
    submitted_at: str


class FormSubmitPayload(BaseModel):
    answers: dict




class MealTransaction(BaseModel):
    id: str
    employee_id: str
    ts: str
    points_spent: int
    surcharge_eur: float = 0.0
    location: str
    items: List[dict]
    order_id: Optional[str] = None


class MenuProduct(BaseModel):
    id: str
    store: str  # donut_house | soccer_bar | stand_crepes | stand_bonbons
    category: str
    name: str
    description: str = ""
    points: int
    price_eur: float
    image: str
    allergens: List[str] = []
    available: bool = True


class CartItem(BaseModel):
    product_id: str
    quantity: int = 1


class OrderCreate(BaseModel):
    items: List[CartItem]
    pickup_point: str
    pickup_date: str  # YYYY-MM-DD
    pickup_time: str  # HH:MM
    dining_mode: Optional[str] = None  # "dine_in" | "takeaway" — obligatoire pour soccer_bar


class Order(BaseModel):
    id: str
    employee_id: str
    items: List[dict]
    total_points: int
    points_used: int
    surcharge_eur: float
    pickup_point: str
    pickup_date: str
    pickup_time: str
    dining_mode: Optional[str] = None  # "dine_in" | "takeaway"
    qr_code: str
    status: str = "preparing"  # preparing | ready | picked_up | cancelled
    created_at: str
    picked_up_at: Optional[str] = None


class PostCreate(BaseModel):
    title: str  # Required — used to identify the post in carousel/agenda link pickers
    content: str  # HTML from the rich-text editor (or plain text)
    category: Optional[str] = "annonce"
    image: Optional[str] = None
    images: Optional[List[str]] = None
    attachments: Optional[List[dict]] = None
    links: Optional[List[str]] = None
    hashtags: List[str] = []
    posted_as: Optional[str] = "personal"
    publish_at: Optional[str] = None  # ISO datetime — if in the future the post is scheduled
    # Audience targeting: empty list = visible by everyone, otherwise visible
    # only to employees whose `statuses` intersect this list.
    audience_status_targets: List[str] = []


class Comment(BaseModel):
    id: str
    author_id: str
    content: str
    created_at: str
    replies: List[dict] = []


class Post(BaseModel):
    id: str
    author_id: str
    category: str
    content: str
    image: Optional[str] = None
    hashtags: List[str] = []
    likes: List[str] = []
    comments: List[Comment] = []
    created_at: str


class RequestCreate(BaseModel):
    type: str  # conge | absence | echange | acompte | materiel | maladie
    start_date: str
    end_date: Optional[str] = None
    comment: Optional[str] = ""
    amount: Optional[float] = None


class HRRequest(BaseModel):
    id: str
    employee_id: str
    type: str
    start_date: str
    end_date: Optional[str] = None
    comment: str = ""
    amount: Optional[float] = None
    status: str = "pending"  # pending | approved | rejected
    created_at: str
    decided_at: Optional[str] = None


class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None


class MessageCreate(BaseModel):
    content: str = ""
    attachments: List[dict] = []  # [{url, name, type}]
    # When True → author writes AS the service (auto-signature added).
    # When False → author writes as themselves (personal side). When None,
    # backend falls back to the legacy heuristic.
    as_service: Optional[bool] = None


# ───────────────────────────────── Helpers ───────────────────────────────────

async def _seed_once() -> None:
    """Insert demo dataset on first run, idempotent."""
    flag = await db.meta.find_one({"_id": "seeded"})
    if flag:
        return

    log.info("Seeding MS Park intranet demo data…")

    # ─── Employees
    employees: list[dict] = [
        {
            "id": CURRENT_EMPLOYEE_ID,
            "first_name": "Idriss",
            "last_name": "MALONGA",
            "role": "Employé Polyvalent",
            "role_category": "employe",
            "department": "Opérations Parc",
            "avatar": "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&h=400&fit=crop&crop=faces",
            "email": "idriss.malonga@mspark.fr",
            "personal_email": "idriss.malonga@gmail.com",
            "phone": "+33 6 12 34 56 78",
            "address": "14 rue des Tilleuls, 92350 Le Plessis-Robinson",
            "available": True,
            "seniority_months": 18,
            "skills": ["Accueil clients", "Karting", "Attractions", "Sécurité"],
            "manager": "Marcus SIMÉO",
            "location": "MS Park — Site principal",
            "badge_number": "MSP-2451",
            "badge_expiry": "2027-08-15",
            "badge_active": True,
            "leave_balance": {"cp_n_1": 4, "cp_n": 12.5, "rtt": 3},
            "contract_hours_weekly": 24,
            "weekly_pattern": {
                "0": {"type": "off"},
                "1": {"type": "off"},
                "2": {"type": "shift", "start": "09:00", "end": "14:00"},
                "3": {"type": "shift", "start": "09:00", "end": "14:00"},
                "4": {"type": "shift", "start": "09:00", "end": "14:00"},
                "5": {"type": "shift", "start": "09:00", "end": "14:00"},
                "6": {"type": "shift", "start": "10:00", "end": "14:00"},
            },
            "is_admin": False,
            "can_post": False,
        },
        {
            "id": ADMIN_EMPLOYEE_ID,
            "first_name": "Marcus",
            "last_name": "SIMÉO",
            "role": "Responsable Opérationnel",
            "role_category": "encadrement",
            "department": "Direction Opérations",
            "avatar": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop&crop=faces",
            "email": "marcus.simeo@mspark.fr",
            "personal_email": "marcus.simeo@gmail.com",
            "phone": "+33 6 99 88 77 66",
            "address": "8 avenue de la République, 92000 Nanterre",
            "available": True,
            "seniority_months": 72,
            "skills": ["Management", "Planning", "Coaching", "Pilotage opérationnel"],
            "manager": "Direction",
            "location": "MS Park — Bureau direction",
            "badge_number": "MSP-0007",
            "badge_expiry": "2028-01-31",
            "badge_active": True,
            "leave_balance": {"cp_n_1": 6, "cp_n": 20, "rtt": 8},
            "contract_hours_weekly": 35,
            "weekly_pattern": {
                "0": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "1": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "2": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "3": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "4": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "5": {"type": "off"},
                "6": {"type": "off"},
            },
            "is_admin": True,
            "can_post": True,
        },
        {
            "id": "emp-lea-comm",
            "first_name": "Léa",
            "last_name": "DUBOIS",
            "role": "Chargée de communication",
            "role_category": "encadrement",
            "department": "Communication interne",
            "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=faces",
            "email": "lea.dubois@mspark.fr",
            "personal_email": "lea.dubois.comm@gmail.com",
            "phone": "+33 6 77 88 99 00",
            "birth_date": "1994-03-18",
            "hire_date": "2023-06-01",
            "address": "12 rue des Cerisiers · 75011 Paris",
            "available": True,
            "seniority_months": 20,
            "skills": ["Communication", "Content creation", "Community management", "Design graphique"],
            "manager": "Marcus SIMÉO",
            "location": "MS Park — Bureau communication",
            "badge_number": "MSP-1108",
            "badge_expiry": "2027-06-01",
            "badge_active": True,
            "leave_balance": {"cp_n_1": 3, "cp_n": 15, "rtt": 4},
            "contract_hours_weekly": 35,
            "weekly_pattern": {
                "0": {"type": "shift", "start": "09:30", "end": "17:30", "pause_start": "12:30", "pause_end": "13:30"},
                "1": {"type": "shift", "start": "09:30", "end": "17:30", "pause_start": "12:30", "pause_end": "13:30"},
                "2": {"type": "shift", "start": "09:30", "end": "17:30", "pause_start": "12:30", "pause_end": "13:30"},
                "3": {"type": "shift", "start": "09:30", "end": "17:30", "pause_start": "12:30", "pause_end": "13:30"},
                "4": {"type": "shift", "start": "09:30", "end": "17:30", "pause_start": "12:30", "pause_end": "13:30"},
                "5": {"type": "off"},
                "6": {"type": "off"},
            },
            "is_admin": False,
            "can_post": True,
            "can_manage_communication": True,
        },
        {
            "id": "emp-sophie",
            "first_name": "Sophie",
            "last_name": "BERNARD",
            "role": "Responsable Opérations",
            "role_category": "encadrement",
            "department": "Opérations Parc",
            "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=faces",
            "email": "sophie.bernard@mspark.fr",
            "phone": "+33 6 22 11 99 88",
            "seniority_months": 54,
            "skills": ["Management", "Planning", "Coaching"],
        },
        {
            "id": "emp-thomas",
            "first_name": "Thomas",
            "last_name": "DUPONT",
            "role": "Manager Restauration",
            "role_category": "encadrement",
            "department": "Restauration",
            "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces",
            "email": "thomas.dupont@mspark.fr",
            "phone": "+33 6 33 44 55 66",
            "seniority_months": 36,
            "skills": ["Cuisine", "Service", "Hygiène HACCP"],
        },
        {
            "id": "emp-emma",
            "first_name": "Emma",
            "last_name": "LEFEBVRE",
            "role": "Barman",
            "role_category": "restauration",
            "department": "Soccer Bar",
            "avatar": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=faces",
            "email": "emma.lefebvre@mspark.fr",
            "phone": "+33 6 11 22 33 44",
            "seniority_months": 12,
            "skills": ["Cocktails", "Mocktails", "Service"],
        },
        {
            "id": "emp-karim",
            "first_name": "Karim",
            "last_name": "BENALI",
            "role": "Opérateur Karting",
            "role_category": "employe",
            "department": "Karting",
            "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=faces",
            "email": "karim.benali@mspark.fr",
            "phone": "+33 6 55 66 77 88",
            "seniority_months": 24,
            "skills": ["Karting", "Briefing sécurité"],
        },
        {
            "id": "emp-julie",
            "first_name": "Julie",
            "last_name": "MARTIN",
            "role": "Responsable Donut House",
            "role_category": "encadrement",
            "department": "Donut House",
            "avatar": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop&crop=faces",
            "email": "julie.martin@mspark.fr",
            "phone": "+33 6 77 88 99 00",
            "seniority_months": 28,
            "skills": ["Pâtisserie", "Management", "Visual merchandising"],
        },
        {
            "id": "emp-lucas",
            "first_name": "Lucas",
            "last_name": "PETIT",
            "role": "Chef de Partie",
            "role_category": "restauration",
            "department": "Soccer Bar",
            "avatar": "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop&crop=faces",
            "email": "lucas.petit@mspark.fr",
            "phone": "+33 6 12 78 45 90",
            "seniority_months": 30,
        },
        {
            "id": "emp-amelie",
            "first_name": "Amélie",
            "last_name": "ROUX",
            "role": "Agent Nettoyage",
            "role_category": "employe",
            "department": "Hygiène",
            "avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=faces",
            "email": "amelie.roux@mspark.fr",
            "phone": "+33 6 90 81 72 63",
            "seniority_months": 9,
        },
        {
            "id": "emp-noah",
            "first_name": "Noah",
            "last_name": "GARCIA",
            "role": "Agent Sécurité",
            "role_category": "employe",
            "department": "Sécurité",
            "avatar": "https://images.unsplash.com/photo-1463453091185-61582044d556?w=400&h=400&fit=crop&crop=faces",
            "email": "noah.garcia@mspark.fr",
            "phone": "+33 6 33 22 11 00",
            "seniority_months": 14,
        },
        {
            "id": "emp-leila",
            "first_name": "Leila",
            "last_name": "HADDAD",
            "role": "Serveuse",
            "role_category": "restauration",
            "department": "Soccer Bar",
            "avatar": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&h=400&fit=crop&crop=faces",
            "email": "leila.haddad@mspark.fr",
            "phone": "+33 6 41 52 63 74",
            "seniority_months": 7,
        },
        {
            "id": "emp-pierre",
            "first_name": "Pierre",
            "last_name": "MOREAU",
            "role": "Directeur RH",
            "role_category": "encadrement",
            "department": "Ressources Humaines",
            "avatar": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=faces",
            "email": "pierre.moreau@mspark.fr",
            "phone": "+33 6 70 80 90 10",
            "seniority_months": 72,
        },
        {
            "id": "emp-camille",
            "first_name": "Camille",
            "last_name": "DUBOIS",
            "role": "Aide Cuisine",
            "role_category": "restauration",
            "department": "Soccer Bar",
            "avatar": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=faces",
            "email": "camille.dubois@mspark.fr",
            "phone": "+33 6 65 54 43 32",
            "seniority_months": 5,
        },
        {
            # ─── Super admin (not an employee — pure admin console)
            "id": "emp-super-admin",
            "first_name": "Super",
            "last_name": "ADMIN",
            "role": "Super administrateur",
            "role_category": "admin",
            "role_title": "Super administrateur",
            "department": "Direction",
            "avatar": "https://ui-avatars.com/api/?name=Super+Admin&background=071B34&color=fff&size=256&bold=true",
            "email": "superadmin@mspark.fr",
            "phone": "+33 6 00 00 00 00",
            "seniority_months": 0,
            "is_admin": True,
            "is_super_admin": True,
            "can_post": True,
            "can_manage_communication": True,
            "contract_hours_weekly": 0,
            "badge_number": "MSP-SUPER",
            "badge_active": False,
            "hire_date": "2024-01-01",
            "skills": [],
            "leave_balance": {"cp_n_1": 0, "cp_n": 0, "rtt": 0},
        },
    ]
    await db.employees.insert_many(employees)

    # ─── Schedule (Idriss: 24h/week contract, Wed-Sun, no pauses under 6h)
    # Build planning for 8 weeks centered on today
    schedule: list[dict] = []
    today = date.today()
    start_period = today - timedelta(days=28)
    end_period = min(today + timedelta(days=365), SHIFT_HORIZON_CAP)
    cur = start_period
    # Rotation pattern for Idriss — TOTAL 24h/week, matches his contract exactly
    pattern = {
        2: ("09:00", "14:00"),  # Wed 5h
        3: ("09:00", "14:00"),  # Thu 5h
        4: ("09:00", "14:00"),  # Fri 5h
        5: ("09:00", "14:00"),  # Sat 5h
        6: ("10:00", "14:00"),  # Sun 4h
    }
    while cur <= end_period:
        wd = cur.weekday()  # 0=Mon
        d = cur.isoformat()
        if wd in pattern:
            s, e = pattern[wd]
            # Shifts under 6h — no mandatory pause (French labour code)
            schedule.append({
                "id": _id(),
                "employee_id": CURRENT_EMPLOYEE_ID,
                "day": d,
                "start": s,
                "end": e,
                "pause_start": None,
                "pause_end": None,
                "break_minutes": 0,
                "type": "shift",
                "location": "MS Park — Zone Karting & Attractions",
                "manager": "Marcus SIMÉO",
                "service": "Opérations Parc",
                "note": None,
            })
        else:
            schedule.append({
                "id": _id(),
                "employee_id": CURRENT_EMPLOYEE_ID,
                "day": d,
                "start": None,
                "end": None,
                "pause_start": None,
                "pause_end": None,
                "break_minutes": 0,
                "type": "off",
                "location": None,
                "manager": None,
                "service": None,
                "note": "Jour de repos",
            })
        cur += timedelta(days=1)

    # Add a training day and a leave day for richness
    training_day = (today + timedelta(days=10)).isoformat()
    for s in schedule:
        if s["day"] == training_day:
            s.update({"type": "training", "start": "10:00", "end": "13:00",
                      "break_minutes": 0, "note": "Formation sécurité incendie",
                      "location": "Salle RH"})
    leave_day = (today + timedelta(days=21)).isoformat()
    for s in schedule:
        if s["day"] == leave_day:
            s.update({"type": "leave", "start": None, "end": None,
                      "break_minutes": 0, "note": "Congé validé"})

    # ─── Schedule for Marcus (admin, 35h/week, Mon–Fri 9h-17h)
    admin_pattern = {
        0: ("09:00", "17:00"),
        1: ("09:00", "17:00"),
        2: ("09:00", "17:00"),
        3: ("09:00", "17:00"),
        4: ("09:00", "17:00"),
    }
    cur = start_period
    while cur <= end_period:
        wd = cur.weekday()
        d = cur.isoformat()
        if wd in admin_pattern:
            s, e = admin_pattern[wd]
            schedule.append({
                "id": _id(),
                "employee_id": ADMIN_EMPLOYEE_ID,
                "day": d,
                "start": s,
                "end": e,
                "pause_start": "12:30",
                "pause_end": "13:30",
                "break_minutes": 60,
                "type": "shift",
                "location": "Bureau Direction",
                "manager": "Direction",
                "service": "Direction Opérations",
                "note": None,
            })
        else:
            schedule.append({
                "id": _id(),
                "employee_id": ADMIN_EMPLOYEE_ID,
                "day": d,
                "start": None, "end": None,
                "pause_start": None, "pause_end": None,
                "break_minutes": 0,
                "type": "off",
                "location": None, "manager": None, "service": None,
                "note": "Week-end",
            })
        cur += timedelta(days=1)

    # ─── Schedule for Léa (comm editor, 35h/week, Mon–Fri 9h30-17h30)
    lea_pattern = {
        0: ("09:30", "17:30"),
        1: ("09:30", "17:30"),
        2: ("09:30", "17:30"),
        3: ("09:30", "17:30"),
        4: ("09:30", "17:30"),
    }
    cur = start_period
    while cur <= end_period:
        wd = cur.weekday()
        d = cur.isoformat()
        if wd in lea_pattern:
            s, e = lea_pattern[wd]
            schedule.append({
                "id": _id(),
                "employee_id": "emp-lea-comm",
                "day": d,
                "start": s,
                "end": e,
                "pause_start": "12:30",
                "pause_end": "13:30",
                "break_minutes": 60,
                "type": "shift",
                "location": "MS Park — Bureau communication",
                "manager": "Marcus SIMÉO",
                "service": "Communication interne",
                "note": None,
            })
        else:
            schedule.append({
                "id": _id(),
                "employee_id": "emp-lea-comm",
                "day": d,
                "start": None, "end": None,
                "pause_start": None, "pause_end": None,
                "break_minutes": 0,
                "type": "off",
                "location": None, "manager": None, "service": None,
                "note": "Week-end",
            })
        cur += timedelta(days=1)

    await db.schedules.insert_many(schedule)

    # ─── Badging history for past shifts (all employees, with pause records)
    badging: list[dict] = []
    for s in schedule:
        sd = date.fromisoformat(s["day"])
        if sd >= today or s["type"] != "shift":
            continue
        start_t = datetime.strptime(s["start"], "%H:%M")
        end_t = datetime.strptime(s["end"], "%H:%M")
        # Simulate occasional anomalies (deterministic mix per employee)
        emp_seed = sum(ord(c) for c in s["employee_id"]) % 7
        anomaly = None
        if ((sd.toordinal() + emp_seed) % 11) == 0:
            start_t = start_t + timedelta(minutes=8)
            anomaly = "late"
        if ((sd.toordinal() + emp_seed) % 17) == 0:
            anomaly = "missed_clock"
        clock_in = start_t.strftime("%H:%M") if anomaly != "missed_clock" else None
        clock_out = end_t.strftime("%H:%M") if anomaly != "missed_clock" else None
        worked = 0
        if clock_in and clock_out:
            worked = int((end_t - start_t).total_seconds() // 60) - s["break_minutes"]
        badging.append({
            "id": _id(),
            "employee_id": s["employee_id"],
            "day": s["day"],
            "clock_in": clock_in,
            "clock_out": clock_out,
            "pause_out": s.get("pause_start") if clock_in else None,
            "pause_in": s.get("pause_end") if clock_in else None,
            "break_minutes": s["break_minutes"],
            "worked_minutes": worked,
            "anomaly": anomaly,
            "note": None,
        })
    # Today's live badging is computed dynamically via _compute_today_badging() — no seed needed
    if badging:
        await db.badging.insert_many(badging)

    # ─── Menu products
    products: list[dict] = [
        # Donut House
        {"id": _id(), "store": "donut_house", "category": "Pâtisserie", "name": "Donut unité",
         "description": "Donut glacé classique, glaçage rose, sucre vanillé",
         "points": 4, "price_eur": 3.0,
         "image": "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait", "œuf"], "available": True},
        {"id": _id(), "store": "donut_house", "category": "Pâtisserie", "name": "Box 4 Donuts",
         "description": "Assortiment de 4 donuts gourmands",
         "points": 15, "price_eur": 11.0,
         "image": "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait", "œuf"]},
        {"id": _id(), "store": "donut_house", "category": "Boissons", "name": "Bubble Tea",
         "description": "Thé glacé aux perles de tapioca, plusieurs parfums",
         "points": 8, "price_eur": 6.5,
         "image": "https://images.unsplash.com/photo-1558857563-c8c47a35e9a8?w=600&h=600&fit=crop",
         "allergens": ["lait"]},
        {"id": _id(), "store": "donut_house", "category": "Boissons", "name": "Milkshake",
         "description": "Milkshake épais vanille, chocolat ou fraise",
         "points": 6, "price_eur": 5.0,
         "image": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&h=600&fit=crop",
         "allergens": ["lait"]},
        {"id": _id(), "store": "donut_house", "category": "Salé", "name": "Bagels",
         "description": "Bagel artisanal saumon ou poulet",
         "points": 7, "price_eur": 6.0,
         "image": "https://images.unsplash.com/photo-1592151450837-7b8d6e8e7e30?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait"]},
        {"id": _id(), "store": "donut_house", "category": "Boissons", "name": "Softs",
         "description": "Sodas et eaux pétillantes",
         "points": 3, "price_eur": 2.5,
         "image": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&h=600&fit=crop",
         "allergens": []},

        # Soccer Bar
        {"id": _id(), "store": "soccer_bar", "category": "Burgers", "name": "Burger Premium",
         "description": "Steak frais 180g, cheddar affiné, oignons confits",
         "points": 16, "price_eur": 13.5,
         "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait"]},
        {"id": _id(), "store": "soccer_bar", "category": "Burgers", "name": "Smash Burger",
         "description": "Double steak smashé, sauce maison",
         "points": 12, "price_eur": 10.5,
         "image": "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait", "œuf"]},
        {"id": _id(), "store": "soccer_bar", "category": "Burgers", "name": "Chicken Burger",
         "description": "Poulet pané croustillant, coleslaw",
         "points": 12, "price_eur": 10.5,
         "image": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait", "œuf"]},
        {"id": _id(), "store": "soccer_bar", "category": "Burgers", "name": "Bao Dog",
         "description": "Pain bao vapeur, saucisse premium, sauce sriracha",
         "points": 12, "price_eur": 10.0,
         "image": "https://images.unsplash.com/photo-1626202373052-9b8aa5edfaef?w=600&h=600&fit=crop",
         "allergens": ["gluten", "soja"]},
        {"id": _id(), "store": "soccer_bar", "category": "Finger Food", "name": "Tenders",
         "description": "Aiguillettes de poulet panées, 4 pièces",
         "points": 6, "price_eur": 5.5,
         "image": "https://images.unsplash.com/photo-1562967914-608f82629710?w=600&h=600&fit=crop",
         "allergens": ["gluten", "œuf"]},
        {"id": _id(), "store": "soccer_bar", "category": "Finger Food", "name": "Wings",
         "description": "Ailes de poulet sauce BBQ ou buffalo",
         "points": 8, "price_eur": 7.0,
         "image": "https://images.unsplash.com/photo-1608039755401-742074f0548d?w=600&h=600&fit=crop",
         "allergens": []},
        {"id": _id(), "store": "soccer_bar", "category": "Entrées", "name": "Nachos XXL",
         "description": "Nachos guacamole, cheddar fondu, jalapeños",
         "points": 20, "price_eur": 16.0,
         "image": "https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=600&h=600&fit=crop",
         "allergens": ["lait", "gluten"]},
        {"id": _id(), "store": "soccer_bar", "category": "Tacos", "name": "Tacos Premium",
         "description": "Tacos viande hachée, cheddar, sauce maison",
         "points": 14, "price_eur": 11.5,
         "image": "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait"]},
        {"id": _id(), "store": "soccer_bar", "category": "Accompagnements", "name": "Frites",
         "description": "Frites maison, sel de Guérande",
         "points": 4, "price_eur": 3.5,
         "image": "https://images.unsplash.com/photo-1576107232684-1279f390859f?w=600&h=600&fit=crop",
         "allergens": []},
        {"id": _id(), "store": "soccer_bar", "category": "Accompagnements", "name": "Riz",
         "description": "Riz basmati parfumé, cuisson maison",
         "points": 4, "price_eur": 3.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/b44la9j1_Cuire-le-riz-et-le-reussir.webp",
         "allergens": []},
        {"id": _id(), "store": "soccer_bar", "category": "Salades", "name": "Salade César",
         "description": "Poulet pané croustillant, laitue romaine, croûtons, sauce César maison",
         "points": 12, "price_eur": 10.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/5zo6gzz8_Salade-Cesar-Poulet-Pane-1.jpg",
         "allergens": ["gluten", "lait", "œuf"]},
        {"id": _id(), "store": "soccer_bar", "category": "Desserts", "name": "Cheesecake",
         "description": "Cheesecake crémeux, coulis de fruits rouges",
         "points": 8, "price_eur": 6.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/16ftw8kc_2-1.jpg",
         "allergens": ["gluten", "lait", "œuf"]},
        {"id": _id(), "store": "soccer_bar", "category": "Desserts", "name": "Flan pâtissier",
         "description": "Flan pâtissier maison, pâte brisée feuilletée",
         "points": 7, "price_eur": 5.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/v6zbpnyo_photo_flan_patissier_cuisinovores.webp",
         "allergens": ["gluten", "lait", "œuf"]},
        {"id": _id(), "store": "soccer_bar", "category": "Mocktails", "name": "Mocktails",
         "description": "Cocktails sans alcool premium",
         "points": 8, "price_eur": 7.0,
         "image": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=600&fit=crop",
         "allergens": []},
        {"id": _id(), "store": "soccer_bar", "category": "Boissons", "name": "Softs",
         "description": "Sodas, eaux, jus de fruits",
         "points": 3, "price_eur": 2.5,
         "image": "https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=600&h=600&fit=crop",
         "allergens": []},

        # Stand bonbons
        {"id": _id(), "store": "stand_bonbons", "category": "Bonbons", "name": "Box Bonbons S",
         "description": "Sachet 150g de bonbons assortis",
         "points": 7, "price_eur": 5.5,
         "image": "https://images.unsplash.com/photo-1572383672419-ab35444a6934?w=600&h=600&fit=crop",
         "allergens": ["gluten"]},
        {"id": _id(), "store": "stand_bonbons", "category": "Bonbons", "name": "Box Bonbons M",
         "description": "Sachet 300g de bonbons assortis",
         "points": 13, "price_eur": 10.5,
         "image": "https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=600&h=600&fit=crop",
         "allergens": ["gluten"]},
        {"id": _id(), "store": "stand_bonbons", "category": "Bonbons", "name": "Box Bonbons L",
         "description": "Sachet 500g de bonbons assortis",
         "points": 16, "price_eur": 13.0,
         "image": "https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=600&h=600&fit=crop",
         "allergens": ["gluten"]},

        # Stand crêpes
        {"id": _id(), "store": "stand_crepes", "category": "Crêpes", "name": "Crêpe Nature",
         "description": "Crêpe au sucre fin",
         "points": 3, "price_eur": 2.5,
         "image": "https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait", "œuf"]},
        {"id": _id(), "store": "stand_crepes", "category": "Crêpes", "name": "Crêpe Garnie",
         "description": "Crêpe Nutella, confiture, banane ou chantilly",
         "points": 5, "price_eur": 4.5,
         "image": "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=600&fit=crop",
         "allergens": ["gluten", "lait", "œuf", "fruits à coque"]},
    ]
    await db.products.insert_many(products)

    # ─── Posts
    posts: list[dict] = [
        {
            "id": _id(),
            "author_id": "emp-pierre",
            "title": "Bilan mensuel — satisfaction client au top 🎯",
            "category": "Direction",
            "content": "<p>Très fière de l'équipe pour le mois écoulé ! Notre taux de satisfaction client atteint <strong>96%</strong>, un record absolu. Bravo à toutes et tous.</p>",
            "image": "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&h=600&fit=crop",
            "hashtags": ["#TeamMSPark", "#Excellence", "#FierEquipe"],
            "likes": ["emp-sophie", "emp-thomas", CURRENT_EMPLOYEE_ID, "emp-emma", "emp-karim"],
            "comments": [
                {"id": _id(), "author_id": "emp-sophie",
                 "content": "Énorme travail collectif, merci à tous 💪",
                 "created_at": _now(), "replies": []},
                {"id": _id(), "author_id": CURRENT_EMPLOYEE_ID,
                 "content": "Trop fier de faire partie de cette équipe !",
                 "created_at": _now(), "replies": []},
            ],
            "created_at": _now(),
        },
        {
            "id": _id(),
            "author_id": "emp-julie",
            "title": "Nouveau Bao Dog au Soccer Bar 🥟",
            "category": "Restauration",
            "content": "<p>🎉 <strong>Lancement officiel</strong> du nouveau Bao Dog au Soccer Bar dès lundi prochain !</p><p>Venez tester en avant-première <em>mercredi</em>.</p>",
            "image": "https://images.unsplash.com/photo-1626202373052-9b8aa5edfaef?w=1200&h=600&fit=crop",
            "hashtags": ["#NouveauMenu", "#SoccerBar"],
            "likes": ["emp-emma", "emp-leila", "emp-thomas"],
            "comments": [],
            "created_at": _now(),
        },
        {
            "id": _id(),
            "author_id": "emp-sophie",
            "title": "Roller Party VIP — samedi 21h",
            "category": "Événement",
            "content": "<p><strong>Roller Party VIP</strong> samedi 21h-01h.</p><ul><li>Tenue <em>blanche</em> obligatoire</li><li>Inscrivez-vous via l'agenda interne avant vendredi</li></ul>",
            "image": "https://images.unsplash.com/photo-1571266028243-d220bc77b97a?w=1200&h=600&fit=crop",
            "hashtags": ["#RollerParty", "#WhiteNight"],
            "likes": [CURRENT_EMPLOYEE_ID, "emp-karim", "emp-amelie", "emp-noah"],
            "comments": [
                {"id": _id(), "author_id": "emp-karim",
                 "content": "Trop hâte 🛼", "created_at": _now(), "replies": []},
            ],
            "created_at": _now(),
        },
        {
            "id": _id(),
            "author_id": "emp-thomas",
            "title": "Rappel points repas — à consommer le jour même",
            "category": "RH",
            "content": "<p>Rappel : les points repas sont valables <strong>UNIQUEMENT le jour même</strong>. Pensez à les utiliser avant minuit !</p>",
            "image": None,
            "hashtags": ["#PointsRepas", "#RH"],
            "likes": ["emp-emma", "emp-lucas"],
            "comments": [],
            "created_at": _now(),
        },
    ]
    await db.posts.insert_many(posts)

    # ─── HR Requests
    requests_seed: list[dict] = [
        {
            "id": _id(),
            "employee_id": CURRENT_EMPLOYEE_ID,
            "type": "conge",
            "start_date": (today + timedelta(days=21)).isoformat(),
            "end_date": (today + timedelta(days=23)).isoformat(),
            "comment": "Week-end prolongé en famille",
            "amount": None,
            "status": "approved",
            "created_at": _now(),
            "decided_at": _now(),
        },
        {
            "id": _id(),
            "employee_id": CURRENT_EMPLOYEE_ID,
            "type": "echange",
            "start_date": (today + timedelta(days=7)).isoformat(),
            "end_date": (today + timedelta(days=7)).isoformat(),
            "comment": "Échange shift samedi avec Karim",
            "amount": None,
            "status": "pending",
            "created_at": _now(),
            "decided_at": None,
        },
        {
            "id": _id(),
            "employee_id": CURRENT_EMPLOYEE_ID,
            "type": "acompte",
            "start_date": today.isoformat(),
            "end_date": None,
            "comment": "Acompte sur salaire",
            "amount": 300.0,
            "status": "rejected",
            "created_at": _now(),
            "decided_at": _now(),
        },
    ]
    await db.requests.insert_many(requests_seed)

    # ─── Documents
    documents: list[dict] = [
        {"id": _id(), "name": "Fiche de paie — Juin 2026", "category": "Paie",
         "issued_at": today.isoformat(), "size_kb": 248, "read": False,
         "target_employee_id": CURRENT_EMPLOYEE_ID,
         "url": f"/api/payslip/{CURRENT_EMPLOYEE_ID}/2026/6",
         "is_payslip": True, "payslip_year": 2026, "payslip_month": 6},
        {"id": _id(), "name": "Fiche de paie — Mai 2026", "category": "Paie",
         "issued_at": (today - timedelta(days=30)).isoformat(), "size_kb": 245, "read": True,
         "target_employee_id": CURRENT_EMPLOYEE_ID,
         "url": f"/api/payslip/{CURRENT_EMPLOYEE_ID}/2026/5",
         "is_payslip": True, "payslip_year": 2026, "payslip_month": 5},
        {"id": _id(), "name": "Contrat CDI — Idriss MALONGA", "category": "Contrats",
         "issued_at": "2024-08-15", "size_kb": 412, "read": True,
         "target_employee_id": CURRENT_EMPLOYEE_ID,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Avenant 24h hebdomadaires", "category": "Contrats",
         "issued_at": "2025-09-01", "size_kb": 188, "read": True,
         "target_employee_id": CURRENT_EMPLOYEE_ID,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Règlement intérieur 2026", "category": "Règlements",
         "issued_at": "2026-01-02", "size_kb": 524, "read": False,
         "target_employee_id": "all",
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Procédure sécurité incendie", "category": "Sécurité",
         "issued_at": "2025-11-12", "size_kb": 156, "read": True,
         "target_employee_id": "all",
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Planning PDF — Juillet 2026", "category": "Planning",
         "issued_at": today.isoformat(), "size_kb": 92, "read": False,
         "target_employee_id": CURRENT_EMPLOYEE_ID,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Attestation employeur", "category": "Attestations",
         "issued_at": "2025-12-10", "size_kb": 124, "read": True,
         "target_employee_id": CURRENT_EMPLOYEE_ID,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
    ]
    await db.documents.insert_many(documents)

    # ─── Notifications
    notifications: list[dict] = [
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "conge_valide",
         "title": "Congé validé", "content": "Votre demande de congé du 21 au 23 a été approuvée.",
         "read": False, "created_at": _now(), "icon": "check-circle",
         "link": "/rh/demandes"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "planning",
         "title": "Nouveau planning publié",
         "content": "Le planning de la semaine prochaine est disponible.",
         "read": False, "created_at": _now(), "icon": "calendar",
         "link": "/rh/planning"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "post",
         "title": "Nouvelle annonce direction",
         "content": "Pierre Moreau a publié une annonce.",
         "read": False, "created_at": _now(), "icon": "megaphone",
         "link": "/actualites"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "document",
         "title": "Nouveau document disponible",
         "content": "Fiche de paie de Janvier 2026 prête à être téléchargée.",
         "read": True, "created_at": _now(), "icon": "file-text",
         "link": "/documents"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "comment",
         "title": "Réponse à votre commentaire",
         "content": "Sophie a répondu à votre commentaire.",
         "read": True, "created_at": _now(), "icon": "message-circle",
         "link": "/actualites"},
    ]
    await db.notifications.insert_many(notifications)

    # ─── Partners (Avantages)
    partners: list[dict] = [
        {"id": _id(), "name": "Cinéma Pathé", "discount": "-30%", "category": "Loisirs",
         "image": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=400&fit=crop",
         "description": "Réduction sur tous les films, valable du lundi au jeudi.",
         "qr_code": "MSPARK-PATHE-2026"},
        {"id": _id(), "name": "Fitness Park", "discount": "-50%", "category": "Sport",
         "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&h=400&fit=crop",
         "description": "Abonnement annuel à tarif préférentiel pour les salariés MS Park.",
         "qr_code": "MSPARK-FITPARK-2026"},
        {"id": _id(), "name": "Uber Eats", "discount": "-15€", "category": "Restauration",
         "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=400&fit=crop",
         "description": "15€ offerts sur votre prochaine commande Uber Eats.",
         "qr_code": "MSPARK-UBEREATS-15"},
        {"id": _id(), "name": "Spa Premium", "discount": "-25%", "category": "Bien-être",
         "image": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&h=400&fit=crop",
         "description": "Modelages et soins spa partenaire MS Group.",
         "qr_code": "MSPARK-SPA-2026"},
        {"id": _id(), "name": "Decathlon", "discount": "-20%", "category": "Sport",
         "image": "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=600&h=400&fit=crop",
         "description": "Réduction sur tout le magasin Decathlon Vélizy.",
         "qr_code": "MSPARK-DECATHLON-20"},
        {"id": _id(), "name": "MS Group — Billet famille", "discount": "Gratuit",
         "category": "Interne",
         "image": "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&h=400&fit=crop",
         "description": "4 billets gratuits par an pour la famille des salariés.",
         "qr_code": "MSPARK-FAMILY-FREE"},
    ]
    await db.partners.insert_many(partners)

    # ─── Channels & messages (mock messagerie).
    # `members_ids` list is authoritative — a user only sees channels where
    # their id appears. Newly-created accounts start with an EMPTY messagerie.
    seeded_emp_ids = [
        CURRENT_EMPLOYEE_ID, "emp-marcus-simeo", "emp-sophie", "emp-karim",
        "emp-noah", "emp-thomas", "emp-emma", "emp-lucas", "emp-mia",
        "emp-pierre",
    ]
    channels: list[dict] = [
        {"id": "ch-accueil", "name": "Accueil", "icon": "hash",
         "members": len(seeded_emp_ids), "members_ids": list(seeded_emp_ids),
         "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-ops", "name": "Employés OPS", "icon": "hash",
         "members": 6, "members_ids": [CURRENT_EMPLOYEE_ID, "emp-marcus-simeo", "emp-sophie", "emp-karim", "emp-noah", "emp-lucas"],
         "unread": 3, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-roller", "name": "Roller", "icon": "hash",
         "members": 4, "members_ids": [CURRENT_EMPLOYEE_ID, "emp-marcus-simeo", "emp-karim", "emp-noah"],
         "unread": 2, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-karting", "name": "Karting", "icon": "hash",
         "members": 4, "members_ids": [CURRENT_EMPLOYEE_ID, "emp-marcus-simeo", "emp-karim", "emp-lucas"],
         "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-attractions", "name": "Attractions", "icon": "hash",
         "members": 4, "members_ids": [CURRENT_EMPLOYEE_ID, "emp-marcus-simeo", "emp-sophie", "emp-mia"],
         "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-restauration", "name": "Restauration", "icon": "hash",
         "members": 4, "members_ids": [CURRENT_EMPLOYEE_ID, "emp-marcus-simeo", "emp-thomas", "emp-emma"],
         "unread": 1, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-donut", "name": "Donut House", "icon": "hash",
         "members": 3, "members_ids": ["emp-marcus-simeo", "emp-thomas", "emp-emma"],
         "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-soccer", "name": "Soccer Bar", "icon": "hash",
         "members": 4, "members_ids": [CURRENT_EMPLOYEE_ID, "emp-marcus-simeo", "emp-thomas", "emp-mia"],
         "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-securite", "name": "Sécurité", "icon": "hash",
         "members": 3, "members_ids": ["emp-marcus-simeo", "emp-sophie", "emp-noah"],
         "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-nettoyage", "name": "Nettoyage", "icon": "hash",
         "members": 3, "members_ids": ["emp-marcus-simeo", "emp-sophie", "emp-lucas"],
         "unread": 0, "is_dm": False, "is_group": False, "archived": False},
    ]
    await db.channels.insert_many(channels)

    messages: list[dict] = [
        {"id": _id(), "channel_id": "ch-accueil", "author_id": "emp-sophie",
         "content": "Bonjour à toutes et tous, bonne journée 💙", "ts": _now()},
        {"id": _id(), "channel_id": "ch-accueil", "author_id": CURRENT_EMPLOYEE_ID,
         "content": "Bonjour Sophie ! Bonne journée également 🙌", "ts": _now()},
        {"id": _id(), "channel_id": "ch-ops", "author_id": "emp-sophie",
         "content": "Salut équipe OPS ! Briefing rapide à 10h dans la salle Atlas.", "ts": _now()},
        {"id": _id(), "channel_id": "ch-ops", "author_id": "emp-karim",
         "content": "OK je serai là 👍", "ts": _now()},
        {"id": _id(), "channel_id": "ch-ops", "author_id": "emp-noah",
         "content": "Pareil. Petit point sécurité à faire aussi ?", "ts": _now()},
        {"id": _id(), "channel_id": "ch-ops", "author_id": "emp-sophie",
         "content": "Oui prévu, on parle des nouvelles consignes incendie.", "ts": _now()},
        {"id": _id(), "channel_id": "ch-ops", "author_id": CURRENT_EMPLOYEE_ID,
         "content": "Top, à tout à l'heure 💪", "ts": _now()},
        {"id": _id(), "channel_id": "ch-restauration", "author_id": "emp-thomas",
         "content": "Pensez à vérifier les stocks frites avant l'ouverture.", "ts": _now()},
        {"id": _id(), "channel_id": "ch-restauration", "author_id": "emp-emma",
         "content": "C'est noté ✅", "ts": _now()},
        {"id": _id(), "channel_id": "ch-roller", "author_id": "emp-karim",
         "content": "Roller Party samedi 🛼 — qui vient ?", "ts": _now()},
        {"id": _id(), "channel_id": "ch-karting", "author_id": "emp-karim",
         "content": "Maintenance kart #7 demain matin.", "ts": _now()},
    ]
    await db.messages.insert_many(messages)

    # ─── Events
    events: list[dict] = [
        {"id": _id(), "title": "Roller Party White Night",
         "date": (today + timedelta(days=5)).isoformat(), "time": "21:00",
         "type": "event", "location": "Piste Roller",
         "description": "Soirée mensuelle ouverte aux salariés et invités.",
         "needs_registration": True},
        {"id": _id(), "title": "Formation sécurité incendie",
         "date": (today + timedelta(days=10)).isoformat(), "time": "10:00",
         "type": "training", "location": "Salle RH",
         "description": "Formation obligatoire annuelle.",
         "needs_registration": True},
        {"id": _id(), "title": "Réunion équipe Opérations",
         "date": (today + timedelta(days=2)).isoformat(), "time": "09:30",
         "type": "meeting", "location": "Salle Atlas",
         "description": "Brief hebdomadaire — point sur le week-end et planning.",
         "needs_registration": False},
        {"id": _id(), "title": "Anniversaire Sophie BERNARD",
         "date": (today + timedelta(days=14)).isoformat(), "time": "12:00",
         "type": "birthday", "location": "Espace détente",
         "description": "Pot d'anniversaire à 12h, gâteau offert ! Venez quand vous voulez.",
         "needs_registration": False},
        {"id": _id(), "title": "Maintenance Karting",
         "date": (today + timedelta(days=8)).isoformat(), "time": "07:00",
         "type": "maintenance", "location": "Piste karting",
         "description": "Maintenance technique mensuelle, équipe atelier uniquement. Piste fermée 7h-10h.",
         "needs_registration": False},
        {"id": _id(), "title": "Tournoi Karting Inter-équipes",
         "date": (today + timedelta(days=30)).isoformat(), "time": "14:00",
         "type": "event", "location": "Piste karting",
         "description": "Grand tournoi annuel. Équipes de 4. Lots à gagner. Inscription obligatoire.",
         "needs_registration": True},
    ]
    await db.events.insert_many(events)

    # ─── News (carrousel)
    news: list[dict] = [
        {"id": _id(), "title": "Fermeture exceptionnelle du parc le 24 février",
         "summary": "Le parc sera fermé toute la journée du 24 février pour maintenance technique générale et formation équipes. Réouverture le 25 février à 10h00.",
         "image": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1600&h=900&fit=crop",
         "date": (today + timedelta(days=11)).isoformat(), "category": "Alerte"},
        {"id": _id(), "title": "Journée des alternants — 4 novembre 2026",
         "summary": "Inscrivez-vous dès maintenant à la grande journée des alternants ! Ateliers, networking, témoignages et goûter offert au Soccer Bar. Inscription auprès de Pierre MOREAU avant le 20 octobre.",
         "image": "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1600&h=900&fit=crop",
         "date": "2026-11-04", "category": "Événement"},
        {"id": _id(), "title": "Roller Party White Night — samedi prochain",
         "summary": "Notre soirée mensuelle revient avec un thème 100% blanc. Tenue exigée, ambiance garantie. Cocktails offerts pour les salariés MS Park.",
         "image": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&h=900&fit=crop",
         "date": (today + timedelta(days=5)).isoformat(), "category": "Événement"},
        {"id": _id(), "title": "Nouveau Bao Dog au Soccer Bar dès lundi",
         "summary": "Une nouvelle référence signature à découvrir : pain bao vapeur, saucisse premium et sauce sriracha. Disponible à partir de 12 pts.",
         "image": "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=1600&h=900&fit=crop",
         "date": today.isoformat(), "category": "Restauration"},
        {"id": _id(), "title": "Tournoi Karting Inter-équipes — 15 mars",
         "summary": "Inscrivez votre équipe au grand tournoi annuel karting MS Park. 4 personnes par équipe, lots à gagner. Inscriptions ouvertes sur l'agenda.",
         "image": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&h=900&fit=crop",
         "date": (today + timedelta(days=30)).isoformat(), "category": "Événement"},
        {"id": _id(), "title": "Mise à jour règlement intérieur 2026",
         "summary": "Le nouveau règlement intérieur est disponible dans Documents RH. Merci d'en prendre connaissance avant le 1er mars.",
         "image": "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1600&h=900&fit=crop",
         "date": (today - timedelta(days=2)).isoformat(), "category": "Communication"},
    ]
    await db.news.insert_many(news)

    # ─── Demo forms (form builder)
    forms: list[dict] = [
        {
            "id": _id(),
            "title": "Inscription — Séminaire MS Park 2026",
            "description": "Confirmez votre présence pour la journée du 12 juin à Fontainebleau. Merci de répondre avant le 20 mai.",
            "fields": _prepare_fields([
                {"id": _id(), "type": "text", "label": "Prénom", "name": "first_name", "required": True, "placeholder": "Auto-rempli", "options": None},
                {"id": _id(), "type": "text", "label": "Nom", "name": "last_name", "required": True, "placeholder": "Auto-rempli", "options": None},
                {"id": _id(), "type": "email", "label": "E-mail de contact", "name": "email", "required": True, "options": None},
                {"id": _id(), "type": "tel", "label": "Téléphone", "name": "phone", "required": False, "options": None},
                {"id": _id(), "type": "radio", "label": "Serez-vous présent(e) ?", "name": "attendance", "required": True, "options": ["Oui, toute la journée", "Oui, matinée uniquement", "Oui, après-midi uniquement", "Non, indisponible"]},
                {"id": _id(), "type": "checkbox", "label": "Ateliers souhaités", "name": "workshops", "required": False, "options": ["Product & UX", "Sécurité & réglementation", "Restauration & F&B", "RH & culture d'équipe"]},
                {"id": _id(), "type": "select", "label": "Régime alimentaire", "name": "diet", "required": False, "options": ["Standard", "Végétarien", "Végétalien", "Sans gluten", "Sans porc", "Halal", "Casher"]},
                {"id": _id(), "type": "textarea", "label": "Attentes / questions", "name": "notes", "required": False, "placeholder": "Un sujet à aborder ? Une remarque ?", "options": None},
            ]),
            "active": True,
            "submit_label": "Confirmer ma présence",
            "success_message": "Merci ! Votre inscription au séminaire est bien enregistrée. Rendez-vous le 12 juin 🎉",
            "created_by": ADMIN_EMPLOYEE_ID,
            "created_by_name": "Marcus SIMÉO",
            "created_at": _now(),
        },
        {
            "id": _id(),
            "title": "Suggestions & idées 💡",
            "description": "Une idée d'amélioration pour MS Park ? Un besoin exprimé sur le terrain ? Faites-nous en part.",
            "fields": _prepare_fields([
                {"id": _id(), "type": "text", "label": "Prénom", "name": "first_name", "required": True, "options": None},
                {"id": _id(), "type": "text", "label": "Nom", "name": "last_name", "required": True, "options": None},
                {"id": _id(), "type": "select", "label": "Catégorie", "name": "category", "required": True, "options": ["Restauration", "Attractions", "Sécurité", "Communication interne", "RH", "Autre"]},
                {"id": _id(), "type": "textarea", "label": "Votre idée", "name": "idea", "required": True, "placeholder": "Décrivez votre suggestion…", "options": None},
            ]),
            "active": True,
            "submit_label": "Envoyer ma suggestion",
            "success_message": "Merci pour votre suggestion ! Nous vous répondrons sous 15 jours.",
            "created_by": ADMIN_EMPLOYEE_ID,
            "created_by_name": "Marcus SIMÉO",
            "created_at": _now(),
        },
    ]
    await db.forms.insert_many(forms)

    await db.meta.insert_one({"_id": "seeded", "at": _now()})
    log.info("Seed complete.")


async def _strip(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


# ─────────────────────────────── API routes ──────────────────────────────────

@api.get("/")
async def root():
    return {"app": "MS Park Intranet", "status": "ok"}


async def _pending_leave_days(emp_id: str) -> dict:
    """Return {cp: n_days, rtt: n_days} of pending requests for this employee.
    Counts only business days according to the employee's weekly pattern.
    """
    emp = await db.employees.find_one({"id": emp_id}, {"_id": 0}) or {}
    pending = await db.requests.find(
        {"employee_id": emp_id, "status": "pending",
         "type": {"$in": ["conge", "rtt"]}},
        {"_id": 0},
    ).to_list(300)
    out = {"cp": 0.0, "rtt": 0.0}
    for r in pending:
        try:
            s = date.fromisoformat(r["start_date"])
            e = date.fromisoformat(r.get("end_date") or r["start_date"])
        except Exception:
            continue
        cur = s
        while cur <= e:
            entry = _entry_from_pattern(emp, cur) if emp else None
            if entry and entry.get("type") != "off":
                if r["type"] == "conge":
                    out["cp"] += 1
                else:
                    out["rtt"] += 1
            cur += timedelta(days=1)
    return out


def _display_balance(stored: dict, pending: dict) -> dict:
    """Subtract pending days from the stored balance to get displayed balance.
    Negative values are allowed (anticipated leave)."""
    b = dict(stored or {})
    cp_pending = pending.get("cp", 0.0)
    rtt_pending = pending.get("rtt", 0.0)
    # Consume pending CP against N-1 first, then N (mirrors approval logic)
    n1 = float(b.get("cp_n_1", 0))
    take_n1 = min(cp_pending, n1)
    b["cp_n_1"] = round(n1 - take_n1, 1)
    remaining = cp_pending - take_n1
    b["cp_n"] = round(float(b.get("cp_n", 0)) - remaining, 1)
    b["rtt"] = round(float(b.get("rtt", 0)) - rtt_pending, 1)
    return b


@api.get("/me")
async def me():
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not emp:
        # Fall back to the seed employee so a stale localStorage ID never breaks the UI
        emp = await db.employees.find_one({"id": CURRENT_EMPLOYEE_ID}, {"_id": 0})
        if not emp:
            raise HTTPException(404, "Current employee not found")
    quota = emp.get("daily_quota") or ROLE_QUOTAS.get(emp.get("role_category", "employe"), 20)
    emp["daily_quota"] = quota
    # Compute displayed leave balance: subtract pending CP/RTT requests immediately
    stored = emp.get("leave_balance") or {}
    pending = await _pending_leave_days(emp["id"])
    emp["leave_balance"] = _display_balance(stored, pending)
    emp["leave_balance_stored"] = stored  # for admin views / debugging
    emp["leave_balance_pending"] = pending
    # Expose the welcome flag so the frontend can show the first-login popup.
    # Any employee whose `welcomed_at` is not set is considered "new" and will
    # see the intro modal until they acknowledge it.
    emp["needs_welcome"] = not emp.get("welcomed_at")
    # Expose the guided-tour flag. Only new employees that were explicitly
    # onboarded (`onboarding_pending=True`) get the step-by-step tour after
    # they close the welcome popup. Legacy demo users (Idriss, Marcus…) never
    # see the tour because `onboarding_pending` is falsy for them.
    emp["needs_tour"] = bool(emp.get("onboarding_pending")) and not emp.get("tour_completed_at")
    return emp


@api.post("/me/tour/complete")
async def acknowledge_tour():
    """Mark the onboarding guided tour as completed for the current employee."""
    now_iso = _now()
    await db.employees.update_one(
        {"id": current_user()},
        {"$set": {"tour_completed_at": now_iso, "onboarding_pending": False}},
    )
    return {"ok": True, "tour_completed_at": now_iso}


@api.post("/me/welcome")
async def acknowledge_welcome():
    """Dismiss the first-login welcome popup for the current employee.
    Called by the frontend when the user clicks « C'est parti ! »."""
    now_iso = _now()
    await db.employees.update_one(
        {"id": current_user()},
        {"$set": {"welcomed_at": now_iso}},
    )
    return {"ok": True, "welcomed_at": now_iso}


@api.get("/employees")
async def list_employees():
    items = await db.employees.find({}, {"_id": 0}).to_list(500)
    # Enrich with live presence status (last_seen_at + is_online)
    presences = {
        p["employee_id"]: p.get("last_seen_at")
        async for p in db.presence.find({}, {"_id": 0})
    }
    now = datetime.now(timezone.utc)
    for e in items:
        ls = presences.get(e["id"])
        e["last_seen_at"] = ls
        e["is_online"] = False
        if ls:
            try:
                dt = datetime.fromisoformat(str(ls).replace("Z", "+00:00"))
                if (now - dt).total_seconds() < 120:  # < 2 min = online
                    e["is_online"] = True
            except Exception:
                pass
    return items


# ─── Presence (heartbeat every ~60s from the frontend)
@api.post("/presence/ping")
async def presence_ping():
    uid = current_user()
    now_iso = _now()
    await db.presence.update_one(
        {"employee_id": uid},
        {"$set": {"employee_id": uid, "last_seen_at": now_iso}},
        upsert=True,
    )
    return {"ok": True, "last_seen_at": now_iso}


# ─── Absence auto-reply
class AbsenceReply(BaseModel):
    auto_from_planning: bool = True
    manual_enabled: bool = False
    manual_start: Optional[str] = None  # YYYY-MM-DD
    manual_end: Optional[str] = None    # YYYY-MM-DD
    message: str = ""


DEFAULT_ABSENCE_MESSAGE = (
    "Bonjour, je suis actuellement absent(e). Je prendrai connaissance de "
    "votre message dès mon retour. En cas d'urgence, merci de contacter mon responsable."
)


@api.get("/me/absence-reply")
async def get_my_absence_reply():
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    ar = (emp or {}).get("absence_reply") or {}
    return {
        "auto_from_planning": ar.get("auto_from_planning", True),
        "manual_enabled": ar.get("manual_enabled", False),
        "manual_start": ar.get("manual_start"),
        "manual_end": ar.get("manual_end"),
        "message": ar.get("message") or DEFAULT_ABSENCE_MESSAGE,
    }


@api.put("/me/absence-reply")
async def put_my_absence_reply(payload: AbsenceReply):
    data = payload.model_dump()
    if not (data.get("message") or "").strip():
        data["message"] = DEFAULT_ABSENCE_MESSAGE
    await db.employees.update_one(
        {"id": current_user()},
        {"$set": {"absence_reply": data}},
    )
    return {"ok": True, **data}


async def _is_user_absent_today(uid: str) -> tuple[bool, str]:
    """Return (is_absent, reason) for a given employee based on:
    - manual toggle covering today (highest priority)
    - approved leave / OFF day from their planning
    Materializes the schedule for today from `weekly_pattern` when missing so
    the live planning (including admin edits made a second ago) is always the
    source of truth.
    """
    emp = await db.employees.find_one({"id": uid}, {"_id": 0})
    if not emp:
        return False, ""
    ar = emp.get("absence_reply") or {}
    today = _now_paris().date().isoformat()
    # Manual toggle
    if ar.get("manual_enabled"):
        start = ar.get("manual_start") or today
        end = ar.get("manual_end") or start
        if start <= today <= end:
            return True, "manual"
    # Automatic from planning
    if ar.get("auto_from_planning", True):
        # Approved leave request covering today?
        leave = await db.requests.find_one({
            "employee_id": uid,
            "status": "approved",
            "start_date": {"$lte": today},
            "end_date": {"$gte": today},
        }, {"_id": 0})
        if leave:
            return True, "leave"
        # Materialize today's schedule from weekly_pattern if missing so the
        # OFF-day check reflects the CURRENT planning, not a stale absence.
        today_d = date.fromisoformat(today)
        try:
            await _ensure_range(uid, today_d, today_d)
        except Exception:
            pass
        # OFF day: no work / remote shift scheduled for today
        sched = await db.schedules.find_one(
            {"employee_id": uid, "day": today,
             "type": {"$in": ["shift", "remote"]}},
            {"_id": 0},
        )
        if not sched:
            return True, "off"
    return False, ""


# ─── Dashboard summary
@api.get("/dashboard")
async def dashboard():
    today = _now_paris().date().isoformat()
    uid = current_user()
    # Ensure today ± 7d are materialized from `weekly_pattern` so the
    # dashboard "Prise de poste du jour" ALWAYS matches "Mon planning" —
    # single source of truth, live-synced with admin edits.
    today_d = date.fromisoformat(today)
    try:
        await _ensure_range(uid, today_d - timedelta(days=1), today_d + timedelta(days=7))
    except Exception:
        pass
    emp = await db.employees.find_one({"id": uid}, {"_id": 0})
    today_schedule = await db.schedules.find_one(
        {"employee_id": uid, "day": today}, {"_id": 0}
    )
    # Use the same intelligent live badging as `/badging` so the Dashboard
    # card and the Badge page display exactly the same 4 timestamps.
    # Priority: real badging entry from `db.badging` (source of truth for the
    # Badge page) > simulated live badging from the shift.
    real_badge = await db.badging.find_one(
        {"employee_id": uid, "day": today}, {"_id": 0}
    )
    today_badge = real_badge or (
        _compute_today_badging(today_schedule, uid) if today_schedule else None
    )

    # Compute live status
    status = "off"  # off | service | pause | end | hors_site
    worked_minutes = 0
    if today_schedule and today_schedule.get("type") == "shift":
        now = datetime.now()
        start = datetime.strptime(today_schedule["start"], "%H:%M").replace(
            year=now.year, month=now.month, day=now.day
        )
        end = datetime.strptime(today_schedule["end"], "%H:%M").replace(
            year=now.year, month=now.month, day=now.day
        )
        if today_badge and today_badge.get("clock_in"):
            if today_badge.get("clock_out"):
                status = "end"
                worked_minutes = today_badge.get("worked_minutes", 0)
            elif now < end:
                status = "service"
                worked_minutes = max(0, int((now - start).total_seconds() // 60))
            else:
                status = "end"
        else:
            status = "hors_site"
    elif today_schedule and today_schedule.get("type") == "off":
        status = "off"

    # Upcoming days
    upcoming_raw = await db.schedules.find(
        {"employee_id": current_user(), "day": {"$gte": today}},
        {"_id": 0},
    ).sort("day", 1).to_list(50)
    # Defensive dedupe — legacy data may contain multiple entries for the same
    # day; keep only the first (highest priority) occurrence per day.
    seen_days: set[str] = set()
    upcoming: list[dict] = []
    for s in upcoming_raw:
        if s["day"] in seen_days:
            continue
        seen_days.add(s["day"])
        upcoming.append(s)
        if len(upcoming) >= 7:
            break

    # Week hours — based on REAL planning shifts (not only badging) + badging adjustments
    today_d = date.today()
    monday = today_d - timedelta(days=today_d.weekday())
    sunday = monday + timedelta(days=6)
    week_iso = [(monday + timedelta(days=i)).isoformat() for i in range(7)]

    week_schedules = await db.schedules.find(
        {"employee_id": current_user(),
         "day": {"$gte": monday.isoformat(), "$lte": sunday.isoformat()}},
        {"_id": 0},
    ).to_list(20)
    sched_by_day = {s["day"]: s for s in week_schedules}

    week_badges = await db.badging.find(
        {"employee_id": current_user(),
         "day": {"$gte": monday.isoformat(), "$lte": sunday.isoformat()}},
        {"_id": 0},
    ).to_list(100)
    badge_by_day = {b["day"]: b for b in week_badges}

    week_minutes = 0
    week_planned_minutes = 0
    week_leave_minutes = 0
    off_days = 0
    leave_days = 0
    late_count = 0
    absence_count = 0
    today_iso = today_d.isoformat()
    for day_iso in week_iso:
        sched = sched_by_day.get(day_iso)
        if not sched:
            continue
        stype = sched.get("type")
        if stype == "off":
            off_days += 1
            continue
        if stype in ("leave", "rtt"):
            # Paid leave / RTT count toward the contract using their preserved hours
            covered = _covered_minutes(sched)
            week_planned_minutes += covered
            week_minutes += covered
            week_leave_minutes += covered
            leave_days += 1
            continue
        if stype == "shift":
            # planned duration (excluding pause)
            planned = _covered_minutes(sched)
            week_planned_minutes += planned

            badge = badge_by_day.get(day_iso)
            if day_iso < today_iso:
                # past day → use actual badged minutes
                if badge and badge.get("worked_minutes"):
                    week_minutes += badge.get("worked_minutes", 0)
                    if badge.get("anomaly") == "late":
                        late_count += 1
                else:
                    absence_count += 1
            elif day_iso == today_iso:
                # today — count what's already worked (live) if badged in
                if badge and badge.get("clock_in"):
                    if badge.get("clock_out"):
                        week_minutes += badge.get("worked_minutes", 0)
                    else:
                        # estimate live worked minutes
                        try:
                            start_dt = datetime.strptime(sched["start"], "%H:%M").replace(
                                year=today_d.year, month=today_d.month, day=today_d.day
                            )
                            live = max(0, int((datetime.now() - start_dt).total_seconds() // 60))
                            # cap to planned for this day
                            week_minutes += min(live, planned)
                        except Exception:
                            pass

    # Presence rate over last 28 days
    last28 = (today_d - timedelta(days=28)).isoformat()
    past = await db.badging.find(
        {"employee_id": current_user(),
         "day": {"$gte": last28, "$lt": today}},
        {"_id": 0},
    ).to_list(100)
    total_shifts = len(past)
    on_time = sum(1 for b in past if not b.get("anomaly"))
    presence_rate = int((on_time / total_shifts) * 100) if total_shifts else 100

    # Notifications & messages
    unread_notifs = await db.notifications.count_documents(
        {"employee_id": current_user(), "read": False}
    )
    docs_count = await db.documents.count_documents({})
    unread_msgs = 3  # mock

    return {
        "employee": emp,
        "today": today,
        "today_schedule": today_schedule,
        "today_badge": today_badge,
        "live_status": status,
        "worked_minutes_today": worked_minutes,
        "upcoming_schedule": upcoming,
        "week_minutes": week_minutes,
        "week_planned_minutes": week_planned_minutes,
        "week_leave_minutes": week_leave_minutes,
        "week_hours_target": 24 * 60,
        "presence_rate": presence_rate,
        "off_days_week": off_days,
        "leave_days_week": leave_days,
        "late_count_week": late_count,
        "absence_count_week": absence_count,
        "unread_notifications": unread_notifs,
        "unread_messages": unread_msgs,
        "documents_count": docs_count,
        "weather": {
            "temp": 9,
            "condition": "Partiellement nuageux",
            "icon": "cloud-sun",
            "city": "Paris",
            "high": 11,
            "low": 4,
        },
    }


# ─── Schedule
@api.get("/schedule")
async def get_schedule(month: Optional[str] = None):
    """month format: YYYY-MM. Returns all entries for the month + ±7 days."""
    if month is None:
        month = date.today().strftime("%Y-%m")
    y, m = map(int, month.split("-"))
    first = date(y, m, 1)
    last = (date(y, m + 1, 1) if m < 12 else date(y + 1, 1, 1)) - timedelta(days=1)
    pad_start = first - timedelta(days=7)
    pad_end = last + timedelta(days=7)
    # Materialize missing days from the pattern
    await _ensure_range(current_user(), pad_start, pad_end)
    items = await db.schedules.find(
        {"employee_id": current_user(),
         "day": {"$gte": pad_start.isoformat(), "$lte": pad_end.isoformat()}},
        {"_id": 0},
    ).sort("day", 1).to_list(200)
    return items


@api.get("/schedule/day")
async def get_schedule_day(day: str):
    """Return schedule entry for a specific day (YYYY-MM-DD)."""
    try:
        d = date.fromisoformat(day)
    except Exception:
        raise HTTPException(400, "Date invalide")
    await _ensure_range(current_user(), d, d)
    item = await db.schedules.find_one(
        {"employee_id": current_user(), "day": day}, {"_id": 0}
    )
    return {"day": day, "entry": item, "is_working_day": bool(item and item.get("type") == "shift")}


# ─── French public holidays (Alsace-Moselle excluded, jour de solidarité included)
_FR_HOLIDAYS = {
    "01-01": "Jour de l'an",
    "05-01": "Fête du Travail",
    "05-08": "Victoire 1945",
    "07-14": "Fête nationale",
    "08-15": "Assomption",
    "11-01": "Toussaint",
    "11-11": "Armistice 1918",
    "12-25": "Noël",
    # Movable feasts kept simple — Easter Monday, Ascension, Whit Monday are computed
}


def _easter_sunday(year: int) -> date:
    """Anonymous Gregorian algorithm."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    L = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * L) // 451
    month = (h + L - 7 * m + 114) // 31
    day = ((h + L - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _year_holidays(year: int) -> dict:
    hols = {f"{year}-{md}": name for md, name in _FR_HOLIDAYS.items()}
    easter = _easter_sunday(year)
    hols[(easter + timedelta(days=1)).isoformat()] = "Lundi de Pâques"
    hols[(easter + timedelta(days=39)).isoformat()] = "Ascension"
    hols[(easter + timedelta(days=50)).isoformat()] = "Lundi de Pentecôte"
    return hols


@api.get("/availability")
async def availability(month: Optional[str] = None):
    """Combined day-availability for the calendar picker (used to file leave/RTT requests).

    Returns for each day of the given month:
      - status: available | off | worked | cp_approved | rtt_approved | pending | holiday | past
      - label: short display string (e.g. "09h-17h", "Jour férié — Ascension")
      - selectable: bool
    """
    if month is None:
        month = date.today().strftime("%Y-%m")
    y, m = map(int, month.split("-"))
    first = date(y, m, 1)
    last = (date(y, m + 1, 1) if m < 12 else date(y + 1, 1, 1)) - timedelta(days=1)
    await _ensure_range(current_user(), first, last)

    # Load schedule entries for the month
    entries = await db.schedules.find(
        {"employee_id": current_user(),
         "day": {"$gte": first.isoformat(), "$lte": last.isoformat()}},
        {"_id": 0},
    ).to_list(200)
    by_day = {e["day"]: e for e in entries}

    # Load employee (for pattern fallback on days beyond auto-gen horizon)
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}

    # Load employee's requests overlapping this month (any status)
    reqs = await db.requests.find(
        {"employee_id": current_user()},
        {"_id": 0},
    ).to_list(500)
    by_day_req: dict[str, dict] = {}
    for r in reqs:
        try:
            s = date.fromisoformat(r["start_date"])
            e = date.fromisoformat(r.get("end_date") or r["start_date"])
        except Exception:
            continue
        cur = s
        while cur <= e:
            iso = cur.isoformat()
            if first <= cur <= last:
                # Priority: approved > pending > rejected
                prev = by_day_req.get(iso)
                if not prev or (prev["status"] == "rejected") or (prev["status"] == "pending" and r["status"] == "approved"):
                    by_day_req[iso] = r
            cur += timedelta(days=1)

    holidays = _year_holidays(y)
    today_iso = date.today().isoformat()
    days = []
    cur = first
    while cur <= last:
        iso = cur.isoformat()
        r = by_day_req.get(iso)
        sched = by_day.get(iso)
        # Fallback: derive from weekly pattern for days without a materialized entry
        # Only apply if the user actually has a defined pattern — otherwise let
        # the holiday branch below handle days on the fixed French calendar.
        if not sched and emp.get("weekly_pattern"):
            sched = _entry_from_pattern(emp, cur)
        status, label, selectable = "available", "Disponible", True

        if iso < today_iso:
            status, selectable = "past", False
            label = "Passé"
        elif r and r["status"] == "approved" and r["type"] in ("conge", "rtt"):
            status = "cp_approved" if r["type"] == "conge" else "rtt_approved"
            selectable = False
            label = "CP validé" if r["type"] == "conge" else "RTT validé"
        elif r and r["status"] == "pending":
            status = "pending"
            selectable = False
            label = f"Demande en attente ({r['type'].upper()})"
        elif iso in holidays:
            # Public holidays take priority over shift/off styling so they are
            # always visible in red on the calendar. They are NOT selectable —
            # employees can't request a CP/RTT on a legal French holiday.
            status, selectable = "holiday", False
            label = f"Férié — {holidays[iso]}"
        elif sched and sched.get("type") == "off":
            status, selectable = "off", False
            label = "Jour OFF"
        elif sched and sched.get("type") in ("shift", "remote"):
            status, selectable = "worked", True
            kind = "Télétravail" if sched.get("type") == "remote" else "Travail"
            label = f"{kind} {sched.get('start', '')}–{sched.get('end', '')}"
        elif sched and sched.get("type") in ("cp", "rtt"):
            status = "cp_approved" if sched["type"] == "cp" else "rtt_approved"
            selectable = False
            label = "CP" if sched["type"] == "cp" else "RTT"

        days.append({
            "date": iso,
            "status": status,
            "label": label,
            "selectable": selectable,
            "weekday": cur.weekday(),  # 0=Mon
        })
        cur += timedelta(days=1)

    return {"month": month, "days": days}


class MultiDayRequest(BaseModel):
    type: str  # conge | rtt | absence
    dates: list[str]  # list of ISO dates
    comment: Optional[str] = ""


@api.post("/requests/multi")
async def create_multi_day_request(payload: MultiDayRequest):
    """Create one HR request per contiguous range picked from the calendar.
    Validates each date server-side against the same availability rules."""
    if not payload.dates:
        raise HTTPException(400, "Aucun jour sélectionné")
    if payload.type not in ("conge", "rtt", "absence"):
        raise HTTPException(400, "Type de demande invalide pour la sélection multi-jours")

    # Compute availability for each requested date's month once
    months_needed: set[str] = set()
    parsed: list[date] = []
    for d in payload.dates:
        try:
            parsed.append(date.fromisoformat(d))
        except Exception:
            raise HTTPException(400, f"Date invalide : {d}")
        months_needed.add(d[:7])

    # Reuse availability logic: fetch schedule + requests + holidays
    today = date.today()
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    scheds = await db.schedules.find(
        {"employee_id": current_user(),
         "day": {"$in": [d.isoformat() for d in parsed]}},
        {"_id": 0},
    ).to_list(200)
    sched_by_day = {s["day"]: s for s in scheds}
    reqs = await db.requests.find(
        {"employee_id": current_user(),
         "status": {"$in": ["approved", "pending"]}},
        {"_id": 0},
    ).to_list(500)
    blocked_by_req: set[str] = set()
    for r in reqs:
        try:
            s = date.fromisoformat(r["start_date"])
            e = date.fromisoformat(r.get("end_date") or r["start_date"])
        except Exception:
            continue
        cur = s
        while cur <= e:
            blocked_by_req.add(cur.isoformat())
            cur += timedelta(days=1)

    years_needed = {d.year for d in parsed}
    holidays: dict[str, str] = {}
    for y in years_needed:
        holidays.update(_year_holidays(y))

    # Validate each requested day. Public holidays are strictly blocked —
    # employees can't request a CP / RTT on a legal French holiday.
    errors: list[str] = []
    for d in parsed:
        iso = d.isoformat()
        if d < today:
            errors.append(f"{iso} : jour passé")
            continue
        if iso in holidays:
            errors.append(f"{iso} : jour férié ({holidays[iso]})")
            continue
        if iso in blocked_by_req:
            errors.append(f"{iso} : déjà en congé ou en attente")
            continue
        sched = sched_by_day.get(iso) or _entry_from_pattern(emp, d)
        st = sched.get("type") if sched else None
        if st == "off":
            errors.append(f"{iso} : jour OFF")
        elif st in ("cp", "rtt"):
            errors.append(f"{iso} : déjà en {st.upper()}")

    if errors:
        raise HTTPException(
            400,
            {"message": "Certaines dates sélectionnées ne sont pas disponibles",
             "invalid_dates": errors},
        )

    # Sort & split into contiguous ranges
    sorted_days = sorted(set(payload.dates))
    ranges: list[tuple[str, str]] = []
    start = prev = sorted_days[0]
    for d in sorted_days[1:]:
        if date.fromisoformat(d) - date.fromisoformat(prev) == timedelta(days=1):
            prev = d
            continue
        ranges.append((start, prev))
        start = prev = d
    ranges.append((start, prev))

    created = []
    for s, e in ranges:
        r = {
            "id": _id(),
            "employee_id": current_user(),
            "type": payload.type,
            "start_date": s,
            "end_date": e,
            "comment": payload.comment or "",
            "amount": None,
            "status": "pending",
            "created_at": _now(),
            "decided_at": None,
        }
        await db.requests.insert_one(r.copy())
        created.append(r)

    return {"created": len(created), "ranges": [{"start": s, "end": e} for s, e in ranges]}


# ─── Badging
PARIS_TZ = ZoneInfo("Europe/Paris")


def _now_paris() -> datetime:
    """Current time in Europe/Paris — the reference timezone for MS Park."""
    return datetime.now(PARIS_TZ)


def _hm_to_minutes(hm: Optional[str]) -> Optional[int]:
    if not hm or ":" not in hm:
        return None
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def _minutes_to_hm(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _compute_today_badging(sched: dict, employee_id: str) -> Optional[dict]:
    """Build a live badging entry for today based on the planned shift and
    the current Paris time. Fields fill progressively as the day progresses:
    clock_in → pause_out → pause_in → clock_out. Returns None if the day
    is not a shift or the shift hasn't started yet."""
    if not sched or sched.get("type") not in ("shift", "remote"):
        return None
    start_m = _hm_to_minutes(sched.get("start"))
    end_m = _hm_to_minutes(sched.get("end"))
    if start_m is None or end_m is None:
        return None
    pause_start_m = _hm_to_minutes(sched.get("pause_start"))
    pause_end_m = _hm_to_minutes(sched.get("pause_end"))

    now = _now_paris()
    now_m = now.hour * 60 + now.minute

    if now_m < start_m:
        # Shift hasn't started yet
        return {
            "id": f"live-{sched.get('day')}",
            "employee_id": employee_id,
            "day": sched.get("day"),
            "clock_in": None,
            "pause_out": None,
            "pause_in": None,
            "clock_out": None,
            "worked_minutes": 0,
            "break_minutes": sched.get("break_minutes", 0),
            "anomaly": None,
            "note": "En attente",
            "live": True,
        }

    clock_in = sched["start"]
    pause_out = sched.get("pause_start") if pause_start_m is not None and now_m >= pause_start_m else None
    pause_in = sched.get("pause_end") if pause_end_m is not None and now_m >= pause_end_m else None
    clock_out = sched["end"] if now_m >= end_m else None

    # Worked minutes = (min(now, end) - start) − pause overlap already elapsed
    effective_end = min(now_m, end_m)
    worked = effective_end - start_m
    if pause_start_m is not None and pause_end_m is not None:
        overlap_start = max(pause_start_m, start_m)
        overlap_end = min(pause_end_m, effective_end)
        if overlap_end > overlap_start:
            worked -= (overlap_end - overlap_start)
    worked = max(0, worked)

    if clock_out:
        note = "Journée terminée"
    elif pause_in:
        note = "Reprise après pause"
    elif pause_out:
        note = "En pause"
    else:
        note = "En service"

    return {
        "id": f"live-{sched.get('day')}",
        "employee_id": employee_id,
        "day": sched.get("day"),
        "clock_in": clock_in,
        "pause_out": pause_out,
        "pause_in": pause_in,
        "clock_out": clock_out,
        "worked_minutes": worked,
        "break_minutes": sched.get("break_minutes", 0),
        "anomaly": None,
        "note": note,
        "live": True,
    }


@api.get("/badging")
async def get_badging(filter_range: str = "month"):
    today_d = _now_paris().date()
    # Rolling windows so the user always sees past history, not just the
    # calendar-current period. The frontend labels them "Jour / Semaine / Mois".
    if filter_range == "day":
        start = today_d  # today only (live card handles it)
    elif filter_range == "week":
        start = today_d - timedelta(days=7)
    else:
        start = today_d - timedelta(days=30)

    # Historical entries — exclude today (rebuilt live from planning)
    items = await db.badging.find(
        {
            "employee_id": current_user(),
            "day": {"$gte": start.isoformat(), "$lt": today_d.isoformat()},
        },
        {"_id": 0},
    ).sort("day", -1).to_list(100)

    # Merge manual punches (override schedule-derived values)
    manuals = await db.badging_manual.find(
        {"employee_id": current_user(), "day": {"$gte": start.isoformat(), "$lt": today_d.isoformat()}},
        {"_id": 0},
    ).to_list(100)
    by_day = {b["day"]: b for b in items}
    for m in manuals:
        d = m["day"]
        base = by_day.get(d) or {
            "id": f"manual-{d}", "employee_id": current_user(), "day": d,
            "worked_minutes": 0, "break_minutes": 0, "anomaly": None, "note": "Pointage manuel",
        }
        for k in ("clock_in", "pause_out", "pause_in", "clock_out"):
            if m.get(k):
                base[k] = m[k]
        ci = _hm_to_minutes(base.get("clock_in")); co = _hm_to_minutes(base.get("clock_out"))
        po = _hm_to_minutes(base.get("pause_out")); pi = _hm_to_minutes(base.get("pause_in"))
        if ci is not None and co is not None:
            w = max(0, co - ci)
            if po is not None and pi is not None:
                w -= max(0, pi - po)
            base["worked_minutes"] = max(0, w)
        by_day[d] = base
    items = sorted(by_day.values(), key=lambda x: x["day"], reverse=True)

    # Live entry for today, computed from today's planning AND manual punches
    today_sched = await db.schedules.find_one(
        {"employee_id": current_user(), "day": today_d.isoformat()}, {"_id": 0}
    )
    today_manual = await db.badging_manual.find_one(
        {"employee_id": current_user(), "day": today_d.isoformat()}, {"_id": 0}
    )
    live = _compute_today_badging(today_sched, current_user()) if today_sched else None
    if live and today_manual:
        # Manual punches always win over schedule-derived values
        for k in ("clock_in", "pause_out", "pause_in", "clock_out"):
            if today_manual.get(k):
                live[k] = today_manual[k]
        ci = _hm_to_minutes(live.get("clock_in"))
        co = _hm_to_minutes(live.get("clock_out"))
        po = _hm_to_minutes(live.get("pause_out"))
        pi = _hm_to_minutes(live.get("pause_in"))
        if ci is not None:
            now_m = _now_paris().hour * 60 + _now_paris().minute
            end_m = co if co is not None else now_m
            worked = max(0, end_m - ci)
            if po is not None and pi is not None:
                worked -= max(0, pi - po)
            live["worked_minutes"] = max(0, worked)
        live["is_manual"] = True
    if live:
        items = [live] + items
    return items


# ─── Meal points
@api.get("/meal-points/today")
async def meal_points_today():
    today = date.today().isoformat()
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    quota = emp.get("daily_quota") or ROLE_QUOTAS.get(emp.get("role_category", "employe"), 20)

    # Points are credited automatically every day (no badge required for MVP demo)
    today_sched = await db.schedules.find_one(
        {"employee_id": current_user(), "day": today}, {"_id": 0}
    )
    today_badge = await db.badging.find_one(
        {"employee_id": current_user(), "day": today}, {"_id": 0}
    )
    credited = True
    credited_points = quota

    transactions = await db.meal_tx.find(
        {"employee_id": current_user(), "ts": {"$gte": today + "T00:00:00"}},
        {"_id": 0},
    ).sort("ts", -1).to_list(50)
    # Only count daily-quota consumption, not bonus (bonus is tracked separately)
    used = sum(t.get("points_daily", t.get("points_spent", 0)) for t in transactions)
    remaining = max(0, credited_points - used)

    # Birthday bonus (10 points valid 30 days, granted once/year on birthday)
    birthday_bonus = _active_birthday_bonus(emp)

    last_tx = await db.meal_tx.find_one(
        {"employee_id": current_user()}, {"_id": 0}, sort=[("ts", -1)]
    )
    return {
        "daily_quota": quota,
        "credited": credited,
        "credited_points": credited_points,
        "used": used,
        "remaining": remaining + (birthday_bonus["remaining"] if birthday_bonus else 0),
        "birthday_bonus": birthday_bonus,
        "transactions": transactions,
        "last_badge": today_badge,
        "last_transaction_ts": last_tx.get("ts") if last_tx else None,
        "role_category": emp.get("role_category"),
        "expires_at": f"{today}T23:59:59",
    }


def _active_birthday_bonus(emp: dict) -> Optional[dict]:
    """Return the currently active birthday meal bonus (10 pts) or None if expired/absent."""
    bb = emp.get("birthday_bonus")
    if not bb:
        return None
    try:
        expires = date.fromisoformat(bb.get("expires_at", "")[:10])
    except Exception:
        return None
    if expires < date.today():
        return None
    remaining = max(0, int(bb.get("points", 0)) - int(bb.get("spent", 0)))
    if remaining <= 0:
        return None
    return {
        "points": int(bb.get("points", 0)),
        "spent": int(bb.get("spent", 0)),
        "remaining": remaining,
        "granted_at": bb.get("granted_at"),
        "expires_at": bb.get("expires_at"),
    }


# ─── Menu
@api.get("/menu")
async def menu(store: Optional[str] = None):
    q = {"store": store} if store else {}
    items = await db.products.find(q, {"_id": 0}).to_list(200)
    return items


# ═══════════════════════════════════════════════════════════════════
# Birthdays & birthday gift
# ═══════════════════════════════════════════════════════════════════
def _birthday_meta(bd_str: Optional[str], today: date) -> Optional[dict]:
    """Given an ISO birth date string, return meta for the *next* birthday."""
    if not bd_str:
        return None
    try:
        bd = date.fromisoformat(bd_str[:10])
    except Exception:
        return None
    # Next occurrence
    try:
        this_year = bd.replace(year=today.year)
    except ValueError:  # Feb 29 fallback
        this_year = bd.replace(year=today.year, day=28)
    if this_year < today:
        try:
            next_bd = bd.replace(year=today.year + 1)
        except ValueError:
            next_bd = bd.replace(year=today.year + 1, day=28)
    else:
        next_bd = this_year
    days_until = (next_bd - today).days
    age_on_next = next_bd.year - bd.year
    is_today = (next_bd == today)
    return {
        "birth_date": bd_str,
        "next_birthday": next_bd.isoformat(),
        "day": bd.day,
        "month": bd.month,
        "days_until": days_until,
        "age_on_next": age_on_next,
        "is_today": is_today,
    }


@api.get("/birthdays")
async def list_birthdays(view: str = "upcoming", limit: int = 60):
    """List employees sorted by their upcoming birthday (or past this year).
    Each row includes `already_wished` — True if the current user has already
    sent a birthday wish to that employee this year."""
    today = date.today()
    employees = await db.employees.find(
        {"birth_date": {"$ne": None}, "account_status": {"$ne": "deactivated"}},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "avatar": 1, "role": 1,
         "department": 1, "birth_date": 1},
    ).to_list(500)
    results = []
    for e in employees:
        meta = _birthday_meta(e.get("birth_date"), today)
        if not meta:
            continue
        results.append({**e, **meta})
    if view == "past":
        # Anniversaries that already occurred this year (last 90 days)
        results = [r for r in results if r["days_until"] > 275]
        results.sort(key=lambda r: r["days_until"], reverse=True)
    else:
        results.sort(key=lambda r: r["days_until"])
    results = results[:limit]
    # Enrich with `already_wished` for the caller. A wish can ONLY be sent on
    # the day of the birthday itself (`send_birthday_wish` enforces
    # `is_today`), so surfacing `already_wished=True` on a future or past
    # birthday would be misleading. We only flag rows whose anniversary is
    # today AND for which a wish is recorded in the current year.
    uid = current_user()
    wishes = await db.birthday_wishes.find(
        {"from_id": uid, "year": today.year}, {"_id": 0, "to_id": 1}
    ).to_list(500)
    wished_ids = {w["to_id"] for w in wishes}
    for r in results:
        r["already_wished"] = bool(r.get("is_today")) and r["id"] in wished_ids
    return results


class BirthdayWish(BaseModel):
    employee_id: str
    message: Optional[str] = ""


@api.post("/birthdays/wish")
async def send_birthday_wish(payload: BirthdayWish):
    """Send a birthday DM to an employee whose birthday is today.
    Idempotent per (from_id, to_id, year) — a second call returns the existing
    wish without posting a duplicate message."""
    uid = current_user()
    if payload.employee_id == uid:
        raise HTTPException(400, "Vous ne pouvez pas vous souhaiter à vous-même")
    target = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Employé introuvable")
    today = date.today()
    meta = _birthday_meta(target.get("birth_date"), today)
    if not (meta and meta.get("is_today")):
        raise HTTPException(400, "Ce n'est pas l'anniversaire de cette personne aujourd'hui")
    # Idempotent guard: has this user already wished this year ?
    already = await db.birthday_wishes.find_one(
        {"from_id": uid, "to_id": payload.employee_id, "year": today.year}, {"_id": 0}
    )
    if already:
        return {"ok": True, "already": True, "channel_id": already.get("channel_id")}

    # 1) Ensure a DM channel exists between the two users
    a, b = sorted([uid, payload.employee_id])
    cid = f"dm-{a}--{b}"
    existing = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not existing:
        # Legacy fallback: chercher un ancien canal DM `dm-{target}` MAIS uniquement si
        # ses `members_ids` contiennent exactement (uid, target). Sinon on créerait un
        # cross-post dans la conversation d'un autre collègue.
        legacy_cid = f"dm-{payload.employee_id}"
        legacy = await db.channels.find_one({"id": legacy_cid}, {"_id": 0})
        if legacy and set(legacy.get("members_ids") or []) == {uid, payload.employee_id}:
            existing = legacy
    if existing:
        cid = existing["id"]
        if not existing.get("members_ids"):
            await db.channels.update_one(
                {"id": cid}, {"$set": {"members_ids": [uid, payload.employee_id]}}
            )
    else:
        ch = {
            "id": cid,
            "name": f"{target['first_name']} {target['last_name']}",
            "icon": "user",
            "members": 2,
            "members_ids": [uid, payload.employee_id],
            "unread": 0,
            "is_dm": True,
            "is_group": False,
            "archived": False,
            "avatar": target.get("avatar"),
            "created_at": _now(),
        }
        await db.channels.insert_one(ch.copy())

    # 2) Post the message
    content = (payload.message or "").strip() or (
        f"🎂 Joyeux anniversaire {target['first_name']} ! Passe une excellente journée."
    )
    msg = {
        "id": _id(),
        "channel_id": cid,
        "author_id": uid,
        "content": content,
        "attachments": [],
        "ts": _now(),
    }
    await db.messages.insert_one(msg.copy())

    # 3) Notify the recipient (personal notification)
    sender = await db.employees.find_one({"id": uid}, {"_id": 0})
    sender_name = f"{sender.get('first_name', '')} {sender.get('last_name', '')}".strip() if sender else "Un collègue"
    await _push_notification(
        employee_id=payload.employee_id,
        type="message",
        title=f"🎂 {sender_name} vous souhaite un joyeux anniversaire",
        content=content[:140],
        icon="cake",
        link=f"/messagerie?ch={cid}",
    )

    # 4) Record the wish (idempotency)
    await db.birthday_wishes.insert_one({
        "id": _id(),
        "from_id": uid,
        "to_id": payload.employee_id,
        "year": today.year,
        "channel_id": cid,
        "message": content,
        "ts": _now(),
    })

    return {"ok": True, "already": False, "channel_id": cid}


@api.get("/me/birthday")
async def my_birthday_status():
    """Return whether today is my birthday + whether the gift popup has been shown this year."""
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me:
        raise HTTPException(404, "Employé introuvable")
    meta = _birthday_meta(me.get("birth_date"), date.today())
    today = date.today()
    is_today = bool(meta and meta["is_today"])
    last_seen = me.get("birthday_popup_year")
    claimed_year = (me.get("birthday_bonus") or {}).get("year")
    return {
        "is_birthday_today": is_today,
        "already_seen_this_year": last_seen == today.year,
        "gift_claimed_this_year": claimed_year == today.year,
        "birth_date": me.get("birth_date"),
        "birthday_bonus": _active_birthday_bonus(me),
    }


@api.post("/me/birthday/claim")
async def claim_birthday_gift():
    """Mark popup seen for the year and credit 10 meal points valid 30 days.
    Idempotent — subsequent calls same year return current state without granting again."""
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me:
        raise HTTPException(404, "Employé introuvable")
    meta = _birthday_meta(me.get("birth_date"), date.today())
    if not (meta and meta["is_today"]):
        raise HTTPException(400, "Ce n'est pas votre anniversaire aujourd'hui.")
    today = date.today()
    updates: dict = {"birthday_popup_year": today.year}
    already_granted = (me.get("birthday_bonus") or {}).get("year") == today.year
    if not already_granted:
        updates["birthday_bonus"] = {
            "points": 10,
            "spent": 0,
            "granted_at": _now(),
            "expires_at": (today + timedelta(days=30)).isoformat(),
            "year": today.year,
        }
    await db.employees.update_one({"id": current_user()}, {"$set": updates})
    # Notification
    await _push_notification(
        employee_id=current_user(),
        type="birthday",
        title="🎂 Joyeux anniversaire !",
        content="10 points repas ont été ajoutés à votre compte, valables 30 jours.",
        icon="cake",
        link="/anniversaires",
    )
    fresh = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    return {
        "ok": True,
        "birthday_bonus": _active_birthday_bonus(fresh),
    }


# ═══════════════════════════════════════════════════════════════════
# Ideas box (anonymous submissions + voting + admin moderation)
# ═══════════════════════════════════════════════════════════════════
IDEA_STATUSES = ["new", "reviewing", "accepted", "rejected"]
IDEA_CATEGORIES = ["Amélioration", "Événement", "Bien-être", "Technologie", "Environnement", "Autres"]


class IdeaCreate(BaseModel):
    title: str
    description: str
    category: Optional[str] = "Autres"
    is_anonymous: bool = True
    attachments: List[str] = []  # image URLs


class IdeaModerate(BaseModel):
    status: Optional[str] = None  # new | reviewing | accepted | rejected
    admin_response: Optional[str] = None


class IdeaCommentCreate(BaseModel):
    content: str


IDEA_STATUS_LABELS = {
    "new": "En attente",
    "reviewing": "En étude",
    "accepted": "Validée",
    "rejected": "Refusée",
    "delivered": "Mise en place",
}


def _sanitize_idea(idea: dict, me: dict) -> dict:
    is_admin = bool(me.get("is_admin"))
    out = {**idea}
    votes = out.get("votes") or {}
    out["upvotes"] = sum(1 for v in votes.values() if v == "up")
    out["downvotes"] = sum(1 for v in votes.values() if v == "down")
    out["my_vote"] = votes.get(me["id"])
    out["score"] = out["upvotes"] - out["downvotes"]
    out["comments_count"] = len(out.get("comments") or [])
    out["me_followed"] = me["id"] in (out.get("followers") or [])
    out["me_is_author"] = idea.get("author_id") == me["id"]
    # Hide identity for anonymous submissions (even from admin, per user requirement)
    if idea.get("is_anonymous"):
        out["author_id"] = None
        out["author_snapshot"] = {"first_name": "Anonyme", "last_name": ""}
    if not is_admin:
        out.pop("admin_note", None)
    out.pop("votes", None)
    out.pop("followers", None)
    return out


@api.get("/ideas")
async def list_ideas(status: Optional[str] = None, category: Optional[str] = None):
    me = await _me()
    q: dict = {}
    if status:
        q["status"] = status
    if category:
        q["category"] = category
    items = await db.ideas.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    non_anon_ids = list({i["author_id"] for i in items if not i.get("is_anonymous") and i.get("author_id")})
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": non_anon_ids}}, {"_id": 0})}
    for i in items:
        if not i.get("is_anonymous"):
            e = emps.get(i.get("author_id"), {})
            i["author_snapshot"] = {
                "first_name": e.get("first_name"), "last_name": e.get("last_name"),
                "avatar": e.get("avatar"), "role": e.get("role"),
            }
    return [_sanitize_idea(i, me) for i in items]


@api.get("/ideas/stats")
async def ideas_stats():
    """Aggregate counters for the sidebar stats card."""
    await _me()
    items = await db.ideas.find({}, {"_id": 0}).to_list(2000)
    total_votes = 0
    for i in items:
        total_votes += len(i.get("votes") or {})
    by_cat: dict = {}
    for i in items:
        c = i.get("category") or "Autres"
        by_cat[c] = by_cat.get(c, 0) + 1
    top_categories = [{"name": c, "count": n} for c, n in sorted(by_cat.items(), key=lambda x: -x[1])[:6]]
    return {
        "total_ideas": len(items),
        "total_votes": total_votes,
        "accepted": sum(1 for i in items if i.get("status") == "accepted"),
        "reviewing": sum(1 for i in items if i.get("status") == "reviewing"),
        "rejected": sum(1 for i in items if i.get("status") == "rejected"),
        "top_categories": top_categories,
    }


@api.get("/ideas/{idea_id}")
async def get_idea(idea_id: str):
    me = await _me()
    idea = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    if not idea:
        raise HTTPException(404, "Idée introuvable")
    if not idea.get("is_anonymous"):
        author = await db.employees.find_one({"id": idea.get("author_id")}, {"_id": 0}) or {}
        idea["author_snapshot"] = {
            "first_name": author.get("first_name"), "last_name": author.get("last_name"),
            "avatar": author.get("avatar"), "role": author.get("role"),
        }
    # Related ideas — same category, top score
    related = await db.ideas.find(
        {"category": idea.get("category"), "id": {"$ne": idea_id}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(20)
    related.sort(key=lambda x: sum(1 for v in (x.get("votes") or {}).values() if v == "up"), reverse=True)
    idea["related"] = [{
        "id": r["id"], "title": r["title"],
        "votes": sum(1 for v in (r.get("votes") or {}).values() if v == "up"),
    } for r in related[:3]]
    # Comments (hydrated with author snapshots when not anonymous)
    comments = idea.get("comments") or []
    author_ids = list({c.get("author_id") for c in comments if not c.get("is_anonymous")})
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": author_ids}}, {"_id": 0})}
    for c in comments:
        if not c.get("is_anonymous"):
            e = emps.get(c.get("author_id"), {})
            c["author_snapshot"] = {
                "first_name": e.get("first_name"), "last_name": e.get("last_name"),
                "avatar": e.get("avatar"),
            }
        else:
            c["author_id"] = None
            c["author_snapshot"] = {"first_name": "Anonyme", "last_name": ""}
    return _sanitize_idea(idea, me)


@api.post("/ideas")
async def create_idea(payload: IdeaCreate):
    me = await _me()
    now = _now()
    idea = {
        "id": _id(),
        "title": payload.title.strip()[:100] or "Sans titre",
        "description": payload.description.strip()[:2000],
        "category": payload.category or "Autres",
        "author_id": me["id"],
        "is_anonymous": bool(payload.is_anonymous),
        "status": "new",
        "admin_response": None,
        "votes": {},
        "attachments": (payload.attachments or [])[:6],
        "comments": [],
        "followers": [me["id"]],  # author auto-follows
        "status_history": [{"status": "new", "at": now, "by": None}],
        "created_at": now,
    }
    await db.ideas.insert_one(idea.copy())
    # Notif globale : tous les employés reçoivent la nouvelle idée
    author_name = "Un collaborateur" if idea["is_anonymous"] else f"{me.get('first_name','')} {me.get('last_name','')}".strip()
    try:
        await _broadcast_notification(
            type="idea",
            title=f"💡 Nouvelle idée · {idea['title']}",
            content=f"{author_name} vient de publier une idée dans la Boîte à idées.",
            icon="lightbulb",
            link=f"/idees/{idea['id']}",
            exclude_ids=[me["id"]],
        )
    except Exception:
        pass
    return _sanitize_idea(idea, me)


@api.post("/ideas/{idea_id}/vote")
async def vote_idea(idea_id: str, direction: str):
    """direction: up | down | clear"""
    me = await _me()
    idea = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    if not idea:
        raise HTTPException(404, "Idée introuvable")
    if direction not in ("up", "down", "clear"):
        raise HTTPException(400, "Direction invalide (up|down|clear)")
    votes = idea.get("votes") or {}
    if direction == "clear":
        votes.pop(me["id"], None)
    else:
        votes[me["id"]] = direction
    await db.ideas.update_one({"id": idea_id}, {"$set": {"votes": votes}})
    fresh = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    return _sanitize_idea(fresh, me)


@api.post("/ideas/{idea_id}/follow")
async def follow_idea(idea_id: str):
    me = await _me()
    idea = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    if not idea:
        raise HTTPException(404, "Idée introuvable")
    followers = idea.get("followers") or []
    if me["id"] not in followers:
        followers.append(me["id"])
        await db.ideas.update_one({"id": idea_id}, {"$set": {"followers": followers}})
    fresh = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    return _sanitize_idea(fresh, me)


@api.delete("/ideas/{idea_id}/follow")
async def unfollow_idea(idea_id: str):
    me = await _me()
    idea = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    if not idea:
        raise HTTPException(404, "Idée introuvable")
    followers = [f for f in (idea.get("followers") or []) if f != me["id"]]
    await db.ideas.update_one({"id": idea_id}, {"$set": {"followers": followers}})
    fresh = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    return _sanitize_idea(fresh, me)


@api.post("/ideas/{idea_id}/comments")
async def comment_idea(idea_id: str, payload: IdeaCommentCreate):
    me = await _me()
    idea = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    if not idea:
        raise HTTPException(404, "Idée introuvable")
    comment = {
        "id": _id(),
        "author_id": me["id"],
        "content": (payload.content or "").strip()[:800],
        "created_at": _now(),
        "is_anonymous": False,
    }
    if not comment["content"]:
        raise HTTPException(400, "Commentaire vide")
    comments = idea.get("comments") or []
    comments.append(comment)
    await db.ideas.update_one({"id": idea_id}, {"$set": {"comments": comments}})
    return comment


@api.put("/admin/ideas/{idea_id}")
async def moderate_idea(idea_id: str, payload: IdeaModerate):
    me = await require_admin()
    idea = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    if not idea:
        raise HTTPException(404, "Idée introuvable")
    updates: dict = {}
    now = _now()
    if payload.status is not None:
        if payload.status not in list(IDEA_STATUS_LABELS.keys()):
            raise HTTPException(400, f"Statut invalide : {payload.status}")
        updates["status"] = payload.status
        # Append to timeline
        history = list(idea.get("status_history") or [])
        history.append({"status": payload.status, "at": now, "by": me["id"]})
        updates["status_history"] = history
    if payload.admin_response is not None:
        updates["admin_response"] = payload.admin_response
        updates["moderated_by"] = me["id"]
        updates["moderated_at"] = now
    if updates:
        await db.ideas.update_one({"id": idea_id}, {"$set": updates})
    fresh = await db.ideas.find_one({"id": idea_id}, {"_id": 0})
    # Notify AUTHOR silently on status change (also for anonymous ideas — the
    # notification lands in their personal inbox without revealing identity).
    if payload.status and payload.status != idea.get("status") and fresh.get("author_id"):
        await _push_notification(
            employee_id=fresh["author_id"],
            type="idea",
            title=f"Votre idée est maintenant « {IDEA_STATUS_LABELS.get(payload.status, payload.status)} »",
            content=f"{fresh['title']}" + (f" — {payload.admin_response}" if payload.admin_response else ""),
            icon="lightbulb",
            link=f"/idees/{fresh['id']}",
        )
        # Also notify followers (people who explicitly clicked "Suivre")
        for fid in (fresh.get("followers") or []):
            if fid and fid != fresh.get("author_id"):
                await _push_notification(
                    employee_id=fid,
                    type="idea",
                    title=f"Idée suivie · {IDEA_STATUS_LABELS.get(payload.status, payload.status)}",
                    content=fresh["title"],
                    icon="lightbulb",
                    link=f"/idees/{fresh['id']}",
                )
    return _sanitize_idea(fresh, me)


@api.delete("/admin/ideas/{idea_id}")
async def delete_idea(idea_id: str):
    await require_admin()
    await db.ideas.delete_one({"id": idea_id})
    return {"ok": True}


# ─── Admin: Menu / Products CRUD
class ProductPayload(BaseModel):
    name: str
    description: Optional[str] = ""
    store: str  # soccer_bar | donut_house | stand_crepes | stand_bonbons
    category: str
    points: int = 0
    price_eur: float = 0.0
    image: Optional[str] = ""
    allergens: List[str] = []
    available: bool = True


@api.get("/admin/products")
async def admin_list_products():
    await require_admin()
    items = await db.products.find({}, {"_id": 0}).sort("store", 1).to_list(500)
    return items


@api.post("/admin/products")
async def admin_create_product(payload: ProductPayload):
    await require_admin()
    p = payload.model_dump()
    p["id"] = _id()
    p["created_at"] = _now()
    await db.products.insert_one(p.copy())
    p.pop("_id", None)
    return p


@api.put("/admin/products/{pid}")
async def admin_update_product(pid: str, payload: ProductPayload):
    await require_admin()
    existing = await db.products.find_one({"id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Produit introuvable")
    await db.products.update_one({"id": pid}, {"$set": payload.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})


@api.delete("/admin/products/{pid}")
async def admin_delete_product(pid: str):
    await require_admin()
    res = await db.products.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Produit introuvable")
    return {"ok": True}


# ─── Orders
@api.post("/orders")
async def create_order(payload: OrderCreate):
    today = date.today().isoformat()
    # Enforce same-day orders only — no past/future pickup dates
    if payload.pickup_date != today:
        raise HTTPException(400, "Les commandes ne sont possibles que pour le jour même.")
    # Blocage si le collaborateur n'est pas sur site (OFF, congé, RTT, école…)
    uid = current_user()
    _today_sched = await db.schedules.find_one({"employee_id": uid, "day": today}, {"_id": 0})
    if _today_sched and (_today_sched.get("type") or "").lower() == "school":
        raise HTTPException(400, "Commande impossible : vous êtes en journée d'école aujourd'hui.")
    # Hydrate items
    line_items: list[dict] = []
    total_points = 0
    total_eur = 0.0
    pickup_point = payload.pickup_point
    for it in payload.items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, f"Product {it.product_id} not found")
        # Pickup point follows the product's store (single-store cart enforced)
        pickup_point = p["store"]
        sub_pts = p["points"] * it.quantity
        sub_eur = p["price_eur"] * it.quantity
        line_items.append({
            "product_id": p["id"],
            "name": p["name"],
            "image": p["image"],
            "store": p["store"],
            "quantity": it.quantity,
            "points": p["points"],
            "price_eur": p["price_eur"],
            "subtotal_points": sub_pts,
            "subtotal_eur": sub_eur,
        })
        total_points += sub_pts
        total_eur += sub_eur

    # Soccer Bar : dining_mode obligatoire (sur place ou à emporter)
    dining_mode = (payload.dining_mode or "").lower() if payload.dining_mode else None
    if pickup_point == "soccer_bar":
        if dining_mode not in ("dine_in", "takeaway"):
            raise HTTPException(400, "Choisissez « Sur place » ou « À emporter » pour le Soccer Bar.")
    else:
        dining_mode = None  # ignore hors Soccer Bar

    # Compute meal points balance
    info = await meal_points_today()
    remaining = info["remaining"]
    points_used = min(remaining, total_points)
    # Split: consume birthday bonus first, then daily quota
    bb = info.get("birthday_bonus")
    bonus_pool = bb["remaining"] if bb else 0
    points_bonus = min(bonus_pool, points_used)
    points_daily = points_used - points_bonus
    points_left_to_pay = max(0, total_points - points_used)
    surcharge_eur = round(points_left_to_pay * (total_eur / total_points) if total_points else 0, 2)

    order_id = _id()
    order = {
        "id": order_id,
        "employee_id": current_user(),
        "items": line_items,
        "total_points": total_points,
        "points_used": points_used,
        "points_used_bonus": points_bonus,
        "points_used_daily": points_daily,
        "surcharge_eur": surcharge_eur,
        "pickup_point": pickup_point,
        "pickup_date": payload.pickup_date,
        "pickup_time": payload.pickup_time,
        "dining_mode": dining_mode,
        "qr_code": f"MSPARK-ORDER-{order_id[:8].upper()}",
        "status": "preparing",
        "created_at": _now(),
    }
    await db.orders.insert_one(order.copy())
    # Record transaction (split fields so meal_points_today can display it accurately)
    if points_used > 0:
        await db.meal_tx.insert_one({
            "id": _id(),
            "employee_id": current_user(),
            "ts": _now(),
            "points_spent": points_used,
            "points_daily": points_daily,
            "points_bonus": points_bonus,
            "surcharge_eur": surcharge_eur,
            "location": payload.pickup_point,
            "items": [{"name": li["name"], "quantity": li["quantity"]} for li in line_items],
            "order_id": order_id,
        })
        # Decrement birthday bonus balance
        if points_bonus > 0:
            await db.employees.update_one(
                {"id": current_user()},
                {"$inc": {"birthday_bonus.spent": points_bonus}},
            )
    return await _strip(order)


@api.get("/orders")
async def list_orders():
    items = await db.orders.find(
        {"employee_id": current_user()}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    # Auto-evolve status: preparing → ready after 5min from creation
    now = datetime.now(timezone.utc)
    for it in items:
        if it.get("status") == "preparing":
            try:
                created = datetime.fromisoformat(it["created_at"])
                if (now - created).total_seconds() >= 300:  # 5 minutes
                    await db.orders.update_one({"id": it["id"]}, {"$set": {"status": "ready", "ready_notified": True}})
                    it["status"] = "ready"
                    # Notif → l'employé sait que sa commande est prête à retirer
                    store_label = {
                        "soccer_bar": "Soccer Bar",
                        "donut_house": "Donut House",
                        "stand_crepes": "Stand Crêpes",
                        "stand_bonbons": "Stand Bonbons",
                    }.get(it.get("pickup_point"), it.get("pickup_point"))
                    await _push_notification(
                        employee_id=it["employee_id"],
                        type="order",
                        title="🍽️ Votre commande est prête !",
                        content=f"Votre commande #{it.get('qr_code','')[-6:]} est prête à être retirée · {store_label}",
                        icon="check-circle",
                        link="/restauration?tab=orders",
                    )
            except Exception:
                pass
    return items


@api.post("/orders/{oid}/pickup")
async def mark_pickup(oid: str):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Order not found")
    await db.orders.update_one(
        {"id": oid},
        {"$set": {"status": "picked_up", "picked_up_at": _now()}},
    )
    return {"ok": True}


@api.post("/orders/{oid}/cancel")
async def cancel_order(oid: str):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Order not found")
    # Refund points
    if order.get("points_used", 0) > 0 and order.get("status") != "picked_up":
        today = date.today().isoformat()
        # Find related meal_tx and remove it
        await db.meal_tx.delete_many({"order_id": oid})
    await db.orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


# ─── Posts
async def _dispatch_scheduled_posts():
    """Send broadcast notifications for scheduled posts whose publish_at just
    passed. Idempotent — flag `scheduled_broadcast_sent` prevents double-sending."""
    now_iso = _now()
    due = await db.posts.find(
        {"publish_at": {"$ne": None, "$lte": now_iso},
         "$or": [{"scheduled_broadcast_sent": {"$exists": False}}, {"scheduled_broadcast_sent": False}]},
        {"_id": 0},
    ).to_list(100)
    for p in due:
        author = await db.employees.find_one({"id": p.get("author_id")}, {"_id": 0}) or {}
        me_name = f"{author.get('first_name', '')} {author.get('last_name', '')}".strip() or "MS Park"
        await _broadcast_notification(
            type="post",
            title="Nouvelle publication",
            content=f"{me_name} a publié : {p.get('title', '')}",
            icon="megaphone",
            link=f"/actualites/{p['id']}",
            exclude_ids=[p.get("author_id")] if p.get("author_id") else [],
        )
        await db.posts.update_one({"id": p["id"]}, {"$set": {"scheduled_broadcast_sent": True}})


async def _newsletter_recipients(n: dict) -> list[str]:
    """Return the list of employee ids matching the newsletter's target
    statuses. Empty target_statuses = every active employee."""
    statuses = n.get("recipient_statuses") or []
    query = {}
    if statuses:
        query["statuses"] = {"$in": statuses}
    emps = await db.employees.find(query, {"_id": 0, "id": 1}).to_list(500)
    return [e["id"] for e in emps]


def _user_matches_audience(user: dict, targets: list | None) -> bool:
    """Single source of truth for audience-targeting checks used across every
    module (carousel, news, events, forms, newsletters, documents, benefits).

    Rules:
    - Empty `targets` (or None) → visible to everyone (unrestricted).
    - `targets` contains "all" → visible to everyone.
    - Otherwise: the user must have at least one of their `statuses` in the
      targets list. Author of the content is always allowed to see it.
    - NO admin bypass — an admin who isn't in the target group cannot view
      the content on public endpoints. Admins manage restricted content
      through the Administration space (which uses admin endpoints without
      the audience filter).
    """
    if not targets:
        return True
    if "all" in targets:
        return True
    user_statuses = set(user.get("statuses") or [])
    return bool(user_statuses & set(targets))


async def _dispatch_scheduled_newsletters():
    """Send scheduled newsletters whose publish_at is reached.
    Only notifies employees matching the recipient_statuses filter."""
    now_iso = _now()
    due = await db.newsletters.find(
        {"published": True, "archived": False, "publish_at": {"$ne": None, "$lte": now_iso},
         "$or": [{"scheduled_broadcast_sent": {"$exists": False}}, {"scheduled_broadcast_sent": False}]},
        {"_id": 0},
    ).to_list(100)
    for n in due:
        recipient_ids = await _newsletter_recipients(n)
        for rid in recipient_ids:
            if rid == n.get("author_id"):
                continue
            await _push_notification(
                employee_id=rid,
                type="news",
                title=f"Nouvelle newsletter · {n.get('title', '')}",
                content=n.get("preheader") or n.get("subject") or "",
                icon="megaphone",
                link=f"/newsletters/{n['id']}",
            )
        await db.newsletters.update_one(
            {"id": n["id"]},
            {"$set": {
                "scheduled_broadcast_sent": True,
                "recipient_count": len(recipient_ids),
                "sent_at": now_iso,
            }},
        )


@api.get("/posts")
async def list_posts():
    # Fire any scheduled broadcast whose time has come, so employees see the
    # publication AND the notification within seconds of the scheduled moment.
    await _dispatch_scheduled_posts()
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    items = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    # Filter out scheduled posts whose publish_at is still in the future,
    # except for the author (so they see their own drafts) and admins.
    now_iso = _now()
    is_admin = me.get("is_admin") or me.get("can_manage_communication")
    visible: list[dict] = []
    for p in items:
        pub = p.get("publish_at")
        if pub and pub > now_iso:
            if not is_admin and p.get("author_id") != me.get("id"):
                continue
            p["is_scheduled"] = True
        else:
            p["is_scheduled"] = False
        # Audience filtering — strict, no admin bypass. Author sees their own.
        if p.get("author_id") != me.get("id") and not _user_matches_audience(me, p.get("audience_status_targets")):
            continue
        visible.append(p)
    return visible[:50]


@api.post("/posts")
async def create_post(payload: PostCreate):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not _has_permission(me, "publish_news", "edit_news") and not (me and me.get("can_manage_communication")):
        raise HTTPException(403, "Seuls les administrateurs et responsables communication peuvent publier sur le fil")
    # Communication editors always post under the official MS Park identity
    posted_as = payload.posted_as or "personal"
    if not me.get("is_admin") and me.get("can_manage_communication"):
        posted_as = "official"
    now_iso = _now()
    publish_at = (payload.publish_at or "").strip() or None
    p = {
        "id": _id(),
        "author_id": current_user(),
        "title": payload.title.strip() or "Sans titre",
        "category": payload.category or "annonce",
        "content": payload.content,
        "image": payload.image,
        "images": payload.images or ([payload.image] if payload.image else []),
        "attachments": payload.attachments or [],
        "links": payload.links or [],
        "hashtags": payload.hashtags or [],
        "posted_as": posted_as,
        "publish_at": publish_at,
        "audience_status_targets": payload.audience_status_targets or [],
        "likes": [],
        "comments": [],
        "created_at": now_iso,
    }
    await db.posts.insert_one(p.copy())
    # Broadcast notification to every other employee (skip when the post is
    # scheduled — notification will be sent later by the scheduler tick).
    is_future = bool(publish_at and publish_at > now_iso)
    if not is_future:
        me_name = f"{me.get('first_name', '')} {me.get('last_name', '')}".strip() or "MS Park"
        targets = payload.audience_status_targets or []
        if targets:
            # Only notify employees whose statuses intersect the targets
            audience = await db.employees.find(
                {"statuses": {"$in": targets}, "id": {"$ne": current_user()}},
                {"_id": 0, "id": 1},
            ).to_list(1000)
            for e in audience:
                await _push_notification(
                    employee_id=e["id"],
                    type="post",
                    title="Nouvelle publication",
                    content=f"{me_name} a publié : {p['title']}",
                    icon="megaphone",
                    link=f"/actualites/{p['id']}",
                )
        else:
            await _broadcast_notification(
                type="post",
                title="Nouvelle publication",
                content=f"{me_name} a publié : {p['title']}",
                icon="megaphone",
                link=f"/actualites/{p['id']}",
                exclude_ids=[current_user()],
            )
    return await _strip(p)


@api.get("/posts/{post_id}")
async def get_post(post_id: str):
    """Public read of a single post — used by `/actualites/:id` detail page.
    Strict audience filtering: 404 if the current user isn't in the target
    groups (returned as 404 instead of 403 to avoid leaking existence)."""
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Publication introuvable")
    pub = p.get("publish_at")
    if pub and pub > _now():
        is_admin = me.get("is_admin") or me.get("can_manage_communication")
        if not is_admin and p.get("author_id") != me.get("id"):
            raise HTTPException(404, "Publication introuvable")
        p["is_scheduled"] = True
    else:
        p["is_scheduled"] = False
    # Audience gate — 404 for non-matching users (also blocks direct-URL access)
    if p.get("author_id") != me.get("id") and not _user_matches_audience(me, p.get("audience_status_targets")):
        raise HTTPException(404, "Publication introuvable")
    return p


class PostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    image: Optional[str] = None
    images: Optional[List[str]] = None
    attachments: Optional[List[dict]] = None
    links: Optional[List[str]] = None
    publish_at: Optional[str] = None


@api.put("/posts/{post_id}")
async def update_post(post_id: str, payload: PostUpdate):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me:
        raise HTTPException(403, "Accès refusé")
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Publication introuvable")
    # Edit rules:
    #  - Author always can edit their own post
    #  - Admin / Communication editors can ONLY edit official MS Park posts
    #    (posts made by any author but posted_as == "official"). They cannot
    #    edit other employees' personal posts (they may delete them though).
    is_author = p.get("author_id") == me["id"]
    is_official = p.get("posted_as") == "official"
    can_edit_official = is_official and (me.get("is_admin") or me.get("can_manage_communication"))
    if not is_author and not can_edit_official:
        raise HTTPException(403, "Vous pouvez uniquement modifier vos publications ou celles publiées au nom de MS Park")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        updates["edited_at"] = _now()
        await db.posts.update_one({"id": post_id}, {"$set": updates})
    item = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return item


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me:
        raise HTTPException(403, "Accès refusé")
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        return {"ok": True}
    is_author = p.get("author_id") == me["id"]
    if not is_author and not (me.get("is_admin") or me.get("can_manage_communication")):
        raise HTTPException(403, "Vous ne pouvez supprimer que vos propres publications")
    await db.posts.delete_one({"id": post_id})
    return {"ok": True}


@api.post("/posts/{post_id}/like")
async def toggle_like(post_id: str):
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(404, "Post not found")
    likes = set(p.get("likes", []))
    if current_user() in likes:
        likes.discard(current_user())
    else:
        likes.add(current_user())
    await db.posts.update_one({"id": post_id}, {"$set": {"likes": list(likes)}})
    return {"likes": list(likes)}


@api.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, payload: CommentCreate):
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(404, "Post not found")
    comment = {
        "id": _id(),
        "author_id": current_user(),
        "content": payload.content,
        "created_at": _now(),
        "likes": [],
        "replies": [],
    }
    if payload.parent_id:
        # Reply to an existing comment — push into the parent's replies array
        # We use array filters to target the correct comment in place.
        r = await db.posts.update_one(
            {"id": post_id, "comments.id": payload.parent_id},
            {"$push": {"comments.$.replies": comment}},
        )
        if r.matched_count == 0:
            raise HTTPException(404, "Commentaire parent introuvable")
        # Notify parent comment author (if not self)
        parent = next((c for c in p.get("comments") or [] if c.get("id") == payload.parent_id), None)
        if parent and parent.get("author_id") and parent["author_id"] != current_user():
            await _push_notification(
                employee_id=parent["author_id"],
                type="post",
                title="💬 Nouvelle réponse à votre commentaire",
                content=(payload.content or "")[:140],
                icon="message-circle",
                link=f"/actualites/{post_id}",
            )
    else:
        await db.posts.update_one({"id": post_id}, {"$push": {"comments": comment}})
    return comment


@api.post("/posts/{post_id}/comments/{comment_id}/like")
async def toggle_comment_like(post_id: str, comment_id: str):
    """Toggle like sur un commentaire ou une réponse. Cherche d'abord dans
    `comments`, puis dans `comments.replies` si non trouvé."""
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Post not found")
    uid = current_user()
    comments = p.get("comments") or []
    found = False
    for c in comments:
        if c.get("id") == comment_id:
            likes = set(c.get("likes") or [])
            if uid in likes:
                likes.discard(uid)
            else:
                likes.add(uid)
            c["likes"] = list(likes)
            found = True
            break
        for r in c.get("replies") or []:
            if r.get("id") == comment_id:
                likes = set(r.get("likes") or [])
                if uid in likes:
                    likes.discard(uid)
                else:
                    likes.add(uid)
                r["likes"] = list(likes)
                found = True
                break
        if found:
            break
    if not found:
        raise HTTPException(404, "Commentaire introuvable")
    await db.posts.update_one({"id": post_id}, {"$set": {"comments": comments}})
    return {"ok": True}


# ─── Requests
@api.get("/requests")
async def list_requests(status: Optional[str] = None):
    q = {"employee_id": current_user()}
    if status:
        q["status"] = status
    items = await db.requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@api.post("/requests")
async def create_request(payload: RequestCreate):
    r = {
        "id": _id(),
        "employee_id": current_user(),
        "type": payload.type,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "comment": payload.comment or "",
        "amount": payload.amount,
        "status": "pending",
        "created_at": _now(),
        "decided_at": None,
    }
    await db.requests.insert_one(r.copy())
    return await _strip(r)


@api.post("/requests/{rid}/cancel")
async def cancel_request(rid: str):
    """Employee cancels their own pending or approved request as long as start_date is in the future."""
    r = await db.requests.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Demande introuvable")
    if r["employee_id"] != current_user():
        raise HTTPException(403, "Vous ne pouvez annuler que vos propres demandes")
    if r["status"] not in ("pending", "approved"):
        raise HTTPException(400, "Seules les demandes en attente ou validées peuvent être annulées")
    # Only allow if start date not yet passed
    try:
        sdate = date.fromisoformat(r["start_date"])
    except Exception:
        sdate = date.today()
    if sdate <= date.today():
        raise HTTPException(400, "La date de début est passée — annulation impossible")

    # Refund logic: if approved, delete the schedule entries created and credit back balance
    was_approved = r["status"] == "approved"
    req_type = r.get("type")
    # Approval accepts both aliases 'conge' and 'cp' for paid leave
    is_paid_leave = req_type in ("conge", "cp")
    is_rtt = req_type == "rtt"
    if was_approved and (is_paid_leave or is_rtt):
        # Approval writes CP entries as type 'leave' and RTT as 'rtt'
        sched_type = "leave" if is_paid_leave else "rtt"
        deleted = await db.schedules.delete_many({
            "employee_id": r["employee_id"],
            "type": sched_type,
            "day": {"$gte": r["start_date"], "$lte": r.get("end_date") or r["start_date"]},
        })
        # Credit back the balance
        days_back = float(r.get("days_consumed") or deleted.deleted_count)
        emp = await db.employees.find_one({"id": r["employee_id"]}, {"_id": 0})
        if emp and days_back > 0:
            bal = dict(emp.get("leave_balance") or {})
            if is_paid_leave:
                # Credit to CP N (current year) — simplest
                bal["cp_n"] = round(float(bal.get("cp_n", 0)) + days_back, 1)
            else:
                bal["rtt"] = round(float(bal.get("rtt", 0)) + days_back, 1)
            await db.employees.update_one(
                {"id": r["employee_id"]}, {"$set": {"leave_balance": bal}}
            )

    await db.requests.update_one(
        {"id": rid},
        {"$set": {"status": "cancelled", "decided_at": _now()}},
    )
    return {"ok": True, "refunded_days": r.get("days_consumed") if was_approved else 0}


# ─── Documents
@api.get("/documents")
async def list_documents(category: Optional[str] = None):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    q = {"category": category} if category else {}
    # Filter: docs assigned to me OR global (target_employee_id null/all)
    q["$or"] = [
        {"target_employee_id": current_user()},
        {"target_employee_id": None},
        {"target_employee_id": "all"},
        {"target_employee_id": {"$exists": False}},
    ]
    items = await db.documents.find(q, {"_id": 0}).sort("issued_at", -1).to_list(200)
    # Audience gate — strict (no admin bypass) so a doc restricted to a status
    # group is truly invisible to everyone else.
    return [d for d in items if _user_matches_audience(me, d.get("audience_status_targets"))]


# ═══════════════════════════════════════════════════════════════════
# Payslip generator (fake but realistic French "fiche de paie")
# ═══════════════════════════════════════════════════════════════════
_FR_MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
              "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]


def _generate_payslip(emp: dict, year: int, month: int) -> dict:
    """Build a realistic French payslip payload.
    Priorities user-defined salary/hourly rate fields over hard-coded defaults."""
    contract_h = emp.get("contract_hours_weekly") or 35
    monthly_h = round(contract_h * 4.33, 2)
    # Use the user's declared hourly rate if defined; otherwise derive from
    # gross_salary or fall back to a category-based estimate.
    hourly = emp.get("hourly_rate")
    if not hourly and emp.get("gross_salary"):
        try:
            hourly = round(float(emp["gross_salary"]) / max(monthly_h, 1), 2)
        except (TypeError, ValueError):
            hourly = None
    if not hourly:
        if emp.get("role_category") == "encadrement":
            hourly = 21.50
        elif emp.get("role_category") == "restauration":
            hourly = 13.20
        else:
            hourly = 12.85  # SMIC + prime
    gross = emp.get("gross_salary") or round(monthly_h * hourly, 2)
    gross = round(float(gross), 2)
    # Cotisations approximatives salariales ~22%
    csg_crds = round(gross * 0.0975, 2)
    retraite = round(gross * 0.0765, 2)
    maladie = round(gross * 0.0075, 2)
    chomage = round(gross * 0.019, 2)
    complementaire = round(gross * 0.037, 2)
    total_deductions = round(csg_crds + retraite + maladie + chomage + complementaire, 2)
    net = round(gross - total_deductions, 2)
    net_imposable = round(net + csg_crds * 0.29, 2)  # part non déductible
    prelevement = round(net_imposable * 0.03, 2)
    net_a_payer = round(net - prelevement, 2)

    return {
        "employee": {
            "id": emp["id"],
            "first_name": emp["first_name"],
            "last_name": emp["last_name"],
            "role": emp["role"],
            "badge_number": emp.get("badge_number"),
            "address": emp.get("address"),
            "seniority_months": emp.get("seniority_months", 0),
        },
        "employer": {
            "name": "MS PARK SAS",
            "address": "Zone Parc, 92350 Le Plessis-Robinson",
            "siret": "812 456 789 00021",
            "ape": "9321Z",
            "convention": "Convention Collective HCR – Espaces de loisirs, d'attractions et culturels (IDCC 1790)",
        },
        "period": {
            "month": month,
            "year": year,
            "label": f"{_FR_MONTHS[month - 1]} {year}",
            "from": date(year, month, 1).isoformat(),
            "to": date(year, month, 28).isoformat(),
        },
        "worked": {
            "contract_hours_weekly": contract_h,
            "monthly_hours": monthly_h,
            "hourly_rate": hourly,
        },
        "lines_gross": [
            {"label": "Salaire de base", "base": monthly_h, "rate": hourly, "amount": gross},
        ],
        "lines_deductions": [
            {"label": "CSG déductible / non déductible + CRDS", "rate": 9.75, "amount": csg_crds},
            {"label": "Retraite sécurité sociale + complémentaire", "rate": 7.65, "amount": retraite},
            {"label": "Assurance maladie", "rate": 0.75, "amount": maladie},
            {"label": "Assurance chômage", "rate": 1.9, "amount": chomage},
            {"label": "Retraite complémentaire ARRCO/AGIRC", "rate": 3.7, "amount": complementaire},
        ],
        "totals": {
            "gross": gross,
            "deductions": total_deductions,
            "net_before_tax": net,
            "net_imposable": net_imposable,
            "prelevement_source": prelevement,
            "net_a_payer": net_a_payer,
        },
        "generated_at": _now(),
    }


@api.get("/payslip/{employee_id}/{year}/{month}")
async def get_payslip(employee_id: str, year: int, month: int):
    """Employee can access own payslip; admins and users with view_payslips can access any."""
    if employee_id != current_user():
        me_doc = await db.employees.find_one({"id": current_user()}, {"_id": 0})
        if not _has_permission(me_doc, "view_payslips", "manage_documents"):
            raise HTTPException(403, "Accès refusé")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    if year < 2020 or year > 2100 or month < 1 or month > 12:
        raise HTTPException(400, "Période invalide")
    return _generate_payslip(emp, year, month)


class DocumentCreate(BaseModel):
    name: str
    category: str  # Paie | Contrats | Règlements | Sécurité | Planning | Attestations | Autre
    url: Optional[str] = None
    target_employee_id: Optional[str] = None  # None or "all" = broadcast
    description: Optional[str] = None
    size_kb: Optional[int] = 100


@api.post("/admin/documents")
async def admin_create_document(payload: DocumentCreate):
    await require_permission("manage_documents", "publish_documents")
    doc = {
        "id": _id(),
        "name": payload.name,
        "category": payload.category,
        "url": payload.url,
        "description": payload.description,
        "target_employee_id": payload.target_employee_id or "all",
        "issued_at": _now()[:10],
        "size_kb": payload.size_kb or 100,
        "read": False,
    }
    await db.documents.insert_one(doc.copy())
    # Notify employee(s)
    targets = []
    if payload.target_employee_id and payload.target_employee_id != "all":
        targets = [payload.target_employee_id]
    else:
        emps = await db.employees.find({}, {"_id": 0}).to_list(500)
        targets = [e["id"] for e in emps]
    for tid in targets:
        await db.notifications.insert_one({
            "id": _id(),
            "employee_id": tid,
            "type": "document",
            "title": "Nouveau document RH",
            "content": f"{payload.name} — disponible dans Documents RH.",
            "message": f"{payload.name} — disponible dans Documents RH.",
            "icon": "file-text",
            "link": "/documents",
            "ts": _now(),
            "created_at": _now(),
            "read": False,
        })
    return doc


class PayslipGenerate(BaseModel):
    employee_id: str
    year: int
    month: int


# ═══════════════════════════════════════════════════════════════════
# Full payslip management (drafts, custom lines, sending)
# ═══════════════════════════════════════════════════════════════════
class PayslipLine(BaseModel):
    label: str
    kind: str = "auto"  # auto | overtime | premium | indemnity | deduction
    base: Optional[float] = None
    rate: Optional[float] = None
    amount: float = 0.0


class PayslipPayload(BaseModel):
    employee_id: str
    year: int
    month: int
    period_from: Optional[str] = None
    period_to: Optional[str] = None
    payment_date: Optional[str] = None
    base_hours: Optional[float] = None
    hourly_rate: Optional[float] = None
    lines: List[PayslipLine] = []  # gross-side lines (base + HS + primes + indemnités)
    deductions: List[PayslipLine] = []  # explicit deductions overriding the auto ~22%
    attachments: List[dict] = []
    message_subject: Optional[str] = ""
    message_body: Optional[str] = ""
    status: Optional[str] = "draft"  # draft | pending | sent


def _compute_payslip_totals(p: dict) -> dict:
    """Sum gross lines, apply auto ~22% deductions unless overridden, compute net."""
    gross = sum((l.get("amount") or 0) for l in (p.get("lines") or []))
    deductions_lines = p.get("deductions") or []
    if not deductions_lines:
        # auto ~22 % breakdown
        deductions_lines = [
            {"label": "Sécurité sociale", "rate": 15.0, "amount": round(gross * 0.15, 2)},
            {"label": "Retraite complémentaire", "rate": 4.0, "amount": round(gross * 0.04, 2)},
            {"label": "Prévoyance", "rate": 2.0, "amount": round(gross * 0.02, 2)},
            {"label": "Autres cotisations", "rate": 1.0, "amount": round(gross * 0.01, 2)},
        ]
    total_deductions = round(sum((l.get("amount") or 0) for l in deductions_lines), 2)
    net = round(gross - total_deductions, 2)
    return {
        "gross": round(gross, 2),
        "deductions_lines": deductions_lines,
        "total_deductions": total_deductions,
        "net": net,
    }


@api.get("/admin/payslips")
async def admin_list_payslips(month: Optional[str] = None, status: Optional[str] = None):
    """List all payslips. `month` = YYYY-MM filter."""
    await require_permission("view_payslips", "manage_documents")
    q: dict = {}
    if month:
        try:
            y, m = month.split("-")
            q["year"] = int(y); q["month"] = int(m)
        except Exception:
            raise HTTPException(400, "Format `month` attendu : YYYY-MM")
    if status:
        q["status"] = status
    items = await db.payslips.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Attach employee snapshot
    emp_ids = list({p["employee_id"] for p in items})
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0})}
    for p in items:
        e = emps.get(p["employee_id"], {})
        p["employee_snapshot"] = {
            "first_name": e.get("first_name"),
            "last_name": e.get("last_name"),
            "avatar": e.get("avatar"),
            "role": e.get("role"),
            "department": e.get("department"),
            "badge_number": e.get("badge_number"),
        }
    return items


@api.get("/admin/payslips/stats")
async def admin_payslip_stats(month: Optional[str] = None):
    """Aggregate counters for the KPI cards."""
    await require_permission("view_payslips", "manage_documents")
    q: dict = {}
    if month:
        try:
            y, m = month.split("-")
            q["year"] = int(y); q["month"] = int(m)
        except Exception:
            raise HTTPException(400, "Format `month` attendu : YYYY-MM")
    items = await db.payslips.find(q, {"_id": 0}).to_list(500)
    return {
        "total": len(items),
        "employees": len({p["employee_id"] for p in items}),
        "sent": sum(1 for p in items if p.get("status") == "sent"),
        "pending": sum(1 for p in items if p.get("status") in ("pending", "draft")),
    }


@api.get("/admin/payslips/{pid}")
async def admin_get_payslip(pid: str):
    await require_permission("view_payslips", "manage_documents")
    p = await db.payslips.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Fiche introuvable")
    emp = await db.employees.find_one({"id": p["employee_id"]}, {"_id": 0}) or {}
    p["employee_snapshot"] = {
        "first_name": emp.get("first_name"), "last_name": emp.get("last_name"),
        "avatar": emp.get("avatar"), "role": emp.get("role"),
        "department": emp.get("department"), "badge_number": emp.get("badge_number"),
        "personal_email": emp.get("personal_email") or emp.get("email"),
        "hire_date": emp.get("hire_date"),
    }
    return p


def _resolve_pay_basis(emp: dict, override_hours: Optional[float] = None,
                      override_hourly: Optional[float] = None) -> tuple[float, float]:
    """Return (contract_hours_weekly, hourly_rate) preferring the user's
    declared HR fields (contract_hours_weekly, hourly_rate, gross_salary)
    over category-based defaults. Overrides win when provided."""
    contract_h = override_hours or emp.get("contract_hours_weekly") or 35
    monthly_h = round(contract_h * 4.33, 2)
    hourly = override_hourly or emp.get("hourly_rate")
    if not hourly and emp.get("gross_salary"):
        try:
            hourly = round(float(emp["gross_salary"]) / max(monthly_h, 1), 2)
        except (TypeError, ValueError):
            hourly = None
    if not hourly:
        role_cat = emp.get("role_category")
        hourly = 21.50 if role_cat == "encadrement" else 13.20 if role_cat == "restauration" else 12.85
    return float(contract_h), float(hourly)


def _default_lines_for(emp: dict, contract_h: float, hourly: float) -> list[dict]:
    monthly_h = round(contract_h * 4.33, 2)
    return [{
        "label": "Salaire de base",
        "kind": "auto",
        "base": monthly_h,
        "rate": hourly,
        "amount": round(monthly_h * hourly, 2),
    }]


@api.post("/admin/payslips/preview")
async def admin_preview_payslip(payload: PayslipPayload):
    """Compute totals without persisting — used by the live preview panel."""
    await require_permission("view_payslips", "manage_documents")
    doc = payload.model_dump()
    if not doc.get("lines"):
        emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0}) or {}
        contract_h, hourly = _resolve_pay_basis(emp, payload.base_hours, payload.hourly_rate)
        doc["base_hours"] = contract_h
        doc["hourly_rate"] = hourly
        doc["lines"] = _default_lines_for(emp, contract_h, hourly)
    return {**doc, "totals": _compute_payslip_totals(doc)}


@api.post("/admin/payslips")
async def admin_create_payslip(payload: PayslipPayload):
    await require_permission("view_payslips", "manage_documents")
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    # Prevent duplicate month for the same employee (draft still allowed)
    existing = await db.payslips.find_one({
        "employee_id": payload.employee_id, "year": payload.year, "month": payload.month,
        "status": "sent",
    })
    if existing:
        raise HTTPException(400, f"Une fiche de paie a déjà été envoyée à {emp.get('first_name','')} pour cette période.")
    contract_h, hourly = _resolve_pay_basis(emp, payload.base_hours, payload.hourly_rate)
    doc = payload.model_dump()
    if not doc["lines"]:
        doc["lines"] = _default_lines_for(emp, contract_h, hourly)
    doc["base_hours"] = contract_h
    doc["hourly_rate"] = hourly
    if not doc.get("period_from"):
        doc["period_from"] = date(payload.year, payload.month, 1).isoformat()
    if not doc.get("period_to"):
        # last day of the month
        if payload.month == 12:
            last = date(payload.year + 1, 1, 1) - timedelta(days=1)
        else:
            last = date(payload.year, payload.month + 1, 1) - timedelta(days=1)
        doc["period_to"] = last.isoformat()
    if not doc.get("payment_date"):
        doc["payment_date"] = doc["period_to"]
    doc["id"] = _id()
    doc["status"] = doc.get("status") or "draft"
    doc["created_at"] = _now()
    totals = _compute_payslip_totals(doc)
    doc["totals"] = totals
    await db.payslips.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.put("/admin/payslips/{pid}")
async def admin_update_payslip(pid: str, payload: PayslipPayload):
    await require_permission("view_payslips", "manage_documents")
    p = await db.payslips.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Fiche introuvable")
    if p.get("status") == "sent":
        raise HTTPException(400, "Impossible de modifier une fiche déjà envoyée.")
    upd = payload.model_dump()
    if not upd["lines"]:
        upd["lines"] = p.get("lines") or []
    upd["totals"] = _compute_payslip_totals(upd)
    upd["updated_at"] = _now()
    await db.payslips.update_one({"id": pid}, {"$set": upd})
    return await db.payslips.find_one({"id": pid}, {"_id": 0})


@api.delete("/admin/payslips/{pid}")
async def admin_delete_payslip(pid: str):
    await require_permission("view_payslips", "manage_documents")
    p = await db.payslips.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Fiche introuvable")
    if p.get("status") == "sent":
        # Also remove the linked document from the employee's Documents.
        await db.documents.delete_many({"payslip_id": pid})
    await db.payslips.delete_one({"id": pid})
    return {"ok": True}


@api.post("/admin/payslips/{pid}/send")
async def admin_send_payslip(pid: str):
    """Mark payslip as sent and publish it as a Document to the employee."""
    await require_permission("view_payslips", "manage_documents")
    p = await db.payslips.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Fiche introuvable")
    if p.get("status") == "sent":
        return p
    emp = await db.employees.find_one({"id": p["employee_id"]}, {"_id": 0}) or {}
    label = f"{_FR_MONTHS[p['month'] - 1]} {p['year']}"
    now_iso = _now()
    await db.payslips.update_one({"id": pid}, {"$set": {
        "status": "sent",
        "sent_at": now_iso,
    }})
    # Publish as a Document visible in the employee's /documents page.
    doc = {
        "id": _id(),
        "name": f"Fiche de paie — {label}",
        "category": "Paie",
        "url": f"/documents/payslip/{p['employee_id']}/{p['year']}/{p['month']}",
        "description": (p.get("message_subject") or f"Bulletin de salaire — {label}"),
        "target_employee_id": p["employee_id"],
        "issued_at": now_iso[:10],
        "size_kb": 248,
        "read": False,
        "is_payslip": True,
        "payslip_year": p["year"],
        "payslip_month": p["month"],
        "payslip_id": pid,
    }
    await db.documents.insert_one(doc.copy())

    # ─── Send a DM in Messagerie from the "Service RH" identity to the employee
    # (a persistent RH channel per employee, so all payroll DMs land in the same
    # thread over the months). Members = recipient + all RH staff. The admin
    # who hits the endpoint is NOT added (unless they are RH staff themselves)
    # so a non-RH admin never sees the payslip in their personal messagerie.
    rh_channel_id = f"rh-{p['employee_id']}"
    rh_staff = await _corporate_members("service-rh")
    all_members = list({p["employee_id"], *rh_staff})
    existing_ch = await db.channels.find_one({"id": rh_channel_id}, {"_id": 0})
    if not existing_ch:
        await db.channels.insert_one({
            "id": rh_channel_id,
            "name": "Service RH",
            "icon": "briefcase",
            "members": len(all_members),
            "members_ids": all_members,
            "unread": 1,
            "is_dm": False,
            "is_group": True,
            "is_official": True,
            "corporate_key": "service-rh",
            "archived": False,
            "avatar": None,
            "created_at": now_iso,
        })
    else:
        # Purge any non-RH member accidentally added by earlier versions
        # (typically the admin who hit the send endpoint but wasn't RH staff).
        allowed = set(all_members)
        cleaned = [m for m in (existing_ch.get("members_ids") or []) if m in allowed]
        merged = list({*cleaned, *all_members})
        await db.channels.update_one(
            {"id": rh_channel_id},
            {
                "$inc": {"unread": 1},
                "$set": {
                    "corporate_key": "service-rh",
                    "members_ids": merged,
                },
            },
        )

    payslip_link = f"/documents/payslip/{p['employee_id']}/{p['year']}/{p['month']}"
    msg_content = (
        (p.get("message_body") or "").strip()
        or f"Bonjour {emp.get('first_name', '')},\n\nVotre fiche de paie de {label} est disponible ci-dessous."
    )
    await db.messages.insert_one({
        "id": _id(),
        "channel_id": rh_channel_id,
        "author_id": "system-rh",
        "author_name": "Service RH",
        "content": msg_content,
        "attachments": [{
            "kind": "payslip",
            "name": f"Fiche de paie — {label}",
            "url": payslip_link,
            "payslip_id": pid,
        }],
        "ts": now_iso,
        "is_official": True,
    })

    await _push_notification(
        employee_id=p["employee_id"],
        type="document",
        title="Nouvelle fiche de paie",
        content=(p.get("message_subject") or f"Votre bulletin de {label} est disponible."),
        icon="file-text",
        link="/documents",
    )
    await _push_notification(
        employee_id=p["employee_id"],
        type="message",
        title="Service RH",
        content=f"Votre fiche de paie de {label} vous a été envoyée.",
        icon="briefcase",
        link=f"/messagerie?ch={rh_channel_id}",
    )
    return await db.payslips.find_one({"id": pid}, {"_id": 0})


@api.get("/payslips/mine")
async def list_my_payslips():
    """Return all payslips sent to the current employee."""
    items = await db.payslips.find(
        {"employee_id": current_user(), "status": "sent"}, {"_id": 0},
    ).sort("sent_at", -1).to_list(60)
    return items


@api.post("/admin/documents/payslip")
async def admin_generate_payslip_document(payload: PayslipGenerate):
    """Register a payslip document linked to the generator endpoint."""
    await require_permission("view_payslips", "manage_documents")
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    label = f"{_FR_MONTHS[payload.month - 1]} {payload.year}"
    doc = {
        "id": _id(),
        "name": f"Fiche de paie — {label}",
        "category": "Paie",
        "url": f"/api/payslip/{payload.employee_id}/{payload.year}/{payload.month}",
        "description": f"Bulletin de salaire — {label}",
        "target_employee_id": payload.employee_id,
        "issued_at": _now()[:10],
        "size_kb": 248,
        "read": False,
        "is_payslip": True,
        "payslip_year": payload.year,
        "payslip_month": payload.month,
    }
    await db.documents.insert_one(doc.copy())
    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": payload.employee_id,
        "type": "document",
        "title": "Nouvelle fiche de paie",
        "content": f"Votre bulletin de {label} est disponible.",
        "message": f"Votre bulletin de {label} est disponible.",
        "icon": "file-text",
        "link": "/documents",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return doc


@api.delete("/admin/documents/{did}")
async def admin_delete_document(did: str):
    await require_permission("manage_documents")
    await db.documents.delete_one({"id": did})
    return {"ok": True}


class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    url: Optional[str] = None
    target_employee_id: Optional[str] = None
    description: Optional[str] = None
    size_kb: Optional[int] = None


@api.put("/admin/documents/{did}")
async def admin_update_document(did: str, payload: DocumentUpdate):
    await require_permission("manage_documents", "publish_documents")
    existing = await db.documents.find_one({"id": did}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Document introuvable")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        return existing
    await db.documents.update_one({"id": did}, {"$set": updates})
    existing.update(updates)
    return existing


# ─── Admin: broadcast message on the #accueil channel (fil MS Park)
class ChannelBroadcast(BaseModel):
    content: str
    channel_id: Optional[str] = "ch-accueil"


@api.post("/admin/broadcast")
async def admin_broadcast(payload: ChannelBroadcast):
    me = await require_permission("publish_news")
    ch = await db.channels.find_one({"id": payload.channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Canal introuvable")
    msg = {
        "id": _id(),
        "channel_id": payload.channel_id,
        "author_id": me["id"],
        "content": payload.content,
        "ts": _now(),
        "attachments": [],
        "is_admin_broadcast": True,
    }
    await db.messages.insert_one(msg.copy())
    preview = (payload.content or "").strip()
    if len(preview) > 90:
        preview = preview[:87] + "…"
    await _broadcast_notification(
        type="message",
        title=f"Annonce sur #{ch.get('name', 'accueil')}",
        content=preview or "Nouveau message diffusé",
        icon="message-circle",
        link=f"/messagerie?channel={payload.channel_id}",
        exclude_ids=[me["id"]],
    )
    return msg


# ─── Notifications
_NOTIF_DEFAULT_LINKS = {
    "planning": "/rh/planning",
    "conge_valide": "/rh/demandes",
    "cp": "/rh/demandes",
    "rtt": "/rh/demandes",
    "conge": "/rh/demandes",
    "echange": "/rh/demandes",
    "absence": "/rh/demandes",
    "document": "/documents",
    "post": "/actualites",
    "news": "/actualites",
    "comment": "/actualites",
    "event": "/agenda",
    "message": "/messagerie",
    "form": "/management/formulaires",
}

_NOTIF_DEFAULT_ICONS = {
    "planning": "calendar",
    "conge_valide": "check-circle",
    "cp": "check-circle",
    "rtt": "check-circle",
    "conge": "check-circle",
    "echange": "check-circle",
    "absence": "check-circle",
    "document": "file-text",
    "post": "megaphone",
    "news": "megaphone",
    "comment": "message-circle",
    "event": "calendar",
    "message": "message-circle",
    "form": "file-text",
}


def _normalize_notif(n: dict) -> dict:
    n = dict(n)
    t = n.get("type") or ""
    if not n.get("content"):
        n["content"] = n.get("message") or ""
    if not n.get("icon"):
        n["icon"] = _NOTIF_DEFAULT_ICONS.get(t, "bell")
    if not n.get("link"):
        n["link"] = _NOTIF_DEFAULT_LINKS.get(t)
    return n


async def _ensure_ready_order_notifications() -> None:
    """Auto-évolue les commandes preparing → ready après 5 min, et pousse
    une notification à l'employé une seule fois (`ready_notified: True`).
    Appelé lazy à chaque `GET /notifications` pour que la notif arrive même
    si l'utilisateur ne rouvre pas la page Restauration."""
    now = datetime.now(timezone.utc)
    pending = await db.orders.find(
        {"status": "preparing", "ready_notified": {"$ne": True}},
        {"_id": 0},
    ).to_list(200)
    for it in pending:
        try:
            created = datetime.fromisoformat(it["created_at"])
            if (now - created).total_seconds() < 300:
                continue
            await db.orders.update_one(
                {"id": it["id"]}, {"$set": {"status": "ready", "ready_notified": True}}
            )
            store_label = {
                "soccer_bar": "Soccer Bar",
                "donut_house": "Donut House",
                "stand_crepes": "Stand Crêpes",
                "stand_bonbons": "Stand Bonbons",
            }.get(it.get("pickup_point"), it.get("pickup_point"))
            await _push_notification(
                employee_id=it["employee_id"],
                type="order",
                title="🍽️ Votre commande est prête !",
                content=f"Votre commande #{(it.get('qr_code') or '')[-6:]} est prête à être retirée · {store_label}",
                icon="check-circle",
                link="/restauration?tab=orders",
            )
        except Exception:
            pass


async def _ensure_daily_birthday_notifications() -> None:
    """Once per day, push a notification to every employee for each colleague
    whose birthday falls today. Idempotent — guarded by a `system_flags`
    marker `birthday_notified_{YYYY-MM-DD}` so multiple concurrent requests
    on the same day only trigger the broadcast once."""
    today = _now_paris().date()
    marker_key = f"birthday_notified_{today.isoformat()}"
    if await db.system_flags.find_one({"key": marker_key}):
        return
    # Insert marker EARLY so concurrent calls short-circuit on their next hit
    try:
        await db.system_flags.insert_one({"key": marker_key, "at": _now()})
    except Exception:
        # If unique index collides someone else grabbed it — abort silently
        return
    # Find every active employee celebrating today (same MM-DD)
    all_employees = await db.employees.find(
        {"birth_date": {"$ne": None}, "account_status": {"$ne": "disabled"}},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "birth_date": 1},
    ).to_list(500)
    mmdd = today.strftime("%m-%d")
    celebrants = [
        e for e in all_employees
        if (e.get("birth_date") or "")[5:10] == mmdd
    ]
    if not celebrants:
        return
    recipients = [e["id"] for e in all_employees]
    for celeb in celebrants:
        name = f"{celeb.get('first_name','')} {celeb.get('last_name','')}".strip()
        for uid in recipients:
            if uid == celeb["id"]:
                continue  # don't wish yourself
            try:
                await _push_notification(
                    employee_id=uid,
                    type="birthday",
                    title=f"🎂 Anniversaire de {name}",
                    content=f"C'est l'anniversaire de {name} aujourd'hui — pensez à lui souhaiter !",
                    icon="cake",
                    link="/anniversaires",
                )
            except Exception:
                pass


@api.get("/notifications")
async def list_notifications():
    # Fire the once-a-day birthday broadcast lazily: cheap early-exit when the
    # marker for today already exists, otherwise every employee currently
    # celebrating gets pushed to everyone else.
    try:
        await _ensure_daily_birthday_notifications()
    except Exception as _e:
        pass
    try:
        await _ensure_ready_order_notifications()
    except Exception as _e:
        pass
    items = await db.notifications.find(
        {"employee_id": current_user()}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    # Filter out stale "message" notifications pointing to channels that no
    # longer exist or where the user is no longer a member. Deep-links to a
    # deleted channel would otherwise 404 on click.
    filtered: list[dict] = []
    uid = current_user()
    for n in items:
        if n.get("type") == "message":
            link = n.get("link") or ""
            # Expected format: /messagerie?ch=<channel_id>
            ch_id = None
            if "ch=" in link:
                try:
                    ch_id = link.split("ch=", 1)[1].split("&", 1)[0]
                except Exception:
                    ch_id = None
            if ch_id:
                ch = await db.channels.find_one({"id": ch_id}, {"_id": 0})
                members = (ch or {}).get("members_ids") or (ch or {}).get("members") or []
                if not ch or uid not in members:
                    # Skip and best-effort clean up
                    try:
                        await db.notifications.delete_one({"id": n.get("id")})
                    except Exception:
                        pass
                    continue
        filtered.append(_normalize_notif(n))
    return filtered


@api.post("/notifications/{nid}/read")
async def read_notif(nid: str):
    await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/read-all")
async def read_all_notifs():
    await db.notifications.update_many(
        {"employee_id": current_user()}, {"$set": {"read": True}}
    )
    return {"ok": True}


# ─── Partners (Avantages / CSE)
def _partner_year() -> int:
    return date.today().year


async def _partner_usage(user_id: str, pid: str, year: Optional[int] = None) -> int:
    """Return the number of times a user has claimed/purchased a partner this year.
    - `code`/`discount` types → 1 per claim recorded in `partner_claims`.
    - `product` type → sum of qty in `cse_orders` for that partner this year.
    """
    year = year or _partner_year()
    partner = await db.partners.find_one({"id": pid}, {"_id": 0})
    if not partner:
        return 0
    if (partner.get("type") or "code") == "product":
        # Sum qty from confirmed orders this year
        start = f"{year}-01-01"
        end = f"{year + 1}-01-01"
        cursor = db.cse_orders.find(
            {"user_id": user_id, "created_at": {"$gte": start, "$lt": end}}, {"_id": 0}
        )
        total = 0
        async for o in cursor:
            for it in (o.get("items") or []):
                if it.get("partner_id") == pid:
                    total += int(it.get("qty") or 0)
        return total
    claim = await db.partner_claims.find_one(
        {"user_id": user_id, "partner_id": pid, "year": year}, {"_id": 0}
    )
    return int((claim or {}).get("qty") or 0)


async def _enrich_partner_for_user(p: dict, user_id: str) -> dict:
    limit = p.get("usage_limit")
    used = await _partner_usage(user_id, p["id"]) if limit else 0
    p["my_usage"] = used
    p["my_remaining"] = None if not limit else max(0, int(limit) - used)
    p["is_exhausted"] = bool(limit and used >= int(limit))
    return p


@api.get("/partners")
async def list_partners():
    items = await db.partners.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    uid = current_user()
    for p in items:
        await _enrich_partner_for_user(p, uid)
    return items


class PartnerPayload(BaseModel):
    name: str
    partner: Optional[str] = ""
    description: Optional[str] = ""
    image: Optional[str] = ""
    category: Optional[str] = "Loisirs"
    type: Optional[str] = "code"  # code | discount | product
    original_price: Optional[float] = None
    discount_price: Optional[float] = None
    discount_pct: Optional[int] = None
    discount: Optional[str] = ""  # display label (e.g. "-30%")
    promo_code: Optional[str] = ""
    qr_code: Optional[str] = ""  # legacy field used by user-facing card
    conditions: Optional[str] = ""
    valid_until: Optional[str] = ""
    usage_limit: Optional[int] = None  # max uses per employee per year (None = unlimited)


def _compute_partner_display(p: dict) -> dict:
    """Fill display fields (discount label, pct) from prices when possible."""
    ptype = p.get("type") or "code"
    orig = p.get("original_price")
    disc = p.get("discount_price")
    pct = p.get("discount_pct")
    if pct is None and orig and disc is not None and orig > 0:
        pct = max(0, round((float(orig) - float(disc)) / float(orig) * 100))
    p["discount_pct"] = pct
    if not p.get("discount"):
        if ptype == "product" and disc is not None:
            p["discount"] = f"{float(disc):.2f} €".replace(".", ",")
        elif pct:
            p["discount"] = f"-{pct}%"
        elif p.get("promo_code"):
            p["discount"] = "PROMO"
    # Keep legacy `qr_code` field mirroring promo_code so old UI still shows something
    if p.get("promo_code") and not p.get("qr_code"):
        p["qr_code"] = p["promo_code"]
    return p


@api.post("/admin/partners")
async def admin_create_partner(payload: PartnerPayload):
    await require_admin()
    p = payload.model_dump()
    p["id"] = _id()
    p["created_at"] = _now()
    _compute_partner_display(p)
    await db.partners.insert_one(p.copy())
    return p


@api.put("/admin/partners/{pid}")
async def admin_update_partner(pid: str, payload: PartnerPayload):
    await require_admin()
    existing = await db.partners.find_one({"id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Avantage introuvable")
    updated = {**existing, **payload.model_dump(exclude_unset=True)}
    _compute_partner_display(updated)
    await db.partners.update_one({"id": pid}, {"$set": updated})
    return updated


@api.delete("/admin/partners/{pid}")
async def admin_delete_partner(pid: str):
    await require_admin()
    res = await db.partners.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Avantage introuvable")
    return {"ok": True, "id": pid}


@api.post("/partners/{pid}/claim")
async def claim_partner_code(pid: str):
    """Register that the current user has claimed a code/discount partner.
    Enforces `usage_limit` per year. Returns the updated usage."""
    partner = await db.partners.find_one({"id": pid}, {"_id": 0})
    if not partner:
        raise HTTPException(404, "Avantage introuvable")
    if (partner.get("type") or "code") == "product":
        raise HTTPException(400, "Les produits se gèrent via le panier")
    uid = current_user()
    year = _partner_year()
    limit = partner.get("usage_limit")
    current = await _partner_usage(uid, pid, year)
    if limit and current >= int(limit):
        raise HTTPException(400, f"Vous avez déjà utilisé cet avantage ({limit}× par an maximum).")
    await db.partner_claims.update_one(
        {"user_id": uid, "partner_id": pid, "year": year},
        {"$inc": {"qty": 1}, "$set": {"user_id": uid, "partner_id": pid, "year": year, "ts": _now()}},
        upsert=True,
    )
    new_usage = current + 1
    return {
        "ok": True,
        "my_usage": new_usage,
        "my_remaining": None if not limit else max(0, int(limit) - new_usage),
        "is_exhausted": bool(limit and new_usage >= int(limit)),
    }


# ─── Orders (mini e-commerce for CSE products/tickets)
class OrderItem(BaseModel):
    partner_id: str
    name: str
    image: Optional[str] = ""
    unit_price: float
    unit_original: Optional[float] = None
    qty: int = 1


class OrderPayload(BaseModel):
    items: List[OrderItem]
    address: Optional[str] = ""
    payment_method: Optional[str] = "carte"
    email: Optional[str] = ""


@api.get("/cse/orders")
async def list_cse_orders():
    """Return current user's CSE product orders, most recent first."""
    items = await db.cse_orders.find(
        {"user_id": current_user()}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return items


@api.get("/cse/orders/{oid}")
async def get_cse_order(oid: str):
    """Return a single order for the current user (used by the e-ticket page)."""
    o = await db.cse_orders.find_one(
        {"id": oid, "user_id": current_user()}, {"_id": 0}
    )
    if not o:
        raise HTTPException(404, "Commande introuvable")
    return o


@api.post("/cse/orders")
async def create_cse_order(payload: OrderPayload):
    if not payload.items:
        raise HTTPException(400, "Panier vide")
    uid = current_user()
    year = _partner_year()

    # Aggregate qty per partner_id in the incoming cart
    incoming: dict[str, int] = {}
    for it in payload.items:
        incoming[it.partner_id] = incoming.get(it.partner_id, 0) + max(1, int(it.qty))

    # Enforce usage limits: current usage + new qty must not exceed usage_limit
    for pid, add_qty in incoming.items():
        partner = await db.partners.find_one({"id": pid}, {"_id": 0})
        if not partner:
            raise HTTPException(400, "Avantage introuvable dans le panier")
        limit = partner.get("usage_limit")
        if limit:
            already = await _partner_usage(uid, pid, year)
            if already + add_qty > int(limit):
                remaining = max(0, int(limit) - already)
                raise HTTPException(
                    400,
                    f"Limite atteinte pour « {partner.get('name')} » : {limit}/an, il vous reste {remaining}.",
                )

    subtotal = 0.0
    discount = 0.0
    lines = []
    tickets = []
    for it in payload.items:
        qty = max(1, int(it.qty))
        line_total = round(it.unit_price * qty, 2)
        subtotal += line_total
        if it.unit_original and it.unit_original > it.unit_price:
            discount += round((it.unit_original - it.unit_price) * qty, 2)
        lines.append({
            "partner_id": it.partner_id,
            "name": it.name,
            "image": it.image or "",
            "unit_price": float(it.unit_price),
            "unit_original": float(it.unit_original) if it.unit_original else None,
            "qty": qty,
            "line_total": line_total,
        })
        # Generate one e-ticket per unit
        for _ in range(qty):
            tickets.append({
                "id": _id(),
                "partner_id": it.partner_id,
                "name": it.name,
                "code": f"MSP-{_id()[:6].upper()}-{_id()[:4].upper()}",
                "used": False,
                "unit_price": float(it.unit_price),
            })

    # Resolve email — payload > employee.email > employee.personal_email
    emp = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    email = (payload.email or "").strip() or emp.get("email") or emp.get("personal_email") or ""

    order = {
        "id": _id(),
        "user_id": uid,
        "items": lines,
        "tickets": tickets,
        "subtotal": round(subtotal, 2),
        "discount_total": round(discount, 2),
        "total": round(subtotal, 2),
        "status": "confirmed",
        "address": payload.address or "",
        "payment_method": payload.payment_method or "carte",
        "email": email,
        "email_sent": bool(email),  # mocked send
        "created_at": _now(),
        "reference": f"MSC-{_id()[:8].upper()}",
    }
    await db.cse_orders.insert_one(order.copy())
    # Notify the user (in-app)
    await _push_notification(
        employee_id=uid,
        type="order",
        title=f"Commande {order['reference']} confirmée",
        content=(
            f"Merci ! {len(tickets)} e-billet{'s' if len(tickets) > 1 else ''} disponible"
            f"{'s' if len(tickets) > 1 else ''} — {order['total']:.2f} €"
            + (f" — envoyé à {email}" if email else "")
        ),
        icon="gift",
        link="/avantages/commandes",
    )
    return order


# ─── Channels & messages
@api.get("/channels")
async def list_channels():
    """Return every conversation with a live-computed `unread` count
    based on the caller's `channel_reads` timestamp for that channel.
    Only channels where the caller is a member are returned — new users
    start with a strictly empty messagerie.

    Service canal auto-enrollment: any user whose `service_channels_access`
    lists a corporate key is automatically added (idempotent) as member of
    every existing `corp-{key}-*` and `rh-{key}-*` thread of that service.
    This backfills members retroactively so a newly-attached staff sees ALL
    prior threads immediately, not only messages posted after they joined.
    """
    uid = current_user()
    me = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    access = list(me.get("service_channels_access") or [])
    if access:
        # For each service key the user is staff of, enroll them in every
        # matching corp/rh thread they aren't yet in. The source of truth is
        # the channel's `corporate_key` field so this works for both
        # `service-rh` (thread ids: `rh-{uid}`) and other keys like
        # `communication`, `managers-ops`, `direction` (thread ids:
        # `corp-{key}-{uid}`).
        for key in access:
            await db.channels.update_many(
                {"corporate_key": key, "members_ids": {"$ne": uid}},
                {"$addToSet": {"members_ids": uid}},
            )
    all_channels = await db.channels.find({}, {"_id": 0}).to_list(200)

    def _is_member(c):
        members = c.get("members_ids") or []
        if uid in members:
            return True
        # Everything else is hidden. New DMs and groups must add the user
        # explicitly to members_ids to be visible. Legacy dm-<empId> "inbox"
        # channels are only visible to their owner.
        return False

    channels = [c for c in all_channels if _is_member(c)]
    # Fetch all read markers for the caller in one round-trip
    reads = await db.channel_reads.find({"employee_id": uid}, {"_id": 0}).to_list(500)
    read_map = {r["channel_id"]: r.get("last_read_ts") for r in reads}
    for c in channels:
        last_read = read_map.get(c["id"])
        query = {"channel_id": c["id"], "author_id": {"$ne": uid}}
        if last_read:
            query["ts"] = {"$gt": last_read}
        count = await db.messages.count_documents(query)
        c["unread"] = count
        c["unread_count"] = count
        # Attach a small preview + last message ts for the sidebar rendering
        last = await db.messages.find_one({"channel_id": c["id"]}, {"_id": 0}, sort=[("ts", -1)])
        if last:
            c["last_message_ts"] = last.get("ts")
            c["last_message_preview"] = (last.get("content") or "")[:120]
            c["last_message_author_id"] = last.get("author_id")
    return channels


@api.post("/channels/{cid}/read")
async def mark_channel_read(cid: str):
    """Mark every message of this channel as read for the caller."""
    uid = current_user()
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Conversation introuvable")
    await db.channel_reads.update_one(
        {"employee_id": uid, "channel_id": cid},
        {"$set": {"employee_id": uid, "channel_id": cid, "last_read_ts": _now()}},
        upsert=True,
    )
    # Also mark linked "message" notifications as read
    await db.notifications.update_many(
        {"employee_id": uid, "type": "message",
         "link": {"$regex": f"(channel|ch)={cid}"}, "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}


@api.post("/channels/{cid}/leave")
async def leave_channel(cid: str):
    """Employee-initiated leave from a CUSTOM group chat only (`grp-*` or
    `is_group=true` with no admin flags). Team channels (`team-*`) and
    service canals (`corp-*` / `rh-*`) are managed by admins — members
    cannot leave them themselves. Posts "X a quitté le groupe." system
    message for remaining members."""
    uid = current_user()
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Conversation introuvable")
    cid_str = str(ch.get("id", ""))
    is_team = bool(ch.get("is_team_channel") or cid_str.startswith("team-"))
    is_service = cid_str.startswith("corp-") or cid_str.startswith("rh-") or ch.get("is_service_inbox") or ch.get("is_official")
    is_dm = bool(ch.get("is_dm"))
    is_custom_group = cid_str.startswith("grp-") or (ch.get("is_group") and not is_team and not is_service and not is_dm)
    if not is_custom_group or is_team or is_service:
        raise HTTPException(400, "Impossible de quitter cette conversation — contactez un administrateur")
    if uid not in (ch.get("members_ids") or []):
        raise HTTPException(400, "Vous n'êtes pas membre de ce canal")
    emp = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    full_name = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip() or "Un collègue"
    await db.channels.update_one({"id": cid}, {"$pull": {"members_ids": uid}})
    now = _now()
    await db.messages.insert_one({
        "id": _id(), "channel_id": cid, "author_id": "system-leave",
        "author_name": "Système",
        "content": f"{full_name} a quitté le groupe.",
        "text": f"{full_name} a quitté le groupe.",
        "type": "system", "is_system": True,
        "attachments": [],
        "ts": now, "created_at": now,
    })
    await db.channels.update_one({"id": cid}, {"$set": {"last_message_ts": now}})
    return {"ok": True}


async def _require_channel_member(cid: str) -> tuple[dict, str]:
    """Load channel and verify the caller is a member. Returns (channel, uid)."""
    uid = current_user()
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Conversation introuvable")
    members = ch.get("members_ids") or []
    if uid in members:
        return ch, uid
    raise HTTPException(403, "Vous n'êtes pas membre de cette conversation")


@api.get("/channels/{cid}/messages")
async def list_messages(cid: str):
    ch, uid = await _require_channel_member(cid)
    msgs = await db.messages.find(
        {"channel_id": cid}, {"_id": 0}
    ).sort("ts", 1).to_list(200)
    # DM read receipt: the other member's last_read_ts tells us which of my
    # messages they have already seen. Attach `read_at` to each of *my*
    # messages sent before that timestamp.
    if ch.get("is_dm"):
        others = [m for m in (ch.get("members_ids") or []) if m != uid]
        if others:
            other_id = others[0]
            other_read = await db.channel_reads.find_one(
                {"employee_id": other_id, "channel_id": cid}, {"_id": 0}
            )
            other_last_read_ts = (other_read or {}).get("last_read_ts")
            if other_last_read_ts:
                for m in msgs:
                    if m.get("author_id") == uid and str(m.get("ts") or "") <= str(other_last_read_ts):
                        m["read_at"] = other_last_read_ts
    return msgs


@api.post("/channels/{cid}/messages")
async def post_message(cid: str, payload: MessageCreate):
    if not (payload.content or "").strip() and not (payload.attachments or []):
        raise HTTPException(400, "Message vide")
    ch, _uid = await _require_channel_member(cid)
    # ─── Service-canal membership sync: for corp-{key}-* and rh-{uid}
    # threads, refresh members_ids to the sender + all current staff of
    # that service just before we compute the notification recipients.
    # This guarantees that any staff added AFTER the thread was created
    # (e.g. Camille attached to Communication weeks later) receives every
    # NEW message automatically, and can see the thread in their inbox.
    canal_key = ch.get("corporate_key")
    cid_str = str(ch.get("id", ""))
    is_corp_thread = cid_str.startswith("corp-") or cid_str.startswith("rh-")
    if is_corp_thread and canal_key:
        staff = await _corporate_members(canal_key)
        # The initiator (owner of the personal thread) also stays a member
        initiator = None
        if cid_str.startswith("corp-"):
            initiator = cid_str[len(f"corp-{canal_key}-"):]
        elif cid_str.startswith("rh-"):
            initiator = cid_str[len("rh-"):]
        base = list({*staff, current_user()})
        if initiator:
            base = list({*base, initiator})
        await db.channels.update_one(
            {"id": cid},
            {"$set": {"members_ids": base, "members": len(base)}},
        )
        # Refresh in-memory copy so the notification loop below uses the
        # updated members list.
        ch["members_ids"] = base
    author = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    author_name = (
        f"{author.get('first_name', '')} {author.get('last_name', '')}".strip()
        if author else "Un collègue"
    )
    # Detect Service canal replies. The frontend explicitly indicates via
    # `as_service` whether the current post is a service reply (from the
    # service inbox side) or a personal message (from Ma messagerie). When
    # None, fall back to the legacy heuristic.
    body = payload.content or ""
    service_name = None
    if payload.as_service is not None:
        is_service_msg = bool(payload.as_service)
        if is_service_msg:
            if ch.get("is_service_inbox"):
                service_name = ch.get("name")
            elif str(ch.get("id", "")).startswith("corp-"):
                canal_key = ch.get("corporate_key")
                meta = CORPORATE_CANALS.get(canal_key, {}) if canal_key else {}
                service_name = meta.get("name") or ch.get("name")
    else:
        # Legacy heuristic (auto-signs when the author is service staff and
        # NOT the initiator of a corp-{key}-{uid} thread — i.e. staff
        # replying to another employee's request).
        is_service_msg = bool(ch and ch.get("is_service_inbox"))
        service_name = ch.get("name") if is_service_msg else None
        if not is_service_msg and ch and str(ch.get("id", "")).startswith("corp-"):
            canal_key = ch.get("corporate_key")
            cid_str = str(ch.get("id", ""))
            initiator = cid_str[len(f"corp-{canal_key}-"):] if canal_key else None
            is_own_thread = initiator == current_user()
            if not is_own_thread and canal_key and canal_key in (author.get("service_channels_access") or []):
                is_service_msg = True
                meta = CORPORATE_CANALS.get(canal_key, {})
                service_name = meta.get("name") or ch.get("name")
    if is_service_msg and body.strip() and f"— {author_name}" not in body:
        body = f"{body.rstrip()}\n\n— {author_name}"
    msg = {
        "id": _id(),
        "channel_id": cid,
        "author_id": current_user(),
        "content": body,
        "attachments": payload.attachments or [],
        "is_service_message": is_service_msg,
        "service_name": service_name,
        "service_icon": (ch.get("icon") if is_service_msg else None) if ch else None,
        "ts": _now(),
    }
    await db.messages.insert_one(msg.copy())
    preview = (body or "").strip()
    if len(preview) > 90:
        preview = preview[:87] + "…"
    ch_label = (ch or {}).get("name") or cid
    if ch and (ch.get("is_dm") or ch.get("is_group")):
        member_ids = [mid for mid in (ch.get("members_ids") or []) if mid != current_user()]
        if is_service_msg:
            # Corp channel — recipient sees the service identity, not the individual
            title = f"Nouveau message — {service_name or ch_label}"
            content = preview or "Nouveau message"
            icon = "briefcase"
        elif ch.get("is_dm"):
            title = f"Message de {author_name}"
            content = preview or "Nouveau message"
            icon = "message-circle"
        else:
            title = f"{author_name} · #{ch_label}"
            content = preview or "Nouveau message"
            icon = "message-circle"
        for mid in member_ids:
            await _push_notification(
                employee_id=mid,
                type="message",
                title=title,
                content=content,
                icon=icon,
                link=f"/messagerie?ch={cid}",
            )
    else:
        # Team / service canal — notify only its members. Service messages
        # use a distinctive prefix so the recipient sees straight away it
        # comes from a shared inbox, not a DM.
        member_ids = [mid for mid in (ch.get("members_ids") or []) if mid != current_user()]
        title = (
            f"Nouveau message — {ch_label}"
            if is_service_msg else f"Nouveau message · #{ch_label}"
        )
        for mid in member_ids:
            await _push_notification(
                employee_id=mid,
                type="message",
                title=title,
                content=f"{author_name} : {preview or 'Nouveau message'}",
                icon="briefcase" if is_service_msg else "message-circle",
                link=f"/messagerie?ch={cid}",
            )

    # ─── Auto-reply on absence (DM only)
    # If the recipient is currently absent (approved leave, OFF day, or
    # manual toggle covering today), post an automated reply from them,
    # once per hour max to avoid spam.
    if ch and ch.get("is_dm") and not ch.get("is_group"):
        others = [m for m in (ch.get("members_ids") or []) if m != current_user()]
        if others:
            other_id = others[0]
            is_absent, _reason = await _is_user_absent_today(other_id)
            if is_absent:
                # Debounce: skip if we already auto-replied within the last hour
                last_auto = await db.messages.find_one(
                    {"channel_id": cid, "author_id": other_id, "is_auto_reply": True},
                    {"_id": 0}, sort=[("ts", -1)],
                )
                debounce_ok = True
                if last_auto:
                    try:
                        last_dt = datetime.fromisoformat(
                            str(last_auto["ts"]).replace("Z", "+00:00")
                        )
                        if (datetime.now(timezone.utc) - last_dt).total_seconds() < 3600:
                            debounce_ok = False
                    except Exception:
                        pass
                if debounce_ok:
                    other_emp = await db.employees.find_one(
                        {"id": other_id}, {"_id": 0}
                    )
                    ar = (other_emp or {}).get("absence_reply") or {}
                    body = (ar.get("message") or "").strip() or DEFAULT_ABSENCE_MESSAGE
                    auto_msg = {
                        "id": _id(),
                        "channel_id": cid,
                        "author_id": other_id,
                        "content": body,
                        "attachments": [],
                        "ts": _now(),
                        "is_auto_reply": True,
                    }
                    await db.messages.insert_one(auto_msg.copy())
    return await _strip(msg)


class MessageEdit(BaseModel):
    content: str


@api.put("/messages/{mid}")
async def edit_message(mid: str, payload: MessageEdit):
    """Edit own message within the 10-minute grace window."""
    uid = current_user()
    msg = await db.messages.find_one({"id": mid}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message introuvable")
    if msg.get("author_id") != uid:
        raise HTTPException(403, "Vous ne pouvez modifier que vos propres messages")
    # Compute the age of the message in minutes
    try:
        sent_at = datetime.fromisoformat(str(msg["ts"]).replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(500, "Timestamp invalide")
    age_min = (datetime.now(timezone.utc) - sent_at).total_seconds() / 60
    if age_min > 10:
        raise HTTPException(423, "Vous ne pouvez plus modifier ce message (au-delà de 10 minutes).")
    new_content = (payload.content or "").strip()
    if not new_content:
        raise HTTPException(400, "Message vide")
    await db.messages.update_one(
        {"id": mid},
        {"$set": {"content": new_content, "edited_at": _now(), "edited": True}},
    )
    return await db.messages.find_one({"id": mid}, {"_id": 0})


@api.delete("/messages/{mid}")
async def delete_message(mid: str):
    """Delete own message (no time limit for now)."""
    uid = current_user()
    msg = await db.messages.find_one({"id": mid}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message introuvable")
    if msg.get("author_id") != uid:
        raise HTTPException(403, "Vous ne pouvez supprimer que vos propres messages")
    await db.messages.delete_one({"id": mid})
    return {"ok": True}


@api.post("/messages/{mid}/like")
async def toggle_message_like(mid: str):
    """Toggle a like (👍) reaction on a message. One like per user, second
    call removes it. Returns the updated liked_by list."""
    uid = current_user()
    msg = await db.messages.find_one({"id": mid}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message introuvable")
    # Ensure the caller is a member of the channel
    await _require_channel_member(msg["channel_id"])
    liked_by = list(msg.get("liked_by") or [])
    if uid in liked_by:
        liked_by = [x for x in liked_by if x != uid]
    else:
        liked_by.append(uid)
    await db.messages.update_one({"id": mid}, {"$set": {"liked_by": liked_by, "like_count": len(liked_by)}})
    return {"liked_by": liked_by, "like_count": len(liked_by), "liked_by_me": uid in liked_by}


# ─── Events
@api.get("/events")
async def list_events():
    """Return events visible to the current user. Strict audience filter — if
    `audience_status_targets` is set, only matching statuses see the event
    (no admin bypass). Falls back to legacy `group_targets` / `employee_targets`
    when the new audience field is empty."""
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    role_category = emp.get("role_category", "employe")
    is_admin = bool(emp.get("is_admin"))
    dept = emp.get("department")

    items = await db.events.find({}, {"_id": 0}).sort("date", 1).to_list(200)
    visible = []
    for e in items:
        # New audience filter takes precedence — strict, no admin bypass.
        aud = e.get("audience_status_targets") or []
        if aud:
            if _user_matches_audience(emp, aud):
                visible.append(e)
            continue
        # Legacy fallbacks (group_targets / employee_targets)
        groups = e.get("group_targets") or ["all"]
        emp_ids = e.get("employee_targets") or []
        if "all" in groups:
            visible.append(e); continue
        if is_admin and "admin" in groups:
            visible.append(e); continue
        if role_category == "encadrement" and ("managers" in groups or "encadrement" in groups):
            visible.append(e); continue
        if role_category == "employe" and "ops" in groups:
            visible.append(e); continue
        if role_category == "restauration" and "restauration" in groups:
            visible.append(e); continue
        if dept and dept in groups:
            visible.append(e); continue
        if current_user() in emp_ids:
            visible.append(e); continue

    # ─── Merge in personal meeting reservations from Salles de réunion so
    # the agenda shows every meeting the user organized OR was invited to.
    # This keeps the two features (Salles / Agenda) in sync without
    # duplicating the data.
    uid = current_user()
    reservations = await db.room_reservations.find(
        {"$or": [{"organizer_id": uid}, {"participants_ids": uid}],
         "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).to_list(500)
    if reservations:
        # Preload room names for the location line
        room_ids = list({r["room_id"] for r in reservations})
        rooms = await db.meeting_rooms.find(
            {"id": {"$in": room_ids}}, {"_id": 0}
        ).to_list(200)
        room_by_id = {r["id"]: r for r in rooms}
        for r in reservations:
            try:
                s = _parse_iso(r["start_ts"]).astimezone(PARIS_TZ)
                e = _parse_iso(r["end_ts"]).astimezone(PARIS_TZ)
            except Exception:
                continue
            room = room_by_id.get(r.get("room_id")) or {}
            visible.append({
                "id": f"resv-{r['id']}",
                "title": r.get("title") or "Réunion",
                "description": r.get("description") or "",
                "date": s.date().isoformat(),
                "start_time": s.strftime("%H:%M"),
                "end_time": e.strftime("%H:%M"),
                "location": room.get("name") or "Salle de réunion",
                "kind": "meeting",
                "meeting_type": r.get("meeting_type"),
                "reservation_id": r["id"],
                "organizer_id": r.get("organizer_id"),
            })
    return visible


# ─── Admin Events CRUD

class EventPayload(BaseModel):
    title: str
    description: Optional[str] = None
    intro_text: Optional[str] = None
    date: str  # YYYY-MM-DD (start date)
    end_date: Optional[str] = None  # YYYY-MM-DD (optional multi-day event)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    image: Optional[str] = None
    # ─── Unified action button (fully configurable per event) ──
    # If cta_enabled is False, no button is displayed on the event detail.
    # Otherwise the admin freely picks the label + destination.
    cta_enabled: Optional[bool] = False
    cta_text: Optional[str] = None  # free label: "Réserver", "Voir le programme"…
    cta_target_type: Optional[str] = None  # "news" | "external" | "internal" | "signup"
    cta_target_id: Optional[str] = None    # ID of a news/post when target_type=news
    cta_url: Optional[str] = None          # URL (external/internal/signup)
    # ─── Legacy flags (kept for backward compat with older seed data)
    signup_enabled: Optional[bool] = False
    signup_url: Optional[str] = None
    linked_news_id: Optional[str] = None
    external_link: Optional[str] = None
    internal_page: Optional[str] = None
    group_targets: Optional[List[str]] = None  # ["all", "admin", "managers", "ops", "restauration", "encadrement", ...]
    employee_targets: Optional[List[str]] = None
    audience_status_targets: Optional[List[str]] = None  # ["ops","management","bureau","direction",...]
    category: Optional[str] = "event"


def _normalize_event(ev: dict) -> dict:
    """Keep legacy `type`/`time`/`needs_registration` fields in sync
    with the new `category`/`start_time`/`signup_enabled` schema so the
    employee Agenda continues to render events properly."""
    if ev.get("category") and not ev.get("type"):
        ev["type"] = ev["category"]
    if ev.get("type") and not ev.get("category"):
        ev["category"] = ev["type"]
    if ev.get("start_time") and not ev.get("time"):
        ev["time"] = ev["start_time"]
    if ev.get("time") and not ev.get("start_time"):
        ev["start_time"] = ev["time"]
    if "signup_enabled" in ev and "needs_registration" not in ev:
        ev["needs_registration"] = bool(ev.get("signup_enabled"))
    # Auto-derive the unified CTA button from legacy fields when the admin
    # hasn't set the new fields explicitly (backward compatibility).
    if not ev.get("cta_enabled") and not ev.get("cta_target_type"):
        if ev.get("linked_news_id"):
            ev["cta_enabled"] = True
            ev["cta_text"] = ev.get("cta_text") or "Voir l'actualité"
            ev["cta_target_type"] = "news"
            ev["cta_target_id"] = ev["linked_news_id"]
        elif ev.get("signup_enabled"):
            ev["cta_enabled"] = True
            ev["cta_text"] = ev.get("cta_text") or "S'inscrire"
            ev["cta_target_type"] = "signup"
            ev["cta_url"] = ev.get("signup_url") or ev.get("cta_url")
        elif ev.get("external_link"):
            ev["cta_enabled"] = True
            ev["cta_text"] = ev.get("cta_text") or "Ouvrir le lien"
            ev["cta_target_type"] = "external"
            ev["cta_url"] = ev["external_link"]
    return ev


@api.post("/admin/events")
async def admin_create_event(payload: EventPayload):
    me = await require_permission("create_events", "edit_events")
    ev = payload.model_dump()
    ev["id"] = _id()
    if not ev.get("group_targets"):
        ev["group_targets"] = ["all"]
    ev = _normalize_event(ev)
    await db.events.insert_one(ev.copy())
    # Notify targeted employees
    groups = ev.get("group_targets") or ["all"]
    emp_ids = ev.get("employee_targets") or []
    targets: set[str] = set(emp_ids)
    all_emps = await db.employees.find({}, {"_id": 0}).to_list(500)
    for e in all_emps:
        if "all" in groups:
            targets.add(e["id"])
            continue
        if e.get("is_admin") and "admin" in groups:
            targets.add(e["id"])
            continue
        rc = e.get("role_category")
        if rc == "encadrement" and ("managers" in groups or "encadrement" in groups):
            targets.add(e["id"])
        elif rc == "employe" and "ops" in groups:
            targets.add(e["id"])
        elif rc == "restauration" and "restauration" in groups:
            targets.add(e["id"])
        if e.get("department") and e["department"] in groups:
            targets.add(e["id"])
    targets.discard(me["id"])
    # Audience filter also constrains notification targets
    aud = ev.get("audience_status_targets") or []
    if aud:
        aud_set = set(aud)
        allowed = {e["id"] for e in all_emps if set(e.get("statuses") or []) & aud_set}
        targets &= allowed
    when = ev.get("date", "")
    for tid in targets:
        await _push_notification(
            tid,
            type="event",
            title="Nouvel événement",
            content=f"{ev['title']} — {when}",
            icon="calendar",
            link=f"/agenda/event/{ev['id']}",
        )
    return ev


@api.put("/admin/events/{eid}")
async def admin_update_event(eid: str, payload: EventPayload):
    await require_permission("edit_events", "create_events")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates.pop("id", None)
    updates = _normalize_event(updates)
    await db.events.update_one({"id": eid}, {"$set": updates})
    item = await db.events.find_one({"id": eid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Événement introuvable")
    return item


@api.delete("/admin/events/{eid}")
async def admin_delete_event(eid: str):
    await require_permission("edit_events")
    await db.events.delete_one({"id": eid})
    return {"ok": True}


@api.get("/admin/events")
async def admin_list_events():
    await require_permission("create_events", "edit_events")
    return await db.events.find({}, {"_id": 0}).sort("date", 1).to_list(500)


# ─── Custom Forms (builder + submissions)

def _slug(s: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s or "").strip("_").lower()
    return s or _id()[:8]


def _prepare_fields(raw_fields):
    out = []
    used = set()
    for i, f in enumerate(raw_fields or []):
        d = f.model_dump() if hasattr(f, "model_dump") else dict(f)
        d["id"] = d.get("id") or _id()
        # Auto-generate a stable field name if the admin didn't provide one
        base = d.get("name") or _slug(d.get("label", f"field_{i}"))
        name = base
        counter = 2
        while name in used:
            name = f"{base}_{counter}"
            counter += 1
        used.add(name)
        d["name"] = name
        out.append(d)
    return out


@api.get("/admin/forms")
async def admin_list_forms():
    await require_permission("create_forms")
    forms = await db.forms.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Attach the number of responses per form
    for f in forms:
        f["response_count"] = await db.form_responses.count_documents({"form_id": f["id"]})
    return forms


@api.get("/forms/{fid}")
async def get_form(fid: str):
    """Public — logged employees can fetch a form to fill it in.
    Also returns whether the caller has already answered (`already_answered`)
    and the submission timestamp so the UI can hide the form.
    Audience gate: 404 for users not in the target statuses.
    Deadline gate: 410 (Gone) when `closes_at` is in the past."""
    f = await db.forms.find_one({"id": fid, "active": True}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Formulaire introuvable ou désactivé")
    uid = current_user()
    me = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    if f.get("created_by") != uid and not _user_matches_audience(me, f.get("audience_status_targets")):
        raise HTTPException(404, "Formulaire introuvable ou désactivé")
    # Compute closed state without hiding the form entirely so the UI can
    # display "Ce formulaire est fermé depuis le …"
    f["is_closed"] = _form_is_closed(f)
    existing = await db.form_responses.find_one({"form_id": fid, "employee_id": uid}, {"_id": 0})
    f["already_answered"] = bool(existing)
    f["my_response_at"] = existing.get("submitted_at") if existing else None
    # Décorer chaque champ avec option_availability : {option: {taken, limit, is_full}}
    # pour que le front puisse griser les options complètes.
    limited_fields = [fld for fld in (f.get("fields") or []) if fld.get("option_limits")]
    if limited_fields:
        prev = await db.form_responses.find({"form_id": fid}, {"_id": 0, "answers": 1}).to_list(10000)
        for fld in limited_fields:
            counts = {}
            for r in prev:
                ans = (r.get("answers") or {}).get(fld.get("name"))
                if isinstance(ans, list):
                    for opt in ans:
                        counts[opt] = counts.get(opt, 0) + 1
                elif ans not in (None, ""):
                    counts[ans] = counts.get(ans, 0) + 1
            fld["option_availability"] = {
                opt: {
                    "taken": counts.get(opt, 0),
                    "limit": lim,
                    "is_full": counts.get(opt, 0) >= (int(lim) if lim else 10**9),
                }
                for opt, lim in (fld.get("option_limits") or {}).items()
                if lim
            }
    return f


def _form_is_closed(f: dict) -> bool:
    """True when a deadline is set and already in the past."""
    ca = f.get("closes_at")
    if not ca:
        return False
    try:
        dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return dt <= now
    except Exception:
        return False


@api.post("/admin/forms")
async def admin_create_form(payload: FormPayload):
    me = await require_permission("create_forms")
    doc = {
        "id": _id(),
        "title": payload.title.strip(),
        "description": payload.description,
        "fields": _prepare_fields(payload.fields),
        "active": bool(payload.active),
        "submit_label": payload.submit_label or "Envoyer",
        "success_message": payload.success_message or "Merci ! Votre formulaire a bien été envoyé.",
        "audience_status_targets": payload.audience_status_targets or [],
        "closes_at": payload.closes_at,
        "created_by": me["id"],
        "created_by_name": f"{me['first_name']} {me['last_name']}",
        "created_at": _now(),
    }
    await db.forms.insert_one(doc.copy())
    return doc


@api.put("/admin/forms/{fid}")
async def admin_update_form(fid: str, payload: FormPayload):
    await require_permission("create_forms")
    updates = payload.model_dump()
    updates["fields"] = _prepare_fields(payload.fields)
    await db.forms.update_one({"id": fid}, {"$set": updates})
    item = await db.forms.find_one({"id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Formulaire introuvable")
    return item


@api.delete("/admin/forms/{fid}")
async def admin_delete_form(fid: str):
    await require_permission("create_forms")
    await db.forms.delete_one({"id": fid})
    await db.form_responses.delete_many({"form_id": fid})
    return {"ok": True}


@api.post("/admin/forms/{fid}/remind")
async def admin_remind_form(fid: str):
    """Push a notification to every targeted employee who hasn't answered
    yet. Idempotent — running it twice pings the same non-responders again
    (fine: the notification list is de-duplicated by title on the client)."""
    await require_permission("create_forms")
    f = await db.forms.find_one({"id": fid}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Formulaire introuvable")
    if _form_is_closed(f):
        raise HTTPException(400, "Formulaire fermé — impossible de relancer.")
    targets = f.get("audience_status_targets") or []
    # Match audience
    emps = await db.employees.find({}, {"_id": 0}).to_list(500)
    matched = [e for e in emps if _user_matches_audience(e, targets) and e.get("account_status") != "deactivated"]
    # Filter out those who already responded
    responded = {
        r["employee_id"]
        for r in await db.form_responses.find({"form_id": fid}, {"_id": 0, "employee_id": 1}).to_list(2000)
    }
    non_responders = [e for e in matched if e["id"] not in responded]
    for e in non_responders:
        await _push_notification(
            employee_id=e["id"],
            type="form_reminder",
            title=f"Relance — {f.get('title', 'Formulaire')}",
            content=f"Merci de répondre au formulaire avant la clôture.",
            icon="clipboard-list",
            link=f"/formulaires/{fid}",
        )
    return {"ok": True, "sent": len(non_responders)}


@api.post("/forms/{fid}/submit")
async def submit_form(fid: str, payload: FormSubmitPayload):
    f = await db.forms.find_one({"id": fid, "active": True}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Formulaire introuvable ou désactivé")
    if _form_is_closed(f):
        raise HTTPException(410, "Ce formulaire est fermé.")
    uid = current_user()
    me = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    if not _user_matches_audience(me, f.get("audience_status_targets")):
        raise HTTPException(403, "Vous n'êtes pas autorisé à répondre à ce formulaire.")
    # Server-side idempotency: reject any second submission from the same user
    # regardless of double-click, refresh or another browser/device.
    existing = await db.form_responses.find_one({"form_id": fid, "employee_id": uid}, {"_id": 0})
    if existing:
        raise HTTPException(409, "Vous avez déjà répondu à ce formulaire.")

    # Quota par option : si un champ select/radio/checkbox a des option_limits,
    # on vérifie que la ou les options choisies ne sont pas pleines.
    prev_responses = await db.form_responses.find({"form_id": fid}, {"_id": 0, "answers": 1}).to_list(10000)
    for fld in (f.get("fields") or []):
        limits = fld.get("option_limits") or {}
        if not limits:
            continue
        if fld.get("type") not in ("select", "radio", "checkbox"):
            continue
        picked = payload.answers.get(fld.get("name"))
        if picked is None or picked == "":
            continue
        picks = picked if isinstance(picked, list) else [picked]
        for choice in picks:
            cap = limits.get(choice)
            if cap is None:
                continue
            try:
                cap = int(cap)
            except Exception:
                continue
            if cap <= 0:
                continue
            # Compte des personnes déjà inscrites à cette option
            count = 0
            for r in prev_responses:
                ans = (r.get("answers") or {}).get(fld.get("name"))
                if isinstance(ans, list):
                    if choice in ans:
                        count += 1
                elif ans == choice:
                    count += 1
            if count >= cap:
                raise HTTPException(
                    409,
                    f"« {choice} » est complet ({cap}/{cap}). Choisissez une autre option.",
                )
    me = await db.employees.find_one({"id": uid}, {"_id": 0})
    employee_name = f"{me['first_name']} {me['last_name']}" if me else "Anonyme"
    resp = {
        "id": _id(),
        "form_id": fid,
        "employee_id": uid,
        "employee_name": employee_name,
        "answers": payload.answers,
        "submitted_at": _now(),
    }
    try:
        await db.form_responses.insert_one(resp.copy())
    except Exception:
        raise HTTPException(409, "Vous avez déjà répondu à ce formulaire.")
    # Notify the form creator when someone submits
    if f.get("created_by") and f.get("created_by") != current_user():
        await db.notifications.insert_one({
            "id": _id(),
            "employee_id": f["created_by"],
            "type": "form",
            "title": f"Réponse au formulaire « {f['title']} »",
            "content": f"{employee_name} vient de remplir votre formulaire.",
            "message": f"{employee_name} vient de remplir votre formulaire.",
            "icon": "file-text",
            "link": "/management/formulaires",
            "ts": _now(),
            "created_at": _now(),
            "read": False,
        })
    return {"ok": True, "response_id": resp["id"], "success_message": f.get("success_message")}


@api.get("/admin/forms/{fid}/responses")
async def admin_form_responses(fid: str):
    await require_permission("create_forms")
    return await db.form_responses.find({"form_id": fid}, {"_id": 0}).sort("submitted_at", -1).to_list(1000)


@api.get("/admin/forms/{fid}/stats")
async def admin_form_stats(fid: str):
    """Return per-question aggregated statistics for a form + a participation
    summary (total recipients, respondents, participation rate, non-respondents
    list)."""
    await require_permission("create_forms")
    form = await db.forms.find_one({"id": fid}, {"_id": 0})
    if not form:
        raise HTTPException(404, "Formulaire introuvable")
    responses = await db.form_responses.find({"form_id": fid}, {"_id": 0}).to_list(10000)
    # Recipients = every non-super-admin active employee (audience-agnostic for MVP)
    employees = await db.employees.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "avatar": 1}).to_list(1000)
    respondent_ids = {r["employee_id"] for r in responses if r.get("employee_id")}
    non_respondents = [e for e in employees if e["id"] not in respondent_ids]
    total_recipients = len(employees)
    total_responses = len({r["employee_id"] for r in responses if r.get("employee_id")})
    rate = round((total_responses / total_recipients * 100), 1) if total_recipients else 0.0

    # Per-question aggregation
    def _pct(n, tot): return round((n / tot * 100), 1) if tot else 0.0

    questions_stats = []
    for f in form.get("fields", []) or []:
        if f.get("type") in ("section", "rich", "image"):
            continue
        name = f.get("name")
        typ = f.get("type")
        values = [r["answers"].get(name) for r in responses if (r.get("answers") or {}).get(name) not in (None, "")]
        answered = len(values)
        q = {
            "field_id": f.get("id"),
            "name": name,
            "label": f.get("label"),
            "type": typ,
            "answered_count": answered,
            "skipped_count": total_responses - answered,
        }
        if typ in ("select", "radio"):
            counts = {}
            respondents = {}  # option -> [{id, name, avatar}]
            for opt in (f.get("options") or []):
                counts[opt] = 0
                respondents[opt] = []
            for r in responses:
                v = (r.get("answers") or {}).get(name)
                if v in (None, ""):
                    continue
                if v not in counts:
                    counts[v] = 0
                    respondents[v] = []
                counts[v] += 1
                respondents[v].append({
                    "id": r.get("employee_id"),
                    "name": r.get("employee_name"),
                    "submitted_at": r.get("submitted_at"),
                })
            limits = f.get("option_limits") or {}
            options = sorted(
                [{
                    "option": o,
                    "count": c,
                    "percent": _pct(c, answered),
                    "limit": limits.get(o),
                    "is_full": bool(limits.get(o)) and c >= int(limits.get(o) or 0),
                    "respondents": respondents.get(o) or [],
                } for o, c in counts.items()],
                key=lambda x: -x["count"],
            )
            q["options"] = options
            q["top"] = options[0] if options and options[0]["count"] > 0 else None
            q["bottom"] = options[-1] if len(options) > 1 else None
        elif typ == "checkbox":
            counts = {}
            respondents = {}
            for opt in (f.get("options") or []):
                counts[opt] = 0
                respondents[opt] = []
            for r in responses:
                v = (r.get("answers") or {}).get(name)
                if isinstance(v, list):
                    for opt in v:
                        counts[opt] = counts.get(opt, 0) + 1
                        respondents.setdefault(opt, []).append({
                            "id": r.get("employee_id"),
                            "name": r.get("employee_name"),
                            "submitted_at": r.get("submitted_at"),
                        })
            limits = f.get("option_limits") or {}
            options = sorted(
                [{
                    "option": o,
                    "count": c,
                    "percent": _pct(c, answered),
                    "limit": limits.get(o),
                    "is_full": bool(limits.get(o)) and c >= int(limits.get(o) or 0),
                    "respondents": respondents.get(o) or [],
                } for o, c in counts.items()],
                key=lambda x: -x["count"],
            )
            q["options"] = options
            q["top"] = options[0] if options and options[0]["count"] > 0 else None
        elif typ == "number":
            nums = []
            for v in values:
                try:
                    nums.append(float(v))
                except Exception:
                    pass
            if nums:
                q["average"] = round(sum(nums) / len(nums), 2)
                q["min"] = min(nums)
                q["max"] = max(nums)
                # Distribution rounded to integers (natural rating scale)
                dist = {}
                for n in nums:
                    k = int(round(n))
                    dist[k] = dist.get(k, 0) + 1
                q["distribution"] = sorted([{"value": k, "count": c, "percent": _pct(c, len(nums))} for k, c in dist.items()], key=lambda x: x["value"])
                q["mode"] = max(q["distribution"], key=lambda x: x["count"])["value"]
            else:
                q["average"] = None
                q["distribution"] = []
        elif typ in ("text", "textarea", "email", "tel", "url", "file"):
            samples = [str(v) for v in values]
            q["samples"] = samples[:100]
            # Very light word-frequency summary (excluding common stopwords)
            stop = {"le","la","les","de","des","du","un","une","et","à","a","au","aux","en","dans","que","qui","pour","sur","est","je","tu","il","elle","on","nous","vous","ils","elles","ne","pas","plus","très","tres","avec","mais","ou","où","ce","ça","ca","cet","cette","ces","mon","ma","mes","ton","ta","tes","son","sa","ses","notre","votre","leur","leurs","être","etre","avoir","fait","faire","tout","tous","toute","toutes"}
            wc = {}
            for v in samples:
                for w in [w.strip(".,;:!?()\"'").lower() for w in str(v).split()]:
                    if len(w) < 3 or w in stop:
                        continue
                    wc[w] = wc.get(w, 0) + 1
            q["top_words"] = sorted([{"word": w, "count": c} for w, c in wc.items()], key=lambda x: -x["count"])[:12]
        elif typ == "date":
            q["samples"] = [str(v) for v in values][:100]
        else:
            q["samples"] = [str(v) for v in values][:100]
        questions_stats.append(q)

    return {
        "form": {"id": form["id"], "title": form.get("title"), "description": form.get("description")},
        "summary": {
            "total_recipients": total_recipients,
            "total_responses": total_responses,
            "participation_rate": rate,
            "non_respondents": [{"id": e["id"], "first_name": e["first_name"], "last_name": e["last_name"], "avatar": e.get("avatar")} for e in non_respondents],
        },
        "questions": questions_stats,
    }




# ─── News
@api.get("/news")
async def list_news():
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    items = await db.news.find({}, {"_id": 0}).sort("date", -1).to_list(50)
    return [n for n in items if _user_matches_audience(me, n.get("audience_status_targets"))][:20]


@api.get("/news/{nid}")
async def get_news(nid: str):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    item = await db.news.find_one({"id": nid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Actualité introuvable")
    if not _user_matches_audience(me, item.get("audience_status_targets")):
        raise HTTPException(404, "Actualité introuvable")
    return item


@api.get("/events/{eid}")
async def get_event(eid: str):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    item = await db.events.find_one({"id": eid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Événement introuvable")
    aud = item.get("audience_status_targets") or []
    if aud and not _user_matches_audience(me, aud):
        raise HTTPException(404, "Événement introuvable")
    return item


# ─── Profile update
class ProfileUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    address: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: Optional[str] = None
    new_password: str


@api.post("/me/change-password")
async def change_own_password(payload: PasswordChange):
    emp = await db.employees.find_one({"id": current_user()})
    if not emp:
        raise HTTPException(404, "Utilisateur introuvable")
    stored = emp.get("password")
    # Try to find the seed/hardcoded credentials for this employee
    hardcoded_pwd = None
    for _email, (_pwd, _eid) in _LOGIN_CREDENTIALS.items():
        if _eid == emp["id"]:
            hardcoded_pwd = _pwd
            break
    # Verify current password: accept either the stored one OR the hardcoded seed password
    if payload.current_password:
        if payload.current_password != stored and payload.current_password != hardcoded_pwd:
            raise HTTPException(401, "Mot de passe actuel incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "Le nouveau mot de passe doit contenir au moins 6 caractères")
    await db.employees.update_one(
        {"id": current_user()},
        {"$set": {"password": payload.new_password, "must_change_password": False}},
    )
    return {"ok": True}


@api.put("/me")
async def update_me(payload: ProfileUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.employees.update_one({"id": current_user()}, {"$set": updates})
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    emp["daily_quota"] = emp.get("daily_quota") or ROLE_QUOTAS.get(emp.get("role_category", "employe"), 20)
    return emp


# ─── Badge lost / deactivate
class BadgeLost(BaseModel):
    reason: str
    last_seen_location: Optional[str] = None
    contact_phone: Optional[str] = None


@api.post("/badge/lost")
async def report_lost(payload: BadgeLost):
    await db.employees.update_one(
        {"id": current_user()}, {"$set": {"badge_active": False}}
    )
    rid = _id()
    await db.requests.insert_one({
        "id": rid,
        "employee_id": current_user(),
        "type": "badge_lost",
        "start_date": date.today().isoformat(),
        "end_date": None,
        "comment": f"Badge perdu — {payload.reason}. Dernier endroit : {payload.last_seen_location or 'inconnu'}.",
        "amount": None,
        "status": "pending",
        "created_at": _now(),
        "decided_at": None,
    })
    return {"ok": True, "request_id": rid}


# ─── Daily consumption (7 days)
@api.get("/meal-points/history")
async def consumption_history():
    today_d = date.today()
    series = []
    for i in range(6, -1, -1):
        d = (today_d - timedelta(days=i)).isoformat()
        txs = await db.meal_tx.find(
            {"employee_id": current_user(),
             "ts": {"$gte": d + "T00:00:00", "$lt": d + "T23:59:59"}},
            {"_id": 0},
        ).to_list(100)
        used = sum(t.get("points_spent", 0) for t in txs)
        series.append({"date": d, "used": used})
    return series


# ─── Poles (contacts grouped)
@api.get("/poles")
async def poles():
    """Return the 6 official service poles aligned with the corporate canals.
    Each pole maps to a `canal_key` used by the messagerie to open the
    corresponding service inbox (`corp-{key}-{uid}`)."""
    return [
        {"id": "service-rh", "canal_key": "service-rh", "name": "Service RH",
         "email": "rh@mspark.fr", "phone": "+33 1 23 45 67 81",
         "description": "Contrats, paie, congés, formation.", "icon": "user-cog", "color": "#10B981"},
        {"id": "communication", "canal_key": "communication", "name": "Communication",
         "email": "communication@mspark.fr", "phone": "+33 1 23 45 67 86",
         "description": "Actualités internes, événements, réseaux sociaux.", "icon": "megaphone", "color": "#3BA4FF"},
        {"id": "managers-ops", "canal_key": "managers-ops", "name": "Managers OPS",
         "email": "managers.ops@mspark.fr", "phone": "+33 1 23 45 67 80",
         "description": "Encadrement opérationnel du parc.", "icon": "users-round", "color": "#F59E0B"},
        {"id": "dept-financier", "canal_key": "dept-financier", "name": "Département financier",
         "email": "finance@mspark.fr", "phone": "+33 1 23 45 67 87",
         "description": "Comptabilité, budget, notes de frais.", "icon": "landmark", "color": "#0EA5E9"},
        {"id": "direction", "canal_key": "direction", "name": "Direction",
         "email": "direction@mspark.fr", "phone": "+33 1 23 45 67 82",
         "description": "Direction générale et stratégie.", "icon": "briefcase", "color": "#A78BFA"},
        {"id": "service-web-it", "canal_key": "service-web-it", "name": "Service Web & IT",
         "email": "support@mspark.fr", "phone": "+33 1 78 28 04 52",
         "description": "Support informatique, site web, applications internes.", "icon": "monitor", "color": "#7C3AED"},
    ]


# ─── Channel catalog (DB-backed metadata for service + team canals).
# Admins can rename, delete or add new canals from the User Manager UI.
# The Python constants below act as SEED FALLBACKS on a fresh install;
# after seeding, the DB is the source of truth.
async def _get_channel_catalog(kind: str) -> list[dict]:
    """Return the catalog list for a kind ("service" or "team")."""
    rows = await db.channel_catalog.find(
        {"kind": kind}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return rows


async def _seed_channel_catalog() -> None:
    """One-shot: seed channel_catalog from CORPORATE_CANALS + TEAM_CANALS.
    Also fills in any NEW keys added to the Python constants after the
    initial seed (idempotent per-key)."""
    for k, v in CORPORATE_CANALS.items():
        exists = await db.channel_catalog.find_one({"kind": "service", "key": k})
        if not exists:
            await db.channel_catalog.insert_one({
                "kind": "service", "key": k, "name": v["name"],
                "icon": v.get("icon"), "description": v.get("description", ""),
                "created_at": _now(),
            })
    for k, v in TEAM_CANALS.items():
        exists = await db.channel_catalog.find_one({"kind": "team", "key": k})
        if not exists:
            await db.channel_catalog.insert_one({
                "kind": "team", "key": k, "name": v["name"],
                "icon": v.get("icon"), "description": v.get("description", ""),
                "created_at": _now(),
            })


def _slugify(text: str) -> str:
    """Convert a channel name into a safe key (a-z0-9 + dashes)."""
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or f"canal-{int(datetime.now().timestamp())}"


# ─── Corporate canals (Service RH, Communication, Managers OPS,
# Département financier, Direction) — one canal per user linking them with
# the members of the target service. Every employee can *write* to any of
# these canals, but only the service members *receive* the messages and
# can reply. Deterministic canal id per user, so a user always finds the
# same thread in their sidebar.
CORPORATE_CANALS = {
    "service-rh": {
        "name": "Service RH",
        "icon": "briefcase",
        "description": "Ressources humaines",
    },
    "communication": {
        "name": "Communication",
        "icon": "megaphone",
        "description": "Équipe communication interne",
    },
    "managers-ops": {
        "name": "Managers OPS",
        "icon": "user-cog",
        "description": "Encadrement opérationnel",
    },
    "dept-financier": {
        "name": "Département financier",
        "icon": "landmark",
        "description": "Finance & comptabilité",
    },
    "direction": {
        "name": "Direction",
        "icon": "shield",
        "description": "Direction générale",
    },
    "service-web-it": {
        "name": "Service Web & IT",
        "icon": "monitor",
        "description": "Support informatique & équipe web/dev",
    },
}


def _corporate_key_for_rh_channel(uid: str) -> str:
    """Legacy Service RH canal id used across the codebase (payslips, onboarding)."""
    return f"rh-{uid}"


def _corporate_channel_id(canal_key: str, uid: str) -> str:
    if canal_key == "service-rh":
        return _corporate_key_for_rh_channel(uid)
    return f"corp-{canal_key}-{uid}"


# ─── Team discussion canals (permanent group chats)
# 7 fixed team channels, seeded on startup. Each user's own identity is used
# to write in these canals (unlike service canals).
TEAM_CANALS = {
    "karting": {"name": "Karting", "icon": "flag"},
    "attractions": {"name": "Attractions", "icon": "sparkles"},
    "nettoyage": {"name": "Nettoyage", "icon": "sparkle"},
    "securite": {"name": "Sécurité", "icon": "shield"},
    "maintenance": {"name": "Maintenance", "icon": "wrench"},
    "employes-ops": {"name": "Employés OPS", "icon": "users"},
    "managers-ops-chat": {"name": "Managers OPS", "icon": "user-cog"},
}


async def _ensure_team_channels_seeded() -> None:
    """Idempotent: ensure a `channel` document exists for each team canal."""
    for key, meta in TEAM_CANALS.items():
        cid = f"team-{key}"
        existing = await db.channels.find_one({"id": cid})
        if existing:
            continue
        members = await db.employees.find(
            {"team_channel_ids": key}, {"_id": 0, "id": 1}
        ).to_list(500)
        await db.channels.insert_one({
            "id": cid,
            "name": meta["name"],
            "icon": meta["icon"],
            "type": "team",
            "is_team_channel": True,
            "team_key": key,
            "members_ids": [m["id"] for m in members],
            "created_at": _now(),
        })


async def _ensure_service_inboxes_seeded() -> None:
    """Idempotent: ensure ONE shared inbox `channel` document per service
    canal so all its members see it in their messagerie sidebar. Membership
    comes STRICTLY from the explicit `service_channels_access` field —
    no heuristic fallback (only assigned users see the canal)."""
    for key, meta in CORPORATE_CANALS.items():
        cid = f"service-{key}"
        members = [
            e["id"] async for e in db.employees.find(
                {"service_channels_access": key}, {"_id": 0, "id": 1}
            )
        ]
        existing = await db.channels.find_one({"id": cid})
        if existing:
            await db.channels.update_one(
                {"id": cid}, {"$set": {"members_ids": members}}
            )
            continue
        await db.channels.insert_one({
            "id": cid,
            "name": f"Service — {meta['name']}",
            "icon": meta.get("icon"),
            "type": "service_inbox",
            "is_service_inbox": True,
            "service_key": key,
            "members_ids": members,
            "created_at": _now(),
        })


async def _sync_service_channel_membership(uid: str, before: list[str], after: list[str]) -> None:
    """Reconcile `service_channels_access` diffs. When a user is granted a
    new service, they are added as member to ALL existing corporate channels
    of that service (so they immediately access the full history). When
    removed, they are pulled from every such channel."""
    before_set, after_set = set(before or []), set(after or [])
    added = after_set - before_set
    removed = before_set - after_set
    if not (added or removed):
        return
    for key in added:
        # Match every existing corp-{key}-* thread + legacy rh-* for service-rh
        patterns = [{"corporate_key": key}]
        if key == "service-rh":
            patterns.append({"id": {"$regex": "^rh-"}})
        await db.channels.update_many(
            {"$or": patterns},
            {"$addToSet": {"members_ids": uid}},
        )
    for key in removed:
        patterns = [{"corporate_key": key}]
        if key == "service-rh":
            patterns.append({"id": {"$regex": "^rh-"}})
        # Do NOT remove the user from their OWN thread (where they are the
        # initiator / recipient — e.g. their own payslip channel).
        chans = await db.channels.find({"$or": patterns}, {"_id": 0}).to_list(500)
        for ch in chans:
            cid = ch["id"]
            # Extract initiator id (last path segment) — either `rh-{uid}`
            # or `corp-{key}-{uid}`.
            if cid.startswith("rh-"):
                initiator = cid[len("rh-"):]
            else:
                # corp-{key}-{initiator}
                initiator = cid[len(f"corp-{ch.get('corporate_key','')}-"):]
            if initiator == uid:
                continue
            await db.channels.update_one({"id": cid}, {"$pull": {"members_ids": uid}})


async def _sync_team_channel_membership(uid: str, before: list[str], after: list[str]) -> None:
    """Reconcile a user's team-channel membership. Posts a system message on
    join & remove so members see who is coming & going. Membership is
    checked against the DB channel_catalog (which may include admin-created
    channels beyond the seed constants)."""
    before_set, after_set = set(before or []), set(after or [])
    added = after_set - before_set
    removed = before_set - after_set
    if not (added or removed):
        return
    emp = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    full_name = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip() or "Un collègue"
    # Build the set of valid team keys from the live catalog
    valid_keys = {c["key"] for c in await _get_channel_catalog("team")} | set(TEAM_CANALS.keys())
    for key in added:
        if key not in valid_keys:
            continue
        cid = f"team-{key}"
        await _ensure_team_channels_seeded()
        # Make sure the channel exists (for admin-created ones seeded lazily)
        exists = await db.channels.find_one({"id": cid}, {"_id": 0})
        if not exists:
            meta = next((c for c in await _get_channel_catalog("team") if c["key"] == key), None)
            if meta:
                await db.channels.insert_one({
                    "id": cid, "name": meta["name"], "icon": meta.get("icon"),
                    "type": "team", "is_team_channel": True, "team_key": key,
                    "members_ids": [], "created_at": _now(),
                })
        await db.channels.update_one({"id": cid}, {"$addToSet": {"members_ids": uid}})
        await db.messages.insert_one({
            "id": _id(), "channel_id": cid, "author_id": "system",
            "text": f"{full_name} a été ajouté au canal.", "type": "system",
            "ts": _now(), "created_at": _now(),
        })
    for key in removed:
        cid = f"team-{key}"
        await db.channels.update_one({"id": cid}, {"$pull": {"members_ids": uid}})
        await db.messages.insert_one({
            "id": _id(), "channel_id": cid, "author_id": "system",
            "text": f"{full_name} a été retiré du canal.", "type": "system",
            "ts": _now(), "created_at": _now(),
        })



async def _corporate_members(canal_key: str) -> list[str]:
    """Return the employee IDs who *receive* (are staff for) a canal.

    Source of truth: the `service_channels_access` list explicitly set on the
    user profile. If NO user has this canal in their explicit access list,
    fall back to legacy role/status/department heuristics (backward compat)."""
    emps = await db.employees.find({}, {"_id": 0}).to_list(500)
    explicit = [e["id"] for e in emps if canal_key in (e.get("service_channels_access") or [])]
    if explicit:
        return explicit
    out: list[str] = []
    for e in emps:
        # Super admins are management-only accounts (no employee-facing UX),
        # they should never receive DMs.
        if e.get("is_super_admin"):
            continue
        role = (e.get("role") or "").lower()
        dept = (e.get("department") or "").lower()
        statuses = [s.lower() for s in (e.get("statuses") or [])]
        admin_role = (e.get("admin_role") or "").lower()
        is_admin = bool(e.get("is_admin"))
        is_comm = bool(e.get("can_manage_communication"))
        is_hr = bool(e.get("can_manage_hr"))
        match = False
        if canal_key == "service-rh":
            match = (
                is_hr
                or "rh" in admin_role
                or "rh" in statuses
                or "ressources humaines" in role
                or "responsable rh" in role
                or "chargée rh" in role
                or "assistant rh" in role
                or "ressources humaines" in dept
            )
        elif canal_key == "communication":
            match = (
                is_comm
                or "communication" in role
                or "communication" in dept
            )
        elif canal_key == "managers-ops":
            match = (
                "manager" in statuses
                or "manager" in role
                or ("responsable" in role and ("op" in dept or "ops" in dept or "restauration" in dept))
            )
        elif canal_key == "dept-financier":
            match = (
                "finance" in statuses
                or "finance" in role or "financier" in role or "financière" in role
                or "compta" in role or "comptab" in role
                or "finance" in dept or "compta" in dept or "comptab" in dept
            )
        elif canal_key == "direction":
            match = (
                "direction" in statuses
                or "direction" in admin_role
                or "directeur" in role or "directrice" in role
                or "responsable opérationnel" in role
                or (is_admin and "direction" in dept)
            )
        if match:
            out.append(e["id"])
    return out


class CorporateCanalCreate(BaseModel):
    canal_key: str


@api.get("/channels/corporate/catalog")
async def corporate_catalog():
    """List the corporate canals available to the current user (DB-backed
    catalog — falls back to constants if the collection is empty)."""
    uid = current_user()
    catalog = await _get_channel_catalog("service")
    if not catalog:
        catalog = [
            {"key": k, "name": v["name"], "icon": v.get("icon"),
             "description": v.get("description", "")}
            for k, v in CORPORATE_CANALS.items()
        ]
    out = []
    for meta in catalog:
        key = meta["key"]
        recipients = await _corporate_members(key)
        cid = _corporate_channel_id(key, uid)
        ch = await db.channels.find_one({"id": cid}, {"_id": 0})
        out.append({
            "key": key,
            "name": meta["name"],
            "icon": meta.get("icon"),
            "description": meta.get("description", ""),
            # Total members of the service (including self) — reflects the
            # real audience of the canal, not "others" only.
            "recipient_count": len(recipients),
            "already_open": bool(ch),
            "channel_id": cid if ch else None,
        })
    return out


@api.post("/channels/corporate")
async def open_corporate_canal(payload: CorporateCanalCreate):
    """Open (create or reuse) a corporate canal thread between the caller
    and the members of the target service. Idempotent per user."""
    key = (payload.canal_key or "").strip()
    if key not in CORPORATE_CANALS:
        raise HTTPException(400, "Canal inconnu")
    uid = current_user()
    meta = CORPORATE_CANALS[key]
    cid = _corporate_channel_id(key, uid)
    recipients = await _corporate_members(key)
    members = list({uid, *recipients})
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if ch:
        # Refresh members list so newly-onboarded RH/Direction staff are included
        merged = list({*(ch.get("members_ids") or []), *members})
        if set(merged) != set(ch.get("members_ids") or []):
            await db.channels.update_one(
                {"id": cid},
                {"$set": {"members_ids": merged, "members": len(merged)}},
            )
            ch["members_ids"] = merged
            ch["members"] = len(merged)
        return await _strip(ch)
    ch = {
        "id": cid,
        "name": meta["name"],
        "icon": meta["icon"],
        "members": len(members),
        "members_ids": members,
        "unread": 0,
        "is_dm": False,
        "is_group": True,
        "is_official": True,
        "is_corporate": True,
        "corporate_key": key,
        "archived": False,
        "avatar": None,
        "created_at": _now(),
    }
    await db.channels.insert_one(ch.copy())
    return await _strip(ch)


class CorporateBroadcast(BaseModel):
    canal_key: str
    content: str
    audience_statuses: List[str] = []  # empty = all employees
    attachments: List[dict] = []
    link: Optional[str] = None  # optional URL / route to a dedicated page


@api.post("/channels/corporate/broadcast")
async def corporate_broadcast(payload: CorporateBroadcast):
    """Service staff-initiated mass DM: post an official message signed by the
    service into the per-employee `corp-{key}-{uid}` thread of every targeted
    employee. Only members of the canal (i.e. users whose
    `service_channels_access` includes the key) can send a broadcast.
    Targeted employees receive it in their personal messagerie; the sender
    sees each thread on the service side (right pane, service avatar)."""
    key = (payload.canal_key or "").strip()
    if key not in CORPORATE_CANALS:
        raise HTTPException(400, "Canal inconnu")
    sender_id = current_user()
    sender = await db.employees.find_one({"id": sender_id}, {"_id": 0}) or {}
    if key not in (sender.get("service_channels_access") or []):
        raise HTTPException(403, "Vous ne faites pas partie de ce canal service")
    if not (payload.content or "").strip() and not payload.attachments and not payload.link:
        raise HTTPException(400, "Le message est vide")
    meta = CORPORATE_CANALS[key]
    sender_name = f"{sender.get('first_name','')} {sender.get('last_name','')}".strip()
    # Prepare message content — auto-sign with the sender identity
    body = (payload.content or "").rstrip()
    if payload.link:
        body = f"{body}\n\n🔗 {payload.link}"
    if body and f"— {sender_name}" not in body and sender_name:
        body = f"{body}\n\n— {sender_name}"
    # Resolve audience
    emps = await db.employees.find({}, {"_id": 0}).to_list(1000)
    active = [e for e in emps if e.get("account_status") != "deactivated"]
    if payload.audience_statuses:
        targeted = [e for e in active if _user_matches_audience(e, payload.audience_statuses)]
    else:
        targeted = active
    # Broadcast reaches every targeted employee — including the sender
    # themselves and other service staff — as long as they match the audience
    # filter. Each recipient gets the message in their PERSONAL
    # `corp-{key}-{recipient}` thread (their own inbox row). The sender then
    # sees the copy addressed to them on the "personal" side and every other
    # copy on the "service" side.
    service_staff = set(await _corporate_members(key))
    recipients = targeted
    now = _now()
    for e in recipients:
        cid = _corporate_channel_id(key, e["id"])
        members = list({e["id"], *service_staff})
        ch = await db.channels.find_one({"id": cid}, {"_id": 0})
        if not ch:
            await db.channels.insert_one({
                "id": cid, "name": meta["name"], "icon": meta.get("icon"),
                "members": len(members), "members_ids": members, "unread": 1,
                "is_dm": False, "is_group": True, "is_official": True,
                "is_corporate": True, "corporate_key": key,
                "archived": False, "avatar": None, "created_at": now,
            })
        else:
            merged = list({*(ch.get("members_ids") or []), *members})
            await db.channels.update_one(
                {"id": cid},
                {"$set": {"members_ids": merged, "members": len(merged)}, "$inc": {"unread": 1}},
            )
        msg = {
            "id": _id(),
            "channel_id": cid,
            "author_id": sender_id,
            "author_name": sender_name,
            "content": body,
            "attachments": payload.attachments or [],
            "is_service_message": True,
            "service_name": meta["name"],
            "service_key": key,
            "type": "text",
            "ts": now,
            "created_at": now,
        }
        await db.messages.insert_one(msg.copy())
        await db.channels.update_one({"id": cid}, {"$set": {"last_message_ts": now}})
        # Push a notification so the header envelope + inline badge light up
        await _push_notification(
            employee_id=e["id"],
            type="message",
            title=f"{meta['name']} · Diffusion",
            content=(payload.content or "")[:120] or (payload.link or "Nouveau document"),
            icon="briefcase",
            link=f"/messagerie?ch={cid}",
        )
    return {"ok": True, "sent": len(recipients)}


# ─── DM channels (create or fetch a direct channel with an employee)
class DMCreate(BaseModel):
    employee_id: str


@api.post("/channels/dm")
async def create_dm(payload: DMCreate):
    other = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not other:
        raise HTTPException(404, "Employee not found")
    # Deterministic channel id for both sides — sort the two IDs alphabetically
    a, b = sorted([current_user(), payload.employee_id])
    cid = f"dm-{a}--{b}"
    # Backwards compatibility: keep the legacy id `dm-<other>` if it already
    # exists (created before we introduced sorted ids).
    legacy_cid = f"dm-{payload.employee_id}"
    existing = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not existing:
        existing = await db.channels.find_one({"id": legacy_cid}, {"_id": 0})
    if existing:
        # Ensure members_ids is filled for old channels
        if not existing.get("members_ids"):
            await db.channels.update_one(
                {"id": existing["id"]},
                {"$set": {"members_ids": [current_user(), payload.employee_id]}},
            )
            existing["members_ids"] = [current_user(), payload.employee_id]
        return await _strip(existing)
    ch = {
        "id": cid,
        "name": f"{other['first_name']} {other['last_name']}",
        "icon": "user",
        "members": 2,
        "members_ids": [current_user(), payload.employee_id],
        "unread": 0,
        "is_dm": True,
        "is_group": False,
        "archived": False,
        "avatar": other.get("avatar"),
        "created_at": _now(),
    }
    await db.channels.insert_one(ch.copy())
    return await _strip(ch)


class GroupCreate(BaseModel):
    name: str
    member_ids: List[str]


@api.post("/channels/group")
async def create_group(payload: GroupCreate):
    if not payload.name.strip() or len(payload.member_ids) < 1:
        raise HTTPException(400, "Nom et membres requis")
    cid = f"grp-{_id()[:8]}"
    # De-dupe members and always include the creator
    all_members = list({*payload.member_ids, current_user()})
    ch = {
        "id": cid,
        "name": payload.name.strip(),
        "icon": "users",
        "members": len(all_members),
        "unread": 0,
        "is_dm": False,
        "is_group": True,
        "archived": False,
        "members_ids": all_members,
        "created_by": current_user(),
        "avatar_url": None,
        "created_at": _now(),
    }
    await db.channels.insert_one(ch.copy())
    return await _strip(ch)


# ─── Group management: add / remove members, rename, change avatar
class MemberAdd(BaseModel):
    employee_id: str


class ChannelPatch(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


@api.post("/channels/{cid}/members")
async def add_channel_member(cid: str, payload: MemberAdd):
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Conversation introuvable")
    if ch.get("is_dm"):
        raise HTTPException(400, "Impossible d'ajouter un membre à une discussion privée")
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    members = list(ch.get("members_ids") or [])
    if payload.employee_id in members:
        raise HTTPException(400, "Ce membre est déjà dans le groupe")
    members.append(payload.employee_id)
    await db.channels.update_one(
        {"id": cid},
        {"$set": {"members_ids": members, "members": len(members)}},
    )
    ch["members_ids"] = members
    ch["members"] = len(members)
    return await _strip(ch)


@api.delete("/channels/{cid}/members/{eid}")
async def remove_channel_member(cid: str, eid: str):
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Conversation introuvable")
    if ch.get("is_dm"):
        raise HTTPException(400, "Impossible de retirer un membre d'une discussion privée")
    members = [m for m in (ch.get("members_ids") or []) if m != eid]
    await db.channels.update_one(
        {"id": cid},
        {"$set": {"members_ids": members, "members": len(members)}},
    )
    ch["members_ids"] = members
    ch["members"] = len(members)
    return await _strip(ch)


@api.patch("/channels/{cid}")
async def patch_channel(cid: str, payload: ChannelPatch):
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Conversation introuvable")
    if ch.get("is_dm"):
        raise HTTPException(400, "Impossible de modifier une discussion privée")
    updates = {}
    if payload.name is not None and payload.name.strip():
        updates["name"] = payload.name.strip()
    if payload.avatar_url is not None:
        updates["avatar_url"] = payload.avatar_url or None
    if not updates:
        return await _strip(ch)
    await db.channels.update_one({"id": cid}, {"$set": updates})
    ch.update(updates)
    return await _strip(ch)


@api.post("/channels/{cid}/archive")
async def archive_channel(cid: str):
    """Archive (or restore) a DM/group channel. Team channels cannot be archived."""
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Channel not found")
    if not ch.get("is_dm") and not ch.get("is_group"):
        raise HTTPException(400, "Seules les discussions directes et groupes peuvent être archivés")
    new_state = not ch.get("archived", False)
    await db.channels.update_one({"id": cid}, {"$set": {"archived": new_state}})
    ch["archived"] = new_state
    return ch


@api.delete("/channels/{cid}")
async def delete_channel(cid: str):
    """Delete a DM/group channel and its messages. Team channels cannot be deleted."""
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Channel not found")
    if not ch.get("is_dm") and not ch.get("is_group"):
        raise HTTPException(400, "Seules les discussions directes et groupes peuvent être supprimés")
    await db.channels.delete_one({"id": cid})
    await db.messages.delete_many({"channel_id": cid})
    return {"ok": True, "id": cid}


# ═══════════════════════════════════════════════════════════════════
# Mock login — verifies credentials and returns the employee_id to
# store on the frontend (sent back via X-Employee-Id header).
# ═══════════════════════════════════════════════════════════════════
class LoginRequest(BaseModel):
    email: str
    password: str


_LOGIN_CREDENTIALS = {
    "idriss.malonga@gmail.com": ("Idriss2026!", "emp-idriss-malonga"),
    "idriss.malonga@mspark.fr": ("Idriss2026!", "emp-idriss-malonga"),
    "marcus.simeo@mspark.fr": ("MSPark@Admin2026!", ADMIN_EMPLOYEE_ID),
    "marcus.simeo@gmail.com": ("MSPark@Admin2026!", ADMIN_EMPLOYEE_ID),
    "lea.dubois@mspark.fr": ("MSPark@Comm2026!", "emp-lea-comm"),
    "lea.dubois.comm@gmail.com": ("MSPark@Comm2026!", "emp-lea-comm"),
    "superadmin@mspark.fr": ("MSPark@Super2026!", "emp-super-admin"),
}


@api.post("/auth/login")
async def auth_login(payload: LoginRequest):
    email = payload.email.lower().strip()

    # 1) Hardcoded demo credentials — but the DB password takes precedence if the
    #    user has changed it via /me/change-password. This preserves the ability
    #    for seed accounts to update their own password permanently.
    creds = _LOGIN_CREDENTIALS.get(email)
    if creds:
        expected_pwd, eid = creds
        emp = await db.employees.find_one({"id": eid}, {"_id": 0})
        if emp:
            if emp.get("account_status") in ("suspended", "deactivated"):
                raise HTTPException(403, "Ce compte est désactivé. Contactez l'administrateur.")
            # Accept DB password (if set) OR the seed password
            db_pwd = emp.get("password")
            if payload.password != expected_pwd and (not db_pwd or payload.password != db_pwd):
                raise HTTPException(401, "Mot de passe incorrect")
            return {
                "employee_id": eid,
                "is_admin": emp.get("is_admin", False),
                "can_manage_communication": emp.get("can_manage_communication", False),
                "first_name": emp["first_name"],
                "last_name": emp["last_name"],
                "must_change_password": bool(emp.get("must_change_password")),
            }
        if payload.password != expected_pwd:
            raise HTTPException(401, "Mot de passe incorrect")

    # 2) DB users (created via admin panel)
    emp = await db.employees.find_one(
        {"$or": [{"email": email}, {"personal_email": email}]}, {"_id": 0}
    )
    if emp and emp.get("password") and payload.password == emp["password"]:
        if emp.get("account_status") in ("suspended", "deactivated"):
            raise HTTPException(403, "Ce compte est désactivé. Contactez l'administrateur.")
        return {
            "employee_id": emp["id"],
            "is_admin": emp.get("is_admin", False),
            "can_manage_communication": emp.get("can_manage_communication", False),
            "first_name": emp["first_name"],
            "last_name": emp["last_name"],
            "must_change_password": bool(emp.get("must_change_password")),
        }

    raise HTTPException(401, "Identifiants inconnus. Essayez idriss.malonga@gmail.com, marcus.simeo@mspark.fr ou lea.dubois@mspark.fr.")


# ═══════════════════════════════════════════════════════════════════
# Admin — User management (Utilisateurs)
# ═══════════════════════════════════════════════════════════════════

def _gen_password(length: int = 12) -> str:
    """Generate a friendly temp password: 3 upper + 5 lower + 2 digits + 2 punct."""
    import random, string
    parts = (
        random.choices(string.ascii_uppercase, k=3)
        + random.choices(string.ascii_lowercase, k=5)
        + random.choices(string.digits, k=2)
        + random.choices("!@#$%*", k=2)
    )
    random.shuffle(parts)
    return "".join(parts)


def _gen_matricule() -> str:
    """Auto-generated badge number (format MSP-XXXXX)."""
    import random
    return f"MSP-{random.randint(10000, 99999)}"


class UserCreate(BaseModel):
    # Section 1 — Account info
    first_name: str
    last_name: str
    birth_date: Optional[str] = None  # YYYY-MM-DD
    email: Optional[str] = None  # professional
    personal_email: str  # required
    phone: Optional[str] = None  # professional
    personal_phone: str  # required
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = "France"
    avatar: Optional[str] = None
    temp_password: Optional[str] = None
    force_password_change: bool = True
    account_status: str = "active"  # active | suspended | deactivated
    # Section 2 — HR
    statuses: List[str] = []  # ops, management, bureau, direction, alternant, stage
    department: Optional[str] = None
    role: Optional[str] = None  # job title
    manager_id: Optional[str] = None
    contract_type: Optional[str] = None  # CDI, CDD, Alternance, Stage, Intérim
    weekly_hours: Optional[str] = None  # 24h, 28h, 35h
    hire_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    category: Optional[str] = None  # Employé, Agent maîtrise, Cadre
    badge_rfid: Optional[str] = None
    badge_expiry: Optional[str] = None  # YYYY-MM-DD
    badge_active: Optional[bool] = True
    locker: Optional[str] = None
    # Section 3 — Planning
    work_days: List[str] = []  # ["monday", "tuesday", ...]
    off_days: List[str] = []
    remote_days: List[str] = []  # jours de télétravail récurrent
    usual_hours: Optional[str] = None
    break_time: Optional[str] = None
    # Section 4 — Payroll
    gross_salary: Optional[float] = None
    net_salary: Optional[float] = None
    hourly_rate: Optional[float] = None
    iban: Optional[str] = None
    bic: Optional[str] = None
    account_holder: Optional[str] = None
    meal_points: Optional[int] = None
    contract_url: Optional[str] = None
    # Section 7 — Access
    admin_role: str = "employe"  # employe | manager | rh | communication | comptabilite | direction | superadmin
    permissions: List[str] = []
    groups: List[str] = []
    # Section 8 — Messagerie & Canaux (source of truth per user)
    # Service canals: user reads & replies "on behalf of" the service.
    service_channels_access: List[str] = []  # keys: service-rh | communication | managers-ops | dept-financier | direction
    # Team/discussion canals: user chats with their personal identity.
    team_channel_ids: List[str] = []  # keys: karting | attractions | nettoyage | securite | maintenance | employes-ops | managers-ops-chat
    # Legacy compat
    role_category: str = "employe"


class UserUpdate(BaseModel):
    """Truly-partial update model. Every field is Optional so a PUT can only
    touch what the caller explicitly sends."""
    # Section 1 — Account info
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None
    email: Optional[str] = None
    personal_email: Optional[str] = None
    phone: Optional[str] = None
    personal_phone: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    avatar: Optional[str] = None
    temp_password: Optional[str] = None
    force_password_change: Optional[bool] = None
    account_status: Optional[str] = None
    # Section 2 — HR
    statuses: Optional[List[str]] = None
    department: Optional[str] = None
    role: Optional[str] = None
    manager_id: Optional[str] = None
    contract_type: Optional[str] = None
    weekly_hours: Optional[str] = None
    hire_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    category: Optional[str] = None
    badge_rfid: Optional[str] = None
    badge_expiry: Optional[str] = None
    badge_active: Optional[bool] = None
    locker: Optional[str] = None
    # Section 3 — Planning
    work_days: Optional[List[str]] = None
    off_days: Optional[List[str]] = None
    remote_days: Optional[List[str]] = None
    usual_hours: Optional[str] = None
    break_time: Optional[str] = None
    # Section 4 — Payroll
    gross_salary: Optional[float] = None
    net_salary: Optional[float] = None
    hourly_rate: Optional[float] = None
    iban: Optional[str] = None
    bic: Optional[str] = None
    account_holder: Optional[str] = None
    meal_points: Optional[int] = None
    contract_url: Optional[str] = None
    # Section 7 — Access
    admin_role: Optional[str] = None
    permissions: Optional[List[str]] = None
    groups: Optional[List[str]] = None
    # Section 8 — Messagerie & Canaux
    service_channels_access: Optional[List[str]] = None
    team_channel_ids: Optional[List[str]] = None
    role_category: Optional[str] = None


class StatusPayload(BaseModel):
    account_status: str  # active | suspended | deactivated


async def _require_admin_full():
    """Admin-only user management. Allows either is_admin, full_admin permission,
    or manage_users permission."""
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me:
        raise HTTPException(403, "Accès administrateur requis")
    if me.get("is_admin"):
        return me
    perms = set(me.get("permissions") or [])
    if "full_admin" in perms or "manage_users" in perms:
        return me
    raise HTTPException(403, "Accès administrateur requis")


@api.get("/admin/users")
async def admin_list_users():
    await _require_admin_full()
    items = await db.employees.find({}, {"_id": 0, "password": 0}).to_list(500)
    return items


@api.get("/admin/users/{uid}")
async def admin_get_user(uid: str):
    await _require_admin_full()
    u = await db.employees.find_one({"id": uid}, {"_id": 0, "password": 0})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    return u


@api.post("/admin/users")
async def admin_create_user(payload: UserCreate):
    await _require_admin_full()
    data = payload.model_dump()
    data["id"] = _id()
    data["matricule"] = data.get("matricule") or _gen_matricule()
    temp_pwd = data.pop("temp_password", None) or _gen_password()
    data["password"] = temp_pwd
    data["must_change_password"] = bool(data.pop("force_password_change", True))
    # Admin role mapping
    admin_role = data.get("admin_role", "employe")
    data["is_admin"] = admin_role in ("superadmin", "direction")
    data["can_manage_communication"] = admin_role in ("communication", "superadmin", "direction")
    # Legacy fields
    data.setdefault("available", True)
    data.setdefault("seniority_months", 0)
    data.setdefault("skills", [])
    if not data.get("avatar"):
        data["avatar"] = "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop"
    if not data.get("email"):
        data["email"] = data.get("personal_email")
    if not data.get("phone"):
        data["phone"] = data.get("personal_phone")
    data.setdefault("leave_balance", {"cp_n_1": 0, "cp_n": 0, "rtt": 0})
    data.setdefault("weekly_pattern", {})
    data.setdefault("created_at", _now())
    # ─── First-connection onboarding flags. Cleared as the user progresses
    # through the WelcomePopup (welcomed_at) and the guided intranet tour
    # (tour_completed_at). Ensures EVERY freshly-created employee gets the
    # same experience on their very first login.
    data["onboarding_pending"] = True
    data.setdefault("welcomed_at", None)
    data.setdefault("tour_completed_at", None)
    _apply_user_derivations(data)
    await db.employees.insert_one(data.copy())

    # Generate an initial 7-day sample planning based on the weekly pattern.
    # Starts on the next Monday so the admin sees a complete week.
    try:
        pattern = data.get("weekly_pattern") or {}
        if pattern:
            today = date.today()
            days_until_monday = (7 - today.weekday()) % 7 or 7  # next Monday
            start = today + timedelta(days=days_until_monday)
            for i in range(7):
                d = start + timedelta(days=i)
                p = (pattern.get(str(d.weekday())) or {})
                is_off = not p or p.get("type") == "off"
                sched_doc = {
                    "id": _id(),
                    "employee_id": data["id"],
                    "day": d.isoformat(),
                    "shift_type": "off" if is_off else "work",
                    "start_time": None if is_off else p.get("start"),
                    "end_time": None if is_off else p.get("end"),
                    "role": data.get("role"),
                    "service": data.get("department"),
                    "manager": data.get("manager"),
                    "source": "auto-seed-7d",
                    "created_at": _now(),
                }
                await db.schedules.insert_one(sched_doc)
    except Exception as _e:
        pass
    # Register a Documents RH entry if a contract was uploaded during creation
    if data.get("contract_url"):
        await db.documents.insert_one({
            "id": _id(),
            "target_employee_id": data["id"],
            "name": f"Contrat de travail — {data['first_name']} {data['last_name']}",
            "category": "Contrat",
            "url": data["contract_url"],
            "issued_at": _now(),
            "uploaded_at": _now(),
        })

    # ─── Onboarding: automatic welcome DM from the "Service RH" channel
    # with actionable links to the key intranet pages the new user needs.
    # Members = new user + all RH staff. The admin who creates the user is
    # NOT added (unless they are RH staff themselves) so a non-RH admin
    # never sees this thread in their personal messagerie.
    await _post_rh_welcome_dm(data)

    # Team channels: enroll the new user in the ones the admin selected
    if data.get("team_channel_ids"):
        await _sync_team_channel_membership(data["id"], [], data["team_channel_ids"])

    # Return the generated password so the admin can share it
    return {"user": {k: v for k, v in data.items() if k != "password"},
            "temp_password": temp_pwd}


async def _post_rh_welcome_dm(user: dict) -> None:
    """Idempotently create the Service RH welcome thread for a brand-new
    employee and post the official onboarding message with actionable links.
    Reused by `admin_create_user` (wizard) and `_seed_julien_bernard`
    (startup seed) so both paths share the exact same template."""
    rh_channel_id = f"rh-{user['id']}"
    rh_staff = await _corporate_members("service-rh")
    all_members = list({user["id"], *rh_staff})
    existing = await db.channels.find_one({"id": rh_channel_id}, {"_id": 0})
    if not existing:
        await db.channels.insert_one({
            "id": rh_channel_id,
            "name": "Service RH",
            "icon": "briefcase",
            "members": len(all_members),
            "members_ids": all_members,
            "unread": 1,
            "is_dm": False,
            "is_group": True,
            "is_official": True,
            "corporate_key": "service-rh",
            "archived": False,
            "avatar": None,
            "created_at": _now(),
        })
    else:
        # Ensure RH staff membership + canonical channel name stay in sync
        # (older channels created with a different name are normalized here).
        await db.channels.update_one(
            {"id": rh_channel_id},
            {"$set": {"members_ids": all_members, "members": len(all_members),
                       "name": "Service RH", "icon": "briefcase",
                       "corporate_key": "service-rh"}},
        )
    # Skip if a welcome message is already present in that thread
    has_msg = await db.messages.find_one({"channel_id": rh_channel_id})
    if has_msg:
        return
    welcome_content = (
        f"Bonjour {user['first_name']} 👋\n\n"
        f"Bienvenue chez MS Park ! Voici les liens essentiels pour bien démarrer :"
    )
    welcome_attachments = [
        {"kind": "link", "name": "Mes documents RH", "url": "/documents",
         "description": "Contrats, fiches de paie et pièces administratives"},
        {"kind": "link", "name": "Règlement intérieur", "url": "/documents?category=Reglement",
         "description": "À lire et à signer dans vos 15 premiers jours"},
        {"kind": "link", "name": "Mon planning", "url": "/rh/planning",
         "description": "Vos shifts, jours OFF et congés validés"},
        {"kind": "link", "name": "Badgeage", "url": "/rh/badgeage",
         "description": "Pointer début / pause / fin de journée"},
        {"kind": "link", "name": "Poser un congé", "url": "/rh/demandes",
         "description": "Demandes de CP, RTT, récupération"},
        {"kind": "link", "name": "Points repas & Restauration", "url": "/restaurant",
         "description": f"Vous avez {user.get('meal_points', 0)} points/jour"},
        {"kind": "link", "name": "CSE & Avantages", "url": "/avantages",
         "description": "Réductions partenaires + billets gratuits"},
    ]
    now = _now()
    await db.messages.insert_one({
        "id": _id(),
        "channel_id": rh_channel_id,
        "author_id": "system-rh",
        "author_name": "Service RH",
        "content": welcome_content,
        "attachments": welcome_attachments,
        "ts": now,
        "created_at": now,
        "is_official": True,
    })
    await db.channels.update_one({"id": rh_channel_id}, {"$set": {"last_message_ts": now}})
    await _push_notification(
        employee_id=user["id"],
        type="message",
        title="Service RH",
        content=f"Bienvenue {user['first_name']} ! Retrouvez vos liens essentiels.",
        icon="briefcase",
        link=f"/messagerie?ch={rh_channel_id}",
    )


@api.get("/admin/channels/catalog")
async def admin_channels_catalog():
    """Return the 2 catalogs (service & team) used by the admin user editor
    to toggle a user's canal accesses."""
    await _require_admin_full()
    return {
        "service_channels": await _get_channel_catalog("service"),
        "team_channels": await _get_channel_catalog("team"),
    }


class ChannelMetaCreate(BaseModel):
    kind: str  # "service" | "team"
    name: str
    icon: Optional[str] = None
    description: Optional[str] = ""


class ChannelMetaUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None


@api.post("/admin/channels/catalog")
async def admin_channel_catalog_create(payload: ChannelMetaCreate):
    """Create a new team or service canal. For team canals, an empty
    `team-{key}` chat channel is created immediately so members can be
    assigned. Service canals are DM-like: a `corp-{key}-{uid}` thread is
    created per employee only on first interaction."""
    await _require_admin_full()
    kind = payload.kind
    if kind not in ("service", "team"):
        raise HTTPException(400, "Type invalide")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(400, "Nom requis")
    # Slugify + ensure unique
    base_key = _slugify(name)
    key = base_key
    n = 1
    while await db.channel_catalog.find_one({"kind": kind, "key": key}):
        n += 1
        key = f"{base_key}-{n}"
    row = {
        "kind": kind, "key": key, "name": name,
        "icon": payload.icon or ("briefcase" if kind == "service" else "users"),
        "description": (payload.description or "").strip(),
        "created_at": _now(),
    }
    await db.channel_catalog.insert_one(row.copy())
    # For team canals, materialize the shared chat channel now
    if kind == "team":
        cid = f"team-{key}"
        exists = await db.channels.find_one({"id": cid})
        if not exists:
            await db.channels.insert_one({
                "id": cid, "name": name, "icon": row["icon"],
                "type": "team", "is_team_channel": True, "team_key": key,
                "members_ids": [], "created_at": _now(),
            })
    row.pop("_id", None)
    return row


@api.patch("/admin/channels/catalog/{kind}/{key}")
async def admin_channel_catalog_update(kind: str, key: str, payload: ChannelMetaUpdate):
    """Rename a canal — cascades the new name to every existing chat
    channel bound to it (team-{key} + all corp-{key}-* + rh-* for
    service-rh)."""
    await _require_admin_full()
    meta = await db.channel_catalog.find_one({"kind": kind, "key": key}, {"_id": 0})
    if not meta:
        raise HTTPException(404, "Canal introuvable")
    updates = {}
    for k in ("name", "icon", "description"):
        v = getattr(payload, k, None)
        if v is not None:
            updates[k] = v.strip() if isinstance(v, str) else v
    if not updates:
        return meta
    await db.channel_catalog.update_one({"kind": kind, "key": key}, {"$set": updates})
    # Cascade to messaging channels
    if kind == "team":
        chan_updates = {}
        if "name" in updates:
            chan_updates["name"] = updates["name"]
        if "icon" in updates:
            chan_updates["icon"] = updates["icon"]
        if chan_updates:
            await db.channels.update_one({"id": f"team-{key}"}, {"$set": chan_updates})
    else:  # service
        chan_updates = {}
        if "name" in updates:
            chan_updates["name"] = updates["name"]
        if "icon" in updates:
            chan_updates["icon"] = updates["icon"]
        if chan_updates:
            patterns = [{"corporate_key": key}]
            if key == "service-rh":
                patterns.append({"id": {"$regex": "^rh-"}})
            await db.channels.update_many({"$or": patterns}, {"$set": chan_updates})
    merged = {**meta, **updates}
    return merged


@api.delete("/admin/channels/catalog/{kind}/{key}")
async def admin_channel_catalog_delete(kind: str, key: str):
    """Delete a canal from the catalog and cascade: remove every bound
    chat channel + their messages, purge the key from every user's access
    list, and remove tied notifications."""
    await _require_admin_full()
    meta = await db.channel_catalog.find_one({"kind": kind, "key": key}, {"_id": 0})
    if not meta:
        raise HTTPException(404, "Canal introuvable")
    # 1. Collect all channel ids to delete
    channel_ids: list[str] = []
    if kind == "team":
        channel_ids.append(f"team-{key}")
    else:
        query = {"corporate_key": key}
        chans = await db.channels.find(query, {"_id": 0, "id": 1}).to_list(500)
        channel_ids.extend([c["id"] for c in chans])
        if key == "service-rh":
            rh_chans = await db.channels.find(
                {"id": {"$regex": "^rh-"}}, {"_id": 0, "id": 1}
            ).to_list(500)
            channel_ids.extend([c["id"] for c in rh_chans])
    # 2. Delete messages, channel_reads, notifications tied to these ids
    if channel_ids:
        await db.messages.delete_many({"channel_id": {"$in": channel_ids}})
        await db.channel_reads.delete_many({"channel_id": {"$in": channel_ids}})
        # Notifications linking to these channels
        for cid in channel_ids:
            await db.notifications.delete_many({"link": {"$regex": f"(ch|channel)={cid}"}})
        await db.channels.delete_many({"id": {"$in": channel_ids}})
    # 3. Purge key from every user's access list
    field = "team_channel_ids" if kind == "team" else "service_channels_access"
    await db.employees.update_many({field: key}, {"$pull": {field: key}})
    # 4. Remove catalog entry
    await db.channel_catalog.delete_one({"kind": kind, "key": key})
    return {"ok": True, "deleted_channels": len(channel_ids)}


@api.put("/admin/users/{uid}")
async def admin_update_user(uid: str, payload: UserUpdate):
    await _require_admin_full()
    u = await db.employees.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    # Only touch fields the caller explicitly sent (partial update).
    # exclude_unset ensures a missing field doesn't overwrite existing values
    # (including permissions, statuses, work_days, is_admin flags, etc.).
    data = payload.model_dump(exclude_unset=True)
    prev_team_channels = u.get("team_channel_ids") or []
    prev_service_channels = u.get("service_channels_access") or []
    # Never touch the password via this endpoint (dedicated reset endpoint exists)
    data.pop("password", None)
    # Only recompute admin flags when admin_role was explicitly provided.
    if "admin_role" in data:
        data["is_admin"] = data["admin_role"] in ("superadmin", "direction")
        data["can_manage_communication"] = data["admin_role"] in (
            "communication", "superadmin", "direction",
        )
    # Merge current employee data with updates for derivation
    merged = {**u, **data}
    _apply_user_derivations(merged)
    # Persist derived fields when their inputs were part of the update payload.
    if "weekly_hours" in data:
        data["contract_hours_weekly"] = merged["contract_hours_weekly"]
    if "work_days" in data or "off_days" in data or "usual_hours" in data or "remote_days" in data:
        data["weekly_pattern"] = merged["weekly_pattern"]
    if "statuses" in data or "meal_points" in data:
        data["meal_points"] = merged["meal_points"]
        data["daily_quota"] = merged["daily_quota"]
    if "badge_active" not in data and merged.get("badge_active") is not None:
        pass  # don't overwrite when caller didn't send it
    await db.employees.update_one({"id": uid}, {"$set": data})
    # ─── Cross-module sync: any change to the weekly pattern (work_days, off_days,
    # remote_days, usual_hours or weekly_pattern itself) must instantly propagate
    # to Planning admin, Planning employé, Badge, Congés and every module that
    # reads `db.schedules`. We purge future auto-generated entries and let
    # `_ensure_range()` re-materialize them from the fresh pattern on next fetch.
    pattern_touched = any(k in data for k in ("work_days", "off_days", "remote_days", "usual_hours", "weekly_pattern"))
    if pattern_touched:
        await _resync_pattern_schedules(uid)
    # ─── Team channels: reconcile membership when list changed
    if data.get("team_channel_ids") is not None:
        await _sync_team_channel_membership(uid, prev_team_channels, data["team_channel_ids"])
    # ─── Service canals: reconcile shared-inbox membership when access changed
    if data.get("service_channels_access") is not None:
        await _sync_service_channel_membership(uid, prev_service_channels, data["service_channels_access"])
    # If a new contract was attached and not already in Documents RH, register it
    if data.get("contract_url") and data.get("contract_url") != u.get("contract_url"):
        await db.documents.insert_one({
            "id": _id(),
            "target_employee_id": uid,
            "name": f"Contrat de travail — {u.get('first_name', '')} {u.get('last_name', '')}".strip(),
            "category": "Contrat",
            "url": data["contract_url"],
            "issued_at": _now(),
            "uploaded_at": _now(),
        })
    updated = await db.employees.find_one({"id": uid}, {"_id": 0, "password": 0})
    return updated


@api.post("/admin/users/{uid}/resync-schedule")
async def admin_resync_user_schedule(uid: str):
    """Force a full re-materialization of the employee's future planning from
    the current `weekly_pattern`. Preserves validated leaves / RTT and past days.
    Useful when off_days on the profile drifted from what's shown in Planning
    or Badge (should never happen after this endpoint exists, but kept as a
    safety net for legacy data)."""
    await _require_admin_full()
    u = await db.employees.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    stats = await _resync_pattern_schedules(uid)
    return {"ok": True, **stats}


@api.post("/admin/users/{uid}/status")
async def admin_set_user_status(uid: str, payload: StatusPayload):
    await _require_admin_full()
    if payload.account_status not in ("active", "suspended", "deactivated"):
        raise HTTPException(400, "Statut invalide")
    await db.employees.update_one(
        {"id": uid}, {"$set": {"account_status": payload.account_status}}
    )
    return {"ok": True, "status": payload.account_status}


@api.post("/admin/users/{uid}/reset-password")
async def admin_reset_user_password(uid: str):
    await _require_admin_full()
    u = await db.employees.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    new_pwd = _gen_password()
    await db.employees.update_one(
        {"id": uid},
        {"$set": {"password": new_pwd, "must_change_password": True}},
    )
    return {"ok": True, "temp_password": new_pwd}


@api.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str):
    await _require_admin_full()
    if uid in (ADMIN_EMPLOYEE_ID, CURRENT_EMPLOYEE_ID):
        raise HTTPException(400, "Impossible de supprimer un compte de démonstration")
    r = await db.employees.delete_one({"id": uid})
    return {"ok": True, "deleted": r.deleted_count}


# ═══════════════════════════════════════════════════════════════════
# Admin endpoints (require is_admin)
# ═══════════════════════════════════════════════════════════════════

class AdminScheduleEntry(BaseModel):
    employee_id: str
    day: str  # YYYY-MM-DD
    type: str  # shift | remote | off | leave | training | school
    start: Optional[str] = None
    end: Optional[str] = None
    pause_start: Optional[str] = None
    pause_end: Optional[str] = None
    break_minutes: Optional[int] = 0
    location: Optional[str] = None
    manager: Optional[str] = None
    service: Optional[str] = None
    note: Optional[str] = None


def _shift_minutes(entry: dict) -> int:
    """Compute net worked minutes for a 'shift' or 'remote' entry (excludes pause).
    Supports shifts that cross midnight (end <= start ⇒ shift ends the next day)."""
    if entry.get("type") not in ("shift", "remote") or not entry.get("start") or not entry.get("end"):
        return 0
    try:
        s = datetime.strptime(entry["start"], "%H:%M")
        e = datetime.strptime(entry["end"], "%H:%M")
        if e <= s:
            e = e + timedelta(days=1)
        m = int((e - s).total_seconds() // 60)
        if entry.get("pause_start") and entry.get("pause_end"):
            ps = datetime.strptime(entry["pause_start"], "%H:%M")
            pe = datetime.strptime(entry["pause_end"], "%H:%M")
            # Unwrap pause times when the shift crosses midnight
            if pe < ps:
                pe = pe + timedelta(days=1)
            if ps < s:
                ps = ps + timedelta(days=1)
                if pe < ps:
                    pe = pe + timedelta(days=1)
            m -= int((pe - ps).total_seconds() // 60)
        return max(0, m)
    except Exception:
        return 0


def _covered_minutes(entry: dict) -> int:
    """Minutes that count toward contract fulfilment.
    - Pour shift/remote/training/school : calcul depuis start/end - pause si horaires renseignés.
    - Fallback `covered_minutes` (leave, rtt, école générée en récurrence sans horaires).
    """
    t = entry.get("type")
    if t not in ("shift", "remote", "leave", "rtt", "training", "school"):
        return 0
    # Priorité : calcul depuis horaires si start ET end présents
    if entry.get("start") and entry.get("end"):
        try:
            s = datetime.strptime(entry["start"], "%H:%M")
            e = datetime.strptime(entry["end"], "%H:%M")
            if e <= s:
                e = e + timedelta(days=1)
            m = int((e - s).total_seconds() // 60)
            if entry.get("pause_start") and entry.get("pause_end"):
                ps = datetime.strptime(entry["pause_start"], "%H:%M")
                pe = datetime.strptime(entry["pause_end"], "%H:%M")
                if pe < ps:
                    pe = pe + timedelta(days=1)
                if ps < s:
                    ps = ps + timedelta(days=1)
                    if pe < ps:
                        pe = pe + timedelta(days=1)
                m -= int((pe - ps).total_seconds() // 60)
            return max(0, m)
        except Exception:
            pass
    # Fallback : covered_minutes explicite (leave/rtt/école bulk)
    if entry.get("covered_minutes") is not None:
        try:
            return max(0, int(entry["covered_minutes"]))
        except Exception:
            pass
    return 0


MEAL_POINTS_BY_STATUS = {
    # 35 pts — Direction et restauration
    "direction": 35,
    "restauration": 35,
    # 30 pts — Bureau, Management
    "bureau": 30,
    "management": 30,
    # 25 pts — OPS terrain, sécurité, nettoyage, maintenance, alternants et stagiaires
    "ops": 25,
    "securite": 25,
    "nettoyage": 25,
    "maintenance": 25,
    "alternant": 25,
    "stage": 25,
}

WEEKDAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _derive_meal_points(statuses: list[str], fallback: Optional[int] = None) -> int:
    """Return the highest meal_points quota matching the given statuses."""
    if not statuses:
        return fallback if fallback is not None else 20
    return max((MEAL_POINTS_BY_STATUS.get(s, 20) for s in statuses), default=20)


def _build_weekly_pattern(work_days: list[str], off_days: list[str], usual_hours: Optional[str], remote_days: Optional[list[str]] = None) -> dict:
    """Build weekly_pattern dict indexed by weekday int (0=Mon).
    remote_days marks recurring télétravail days — they still count as worked but with type='remote'."""
    # Parse usual_hours like "9h-17h" or "09:00-17:00"
    default_start, default_end = "09:00", "17:00"
    if usual_hours:
        parts = usual_hours.replace("h", ":").replace(" ", "").split("-")
        if len(parts) == 2:
            def _norm(t: str) -> str:
                if ":" not in t:
                    return f"{int(t):02d}:00"
                h, _, m = t.partition(":")
                return f"{int(h):02d}:{(m or '00').zfill(2)[:2]}"
            try:
                default_start = _norm(parts[0])
                default_end = _norm(parts[1])
            except Exception:
                pass
    pattern: dict = {}
    remote_set = set(remote_days or [])
    for d in work_days:
        idx = WEEKDAY_MAP.get(d)
        if idx is None:
            continue
        entry_type = "remote" if d in remote_set else "shift"
        pattern[str(idx)] = {"type": entry_type, "start": default_start, "end": default_end}
    for d in off_days:
        idx = WEEKDAY_MAP.get(d)
        if idx is None:
            continue
        pattern[str(idx)] = {"type": "off"}
    # remote_days that aren't in work_days: mark them as remote workdays anyway
    for d in remote_set:
        idx = WEEKDAY_MAP.get(d)
        if idx is None or str(idx) in pattern:
            continue
        pattern[str(idx)] = {"type": "remote", "start": default_start, "end": default_end}
    return pattern


def _apply_user_derivations(data: dict) -> None:
    """Mutate `data` in place: derive meal_points, weekly_pattern, daily_quota, contract_hours_weekly."""
    # Convert `weekly_hours` (free-input string, may be "24h" or "35" or "20.5") to a real number
    wh = data.get("weekly_hours")
    if wh not in (None, ""):
        try:
            data["contract_hours_weekly"] = float(str(wh).replace("h", "").replace(",", ".").strip())
        except ValueError:
            pass
    statuses = data.get("statuses") or []
    if data.get("meal_points") in (None, "", 0):
        data["meal_points"] = _derive_meal_points(statuses)
    data["daily_quota"] = data["meal_points"]
    work_days = data.get("work_days") or []
    off_days = data.get("off_days") or []
    remote_days = data.get("remote_days") or []
    if work_days or off_days or remote_days:
        listed = set(work_days) | set(off_days) | set(remote_days)
        for k in WEEKDAY_MAP:
            if k not in listed:
                off_days = list(off_days) + [k]
        data["weekly_pattern"] = _build_weekly_pattern(work_days, off_days, data.get("usual_hours"), remote_days)
    if data.get("badge_active") is None:
        data["badge_active"] = True


def _entry_from_pattern(emp: dict, day: date) -> dict:
    """Build a fresh schedule entry for `day` using the employee's weekly_pattern.
    Falls back to OFF when no pattern is defined."""
    pattern = emp.get("weekly_pattern") or {}
    p = pattern.get(str(day.weekday())) or {}
    if not p or p.get("type") == "off":
        return {
            "id": _id(),
            "employee_id": emp["id"],
            "day": day.isoformat(),
            "type": "off",
            "start": None, "end": None,
            "pause_start": None, "pause_end": None,
            "break_minutes": 0,
            "location": None, "manager": None, "service": None,
            "note": "Jour de repos",
        }
    return {
        "id": _id(),
        "employee_id": emp["id"],
        "day": day.isoformat(),
        "type": p.get("type", "shift"),
        "start": p.get("start"),
        "end": p.get("end"),
        "pause_start": p.get("pause_start"),
        "pause_end": p.get("pause_end"),
        "break_minutes": p.get("break_minutes", 0),
        "location": p.get("location") or ("Domicile" if p.get("type") == "remote" else "MS Park"),
        "manager": emp.get("manager"),
        "service": emp.get("department"),
        "note": "Télétravail" if p.get("type") == "remote" else None,
    }


# ─── Constants
SHIFT_HORIZON_CAP = date(2026, 8, 1)
"""Auto-generation of shifts stops at this date. Beyond this cap, the admin
must build the planning manually — but validated leaves, RTT and exceptional
events are still allowed and preserved."""


def _shift_horizon_cap() -> date:
    """Auto-generate one year ahead of today (or the fixed cap if larger)."""
    return max(SHIFT_HORIZON_CAP, date.today() + timedelta(days=365))


async def _ensure_range(employee_id: str, start: date, end: date) -> None:
    """Materialize any missing schedule days between [start, end] from the employee's pattern.
    Only auto-generates up to SHIFT_HORIZON_CAP. Idempotent. Users without a weekly_pattern
    are skipped (no artificial off-day rows) so that public-holiday defaults still apply."""
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        return
    if not emp.get("weekly_pattern"):
        return
    existing_days = set()
    async for e in db.schedules.find(
        {"employee_id": employee_id,
         "day": {"$gte": start.isoformat(), "$lte": end.isoformat()}},
        {"_id": 0, "day": 1},
    ):
        existing_days.add(e["day"])
    cap = _shift_horizon_cap()
    to_insert = []
    d = start
    while d <= end:
        if d.isoformat() not in existing_days and d <= cap:
            to_insert.append(_entry_from_pattern(emp, d))
        d = d + timedelta(days=1)
    if to_insert:
        await db.schedules.insert_many(to_insert)


async def _resync_pattern_schedules(employee_id: str, from_day: Optional[date] = None) -> dict:
    """Purge future auto-generated schedule entries so `_ensure_range()` re-materializes
    them from the up-to-date `weekly_pattern`. Approved leaves / RTT are preserved.
    Legacy-schema rows (shift_type/start_time) are always purged so they get re-created
    with the current schema. Also clears future badging entries.

    Called automatically whenever `work_days`, `off_days`, `remote_days`, `usual_hours`
    or `weekly_pattern` change on the employee, so every module (Planning admin,
    Planning employé, Badge, Congés, contract calculations) stays in sync with the
    single source of truth on the user profile."""
    from_iso = (from_day or date.today()).isoformat()
    # 1) Delete future auto-generated entries (keep validated leaves/RTT)
    r1 = await db.schedules.delete_many({
        "employee_id": employee_id,
        "day": {"$gte": from_iso},
        "type": {"$nin": ["leave", "rtt"]},
    })
    # 2) Delete any legacy-schema row at any date (they can't be interpreted by the app)
    r2 = await db.schedules.delete_many({
        "employee_id": employee_id,
        "shift_type": {"$exists": True},
    })
    # 3) Clear future badging so it will be regenerated from the fresh schedule
    r3 = await db.badging.delete_many({
        "employee_id": employee_id,
        "day": {"$gte": from_iso},
    })
    return {
        "schedules_deleted": (r1.deleted_count or 0) + (r2.deleted_count or 0),
        "badging_deleted": r3.deleted_count or 0,
    }


@api.get("/admin/employees")
async def admin_list_employees():
    await require_permission("view_stats", "manage_users", "approve_leaves")
    items = await db.employees.find({}, {"_id": 0}).to_list(500)
    # add total scheduled hours for current week
    today_d = date.today()
    monday_d = today_d - timedelta(days=today_d.weekday())
    sunday_d = monday_d + timedelta(days=6)
    monday = monday_d.isoformat()
    sunday = sunday_d.isoformat()
    for emp in items:
        await _ensure_range(emp["id"], monday_d, sunday_d)
        schs = await db.schedules.find(
            {"employee_id": emp["id"], "day": {"$gte": monday, "$lte": sunday}},
            {"_id": 0},
        ).to_list(20)
        emp["week_planned_minutes"] = sum(_covered_minutes(s) for s in schs)
        emp["contract_hours_weekly"] = emp.get("contract_hours_weekly", 35)
    return items


@api.get("/admin/schedule/{employee_id}")
async def admin_get_schedule(employee_id: str, week_start: Optional[str] = None):
    """Return schedule entries for an employee. Optionally for a given week (Monday ISO)."""
    await require_permission("manage_users", "approve_leaves")
    q: dict = {"employee_id": employee_id}
    if week_start:
        ws = date.fromisoformat(week_start)
        we = ws + timedelta(days=6)
        # Materialize the week
        await _ensure_range(employee_id, ws, we)
        q["day"] = {"$gte": ws.isoformat(), "$lte": we.isoformat()}
    items = await db.schedules.find(q, {"_id": 0}).sort("day", 1).to_list(200)
    return items


@api.post("/admin/schedule")
async def admin_upsert_schedule(payload: AdminScheduleEntry):
    """Create or update a schedule entry for a given (employee_id, day)."""
    await require_permission("manage_users", "approve_leaves")
    # Validate day format
    try:
        date.fromisoformat(payload.day)
    except Exception:
        raise HTTPException(400, "Date invalide (YYYY-MM-DD attendu)")
    if payload.type == "shift":
        if not payload.start or not payload.end:
            raise HTTPException(400, "Horaires début/fin requis pour un shift")
    # Coherence checks for shift/remote/school entries — same rules as the week editor
    if payload.type in ("shift", "remote", "school") and payload.start and payload.end:
        def _tmin(v):
            try:
                h, m = v.split(":")
                return int(h) * 60 + int(m)
            except Exception:
                return None
        s = _tmin(payload.start); en = _tmin(payload.end)
        if s is None or en is None:
            raise HTTPException(400, "Horaires début/fin invalides")
        # Cross-midnight support: end <= start means the shift ends the next
        # day (parc fermeture tardive). Only reject when start == end exactly.
        if en == s:
            raise HTTPException(400, "Fin du shift doit être différente du début")
        crosses_midnight = en < s
        eff_end = en + 24 * 60 if crosses_midnight else en
        if (payload.pause_start and not payload.pause_end) or (payload.pause_end and not payload.pause_start):
            raise HTTPException(400, "Renseignez à la fois le début et la fin de la pause")
        if payload.pause_start and payload.pause_end:
            ps = _tmin(payload.pause_start); pe = _tmin(payload.pause_end)
            if ps is None or pe is None:
                raise HTTPException(400, "Horaires de pause invalides")
            # Unwrap pause times when the shift crosses midnight
            if crosses_midnight:
                if ps < s: ps += 24 * 60
                if pe < s: pe += 24 * 60
            if pe <= ps:
                raise HTTPException(400, "Fin de pause doit être après le début de pause")
            if ps < s or pe > eff_end:
                raise HTTPException(400, "La pause doit se situer entièrement à l'intérieur du shift")
    existing = await db.schedules.find_one(
        {"employee_id": payload.employee_id, "day": payload.day}, {"_id": 0}
    )
    data = payload.model_dump()
    if existing:
        await db.schedules.update_one(
            {"employee_id": payload.employee_id, "day": payload.day},
            {"$set": {k: v for k, v in data.items() if k not in ("employee_id", "day")}},
        )
        data["id"] = existing["id"]
    else:
        data["id"] = _id()
        await db.schedules.insert_one(data.copy())
    # Push notification to employee
    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": payload.employee_id,
        "type": "planning",
        "title": "Planning mis à jour",
        "content": f"Votre planning du {payload.day} a été modifié par votre responsable.",
        "message": f"Votre planning du {payload.day} a été modifié par votre responsable.",
        "icon": "calendar",
        "link": "/rh/planning",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return data


@api.delete("/admin/schedule/{schedule_id}")
async def admin_delete_schedule(schedule_id: str):
    """"Vider" une journée : on ne supprime pas la ligne (qui serait aussitôt
    re-matérialisée depuis `weekly_pattern` par `_ensure_range`). On la
    remplace par un marqueur `type: "cleared"` — respecté par tous les
    modules (calendrier employé, badge, calcul contrat) — pour laisser la
    journée réellement vide et éditable."""
    await require_permission("manage_users", "approve_leaves")
    sch = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not sch:
        raise HTTPException(404, "Entrée introuvable")
    await db.schedules.update_one(
        {"id": schedule_id},
        {"$set": {
            "type": "cleared",
            "start": None, "end": None,
            "pause_start": None, "pause_end": None,
            "break_minutes": 0,
            "location": None, "service": None, "note": None,
        }},
    )
    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": sch["employee_id"],
        "type": "planning",
        "title": "Planning mis à jour",
        "content": f"Une entrée de planning ({sch['day']}) a été supprimée.",
        "message": f"Une entrée de planning ({sch['day']}) a été supprimée.",
        "icon": "calendar",
        "link": "/rh/planning",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return {"ok": True}


# ─────────────────────────── Récurrence École (alternance)

class SchoolRecurrencePayload(BaseModel):
    employee_id: str
    start_date: str            # YYYY-MM-DD (inclus)
    end_date: str              # YYYY-MM-DD (inclus)
    mode: str                  # 'weekly' | 'monthly-nth' | 'full-week' | 'custom'
    weekdays: Optional[List[int]] = None       # 0=Lun … 6=Dim (weekly, full-week)
    every_n_weeks: Optional[int] = 1           # weekly, full-week
    nth: Optional[int] = 1                     # monthly-nth (1..4 or -1=dernier)
    weekday: Optional[int] = 0                 # monthly-nth (0=Lun)
    custom_dates: Optional[List[str]] = None   # custom
    note: Optional[str] = "École (alternance)"


def _generate_school_dates(p: SchoolRecurrencePayload) -> list[str]:
    try:
        d_start = date.fromisoformat(p.start_date)
        d_end = date.fromisoformat(p.end_date)
    except Exception:
        raise HTTPException(400, "Dates invalides (YYYY-MM-DD attendu)")
    if d_end < d_start:
        raise HTTPException(400, "La date de fin doit être postérieure ou égale à la date de début")
    out: list[str] = []
    mode = (p.mode or "").lower()

    if mode == "custom":
        for s in (p.custom_dates or []):
            try:
                d = date.fromisoformat(s)
                if d_start <= d <= d_end:
                    out.append(d.isoformat())
            except Exception:
                continue

    elif mode == "weekly":
        wds = set(p.weekdays or [])
        if not wds:
            raise HTTPException(400, "Sélectionnez au moins un jour de la semaine")
        n = max(1, int(p.every_n_weeks or 1))
        # Semaine de référence = celle qui contient start_date (lundi de cette semaine)
        anchor = d_start - timedelta(days=d_start.weekday())
        d = d_start
        while d <= d_end:
            week_start = d - timedelta(days=d.weekday())
            week_delta = (week_start - anchor).days // 7
            if week_delta % n == 0 and d.weekday() in wds:
                out.append(d.isoformat())
            d += timedelta(days=1)

    elif mode == "full-week":
        # Une semaine complète (lun-ven par défaut) toutes les N semaines à partir du lundi de start_date
        wds = set(p.weekdays or [0, 1, 2, 3, 4])
        n = max(1, int(p.every_n_weeks or 1))
        anchor = d_start - timedelta(days=d_start.weekday())
        d = anchor
        while d <= d_end:
            for wd in sorted(wds):
                cur = d + timedelta(days=wd)
                if d_start <= cur <= d_end:
                    out.append(cur.isoformat())
            d += timedelta(days=7 * n)

    elif mode == "monthly-nth":
        nth = int(p.nth or 1)   # 1..4 ou -1 (dernier)
        wd = int(p.weekday or 0)
        # Itérer sur les mois entre start_date et end_date
        y, m = d_start.year, d_start.month
        while (y, m) <= (d_end.year, d_end.month):
            if nth == -1:
                # dernier weekday du mois
                if m == 12:
                    first_next = date(y + 1, 1, 1)
                else:
                    first_next = date(y, m + 1, 1)
                last = first_next - timedelta(days=1)
                delta = (last.weekday() - wd) % 7
                target = last - timedelta(days=delta)
            else:
                first = date(y, m, 1)
                delta = (wd - first.weekday()) % 7
                target = first + timedelta(days=delta + 7 * (nth - 1))
                if target.month != m:
                    target = None
            if target and d_start <= target <= d_end:
                out.append(target.isoformat())
            # incrément mois
            if m == 12:
                y += 1; m = 1
            else:
                m += 1
    else:
        raise HTTPException(400, "Mode de récurrence invalide")

    # dédupliquer + trier
    return sorted(set(out))


@api.post("/admin/schedule/school-recurrence")
async def admin_school_recurrence(payload: SchoolRecurrencePayload):
    """Générer des journées « École » en série pour un collaborateur.
    Upsert idempotent : les journées déjà en shift/leave/rtt ne sont pas
    écrasées si elles sont verrouillées par un congé approuvé ; sinon la
    journée est marquée `type: "school"`."""
    await require_permission("manage_users", "approve_leaves")
    emp = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Collaborateur introuvable")

    dates_list = _generate_school_dates(payload)
    if not dates_list:
        return {"ok": True, "count": 0, "dates": []}

    # Heures contrat quotidiennes → covered_minutes du jour d'école
    weekly_h = float(emp.get("contract_hours") or emp.get("weekly_hours") or 35)
    work_days = int(emp.get("work_days_per_week") or 5) or 5
    daily_min = int(round((weekly_h / work_days) * 60))

    created = 0
    updated = 0
    skipped = []
    for day in dates_list:
        existing = await db.schedules.find_one(
            {"employee_id": payload.employee_id, "day": day}, {"_id": 0}
        )
        # Ne pas écraser un congé/rtt approuvé
        if existing and (existing.get("type") in ("leave", "rtt")):
            skipped.append(day)
            continue
        doc = {
            "type": "school",
            "start": None,
            "end": None,
            "pause_start": None,
            "pause_end": None,
            "break_minutes": 0,
            "location": "École",
            "service": None,
            "note": payload.note or "École (alternance)",
            "covered_minutes": daily_min,
        }
        if existing:
            await db.schedules.update_one(
                {"employee_id": payload.employee_id, "day": day},
                {"$set": doc},
            )
            updated += 1
        else:
            new_entry = {
                "id": _id(),
                "employee_id": payload.employee_id,
                "day": day,
                **doc,
            }
            await db.schedules.insert_one(new_entry)
            created += 1

    # Notif au collaborateur
    if created + updated > 0:
        await db.notifications.insert_one({
            "id": _id(),
            "employee_id": payload.employee_id,
            "type": "planning",
            "title": "🎓 Journées d'école ajoutées",
            "content": f"{created + updated} journées d'école ont été planifiées sur votre calendrier.",
            "message": f"{created + updated} journées d'école ont été planifiées sur votre calendrier.",
            "icon": "calendar",
            "link": "/rh/planning",
            "ts": _now(),
            "created_at": _now(),
            "read": False,
        })
    return {
        "ok": True,
        "count": created + updated,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "dates": dates_list,
    }


@api.delete("/admin/school-recurrence")
async def admin_delete_school_range(
    employee_id: str, start_date: str, end_date: str
):
    """Supprimer toutes les journées 'school' d'un collaborateur sur une période.
    Les journées redeviennent 'cleared' pour ne pas être re-matérialisées."""
    await require_permission("manage_users", "approve_leaves")
    try:
        date.fromisoformat(start_date); date.fromisoformat(end_date)
    except Exception:
        raise HTTPException(400, "Dates invalides")
    r = await db.schedules.update_many(
        {
            "employee_id": employee_id,
            "type": "school",
            "day": {"$gte": start_date, "$lte": end_date},
        },
        {"$set": {
            "type": "cleared",
            "start": None, "end": None,
            "pause_start": None, "pause_end": None,
            "location": None, "note": None,
            "covered_minutes": 0,
        }},
    )
    return {"ok": True, "removed": r.modified_count}




class BulkClearPayload(BaseModel):
    employee_id: str
    week_start: str  # YYYY-MM-DD (Monday of the first week to clear)
    weeks: int = 1   # number of weeks to clear (>=1)


@api.post("/admin/schedule/clear-weeks")
async def admin_clear_weeks(payload: BulkClearPayload):
    """Erase every non-validated schedule row over `weeks` consecutive weeks
    starting from `week_start`. Approved leaves / RTT are preserved.
    Also clears the badging entries in the same window so nothing lingers
    in the badge module. Days re-materialize from `weekly_pattern` on next
    fetch (a "reset to default" behaviour)."""
    await require_permission("manage_users", "approve_leaves")
    try:
        ws = date.fromisoformat(payload.week_start)
    except Exception:
        raise HTTPException(400, "week_start invalide (YYYY-MM-DD attendu)")
    n = max(1, min(52, int(payload.weeks or 1)))
    we = ws + timedelta(days=7 * n - 1)
    # Replace every non-validated existing entry with a `cleared` marker
    r1 = await db.schedules.update_many(
        {
            "employee_id": payload.employee_id,
            "day": {"$gte": ws.isoformat(), "$lte": we.isoformat()},
            "type": {"$nin": ["leave", "rtt"]},
        },
        {"$set": {
            "type": "cleared",
            "start": None, "end": None,
            "pause_start": None, "pause_end": None,
            "break_minutes": 0,
            "location": None, "service": None, "note": None,
        }},
    )
    # Insert `cleared` markers for days that were still empty in the DB so
    # `_ensure_range()` won't regenerate them from the pattern.
    existing_days = set()
    async for e in db.schedules.find(
        {"employee_id": payload.employee_id,
         "day": {"$gte": ws.isoformat(), "$lte": we.isoformat()}},
        {"_id": 0, "day": 1},
    ):
        existing_days.add(e["day"])
    to_insert = []
    d = ws
    while d <= we:
        if d.isoformat() not in existing_days:
            to_insert.append({
                "employee_id": payload.employee_id,
                "day": d.isoformat(),
                "type": "cleared",
                "start": None, "end": None,
                "pause_start": None, "pause_end": None,
                "break_minutes": 0,
                "location": None, "service": None, "note": None,
            })
        d = d + timedelta(days=1)
    if to_insert:
        await db.schedules.insert_many(to_insert)
    r2 = await db.badging.delete_many({
        "employee_id": payload.employee_id,
        "day": {"$gte": ws.isoformat(), "$lte": we.isoformat()},
    })
    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": payload.employee_id,
        "type": "planning",
        "title": "Planning réinitialisé",
        "content": f"{n} semaine{'s' if n > 1 else ''} de planning ont été effacées par votre responsable.",
        "message": f"{n} semaine{'s' if n > 1 else ''} de planning ont été effacées par votre responsable.",
        "icon": "calendar",
        "link": "/rh/planning",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return {
        "ok": True,
        "weeks_cleared": n,
        "from_day": ws.isoformat(),
        "to_day": we.isoformat(),
        "schedules_cleared": (r1.modified_count or 0) + len(to_insert),
        "badging_deleted": r2.deleted_count or 0,
    }


class WeekEntry(BaseModel):
    day_offset: int  # 0..6 relative to week_start
    type: str = "shift"  # shift | off | leave | training | meeting
    start: Optional[str] = None
    end: Optional[str] = None
    pause_start: Optional[str] = None
    pause_end: Optional[str] = None
    break_minutes: int = 0
    location: Optional[str] = None
    service: Optional[str] = None
    note: Optional[str] = None


class BulkWeekPayload(BaseModel):
    employee_id: str
    week_start: str  # YYYY-MM-DD (Monday)
    entries: List[WeekEntry]  # up to 7 items — one per day of the week
    duplicate_weeks: int = 0  # 0 = single week; N = also apply to next N weeks


@api.post("/admin/schedule/week")
async def admin_save_week(payload: BulkWeekPayload):
    """Upsert a whole week — and optionally duplicate it to N following weeks.
    Off-days (`type=off`) do not create horaires but are stored so the display
    is consistent. Existing rows for those days are replaced."""
    await require_permission("manage_users", "approve_leaves")
    try:
        base = date.fromisoformat(payload.week_start)
    except Exception:
        raise HTTPException(400, "week_start invalide (YYYY-MM-DD attendu)")

    total_saved = 0
    weeks_processed = 0

    # Validation — reject the whole payload if any shift/remote row has incoherent horaires
    def _tmin(v: Optional[str]) -> Optional[int]:
        if not v or ":" not in v:
            return None
        try:
            h, m = v.split(":")
            return int(h) * 60 + int(m)
        except Exception:
            return None
    for e in payload.entries:
        if e.type not in ("shift", "remote", "school"):
            continue
        if not e.start or not e.end:
            continue
        s = _tmin(e.start); en = _tmin(e.end)
        if s is None or en is None:
            raise HTTPException(400, f"Jour {e.day_offset}: horaires début/fin invalides")
        # Cross-midnight support: end <= start means the shift ends the next
        # day (parc fermeture tardive, e.g. 02:00). Only reject if start == end.
        if en == s:
            raise HTTPException(400, f"Jour {e.day_offset}: fin du shift doit être différente du début")
        crosses_midnight = en < s
        eff_end = en + 24 * 60 if crosses_midnight else en
        if (e.pause_start and not e.pause_end) or (e.pause_end and not e.pause_start):
            raise HTTPException(400, f"Jour {e.day_offset}: renseignez à la fois le début et la fin de la pause")
        if e.pause_start and e.pause_end:
            ps = _tmin(e.pause_start); pe = _tmin(e.pause_end)
            if ps is None or pe is None:
                raise HTTPException(400, f"Jour {e.day_offset}: horaires de pause invalides")
            if crosses_midnight:
                if ps < s: ps += 24 * 60
                if pe < s: pe += 24 * 60
            if pe <= ps:
                raise HTTPException(400, f"Jour {e.day_offset}: fin de pause doit être après le début de pause")
            if ps < s or pe > eff_end:
                raise HTTPException(400, f"Jour {e.day_offset}: la pause doit se situer entièrement à l'intérieur du shift")

    for w in range(0, max(1, payload.duplicate_weeks + 1)):
        week_offset = timedelta(days=7 * w)
        for e in payload.entries:
            day_iso = (base + week_offset + timedelta(days=e.day_offset)).isoformat()
            is_shift_like = e.type in ("shift", "remote", "school")
            if is_shift_like and (not e.start or not e.end):
                # Skip incomplete shift/remote/school rows (admin left them blank)
                continue
            record = {
                "employee_id": payload.employee_id,
                "day": day_iso,
                "type": e.type,
                "start": e.start if is_shift_like else None,
                "end": e.end if is_shift_like else None,
                "pause_start": e.pause_start if is_shift_like else None,
                "pause_end": e.pause_end if is_shift_like else None,
                "break_minutes": e.break_minutes if is_shift_like else 0,
                "location": e.location if e.type != "school" else (e.location or "École"),
                "service": e.service,
                "note": e.note,
            }
            existing = await db.schedules.find_one(
                {"employee_id": payload.employee_id, "day": day_iso}, {"_id": 0}
            )
            if existing:
                # Don't overwrite validated leaves — user's explicit rule
                if existing.get("type") in ("leave", "rtt"):
                    continue
                await db.schedules.update_one(
                    {"employee_id": payload.employee_id, "day": day_iso},
                    {"$set": record},
                )
            else:
                record["id"] = _id()
                await db.schedules.insert_one(record.copy())
            total_saved += 1
        weeks_processed += 1

    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": payload.employee_id,
        "type": "planning",
        "title": "Planning mis à jour",
        "content": f"{weeks_processed} semaine(s) planifiée(s) par votre responsable.",
        "message": f"{weeks_processed} semaine(s) planifiée(s) par votre responsable.",
        "icon": "calendar",
        "link": "/rh/planning",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return {"ok": True, "days_saved": total_saved, "weeks_applied": weeks_processed}


@api.get("/admin/contract-status/{employee_id}")
async def admin_contract_status(employee_id: str, week_start: Optional[str] = None):
    """Return contract vs planned hours (shift + leave + rtt count as covered)."""
    await require_permission("manage_users", "approve_leaves")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    today_d = date.today()
    if week_start:
        ws = date.fromisoformat(week_start)
    else:
        ws = today_d - timedelta(days=today_d.weekday())
    we = ws + timedelta(days=6)
    # Ensure schedule is materialized for the week
    await _ensure_range(employee_id, ws, we)
    schs = await db.schedules.find(
        {"employee_id": employee_id, "day": {"$gte": ws.isoformat(), "$lte": we.isoformat()}},
        {"_id": 0},
    ).to_list(20)
    planned_minutes = sum(_covered_minutes(s) for s in schs)
    contract_hours = emp.get("contract_hours_weekly", 35)
    contract_minutes = int(round(contract_hours * 60))
    delta_minutes = int(planned_minutes) - contract_minutes
    if delta_minutes == 0:
        status = "match"
        message = "Contrat respecté"
    elif delta_minutes < 0:
        status = "under"
        h = abs(delta_minutes) // 60
        m = int(abs(delta_minutes) % 60)
        if m == 0:
            message = f"{h} heure{'s' if h > 1 else ''} manquante{'s' if h > 1 else ''} pour atteindre le minimum contractuel"
        else:
            message = f"{h}h{m:02d} manquantes pour atteindre le minimum contractuel"
    else:
        status = "over"
        h = delta_minutes // 60
        m = int(delta_minutes % 60)
        if m == 0:
            message = f"{h} heure{'s' if h > 1 else ''} supplémentaire{'s' if h > 1 else ''} prévue{'s' if h > 1 else ''}"
        else:
            message = f"{h}h{m:02d} supplémentaires prévues"
    return {
        "employee_id": employee_id,
        "week_start": ws.isoformat(),
        "contract_hours_weekly": contract_hours,
        "contract_minutes": contract_minutes,
        "planned_minutes": planned_minutes,
        "delta_minutes": delta_minutes,
        "status": status,
        "message": message,
    }


# ─── Admin requests management
@api.get("/admin/requests")
async def admin_list_requests(status: Optional[str] = None):
    await require_permission("approve_leaves", "approve_recovery", "view_stats")
    q: dict = {}
    if status:
        q["status"] = status
    items = await db.requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Enrich with employee name
    for r in items:
        emp = await db.employees.find_one({"id": r["employee_id"]}, {"_id": 0})
        if emp:
            r["employee_name"] = f"{emp['first_name']} {emp['last_name']}"
            r["employee_avatar"] = emp.get("avatar")
            r["employee_role"] = emp.get("role")
    return items


class RequestDecision(BaseModel):
    note: Optional[str] = None


@api.post("/admin/requests/{rid}/approve")
async def admin_approve_request(rid: str, payload: RequestDecision):
    me_doc = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me_doc:
        raise HTTPException(403, "Accès refusé")
    req = await db.requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    # Permission check varies with the request type
    req_type_perm = "approve_recovery" if req.get("type") == "recuperation" else "approve_leaves"
    if not _has_permission(me_doc, req_type_perm):
        raise HTTPException(403, "Permission requise")
    if req.get("status") == "approved":
        raise HTTPException(400, "Demande déjà approuvée")
    await db.requests.update_one(
        {"id": rid},
        {"$set": {"status": "approved", "decided_at": _now(), "decision_note": payload.note}},
    )
    # Auto-sync: leave requests inject entries into the planning + decrement counters
    # Accept both semantic aliases: "cp"/"conge" (paid leave) and "rtt" (comp time).
    req_type = req.get("type")
    is_paid_leave = req_type in ("cp", "conge")
    is_rtt = req_type == "rtt"
    if (is_paid_leave or is_rtt) and req.get("start_date"):
        emp_id = req["employee_id"]
        start = date.fromisoformat(req["start_date"])
        end = date.fromisoformat(req.get("end_date") or req["start_date"])
        # STEP 1: Materialize any missing days from the employee's weekly pattern
        # so a CP request in a future/uncovered period still creates leave entries.
        await _ensure_range(emp_id, start, end)
        # Load the employee once — needed for pattern lookup beyond the horizon
        emp_doc = await db.employees.find_one({"id": emp_id}, {"_id": 0})
        new_type = "leave" if is_paid_leave else "rtt"
        note = "Congé payé (validé)" if is_paid_leave else "RTT (validé)"
        d = start
        days_consumed = 0  # only working-days that are actually converted
        while d <= end:
            existing = await db.schedules.find_one(
                {"employee_id": emp_id, "day": d.isoformat()}, {"_id": 0}
            )
            if existing:
                # Rule 1: OFF/leave/rtt/training → skip
                if existing.get("type") in ("off", "leave", "rtt", "training"):
                    d = d + timedelta(days=1)
                    continue
                # Rule 2: shift day → convert to leave/rtt. Store the covered minutes so
                # contract calc keeps working, but CLEAR start/end/pause so the UI doesn't show hours.
                covered = _covered_minutes(existing)
                await db.schedules.update_one(
                    {"employee_id": emp_id, "day": d.isoformat()},
                    {"$set": {
                        "type": new_type,
                        "note": note,
                        "start": None,
                        "end": None,
                        "pause_start": None,
                        "pause_end": None,
                        "break_minutes": 0,
                        "covered_minutes": covered,
                    }},
                )
                await db.badging.delete_many({"employee_id": emp_id, "day": d.isoformat()})
                days_consumed += 1
            else:
                # Rule 3: beyond auto-generation horizon (no existing entry).
                # Use the weekly pattern to decide whether this is a working day.
                pattern_entry = _entry_from_pattern(emp_doc, d) if emp_doc else {"type": "off"}
                if pattern_entry.get("type") == "off":
                    # Pattern says day-off → skip, no consumption
                    d = d + timedelta(days=1)
                    continue
                # Create a leave/rtt entry directly, using pattern hours only for calc
                covered = _covered_minutes(pattern_entry)
                new_entry = {
                    "id": _id(),
                    "employee_id": emp_id,
                    "day": d.isoformat(),
                    "type": new_type,
                    "start": None, "end": None,
                    "pause_start": None, "pause_end": None,
                    "break_minutes": 0,
                    "location": None, "manager": None, "service": None,
                    "note": note,
                    "covered_minutes": covered,
                }
                await db.schedules.insert_one(new_entry)
                days_consumed += 1
            d = d + timedelta(days=1)

        # Decrement counter on employee (only for real working-days consumed)
        emp = await db.employees.find_one({"id": emp_id}, {"_id": 0})
        if emp and days_consumed > 0:
            bal = dict(emp.get("leave_balance") or {})
            if is_paid_leave:
                remaining = days_consumed
                take_n1 = min(remaining, float(bal.get("cp_n_1", 0)))
                bal["cp_n_1"] = round(float(bal.get("cp_n_1", 0)) - take_n1, 1)
                remaining -= take_n1
                if remaining > 0:
                    # Allow negative balance (anticipated leave). Do NOT clamp to 0.
                    bal["cp_n"] = round(float(bal.get("cp_n", 0)) - remaining, 1)
            elif is_rtt:
                # Allow negative RTT balance (anticipated).
                bal["rtt"] = round(float(bal.get("rtt", 0)) - days_consumed, 1)
            await db.employees.update_one({"id": emp_id}, {"$set": {"leave_balance": bal}})

        # Persist the effective consumption on the request for traceability
        await db.requests.update_one(
            {"id": rid}, {"$set": {"days_consumed": days_consumed}}
        )

    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": req["employee_id"],
        "type": req["type"],
        "title": "Demande approuvée",
        "content": f"Votre demande ({req['type']}) a été acceptée. Votre planning est mis à jour.",
        "message": f"Votre demande ({req['type']}) a été acceptée. Votre planning est mis à jour.",
        "icon": "check-circle",
        "link": "/rh/demandes",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return {"ok": True}


@api.post("/admin/requests/{rid}/reject")
async def admin_reject_request(rid: str, payload: RequestDecision):
    me_doc = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    req = await db.requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    req_type_perm = "approve_recovery" if req.get("type") == "recuperation" else "approve_leaves"
    if not _has_permission(me_doc, req_type_perm):
        raise HTTPException(403, "Permission requise")
    await db.requests.update_one(
        {"id": rid},
        {"$set": {"status": "rejected", "decided_at": _now(), "decision_note": payload.note}},
    )
    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": req["employee_id"],
        "type": req["type"],
        "title": "Demande refusée",
        "content": f"Votre demande ({req['type']}) a été refusée." +
                   (f" Motif : {payload.note}" if payload.note else ""),
        "message": f"Votre demande ({req['type']}) a été refusée." +
                   (f" Motif : {payload.note}" if payload.note else ""),
        "icon": "check-circle",
        "link": "/rh/demandes",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return {"ok": True}


@api.post("/admin/requests/{rid}/info")
async def admin_request_info(rid: str, payload: RequestDecision):
    """Ask the employee for more info."""
    me_doc = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    req = await db.requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    req_type_perm = "approve_recovery" if req.get("type") == "recuperation" else "approve_leaves"
    if not _has_permission(me_doc, req_type_perm):
        raise HTTPException(403, "Permission requise")
    await db.requests.update_one(
        {"id": rid},
        {"$set": {"status": "info_requested", "decided_at": _now(), "decision_note": payload.note}},
    )
    await db.notifications.insert_one({
        "id": _id(),
        "employee_id": req["employee_id"],
        "type": req["type"],
        "title": "Complément d'information demandé",
        "content": payload.note or "Merci de compléter votre demande.",
        "message": payload.note or "Merci de compléter votre demande.",
        "icon": "message-circle",
        "link": "/rh/demandes",
        "ts": _now(),
        "created_at": _now(),
        "read": False,
    })
    return {"ok": True}


# ─── Leave request preview (before submission) — respects OFF days
class LeavePreview(BaseModel):
    start_date: str
    end_date: str


@api.post("/leave/preview")
async def leave_preview(payload: LeavePreview):
    """Return how many working-days a CP/RTT request would actually consume.
    Off days, existing leaves/rtt, or non-working days (via pattern) are excluded."""
    try:
        start = date.fromisoformat(payload.start_date)
        end = date.fromisoformat(payload.end_date)
    except Exception:
        raise HTTPException(400, "Dates invalides")
    if end < start:
        raise HTTPException(400, "La fin doit être postérieure au début")
    await _ensure_range(current_user(), start, end)
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    schs = await db.schedules.find(
        {"employee_id": current_user(),
         "day": {"$gte": start.isoformat(), "$lte": end.isoformat()}},
        {"_id": 0},
    ).to_list(60)
    by_day = {s["day"]: s for s in schs}
    working = 0
    off = 0
    unknown = 0
    total_minutes = 0
    d = start
    breakdown = []
    while d <= end:
        s = by_day.get(d.isoformat())
        if s:
            if s.get("type") == "off":
                off += 1
                breakdown.append({"day": d.isoformat(), "type": "off", "consumed": False, "minutes": 0})
            elif s.get("type") == "shift":
                m = _covered_minutes(s)
                total_minutes += m
                working += 1
                breakdown.append({"day": d.isoformat(), "type": "shift", "consumed": True, "minutes": m,
                                  "start": s.get("start"), "end": s.get("end")})
            else:
                breakdown.append({"day": d.isoformat(), "type": s.get("type"), "consumed": False, "minutes": 0})
        else:
            # Beyond auto-generation horizon → use weekly pattern
            pattern_entry = _entry_from_pattern(emp, d) if emp else {}
            if pattern_entry.get("type") == "shift":
                m = _covered_minutes(pattern_entry)
                total_minutes += m
                working += 1
                breakdown.append({"day": d.isoformat(), "type": "shift", "consumed": True, "minutes": m,
                                  "start": pattern_entry.get("start"), "end": pattern_entry.get("end"),
                                  "beyond_horizon": True})
            else:
                off += 1
                breakdown.append({"day": d.isoformat(), "type": "off", "consumed": False, "minutes": 0,
                                  "beyond_horizon": True})
        d = d + timedelta(days=1)
    return {
        "days_total": (end - start).days + 1,
        "days_off": off,
        "days_unknown": unknown,
        "days_consumed": working,
        "covered_minutes": total_minutes,
        "breakdown": breakdown,
    }


# ─── Admin news publishing
class NewsCreate(BaseModel):
    title: str
    content: str
    category: Optional[str] = "info"
    image: Optional[str] = None
    pinned: Optional[bool] = False
    images: Optional[List[str]] = None
    documents: Optional[List[dict]] = None
    external_link: Optional[str] = None
    featured: Optional[bool] = False
    active: Optional[bool] = True
    order: Optional[int] = 100
    cta_text: Optional[str] = None
    cta_url: Optional[str] = None
    # Enhanced button targeting: "news" | "event" | "internal" | "external" | "document"
    target_type: Optional[str] = None
    target_id: Optional[str] = None  # e.g. news id or event id
    # Audience targeting: which employee statuses can see this carousel item.
    # Empty = visible by everyone.
    audience_status_targets: Optional[List[str]] = None


@api.post("/admin/news")
async def admin_publish_news(payload: NewsCreate):
    me = await require_permission("publish_news", "edit_news", "manage_carousel")
    # Comm editors publish under the official "MS Park" identity by default.
    is_official = not me.get("is_admin") and me.get("can_manage_communication")
    author_name = "MS Park" if is_official else f"{me['first_name']} {me['last_name']}"
    item = {
        "id": _id(),
        "title": payload.title,
        "content": payload.content,
        "category": payload.category or "info",
        "image": payload.image,
        "images": payload.images or [],
        "documents": payload.documents or [],
        "external_link": payload.external_link,
        "featured": bool(payload.featured),
        "active": bool(payload.active) if payload.active is not None else True,
        "order": payload.order if payload.order is not None else 100,
        "cta_text": payload.cta_text,
        "cta_url": payload.cta_url,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "audience_status_targets": payload.audience_status_targets or [],
        "pinned": bool(payload.pinned),
        "date": _now(),
        "author_id": me["id"],
        "author_name": author_name,
        "posted_as": "official",
        "likes": [],
        "comments": [],
    }
    await db.news.insert_one(item.copy())
    audience_targets = payload.audience_status_targets or []
    if audience_targets:
        emps = await db.employees.find(
            {"statuses": {"$in": audience_targets}, "id": {"$ne": me["id"]}},
            {"_id": 0, "id": 1},
        ).to_list(1000)
        for e in emps:
            await _push_notification(
                employee_id=e["id"],
                type="news",
                title="Nouvelle actualité",
                content=item["title"],
                icon="megaphone",
                link=f"/actualites/{item['id']}",
            )
    else:
        await _broadcast_notification(
            type="news",
            title="Nouvelle actualité",
            content=item["title"],
            icon="megaphone",
            link=f"/actualites/{item['id']}",
            exclude_ids=[me["id"]],
        )
    return await _strip(item)


class NewsUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    image: Optional[str] = None
    images: Optional[List[str]] = None
    documents: Optional[List[dict]] = None
    external_link: Optional[str] = None
    featured: Optional[bool] = None
    active: Optional[bool] = None
    order: Optional[int] = None
    cta_text: Optional[str] = None
    cta_url: Optional[str] = None
    pinned: Optional[bool] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None


@api.put("/admin/news/{nid}")
async def admin_update_news(nid: str, payload: NewsUpdate):
    await require_permission("edit_news", "publish_news", "manage_carousel")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.news.update_one({"id": nid}, {"$set": updates})
    item = await db.news.find_one({"id": nid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Actualité introuvable")
    return item


@api.delete("/admin/news/{nid}")
async def admin_delete_news(nid: str):
    await require_permission("edit_news", "manage_carousel")
    await db.news.delete_one({"id": nid})
    return {"ok": True}


class ReorderPayload(BaseModel):
    ids: list[str]


@api.post("/admin/news/reorder")
async def admin_reorder_news(payload: ReorderPayload):
    """Persist a full ordered list of news IDs — assigns order 10, 20, 30 …"""
    await require_permission("manage_carousel", "edit_news")
    for i, nid in enumerate(payload.ids):
        await db.news.update_one({"id": nid}, {"$set": {"order": (i + 1) * 10}})
    return {"ok": True, "count": len(payload.ids)}


@api.get("/carousel")
async def get_carousel():
    """Public: news marked featured & active, sorted by order (asc). Filters
    audience-restricted items based on the caller's statuses (strict — no
    admin bypass)."""
    items = await db.news.find(
        {"featured": True, "active": {"$ne": False}}, {"_id": 0},
    ).sort([("order", 1), ("date", -1)]).to_list(50)
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    out: list[dict] = [it for it in items if _user_matches_audience(me, it.get("audience_status_targets"))]
    return out[:20]


# ─── Admin RTT/CP allocation
class LeaveGrant(BaseModel):
    employee_ids: List[str]
    days: float
    type: str  # "rtt" | "cp"


@api.post("/admin/leave/grant")
async def admin_grant_leave(payload: LeaveGrant):
    await require_permission("approve_leaves")
    if payload.type not in ("rtt", "cp"):
        raise HTTPException(400, "type doit être 'rtt' ou 'cp'")
    updated = []
    for eid in payload.employee_ids:
        emp = await db.employees.find_one({"id": eid}, {"_id": 0})
        if not emp:
            continue
        bal = dict(emp.get("leave_balance") or {})
        key = "rtt" if payload.type == "rtt" else "cp_n"
        bal[key] = round(float(bal.get(key, 0)) + payload.days, 1)
        await db.employees.update_one({"id": eid}, {"$set": {"leave_balance": bal}})
        await db.notifications.insert_one({
            "id": _id(),
            "employee_id": eid,
            "type": payload.type,
            "title": f"{payload.days} jour{'s' if payload.days > 1 else ''} {'RTT' if payload.type == 'rtt' else 'CP'} attribué{'s' if payload.days > 1 else ''}",
            "content": f"Votre responsable vous a attribué {payload.days} jour(s) de {payload.type.upper()}.",
            "message": f"Votre responsable vous a attribué {payload.days} jour(s) de {payload.type.upper()}.",
            "icon": "check-circle",
            "link": "/rh/demandes",
            "ts": _now(),
            "created_at": _now(),
            "read": False,
        })
        updated.append(eid)
    return {"ok": True, "updated": updated}


@api.post("/admin/leave/accrue-monthly")
async def admin_accrue_monthly():
    """Simulate the monthly 2.5 days CP accrual on the 1st of each month.
    Idempotent — flags an accrual per (employee, YYYY-MM). Callable on-demand for demo."""
    await require_admin()
    today_d = date.today()
    month_key = today_d.strftime("%Y-%m")
    emps = await db.employees.find({}, {"_id": 0}).to_list(500)
    accrued = []
    for e in emps:
        flag = await db.meta.find_one({"_id": f"accrual-{e['id']}-{month_key}"})
        if flag:
            continue
        bal = dict(e.get("leave_balance") or {})
        bal["cp_n"] = round(float(bal.get("cp_n", 0)) + 2.5, 1)
        await db.employees.update_one({"id": e["id"]}, {"$set": {"leave_balance": bal}})
        await db.meta.insert_one({"_id": f"accrual-{e['id']}-{month_key}"})
        accrued.append(e["id"])
    return {"ok": True, "month": month_key, "accrued_count": len(accrued)}



# ─── Admin — Gestion des pointages (correction des badges d'un employé)

class AdminPunchEditIn(BaseModel):
    clock_in: Optional[str] = None      # "HH:MM" ou "" pour retirer
    break_out: Optional[str] = None
    break_in: Optional[str] = None
    clock_out: Optional[str] = None
    reason: Optional[str] = "Oubli de badge"
    comment: Optional[str] = ""


@api.get("/admin/pointages/week")
async def admin_pointages_week(employee_id: str, week_start: str):
    """Retourne les 7 jours de la semaine avec agrégation des punches
    (entrée, pause, retour, sortie), status, type de journée, etc."""
    await require_permission("manage_badging", "manage_users")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    try:
        w_start = date.fromisoformat(week_start)
    except Exception:
        raise HTTPException(400, "week_start invalide (YYYY-MM-DD)")
    rows = []
    for i in range(7):
        d = (w_start + timedelta(days=i)).isoformat()
        p_list = await db.punches.find({"employee_id": employee_id, "day": d}, {"_id": 0}).sort("ts", 1).to_list(50)
        agg = _aggregate_day(p_list)
        sched = await db.schedules.find_one({"employee_id": employee_id, "day": d}, {"_id": 0})
        meta = await _day_status(employee_id, d, sched, agg)
        rows.append({
            "day": d,
            **agg,
            **meta,
            "sched_type": (sched or {}).get("type"),
            "sched_start": (sched or {}).get("start"),
            "sched_end": (sched or {}).get("end"),
            "sched_pause_start": (sched or {}).get("pause_start"),
            "sched_pause_end": (sched or {}).get("pause_end"),
        })
    return {"employee": emp, "week_start": week_start, "rows": rows}


@api.put("/admin/pointages/{employee_id}/{day}")
async def admin_edit_pointage(employee_id: str, day: str, payload: AdminPunchEditIn):
    """Remplace les pointages du jour pour un employé (entrée, pause,
    retour, sortie). Une notif est envoyée à l'employé et un audit trail est
    conservé dans `db.punch_audits`."""
    admin = await require_permission("manage_badging", "manage_users")
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    try:
        date.fromisoformat(day)
    except Exception:
        raise HTTPException(400, "Date invalide (YYYY-MM-DD)")

    def _valid_hm(v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        v = v.strip()
        try:
            datetime.strptime(v, "%H:%M")
            return v
        except Exception:
            raise HTTPException(400, f"Heure invalide : {v} (HH:MM attendu)")

    ci = _valid_hm(payload.clock_in)
    bo = _valid_hm(payload.break_out)
    bi = _valid_hm(payload.break_in)
    co = _valid_hm(payload.clock_out)

    # Audit avant remplacement
    prev = await db.punches.find({"employee_id": employee_id, "day": day}, {"_id": 0}).to_list(50)
    await db.punch_audits.insert_one({
        "id": _id(),
        "employee_id": employee_id,
        "day": day,
        "admin_id": admin["id"],
        "admin_name": f"{admin.get('first_name','')} {admin.get('last_name','')}".strip(),
        "reason": payload.reason or "Modification admin",
        "comment": payload.comment or "",
        "previous_punches": prev,
        "new_values": {"clock_in": ci, "break_out": bo, "break_in": bi, "clock_out": co},
        "ts": _now(),
    })

    # Remplacement complet des punches du jour
    await db.punches.delete_many({"employee_id": employee_id, "day": day})

    def _mk(t: str, hm: str) -> dict:
        return {
            "id": _id(),
            "employee_id": employee_id,
            "day": day,
            "type": t,
            "time": hm,
            "ts": _now(),
            "admin_edited": True,
            "admin_id": admin["id"],
            "reason": payload.reason or "Modification admin",
        }

    to_insert = []
    if ci:
        to_insert.append(_mk("clock_in", ci))
    if bo:
        to_insert.append(_mk("break_out", bo))
    if bi:
        to_insert.append(_mk("break_in", bi))
    if co:
        to_insert.append(_mk("clock_out", co))
    if to_insert:
        await db.punches.insert_many(to_insert)

    # Notif employé
    pretty_date = date.fromisoformat(day).strftime("%d %B %Y")
    fr_months = {
        "January":"janvier","February":"février","March":"mars","April":"avril",
        "May":"mai","June":"juin","July":"juillet","August":"août",
        "September":"septembre","October":"octobre","November":"novembre","December":"décembre",
    }
    for en, fr in fr_months.items():
        pretty_date = pretty_date.replace(en, fr)
    await _push_notification(
        employee_id=employee_id,
        type="badging",
        title="🕐 Votre badgeage a été régularisé",
        content=f"Votre horaire de badgeage du {pretty_date} a été modifié par un administrateur.",
        icon="check-circle",
        link=f"/badgeage?day={day}",
    )

    # Retourne l'agrégat mis à jour
    fresh = await db.punches.find({"employee_id": employee_id, "day": day}, {"_id": 0}).sort("ts", 1).to_list(50)
    agg = _aggregate_day(fresh)
    return {"ok": True, "day": day, **agg}


@api.get("/admin/pointages/{employee_id}/{day}/audit")
async def admin_pointage_audit(employee_id: str, day: str):
    """Historique des modifications admin d'un jour."""
    await require_permission("manage_badging", "manage_users")
    audits = await db.punch_audits.find(
        {"employee_id": employee_id, "day": day}, {"_id": 0}
    ).sort("ts", -1).to_list(50)
    return audits



# ─── Auto-badging generation (backend regenerates badging based on planning)
@api.post("/admin/badging/regenerate/{employee_id}")
async def admin_regenerate_badging(employee_id: str):
    """Regenerate badging entries for past 30 days based on the actual planning."""
    await require_admin()
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Employé introuvable")
    today_d = date.today()
    start = today_d - timedelta(days=30)
    # Clear existing badging in window
    await db.badging.delete_many({
        "employee_id": employee_id,
        "day": {"$gte": start.isoformat(), "$lt": today_d.isoformat()},
    })
    schs = await db.schedules.find({
        "employee_id": employee_id,
        "day": {"$gte": start.isoformat(), "$lt": today_d.isoformat()},
        "type": "shift",
    }, {"_id": 0}).to_list(200)
    import random
    inserts = []
    for s in schs:
        if not s.get("start") or not s.get("end"):
            continue
        # Random small offsets for realism
        clock_in_delta = random.randint(-5, 12)  # minutes
        clock_out_delta = random.randint(-3, 8)
        sh, sm = map(int, s["start"].split(":"))
        eh, em = map(int, s["end"].split(":"))
        ci_m = sh * 60 + sm + clock_in_delta
        co_m = eh * 60 + em + clock_out_delta
        ci = f"{ci_m // 60:02d}:{ci_m % 60:02d}"
        co = f"{co_m // 60:02d}:{co_m % 60:02d}"
        worked = max(0, (co_m - ci_m))
        # Remove pause duration
        if s.get("pause_start") and s.get("pause_end"):
            ps_h, ps_m = map(int, s["pause_start"].split(":"))
            pe_h, pe_m = map(int, s["pause_end"].split(":"))
            worked -= (pe_h * 60 + pe_m) - (ps_h * 60 + ps_m)
        anomaly = "late" if clock_in_delta >= 8 else None
        inserts.append({
            "id": _id(),
            "employee_id": employee_id,
            "day": s["day"],
            "clock_in": ci,
            "pause_out": s.get("pause_start"),
            "pause_in": s.get("pause_end"),
            "clock_out": co,
            "worked_minutes": worked,
            "anomaly": anomaly,
            "location": s.get("location") or "MS Park",
        })
    if inserts:
        await db.badging.insert_many(inserts)
    return {"ok": True, "generated": len(inserts)}


# ─── Admin stats
@api.get("/admin/stats")
async def admin_stats():
    await require_permission("view_stats")
    today_d = date.today()
    monday = today_d - timedelta(days=today_d.weekday())
    sunday = monday + timedelta(days=6)
    employees = await db.employees.find({}, {"_id": 0}).to_list(500)
    total_planned = 0
    total_contract = 0
    for emp in employees:
        schs = await db.schedules.find(
            {"employee_id": emp["id"], "day": {"$gte": monday.isoformat(), "$lte": sunday.isoformat()}},
            {"_id": 0},
        ).to_list(20)
        total_planned += sum(_covered_minutes(s) for s in schs)
        total_contract += emp.get("contract_hours_weekly", 35) * 60
    pending = await db.requests.count_documents({"status": "pending"})
    return {
        "employees_count": len(employees),
        "week_planned_minutes": total_planned,
        "week_contract_minutes": total_contract,
        "pending_requests": pending,
    }


# Router will be included at the end of the file — see bottom of server.py

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def attach_current_user(request: Request, call_next):
    """Set the per-request current user from the X-Employee-Id header."""
    eid = request.headers.get("X-Employee-Id") or current_user()
    token = _current_user_var.set(eid)
    try:
        response = await call_next(request)
    finally:
        _current_user_var.reset(token)
    return response


@app.on_event("startup")
async def on_start():
    await _seed_once()
    await _seed_extra_products()
    # Idempotent post-seed backfills (always run so demo data stays realistic).
    await _seed_birth_dates()
    try:
        await _seed_formations()
    except Exception as e:
        print(f"[seed_formations] error: {e}")
    try:
        await _seed_meeting_rooms()
    except Exception as e:
        print(f"[seed_meeting_rooms] error: {e}")
    # Idempotent super admin (may not exist if seed ran on older version)
    if not await db.employees.find_one({"id": "emp-super-admin"}):
        await db.employees.insert_one({
            "id": "emp-super-admin",
            "first_name": "Super", "last_name": "ADMIN",
            "role": "Super administrateur", "role_category": "admin",
            "role_title": "Super administrateur", "department": "Direction",
            "avatar": "https://ui-avatars.com/api/?name=Super+Admin&background=071B34&color=fff&size=256&bold=true",
            "email": "superadmin@mspark.fr", "phone": "+33 6 00 00 00 00",
            "seniority_months": 0,
            "is_admin": True, "is_super_admin": True,
            "can_post": True, "can_manage_communication": True,
            "contract_hours_weekly": 0,
            "badge_number": "MSP-SUPER", "badge_active": False,
            "hire_date": "2024-01-01", "skills": [],
            "leave_balance": {"cp_n_1": 0, "cp_n": 0, "rtt": 0},
        })
    # Simulate a realistic work week for Marcus (35h/week = 7h/day) — idempotent
    await _seed_marcus_week()
    # Clean up any duplicate schedule rows for the same (employee_id, day)
    await _dedupe_schedules()
    # Purge any expired room reservation (end_ts < now) so past slots
    # never appear as "booked" and don't clutter the calendar.
    try:
        now_iso = _now()
        gone = await db.room_reservations.delete_many({"end_ts": {"$lt": now_iso}})
        if gone.deleted_count:
            print(f"[startup] purged {gone.deleted_count} past room reservations")
    except Exception as e:
        print(f"[startup] past-reservations cleanup skipped: {e}")

    # ─── One-shot cleanup: remove legacy-schema schedule rows (shift_type/start_time)
    # so `_ensure_range()` re-materializes them with the current schema from the
    # employee's weekly_pattern. Idempotent.
    try:
        legacy = await db.schedules.delete_many({"shift_type": {"$exists": True}})
        if legacy.deleted_count:
            print(f"[startup] purged {legacy.deleted_count} legacy-schema schedule rows")
    except Exception as e:
        print(f"[startup] legacy cleanup skipped: {e}")

    # Seed team discussion channels (idempotent)
    try:
        await _ensure_team_channels_seeded()
    except Exception as e:
        print(f"[startup] team-channels seed skipped: {e}")

    # Seed channel catalog (idempotent — DB-backed metadata for admin CRUD)
    try:
        await _seed_channel_catalog()
    except Exception as e:
        print(f"[startup] channel catalog seed skipped: {e}")

    # Assign Marcus to the Direction service canal (source of truth)
    try:
        await db.employees.update_one(
            {"id": "emp-marcus-simeo"},
            {"$addToSet": {"service_channels_access": "direction"}},
        )
    except Exception:
        pass

    # ─── Auto-grant `service-rh` access to users whose role strictly matches
    # RH heuristics (Responsable RH, Directeur RH, Chargé RH, dept RH,
    # `can_manage_hr` flag). ONLY ADDS access — never removes. Admin-set
    # accesses via the wizard are the source of truth and are preserved.
    try:
        emps = await db.employees.find({}, {"_id": 0}).to_list(500)
        def _is_rh_by_heuristic(e: dict) -> bool:
            role = (e.get("role") or "").lower()
            dept = (e.get("department") or "").lower()
            statuses = [s.lower() for s in (e.get("statuses") or [])]
            admin_role = (e.get("admin_role") or "").lower()
            return bool(
                e.get("can_manage_hr")
                or "rh" == admin_role
                or "rh" in statuses
                or "ressources humaines" in role
                or "responsable rh" in role
                or "directeur rh" in role
                or ("chargé" in role and "rh" in role)
                or "chargée rh" in role
                or "assistant rh" in role
                or "ressources humaines" in dept
            )
        for e in emps:
            if _is_rh_by_heuristic(e) and "service-rh" not in (e.get("service_channels_access") or []):
                await db.employees.update_one(
                    {"id": e["id"]},
                    {"$addToSet": {"service_channels_access": "service-rh"}},
                )
    except Exception as e:
        print(f"[startup] rh access auto-grant skipped: {e}")

    # ─── ONE-SHOT: hard reset of team-channel membership across the whole
    # workspace. After this migration every user starts with `team_channel_ids
    # = []` and every `team-{key}` channel has an empty members list. Admins
    # must then explicitly assign users to team channels via the wizard.
    # Legacy `ch-*` demo channels (Accueil, Karting, Roller, …) are removed
    # entirely — they were seeded with hardcoded members and cannot be
    # managed via the admin UI. Guarded by a marker so it never runs twice.
    try:
        marker = await db.system_flags.find_one({"key": "team_reset_v2"})
        if not marker:
            await db.employees.update_many({}, {"$set": {"team_channel_ids": []}})
            await db.channels.update_many(
                {"id": {"$regex": "^team-"}},
                {"$set": {"members_ids": []}},
            )
            # Delete legacy ch-* demo channels and their messages
            legacy_ch = await db.channels.find(
                {"id": {"$regex": "^ch-"}}, {"_id": 0, "id": 1}
            ).to_list(200)
            legacy_ids = [c["id"] for c in legacy_ch]
            if legacy_ids:
                await db.channels.delete_many({"id": {"$in": legacy_ids}})
                await db.messages.delete_many({"channel_id": {"$in": legacy_ids}})
            await db.system_flags.insert_one({"key": "team_reset_v2", "at": _now()})
            print(f"[startup] team-channel membership fully reset (team-* cleared, {len(legacy_ids)} legacy ch-* deleted)")
    except Exception as e:
        print(f"[startup] team reset skipped: {e}")

    # ─── Purge deprecated shared service inbox channels (`service-{key}` /
    # `is_service_inbox`). Service canals are DM-like per-employee threads
    # (`corp-{key}-{uid}`) — there is NO shared inbox any more.
    try:
        gone = await db.channels.delete_many({
            "$or": [
                {"is_service_inbox": True},
                {"type": "service_inbox"},
                {"id": {"$regex": r"^service-"}},
            ]
        })
        if gone.deleted_count:
            print(f"[startup] purged {gone.deleted_count} deprecated shared service-inboxes")
    except Exception as e:
        print(f"[startup] service-inbox purge skipped: {e}")

    # ─── Migrate legacy `rh-{uid}` channels: set `corporate_key = service-rh`
    # AND clean up their members list — only the recipient (employee whose
    # {uid} matches the channel id suffix) + current RH staff should be
    # members. Any other user (e.g. non-RH admin who once hit the send-payslip
    # endpoint) is purged to guarantee the payslip message never appears in
    # their personal messagerie.
    try:
        rh_uids = await _corporate_members("service-rh")
        legacy = await db.channels.find(
            {"id": {"$regex": "^rh-"}}, {"_id": 0}
        ).to_list(500)
        for ch in legacy:
            cid = ch["id"]
            recipient = cid[len("rh-"):]
            allowed = {recipient, *rh_uids}
            new_members = [m for m in (ch.get("members_ids") or []) if m in allowed]
            for uid in allowed:
                if uid not in new_members:
                    new_members.append(uid)
            await db.channels.update_one(
                {"id": cid},
                {"$set": {"corporate_key": "service-rh", "members_ids": new_members}},
            )
        if legacy:
            print(f"[startup] migrated {len(legacy)} rh-{{uid}} channels (cleaned members + set corporate_key)")
    except Exception as e:
        print(f"[startup] rh-channel migration skipped: {e}")

    # ─── Normalize rh-{uid} channel display name to "Service RH" so both
    # RH staff (canal service view) and the recipient (personal messagerie)
    # see the exact same, canonical label. Idempotent.
    try:
        await db.channels.update_many(
            {"id": {"$regex": "^rh-"}, "name": {"$ne": "Service RH"}},
            {"$set": {"name": "Service RH", "icon": "briefcase"}},
        )
    except Exception as e:
        print(f"[startup] rh-channel name normalization skipped: {e}")

    # ─── Purge phantom birthday_wishes rows for the current year that target
    # employees whose birthday is still UPCOMING (hasn't happened yet this
    # year). Such rows are impossible under the current `is_today` guard and
    # were likely leftover from seed / earlier code. Idempotent.
    try:
        marker = await db.system_flags.find_one({"key": "birthday_wishes_purge_future_v1"})
        if not marker:
            today = date.today()
            employees = await db.employees.find(
                {"birth_date": {"$ne": None}}, {"_id": 0, "id": 1, "birth_date": 1}
            ).to_list(500)
            future_ids = set()
            for e in employees:
                m = _birthday_meta(e.get("birth_date"), today)
                if m and not m.get("is_today") and m.get("days_until", 0) < 275:
                    # Upcoming birthday later this year → wishes for year=today.year are phantoms
                    future_ids.add(e["id"])
            if future_ids:
                r = await db.birthday_wishes.delete_many(
                    {"year": today.year, "to_id": {"$in": list(future_ids)}}
                )
                print(f"[startup] purged {r.deleted_count} phantom birthday_wishes for {len(future_ids)} upcoming birthdays")
            await db.system_flags.insert_one({"key": "birthday_wishes_purge_future_v1", "at": _now()})
    except Exception as e:
        print(f"[startup] birthday_wishes phantom purge skipped: {e}")

    # Seed shared service-inbox channels (idempotent). Runs AFTER Marcus's
    # assignment so his Direction inbox already has him as member.
    # (Kept as a no-op for backward-compat; deprecated shared-inbox concept.)
    pass

    # ─── ONE-SHOT: seed Julien BERNARD as a brand-new employee so his next
    # login triggers the full onboarding flow (welcome popup + RH welcome DM
    # + step-by-step guided tour). Idempotent via `system_flags` marker.
    try:
        await _seed_julien_bernard()
    except Exception as e:
        print(f"[startup] julien onboarding seed skipped: {e}")


async def _seed_julien_bernard():
    """Insert Julien BERNARD as a new employee with a pending onboarding.
    The Service RH welcome message is posted via the shared helper
    `_post_rh_welcome_dm` so the exact same template (with actionable
    links) is used as for users created via the admin wizard. Fully
    idempotent: runs once (marker) + guards inside the helper."""
    marker = await db.system_flags.find_one({"key": "onboarding_julien_v4"})
    if marker:
        return

    julien_id = "emp-julien-bernard"
    # Purge any leftover custom message posted by the previous (v1) migration
    await db.messages.delete_many({"channel_id": f"rh-{julien_id}"})
    # Backfill meal_points for the pre-existing (v1) seed of Julien so the
    # welcome message correctly displays his daily quota in the link card.
    await db.employees.update_one(
        {"id": julien_id, "$or": [{"meal_points": {"$exists": False}}, {"meal_points": 0}, {"meal_points": None}]},
        {"$set": {"meal_points": 20}},
    )

    existing = await db.employees.find_one({"id": julien_id}, {"_id": 0})
    if not existing:
        hire = date.today().isoformat()
        await db.employees.insert_one({
            "id": julien_id,
            "first_name": "Julien",
            "last_name": "BERNARD",
            "role": "Employé Polyvalent",
            "role_category": "employe",
            "role_title": "Employé Polyvalent",
            "department": "Opérations Parc",
            "avatar": "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop&crop=faces",
            "email": "julien.bernard@mspark.fr",
            "personal_email": "julien.bernard@gmail.com",
            "phone": "+33 6 78 45 21 09",
            "personal_phone": "+33 6 78 45 21 09",
            "address": "27 rue Voltaire, 92600 Asnières-sur-Seine",
            "birth_date": "1998-04-15",
            "hire_date": hire,
            "available": True,
            "seniority_months": 0,
            "skills": ["Accueil clients", "Karting"],
            "manager": "Marcus SIMÉO",
            "location": "MS Park — Zone Karting & Attractions",
            "badge_number": "MSP-2600",
            "badge_expiry": "2028-01-31",
            "badge_active": True,
            "leave_balance": {"cp_n_1": 0, "cp_n": 2.08, "rtt": 0.5},
            "meal_points": 20,
            "contract_hours_weekly": 35,
            "weekly_pattern": {
                "0": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "1": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "2": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "3": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "4": {"type": "shift", "start": "09:00", "end": "17:00", "pause_start": "12:30", "pause_end": "13:30"},
                "5": {"type": "off"},
                "6": {"type": "off"},
            },
            "is_admin": False,
            "can_post": False,
            "statuses": ["ops"],
            "account_status": "active",
            "password": "Julien2026!",
            "must_change_password": False,
            # Onboarding flags — cleared as the employee progresses through
            # the welcome popup (welcomed_at) and the guided tour
            # (tour_completed_at).
            "onboarding_pending": True,
            "welcomed_at": None,
            "tour_completed_at": None,
        })

    # Post the official RH welcome message via the shared helper (same
    # template + actionable links as `admin_create_user`).
    julien = await db.employees.find_one({"id": julien_id}, {"_id": 0})
    if julien:
        await _post_rh_welcome_dm(julien)

    await db.system_flags.insert_one({"key": "onboarding_julien_v4", "at": _now()})
    print("[startup] Julien BERNARD onboarding seeded via shared Service RH helper")


async def _seed_birth_dates():
    """Ensure every demo employee has a birth_date. Idriss is today (for demo popup)."""
    today = date.today()
    plan = {
        "emp-idriss-malonga": today.isoformat(),  # 🎂 today for the demo popup
        "emp-marcus-simeo": "1985-03-12",
        "emp-sophie": "1992-04-05",
        "emp-thomas": "1990-05-21",
        "emp-emma": "1996-06-14",
        "emp-karim": "1988-08-02",
        "emp-julie": "1994-09-27",
        "emp-lucas": "1991-10-11",
        "emp-amelie": "1993-11-30",
        "emp-noah": "1997-12-18",
        "emp-leila": "1989-01-25",
        "emp-pierre": "1987-02-08",
        "emp-camille": "1995-04-19",
        "emp-super-admin": "1980-06-01",
    }
    for eid, bd in plan.items():
        await db.employees.update_one(
            {"id": eid, "$or": [{"birth_date": None}, {"birth_date": {"$exists": False}}]},
            {"$set": {"birth_date": bd}},
        )


async def _dedupe_schedules():
    """Remove duplicate schedule entries for the same (employee_id, day).
    Keeps the entry with the most concrete data (shift > training > leave > off)."""
    priority = {"shift": 4, "training": 3, "leave": 3, "recovery": 3, "off": 2}
    seen: dict[tuple[str, str], dict] = {}
    to_remove_ids: list[str] = []
    async for s in db.schedules.find({}, {"_id": 0}):
        key = (s.get("employee_id"), s.get("day"))
        cur = seen.get(key)
        if cur is None:
            seen[key] = s
            continue
        # Keep the one with higher priority; drop the other
        cur_p = priority.get(cur.get("type"), 1)
        new_p = priority.get(s.get("type"), 1)
        loser = cur if new_p > cur_p else s
        winner = s if new_p > cur_p else cur
        seen[key] = winner
        if loser.get("id"):
            to_remove_ids.append(loser["id"])
    if to_remove_ids:
        await db.schedules.delete_many({"id": {"$in": to_remove_ids}})


async def _seed_marcus_week():
    """Populate Marcus SIMEO's current week with realistic badging punches for elapsed days."""
    marcus_id = "emp-marcus-simeo"
    now = _now_paris()
    today = now.date()
    monday = today - timedelta(days=(today.weekday()))
    week_key = monday.isoformat()
    # Idempotence marker
    marker = await db.badging_manual.find_one({"employee_id": marcus_id, "week_seed": week_key})
    if marker:
        return
    # Realistic pattern for each elapsed weekday (Mon–Fri, and partial today if weekday)
    plan = [
        ("08:30", "12:30", "13:30", "17:00"),  # Monday    — 7h30 (30min supp)
        ("08:45", "12:30", "13:30", "16:45"),  # Tuesday   — 7h00 pile
        ("08:30", "12:30", "13:30", "17:15"),  # Wednesday — 7h45 (45min supp)
        ("09:00", "12:30", "13:30", "17:00"),  # Thursday  — 7h00 (retard 30min)
        ("08:30", "12:00", "13:00", "16:00"),  # Friday    — 6h30 (30min manquantes)
    ]
    for i, (ci, po, pi, co) in enumerate(plan):
        day_date = monday + timedelta(days=i)
        # Skip days in the future
        if day_date > today:
            break
        # For today, only fill up to current moment
        is_today = day_date == today
        current_hm = f"{now.hour:02d}:{now.minute:02d}"
        def _clip(hm):
            if not is_today:
                return hm
            return hm if hm <= current_hm else None
        doc = {
            "id": _id(), "employee_id": marcus_id, "day": day_date.isoformat(),
            "clock_in": _clip(ci), "pause_out": _clip(po),
            "pause_in": _clip(pi), "clock_out": _clip(co),
            "punches": [], "created_at": _now(),
            "week_seed": week_key,
        }
        # Insert only if not already present for that day
        exists = await db.badging_manual.find_one({"employee_id": marcus_id, "day": day_date.isoformat()})
        if not exists:
            await db.badging_manual.insert_one(doc)


async def _seed_extra_products():
    """Idempotently add new demo products introduced after the initial seed."""
    extras = [
        {"store": "soccer_bar", "category": "Accompagnements", "name": "Riz",
         "description": "Riz basmati parfumé, cuisson maison",
         "points": 4, "price_eur": 3.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/b44la9j1_Cuire-le-riz-et-le-reussir.webp",
         "allergens": []},
        {"store": "soccer_bar", "category": "Salades", "name": "Salade César",
         "description": "Poulet pané croustillant, laitue romaine, croûtons, sauce César maison",
         "points": 12, "price_eur": 10.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/5zo6gzz8_Salade-Cesar-Poulet-Pane-1.jpg",
         "allergens": ["gluten", "lait", "œuf"]},
        {"store": "soccer_bar", "category": "Desserts", "name": "Cheesecake",
         "description": "Cheesecake crémeux, coulis de fruits rouges",
         "points": 8, "price_eur": 6.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/16ftw8kc_2-1.jpg",
         "allergens": ["gluten", "lait", "œuf"]},
        {"store": "soccer_bar", "category": "Desserts", "name": "Flan pâtissier",
         "description": "Flan pâtissier maison, pâte brisée feuilletée",
         "points": 7, "price_eur": 5.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/v6zbpnyo_photo_flan_patissier_cuisinovores.webp",
         "allergens": ["gluten", "lait", "œuf"]},
        {"store": "soccer_bar", "category": "Viandes", "name": "Côte de boeuf",
         "description": "Côte de boeuf grillée à la braise, pommes de terre sautées et persil",
         "points": 22, "price_eur": 18.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/z993xner_cotedeboeufcuire.jpg.webp",
         "allergens": []},
        {"store": "soccer_bar", "category": "Poissons", "name": "Crevettes sautées",
         "description": "Crevettes sautées aux poivrons colorés, oignons rouges et persil",
         "points": 16, "price_eur": 13.5,
         "image": "https://customer-assets-jt897jd0.emergentagent.net/job_mspark-employee-hub/artifacts/izddam7m_crevettes-sautees-aux-poivrons.webp",
         "allergens": ["crustacés"]},
    ]
    for it in extras:
        existing = await db.products.find_one({"store": it["store"], "name": it["name"]})
        if not existing:
            await db.products.insert_one({"id": _id(), **it})
    # Personal daily-quota override — Idriss demo employee = 25 points/day
    await db.employees.update_one(
        {"id": CURRENT_EMPLOYEE_ID},
        {"$set": {"daily_quota": 25}},
    )


@app.on_event("shutdown")
async def on_stop():
    client.close()


# ═══════════════════════════════════════════════════════════════════
# Newsletters
# ═══════════════════════════════════════════════════════════════════
class NewsletterCreate(BaseModel):
    title: str
    subject: Optional[str] = None
    preheader: Optional[str] = None
    cover_image: Optional[str] = None
    category: Optional[str] = "Général"
    author_id: Optional[str] = None
    reading_time: Optional[int] = 3  # minutes
    body_html: Optional[str] = ""  # rich content
    blocks: List[dict] = []  # optional block-based content
    attachments: List[dict] = []  # [{name, url}]
    archived: bool = False
    published: bool = False
    published_at: Optional[str] = None
    publish_at: Optional[str] = None  # scheduled publication — ISO datetime; when reached, the newsletter becomes visible to all employees
    recipient_statuses: List[str] = []  # target employee statuses (bureau, management, ops, securite, nettoyage, restauration, maintenance, direction). Empty = everyone.
    recipient_count: Optional[int] = None
    open_count: Optional[int] = 0
    click_count: Optional[int] = 0


@api.get("/newsletters")
async def list_newsletters(archived: bool = False, category: Optional[str] = None, q: Optional[str] = None):
    await _dispatch_scheduled_newsletters()
    me = await _me()
    query: dict = {"archived": archived}
    if category:
        query["category"] = category
    items = await db.newsletters.find(query, {"_id": 0}).sort("published_at", -1).to_list(200)
    now_iso = _now()
    is_admin = me.get("is_admin") or me.get("can_manage_communication")
    # Draft visibility: only author (or admin) can see unpublished newsletters.
    # Scheduled visibility: hide from employees until publish_at is reached.
    def _visible(n):
        if not n.get("published"):
            return n.get("author_id") == me["id"] or is_admin
        pub_at = n.get("publish_at")
        if pub_at and pub_at > now_iso:
            # scheduled — admins & author can see, others cannot
            return n.get("author_id") == me["id"] or is_admin
        # Audience gate — strict. `recipient_statuses` is the newsletter's
        # visible-by list. Empty = everyone. Author always sees their own.
        if n.get("author_id") == me["id"]:
            return True
        return _user_matches_audience(me, n.get("recipient_statuses"))
    items = [n for n in items if _visible(n)]
    for n in items:
        pub_at = n.get("publish_at")
        n["is_scheduled"] = bool(pub_at and pub_at > now_iso)
        # Compute the display status expected by the admin UI
        if n.get("archived"):
            n["send_status"] = "archived"
        elif not n.get("published"):
            n["send_status"] = "draft"
        elif n["is_scheduled"]:
            n["send_status"] = "scheduled"
        elif n.get("scheduled_broadcast_sent") or n.get("sent_at"):
            n["send_status"] = "sent"
        else:
            n["send_status"] = "published"
    if q:
        needle = q.lower()
        items = [n for n in items if needle in (n.get("title", "") + n.get("subject", "") + n.get("category", "")).lower()]
    # Attach my read status
    reads = await db.newsletter_reads.find({"employee_id": me["id"]}, {"newsletter_id": 1, "_id": 0}).to_list(500)
    read_ids = {r["newsletter_id"] for r in reads}
    for n in items:
        n["me_read"] = n["id"] in read_ids
    return items


@api.get("/newsletters/{nid}")
async def get_newsletter(nid: str):
    me = await _me()
    n = await db.newsletters.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Newsletter introuvable")
    # Audience gate — 404 for non-authorized users (also blocks direct URLs)
    if n.get("published") and n.get("author_id") != me["id"] and not _user_matches_audience(me, n.get("recipient_statuses")):
        raise HTTPException(404, "Newsletter introuvable")
    # Auto-mark as read on detail fetch + increment unique open counter
    if n.get("published"):
        await db.newsletter_reads.update_one(
            {"employee_id": me["id"], "newsletter_id": nid},
            {"$set": {"employee_id": me["id"], "newsletter_id": nid, "read_at": _now()}},
            upsert=True,
        )
        # Unique open : n'incrémente que la première fois par employé (auteur inclus)
        existing_open = await db.newsletter_opens.find_one({"newsletter_id": nid, "employee_id": me["id"]})
        if not existing_open:
            await db.newsletter_opens.insert_one({"newsletter_id": nid, "employee_id": me["id"], "ts": _now()})
            await db.newsletters.update_one({"id": nid}, {"$inc": {"open_count": 1}})
    r = await db.newsletter_reads.find_one({"employee_id": me["id"], "newsletter_id": nid})
    n["me_read"] = bool(r)
    return n


@api.post("/newsletters/{nid}/bookmark")
async def toggle_newsletter_bookmark(nid: str):
    me = await _me()
    existing = await db.newsletter_bookmarks.find_one({"employee_id": me["id"], "newsletter_id": nid})
    if existing:
        await db.newsletter_bookmarks.delete_one({"_id": existing["_id"]})
        return {"bookmarked": False}
    await db.newsletter_bookmarks.insert_one({
        "employee_id": me["id"], "newsletter_id": nid, "created_at": _now(),
    })
    return {"bookmarked": True}


@api.get("/newsletters/bookmarks/mine")
async def list_my_newsletter_bookmarks():
    me = await _me()
    bks = await db.newsletter_bookmarks.find({"employee_id": me["id"]}, {"_id": 0}).sort("created_at", -1).to_list(300)
    ids = [b["newsletter_id"] for b in bks]
    items = await db.newsletters.find({"id": {"$in": ids}}, {"_id": 0}).to_list(300)
    for it in items:
        it["bookmarked"] = True
    return items


@api.post("/admin/newsletters")
async def create_newsletter(payload: NewsletterCreate):
    me = await require_permission("manage_newsletter")
    n = payload.model_dump()
    n["id"] = _id()
    n["author_id"] = n.get("author_id") or me["id"]
    n["created_at"] = _now()
    if n.get("published") and not n.get("published_at"):
        n["published_at"] = _now()
    await db.newsletters.insert_one(n.copy())
    now_iso = _now()
    is_future = bool(n.get("publish_at") and n["publish_at"] > now_iso)
    if n.get("published") and not n.get("archived") and not is_future:
        await _broadcast_notification(
            type="news",
            title=f"Nouvelle newsletter · {n['title']}",
            content=n.get("preheader") or n.get("subject") or "",
            icon="megaphone",
            link=f"/newsletters/{n['id']}",
            exclude_ids=[me["id"]],
        )
    return await _strip(n)


@api.put("/admin/newsletters/{nid}")
async def update_newsletter(nid: str, payload: NewsletterCreate):
    await require_permission("manage_newsletter")
    old = await db.newsletters.find_one({"id": nid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Newsletter introuvable")
    # Lock published newsletters — once broadcast to employees, the content
    # is frozen. Only the archived flag can be flipped (via /archive route).
    if old.get("published"):
        raise HTTPException(
            423,
            "Cette newsletter est déjà publiée : son contenu est verrouillé et ne peut plus être modifié.",
        )
    upd = payload.model_dump()
    now_iso = _now()
    is_future = bool(upd.get("publish_at") and upd["publish_at"] > now_iso)
    if upd.get("published") and not old.get("published"):
        upd["published_at"] = _now()
    await db.newsletters.update_one({"id": nid}, {"$set": upd})
    n = await db.newsletters.find_one({"id": nid}, {"_id": 0})
    if upd.get("published") and not old.get("published") and not is_future:
        await _broadcast_notification(
            type="news",
            title=f"Nouvelle newsletter · {n['title']}",
            content=n.get("preheader") or n.get("subject") or "",
            icon="megaphone",
            link=f"/newsletters/{n['id']}",
        )
    return n


@api.delete("/admin/newsletters/{nid}")
async def delete_newsletter(nid: str):
    await require_permission("manage_newsletter")
    await db.newsletters.delete_one({"id": nid})
    return {"ok": True}


@api.post("/admin/newsletters/{nid}/archive")
async def archive_newsletter(nid: str):
    await require_permission("manage_newsletter")
    await db.newsletters.update_one({"id": nid}, {"$set": {"archived": True}})
    return {"ok": True}


class ScheduleUpdate(BaseModel):
    publish_at: str  # ISO datetime


@api.post("/admin/newsletters/{nid}/reschedule")
async def reschedule_newsletter(nid: str, payload: ScheduleUpdate):
    """Update the scheduled send date/time of a not-yet-sent newsletter."""
    await require_permission("manage_newsletter")
    n = await db.newsletters.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Newsletter introuvable")
    if n.get("scheduled_broadcast_sent") or n.get("sent_at"):
        raise HTTPException(423, "Newsletter déjà envoyée — impossible de reprogrammer.")
    await db.newsletters.update_one(
        {"id": nid},
        {"$set": {"publish_at": payload.publish_at, "published": True,
                  "scheduled_broadcast_sent": False}},
    )
    return await db.newsletters.find_one({"id": nid}, {"_id": 0})


@api.post("/admin/newsletters/{nid}/cancel-schedule")
async def cancel_schedule(nid: str):
    """Cancel a scheduled newsletter — reverts it back to draft."""
    await require_permission("manage_newsletter")
    n = await db.newsletters.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Newsletter introuvable")
    if n.get("scheduled_broadcast_sent") or n.get("sent_at"):
        raise HTTPException(423, "Newsletter déjà envoyée — impossible d'annuler.")
    await db.newsletters.update_one(
        {"id": nid},
        {"$set": {"publish_at": None, "published": False,
                  "scheduled_broadcast_sent": False}},
    )
    return await db.newsletters.find_one({"id": nid}, {"_id": 0})


@api.post("/admin/newsletters/{nid}/send-now")
async def send_now(nid: str):
    """Immediately send a scheduled newsletter (bypass the scheduled time)."""
    await require_permission("manage_newsletter")
    n = await db.newsletters.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Newsletter introuvable")
    if n.get("scheduled_broadcast_sent") or n.get("sent_at"):
        raise HTTPException(423, "Newsletter déjà envoyée.")
    now_iso = _now()
    await db.newsletters.update_one(
        {"id": nid},
        {"$set": {"publish_at": now_iso, "published": True,
                  "published_at": n.get("published_at") or now_iso}},
    )
    # Dispatch fires below when we call _dispatch_scheduled_newsletters
    await _dispatch_scheduled_newsletters()
    return await db.newsletters.find_one({"id": nid}, {"_id": 0})


class OpenTrack(BaseModel):
    newsletter_id: str


@api.post("/newsletters/{nid}/open")
async def track_open(nid: str):
    """Increment open counter (deduped per employee)."""
    uid = current_user()
    existing = await db.newsletter_opens.find_one({"newsletter_id": nid, "employee_id": uid})
    if not existing:
        await db.newsletter_opens.insert_one({"newsletter_id": nid, "employee_id": uid, "ts": _now()})
        await db.newsletters.update_one({"id": nid}, {"$inc": {"open_count": 1}})
    return {"ok": True}


class NewsletterClickPayload(BaseModel):
    link_id: Optional[str] = None
    url: Optional[str] = None
    label: Optional[str] = None


@api.post("/newsletters/{nid}/click")
async def track_click(nid: str, payload: Optional[NewsletterClickPayload] = None):
    """Increment click counter (unique par user+link)."""
    uid = current_user()
    link_id = (payload.link_id if payload else None) or (payload.url if payload else None) or "generic"
    url = payload.url if payload else None
    label = payload.label if payload else None
    # dédup : un clic unique par employé+link
    existing = await db.newsletter_clicks.find_one({
        "newsletter_id": nid, "employee_id": uid, "link_id": link_id,
    })
    if not existing:
        await db.newsletter_clicks.insert_one({
            "newsletter_id": nid, "employee_id": uid,
            "link_id": link_id, "url": url, "label": label,
            "ts": _now(),
        })
        await db.newsletters.update_one({"id": nid}, {"$inc": {"click_count": 1}})
    return {"ok": True}


@api.get("/admin/newsletters/{nid}/stats")
async def newsletter_stats(nid: str):
    """Return targeting + engagement stats for the admin dashboard."""
    await require_permission("manage_newsletter")
    n = await db.newsletters.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Newsletter introuvable")
    recipient_ids = await _newsletter_recipients(n)
    return {
        "recipient_statuses": n.get("recipient_statuses") or [],
        "recipient_count": n.get("recipient_count") or len(recipient_ids),
        "publish_at": n.get("publish_at"),
        "sent_at": n.get("sent_at"),
        "send_status": (
            "draft" if not n.get("published")
            else "scheduled" if (n.get("publish_at") and n["publish_at"] > _now())
            else "sent" if (n.get("scheduled_broadcast_sent") or n.get("sent_at"))
            else "published"
        ),
        "open_count": n.get("open_count") or 0,
        "click_count": n.get("click_count") or 0,
        "open_rate": round(((n.get("open_count") or 0) / max(1, n.get("recipient_count") or len(recipient_ids))) * 100, 1),
    }


# ═══════════════════════════════════════════════════════════════════
# Notes de frais (Expenses)
# ═══════════════════════════════════════════════════════════════════
class ExpenseItem(BaseModel):
    category: str  # transport | repas | hebergement | autres
    amount: float
    date: Optional[str] = None
    description: Optional[str] = ""


class ExpenseCreate(BaseModel):
    period: str  # "YYYY-MM"
    items: List[ExpenseItem]
    receipts: List[dict] = []  # [{name, url}]
    comment: Optional[str] = ""


def _expense_totals(exp: dict) -> dict:
    by_cat = {"transport": 0.0, "repas": 0.0, "hebergement": 0.0, "autres": 0.0}
    total = 0.0
    for it in exp.get("items", []):
        c = it.get("category", "autres")
        a = float(it.get("amount", 0) or 0)
        by_cat[c] = by_cat.get(c, 0) + a
        total += a
    exp["total"] = round(total, 2)
    exp["by_category"] = {k: round(v, 2) for k, v in by_cat.items()}
    return exp


@api.get("/expenses")
async def list_own_expenses():
    me = await _me()
    items = await db.expenses.find({"employee_id": me["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api.post("/expenses")
async def submit_expense(payload: ExpenseCreate):
    me = await _me()
    e = payload.model_dump()
    e["id"] = _id()
    e["number"] = f"NF-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    e["employee_id"] = me["id"]
    e["status"] = "pending"
    e["created_at"] = _now()
    e["decided_at"] = None
    e["decided_by"] = None
    e["decision_comment"] = ""
    e["refunded_at"] = None
    e["items"] = [it if isinstance(it, dict) else it.model_dump() for it in e.get("items", [])]
    _expense_totals(e)
    await db.expenses.insert_one(e.copy())
    admins = await db.employees.find({"is_admin": True}, {"id": 1}).to_list(20)
    for a in admins:
        await _push_notification(
            employee_id=a["id"],
            type="expense",
            title=f"Nouvelle note de frais · {me.get('first_name','')} {me.get('last_name','')}",
            content=f"Montant : {e['total']:.2f} €",
            icon="receipt",
            link="/management/notes-de-frais",
        )
    return await _strip(e)


@api.get("/admin/expenses")
async def admin_list_expenses(status: Optional[str] = None, period: Optional[str] = None):
    await require_permission("view_expenses", "approve_expenses")
    query: dict = {}
    if status:
        query["status"] = status
    if period:
        query["period"] = period
    items = await db.expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # enrich with employee name
    emp_ids = {i.get("employee_id") for i in items}
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": list(emp_ids)}}, {"_id": 0})}
    for it in items:
        e = emps.get(it.get("employee_id"))
        if e:
            it["employee_name"] = f"{e.get('first_name','')} {e.get('last_name','')}".strip()
            it["employee_avatar"] = e.get("avatar_url")
            it["employee_role"] = e.get("role_title") or e.get("role_category", "")
    # aggregated stats
    stats = {"received": len(items), "pending": 0, "approved": 0, "rejected": 0, "total_amount": 0.0}
    for it in items:
        stats[it.get("status", "pending")] = stats.get(it.get("status", "pending"), 0) + 1
        stats["total_amount"] += float(it.get("total", 0))
    stats["total_amount"] = round(stats["total_amount"], 2)
    return {"items": items, "stats": stats}


@api.get("/admin/expenses/{eid}")
async def admin_get_expense(eid: str):
    await require_permission("view_expenses", "approve_expenses")
    e = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Note de frais introuvable")
    return e


class ExpenseDecision(BaseModel):
    status: str  # approved | rejected
    comment: Optional[str] = ""


@api.put("/admin/expenses/{eid}/decide")
async def admin_decide_expense(eid: str, payload: ExpenseDecision):
    me = await require_permission("approve_expenses")
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(400, "Statut invalide")
    upd = {"status": payload.status, "decision_comment": payload.comment or "",
           "decided_at": _now(), "decided_by": me["id"]}
    await db.expenses.update_one({"id": eid}, {"$set": upd})
    e = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if e:
        await _push_notification(
            employee_id=e["employee_id"],
            type="expense",
            title=f"Note de frais {payload.status == 'approved' and 'approuvée' or 'refusée'}",
            content=payload.comment or "",
            icon="receipt",
            link="/notes-de-frais",
        )
    return e


@api.post("/admin/expenses/{eid}/refund")
async def admin_refund_expense(eid: str):
    await require_permission("approve_expenses")
    await db.expenses.update_one({"id": eid}, {"$set": {"status": "refunded", "refunded_at": _now()}})
    e = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if e:
        await _push_notification(
            employee_id=e["employee_id"],
            type="expense",
            title="Note de frais remboursée",
            content=f"Montant : {e['total']:.2f} €",
            icon="receipt",
            link="/notes-de-frais",
        )
    return e


# ═══════════════════════════════════════════════════════════════════
# Galerie Photos
# ═══════════════════════════════════════════════════════════════════
class AlbumCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    category: Optional[str] = "Événement"
    cover_image: Optional[str] = None
    allow_contributions: bool = False
    event_date: Optional[str] = None


class PhotoAdd(BaseModel):
    url: str
    caption: Optional[str] = ""


@api.get("/galleries")
async def list_galleries(category: Optional[str] = None, q: Optional[str] = None):
    query: dict = {}
    if category:
        query["category"] = category
    items = await db.galleries.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    if q:
        needle = q.lower()
        items = [g for g in items if needle in (g.get("title", "") + g.get("description", "")).lower()]
    # add photo counts
    for g in items:
        g["photo_count"] = await db.photos.count_documents({"album_id": g["id"]})
    return items


@api.get("/galleries/{gid}")
async def get_gallery(gid: str):
    g = await db.galleries.find_one({"id": gid}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Album introuvable")
    photos = await db.photos.find({"album_id": gid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    me = await _me_optional()
    my_favs = set()
    if me:
        favs = await db.photo_favorites.find({"employee_id": me["id"]}, {"photo_id": 1, "_id": 0}).to_list(1000)
        my_favs = {f["photo_id"] for f in favs}
    for p in photos:
        p["is_favorite"] = p["id"] in my_favs
    g["photos"] = photos
    return g


@api.post("/admin/galleries")
async def create_gallery(payload: AlbumCreate):
    me = await require_permission("add_gallery")
    g = payload.model_dump()
    g["id"] = _id()
    g["author_id"] = me["id"]
    g["created_at"] = _now()
    await db.galleries.insert_one(g.copy())
    return await _strip(g)


@api.put("/admin/galleries/{gid}")
async def update_gallery(gid: str, payload: AlbumCreate):
    await require_permission("add_gallery")
    upd = payload.model_dump()
    await db.galleries.update_one({"id": gid}, {"$set": upd})
    return await db.galleries.find_one({"id": gid}, {"_id": 0})


@api.delete("/admin/galleries/{gid}")
async def delete_gallery(gid: str):
    await require_permission("add_gallery")
    await db.galleries.delete_one({"id": gid})
    await db.photos.delete_many({"album_id": gid})
    return {"ok": True}


@api.post("/galleries/{gid}/photos")
async def add_photo(gid: str, payload: PhotoAdd):
    me = await _me()
    g = await db.galleries.find_one({"id": gid}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Album introuvable")
    is_editor = me.get("is_admin") or me.get("can_manage_communication")
    if not is_editor and not g.get("allow_contributions"):
        raise HTTPException(403, "Contribution non autorisée sur cet album")
    p = {
        "id": _id(),
        "album_id": gid,
        "url": payload.url,
        "caption": payload.caption or "",
        "uploader_id": me["id"],
        "uploader_name": f"{me.get('first_name','')} {me.get('last_name','')}".strip(),
        "created_at": _now(),
    }
    await db.photos.insert_one(p.copy())
    if not g.get("cover_image"):
        await db.galleries.update_one({"id": gid}, {"$set": {"cover_image": payload.url}})
    return await _strip(p)


@api.delete("/photos/{pid}")
async def delete_photo(pid: str):
    me = await _me()
    p = await db.photos.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Photo introuvable")
    if not (me.get("is_admin") or me.get("can_manage_communication") or p.get("uploader_id") == me["id"]):
        raise HTTPException(403, "Accès refusé")
    await db.photos.delete_one({"id": pid})
    await db.photo_favorites.delete_many({"photo_id": pid})
    return {"ok": True}


@api.post("/photos/{pid}/favorite")
async def toggle_favorite_photo(pid: str):
    me = await _me()
    existing = await db.photo_favorites.find_one({"employee_id": me["id"], "photo_id": pid})
    if existing:
        await db.photo_favorites.delete_one({"_id": existing["_id"]})
        return {"favorite": False}
    await db.photo_favorites.insert_one({"employee_id": me["id"], "photo_id": pid, "created_at": _now()})
    return {"favorite": True}


@api.get("/photos/favorites")
async def my_favorite_photos():
    me = await _me()
    favs = await db.photo_favorites.find({"employee_id": me["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [f["photo_id"] for f in favs]
    photos = await db.photos.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    for p in photos:
        p["is_favorite"] = True
    return photos


# ═══════════════════════════════════════════════════════════════════
# HR authored documents (rich text — Documents RH admin editor)
# ═══════════════════════════════════════════════════════════════════
class HRDocCreate(BaseModel):
    title: str
    category: str = "Ressources Humaines"
    subcategory: Optional[str] = ""
    doc_type: Optional[str] = "Procédure"
    summary: Optional[str] = ""
    body_html: str = ""
    header_logo: Optional[str] = None
    footer_text: Optional[str] = ""
    visibility: str = "all"  # all | groups | employees
    group_targets: List[str] = []
    employee_targets: List[str] = []
    important: bool = False
    allow_download: bool = True
    allow_print: bool = True
    track_reads: bool = False
    published: bool = False
    published_at: Optional[str] = None
    expires_at: Optional[str] = None


def _hrdoc_visible_to(doc: dict, me: dict) -> bool:
    if not doc.get("published"):
        return me.get("is_admin") or me.get("can_manage_communication")
    vis = doc.get("visibility", "all")
    if vis == "all":
        return True
    if vis == "groups":
        role = me.get("role_category")
        return role in (doc.get("group_targets") or []) or "all" in (doc.get("group_targets") or [])
    if vis == "employees":
        return me["id"] in (doc.get("employee_targets") or [])
    return False


@api.get("/hr-documents")
async def list_hr_docs():
    me = await _me()
    all_docs = await db.hr_documents.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [d for d in all_docs if _hrdoc_visible_to(d, me)]


@api.get("/hr-documents/{did}")
async def get_hr_doc(did: str):
    me = await _me()
    d = await db.hr_documents.find_one({"id": did}, {"_id": 0})
    if not d or not _hrdoc_visible_to(d, me):
        raise HTTPException(404, "Document introuvable")
    return d


@api.post("/admin/hr-documents")
async def create_hr_doc(payload: HRDocCreate):
    me = await require_permission("manage_documents", "publish_documents")
    d = payload.model_dump()
    d["id"] = _id()
    d["author_id"] = me["id"]
    d["created_at"] = _now()
    if d.get("published") and not d.get("published_at"):
        d["published_at"] = _now()
    await db.hr_documents.insert_one(d.copy())
    if d.get("published"):
        await _broadcast_notification(
            type="document",
            title=f"Nouveau document · {d['title']}",
            content=d.get("summary") or "",
            icon="file-text",
            link=f"/documents/rediger/{d['id']}",
            exclude_ids=[me["id"]],
        )
    return await _strip(d)


@api.put("/admin/hr-documents/{did}")
async def update_hr_doc(did: str, payload: HRDocCreate):
    await require_permission("manage_documents", "publish_documents")
    old = await db.hr_documents.find_one({"id": did}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Document introuvable")
    upd = payload.model_dump()
    if upd.get("published") and not old.get("published"):
        upd["published_at"] = _now()
    await db.hr_documents.update_one({"id": did}, {"$set": upd})
    return await db.hr_documents.find_one({"id": did}, {"_id": 0})


@api.delete("/admin/hr-documents/{did}")
async def delete_hr_doc(did: str):
    await require_permission("manage_documents")
    await db.hr_documents.delete_one({"id": did})
    return {"ok": True}


# helpers used above (idempotent — defined here to avoid ordering issues)
async def _me():
    eid = current_user() or CURRENT_EMPLOYEE_ID
    e = await db.employees.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(401, "Non authentifié")
    return e


async def _me_optional():
    try:
        return await _me()
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════
# Real-time Badging (online punch)
# ═══════════════════════════════════════════════════════════════════
def _hm_now() -> str:
    n = _now_paris()
    return f"{n.hour:02d}:{n.minute:02d}"


@api.post("/badging/punch-legacy")
async def punch_badge():
    """LEGACY (kept for admin badging_manual editor). New apps must use /badging/punch (v2)."""
    me = await _me()
    today = _now_paris().date().isoformat()
    now_hm = _hm_now()

    # Get or create today's manual override doc (persisted separately from schedule-derived)
    doc = await db.badging_manual.find_one({"employee_id": me["id"], "day": today}, {"_id": 0})
    if not doc:
        doc = {"id": _id(), "employee_id": me["id"], "day": today,
               "clock_in": None, "pause_out": None, "pause_in": None, "clock_out": None,
               "punches": [], "created_at": _now()}
        await db.badging_manual.insert_one(doc.copy())

    # Determine next step
    if not doc.get("clock_in"):
        step = "clock_in"; label = "Entrée"
    elif not doc.get("pause_out"):
        step = "pause_out"; label = "Pause (sortie)"
    elif not doc.get("pause_in"):
        step = "pause_in"; label = "Pause (entrée)"
    elif not doc.get("clock_out"):
        step = "clock_out"; label = "Sortie"
    else:
        raise HTTPException(400, "Tous les pointages du jour sont déjà effectués")

    await db.badging_manual.update_one(
        {"employee_id": me["id"], "day": today},
        {"$set": {step: now_hm}, "$push": {"punches": {"step": step, "time": now_hm, "at": _now()}}},
    )
    return {"step": step, "label": label, "time": now_hm}


@api.get("/badging/today-live")
async def today_live_badging():
    """Return today's badging combining schedule-based computation + manual punches."""
    me = await _me()
    today = _now_paris().date().isoformat()
    sched = await db.schedules.find_one({"employee_id": me["id"], "day": today}, {"_id": 0})
    manual = await db.badging_manual.find_one({"employee_id": me["id"], "day": today}, {"_id": 0})
    base = _compute_today_badging(sched, me["id"]) if sched else None
    if not base:
        base = {
            "id": f"live-{today}", "employee_id": me["id"], "day": today,
            "clock_in": None, "pause_out": None, "pause_in": None, "clock_out": None,
            "worked_minutes": 0, "break_minutes": 0, "anomaly": None,
            "note": "Pas de shift planifié" if not sched else None, "live": True,
        }
    if manual:
        # Manual punches (legacy admin edits) override schedule-derived values
        for k in ("clock_in", "pause_out", "pause_in", "clock_out"):
            if manual.get(k):
                base[k] = manual[k]
    # New v2: real punches take priority over both
    punches = await _get_punches(me["id"], today)
    if punches:
        agg = _aggregate_day(punches)
        base["clock_in"] = agg["clock_in"]
        base["pause_out"] = agg["break_out"]
        base["pause_in"] = agg["break_in"]
        base["clock_out"] = agg["clock_out"]
    if manual or punches:
        # Recompute worked minutes based on actual punches
        ci = _hm_to_minutes(base.get("clock_in"))
        co = _hm_to_minutes(base.get("clock_out"))
        po = _hm_to_minutes(base.get("pause_out"))
        pi = _hm_to_minutes(base.get("pause_in"))
        if ci is not None:
            now_m = _now_paris().hour * 60 + _now_paris().minute
            end_m = co if co is not None else now_m
            worked = max(0, end_m - ci)
            if po is not None and pi is not None:
                worked -= max(0, pi - po)
            base["worked_minutes"] = max(0, worked)
    base["is_manual"] = bool(manual) or bool(punches)
    return base


# ═══════════════════════════════════════════════════════════════════
# Punches system v2 — real virtual time clock
#   Types: clock_in | break_out | break_in | clock_out
#   Rules:
#   - Cannot punch on OFF days, validated leaves (Congés/RTT/Récup)
#   - Min break duration: 45 minutes (hard constraint)
#   - Late = strictly more than 15 minutes past scheduled start
#   - After "clock_out", cannot punch again until next scheduled shift
# ═══════════════════════════════════════════════════════════════════

MIN_BREAK_MINUTES = 45
LATE_TOLERANCE_MINUTES = 15
MAX_SHIFT_MINUTES = 8 * 60  # Auto-close a day after 8h of shift duration if not closed by user


def _hm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _paris_datetime_from_time(day_iso: str, hm: str) -> datetime:
    """Build a Paris-tz datetime from a YYYY-MM-DD + HH:MM."""
    return datetime.fromisoformat(f"{day_iso}T{hm}:00").replace(tzinfo=ZoneInfo("Europe/Paris"))


async def _get_punches(employee_id: str, day: str) -> List[dict]:
    return await db.punches.find(
        {"employee_id": employee_id, "day": day}, {"_id": 0}
    ).sort("ts", 1).to_list(50)


async def _auto_close_expired_days(employee_id: str) -> None:
    """If a day started ≥8h ago and was never manually closed, insert an
    auto clock_out at clock_in + 8h. Runs lazily on state reads / punches so
    the day gets clôturée automatically without needing a cron."""
    now_dt = _now_paris()
    today = now_dt.date().isoformat()
    # Look at the last 3 days worth of open sessions (safe window)
    cutoff = (now_dt.date() - timedelta(days=3)).isoformat()
    cursor = db.punches.find(
        {"employee_id": employee_id, "day": {"$gte": cutoff}}, {"_id": 0}
    )
    by_day: dict[str, List[dict]] = {}
    async for p in cursor:
        by_day.setdefault(p["day"], []).append(p)
    for day_iso, plist in by_day.items():
        plist.sort(key=lambda p: p.get("ts", ""))
        agg = _aggregate_day(plist)
        if not agg["clock_in"] or agg["is_closed"]:
            continue
        # Compute the elapsed minutes since clock_in on that specific day
        start_dt = _paris_datetime_from_time(day_iso, agg["clock_in"])
        elapsed = (now_dt - start_dt).total_seconds() / 60
        if elapsed < MAX_SHIFT_MINUTES:
            # Not yet expired
            continue
        # Force close at clock_in + 8h
        close_dt = start_dt + timedelta(minutes=MAX_SHIFT_MINUTES)
        # If a break is still open (no break_in), we also register a break_in at
        # break_out + MIN_BREAK_MINUTES so the day has coherent data.
        if agg["break_out"] and not agg["break_in"]:
            bi_dt = _paris_datetime_from_time(day_iso, agg["break_out"]) + timedelta(minutes=MIN_BREAK_MINUTES)
            if bi_dt < close_dt:
                await db.punches.insert_one({
                    "id": _id(),
                    "employee_id": employee_id,
                    "day": day_iso,
                    "type": "break_in",
                    "time": _hm(bi_dt),
                    "ts": bi_dt.isoformat(),
                    "source": "auto-close",
                })
        await db.punches.insert_one({
            "id": _id(),
            "employee_id": employee_id,
            "day": day_iso,
            "type": "clock_out",
            "time": _hm(close_dt),
            "ts": close_dt.isoformat(),
            "source": "auto-close",
        })


async def _next_scheduled_shift(employee_id: str, after_day: str) -> Optional[dict]:
    """Return the next scheduled work shift AFTER after_day.
    Skips off/leave/rtt/recup/rest days on either the legacy `shift_type` field
    or the newer `type` field used by the planning wizard.
    A row is considered a real shift only if its normalised type is `shift`,
    `remote` or `training`."""
    cursor = db.schedules.find(
        {"employee_id": employee_id, "day": {"$gt": after_day}}, {"_id": 0}
    ).sort("day", 1)
    async for s in cursor:
        st = (s.get("shift_type") or "").lower()
        t = (s.get("type") or "").lower()
        if st in ("off", "conges", "rtt", "recup", "rest"):
            continue
        if t in ("off", "leave", "rtt", "recup", "rest"):
            continue
        # It's a real shift → return it
        return s
    return None


async def _has_active_leave(employee_id: str, day: str) -> Optional[str]:
    sched = await db.schedules.find_one({"employee_id": employee_id, "day": day}, {"_id": 0})
    if sched:
        st = (sched.get("shift_type") or "").lower()
        t = (sched.get("type") or "").lower()
        if st in ("off", "rest") or t == "off":
            return "Jour de repos"
        if st == "conges" or t == "leave":
            return "Congés validés"
        if st == "rtt" or t == "rtt":
            return "RTT validée"
        if st == "recup":
            return "Récupération validée"
        if t == "school":
            return "Journée d'école"
    leave = await db.leave_requests.find_one({
        "employee_id": employee_id, "status": "approved",
        "start_date": {"$lte": day}, "end_date": {"$gte": day},
    }, {"_id": 0})
    if leave:
        return f"Absence validée ({leave.get('type', 'congé')})"
    return None


def _minutes_between(a: str, b: str) -> int:
    ah, am = [int(x) for x in a.split(":")]
    bh, bm = [int(x) for x in b.split(":")]
    return max(0, (bh * 60 + bm) - (ah * 60 + am))


def _aggregate_day(punches: List[dict]) -> dict:
    clock_in = None
    break_out = None
    break_in = None
    clock_out = None
    admin_edited = False
    for p in punches:
        t = p.get("type")
        hm = p.get("time")
        if p.get("admin_edited"):
            admin_edited = True
        if t == "clock_in" and clock_in is None:
            clock_in = hm
        elif t == "break_out":
            break_out = hm
            break_in = None
        elif t == "break_in":
            break_in = hm
        elif t == "clock_out":
            clock_out = hm
    worked = 0
    if clock_in:
        end = clock_out or _hm(_now_paris())
        worked = _minutes_between(clock_in, end)
        if break_out and break_in:
            worked -= _minutes_between(break_out, break_in)
        worked = max(0, worked)
    return {
        "clock_in": clock_in,
        "break_out": break_out,
        "break_in": break_in,
        "clock_out": clock_out,
        "worked_minutes": worked,
        "is_closed": bool(clock_out),
        "admin_edited": admin_edited,
    }


async def _day_status(employee_id: str, day: str, sched: Optional[dict], agg: dict) -> dict:
    # Normalise the day type across both legacy `shift_type` (badging seed) and
    # newer `type` (planning) fields. `training` counts as a work day.
    sched_type = None
    if sched:
        st = (sched.get("shift_type") or "").lower()
        t = (sched.get("type") or "").lower()
        if st in ("off", "rest") or t == "off":
            sched_type = "off"
        elif st == "conges" or t == "leave":
            sched_type = "leave"
        elif st == "rtt" or t == "rtt":
            sched_type = "rtt"
        elif st == "recup":
            sched_type = "recup"
        elif t == "training":
            sched_type = "training"
        elif t == "school":
            sched_type = "school"
        else:
            sched_type = "shift"
    scheduled_start = None
    scheduled_end = None
    if sched_type in ("shift", "training", "school"):
        scheduled_start = sched.get("start_time") or sched.get("start")
        scheduled_end = sched.get("end_time") or sched.get("end")
    late_min = 0
    if agg["clock_in"] and scheduled_start:
        delta = _minutes_between(scheduled_start, agg["clock_in"])
        late_min = max(0, delta - LATE_TOLERANCE_MINUTES) if delta > LATE_TOLERANCE_MINUTES else 0
    overtime_min = 0
    if agg["clock_out"] and scheduled_end:
        overtime_min = max(0, _minutes_between(scheduled_end, agg["clock_out"]))
    early_leave = 0
    if agg["clock_out"] and scheduled_end:
        early_leave = max(0, _minutes_between(agg["clock_out"], scheduled_end))
    # Off / leave / rtt / recup / training → dedicated statuses (no "absent")
    if sched_type == "off":
        status = "off"
    elif sched_type == "leave":
        status = "congés"
    elif sched_type == "rtt":
        status = "rtt"
    elif sched_type == "recup":
        status = "récup"
    elif sched_type == "school":
        status = "école"
    elif not agg["clock_in"]:
        status = "à venir" if not sched or sched_type not in ("shift", "training") else "absent"
    elif not agg["is_closed"]:
        status = "en cours"
    elif late_min > 0:
        status = "en retard"
    else:
        status = "conforme"
    return {
        "scheduled_start": scheduled_start,
        "scheduled_end": scheduled_end,
        "late_minutes": late_min,
        "overtime_minutes": overtime_min,
        "early_leave_minutes": early_leave,
        "status": status,
    }


@api.get("/badging/state")
async def badging_state():
    me = await _me()
    await _auto_close_expired_days(me["id"])
    today = _now_paris().date().isoformat()
    now_hm = _hm(_now_paris())
    punches = await _get_punches(me["id"], today)
    agg = _aggregate_day(punches)
    sched = await db.schedules.find_one({"employee_id": me["id"], "day": today}, {"_id": 0})
    blocked = await _has_active_leave(me["id"], today)

    step = "clock_in"
    if agg["is_closed"]:
        step = "closed"
    elif agg["clock_in"] and agg["break_out"] and not agg["break_in"]:
        step = "break_in"
    elif agg["clock_in"]:
        step = "choose"

    next_shift = None
    if agg["is_closed"] or blocked:
        ns = await _next_scheduled_shift(me["id"], today)
        if ns:
            next_shift = {
                "day": ns["day"],
                "start_time": ns.get("start_time") or ns.get("start"),
                "end_time": ns.get("end_time") or ns.get("end"),
            }

    break_locked_until = None
    if step == "break_in" and agg["break_out"]:
        broke_at = _paris_datetime_from_time(today, agg["break_out"])
        available_at = broke_at + timedelta(minutes=MIN_BREAK_MINUTES)
        if _now_paris() < available_at:
            break_locked_until = _hm(available_at)

    status_meta = await _day_status(me["id"], today, sched, agg)
    return {
        "day": today,
        "now": now_hm,
        "step": step,
        "punches": punches,
        "aggregate": agg,
        "schedule": sched,
        "blocked_reason": blocked,
        "next_shift": next_shift,
        "break_locked_until": break_locked_until,
        "min_break_minutes": MIN_BREAK_MINUTES,
        **status_meta,
    }


class PunchPayload(BaseModel):
    action: Optional[str] = "auto"


@api.post("/badging/punch")
async def punch(payload: PunchPayload):
    me = await _me()
    await _auto_close_expired_days(me["id"])
    today = _now_paris().date().isoformat()
    now_hm = _hm(_now_paris())
    now_dt = _now_paris()

    blocked = await _has_active_leave(me["id"], today)
    if blocked:
        raise HTTPException(400, f"Badgeage impossible aujourd'hui : {blocked}.")

    punches = await _get_punches(me["id"], today)
    agg = _aggregate_day(punches)

    if agg["is_closed"]:
        ns = await _next_scheduled_shift(me["id"], today)
        if ns:
            start = ns.get("start_time") or ns.get("start") or "—"
            raise HTTPException(400, f"Journée terminée. Prochain badge le {ns['day']} à {start}.")
        raise HTTPException(400, "Journée terminée. Aucun prochain shift planifié.")

    if agg["clock_in"] is None:
        ptype = "clock_in"
    elif agg["break_out"] and not agg["break_in"]:
        broke_at = _paris_datetime_from_time(today, agg["break_out"])
        elapsed = (now_dt - broke_at).total_seconds() / 60
        if elapsed < MIN_BREAK_MINUTES:
            remaining = MIN_BREAK_MINUTES - int(elapsed)
            raise HTTPException(
                400,
                f"Pause minimum de {MIN_BREAK_MINUTES} min non écoulée. Encore {remaining} min avant retour.",
            )
        ptype = "break_in"
    else:
        action = (payload.action or "").lower()
        if action not in ("break", "end"):
            raise HTTPException(
                400,
                "Choisissez une action : 'break' (départ en pause) ou 'end' (fin de journée).",
            )
        ptype = "break_out" if action == "break" else "clock_out"

    punch_doc = {
        "id": _id(),
        "employee_id": me["id"],
        "day": today,
        "type": ptype,
        "time": now_hm,
        "ts": _now(),
        "source": "self",
    }
    await db.punches.insert_one(punch_doc.copy())
    return await badging_state()


@api.get("/badging/history")
async def badging_history(days: int = 30, future_days: int = 0):
    """Return per-day rows for the current user. Includes `future_days` days ahead
    (schedule-only rows, no punches) so the frontend can display a complete
    Mon→Sun / month grid even for days that haven't happened yet."""
    me = await _me()
    await _auto_close_expired_days(me["id"])
    days = max(1, min(days, 366))
    future_days = max(0, min(future_days, 60))
    today = _now_paris().date()
    from_day = (today - timedelta(days=days - 1)).isoformat()
    to_day = (today + timedelta(days=future_days)).isoformat()
    cursor = db.punches.find(
        {"employee_id": me["id"], "day": {"$gte": from_day}}, {"_id": 0}
    )
    by_day: dict[str, List[dict]] = {}
    async for p in cursor:
        by_day.setdefault(p["day"], []).append(p)
    scheds: dict[str, dict] = {}
    async for s in db.schedules.find(
        {"employee_id": me["id"], "day": {"$gte": from_day, "$lte": to_day}}, {"_id": 0}
    ):
        scheds[s["day"]] = s
    rows = []
    total_range = days + future_days
    for offset in range(total_range):
        # offset 0 = today, positive offsets = future, else past
        offset_from_today = future_days - offset
        d = (today + timedelta(days=offset_from_today)).isoformat()
        p_list = sorted(by_day.get(d, []), key=lambda p: p.get("ts", ""))
        agg = _aggregate_day(p_list)
        sched = scheds.get(d)
        meta = await _day_status(me["id"], d, sched, agg)
        # Normalise shift_type field to keep the legacy contract used by the
        # frontend badging UI (accepts: shift | off | conges | rtt | recup | training).
        raw_st = ((sched.get("shift_type") if sched else None) or "").lower()
        raw_t = ((sched.get("type") if sched else None) or "").lower()
        if raw_st == "off" or raw_st == "rest" or raw_t == "off":
            shift_type = "off"
        elif raw_st == "conges" or raw_t == "leave":
            shift_type = "conges"
        elif raw_st == "rtt" or raw_t == "rtt":
            shift_type = "rtt"
        elif raw_st == "recup":
            shift_type = "recup"
        elif raw_t == "training":
            shift_type = "training"
        elif sched:
            shift_type = raw_st or "shift"
        else:
            shift_type = None
        if d > today.isoformat() and shift_type not in ("off", "conges", "rtt", "recup"):
            # Future day with a shift or nothing → "à venir"
            meta["status"] = "à venir"
        rows.append({
            "day": d, **agg, **meta,
            "shift_type": shift_type,
            "has_punches": len(p_list) > 0,
        })
    return rows


@api.get("/badging/summary")
async def badging_summary():
    me = await _me()
    today = _now_paris().date()
    monday = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    cursor = db.punches.find(
        {"employee_id": me["id"], "day": {"$gte": month_start.isoformat()}}, {"_id": 0}
    )
    by_day: dict[str, List[dict]] = {}
    async for p in cursor:
        by_day.setdefault(p["day"], []).append(p)
    scheds: dict[str, dict] = {}
    async for s in db.schedules.find(
        {"employee_id": me["id"], "day": {"$gte": month_start.isoformat()}}, {"_id": 0}
    ):
        scheds[s["day"]] = s
    week_worked = week_late = week_ot = 0
    month_worked = month_late = month_ot = 0
    days_worked = 0
    for day_iso, plist in by_day.items():
        agg = _aggregate_day(sorted(plist, key=lambda p: p.get("ts", "")))
        meta = await _day_status(me["id"], day_iso, scheds.get(day_iso), agg)
        d = date.fromisoformat(day_iso)
        month_worked += agg["worked_minutes"]
        month_late += meta["late_minutes"]
        month_ot += meta["overtime_minutes"]
        if agg["clock_in"]:
            days_worked += 1
        if d >= monday:
            week_worked += agg["worked_minutes"]
            week_late += meta["late_minutes"]
            week_ot += meta["overtime_minutes"]
    return {
        "week": {
            "worked_minutes": week_worked, "late_minutes": week_late,
            "overtime_minutes": week_ot,
            "range_start": monday.isoformat(),
            "range_end": (monday + timedelta(days=6)).isoformat(),
        },
        "month": {
            "worked_minutes": month_worked, "late_minutes": month_late,
            "overtime_minutes": month_ot, "days_worked": days_worked,
            "range_start": month_start.isoformat(),
            "range_end": today.isoformat(),
        },
    }





# ═══════════════════════════════════════════════════════════════════
# Overtime (heures exceptionnelles) + Recovery counter
# ═══════════════════════════════════════════════════════════════════
class OvertimePause(BaseModel):
    start: str  # HH:MM
    end: str


class OvertimeDeclare(BaseModel):
    event_type: str  # event | meeting | training | inventory | intervention | other
    reason: str
    center: Optional[str] = ""
    manager_id: Optional[str] = None
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str
    pauses: List[OvertimePause] = []
    comment: Optional[str] = ""
    attachment_url: Optional[str] = ""
    attachment_name: Optional[str] = ""


def _minutes_between(a: str, b: str) -> int:
    x, y = _hm_to_minutes(a), _hm_to_minutes(b)
    if x is None or y is None:
        return 0
    return max(0, y - x)


def _compute_overtime_minutes(p: dict) -> int:
    total = _minutes_between(p.get("start_time", ""), p.get("end_time", ""))
    for pp in (p.get("pauses") or []):
        total -= _minutes_between(pp.get("start", ""), pp.get("end", ""))
    return max(0, total)


@api.post("/overtime/declare")
async def declare_overtime(payload: OvertimeDeclare):
    me = await _me()
    d = payload.model_dump()
    d["id"] = _id()
    d["employee_id"] = me["id"]
    d["status"] = "pending"
    d["type"] = "overtime_declare"
    d["minutes"] = _compute_overtime_minutes(d)
    d["created_at"] = _now()
    d["decided_at"] = None
    d["decided_by"] = None
    d["decision_comment"] = ""
    await db.overtime.insert_one(d.copy())
    admins = await db.employees.find({"is_admin": True}, {"id": 1}).to_list(20)
    for a in admins:
        await _push_notification(
            employee_id=a["id"],
            type="overtime",
            title=f"Heures exceptionnelles · {me.get('first_name','')} {me.get('last_name','')}",
            content=f"{d['minutes'] // 60}h{d['minutes'] % 60:02d} · {d['reason']}",
            icon="clock",
            link="/management/heures-supp",
        )
    return await _strip(d)


class RecoveryRequest(BaseModel):
    kind: str  # full_day | half_day | precise
    dates: List[str]  # YYYY-MM-DD
    minutes: Optional[int] = None  # for precise
    comment: Optional[str] = ""


@api.post("/overtime/recovery")
async def request_recovery(payload: RecoveryRequest):
    me = await _me()
    counter = await _overtime_counter_for(me["id"])
    if counter["available_minutes"] < 6 * 60:
        raise HTTPException(400, "Solde d'heures supplémentaires insuffisant (min. 6h00)")
    d = payload.model_dump()
    d["id"] = _id()
    d["employee_id"] = me["id"]
    d["status"] = "pending"
    d["type"] = "overtime_recovery"
    d["created_at"] = _now()
    d["decided_at"] = None
    d["decided_by"] = None
    d["decision_comment"] = ""
    # Estimate minutes if not provided
    if d["kind"] == "full_day":
        d["minutes"] = len(d["dates"]) * (5 * 60 + 59)
    elif d["kind"] == "half_day":
        d["minutes"] = len(d["dates"]) * (3 * 60)
    await db.overtime.insert_one(d.copy())
    admins = await db.employees.find({"is_admin": True}, {"id": 1}).to_list(20)
    for a in admins:
        await _push_notification(
            employee_id=a["id"],
            type="overtime",
            title=f"Demande de récupération · {me.get('first_name','')} {me.get('last_name','')}",
            content=f"{d['minutes'] // 60}h{d['minutes'] % 60:02d}",
            icon="clock",
            link="/management/heures-supp",
        )
    return await _strip(d)


async def _overtime_counter_for(employee_id: str) -> dict:
    # Sum approved declares - approved recoveries taken this month
    now = _now_paris()
    month_start = date(now.year, now.month, 1).isoformat()
    declares = await db.overtime.find({
        "employee_id": employee_id, "type": "overtime_declare",
        "status": "approved", "date": {"$gte": month_start}
    }, {"_id": 0}).to_list(500)
    recoveries = await db.overtime.find({
        "employee_id": employee_id, "type": "overtime_recovery",
        "status": "approved"
    }, {"_id": 0}).to_list(500)
    pending_declares = await db.overtime.find({
        "employee_id": employee_id, "type": "overtime_declare",
        "status": "pending", "date": {"$gte": month_start}
    }, {"_id": 0}).to_list(500)

    declared_min = sum(d.get("minutes", 0) for d in declares)
    recovered_min = sum(r.get("minutes", 0) for r in recoveries)
    pending_min = sum(d.get("minutes", 0) for d in pending_declares)
    available = max(0, declared_min - recovered_min)
    return {
        "declared_minutes": declared_min,
        "recovered_minutes": recovered_min,
        "pending_minutes": pending_min,
        "available_minutes": available,
        "can_request_recovery": available >= 6 * 60,
        "threshold_minutes": 6 * 60,
        "declares": declares,
        "recoveries": recoveries,
        "pending_declares": pending_declares,
    }


@api.get("/overtime/counter")
async def get_overtime_counter():
    me = await _me()
    return await _overtime_counter_for(me["id"])


@api.get("/overtime/mine")
async def list_my_overtime():
    me = await _me()
    items = await db.overtime.find({"employee_id": me["id"]}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return items


@api.get("/admin/overtime")
async def admin_list_overtime(status: Optional[str] = None):
    await require_admin()
    query: dict = {}
    if status:
        query["status"] = status
    items = await db.overtime.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    emp_ids = list({i.get("employee_id") for i in items})
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0})}
    for it in items:
        e = emps.get(it.get("employee_id"))
        if e:
            it["employee_name"] = f"{e.get('first_name','')} {e.get('last_name','')}".strip()
            it["employee_avatar"] = e.get("avatar_url")
    return items


class OvertimeDecision(BaseModel):
    status: str  # approved | rejected
    comment: Optional[str] = ""


@api.put("/admin/overtime/{oid}/decide")
async def admin_decide_overtime(oid: str, payload: OvertimeDecision):
    me = await require_admin()
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(400, "Statut invalide")
    upd = {"status": payload.status, "decision_comment": payload.comment or "",
           "decided_at": _now(), "decided_by": me["id"]}
    await db.overtime.update_one({"id": oid}, {"$set": upd})
    o = await db.overtime.find_one({"id": oid}, {"_id": 0})
    if o:
        t = o.get("type", "overtime")
        title = "Heures exceptionnelles" if t == "overtime_declare" else "Récupération"
        verb = "approuvée" if payload.status == "approved" else "refusée"
        await _push_notification(
            employee_id=o["employee_id"],
            type="overtime",
            title=f"{title} {verb}",
            content=payload.comment or "",
            icon="clock",
            link="/rh/badgeage",
        )
        # If recovery approved, materialize as leave days
        if t == "overtime_recovery" and payload.status == "approved" and o.get("kind") == "full_day":
            for d in (o.get("dates") or []):
                await db.schedules.update_one(
                    {"employee_id": o["employee_id"], "day": d},
                    {"$set": {"type": "recovery", "start": None, "end": None,
                              "pause_start": None, "pause_end": None,
                              "location": "Récupération", "service": ""}},
                    upsert=True,
                )
    return o




# ═══════════════════════════════════════════════════════════════════
# Formations (formation catalog + registrations + proposals)
# ═══════════════════════════════════════════════════════════════════
class FormationCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    category: Optional[str] = "Métier"
    duration_hours: int = 8
    format: Optional[str] = "présentiel"  # présentiel | distanciel | hybride
    location: Optional[str] = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    trainer: Optional[str] = ""
    max_participants: Optional[int] = 20
    cover_image: Optional[str] = None
    form_url: Optional[str] = None  # optional external registration/info form
    is_open: bool = True


@api.get("/formations")
async def list_formations():
    items = await db.formations.find({}, {"_id": 0}).sort("start_date", 1).to_list(500)
    me_id = current_user()
    for f in items:
        regs = await db.formation_registrations.count_documents({"formation_id": f["id"], "status": {"$ne": "cancelled"}})
        f["registrations_count"] = regs
        my = await db.formation_registrations.find_one({"formation_id": f["id"], "employee_id": me_id, "status": {"$ne": "cancelled"}})
        f["me_registered"] = bool(my)
    return items


@api.get("/formations/{fid}")
async def get_formation(fid: str):
    f = await db.formations.find_one({"id": fid}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Formation introuvable")
    regs = await db.formation_registrations.find({"formation_id": fid}, {"_id": 0}).to_list(500)
    emp_ids = [r["employee_id"] for r in regs]
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0})}
    for r in regs:
        e = emps.get(r["employee_id"], {})
        r["employee_name"] = f"{e.get('first_name','')} {e.get('last_name','')}".strip()
        r["employee_avatar"] = e.get("avatar_url") or e.get("avatar")
    f["registrations"] = regs
    return f


@api.post("/admin/formations")
async def create_formation(payload: FormationCreate):
    await require_admin()
    f = payload.model_dump()
    f["id"] = _id()
    f["created_at"] = _now()
    await db.formations.insert_one(f.copy())
    return await _strip(f)


@api.put("/admin/formations/{fid}")
async def update_formation(fid: str, payload: FormationCreate):
    await require_admin()
    await db.formations.update_one({"id": fid}, {"$set": payload.model_dump()})
    return await db.formations.find_one({"id": fid}, {"_id": 0})


@api.delete("/admin/formations/{fid}")
async def delete_formation(fid: str):
    await require_admin()
    await db.formations.delete_one({"id": fid})
    await db.formation_registrations.delete_many({"formation_id": fid})
    return {"ok": True}


@api.post("/formations/{fid}/register")
async def register_formation(fid: str):
    me = await _me()
    f = await db.formations.find_one({"id": fid}, {"_id": 0})
    if not f or not f.get("is_open"):
        raise HTTPException(400, "Inscriptions fermées")
    existing = await db.formation_registrations.find_one({"formation_id": fid, "employee_id": me["id"]})
    if existing:
        await db.formation_registrations.update_one({"_id": existing["_id"]}, {"$set": {"status": "registered"}})
    else:
        await db.formation_registrations.insert_one({
            "id": _id(), "formation_id": fid, "employee_id": me["id"],
            "status": "registered", "created_at": _now(),
        })
    return {"ok": True, "status": "registered"}


@api.delete("/formations/{fid}/register")
async def unregister_formation(fid: str):
    me = await _me()
    await db.formation_registrations.update_one(
        {"formation_id": fid, "employee_id": me["id"]},
        {"$set": {"status": "cancelled", "cancelled_at": _now()}},
    )
    return {"ok": True}


class FormationProposal(BaseModel):
    title: str
    reason: str
    expected_benefit: Optional[str] = ""
    external_link: Optional[str] = ""


@api.post("/formations/propose")
async def propose_formation(payload: FormationProposal):
    me = await _me()
    p = payload.model_dump()
    p["id"] = _id()
    p["employee_id"] = me["id"]
    p["status"] = "pending"
    p["created_at"] = _now()
    await db.formation_proposals.insert_one(p.copy())
    admins = await db.employees.find({"is_admin": True}, {"id": 1}).to_list(20)
    for a in admins:
        await _push_notification(
            employee_id=a["id"], type="formation",
            title=f"Nouvelle proposition de formation · {me.get('first_name','')} {me.get('last_name','')}",
            content=p["title"], icon="graduation-cap", link="/management/formations",
        )
    return await _strip(p)


@api.get("/admin/formation-proposals")
async def list_proposals():
    await require_admin()
    items = await db.formation_proposals.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    emp_ids = list({p["employee_id"] for p in items})
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0})}
    for p in items:
        e = emps.get(p["employee_id"], {})
        p["employee_name"] = f"{e.get('first_name','')} {e.get('last_name','')}".strip()
    return items


# ═══════════════════════════════════════════════════════════════════
# Support IT tickets
# ═══════════════════════════════════════════════════════════════════
class TicketCreate(BaseModel):
    subject: str
    category: str  # hardware | software | network | access | account | other
    priority: str = "normal"  # low | normal | high | urgent
    description: str
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None


class TicketReply(BaseModel):
    message: str


@api.get("/tickets")
async def list_my_tickets():
    me = await _me()
    if me.get("is_admin"):
        items = await db.tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        items = await db.tickets.find({"employee_id": me["id"]}, {"_id": 0}).sort("created_at", -1).to_list(300)
    emp_ids = list({t.get("employee_id") for t in items})
    emps = {e["id"]: e async for e in db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0})}
    for t in items:
        e = emps.get(t.get("employee_id"), {})
        t["employee_name"] = f"{e.get('first_name','')} {e.get('last_name','')}".strip()
        t["employee_avatar"] = e.get("avatar_url") or e.get("avatar")
    return items


@api.get("/tickets/{tid}")
async def get_ticket(tid: str):
    me = await _me()
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket introuvable")
    if t["employee_id"] != me["id"] and not me.get("is_admin"):
        raise HTTPException(403, "Accès refusé")
    return t


@api.post("/tickets")
async def create_ticket(payload: TicketCreate):
    me = await _me()
    t = payload.model_dump()
    t["id"] = _id()
    t["number"] = f"TKT-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    t["employee_id"] = me["id"]
    t["status"] = "open"
    t["messages"] = [{
        "id": _id(), "author_id": me["id"], "author_name": f"{me.get('first_name','')} {me.get('last_name','')}",
        "message": payload.description, "at": _now(),
    }]
    t["created_at"] = _now()
    t["updated_at"] = _now()
    await db.tickets.insert_one(t.copy())
    admins = await db.employees.find({"is_admin": True}, {"id": 1}).to_list(20)
    for a in admins:
        await _push_notification(
            employee_id=a["id"], type="ticket",
            title=f"Nouveau ticket {t['number']} · {payload.priority.upper()}",
            content=payload.subject, icon="life-buoy", link="/management/support",
        )
    return await _strip(t)


@api.post("/tickets/{tid}/reply")
async def reply_ticket(tid: str, payload: TicketReply):
    me = await _me()
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket introuvable")
    if t["employee_id"] != me["id"] and not me.get("is_admin"):
        raise HTTPException(403, "Accès refusé")
    msg = {
        "id": _id(), "author_id": me["id"],
        "author_name": f"{me.get('first_name','')} {me.get('last_name','')}",
        "is_admin": bool(me.get("is_admin")),
        "message": payload.message, "at": _now(),
    }
    new_status = t.get("status", "open")
    if me.get("is_admin") and new_status == "open":
        new_status = "in_progress"
    await db.tickets.update_one({"id": tid}, {"$push": {"messages": msg}, "$set": {"updated_at": _now(), "status": new_status}})
    # notify the other party
    other_id = t["employee_id"] if me.get("is_admin") else None
    if other_id:
        await _push_notification(
            employee_id=other_id, type="ticket",
            title=f"Réponse au ticket {t['number']}",
            content=payload.message[:100], icon="life-buoy",
            link=f"/support/tickets/{tid}",
        )
    return await db.tickets.find_one({"id": tid}, {"_id": 0})


class TicketStatus(BaseModel):
    status: str  # open | in_progress | waiting | resolved | closed


@api.put("/tickets/{tid}/status")
async def set_ticket_status(tid: str, payload: TicketStatus):
    me = await _me()
    if not me.get("is_admin"):
        raise HTTPException(403, "Accès refusé")
    await db.tickets.update_one({"id": tid}, {"$set": {"status": payload.status, "updated_at": _now()}})
    return await db.tickets.find_one({"id": tid}, {"_id": 0})


# ═══════════════════════════════════════════════════════════════════
# Centre d'aide (FAQ / help articles)
# ═══════════════════════════════════════════════════════════════════
HELP_ARTICLES = [
    {"id": "h-badge", "category": "Badge", "icon": "fingerprint", "title": "Comment badger en ligne ?",
     "content": "Cliquez sur le bouton **Badgeage** en haut de la page Badge. Le système détecte automatiquement la prochaine étape (Entrée → Pause sortie → Pause entrée → Sortie) et enregistre l'heure. Vous verrez votre pointage apparaître immédiatement dans les cartes du jour."},
    {"id": "h-overtime", "category": "Badge", "icon": "clock", "title": "Comment déclarer des heures exceptionnelles ?",
     "content": "Sur la page Badge, section **Récapitulatif mensuel**, cliquez sur **Déclarer des heures exceptionnelles**. Choisissez le type (Événement, Réunion, Formation…), renseignez le motif, les horaires et éventuellement des pauses. Votre responsable devra valider avant que les heures soient ajoutées à votre compteur."},
    {"id": "h-recovery", "category": "Badge", "icon": "clock", "title": "Comment demander une récupération (RTT) ?",
     "content": "Dès que votre solde atteint 6h, un bouton **Demander une récupération (RTT)** apparaît sur la page Badge. La demande doit être posée et récupérée dans les 10 jours suivant l'atteinte du seuil, sinon les heures sont automatiquement payées."},
    {"id": "h-leave", "category": "Congés", "icon": "calendar", "title": "Comment poser un congé ?",
     "content": "Rendez-vous sur **Congés et absences**, cliquez sur **Nouvelle demande**, sélectionnez le type (CP, RTT, arrêt maladie…), choisissez vos dates sur le calendrier interactif et validez. Votre responsable recevra la demande pour approbation."},
    {"id": "h-expense", "category": "Notes de frais", "icon": "receipt", "title": "Comment soumettre une note de frais ?",
     "content": "Depuis **Notes de frais**, cliquez sur **Nouvelle note de frais**, ajoutez vos dépenses (Transport, Repas, Hébergement, Autres) avec les justificatifs correspondants, puis soumettez. L'admin recevra une notification pour approbation."},
    {"id": "h-meal", "category": "Points repas", "icon": "utensils-crossed", "title": "Comment fonctionnent les points repas ?",
     "content": "Vous recevez automatiquement chaque jour un quota de points repas (20 pour la majorité, 25 pour Idriss). Utilisez-les sur la page **Restauration** pour commander votre repas — la commande doit être passée le jour même, au moins 1h avant le retrait."},
    {"id": "h-training", "category": "Formation", "icon": "graduation-cap", "title": "Comment s'inscrire à une formation ?",
     "content": "Sur la page **Formation**, parcourez le catalogue et cliquez sur **S'inscrire** pour la formation qui vous intéresse. Vous pouvez également proposer une nouvelle formation via le bouton **Proposer une formation**."},
    {"id": "h-ticket", "category": "IT", "icon": "life-buoy", "title": "Comment ouvrir un ticket IT ?",
     "content": "Sur **Support Informatique**, cliquez sur **Nouveau ticket**, décrivez votre problème (catégorie, priorité, description), joignez éventuellement une capture d'écran. Vous pourrez suivre l'avancement et échanger avec l'équipe IT depuis la page du ticket."},
    {"id": "h-newsletter", "category": "Communication", "icon": "mail", "title": "Où trouver les newsletters ?",
     "content": "La page **Newsletters** regroupe toutes les communications internes officielles. Chaque newsletter est composée de blocs (texte, images, boutons, hero) et peut inclure des pièces jointes."},
]


@api.get("/help/articles")
async def list_help_articles(category: Optional[str] = None, q: Optional[str] = None):
    items = list(HELP_ARTICLES)
    if category and category != "all":
        items = [a for a in items if a["category"] == category]
    if q:
        n = q.lower()
        items = [a for a in items if n in (a["title"] + " " + a["content"]).lower()]
    return items


@api.get("/help/articles/{aid}")
async def get_help_article(aid: str):
    for a in HELP_ARTICLES:
        if a["id"] == aid:
            return a
    raise HTTPException(404, "Article introuvable")


# Seed a few demo formations if empty
async def _seed_formations():
    if await db.formations.count_documents({}) > 0:
        return
    demos = [
        {"id": _id(), "title": "Sécurité HACCP en restauration",
         "description": "Formation obligatoire pour le personnel de restauration : hygiène, chaîne du froid, traçabilité.",
         "category": "Sécurité", "duration_hours": 14, "format": "présentiel",
         "location": "MS Park — Salle formation", "start_date": (date.today() + timedelta(days=14)).isoformat(),
         "end_date": (date.today() + timedelta(days=15)).isoformat(),
         "trainer": "Chef Thomas DUPONT", "max_participants": 12,
         "cover_image": "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800",
         "is_open": True, "created_at": _now()},
        {"id": _id(), "title": "Excel avancé — tableaux croisés dynamiques",
         "description": "Maîtrisez les TCD, formules avancées et automatisations pour vos reportings.",
         "category": "Bureautique", "duration_hours": 7, "format": "distanciel",
         "trainer": "OpenClassrooms", "max_participants": 20,
         "start_date": (date.today() + timedelta(days=30)).isoformat(),
         "cover_image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800",
         "is_open": True, "created_at": _now()},
        {"id": _id(), "title": "Anglais professionnel — niveau B2",
         "description": "10 séances de 2h avec un formateur natif, en petit groupe.",
         "category": "Langues", "duration_hours": 20, "format": "hybride",
         "trainer": "British Council", "max_participants": 8,
         "start_date": (date.today() + timedelta(days=45)).isoformat(),
         "cover_image": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800",
         "is_open": True, "created_at": _now()},
    ]
    await db.formations.insert_many(demos)


# ═══════════════════════════════════════════════════════════════════
# Meeting rooms (Salles de réunion) — reservations module
# ═══════════════════════════════════════════════════════════════════
MEETING_ROOM_SEEDS = [
    {
        "id": "room-horizon",
        "name": "Salle Horizon",
        "capacity": 12,
        "floor": "2ᵉ étage",
        "equipments": ["screen", "video", "whiteboard", "power", "wifi", "audio"],
        "photo_url": "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
        "photos": [
            "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
            "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=1200&q=80",
            "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&q=80",
            "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80",
        ],
        "description": "Grande salle claire avec vue dégagée, idéale pour les points d'équipe.",
    },
    {
        "id": "room-galaxie",
        "name": "Salle Galaxie",
        "capacity": 25,
        "floor": "2ᵉ étage",
        "equipments": ["screen", "video", "whiteboard", "power", "wifi", "audio", "hdmi"],
        "photo_url": "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=1200&q=80",
        "photos": [
            "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=1200&q=80",
            "https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=1200&q=80",
            "https://images.unsplash.com/photo-1587560699334-cc4ff634909a?w=1200&q=80",
            "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&q=80",
        ],
        "description": "Grand espace pour formations, séminaires et présentations plénières.",
    },
    {
        "id": "room-nova",
        "name": "Salle Nova",
        "capacity": 6,
        "floor": "1ᵉʳ étage",
        "equipments": ["screen", "video", "whiteboard", "power", "wifi"],
        "photo_url": "https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=1200&q=80",
        "photos": [
            "https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=1200&q=80",
            "https://images.unsplash.com/photo-1573164713988-8665fc963095?w=1200&q=80",
            "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?w=1200&q=80",
        ],
        "description": "Petit format cosy pour entretiens et réunions rapprochées.",
    },
    {
        "id": "room-eclipse",
        "name": "Salle Éclipse",
        "capacity": 4,
        "floor": "1ᵉʳ étage",
        "equipments": ["screen", "video", "power", "wifi"],
        "photo_url": "https://images.unsplash.com/photo-1577412647305-991150c7d163?w=1200&q=80",
        "photos": [
            "https://images.unsplash.com/photo-1577412647305-991150c7d163?w=1200&q=80",
            "https://images.unsplash.com/photo-1543269664-56d93c1b41a6?w=1200&q=80",
            "https://images.unsplash.com/photo-1497366858526-0766cadbe8fa?w=1200&q=80",
        ],
        "description": "Salle de visio dédiée aux appels externes et aux 1-à-1.",
    },
]


EQUIPMENT_LABELS = {
    "screen": "Écran de présentation",
    "video": "Visioconférence",
    "whiteboard": "Tableau blanc",
    "power": "Prises électriques",
    "wifi": "Connexion Wi-Fi",
    "audio": "Système audio",
    "hdmi": "Câble HDMI",
    "paperboard": "Paperboard",
    "computer": "Ordinateur",
    "adapter": "Adaptateur",
    "water": "Bouteilles d'eau",
    "coffee": "Café",
    "microphone": "Micro",
}


async def _seed_meeting_rooms():
    if await db.meeting_rooms.count_documents({}) == 0:
        now = _now()
        for r in MEETING_ROOM_SEEDS:
            await db.meeting_rooms.insert_one({
                **r,
                "is_active": True,
                "maintenance_note": None,
                "created_at": now,
            })
    # Idempotent backfill: add photos[] to existing rooms lacking it
    for r in MEETING_ROOM_SEEDS:
        await db.meeting_rooms.update_one(
            {"id": r["id"], "$or": [{"photos": {"$exists": False}}, {"photos": []}]},
            {"$set": {"photos": r["photos"]}},
        )
    # Demo reservations to showcase busy slots (idempotent: skip if any already
    # exists for these salle+day combos).
    await _seed_demo_reservations()


async def _seed_demo_reservations():
    """Populate a handful of demo reservations over the next 3 days so the
    planning UI immediately shows realistic busy slots."""
    # Pick a small set of demo employees to act as organizers
    emps = await db.employees.find(
        {"is_super_admin": {"$ne": True}}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}
    ).to_list(20)
    if not emps:
        return
    # Prefer non-Idriss organizers so the current demo user sees "Occupé" cells
    others = [e for e in emps if e["id"] != "emp-idriss-malonga"] or emps
    from datetime import datetime, timedelta, timezone as _tz
    today = _now_paris().date()
    demo_plan = [
        # (room_id, day_offset, start_hh, start_mm, dur_min, title)
        ("room-horizon", 0, 9, 0, 60, "Point RH mensuel"),
        ("room-horizon", 0, 14, 0, 90, "Comité opérationnel"),
        ("room-galaxie", 0, 10, 30, 120, "Formation SST"),
        ("room-galaxie", 0, 15, 0, 60, "Briefing équipes"),
        ("room-nova", 0, 11, 0, 45, "Entretien candidat"),
        ("room-nova", 0, 16, 0, 30, "Point 1-à-1"),
        ("room-eclipse", 0, 9, 30, 60, "Visio partenaire"),
        ("room-horizon", 1, 10, 0, 120, "Atelier planification"),
        ("room-galaxie", 1, 14, 0, 180, "Comité de direction"),
        ("room-nova", 1, 15, 30, 45, "Debrief mission"),
        ("room-horizon", 2, 9, 30, 90, "Réunion Communication"),
        ("room-eclipse", 2, 11, 0, 30, "Point CSE"),
    ]
    for i, (rid, off, hh, mm, dur, title) in enumerate(demo_plan):
        # Skip if any reservation already exists for this room+day at this time
        day = today + timedelta(days=off)
        start_dt = datetime.combine(day, datetime.min.time()).replace(hour=hh, minute=mm)
        start_dt = start_dt.replace(tzinfo=PARIS_TZ).astimezone(_tz.utc)
        end_dt = start_dt + timedelta(minutes=dur)
        exists = await db.room_reservations.find_one({
            "room_id": rid,
            "start_ts": start_dt.isoformat(),
            "status": {"$ne": "cancelled"},
        })
        if exists:
            continue
        org = others[i % len(others)]
        await db.room_reservations.insert_one({
            "id": _id(),
            "room_id": rid,
            "organizer_id": org["id"],
            "title": title,
            "meeting_type": "team",
            "start_ts": start_dt.isoformat(),
            "end_ts": end_dt.isoformat(),
            "participants_ids": [org["id"]],
            "external_participants": [],
            "participants_count": 4,
            "description": "",
            "equipments_needed": [],
            "special_request": "",
            "status": "confirmed",
            "created_at": _now(),
            "created_by": org["id"],
            "is_demo": True,
        })


class MeetingRoomIn(BaseModel):
    name: str
    capacity: int
    floor: Optional[str] = ""
    building: Optional[str] = ""
    zone: Optional[str] = ""
    room_number: Optional[str] = ""
    equipments: List[str] = []
    services: List[str] = []
    photo_url: Optional[str] = ""
    photos: List[str] = []
    description: Optional[str] = ""
    min_duration_minutes: Optional[int] = 15
    status: Optional[str] = "available"  # available | maintenance | unavailable
    is_active: Optional[bool] = True
    maintenance_note: Optional[str] = None


class MeetingReservationIn(BaseModel):
    room_id: str
    title: str
    meeting_type: str = "team"  # team | interview | training | video | external | direction | workshop | other
    start_ts: str  # ISO
    end_ts: str    # ISO
    participants_ids: List[str] = []
    external_participants: List[str] = []
    participants_count: Optional[int] = None
    description: Optional[str] = ""
    equipments_needed: List[str] = []
    special_request: Optional[str] = ""
    organizer_id: Optional[str] = None  # admin can book on behalf
    # Recurrence — optional. If provided, the server creates N reservations
    # (one every `frequency` interval starting from start_ts/end_ts). Each
    # occurrence is atomically checked for room conflicts.
    recurrence_frequency: Optional[str] = None  # "weekly" | "biweekly" | "monthly"
    recurrence_count: Optional[int] = None      # total number of occurrences (>=1). 1 = single booking.


def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def _add_month(dt: datetime) -> datetime:
    """Advance a datetime by ~1 month, clamping day-of-month to the target month's last day."""
    y, m = dt.year, dt.month + 1
    if m > 12:
        y += 1; m = 1
    import calendar as _cal
    last = _cal.monthrange(y, m)[1]
    return dt.replace(year=y, month=m, day=min(dt.day, last))


async def _room_conflicts(room_id: str, start_iso: str, end_iso: str, exclude_id: Optional[str] = None) -> list[dict]:
    q: dict = {
        "room_id": room_id,
        "status": {"$ne": "cancelled"},
        "start_ts": {"$lt": end_iso},
        "end_ts": {"$gt": start_iso},
    }
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.room_reservations.find(q, {"_id": 0}).to_list(50)


async def _room_current_status(room: dict) -> dict:
    """Return a friendly current status + next slot for a given room."""
    if not room.get("is_active"):
        return {"status_key": "maintenance", "status_label": "Indisponible pour maintenance", "next_slot": None}
    now_iso = _now()
    # Live reservation covering now?
    live = await db.room_reservations.find_one({
        "room_id": room["id"],
        "status": {"$ne": "cancelled"},
        "start_ts": {"$lte": now_iso},
        "end_ts": {"$gt": now_iso},
    }, {"_id": 0})
    if live:
        end_dt = _parse_iso(live["end_ts"]).astimezone(PARIS_TZ)
        return {
            "status_key": "busy",
            "status_label": f"Occupée jusqu'à {end_dt.strftime('%Hh%M')}",
            "next_slot": live["end_ts"],
        }
    # Next reservation today?
    today_start = _now_paris().replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    today_end = (_now_paris().replace(hour=23, minute=59, second=59, microsecond=0)).astimezone(timezone.utc).isoformat()
    next_res = await db.room_reservations.find_one({
        "room_id": room["id"],
        "status": {"$ne": "cancelled"},
        "start_ts": {"$gt": now_iso, "$lte": today_end},
    }, {"_id": 0}, sort=[("start_ts", 1)])
    if next_res:
        start_dt = _parse_iso(next_res["start_ts"]).astimezone(PARIS_TZ)
        return {
            "status_key": "free",
            "status_label": f"Disponible — prochain créneau à {start_dt.strftime('%Hh%M')}",
            "next_slot": next_res["start_ts"],
        }
    # Any reservations today at all?
    day_count = await db.room_reservations.count_documents({
        "room_id": room["id"],
        "status": {"$ne": "cancelled"},
        "start_ts": {"$gte": today_start, "$lt": today_end},
    })
    if day_count == 0:
        return {"status_key": "free", "status_label": "Disponible maintenant", "next_slot": None}
    return {"status_key": "free", "status_label": "Disponible", "next_slot": None}


async def _enrich_room(room: dict) -> dict:
    status = await _room_current_status(room)
    return {**room, **status}


@api.get("/rooms")
async def list_rooms():
    items = await db.meeting_rooms.find({}, {"_id": 0}).to_list(200)
    return [await _enrich_room(r) for r in items]


@api.get("/rooms/{rid}")
async def get_room(rid: str):
    room = await db.meeting_rooms.find_one({"id": rid}, {"_id": 0})
    if not room:
        raise HTTPException(404, "Salle introuvable")
    return await _enrich_room(room)


@api.get("/rooms/{rid}/availability")
async def room_availability(rid: str, date: Optional[str] = None):
    room = await db.meeting_rooms.find_one({"id": rid}, {"_id": 0})
    if not room:
        raise HTTPException(404, "Salle introuvable")
    day = date or _now_paris().date().isoformat()
    # Reservations that overlap this day
    day_start = datetime.fromisoformat(day + "T00:00:00+00:00").isoformat()
    day_end = datetime.fromisoformat(day + "T23:59:59+00:00").isoformat()
    items = await db.room_reservations.find({
        "room_id": rid,
        "status": {"$ne": "cancelled"},
        "start_ts": {"$lt": day_end},
        "end_ts": {"$gt": day_start},
    }, {"_id": 0}).sort("start_ts", 1).to_list(200)
    # Also opportunistically purge past reservations so they never show up
    # again as "occupied" once the meeting is over.
    now_iso = _now()
    await db.room_reservations.delete_many({"end_ts": {"$lt": now_iso}})
    items = [r for r in items if r.get("end_ts", "") > now_iso]
    uid = current_user()
    out = []
    for r in items:
        item = {
            "id": r["id"],
            "start_ts": r["start_ts"],
            "end_ts": r["end_ts"],
            "is_mine": r.get("organizer_id") == uid or uid in (r.get("participants_ids") or []),
            "status": r.get("status", "confirmed"),
        }
        # Privacy: show title only to organizer / participants
        if item["is_mine"]:
            item["title"] = r.get("title")
            item["organizer_id"] = r.get("organizer_id")
        else:
            item["title"] = "Réservé"
        out.append(item)
    return {"date": day, "reservations": out, "room": room}


async def _notify_participants(res: dict, action: str, extra_hint: str = ""):
    """Notify participants of a reservation about creation / update / cancellation."""
    organizer = await db.employees.find_one({"id": res.get("organizer_id")}, {"_id": 0})
    org_name = f"{organizer.get('first_name', '')} {organizer.get('last_name', '')}".strip() if organizer else "Un collègue"
    room = await db.meeting_rooms.find_one({"id": res["room_id"]}, {"_id": 0})
    room_name = (room or {}).get("name") or "Salle"
    start_dt = _parse_iso(res["start_ts"]).astimezone(PARIS_TZ)
    when = start_dt.strftime("%d/%m %Hh%M")
    titles = {
        "created": f"Nouvelle réunion · {room_name}",
        "updated": f"Réunion modifiée · {room_name}",
        "cancelled": f"Réunion annulée · {room_name}",
    }
    contents = {
        "created": f"{org_name} vous a invité(e) à \"{res.get('title')}\" — {when}{extra_hint}",
        "updated": f"{org_name} a modifié \"{res.get('title')}\" — {when}",
        "cancelled": f"{org_name} a annulé \"{res.get('title')}\" — {when}",
    }
    for pid in (res.get("participants_ids") or []):
        if pid == res.get("organizer_id"):
            continue
        await _push_notification(
            employee_id=pid,
            type="meeting",
            title=titles[action],
            content=contents[action],
            icon="calendar",
            link="/salles/mes-reservations",
        )


@api.post("/reservations")
async def create_reservation(payload: MeetingReservationIn):
    room = await db.meeting_rooms.find_one({"id": payload.room_id}, {"_id": 0})
    if not room:
        raise HTTPException(404, "Salle introuvable")
    if not room.get("is_active"):
        raise HTTPException(400, "Cette salle est actuellement indisponible.")
    try:
        s = _parse_iso(payload.start_ts)
        e = _parse_iso(payload.end_ts)
    except Exception:
        raise HTTPException(400, "Horaires invalides")
    if e <= s:
        raise HTTPException(400, "L'heure de fin doit être après l'heure de début.")
    if (e - s).total_seconds() < 15 * 60:
        raise HTTPException(400, "Durée minimum : 15 minutes.")
    # Refuse any reservation whose start is in the past.
    now_dt = datetime.fromisoformat(_now().replace("Z", "+00:00"))
    if s < now_dt:
        raise HTTPException(400, "Impossible de réserver un créneau dans le passé.")
    if not payload.title.strip():
        raise HTTPException(400, "Titre requis")
    # Conflict check (single or recurring occurrences below)
    # Build the list of (start, end) pairs to create. Non-recurring = 1 occurrence.
    freq = (payload.recurrence_frequency or "").strip().lower() if payload.recurrence_frequency else None
    count = max(1, int(payload.recurrence_count or 1))
    if freq and freq not in ("weekly", "biweekly", "monthly"):
        raise HTTPException(400, "Fréquence de récurrence invalide (weekly | biweekly | monthly).")
    if count > 52:
        raise HTTPException(400, "Récurrence limitée à 52 occurrences (1 an environ).")
    occurrences: list[tuple[str, str]] = []
    if freq and count > 1:
        step_days = {"weekly": 7, "biweekly": 14}.get(freq)
        cur_s, cur_e = s, e
        for i in range(count):
            occurrences.append((cur_s.isoformat(), cur_e.isoformat()))
            if step_days:
                cur_s = cur_s + timedelta(days=step_days)
                cur_e = cur_e + timedelta(days=step_days)
            else:  # monthly — same day-of-month, keep time
                # Advance ~1 month by adding 28-31 days safely
                cur_s = _add_month(cur_s)
                cur_e = _add_month(cur_e)
    else:
        occurrences.append((payload.start_ts, payload.end_ts))
    # Verify EVERY occurrence is conflict-free — reject the whole batch if any fails
    for os_iso, oe_iso in occurrences:
        conflicts = await _room_conflicts(payload.room_id, os_iso, oe_iso)
        if conflicts:
            c = conflicts[0]
            cs = _parse_iso(c["start_ts"]).astimezone(PARIS_TZ).strftime("%d/%m %Hh%M")
            ce = _parse_iso(c["end_ts"]).astimezone(PARIS_TZ).strftime("%Hh%M")
            ds = _parse_iso(os_iso).astimezone(PARIS_TZ).strftime("%d/%m %Hh%M")
            raise HTTPException(409, f"Conflit sur {ds}: la salle est déjà réservée entre {cs} et {ce}. Aucune occurrence n'a été enregistrée.")
    uid = current_user()
    organizer_id = payload.organizer_id or uid
    series_id = _id() if len(occurrences) > 1 else None
    created: list[dict] = []
    for idx, (os_iso, oe_iso) in enumerate(occurrences):
        res_id = _id()
        doc = {
            "id": res_id,
            "room_id": payload.room_id,
            "organizer_id": organizer_id,
            "title": payload.title.strip(),
            "meeting_type": payload.meeting_type,
            "start_ts": os_iso,
            "end_ts": oe_iso,
            "participants_ids": list({*(payload.participants_ids or []), organizer_id}),
            "external_participants": payload.external_participants or [],
            "participants_count": payload.participants_count or (len(payload.participants_ids or []) + len(payload.external_participants or []) + 1),
            "description": (payload.description or "").strip(),
            "equipments_needed": payload.equipments_needed or [],
            "special_request": (payload.special_request or "").strip(),
            "status": "confirmed",
            "participant_responses": {
                pid: ("confirmed" if pid == organizer_id else "pending")
                for pid in list({*(payload.participants_ids or []), organizer_id})
            },
            "created_at": _now(),
            "created_by": uid,
        }
        if series_id:
            doc["series_id"] = series_id
            doc["recurrence_frequency"] = freq
            doc["series_index"] = idx
            doc["series_total"] = len(occurrences)
        await db.room_reservations.insert_one(doc.copy())
        # Recurrence : n'envoie qu'UNE seule notif de création (sur la 1ʳᵉ occurrence)
        # avec un contenu qui mentionne le nombre total de séances.
        if idx == 0:
            await _notify_participants(
                doc, "created",
                extra_hint=(f" (série de {len(occurrences)} séances)" if series_id else ""),
            )
        created.append(doc)
    if len(created) == 1:
        return created[0]
    return {"series_id": series_id, "count": len(created), "reservations": created}


@api.get("/reservations")
async def list_my_reservations(scope: str = "upcoming"):
    """scope: upcoming | history | all"""
    uid = current_user()
    now_iso = _now()
    base = {"$or": [{"organizer_id": uid}, {"participants_ids": uid}]}
    if scope == "upcoming":
        base["end_ts"] = {"$gte": now_iso}
        base["status"] = {"$ne": "cancelled"}
    elif scope == "history":
        base["$or"] = [
            {"end_ts": {"$lt": now_iso}},
            {"status": "cancelled"},
        ]
        base["$and"] = [{"$or": [{"organizer_id": uid}, {"participants_ids": uid}]}]
        base.pop("$or", None)
    items = await db.room_reservations.find(base, {"_id": 0}).sort("start_ts", 1 if scope == "upcoming" else -1).to_list(200)
    # Attach room name for convenience
    rooms = {r["id"]: r async for r in db.meeting_rooms.find({}, {"_id": 0})}
    for it in items:
        room = rooms.get(it["room_id"], {})
        it["room_name"] = room.get("name")
        it["room_floor"] = room.get("floor")
        it["room_photo"] = room.get("photo_url")
    return items


@api.get("/reservations/{res_id}")
async def get_reservation(res_id: str):
    r = await db.room_reservations.find_one({"id": res_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Réservation introuvable")
    room = await db.meeting_rooms.find_one({"id": r["room_id"]}, {"_id": 0}) or {}
    r["room"] = room
    return r


@api.put("/reservations/{res_id}")
async def update_reservation(res_id: str, payload: MeetingReservationIn):
    r = await db.room_reservations.find_one({"id": res_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Réservation introuvable")
    uid = current_user()
    me = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    if r.get("organizer_id") != uid and not me.get("is_admin"):
        raise HTTPException(403, "Seul l'organisateur peut modifier cette réservation.")
    try:
        s = _parse_iso(payload.start_ts)
        e = _parse_iso(payload.end_ts)
    except Exception:
        raise HTTPException(400, "Horaires invalides")
    if e <= s:
        raise HTTPException(400, "L'heure de fin doit être après l'heure de début.")
    conflicts = await _room_conflicts(payload.room_id, payload.start_ts, payload.end_ts, exclude_id=res_id)
    if conflicts:
        c = conflicts[0]
        cs = _parse_iso(c["start_ts"]).astimezone(PARIS_TZ).strftime("%Hh%M")
        ce = _parse_iso(c["end_ts"]).astimezone(PARIS_TZ).strftime("%Hh%M")
        raise HTTPException(409, f"La salle n'est pas disponible entre {cs} et {ce}.")
    updates = {
        "room_id": payload.room_id,
        "title": payload.title.strip(),
        "meeting_type": payload.meeting_type,
        "start_ts": payload.start_ts,
        "end_ts": payload.end_ts,
        "participants_ids": list({*(payload.participants_ids or []), r["organizer_id"]}),
        "external_participants": payload.external_participants or [],
        "participants_count": payload.participants_count or r.get("participants_count"),
        "description": (payload.description or "").strip(),
        "equipments_needed": payload.equipments_needed or [],
        "special_request": (payload.special_request or "").strip(),
        "updated_at": _now(),
    }
    await db.room_reservations.update_one({"id": res_id}, {"$set": updates})
    updated = await db.room_reservations.find_one({"id": res_id}, {"_id": 0})
    await _notify_participants(updated, "updated")
    return updated


class CancelIn(BaseModel):
    reason: Optional[str] = None


@api.post("/reservations/{res_id}/cancel")
async def cancel_reservation(res_id: str, payload: CancelIn):
    r = await db.room_reservations.find_one({"id": res_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Réservation introuvable")
    uid = current_user()
    me = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
    if r.get("organizer_id") != uid and not me.get("is_admin"):
        raise HTTPException(403, "Seul l'organisateur peut annuler cette réservation.")
    await db.room_reservations.update_one({"id": res_id}, {"$set": {
        "status": "cancelled",
        "cancelled_at": _now(),
        "cancel_reason": payload.reason or "",
    }})
    updated = await db.room_reservations.find_one({"id": res_id}, {"_id": 0})
    await _notify_participants(updated, "cancelled")
    return updated


class RespondIn(BaseModel):
    response: str  # "confirmed" | "declined"


@api.post("/reservations/{res_id}/respond")
async def respond_to_reservation(res_id: str, payload: RespondIn, apply_to_series: bool = True):
    r = await db.room_reservations.find_one({"id": res_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Réservation introuvable")
    uid = current_user()
    if uid not in (r.get("participants_ids") or []):
        raise HTTPException(403, "Vous n'êtes pas invité(e) à cette réunion.")
    resp = (payload.response or "").strip().lower()
    if resp not in ("confirmed", "declined"):
        raise HTTPException(400, "Réponse invalide")

    # Récurrence : appliquer la réponse à TOUTES les occurrences de la série
    # (sauf si le front demande explicitement `apply_to_series=false`).
    series_id = r.get("series_id") if apply_to_series else None
    if series_id:
        siblings = await db.room_reservations.find(
            {"series_id": series_id, "participants_ids": uid}, {"_id": 0}
        ).to_list(200)
    else:
        siblings = [r]

    series_count = len(siblings)
    for sib in siblings:
        responses = dict(sib.get("participant_responses") or {})
        responses[uid] = resp
        await db.room_reservations.update_one(
            {"id": sib["id"]}, {"$set": {"participant_responses": responses}}
        )
        # Agenda sync per occurrence
        agenda_event_id = f"meeting-{sib['id']}-{uid}"
        if resp == "confirmed":
            room = await db.meeting_rooms.find_one({"id": sib["room_id"]}, {"_id": 0}) or {}
            organizer = await db.employees.find_one({"id": sib.get("organizer_id")}, {"_id": 0}) or {}
            start_dt = _parse_iso(sib["start_ts"]).astimezone(PARIS_TZ)
            end_dt = _parse_iso(sib["end_ts"]).astimezone(PARIS_TZ)
            await db.events.update_one(
                {"id": agenda_event_id},
                {"$set": {
                    "id": agenda_event_id,
                    "title": sib.get("title") or "Réunion",
                    "date": start_dt.date().isoformat(),
                    "start_time": start_dt.strftime("%H:%M"),
                    "end_time": end_dt.strftime("%H:%M"),
                    "location": f"{room.get('name', 'Salle')} · {room.get('floor') or ''}".strip(" ·"),
                    "summary": sib.get("description") or f"Réunion invitée par {organizer.get('first_name', '')} {organizer.get('last_name', '')}".strip(),
                    "type": "meeting",
                    "category": "meeting",
                    "icon": "calendar",
                    "group_targets": ["employee-only"],
                    "employee_targets": [uid],
                    "linked_reservation_id": sib["id"],
                    "created_at": _now(),
                }},
                upsert=True,
            )
        else:
            await db.events.delete_one({"id": agenda_event_id})

    # UNE seule notif à l'organisateur (au lieu de N pour toute la série)
    if uid != r.get("organizer_id"):
        me = await db.employees.find_one({"id": uid}, {"_id": 0}) or {}
        who = f"{me.get('first_name', '')} {me.get('last_name', '')}".strip() or "Un(e) collègue"
        action_label = "a confirmé sa présence" if resp == "confirmed" else "a décliné l'invitation"
        series_hint = f" (série de {series_count} séances)" if series_count > 1 else ""
        await _push_notification(
            employee_id=r["organizer_id"],
            type="meeting-response",
            title=f"Réponse · {r.get('title')}",
            content=f"{who} {action_label}{series_hint}.",
            icon="calendar",
            link=f"/salles/mes-reservations",
        )
    # Retour : les responses agrégées du meeting demandé
    final = await db.room_reservations.find_one({"id": res_id}, {"_id": 0})
    return {
        "ok": True,
        "response": resp,
        "participant_responses": (final or {}).get("participant_responses") or {},
        "applied_to_series": bool(series_id),
        "occurrences_updated": series_count,
    }


# ── Admin — rooms CRUD + view all reservations
def _require_admin() -> str:
    return current_user()  # gate below via employee.is_admin


async def _assert_admin():
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0}) or {}
    if not me.get("is_admin"):
        raise HTTPException(403, "Réservé aux administrateurs")


@api.get("/admin/rooms/stats")
async def admin_rooms_stats():
    """Dashboard stats for the admin rooms page."""
    await _assert_admin()
    now_iso = _now()
    now_paris = _now_paris()
    today = now_paris.date().isoformat()
    day_start = datetime.fromisoformat(today + "T00:00:00+00:00").isoformat()
    day_end = datetime.fromisoformat(today + "T23:59:59+00:00").isoformat()

    rooms = await db.meeting_rooms.find({}, {"_id": 0}).to_list(200)
    busy_ids: set[str] = set()
    for r in rooms:
        live = await db.room_reservations.find_one({
            "room_id": r["id"],
            "status": {"$ne": "cancelled"},
            "start_ts": {"$lte": now_iso},
            "end_ts": {"$gt": now_iso},
        })
        if live:
            busy_ids.add(r["id"])

    total = len(rooms)
    maintenance = sum(1 for r in rooms if r.get("status") == "maintenance" or (r.get("is_active") is False))
    busy = len(busy_ids)
    free = max(0, total - busy - maintenance)

    today_reservations = await db.room_reservations.count_documents({
        "start_ts": {"$gte": day_start, "$lt": day_end},
        "status": {"$ne": "cancelled"},
    })
    upcoming = await db.room_reservations.find(
        {"start_ts": {"$gt": now_iso}, "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).sort("start_ts", 1).limit(5).to_list(5)
    cancelled_today = await db.room_reservations.count_documents({
        "status": "cancelled",
        "cancelled_at": {"$gte": day_start, "$lt": day_end},
    })

    # Attach room name to upcoming
    room_by_id = {r["id"]: r for r in rooms}
    for u in upcoming:
        u["room_name"] = room_by_id.get(u["room_id"], {}).get("name")

    return {
        "total_rooms": total,
        "busy_rooms": busy,
        "free_rooms": free,
        "maintenance_rooms": maintenance,
        "today_reservations": today_reservations,
        "cancelled_today": cancelled_today,
        "upcoming": upcoming,
    }


@api.post("/admin/rooms")
async def admin_create_room(payload: MeetingRoomIn):
    await _assert_admin()
    doc = payload.model_dump()
    doc["id"] = f"room-{_id()[:8]}"
    doc["created_at"] = _now()
    await db.meeting_rooms.insert_one(doc.copy())
    return doc


@api.put("/admin/rooms/{rid}")
async def admin_update_room(rid: str, payload: MeetingRoomIn):
    await _assert_admin()
    await db.meeting_rooms.update_one({"id": rid}, {"$set": payload.model_dump()})
    r = await db.meeting_rooms.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Salle introuvable")
    return r


@api.delete("/admin/rooms/{rid}")
async def admin_delete_room(rid: str):
    await _assert_admin()
    await db.meeting_rooms.delete_one({"id": rid})
    return {"ok": True}


@api.get("/admin/reservations")
async def admin_list_reservations(scope: str = "upcoming"):
    await _assert_admin()
    now_iso = _now()
    q: dict = {}
    if scope == "upcoming":
        q = {"end_ts": {"$gte": now_iso}, "status": {"$ne": "cancelled"}}
    elif scope == "history":
        q = {"$or": [{"end_ts": {"$lt": now_iso}}, {"status": "cancelled"}]}
    items = await db.room_reservations.find(q, {"_id": 0}).sort("start_ts", -1 if scope == "history" else 1).to_list(500)
    rooms = {r["id"]: r async for r in db.meeting_rooms.find({}, {"_id": 0})}
    for it in items:
        room = rooms.get(it["room_id"], {})
        it["room_name"] = room.get("name")
    return items





# ═══════════════════════════════════════════════════════════════════
# Register the API router (must be at the very end)
# ═══════════════════════════════════════════════════════════════════
app.include_router(api)
