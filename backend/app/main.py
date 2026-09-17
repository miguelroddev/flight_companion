from fastapi import FastAPI
from sqlalchemy import text

from app.api import router as api_router
from app.database import engine

app = FastAPI(title="Flight Companion API")
app.include_router(api_router)


@app.get("/health")
def health() -> dict[str, str]:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"db": "ok"}
