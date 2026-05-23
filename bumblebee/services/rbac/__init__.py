"""RBAC service — permission enum, role mapping, FastAPI dependencies."""
from bumblebee.services.rbac.permissions import (
    Permission,
    ROLE_PERMISSIONS,
    has_permission,
)
from bumblebee.services.rbac.dependencies import (
    require_workspace,
    require_permission,
    require_role,
    CurrentWorkspace,
)

__all__ = [
    "Permission",
    "ROLE_PERMISSIONS",
    "has_permission",
    "require_workspace",
    "require_permission",
    "require_role",
    "CurrentWorkspace",
]
