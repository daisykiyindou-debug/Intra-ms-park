#!/usr/bin/env python3
"""Cleanup QA requests created by the focused modal regression test."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    load_dotenv(Path("/app/backend/.env"))
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    result = await db.requests.delete_many({
        "$or": [
            {"comment": {"$regex": "^QA modal submit e2e"}},
            {"comment": {"$regex": "^QA UI submit modal"}},
        ]
    })
    print({"deleted_count": result.deleted_count})
    client.close()


if __name__ == "__main__":
    asyncio.run(main())