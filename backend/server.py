"""MS Park Intranet — FastAPI backend with mocked HR data.

No authentication: the connected employee is always "Idriss MALONGA".
All data is seeded at startup (idempotently) so the front-end has rich content.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger("mspark")

# ───────────────────────────────── Constants ─────────────────────────────────

ROLE_QUOTAS = {
    "employe": 20,
    "restauration": 30,
    "encadrement": 35,
}

CURRENT_EMPLOYEE_ID = "emp-idriss-malonga"

# ───────────────────────────────── Models ────────────────────────────────────

def _id() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    content: str
    category: Optional[str] = "annonce"
    image: Optional[str] = None
    hashtags: List[str] = []


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
            "manager": "Sophie BERNARD",
            "location": "MS Park — Site principal",
            "badge_number": "MSP-2451",
            "badge_expiry": "2027-08-15",
            "badge_active": True,
            "leave_balance": {"cp_n_1": 4, "cp_n": 12.5, "rtt": 3},
            "can_post": False,
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

    # ─── Schedule (Idriss works Wed-Sun, varied 12h-20h, 24h/week, 45min breaks)
    # Build planning for 8 weeks centered on today
    schedule: list[dict] = []
    today = date.today()
    start_period = today - timedelta(days=28)
    end_period = today + timedelta(days=42)
    cur = start_period
    # Rotation pattern (weekday → (start,end))
    pattern = {
        2: ("14:00", "19:00"),  # Wed
        3: ("12:00", "17:00"),  # Thu
        4: ("15:00", "20:00"),  # Fri
        5: ("12:00", "17:00"),  # Sat
        6: ("14:00", "18:00"),  # Sun
    }
    while cur <= end_period:
        wd = cur.weekday()  # 0=Mon
        d = cur.isoformat()
        if wd in pattern:
            s, e = pattern[wd]
            # Compute pause window: middle of the shift, 45min long
            sh, sm = map(int, s.split(":"))
            eh, em = map(int, e.split(":"))
            start_m = sh * 60 + sm
            end_m = eh * 60 + em
            mid = (start_m + end_m) // 2
            pause_start_m = mid - 22  # ~22min before mid
            pause_end_m = pause_start_m + 45
            ps = f"{pause_start_m // 60:02d}:{pause_start_m % 60:02d}"
            pe = f"{pause_end_m // 60:02d}:{pause_end_m % 60:02d}"
            schedule.append({
                "id": _id(),
                "employee_id": CURRENT_EMPLOYEE_ID,
                "day": d,
                "start": s,
                "end": e,
                "pause_start": ps,
                "pause_end": pe,
                "break_minutes": 45,
                "type": "shift",
                "location": "MS Park — Zone Karting & Attractions",
                "manager": "Sophie BERNARD",
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
    await db.schedules.insert_many(schedule)

    # ─── Badging history for past shifts (with pause records)
    badging: list[dict] = []
    for s in schedule:
        sd = date.fromisoformat(s["day"])
        if sd >= today or s["type"] != "shift":
            continue
        start_t = datetime.strptime(s["start"], "%H:%M")
        end_t = datetime.strptime(s["end"], "%H:%M")
        # Simulate occasional anomalies
        anomaly = None
        if (sd.toordinal() % 11) == 0:
            start_t = start_t + timedelta(minutes=8)
            anomaly = "late"
        if (sd.toordinal() % 17) == 0:
            anomaly = "missed_clock"
        clock_in = start_t.strftime("%H:%M") if anomaly != "missed_clock" else None
        clock_out = end_t.strftime("%H:%M") if anomaly != "missed_clock" else None
        worked = 0
        if clock_in and clock_out:
            worked = int((end_t - start_t).total_seconds() // 60) - s["break_minutes"]
        badging.append({
            "id": _id(),
            "employee_id": CURRENT_EMPLOYEE_ID,
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
    # Add a clock-in for today if applicable
    today_sched = next((s for s in schedule if s["day"] == today.isoformat()), None)
    if today_sched and today_sched["type"] == "shift":
        now_t = datetime.now()
        st = datetime.strptime(today_sched["start"], "%H:%M").replace(year=now_t.year, month=now_t.month, day=now_t.day)
        clock_in = st.strftime("%H:%M") if now_t > st else None
        worked = max(0, int((now_t - st).total_seconds() // 60) - 0) if clock_in else 0
        badging.append({
            "id": _id(),
            "employee_id": CURRENT_EMPLOYEE_ID,
            "day": today.isoformat(),
            "clock_in": clock_in,
            "clock_out": None,
            "pause_out": None,
            "pause_in": None,
            "break_minutes": 0,
            "worked_minutes": worked,
            "anomaly": None,
            "note": "En cours",
        })
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
            "category": "Direction",
            "content": "Très fière de l'équipe pour le mois écoulé ! Notre taux de satisfaction client atteint 96%, un record absolu. Bravo à toutes et tous.",
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
            "category": "Restauration",
            "content": "🎉 Lancement officiel du nouveau Bao Dog au Soccer Bar dès lundi prochain ! Venez tester en avant-première mercredi.",
            "image": "https://images.unsplash.com/photo-1626202373052-9b8aa5edfaef?w=1200&h=600&fit=crop",
            "hashtags": ["#NouveauMenu", "#SoccerBar"],
            "likes": ["emp-emma", "emp-leila", "emp-thomas"],
            "comments": [],
            "created_at": _now(),
        },
        {
            "id": _id(),
            "author_id": "emp-sophie",
            "category": "Événement",
            "content": "Roller Party VIP samedi 21h-01h. Tenue blanche obligatoire ! Inscrivez-vous via l'agenda interne avant vendredi.",
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
            "category": "RH",
            "content": "Rappel : les points repas sont valables UNIQUEMENT le jour même. Pensez à les utiliser avant minuit !",
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
        {"id": _id(), "name": "Fiche de paie — Janvier 2026", "category": "Paie",
         "issued_at": "2026-02-01", "size_kb": 248, "read": False,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Contrat CDI — Idriss MALONGA", "category": "Contrats",
         "issued_at": "2024-08-15", "size_kb": 412, "read": True,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Avenant 24h hebdomadaires", "category": "Contrats",
         "issued_at": "2025-09-01", "size_kb": 188, "read": True,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Règlement intérieur 2026", "category": "Règlements",
         "issued_at": "2026-01-02", "size_kb": 524, "read": False,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Procédure sécurité incendie", "category": "Sécurité",
         "issued_at": "2025-11-12", "size_kb": 156, "read": True,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Planning PDF — Février 2026", "category": "Planning",
         "issued_at": today.isoformat(), "size_kb": 92, "read": False,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
        {"id": _id(), "name": "Attestation employeur", "category": "Attestations",
         "issued_at": "2025-12-10", "size_kb": 124, "read": True,
         "url": "https://www.africau.edu/images/default/sample.pdf"},
    ]
    await db.documents.insert_many(documents)

    # ─── Notifications
    notifications: list[dict] = [
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "conge_valide",
         "title": "Congé validé", "content": "Votre demande de congé du 21 au 23 a été approuvée.",
         "read": False, "created_at": _now(), "icon": "check-circle"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "planning",
         "title": "Nouveau planning publié",
         "content": "Le planning de la semaine prochaine est disponible.",
         "read": False, "created_at": _now(), "icon": "calendar"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "post",
         "title": "Nouvelle annonce direction",
         "content": "Pierre Moreau a publié une annonce.",
         "read": False, "created_at": _now(), "icon": "megaphone"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "document",
         "title": "Nouveau document disponible",
         "content": "Fiche de paie de Janvier 2026 prête à être téléchargée.",
         "read": True, "created_at": _now(), "icon": "file-text"},
        {"id": _id(), "employee_id": CURRENT_EMPLOYEE_ID, "type": "comment",
         "title": "Réponse à votre commentaire",
         "content": "Sophie a répondu à votre commentaire.",
         "read": True, "created_at": _now(), "icon": "message-circle"},
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
        {"id": "ch-accueil", "name": "Accueil", "icon": "hash", "members": 24, "unread": 0, "is_dm": False, "is_group": False},
        {"id": "ch-ops", "name": "Employés OPS", "icon": "hash", "members": 18, "unread": 3, "is_dm": False, "is_group": False},
        {"id": "ch-roller", "name": "Roller", "icon": "hash", "members": 12, "unread": 2, "is_dm": False, "is_group": False},
        {"id": "ch-karting", "name": "Karting", "icon": "hash", "members": 18, "unread": 0, "is_dm": False, "is_group": False},
        {"id": "ch-attractions", "name": "Attractions", "icon": "hash", "members": 14, "unread": 0, "is_dm": False, "is_group": False},
        {"id": "ch-restauration", "name": "Restauration", "icon": "hash", "members": 22, "unread": 1, "is_dm": False, "is_group": False},
        {"id": "ch-donut", "name": "Donut House", "icon": "hash", "members": 8, "unread": 0, "is_dm": False, "is_group": False},
        {"id": "ch-soccer", "name": "Soccer Bar", "icon": "hash", "members": 16, "unread": 0, "is_dm": False, "is_group": False},
        {"id": "ch-securite", "name": "Sécurité", "icon": "hash", "members": 9, "unread": 0, "is_dm": False, "is_group": False},
        {"id": "ch-nettoyage", "name": "Nettoyage", "icon": "hash", "members": 7, "unread": 0, "is_dm": False, "is_group": False},
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
    today = date.today().isoformat()
    emp = await db.employees.find_one({"id": CURRENT_EMPLOYEE_ID}, {"_id": 0})
    today_schedule = await db.schedules.find_one(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": today}, {"_id": 0}
    )
    today_badge = await db.badging.find_one(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": today}, {"_id": 0}
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
    upcoming = await db.schedules.find(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": {"$gte": today}},
        {"_id": 0},
    ).sort("day", 1).to_list(7)

    # Week hours
    today_d = date.today()
    monday = today_d - timedelta(days=today_d.weekday())
    sunday = monday + timedelta(days=6)
    week_badges = await db.badging.find(
        {"employee_id": CURRENT_EMPLOYEE_ID,
         "day": {"$gte": monday.isoformat(), "$lte": sunday.isoformat()}},
        {"_id": 0},
    ).to_list(100)
    week_minutes = sum(b.get("worked_minutes", 0) for b in week_badges)

    # Presence rate over last 28 days
    last28 = (today_d - timedelta(days=28)).isoformat()
    past = await db.badging.find(
        {"employee_id": CURRENT_EMPLOYEE_ID,
         "day": {"$gte": last28, "$lt": today}},
        {"_id": 0},
    ).to_list(100)
    total_shifts = len(past)
    on_time = sum(1 for b in past if not b.get("anomaly"))
    presence_rate = int((on_time / total_shifts) * 100) if total_shifts else 100

    # Notifications & messages
    unread_notifs = await db.notifications.count_documents(
        {"employee_id": CURRENT_EMPLOYEE_ID, "read": False}
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
        "week_hours_target": 24 * 60,
        "presence_rate": presence_rate,
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
    pad_start = (first - timedelta(days=7)).isoformat()
    pad_end = (last + timedelta(days=7)).isoformat()
    items = await db.schedules.find(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": {"$gte": pad_start, "$lte": pad_end}},
        {"_id": 0},
    ).sort("day", 1).to_list(200)
    return items


@api.get("/schedule/day")
async def get_schedule_day(day: str):
    """Return schedule entry for a specific day (YYYY-MM-DD)."""
    item = await db.schedules.find_one(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": day}, {"_id": 0}
    )
    return {"day": day, "entry": item, "is_working_day": bool(item and item.get("type") == "shift")}


# ─── Badging
@api.get("/badging")
async def get_badging(filter_range: str = "month"):
    today_d = date.today()
    if filter_range == "day":
        start = today_d
    elif filter_range == "week":
        start = today_d - timedelta(days=today_d.weekday())
    else:
        start = today_d.replace(day=1)
    items = await db.badging.find(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": {"$gte": start.isoformat()}},
        {"_id": 0},
    ).sort("day", -1).to_list(100)
    return items


# ─── Meal points
@api.get("/meal-points/today")
async def meal_points_today():
    today = date.today().isoformat()
    emp = await db.employees.find_one({"id": CURRENT_EMPLOYEE_ID}, {"_id": 0})
    quota = ROLE_QUOTAS.get(emp.get("role_category", "employe"), 20)

    # Points are credited automatically every day (no badge required for MVP demo)
    today_sched = await db.schedules.find_one(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": today}, {"_id": 0}
    )
    today_badge = await db.badging.find_one(
        {"employee_id": CURRENT_EMPLOYEE_ID, "day": today}, {"_id": 0}
    )
    credited = True
    credited_points = quota

    transactions = await db.meal_tx.find(
        {"employee_id": CURRENT_EMPLOYEE_ID, "ts": {"$gte": today + "T00:00:00"}},
        {"_id": 0},
    ).sort("ts", -1).to_list(50)
    used = sum(t.get("points_spent", 0) for t in transactions)
    remaining = max(0, credited_points - used)

    last_tx = await db.meal_tx.find_one(
        {"employee_id": CURRENT_EMPLOYEE_ID}, {"_id": 0}, sort=[("ts", -1)]
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
        "employee_id": CURRENT_EMPLOYEE_ID,
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
            "employee_id": CURRENT_EMPLOYEE_ID,
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
        {"employee_id": CURRENT_EMPLOYEE_ID}, {"_id": 0}
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
    p = {
        "id": _id(),
        "author_id": CURRENT_EMPLOYEE_ID,
        "category": payload.category or "annonce",
        "content": payload.content,
        "image": payload.image,
        "hashtags": payload.hashtags or [],
        "likes": [],
        "comments": [],
        "created_at": _now(),
    }
    await db.posts.insert_one(p.copy())
    return await _strip(p)


@api.post("/posts/{post_id}/like")
async def toggle_like(post_id: str):
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(404, "Post not found")
    likes = set(p.get("likes", []))
    if CURRENT_EMPLOYEE_ID in likes:
        likes.discard(CURRENT_EMPLOYEE_ID)
    else:
        likes.add(CURRENT_EMPLOYEE_ID)
    await db.posts.update_one({"id": post_id}, {"$set": {"likes": list(likes)}})
    return {"likes": list(likes)}


@api.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, payload: CommentCreate):
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(404, "Post not found")
    comment = {
        "id": _id(),
        "author_id": CURRENT_EMPLOYEE_ID,
        "content": payload.content,
        "created_at": _now(),
        "replies": [],
    }
    await db.posts.update_one({"id": post_id}, {"$push": {"comments": comment}})
    return comment


# ─── Requests
@api.get("/requests")
async def list_requests(status: Optional[str] = None):
    q = {"employee_id": CURRENT_EMPLOYEE_ID}
    if status:
        q["status"] = status
    items = await db.requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@api.post("/requests")
async def create_request(payload: RequestCreate):
    r = {
        "id": _id(),
        "employee_id": CURRENT_EMPLOYEE_ID,
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
    items = await db.documents.find(q, {"_id": 0}).sort("issued_at", -1).to_list(100)
    return items


# ─── Notifications
@api.get("/notifications")
async def list_notifications():
    items = await db.notifications.find(
        {"employee_id": CURRENT_EMPLOYEE_ID}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return items


@api.post("/notifications/{nid}/read")
async def read_notif(nid: str):
    await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/read-all")
async def read_all_notifs():
    await db.notifications.update_many(
        {"employee_id": CURRENT_EMPLOYEE_ID}, {"$set": {"read": True}}
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
        "author_id": CURRENT_EMPLOYEE_ID,
        "content": payload.content,
        "ts": _now(),
    }
    await db.messages.insert_one(msg.copy())
    return await _strip(msg)


# ─── Events
@api.get("/events")
async def list_events():
    return await db.events.find({}, {"_id": 0}).sort("date", 1).to_list(100)


# ─── News
@api.get("/news")
async def list_news():
    return await db.news.find({}, {"_id": 0}).sort("date", -1).to_list(20)


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
        await db.employees.update_one({"id": CURRENT_EMPLOYEE_ID}, {"$set": updates})
    emp = await db.employees.find_one({"id": CURRENT_EMPLOYEE_ID}, {"_id": 0})
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
        {"id": CURRENT_EMPLOYEE_ID}, {"$set": {"badge_active": False}}
    )
    rid = _id()
    await db.requests.insert_one({
        "id": rid,
        "employee_id": CURRENT_EMPLOYEE_ID,
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
            {"employee_id": CURRENT_EMPLOYEE_ID,
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
            "avatar": other["avatar"],
        }
        await db.channels.insert_one(ch.copy())
        existing = ch
    return existing


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
        "member_ids": payload.member_ids + [CURRENT_EMPLOYEE_ID],
    }
    await db.channels.insert_one(ch.copy())
    return ch


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_start():
    await _seed_once()


@app.on_event("shutdown")
async def on_stop():
    client.close()
