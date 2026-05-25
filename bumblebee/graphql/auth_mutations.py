"""GraphQL auth mutations — signup / login / createApiKey.

Mirrors bumblebee/routers/auth.py logic so the REST endpoints can be retired.
"""
from __future__ import annotations

import strawberry
from sqlalchemy import select

from bumblebee.auth.security import (
    create_access_token,
    generate_api_key,
    hash_password,
    verify_password,
)
from bumblebee.graphql.context import GraphQLContext
from bumblebee.models.user import ApiKey, User
from bumblebee.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from bumblebee.routers.auth import (
    _build_token_payload,
    _resolve_primary_membership,
    _slugify,
    _unique_slug,
)


@strawberry.type
class UserType:
    id: str
    username: str
    email: str
    full_name: str | None


@strawberry.type
class WorkspaceMembershipType:
    id: str
    name: str
    slug: str
    plan: str
    role: str


@strawberry.type
class AuthResult:
    access_token: str
    user: UserType
    workspace: WorkspaceMembershipType | None


@strawberry.input
class SignupInput:
    email: str
    username: str
    password: str
    full_name: str | None = None
    workspace_name: str | None = None


@strawberry.input
class LoginInput:
    username: str
    password: str


@strawberry.type
class AuthMutations:
    @strawberry.mutation
    async def signup(self, info: strawberry.Info, input: SignupInput) -> AuthResult:
        ctx: GraphQLContext = info.context
        existing = (
            await ctx.db.execute(select(User).where(User.username == input.username))
        ).scalar_one_or_none()
        if existing:
            raise ValueError("username_taken")

        user = User(
            email=input.email, username=input.username,
            password_hash=hash_password(input.password), full_name=input.full_name,
        )
        ctx.db.add(user)
        await ctx.db.flush()

        ws_name = input.workspace_name or f"{input.username}'s workspace"
        ws_slug = await _unique_slug(ctx.db, _slugify(ws_name))
        ws = Workspace(name=ws_name, slug=ws_slug, owner_user_id=user.id)
        ctx.db.add(ws)
        await ctx.db.flush()

        member = WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=WorkspaceRole.OWNER)
        ctx.db.add(member)
        await ctx.db.commit()
        await ctx.db.refresh(ws)

        token = create_access_token(str(user.id), extra=_build_token_payload(user, member))
        return AuthResult(
            access_token=token,
            user=UserType(id=str(user.id), username=user.username, email=user.email, full_name=user.full_name),
            workspace=WorkspaceMembershipType(
                id=str(ws.id), name=ws.name, slug=ws.slug,
                plan=ws.plan.value, role=member.role.value,
            ),
        )

    @strawberry.mutation
    async def login(self, info: strawberry.Info, input: LoginInput) -> AuthResult:
        ctx: GraphQLContext = info.context
        user = (
            await ctx.db.execute(
                select(User).where(User.username == input.username, User.is_active)
            )
        ).scalar_one_or_none()
        if not user or not verify_password(input.password, user.password_hash or ""):
            raise ValueError("invalid_credentials")
        member = await _resolve_primary_membership(ctx.db, user.id)
        ws_payload = None
        if member:
            ws = await ctx.db.get(Workspace, member.workspace_id)
            if ws:
                ws_payload = WorkspaceMembershipType(
                    id=str(ws.id), name=ws.name, slug=ws.slug,
                    plan=ws.plan.value, role=member.role.value,
                )
        token = create_access_token(str(user.id), extra=_build_token_payload(user, member))
        return AuthResult(
            access_token=token,
            user=UserType(id=str(user.id), username=user.username, email=user.email, full_name=user.full_name),
            workspace=ws_payload,
        )

    @strawberry.mutation
    async def create_api_key(self, info: strawberry.Info, name: str) -> str:
        ctx: GraphQLContext = info.context
        if not ctx.user:
            raise PermissionError("auth_required")
        raw, h = generate_api_key()
        ak = ApiKey(key_hash=h, name=name, user_id=str(ctx.user.id))
        ctx.db.add(ak)
        await ctx.db.commit()
        return raw  # shown once
