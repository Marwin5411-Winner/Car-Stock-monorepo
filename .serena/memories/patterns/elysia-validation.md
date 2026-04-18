# Elysia Double Validation Pattern

## How It Works
API has 2 validation layers:
1. **Elysia `t.Object()`** in controller — strips unknown fields, type-checks
2. **Zod schema** in service — business validation

## Adding New Fields
Must add to BOTH layers or the field gets stripped by Elysia before reaching Zod.

## Common Gotchas
- `t.Number()` rejects string numbers ("200") → use `t.Numeric()` for form inputs
- `t.Date()` may reject date strings → use `t.Union([t.Date(), t.String()])` and let Zod coerce
- Example: `apps/api/src/modules/payments/payments.controller.ts` PATCH endpoint uses `t.Numeric()` for amount