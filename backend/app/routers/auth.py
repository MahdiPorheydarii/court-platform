"""Authentication & onboarding: register a club, sign up, log in, whoami."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import AuthContext, get_auth_context, get_club_by_slug, get_db
from ..errors import AuthError, ConflictError, NotFoundError, ValidationError
from ..models import Club, Member, Role
from ..schemas import (
    ClubOut,
    ClubRegister,
    LoginRequest,
    MemberOut,
    MemberRegister,
    MemberUpdate,
    TokenResponse,
)

_VALID_LEVELS = {"Beginner", "Improver", "Intermediate", "Advanced"}
# Slugs that would collide with platform subdomains (riverside.acepair.ir style)
# or common infra hostnames, so clubs can never claim them.
_RESERVED_SLUGS = {
    "www", "api", "app", "admin", "mail", "ftp", "smtp", "ns", "ns1", "ns2",
    "dashboard", "dokploy", "static", "assets", "cdn", "status", "help",
    "support", "blog", "docs", "acepair",
}
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/v1", tags=["auth"])

# Palette tokens so member avatars stay on-brand and visually varied.
_TONES = [
    "bg-primary/15 text-primary",
    "bg-accent/20 text-accent",
    "bg-accent/15 text-accent",
    "bg-primary/12 text-primary",
]


async def _tone_for(session: AsyncSession, club_id) -> str:
    count = (
        await session.execute(
            select(func.count()).select_from(Member).where(Member.club_id == club_id)
        )
    ).scalar_one()
    return _TONES[count % len(_TONES)]


def _token_response(member: Member, club: Club) -> TokenResponse:
    token = create_access_token(
        member_id=str(member.id), club_id=str(club.id), role=member.role
    )
    return TokenResponse(
        access_token=token,
        member=MemberOut.from_model(member),
        club=ClubOut.model_validate(club),
    )


@router.post(
    "/clubs",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a club and its first admin",
)
async def register_club(
    payload: ClubRegister, session: AsyncSession = Depends(get_db)
) -> TokenResponse:
    if payload.slug.lower() in _RESERVED_SLUGS:
        raise ValidationError("That club address is reserved. Please choose another.")
    existing = await get_club_by_slug(session, payload.slug)
    if existing is not None:
        raise ConflictError("That club address (slug) is already taken.")

    club = Club(name=payload.club_name, slug=payload.slug.lower(), config=payload.config or {})
    session.add(club)
    await session.flush()

    admin = Member(
        club_id=club.id,
        name=payload.admin_name,
        email=payload.admin_email.lower(),
        hashed_password=hash_password(payload.admin_password),
        role=Role.ADMIN,
        skill_level="Advanced",
        tone=_TONES[0],
    )
    session.add(admin)
    await session.commit()
    await session.refresh(admin)
    await session.refresh(club)
    return _token_response(admin, club)


@router.post(
    "/auth/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Sign up as a member of a club",
)
async def register_member(
    slug: str, payload: MemberRegister, session: AsyncSession = Depends(get_db)
) -> TokenResponse:
    club = await get_club_by_slug(session, slug)
    if club is None:
        raise NotFoundError("No club found at that address.")

    email = payload.email.lower()
    dupe = (
        await session.execute(
            select(Member).where(Member.club_id == club.id, Member.email == email)
        )
    ).scalars().first()
    if dupe is not None:
        raise ConflictError("An account with that email already exists at this club.")

    member = Member(
        club_id=club.id,
        name=payload.name,
        email=email,
        hashed_password=hash_password(payload.password),
        role=Role.MEMBER,
        skill_level=payload.skill_level,
        tone=await _tone_for(session, club.id),
    )
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return _token_response(member, club)


@router.post("/auth/login", response_model=TokenResponse, summary="Log in")
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_db)) -> TokenResponse:
    club = await get_club_by_slug(session, payload.slug)
    if club is None:
        raise AuthError("Invalid club, email, or password.")

    member = (
        await session.execute(
            select(Member).where(
                Member.club_id == club.id, Member.email == payload.email.lower()
            )
        )
    ).scalars().first()
    if member is None or not verify_password(payload.password, member.hashed_password):
        raise AuthError("Invalid club, email, or password.")

    return _token_response(member, club)


@router.get("/auth/me", summary="Current member + club")
async def me(ctx: AuthContext = Depends(get_auth_context)) -> dict:
    return {
        "member": MemberOut.from_model(ctx.member).model_dump(mode="json"),
        "club": ClubOut.model_validate(ctx.club).model_dump(mode="json"),
    }


@router.patch("/auth/me", summary="Update your profile (e.g. skill level)")
async def update_me(
    payload: MemberUpdate,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> dict:
    member = ctx.member
    if payload.name is not None:
        member.name = payload.name
    if payload.skill_level is not None:
        if payload.skill_level not in _VALID_LEVELS:
            raise ConflictError("Unknown skill level.")
        member.skill_level = payload.skill_level
    await session.commit()
    await session.refresh(member)
    return {
        "member": MemberOut.from_model(member).model_dump(mode="json"),
        "club": ClubOut.model_validate(ctx.club).model_dump(mode="json"),
    }
