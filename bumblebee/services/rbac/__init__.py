"""RBAC service — permission enum, role mapping, FastAPI dependencies."""
from bumblebee.services.rbac.dependencies import (
    CurrentWorkspace,
    require_permission,
    require_role,
    require_workspace,
)
from bumblebee.services.rbac.permissions import (
    ROLE_PERMISSIONS,
    Permission,
    has_permission,
)

__all__ = [
    "ROLE_PERMISSIONS",
    "CurrentWorkspace",
    "Permission",
    "has_permission",
    "require_permission",
    "require_role",
    "require_workspace",
]
