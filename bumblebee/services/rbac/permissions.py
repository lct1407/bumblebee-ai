"""Permission catalog + role → permission mapping.

Permissions are the leaf primitives. Roles are bundles of permissions.
Every protected endpoint declares the permission it needs (not the role).
This makes it easy to add custom roles later without rewriting endpoints.
"""
from __future__ import annotations
import enum

from bumblebee.models.workspace import WorkspaceRole


class Permission(str, enum.Enum):
    # Issues
    READ_ISSUE = "read_issue"
    WRITE_ISSUE = "write_issue"
    DELETE_ISSUE = "delete_issue"

    # Workflows
    TRIGGER_WORKFLOW = "trigger_workflow"
    READ_WORKFLOW = "read_workflow"

    # Projects
    READ_PROJECT = "read_project"
    WRITE_PROJECT = "write_project"
    DELETE_PROJECT = "delete_project"

    # Members & invites
    READ_MEMBERS = "read_members"
    MANAGE_MEMBERS = "manage_members"  # invite, change role, remove

    # Workspace lifecycle
    MANAGE_WORKSPACE = "manage_workspace"  # rename, settings
    DELETE_WORKSPACE = "delete_workspace"
    TRANSFER_OWNERSHIP = "transfer_ownership"

    # Billing
    READ_BILLING = "read_billing"
    MANAGE_BILLING = "manage_billing"

    # API keys
    READ_API_KEYS = "read_api_keys"
    MANAGE_API_KEYS = "manage_api_keys"

    # Plugins
    READ_PLUGINS = "read_plugins"
    MANAGE_PLUGINS = "manage_plugins"

    # Audit
    READ_AUDIT_LOG = "read_audit_log"
    EXPORT_AUDIT_LOG = "export_audit_log"


# Role → set[Permission] mapping. Owner > Admin > Member > Viewer.
ROLE_PERMISSIONS: dict[WorkspaceRole, set[Permission]] = {
    WorkspaceRole.VIEWER: {
        Permission.READ_ISSUE,
        Permission.READ_WORKFLOW,
        Permission.READ_PROJECT,
        Permission.READ_MEMBERS,
        Permission.READ_PLUGINS,
    },
    WorkspaceRole.MEMBER: {
        Permission.READ_ISSUE,
        Permission.WRITE_ISSUE,
        Permission.READ_WORKFLOW,
        Permission.TRIGGER_WORKFLOW,
        Permission.READ_PROJECT,
        Permission.READ_MEMBERS,
        Permission.READ_PLUGINS,
        Permission.READ_API_KEYS,
        Permission.MANAGE_API_KEYS,  # users manage their own
    },
    WorkspaceRole.ADMIN: {
        # All member permissions...
        Permission.READ_ISSUE,
        Permission.WRITE_ISSUE,
        Permission.DELETE_ISSUE,
        Permission.READ_WORKFLOW,
        Permission.TRIGGER_WORKFLOW,
        Permission.READ_PROJECT,
        Permission.WRITE_PROJECT,
        Permission.DELETE_PROJECT,
        Permission.READ_MEMBERS,
        Permission.MANAGE_MEMBERS,
        Permission.MANAGE_WORKSPACE,
        Permission.READ_BILLING,
        Permission.READ_API_KEYS,
        Permission.MANAGE_API_KEYS,
        Permission.READ_PLUGINS,
        Permission.MANAGE_PLUGINS,
        Permission.READ_AUDIT_LOG,
        Permission.EXPORT_AUDIT_LOG,
    },
    WorkspaceRole.OWNER: {p for p in Permission},  # all
}


def has_permission(role: WorkspaceRole, permission: Permission) -> bool:
    """Check whether a role grants a permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())


def permissions_for(role: WorkspaceRole) -> set[Permission]:
    """Return the full permission set for a role (for UI exposure)."""
    return ROLE_PERMISSIONS.get(role, set()).copy()
