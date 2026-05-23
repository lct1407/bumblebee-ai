#!/usr/bin/env python3
"""
Initialize Next.js project with consistent structure.
Usage:
  python3 init_nextjs.py <project-name> --new    # Create new project
  python3 init_nextjs.py <project-name>          # Add structure to existing
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

STRUCTURE = {
    "app": {
        "(protected)": {
            "dashboard": {},
            "projects": {},
            "settings": {}
        },
        "(auth)": {
            "login": {},
            "register": {}
        }
    },
    "features": {},
    "components": {
        "ui": {},
        "layout": {},
        "common": {}
    },
    "lib": {
        "api": {},
        "types": {},
        "utils": {},
        "constants": {},
        "validations": {}
    },
    "hooks": {},
    "providers": {}
}

BOILERPLATE_FILES = {
    "lib/utils/cn.ts": '''import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
''',
    "lib/types/index.ts": '''// Shared entity types
export interface BaseEntity {
  id: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
}
''',
    "lib/api/client.ts": '''const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }

  return res.json();
}
''',
    "providers/query-provider.tsx": ''''use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
'''
}

# Packages to install after project creation
PACKAGES = [
    "@tanstack/react-query",
    "clsx",
    "tailwind-merge",
    "lucide-react",
    "zod"
]

DEV_PACKAGES = [
    "@types/node"
]


def run_command(cmd: list, cwd: str = None):
    """Run a shell command."""
    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=False)
    return result.returncode == 0


def create_nextjs_project(project_name: str):
    """Create new Next.js project using npx."""
    print("\n\U0001f4e6 Creating Next.js project with npx create-next-app...")

    cmd = [
        "npx", "create-next-app@latest", project_name,
        "--typescript",
        "--tailwind",
        "--eslint",
        "--app",
        "--src-dir",
        "--import-alias", "@/*",
        "--use-npm",
        "--yes"  # Non-interactive mode
    ]

    if not run_command(cmd):
        print("\u274c Failed to create Next.js project")
        sys.exit(1)

    print("\u2705 Next.js project created")


def install_packages(project_path: Path):
    """Install additional packages."""
    print("\n\U0001f4e6 Installing additional packages...")

    # Install production dependencies
    cmd = ["npm", "install"] + PACKAGES
    if not run_command(cmd, cwd=str(project_path)):
        print("\u26a0\ufe0f  Some packages failed to install")

    # Install dev dependencies
    cmd = ["npm", "install", "-D"] + DEV_PACKAGES
    run_command(cmd, cwd=str(project_path))

    print("\u2705 Packages installed")


def create_structure(base_path: Path, structure: dict):
    """Recursively create directory structure."""
    for name, children in structure.items():
        path = base_path / name
        path.mkdir(parents=True, exist_ok=True)
        print(f"  Created: {path}")
        if children:
            create_structure(path, children)


def create_boilerplate(base_path: Path):
    """Create boilerplate files."""
    for file_path, content in BOILERPLATE_FILES.items():
        full_path = base_path / file_path
        if not full_path.exists():
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content)
            print(f"  Created: {full_path}")


def main():
    parser = argparse.ArgumentParser(description='Initialize Next.js project')
    parser.add_argument('name', help='Project name / directory')
    parser.add_argument('--new', action='store_true', help='Create new project with npx')
    args = parser.parse_args()

    project_path = Path(args.name)
    src_path = project_path / "src"

    print(f"\n\U0001f680 Initializing Next.js project: {args.name}\n")

    # Step 1: Create new project if --new flag
    if args.new:
        if project_path.exists():
            print(f"\u274c Directory '{args.name}' already exists")
            sys.exit(1)
        create_nextjs_project(args.name)
        install_packages(project_path)

    # Verify project exists
    if not project_path.exists():
        print(f"\u274c Directory '{args.name}' not found. Use --new to create.")
        sys.exit(1)

    # Step 2: Create directory structure
    print("\n\U0001f4c1 Creating directory structure...")
    create_structure(src_path, STRUCTURE)

    # Step 3: Create boilerplate files
    print("\n\U0001f4c4 Creating boilerplate files...")
    create_boilerplate(src_path)

    print(f"\n\u2705 Next.js project initialized at {project_path}")
    print("\nNext steps:")
    print("  1. cd", args.name)
    print("  2. npm run dev")
    print("  3. Review docs/coding-docs/code-standards-nextjs.md")


if __name__ == '__main__':
    main()
