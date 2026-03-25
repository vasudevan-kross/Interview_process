---
name: interview-platform-feature
description: >
  Guides adding new features to the AI-driven Interview platform (FastAPI backend + Next.js frontend + Supabase).
  Use this skill whenever you need to: add a new API endpoint, create a new dashboard page, write a Supabase migration,
  or build any combination of these. Covers the repo's exact conventions for auth/permissions, multi-tenancy, design system,
  migration management, and the critical rule that every new migration must also be applied to the consolidated schema.
  Trigger this skill for requests like "add a feature for X", "create an endpoint for Y", "build a page to manage Z",
  "add a table for W", "I need to store X in the database", or any full-stack feature work in this repo.
---

# AI Interview Platform — New Feature Skill

This repo has specific conventions that are easy to get wrong. This skill keeps you on the right track.

The three main workflows are:
- **Database migration** — new SQL file + consolidated schema update
- **Backend endpoint** — FastAPI route with auth, multi-tenancy, rate limiting
- **Frontend page** — Next.js dashboard page with Supabase auth, loading states, design system

Work through whichever sections apply to the current task. Most features touch all three.

---

## 1. Database Migration

Every schema change needs two things: a numbered migration file AND an update to the consolidated schema. The consolidated schema (`000_consolidated_schema.sql`) is what new developers run to get a complete database — it must always reflect the current state.

### Steps

**1. Determine the next migration number**
Check the highest-numbered file in `backend/migrations/` and increment by 1. As of this writing, the latest is `037_*`. If you see a higher number, use that + 1.

**2. Create the migration file**
```
backend/migrations/0NN_short_description.sql
```
Use snake_case for the description. Keep it short but specific — `add_org_settings` not `update_stuff`.

Write plain SQL. Start with a comment block:
```sql
-- Migration 0NN: short description
-- Purpose: what this change does and why

-- Your SQL here
CREATE TABLE ...
ALTER TABLE ...
```

**3. Update the consolidated schema**
Open `backend/migrations/000_consolidated_schema.sql` and apply the same changes in the right place:
- New tables: add near related tables, or at the end of the tables section
- New columns: find the `CREATE TABLE` for that table and add the column
- New indexes/policies: add after the relevant table definition

The consolidated schema is organized in sections (tables → indexes → RLS policies → functions → triggers → seed data). Add your changes in the appropriate section, not just at the end.

**Why this matters:** if you only add the numbered file, new devs who run `000_consolidated_schema.sql` will have a broken/incomplete schema. Both files must stay in sync.

---

## 2. Backend API Endpoint

### File location
All routes live in `backend/app/api/v1/`. Each domain has its own file. Add to the existing file for that domain, or create a new file if it's a genuinely new domain.

If creating a new router file, register it in `backend/app/api/v1/__init__.py`:
```python
from .your_module import router as your_router
router.include_router(your_router)
```

### Endpoint template

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.auth.dependencies import OrgContext
from app.auth.permissions import require_permission  # or require_role
import logging

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/your-domain", tags=["Your Domain"])

@router.post("/items", response_model=ItemResponse, status_code=201, summary="Create item")
@limiter.limit("30/minute")
async def create_item(
    request: Request,
    payload: ItemCreate,
    ctx: OrgContext = Depends(require_permission("module:create"))
):
    try:
        service = get_your_service()
        result = await service.create(ctx.user_id, ctx.org_id, payload)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating item: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

### Auth conventions

**Permission-based** (most common):
```python
ctx: OrgContext = Depends(require_permission("module:action"))
```

**Role-based** (admin-only operations):
```python
ctx: OrgContext = Depends(require_role("owner", "admin"))
```

Permissions follow the pattern `module:action`. Check `backend/app/auth/permissions.py` for existing permission strings — reuse them rather than inventing new ones. Common actions: `view`, `create`, `edit`, `delete`.

**OrgContext fields:**
- `ctx.org_id` — always pass to service calls for multi-tenancy isolation. Forgetting this leaks data across organizations.
- `ctx.user_id` — the internal DB user ID (not the Supabase auth UUID)
- `ctx.role` — the user's role in the org

