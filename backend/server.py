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

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, UploadFile, File
from fastapi.staticfiles import StaticFiles
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

# ─── Local file uploads (images from device gallery)
# Mounted under /api/uploads so it goes through the k8s ingress (which routes /api/* to backend)
UPLOAD_DIR = Path("/app/backend/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

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
    """Allow admins OR employees flagged can_manage_communication=True.
    Used for news, carousel slides, events (agenda) and MS Park broadcasts."""
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not emp:
        raise HTTPException(403, "Accès refusé")
    if emp.get("is_admin") or emp.get("can_manage_communication"):
        return emp
    raise HTTPException(403, "Accès communication requis")


@api.post("/uploads")
async def upload_file(file: UploadFile = File(...)):
    """Accept an image (or any file) from the user's device gallery/pellicule and
    return a permanent URL. Used by the news composer, event editor, carousel
    slide editor and profile picture uploader."""
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()[:10]
    # Guard against absurdly large uploads (server-side safety)
    max_bytes = 8 * 1024 * 1024  # 8 MB
    contents = await file.read()
    if len(contents) > max_bytes:
        raise HTTPException(413, "Fichier trop volumineux (max 8 Mo)")
    name = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / name
    path.write_bytes(contents)
    return {
        "url": f"/api/uploads/{name}",
        "name": file.filename,
        "content_type": file.content_type,
        "size": len(contents),
    }



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
    type: str  # text | email | tel | textarea | select | checkbox | radio | date | file | number | url | section
    label: str
    name: Optional[str] = None  # canonical key stored in the response (auto-generated if empty)
    required: bool = False
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    options: Optional[List[str]] = None  # for select/radio/checkbox
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
    content: str


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

    # ─── Channels & messages (mock messagerie)
    channels: list[dict] = [
        {"id": "ch-accueil", "name": "Accueil", "icon": "hash", "members": 24, "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-ops", "name": "Employés OPS", "icon": "hash", "members": 18, "unread": 3, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-roller", "name": "Roller", "icon": "hash", "members": 12, "unread": 2, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-karting", "name": "Karting", "icon": "hash", "members": 18, "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-attractions", "name": "Attractions", "icon": "hash", "members": 14, "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-restauration", "name": "Restauration", "icon": "hash", "members": 22, "unread": 1, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-donut", "name": "Donut House", "icon": "hash", "members": 8, "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-soccer", "name": "Soccer Bar", "icon": "hash", "members": 16, "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-securite", "name": "Sécurité", "icon": "hash", "members": 9, "unread": 0, "is_dm": False, "is_group": False, "archived": False},
        {"id": "ch-nettoyage", "name": "Nettoyage", "icon": "hash", "members": 7, "unread": 0, "is_dm": False, "is_group": False, "archived": False},
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


@api.get("/me")
async def me():
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not emp:
        # Fall back to the seed employee so a stale localStorage ID never breaks the UI
        emp = await db.employees.find_one({"id": CURRENT_EMPLOYEE_ID}, {"_id": 0})
        if not emp:
            raise HTTPException(404, "Current employee not found")
    quota = ROLE_QUOTAS.get(emp.get("role_category", "employe"), 20)
    emp["daily_quota"] = quota
    return emp


@api.get("/employees")
async def list_employees():
    items = await db.employees.find({}, {"_id": 0}).to_list(500)
    return items


# ─── Dashboard summary
@api.get("/dashboard")
async def dashboard():
    today = _now_paris().date().isoformat()
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    today_schedule = await db.schedules.find_one(
        {"employee_id": current_user(), "day": today}, {"_id": 0}
    )
    # Use the same intelligent live badging as `/badging` so the Dashboard
    # card and the Badge page display exactly the same 4 timestamps.
    today_badge = _compute_today_badging(today_schedule, current_user()) if today_schedule else None

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
    upcoming = await db.schedules.find(
        {"employee_id": current_user(), "day": {"$gte": today}},
        {"_id": 0},
    ).sort("day", 1).to_list(7)

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
    if not sched or sched.get("type") != "shift":
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

    # Live entry for today, computed from today's planning
    today_sched = await db.schedules.find_one(
        {"employee_id": current_user(), "day": today_d.isoformat()}, {"_id": 0}
    )
    live = _compute_today_badging(today_sched, current_user()) if today_sched else None
    if live:
        items = [live] + items
    return items


# ─── Meal points
@api.get("/meal-points/today")
async def meal_points_today():
    today = date.today().isoformat()
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    quota = ROLE_QUOTAS.get(emp.get("role_category", "employe"), 20)

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
    used = sum(t.get("points_spent", 0) for t in transactions)
    remaining = max(0, credited_points - used)

    last_tx = await db.meal_tx.find_one(
        {"employee_id": current_user()}, {"_id": 0}, sort=[("ts", -1)]
    )
    return {
        "daily_quota": quota,
        "credited": credited,
        "credited_points": credited_points,
        "used": used,
        "remaining": remaining,
        "transactions": transactions,
        "last_badge": today_badge,
        "last_transaction_ts": last_tx.get("ts") if last_tx else None,
        "role_category": emp.get("role_category"),
        "expires_at": f"{today}T23:59:59",
    }


# ─── Menu
@api.get("/menu")
async def menu(store: Optional[str] = None):
    q = {"store": store} if store else {}
    items = await db.products.find(q, {"_id": 0}).to_list(200)
    return items


# ─── Orders
@api.post("/orders")
async def create_order(payload: OrderCreate):
    today = date.today().isoformat()
    # Enforce same-day orders only — no past/future pickup dates
    if payload.pickup_date != today:
        raise HTTPException(400, "Les commandes ne sont possibles que pour le jour même.")
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

    # Compute meal points balance
    info = await meal_points_today()
    remaining = info["remaining"]
    points_used = min(remaining, total_points)
    points_left_to_pay = max(0, total_points - points_used)
    surcharge_eur = round(points_left_to_pay * (total_eur / total_points) if total_points else 0, 2)

    order_id = _id()
    order = {
        "id": order_id,
        "employee_id": current_user(),
        "items": line_items,
        "total_points": total_points,
        "points_used": points_used,
        "surcharge_eur": surcharge_eur,
        "pickup_point": pickup_point,
        "pickup_date": payload.pickup_date,
        "pickup_time": payload.pickup_time,
        "qr_code": f"MSPARK-ORDER-{order_id[:8].upper()}",
        "status": "preparing",
        "created_at": _now(),
    }
    await db.orders.insert_one(order.copy())
    # Record transaction
    if points_used > 0:
        await db.meal_tx.insert_one({
            "id": _id(),
            "employee_id": current_user(),
            "ts": _now(),
            "points_spent": points_used,
            "surcharge_eur": surcharge_eur,
            "location": payload.pickup_point,
            "items": [{"name": li["name"], "quantity": li["quantity"]} for li in line_items],
            "order_id": order_id,
        })
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
                    await db.orders.update_one({"id": it["id"]}, {"$set": {"status": "ready"}})
                    it["status"] = "ready"
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
@api.get("/posts")
async def list_posts():
    items = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


@api.post("/posts")
async def create_post(payload: PostCreate):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me or not (me.get("is_admin") or me.get("can_manage_communication")):
        raise HTTPException(403, "Seuls les administrateurs et responsables communication peuvent publier sur le fil")
    # Communication editors always post under the official MS Park identity
    posted_as = payload.posted_as or "personal"
    if not me.get("is_admin") and me.get("can_manage_communication"):
        posted_as = "official"
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
        "likes": [],
        "comments": [],
        "created_at": _now(),
    }
    await db.posts.insert_one(p.copy())
    # Broadcast notification to every other employee
    me_name = f"{me.get('first_name', '')} {me.get('last_name', '')}".strip() or "MS Park"
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
    """Public read of a single post — used by `/actualites/:id` detail page."""
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
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


@api.put("/posts/{post_id}")
async def update_post(post_id: str, payload: PostUpdate):
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    if not me:
        raise HTTPException(403, "Accès refusé")
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Publication introuvable")
    # Only the author OR an admin can edit — a comm editor can only edit posts
    # they authored themselves (not other people's).
    is_author = p.get("author_id") == me["id"]
    if not is_author and not me.get("is_admin"):
        raise HTTPException(403, "Vous ne pouvez modifier que vos propres publications")
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
        "replies": [],
    }
    await db.posts.update_one({"id": post_id}, {"$push": {"comments": comment}})
    return comment


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


# ─── Documents
@api.get("/documents")
async def list_documents(category: Optional[str] = None):
    q = {"category": category} if category else {}
    # Filter: docs assigned to me OR global (target_employee_id null/all)
    q["$or"] = [
        {"target_employee_id": current_user()},
        {"target_employee_id": None},
        {"target_employee_id": "all"},
        {"target_employee_id": {"$exists": False}},
    ]
    items = await db.documents.find(q, {"_id": 0}).sort("issued_at", -1).to_list(100)
    return items


# ═══════════════════════════════════════════════════════════════════
# Payslip generator (fake but realistic French "fiche de paie")
# ═══════════════════════════════════════════════════════════════════
_FR_MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
              "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]


def _generate_payslip(emp: dict, year: int, month: int) -> dict:
    """Build a realistic French payslip payload."""
    contract_h = emp.get("contract_hours_weekly") or 35
    monthly_h = round(contract_h * 4.33, 2)
    # Base gross salary — CDI level dependent
    if emp.get("role_category") == "encadrement":
        hourly = 21.50
    elif emp.get("role_category") == "restauration":
        hourly = 13.20
    else:
        hourly = 12.85  # SMIC + prime
    gross = round(monthly_h * hourly, 2)
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
    """Employee can access own payslip; admin can access any."""
    if employee_id != current_user():
        me_doc = await db.employees.find_one({"id": current_user()}, {"_id": 0})
        if not me_doc or not me_doc.get("is_admin"):
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
    await require_admin()
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


@api.post("/admin/documents/payslip")
async def admin_generate_payslip_document(payload: PayslipGenerate):
    """Register a payslip document linked to the generator endpoint."""
    await require_admin()
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
    await require_admin()
    await db.documents.delete_one({"id": did})
    return {"ok": True}


# ─── Admin: broadcast message on the #accueil channel (fil MS Park)
class ChannelBroadcast(BaseModel):
    content: str
    channel_id: Optional[str] = "ch-accueil"


@api.post("/admin/broadcast")
async def admin_broadcast(payload: ChannelBroadcast):
    me = await require_communication_editor()
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


@api.get("/notifications")
async def list_notifications():
    items = await db.notifications.find(
        {"employee_id": current_user()}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return [_normalize_notif(n) for n in items]


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


# ─── Partners (Avantages)
@api.get("/partners")
async def list_partners():
    return await db.partners.find({}, {"_id": 0}).to_list(100)


# ─── Channels & messages
@api.get("/channels")
async def list_channels():
    return await db.channels.find({}, {"_id": 0}).to_list(100)


@api.get("/channels/{cid}/messages")
async def list_messages(cid: str):
    return await db.messages.find(
        {"channel_id": cid}, {"_id": 0}
    ).sort("ts", 1).to_list(200)


@api.post("/channels/{cid}/messages")
async def post_message(cid: str, payload: MessageCreate):
    msg = {
        "id": _id(),
        "channel_id": cid,
        "author_id": current_user(),
        "content": payload.content,
        "ts": _now(),
    }
    await db.messages.insert_one(msg.copy())
    # Notify other employees about the new message on this channel
    ch = await db.channels.find_one({"id": cid}, {"_id": 0})
    author = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    author_name = (
        f"{author.get('first_name', '')} {author.get('last_name', '')}".strip()
        if author else "Un collègue"
    )
    preview = (payload.content or "").strip()
    if len(preview) > 90:
        preview = preview[:87] + "…"
    ch_label = (ch or {}).get("name") or cid
    await _broadcast_notification(
        type="message",
        title=f"Nouveau message · #{ch_label}",
        content=f"{author_name} : {preview or 'Nouveau message'}",
        icon="message-circle",
        link=f"/messagerie?channel={cid}",
        exclude_ids=[current_user()],
    )
    return await _strip(msg)


# ─── Events
@api.get("/events")
async def list_events():
    """Return events visible to the current user based on group_targets."""
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    role_category = emp.get("role_category") if emp else "employe"
    is_admin = bool(emp and emp.get("is_admin"))
    dept = emp.get("department") if emp else None

    items = await db.events.find({}, {"_id": 0}).sort("date", 1).to_list(200)
    visible = []
    for e in items:
        groups = e.get("group_targets") or ["all"]
        emp_ids = e.get("employee_targets") or []
        # Broad group targeting
        if "all" in groups:
            visible.append(e)
            continue
        if is_admin and "admin" in groups:
            visible.append(e)
            continue
        if role_category == "encadrement" and ("managers" in groups or "encadrement" in groups):
            visible.append(e)
            continue
        if role_category == "employe" and "ops" in groups:
            visible.append(e)
            continue
        if role_category == "restauration" and "restauration" in groups:
            visible.append(e)
            continue
        if dept and dept in groups:
            visible.append(e)
            continue
        # Fine-grained targeting
        if current_user() in emp_ids:
            visible.append(e)
            continue
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
    me = await require_communication_editor()
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
    await require_communication_editor()
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
    await require_communication_editor()
    await db.events.delete_one({"id": eid})
    return {"ok": True}


@api.get("/admin/events")
async def admin_list_events():
    await require_communication_editor()
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
    await require_communication_editor()
    forms = await db.forms.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Attach the number of responses per form
    for f in forms:
        f["response_count"] = await db.form_responses.count_documents({"form_id": f["id"]})
    return forms


@api.get("/forms/{fid}")
async def get_form(fid: str):
    """Public — logged employees can fetch a form to fill it in."""
    f = await db.forms.find_one({"id": fid, "active": True}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Formulaire introuvable ou désactivé")
    return f


@api.post("/admin/forms")
async def admin_create_form(payload: FormPayload):
    me = await require_communication_editor()
    doc = {
        "id": _id(),
        "title": payload.title.strip(),
        "description": payload.description,
        "fields": _prepare_fields(payload.fields),
        "active": bool(payload.active),
        "submit_label": payload.submit_label or "Envoyer",
        "success_message": payload.success_message or "Merci ! Votre formulaire a bien été envoyé.",
        "created_by": me["id"],
        "created_by_name": f"{me['first_name']} {me['last_name']}",
        "created_at": _now(),
    }
    await db.forms.insert_one(doc.copy())
    return doc


@api.put("/admin/forms/{fid}")
async def admin_update_form(fid: str, payload: FormPayload):
    await require_communication_editor()
    updates = payload.model_dump()
    updates["fields"] = _prepare_fields(payload.fields)
    await db.forms.update_one({"id": fid}, {"$set": updates})
    item = await db.forms.find_one({"id": fid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Formulaire introuvable")
    return item


@api.delete("/admin/forms/{fid}")
async def admin_delete_form(fid: str):
    await require_communication_editor()
    await db.forms.delete_one({"id": fid})
    await db.form_responses.delete_many({"form_id": fid})
    return {"ok": True}


@api.post("/forms/{fid}/submit")
async def submit_form(fid: str, payload: FormSubmitPayload):
    f = await db.forms.find_one({"id": fid, "active": True}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Formulaire introuvable ou désactivé")
    me = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    employee_name = f"{me['first_name']} {me['last_name']}" if me else "Anonyme"
    resp = {
        "id": _id(),
        "form_id": fid,
        "employee_id": current_user(),
        "employee_name": employee_name,
        "answers": payload.answers,
        "submitted_at": _now(),
    }
    await db.form_responses.insert_one(resp.copy())
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
    await require_communication_editor()
    return await db.form_responses.find({"form_id": fid}, {"_id": 0}).sort("submitted_at", -1).to_list(1000)




# ─── News
@api.get("/news")
async def list_news():
    return await db.news.find({}, {"_id": 0}).sort("date", -1).to_list(20)


@api.get("/news/{nid}")
async def get_news(nid: str):
    item = await db.news.find_one({"id": nid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Actualité introuvable")
    return item


@api.get("/events/{eid}")
async def get_event(eid: str):
    item = await db.events.find_one({"id": eid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Événement introuvable")
    return item


# ─── Profile update
class ProfileUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    address: Optional[str] = None


@api.put("/me")
async def update_me(payload: ProfileUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.employees.update_one({"id": current_user()}, {"$set": updates})
    emp = await db.employees.find_one({"id": current_user()}, {"_id": 0})
    emp["daily_quota"] = ROLE_QUOTAS.get(emp.get("role_category", "employe"), 20)
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
    return [
        {"id": "managers", "name": "Pôle Managers", "email": "managers@mspark.fr",
         "phone": "+33 1 23 45 67 80", "description": "Encadrement opérationnel du parc",
         "icon": "users-round", "color": "#3BA4FF"},
        {"id": "rh", "name": "Pôle RH", "email": "rh@mspark.fr",
         "phone": "+33 1 23 45 67 81", "description": "Ressources humaines, paie, contrats, congés",
         "icon": "user-cog", "color": "#10B981"},
        {"id": "direction", "name": "Pôle Direction", "email": "direction@mspark.fr",
         "phone": "+33 1 23 45 67 82", "description": "Direction générale et stratégie",
         "icon": "briefcase", "color": "#A78BFA"},
        {"id": "restauration", "name": "Pôle Restauration", "email": "restauration@mspark.fr",
         "phone": "+33 1 23 45 67 83", "description": "Soccer Bar, Donut House, stands",
         "icon": "utensils", "color": "#F59E0B"},
        {"id": "securite", "name": "Pôle Sécurité", "email": "securite@mspark.fr",
         "phone": "+33 1 23 45 67 84", "description": "Sûreté du parc 24/7",
         "icon": "shield", "color": "#EF4444"},
        {"id": "maintenance", "name": "Pôle Maintenance", "email": "maintenance@mspark.fr",
         "phone": "+33 1 23 45 67 85", "description": "Karting, attractions, infrastructure",
         "icon": "wrench", "color": "#64748B"},
    ]


# ─── DM channels (create or fetch a direct channel with an employee)
class DMCreate(BaseModel):
    employee_id: str


@api.post("/channels/dm")
async def create_dm(payload: DMCreate):
    other = await db.employees.find_one({"id": payload.employee_id}, {"_id": 0})
    if not other:
        raise HTTPException(404, "Employee not found")
    cid = f"dm-{payload.employee_id}"
    existing = await db.channels.find_one({"id": cid}, {"_id": 0})
    if not existing:
        ch = {
            "id": cid,
            "name": f"{other['first_name']} {other['last_name']}",
            "icon": "user",
            "members": 2,
            "unread": 0,
            "is_dm": True,
            "is_group": False,
            "archived": False,
            "avatar": other["avatar"],
        }
        await db.channels.insert_one(ch.copy())
        existing = ch
    return await _strip(existing)


class GroupCreate(BaseModel):
    name: str
    member_ids: List[str]


@api.post("/channels/group")
async def create_group(payload: GroupCreate):
    if not payload.name.strip() or len(payload.member_ids) < 1:
        raise HTTPException(400, "Nom et membres requis")
    cid = f"grp-{_id()[:8]}"
    ch = {
        "id": cid,
        "name": payload.name.strip(),
        "icon": "users",
        "members": len(payload.member_ids) + 1,
        "unread": 0,
        "is_dm": False,
        "is_group": True,
        "archived": False,
        "member_ids": payload.member_ids + [current_user()],
    }
    await db.channels.insert_one(ch.copy())
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
}


@api.post("/auth/login")
async def auth_login(payload: LoginRequest):
    creds = _LOGIN_CREDENTIALS.get(payload.email.lower().strip())
    if creds:
        expected_pwd, eid = creds
        if payload.password != expected_pwd:
            raise HTTPException(401, "Mot de passe incorrect")
        emp = await db.employees.find_one({"id": eid}, {"_id": 0})
        if emp:
            return {
                "employee_id": eid,
                "is_admin": emp.get("is_admin", False),
                "can_manage_communication": emp.get("can_manage_communication", False),
                "first_name": emp["first_name"],
                "last_name": emp["last_name"],
            }
    raise HTTPException(401, "Identifiants inconnus. Essayez idriss.malonga@gmail.com, marcus.simeo@mspark.fr ou lea.dubois@mspark.fr.")


# ═══════════════════════════════════════════════════════════════════
# Admin endpoints (require is_admin)
# ═══════════════════════════════════════════════════════════════════

class AdminScheduleEntry(BaseModel):
    employee_id: str
    day: str  # YYYY-MM-DD
    type: str  # shift | off | leave | training
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
    """Compute net worked minutes for a 'shift' entry (excludes pause)."""
    if entry.get("type") != "shift" or not entry.get("start") or not entry.get("end"):
        return 0
    try:
        s = datetime.strptime(entry["start"], "%H:%M")
        e = datetime.strptime(entry["end"], "%H:%M")
        m = int((e - s).total_seconds() // 60)
        if entry.get("pause_start") and entry.get("pause_end"):
            ps = datetime.strptime(entry["pause_start"], "%H:%M")
            pe = datetime.strptime(entry["pause_end"], "%H:%M")
            m -= int((pe - ps).total_seconds() // 60)
        return max(0, m)
    except Exception:
        return 0


def _covered_minutes(entry: dict) -> int:
    """Minutes that count toward contract fulfilment.
    Uses explicit `covered_minutes` field if set (for leave/rtt that no longer store start/end),
    otherwise computes from start/end minus pause."""
    if entry.get("covered_minutes") is not None:
        try:
            return max(0, int(entry["covered_minutes"]))
        except Exception:
            pass
    if entry.get("type") not in ("shift", "leave", "rtt", "training"):
        return 0
    if not entry.get("start") or not entry.get("end"):
        return 0
    try:
        s = datetime.strptime(entry["start"], "%H:%M")
        e = datetime.strptime(entry["end"], "%H:%M")
        m = int((e - s).total_seconds() // 60)
        if entry.get("pause_start") and entry.get("pause_end"):
            ps = datetime.strptime(entry["pause_start"], "%H:%M")
            pe = datetime.strptime(entry["pause_end"], "%H:%M")
            m -= int((pe - ps).total_seconds() // 60)
        return max(0, m)
    except Exception:
        return 0


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
        "location": p.get("location") or "MS Park",
        "manager": emp.get("manager"),
        "service": emp.get("department"),
        "note": None,
    }


# ─── Constants
SHIFT_HORIZON_CAP = date(2026, 8, 1)
"""Auto-generation of shifts stops at this date. Beyond this cap, the admin
must build the planning manually — but validated leaves, RTT and exceptional
events are still allowed and preserved."""


def _shift_horizon_cap() -> date:
    return SHIFT_HORIZON_CAP


async def _ensure_range(employee_id: str, start: date, end: date) -> None:
    """Materialize any missing schedule days between [start, end] from the employee's pattern.
    Only auto-generates up to SHIFT_HORIZON_CAP. Idempotent."""
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
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


@api.get("/admin/employees")
async def admin_list_employees():
    await require_admin()
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
    await require_admin()
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
    await require_admin()
    # Validate day format
    try:
        date.fromisoformat(payload.day)
    except Exception:
        raise HTTPException(400, "Date invalide (YYYY-MM-DD attendu)")
    if payload.type == "shift":
        if not payload.start or not payload.end:
            raise HTTPException(400, "Horaires début/fin requis pour un shift")
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
    await require_admin()
    sch = await db.schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not sch:
        raise HTTPException(404, "Entrée introuvable")
    await db.schedules.delete_one({"id": schedule_id})
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
    await require_admin()
    try:
        base = date.fromisoformat(payload.week_start)
    except Exception:
        raise HTTPException(400, "week_start invalide (YYYY-MM-DD attendu)")

    total_saved = 0
    weeks_processed = 0
    for w in range(0, max(1, payload.duplicate_weeks + 1)):
        week_offset = timedelta(days=7 * w)
        for e in payload.entries:
            day_iso = (base + week_offset + timedelta(days=e.day_offset)).isoformat()
            if e.type == "shift" and (not e.start or not e.end):
                # Skip incomplete shift rows (admin left them blank)
                continue
            record = {
                "employee_id": payload.employee_id,
                "day": day_iso,
                "type": e.type,
                "start": e.start if e.type == "shift" else None,
                "end": e.end if e.type == "shift" else None,
                "pause_start": e.pause_start if e.type == "shift" else None,
                "pause_end": e.pause_end if e.type == "shift" else None,
                "break_minutes": e.break_minutes if e.type == "shift" else 0,
                "location": e.location,
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
    await require_admin()
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
    contract_minutes = contract_hours * 60
    delta_minutes = planned_minutes - contract_minutes
    if delta_minutes == 0:
        status = "match"
        message = "Contrat respecté"
    elif delta_minutes < 0:
        status = "under"
        h = abs(delta_minutes) // 60
        m = abs(delta_minutes) % 60
        if m == 0:
            message = f"{h} heure{'s' if h > 1 else ''} manquante{'s' if h > 1 else ''} pour atteindre le minimum contractuel"
        else:
            message = f"{h}h{m:02d} manquantes pour atteindre le minimum contractuel"
    else:
        status = "over"
        h = delta_minutes // 60
        m = delta_minutes % 60
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
    await require_admin()
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
    await require_admin()
    req = await db.requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
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
                    bal["cp_n"] = round(max(0, float(bal.get("cp_n", 0)) - remaining), 1)
            elif is_rtt:
                bal["rtt"] = round(max(0, float(bal.get("rtt", 0)) - days_consumed), 1)
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
    await require_admin()
    req = await db.requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
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
    await require_admin()
    req = await db.requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
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


@api.post("/admin/news")
async def admin_publish_news(payload: NewsCreate):
    me = await require_communication_editor()
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
        "pinned": bool(payload.pinned),
        "date": _now(),
        "author_id": me["id"],
        "author_name": author_name,
        "posted_as": "official",
        "likes": [],
        "comments": [],
    }
    await db.news.insert_one(item.copy())
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
    await require_communication_editor()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.news.update_one({"id": nid}, {"$set": updates})
    item = await db.news.find_one({"id": nid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Actualité introuvable")
    return item


@api.delete("/admin/news/{nid}")
async def admin_delete_news(nid: str):
    await require_communication_editor()
    await db.news.delete_one({"id": nid})
    return {"ok": True}


class ReorderPayload(BaseModel):
    ids: list[str]


@api.post("/admin/news/reorder")
async def admin_reorder_news(payload: ReorderPayload):
    """Persist a full ordered list of news IDs — assigns order 10, 20, 30 …"""
    await require_communication_editor()
    for i, nid in enumerate(payload.ids):
        await db.news.update_one({"id": nid}, {"$set": {"order": (i + 1) * 10}})
    return {"ok": True, "count": len(payload.ids)}


@api.get("/carousel")
async def get_carousel():
    """Public: news marked featured & active, sorted by order (asc)."""
    items = await db.news.find(
        {"featured": True, "active": {"$ne": False}}, {"_id": 0},
    ).sort([("order", 1), ("date", -1)]).to_list(20)
    return items


# ─── Admin RTT/CP allocation
class LeaveGrant(BaseModel):
    employee_ids: List[str]
    days: float
    type: str  # "rtt" | "cp"


@api.post("/admin/leave/grant")
async def admin_grant_leave(payload: LeaveGrant):
    await require_admin()
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
    await require_admin()
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


app.include_router(api)

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
    ]
    for it in extras:
        existing = await db.products.find_one({"store": it["store"], "name": it["name"]})
        if not existing:
            await db.products.insert_one({"id": _id(), **it})


@app.on_event("shutdown")
async def on_stop():
    client.close()
