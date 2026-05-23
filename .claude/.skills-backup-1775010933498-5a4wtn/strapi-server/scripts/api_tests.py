#!/usr/bin/env python3
"""
Comprehensive API Tests for Strapi Backend

Tests all developed APIs using the proper auth flow:
1. Register company via /api/auth/register-company
2. Use JWT for authenticated requests
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from typing import Any
from dataclasses import dataclass


# Configuration
DEFAULT_PORT = 1337


def get_default_host() -> str:
    """Get default host - use Windows IP if Strapi is running there."""
    env_host = os.environ.get('STRAPI_HOST')
    if env_host:
        return env_host

    # Check if Windows host has Strapi running (for WSL)
    if os.path.exists('/etc/resolv.conf'):
        try:
            with open('/etc/resolv.conf', 'r') as f:
                for line in f:
                    if line.startswith('nameserver'):
                        windows_ip = line.split()[1]
                        # Test if Windows host is reachable on Strapi port
                        import socket
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(1)
                        result = sock.connect_ex((windows_ip, DEFAULT_PORT))
                        sock.close()
                        if result == 0:
                            return windows_ip
        except Exception:
            pass

    return 'localhost'


BASE_URL = os.environ.get('STRAPI_URL', f'http://{get_default_host()}:{DEFAULT_PORT}')


@dataclass
class TestResult:
    name: str
    passed: bool
    message: str
    data: Any = None


class APITester:
    def __init__(self, base_url: str, verbose: bool = False):
        self.base_url = base_url
        self.verbose = verbose
        self.jwt_token: str | None = None
        self.tenant_id: str | None = None
        self.user_data: dict | None = None
        self.test_data: dict = {}
        self.results: list[TestResult] = []

    def log(self, message: str) -> None:
        if self.verbose:
            print(f"  [DEBUG] {message}")

    def request(
        self,
        method: str,
        path: str,
        data: dict | None = None,
        headers: dict | None = None,
        use_auth: bool = True
    ) -> tuple[int, Any]:
        """Make HTTP request to API."""
        url = f"{self.base_url}{path}"
        req_headers = {'Content-Type': 'application/json'}

        if headers:
            req_headers.update(headers)

        if use_auth and self.jwt_token:
            req_headers['Authorization'] = f'Bearer {self.jwt_token}'

        body = json.dumps(data).encode('utf-8') if data else None

        self.log(f"{method} {url}")
        if data:
            self.log(f"Body: {json.dumps(data)[:200]}")

        try:
            req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
            with urllib.request.urlopen(req, timeout=30) as response:
                status = response.status
                try:
                    response_data = json.loads(response.read().decode('utf-8'))
                except Exception:
                    response_data = None
                self.log(f"Response: {status}")
                return status, response_data
        except urllib.error.HTTPError as e:
            try:
                error_data = json.loads(e.read().decode('utf-8'))
            except Exception:
                error_data = {'error': str(e)}
            self.log(f"Error: {e.code} - {error_data}")
            return e.code, error_data
        except Exception as e:
            self.log(f"Exception: {e}")
            return 0, {'error': str(e)}

    def add_result(self, name: str, passed: bool, message: str, data: Any = None) -> None:
        result = TestResult(name, passed, message, data)
        self.results.append(result)
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status} {name}: {message}")
        if self.verbose and data:
            print(f"       Data: {json.dumps(data, indent=2)[:500]}")

    # ==================== Health Tests ====================

    def test_health(self) -> None:
        """Test health endpoint."""
        status, _ = self.request('GET', '/_health', use_auth=False)
        self.add_result(
            "Health Check",
            status in [200, 204],
            f"Status {status}"
        )

    # ==================== Company Registration ====================

    def test_register_company(self) -> None:
        """Register a new company with admin user."""
        status, data = self.request(
            'POST',
            '/api/auth/register-company',
            data={
                'companyName': 'Test Company',
                'subdomain': 'testcompany',
                'plan': 'starter',
                'adminEmail': 'admin@testcompany.com',
                'adminPassword': 'TestPass123',
                'adminFirstName': 'Admin',
                'adminLastName': 'User'
            },
            use_auth=False
        )

        if status == 201 and data and data.get('data', {}).get('jwt'):
            self.jwt_token = data['data']['jwt']
            self.tenant_id = data['data']['tenant']['documentId']
            self.user_data = data['data']['user']
            self.add_result("Register Company", True, f"Created tenant {self.tenant_id}")
        else:
            # Maybe already exists
            error_msg = data.get('error', {}).get('message', '') if data else ''
            self.add_result("Register Company", False, f"Status {status}: {error_msg}")

    def test_login(self) -> None:
        """Login if registration failed (company already exists)."""
        if self.jwt_token:
            self.add_result("User Login", True, "Already authenticated via registration")
            return

        status, data = self.request(
            'POST',
            '/api/auth/local',
            data={
                'identifier': 'admin@testcompany.com',
                'password': 'TestPass123'
            },
            use_auth=False
        )

        if status == 200 and data and data.get('jwt'):
            self.jwt_token = data['jwt']
            self.user_data = data.get('user')
            self.add_result("User Login", True, "Login successful")
        else:
            error_msg = data.get('error', {}).get('message', '') if data else ''
            self.add_result("User Login", False, f"Status {status}: {error_msg}")

    def test_get_me(self) -> None:
        """Get current user profile with tenant info."""
        status, data = self.request('GET', '/api/auth/me')

        if status == 200 and data and data.get('data'):
            user = data['data']
            self.tenant_id = user.get('tenant', {}).get('documentId') if user.get('tenant') else self.tenant_id
            self.add_result("Get Current User", True, f"User: {user.get('email')}")
        else:
            self.add_result("Get Current User", False, f"Status {status}")

    # ==================== Organization Tests ====================

    def test_create_location(self) -> None:
        """Create a location."""
        status, data = self.request(
            'POST',
            '/api/locations',
            data={
                'data': {
                    'name': 'Headquarters',
                    'code': 'HQ',
                    'type': 'office',
                    'isActive': True
                }
            }
        )

        if status in [200, 201] and data and data.get('data'):
            self.test_data['location_id'] = data['data'].get('documentId')
            self.add_result("Create Location", True, "Created location")
        else:
            error_msg = data.get('error', {}).get('message', '') if data else str(data)
            self.add_result("Create Location", False, f"Status {status}: {error_msg}")

    def test_list_locations(self) -> None:
        """List locations."""
        status, data = self.request('GET', '/api/locations')
        if status == 200 and data:
            locations = data.get('data', []) or []
            self.add_result("List Locations", True, f"Found {len(locations)} locations")
        else:
            self.add_result("List Locations", False, f"Status {status}")

    def test_create_department(self) -> None:
        """Create a department."""
        status, data = self.request(
            'POST',
            '/api/departments',
            data={
                'data': {
                    'name': 'Engineering',
                    'code': 'ENG',
                    'isActive': True
                }
            }
        )

        if status in [200, 201] and data and data.get('data'):
            self.test_data['department_id'] = data['data'].get('documentId')
            self.add_result("Create Department", True, "Created department")
        else:
            error_msg = data.get('error', {}).get('message', '') if data else str(data)
            self.add_result("Create Department", False, f"Status {status}: {error_msg}")

    def test_list_departments(self) -> None:
        """List departments."""
        status, data = self.request('GET', '/api/departments')
        if status == 200 and data:
            departments = data.get('data', []) or []
            self.add_result("List Departments", True, f"Found {len(departments)} departments")
        else:
            self.add_result("List Departments", False, f"Status {status}")

    def test_get_department_hierarchy(self) -> None:
        """Get department hierarchy."""
        status, data = self.request('GET', '/api/departments/hierarchy')
        if status == 200 and data:
            self.add_result("Get Department Hierarchy", True, "Got hierarchy")
        else:
            self.add_result("Get Department Hierarchy", False, f"Status {status}")

    def test_create_position(self) -> None:
        """Create a position."""
        payload = {
            'data': {
                'title': 'Software Engineer',
                'code': 'SWE',
                'level': 'mid',
                'isActive': True
            }
        }
        if self.test_data.get('department_id'):
            payload['data']['department'] = self.test_data['department_id']

        status, data = self.request('POST', '/api/positions', data=payload)

        if status in [200, 201] and data and data.get('data'):
            self.test_data['position_id'] = data['data'].get('documentId')
            self.add_result("Create Position", True, "Created position")
        else:
            error_msg = data.get('error', {}).get('message', '') if data else str(data)
            self.add_result("Create Position", False, f"Status {status}: {error_msg}")

    def test_list_positions(self) -> None:
        """List positions."""
        status, data = self.request('GET', '/api/positions')
        if status == 200 and data:
            positions = data.get('data', []) or []
            self.add_result("List Positions", True, f"Found {len(positions)} positions")
        else:
            self.add_result("List Positions", False, f"Status {status}")

    # ==================== Company Info Tests ====================

    def test_create_company_info(self) -> None:
        """Create company info."""
        status, data = self.request(
            'POST',
            '/api/company-infos',
            data={
                'data': {
                    'companyName': 'Test Company Inc.',
                    'legalName': 'Test Company Incorporated',
                    'industry': 'Technology',
                    'companySize': 'size_11_50',
                    'timezone': 'Asia/Bangkok',
                    'currency': 'THB'
                }
            }
        )

        if status in [200, 201] and data and isinstance(data, dict) and data.get('data'):
            self.test_data['company_info_id'] = data['data'].get('documentId')
            self.add_result("Create Company Info", True, "Created company info")
        else:
            if isinstance(data, dict):
                error_msg = data.get('error', {}).get('message', '') if data.get('error') else str(data)
            else:
                error_msg = str(data)
            self.add_result("Create Company Info", False, f"Status {status}: {error_msg}")

    def test_get_company_info(self) -> None:
        """Get company info for current tenant."""
        status, data = self.request('GET', '/api/company-infos')
        if status == 200 and data:
            infos = data.get('data', []) or []
            self.add_result("Get Company Info", True, f"Found {len(infos)} company infos")
        else:
            self.add_result("Get Company Info", False, f"Status {status}")

    # ==================== Employee Tests ====================

    def test_create_employee(self) -> None:
        """Create an employee."""
        payload = {
            'data': {
                'employeeId': 'EMP001',
                'firstName': 'John',
                'lastName': 'Doe',
                'email': 'john.doe@testcompany.com',
                'status': 'active',
                'employmentType': 'full_time'
            }
        }

        if self.test_data.get('department_id'):
            payload['data']['department'] = self.test_data['department_id']
        if self.test_data.get('position_id'):
            payload['data']['position'] = self.test_data['position_id']
        if self.test_data.get('location_id'):
            payload['data']['location'] = self.test_data['location_id']

        status, data = self.request('POST', '/api/employees', data=payload)

        if status in [200, 201] and data and data.get('data'):
            self.test_data['employee_id'] = data['data'].get('documentId')
            self.add_result("Create Employee", True, "Created employee")
        else:
            error_msg = data.get('error', {}).get('message', '') if data else str(data)
            self.add_result("Create Employee", False, f"Status {status}: {error_msg}")

    def test_get_employee(self) -> None:
        """Get employee by ID."""
        emp_id = self.test_data.get('employee_id')
        if not emp_id:
            self.add_result("Get Employee", False, "No employee ID available")
            return

        status, data = self.request('GET', f'/api/employees/{emp_id}')
        if status == 200 and data and data.get('data'):
            self.add_result("Get Employee", True, f"Got employee {emp_id}")
        else:
            self.add_result("Get Employee", False, f"Status {status}")

    def test_list_employees(self) -> None:
        """List employees."""
        status, data = self.request('GET', '/api/employees')
        if status == 200 and data:
            employees = data.get('data', []) or []
            self.add_result("List Employees", True, f"Found {len(employees)} employees")
        else:
            self.add_result("List Employees", False, f"Status {status}")

    def test_update_employee(self) -> None:
        """Update an employee."""
        emp_id = self.test_data.get('employee_id')
        if not emp_id:
            self.add_result("Update Employee", False, "No employee ID available")
            return

        status, data = self.request(
            'PUT',
            f'/api/employees/{emp_id}',
            data={
                'data': {
                    'firstName': 'John Updated',
                    'phone': '+66123456789'
                }
            }
        )

        if status == 200 and data and data.get('data'):
            self.add_result("Update Employee", True, "Employee updated")
        else:
            self.add_result("Update Employee", False, f"Status {status}")

    def test_search_employees(self) -> None:
        """Search employees."""
        status, data = self.request('GET', '/api/employees?filters[firstName][$contains]=John')
        if status == 200 and data:
            employees = data.get('data', []) or []
            self.add_result("Search Employees", True, f"Found {len(employees)} matching")
        else:
            self.add_result("Search Employees", False, f"Status {status}")

    # ==================== Custom Roles Tests ====================

    def test_list_custom_roles(self) -> None:
        """List custom roles."""
        status, data = self.request('GET', '/api/custom-roles')
        if status == 200 and data:
            roles = data.get('data', []) or []
            self.add_result("List Custom Roles", True, f"Found {len(roles)} roles")
        else:
            self.add_result("List Custom Roles", False, f"Status {status}")

    # ==================== Permissions Tests ====================

    def test_list_permissions(self) -> None:
        """List permissions."""
        status, data = self.request('GET', '/api/permissions')
        if status == 200 and data:
            permissions = data.get('data', []) or []
            self.add_result("List Permissions", True, f"Found {len(permissions)} permissions")
        else:
            self.add_result("List Permissions", False, f"Status {status}")

    def test_permissions_by_module(self) -> None:
        """Get permissions by module."""
        status, data = self.request('GET', '/api/permissions/by-module')
        if status == 200 and data:
            self.add_result("Permissions By Module", True, "Got module permissions")
        else:
            self.add_result("Permissions By Module", False, f"Status {status}")

    # ==================== Audit Log Tests ====================

    def test_list_audit_logs(self) -> None:
        """List audit logs."""
        status, data = self.request('GET', '/api/audit-logs')
        if status == 200 and data:
            logs = data.get('data', []) or []
            self.add_result("List Audit Logs", True, f"Found {len(logs)} logs")
        else:
            self.add_result("List Audit Logs", False, f"Status {status}")

    def test_recent_activity(self) -> None:
        """Get recent activity."""
        status, data = self.request('GET', '/api/audit-logs/recent-activity')
        if status == 200 and data:
            self.add_result("Recent Activity", True, "Got recent activity")
        else:
            self.add_result("Recent Activity", False, f"Status {status}")

    # ==================== Cleanup Tests ====================

    def test_delete_employee(self) -> None:
        """Delete test employee."""
        emp_id = self.test_data.get('employee_id')
        if not emp_id:
            self.add_result("Delete Employee", True, "No employee to delete")
            return

        status, _ = self.request('DELETE', f'/api/employees/{emp_id}')
        self.add_result(
            "Delete Employee",
            status in [200, 204],
            f"Status {status}"
        )

    def run_all_tests(self) -> bool:
        """Run all tests in sequence."""
        print("\n" + "=" * 60)
        print("STRAPI API COMPREHENSIVE TESTS")
        print("=" * 60)

        # Health
        print("\n--- Health Check ---")
        self.test_health()

        # Auth
        print("\n--- Authentication ---")
        self.test_register_company()
        self.test_login()

        if not self.jwt_token:
            print("\n[ERROR] Cannot proceed without authentication")
            return False

        self.test_get_me()

        # Organization
        print("\n--- Organization (Locations, Departments, Positions) ---")
        self.test_create_location()
        self.test_list_locations()
        self.test_create_department()
        self.test_list_departments()
        self.test_get_department_hierarchy()
        self.test_create_position()
        self.test_list_positions()

        # Company Info
        print("\n--- Company Info ---")
        self.test_create_company_info()
        self.test_get_company_info()

        # Employees
        print("\n--- Employee Management ---")
        self.test_create_employee()
        self.test_get_employee()
        self.test_list_employees()
        self.test_update_employee()
        self.test_search_employees()

        # Roles & Permissions
        print("\n--- Roles & Permissions ---")
        self.test_list_custom_roles()
        self.test_list_permissions()
        self.test_permissions_by_module()

        # Audit Logs
        print("\n--- Audit Logs ---")
        self.test_list_audit_logs()
        self.test_recent_activity()

        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)

        passed = sum(1 for r in self.results if r.passed)
        failed = sum(1 for r in self.results if not r.passed)
        total = len(self.results)

        print(f"Total:  {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        if failed > 0:
            print("\nFailed tests:")
            for r in self.results:
                if not r.passed:
                    print(f"  - {r.name}: {r.message}")

        print("=" * 60)

        return failed == 0


def main():
    parser = argparse.ArgumentParser(description='Comprehensive API Tests for Strapi')
    parser.add_argument(
        '--url',
        default=BASE_URL,
        help=f'Strapi base URL (default: {BASE_URL})'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output'
    )

    args = parser.parse_args()

    tester = APITester(base_url=args.url, verbose=args.verbose)
    success = tester.run_all_tests()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
