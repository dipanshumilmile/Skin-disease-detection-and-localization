from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import Base, engine

from app.api.analyze import router as analyze_router
from app.api.history import router as history_router
from app.api.compare import router as compare_router


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="DermaScope API",
    version="1.0.0",
)
app.mount(
    "/storage",
    StaticFiles(directory="storage"),
    name="storage",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(
    analyze_router,
    prefix="/api",
)

app.include_router(
    history_router,
    prefix="/api",
)

app.include_router(
    compare_router,
    prefix="/api",
)


@app.get("/")
def root():
    return {
        "message": "DermaScope API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }