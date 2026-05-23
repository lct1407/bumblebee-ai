# component-size

Keep components under 200 lines. Split large components into submodules.

**Incorrect:**
```tsx
// employee-form.tsx (500+ lines)
export function EmployeeForm() {
  return (
    <form>
      <Card>/* 50 lines of basic info */</Card>
      <Card>/* 40 lines of address */</Card>
      <Card>/* 60 lines of employment */</Card>
    </form>
  );
}
```

**Correct:**
```tsx
// employee-form.tsx (~100 lines)
import { BasicInfoSection, AddressSection, EmploymentSection } from './form';

export function EmployeeForm() {
  return (
    <form>
      <BasicInfoSection formData={formData} onChange={handleChange} />
      <AddressSection address={formData.address} onChange={handleAddressChange} />
      <EmploymentSection formData={formData} onChange={handleChange} />
    </form>
  );
}
```

## Thresholds

| Lines | Action |
|-------|--------|
| > 200 | Split into subcomponents |
| > 300 | Must refactor immediately |
