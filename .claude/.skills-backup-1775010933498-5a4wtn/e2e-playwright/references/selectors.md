# E2E Selectors & Page Objects

## Frontend-First Rule

**ALWAYS read frontend code before writing tests.** Tests fail when selectors don't match actual UI.

### Workflow
1. Read page file: `frontend/src/app/(tenant)/[module]/page.tsx`
2. Read components: `frontend/src/features/[module]/components/`
3. Identify element roles, labels, text
4. Write test with correct selectors

---

## UI Component Selectors

### Input
```tsx
// Frontend
<Input label="First Name" placeholder="Enter name" />
```
```typescript
// Test
page.getByLabel('First Name')
page.getByPlaceholder('Enter name')
```

### Custom Select (NOT native)
```tsx
// Frontend uses custom Select with combobox role
<Select label="Department" options={options} />
```
```typescript
// Test - click to open, then click option
await page.getByLabel('Department').click();
await page.getByRole('option', { name: 'Engineering' }).click();

// WRONG - native select methods don't work
await page.getByLabel('Department').selectOption('engineering');  // FAILS
```

### Button
```tsx
// Frontend
<Button>Add Employee</Button>
<Button><Plus /> Create</Button>
```
```typescript
// Test
page.getByRole('button', { name: /add employee/i })
page.getByRole('button', { name: /create/i })
```

### Link styled as Button
```tsx
// Frontend
<Link href="/employees/new"><Button>Add</Button></Link>
```
```typescript
// Test - use link role, not button
page.getByRole('link', { name: /add/i })
```

### Modal/Dialog
```tsx
// Frontend
<Modal isOpen={open} title="Create Employee">...</Modal>
```
```typescript
// Test
const modal = page.getByRole('dialog');
await modal.getByRole('button', { name: 'Create' }).click();
```

### Table
```tsx
// Frontend
<Table>
  <TableHeader><TableHead>Name</TableHead></TableHeader>
  <TableBody><TableRow>...</TableRow></TableBody>
</Table>
```
```typescript
// Test
page.getByRole('table')
page.getByRole('columnheader', { name: 'Name' })
page.getByRole('row').filter({ hasText: 'John' })
```

### Dropdown Menu
```tsx
// Frontend
<Dropdown>
  <DropdownTrigger><MoreVertical /></DropdownTrigger>
  <DropdownContent>
    <DropdownItem>Edit</DropdownItem>
  </DropdownContent>
</Dropdown>
```
```typescript
// Test - click trigger (icon button), then menuitem
await row.getByRole('button').first().click();
await page.getByRole('menuitem', { name: 'Edit' }).click();
```

### Toast/Notification
```typescript
page.getByText(/success|created|updated/i)
page.getByRole('status')
```

### Empty State
```typescript
page.getByText('No employees yet')
```

---

## Page Object Pattern

Location: `e2e/tests/pages/`

```typescript
import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class EmployeesPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    // Navigation
    async goto(): Promise<void> {
        await this.navigateTo('/employees');
        await this.waitForPageReady();
    }

    // Elements (getters for lazy evaluation)
    get pageTitle() {
        return this.page.getByRole('heading', { level: 1 });
    }

    get addButton() {
        return this.page.getByRole('button', { name: /add/i }).first();
    }

    get searchInput() {
        return this.page.getByPlaceholder(/search/i);
    }

    // Actions
    async clickAddEmployee(): Promise<void> {
        await this.addButton.click();
    }

    async search(query: string): Promise<void> {
        await this.searchInput.fill(query);
        await this.page.waitForTimeout(500);  // Debounce
    }

    // Assertions
    async expectPageVisible(): Promise<void> {
        await expect(this.pageTitle).toBeVisible({ timeout: 5000 });
    }
}
```

### Strict Mode - Multiple Elements

```typescript
// Add .first() when button appears in multiple places
get addButton() {
    return this.page.getByRole('button', { name: /add/i }).first();
}

// Or scope to container
get headerAddButton() {
    return this.page.locator('header').getByRole('button', { name: /add/i });
}
```

---

## Page Title Patterns

### Static (PageTitleSetter)
```tsx
// Frontend
<PageTitleSetter title="Employees" />
```
```typescript
// Test
await expect(page.getByRole('heading', { level: 1 })).toContainText('Employees');
```

### Dynamic (usePageHeader)
```tsx
// Frontend - title is dynamic
usePageHeader(`${employee.firstName} ${employee.lastName}`, breadcrumbs);
```
```typescript
// Test - don't expect specific text, just that heading exists
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
```

---

## Quick Reference

| Component | Selector |
|-----------|----------|
| Input with label | `getByLabel('Label Text')` |
| Button | `getByRole('button', { name: /text/i })` |
| Link | `getByRole('link', { name: /text/i })` |
| Custom Select | `getByLabel('Label').click()` → `getByRole('option', { name })` |
| Modal | `getByRole('dialog')` |
| Table | `getByRole('table')` |
| Table header | `getByRole('columnheader', { name })` |
| Table row | `getByRole('row').filter({ hasText })` |
| Heading | `getByRole('heading', { level: 1 })` |
| Menu item | `getByRole('menuitem', { name })` |
