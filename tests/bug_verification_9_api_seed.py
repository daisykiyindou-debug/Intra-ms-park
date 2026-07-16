
"""Focused bug verification for iteration 9: sidebar Formulaires, Actualites lightbox, carousel reorder API/UI."""
import json
import requests

BASE = "https://mspark-employee-hub.preview.emergentagent.com"
API = BASE + "/api"
ADMIN = {"X-Employee-Id": "emp-marcus-simeo"}
COMM = {"X-Employee-Id": "emp-lea-comm"}
EMP = {"X-Employee-Id": "emp-idriss-malonga"}


def seed_multi_image_post():
    payload = {
        "title": "QA Lightbox multi image iteration 9",
        "content": "<p>Post de test pour vérifier la lightbox et les boutons précédent/suivant.</p>",
        "category": "Événement",
        "images": [
            "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200",
            "https://images.unsplash.com/photo-1522860747422-1b3b0e7527ff?w=1200",
            "https://images.unsplash.com/photo-1543083477-4f785aeafaa9?w=1200",
        ],
        "posted_as": "official",
    }
    r = requests.post(API + "/posts", headers=ADMIN, json=payload, timeout=20)
    r.raise_for_status()
    return r.json()


def test_reorder_api():
    before = requests.get(API + "/news", timeout=20).json()
    assert len(before) >= 3, "Need at least 3 news items to test reorder"
    original_ids = [n["id"] for n in before]
    reordered_ids = list(reversed(original_ids[:3])) + original_ids[3:]
    r = requests.post(API + "/admin/news/reorder", headers=ADMIN, json={"ids": reordered_ids}, timeout=20)
    assert r.status_code == 200, r.text
    after = requests.get(API + "/news", timeout=20).json()
    order_by_id = {n["id"]: n.get("order") for n in after}
    assert [order_by_id[i] for i in reordered_ids[:3]] == [10, 20, 30], order_by_id
    # Restore original sequence for minimal test pollution.
    restore = requests.post(API + "/admin/news/reorder", headers=ADMIN, json={"ids": original_ids}, timeout=20)
    assert restore.status_code == 200, restore.text
    return {"before_first3": original_ids[:3], "tested_order_first3": reordered_ids[:3]}


if __name__ == "__main__":
    result = {"seed_post": seed_multi_image_post(), "reorder": test_reorder_api()}
    print(json.dumps(result, indent=2, ensure_ascii=False))
