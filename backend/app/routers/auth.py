from fastapi import APIRouter, Depends, HTTPException

from ..auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..database import get_pool
from ..models import TokenResponse, UserLogin, UserRegister, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister):
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT id FROM users WHERE email = $1", data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    password_hash = hash_password(data.password)
    row = await pool.fetchrow(
        "INSERT INTO users (email, password_hash, full_name) "
        "VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at",
        data.email,
        password_hash,
        data.full_name,
    )

    token = create_access_token({"sub": str(row["id"]), "email": row["email"]})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=row["id"],
            email=row["email"],
            full_name=row["full_name"],
            created_at=row["created_at"],
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, password_hash, full_name, created_at "
        "FROM users WHERE email = $1",
        data.email,
    )
    if not row or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(row["id"]), "email": row["email"]})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=row["id"],
            email=row["email"],
            full_name=row["full_name"],
            created_at=row["created_at"],
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, full_name, created_at FROM users WHERE id = $1",
        int(current_user["sub"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**dict(row))