### Error handling pattern
- `ValueError` → 400 (bad input, validation failures, business rule violations)
- Catch-all `Exception` → 500 (log it, return generic message)
- Never expose internal error details in 500 responses

### File uploads
For endpoints that accept files, use `Form(...)` and validate:
```python
async def upload(
    request: Request,
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_permission("module:upload"))
):
    file_data = await file.read()
    _validate_upload(file_data, file.filename)  # checks size + extension
```

---

## 3. Frontend Dashboard Page

### File location
Pages live in `frontend/src/app/dashboard/your-section/page.tsx`. Create the directory if needed.

The dashboard layout at `frontend/src/app/dashboard/layout.tsx` handles the sidebar and `md:pl-64` offset automatically — you don't need to add it to your page.

### Page template

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface YourItem {
  id: string
  // ...
}

export default function YourPage() {
  const router = useRouter()
  const [items, setItems] = useState<YourItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Map Supabase auth UUID → internal DB user
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { data, error } = await supabase
        .from('your_table')
        .select('*')
        .eq('org_id', userRecord.org_id)  // always scope to org
        .order('created_at', { ascending: false })

      if (error) { toast.error('Failed to load items'); return }
      setItems(data || [])
    } catch {
      toast.error('Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonPageHeader />
        <SkeletonTable />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Your Title" description="Brief description" />
      {/* page content */}
    </div>
  )
}
```

### Design system

Follow these exactly — they define the visual language of the app:

| Element | Class |
|---|---|
| Primary CTA button | `bg-indigo-600 hover:bg-indigo-700` |
| Active nav item | `bg-slate-800 text-white border-l-2 border-indigo-500` |
| Stat numbers | `text-2xl font-semibold tabular-nums text-slate-900` |
| Badges | `rounded-md font-medium` (NOT `rounded-full`) |
| Table headers | `text-xs font-medium text-slate-400 uppercase tracking-wider` |
| Empty state | `py-16 text-center` — text only, no icon circles |
| Page header | Use `<PageHeader>` component — no gradient banners |

### API calls
Always use relative paths — the Next.js proxy in `next.config.ts` routes `/api/*` to the backend:
```typescript
// Good
const res = await fetch('/api/v1/your-endpoint')

// Bad — never hardcode the backend URL
const res = await fetch('http://localhost:8000/api/v1/your-endpoint')
```

For complex API interactions, use the `apiClient` wrapper at `frontend/src/lib/api-client.ts` rather than raw fetch.

### Delete confirmation pattern
When adding delete functionality, use the three-state pattern to avoid accidental deletes:
```typescript
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
const [deleting, setDeleting] = useState(false)

const handleDelete = (id: string) => {
  setPendingDeleteId(id)
  setDeleteDialogOpen(true)
}

const confirmDelete = async () => {
  if (!pendingDeleteId) return
  try {
    setDeleting(true)
    await apiClient.deleteItem(pendingDeleteId)
    toast.success('Deleted successfully')
    fetchItems()
  } catch {
    toast.error('Failed to delete')
  } finally {
    setDeleting(false)
    setDeleteDialogOpen(false)
    setPendingDeleteId(null)
  }
}
```

---

## Checklist before finishing

- [ ] Migration file created with correct number (`0NN_description.sql`)
- [ ] Same changes applied to `000_consolidated_schema.sql` in the right section
- [ ] Backend endpoint includes auth dependency (`require_permission` or `require_role`)
- [ ] `ctx.org_id` passed to all service calls (multi-tenancy)
- [ ] Rate limiter decorator present above route decorator
- [ ] Router registered in `api/v1/__init__.py` if it's a new file
- [ ] Frontend uses `<PageHeader>` (not custom header)
- [ ] Skeleton loading state shown while fetching
- [ ] API calls use relative `/api/v1/...` paths
- [ ] Supabase auth UUID mapped to internal user record before DB queries
- [ ] Badges use `rounded-md`, not `rounded-full`
