# component-modular

Group related subcomponents in folders with barrel exports.

**Structure:**
```
features/{name}/components/
├── {name}-form.tsx              # Main form component
├── form/                        # Form subcomponents
│   ├── basic-info-section.tsx
│   ├── address-section.tsx
│   └── index.ts                 # Barrel export
├── {name}-profile.tsx           # Main profile component
├── profile/                     # Profile subcomponents
│   ├── header-card.tsx
│   ├── contact-card.tsx
│   └── index.ts
└── index.ts
```

**Barrel export:**
```typescript
// form/index.ts
export { BasicInfoSection } from './basic-info-section';
export { AddressSection } from './address-section';
```

**Usage:**
```typescript
import { BasicInfoSection, AddressSection } from './form';
```
