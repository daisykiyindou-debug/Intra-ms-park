import asyncio
import json
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    res = await db.requests.delete_many({"employee_id": "emp-idriss-malonga", "comment": {"$regex": "^QA14 "}})
    out = {"deleted_requests_with_QA14_comment": res.deleted_count}
    with open("/app/test_reports/bug_verification_14_cleanup_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(json.dumps(out, ensure_ascii=False, indent=2))


asyncio.run(main())