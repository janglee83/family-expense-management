# Family Management — Design Spec

Date: 2026-08-24
Branch: `feature/family-management`
Phase: 3 of the product roadmap (`docs/PRODUCT_REQUIREMENTS.md`)

## Context

Phase 2 (`feature/authentication`, merged to `main`) built user accounts:
email/password registration/login, JWT access + revocable refresh tokens in
httpOnly cookies, and a `get_current_user` FastAPI dependency. No domain
data exists yet beyond `users`. This phase adds the first shared domain
concept — families and membership — that every later phase (expense,
receipt, settlement) will be scoped to.

## Goals

- A user can create a family and becomes its OWNER.
- A user can belong to multiple families simultaneously.
- An OWNER or ADMIN can add an existing registered user to the family by
  email, and remove members (with role-based limits on who can remove
  whom).
- Any non-OWNER member can leave a family voluntarily.
- An OWNER can rename or delete their family; deleting cascades to
  membership records.
- Only the OWNER can change another member's role (promote/demote
  MEMBER↔ADMIN).
- A reusable `get_family_membership` dependency exists for every later
  phase's family-scoped routes to build on, the same way Phase 2's
  `get_current_user` is reused here.
- Both languages (ja/vi) cover every new user-facing string from the
  start, consistent with Phases 1-2.

## Non-goals (explicitly deferred)

- Ownership transfer (an OWNER can delete their family but cannot hand
  ownership to another member in this phase).
- Invite links/tokens for users who haven't registered yet — adding a
  member requires they already have an account (looked up by email).
- Audit logging of membership changes — the master spec's audit examples
  are expense/financial-change-focused; this is revisited once the
  expense domain exists.
- Any expense/receipt/settlement data (Phase 4+) — this phase is purely
  the family/membership shell those phases will attach to.
- A "current family" selector/persisted context in the frontend — nothing
  yet needs to assume a single active family, since no other feature
  reads it.

## Decided design

### Database

New Alembic revision `0003` (following `0001` empty baseline, `0002`
users/refresh_tokens):

```
families
  id           UUID, primary key (uuid4(), app-side, same convention as
               `users`)
  name         str, NOT NULL
  created_at / updated_at   timestamptz, NOT NULL, server default now()
                (updated_at also onupdate now())

family_members
  id           UUID, primary key
  family_id    UUID, FK -> families.id (ON DELETE CASCADE), NOT NULL,
               indexed
  user_id      UUID, FK -> users.id (ON DELETE CASCADE), NOT NULL, indexed
  role         str, NOT NULL — one of "owner" | "admin" | "member"
               (stored as a plain string with an application-level enum,
               not a Postgres ENUM type — simpler to extend later without
               a migration)
  joined_at    timestamptz, NOT NULL, server default now()
  UNIQUE (family_id, user_id)
```

Deleting a `users` row cascades to `family_members` (a deleted user drops
out of every family they were in) — consistent with `refresh_tokens`'
existing cascade behavior from Phase 2. Deleting a `families` row cascades
to `family_members` for that family.

### Role model and permission matrix

Exactly one OWNER per family — the creator, set at family-creation time.
No ownership transfer this phase.

| Action | OWNER | ADMIN | MEMBER |
|---|---|---|---|
| View family + member list | ✅ | ✅ | ✅ |
| Rename family | ✅ | ✅ | ❌ |
| Delete family | ✅ | ❌ | ❌ |
| Add a member (by email) | ✅ | ✅ | ❌ |
| Remove a MEMBER | ✅ | ✅ | ❌ |
| Remove an ADMIN | ✅ | ❌ | ❌ |
| Remove the OWNER | ❌ (n/a) | ❌ | ❌ |
| Promote/demote MEMBER↔ADMIN | ✅ | ❌ | ❌ |
| Leave the family (remove self) | ❌ | ✅ | ✅ |

"Remove a member" and "leave" share one endpoint
(`DELETE /{family_id}/members/{user_id}`) — the permission check simply
allows `user_id == current_user.id` for any non-OWNER as an additional
path alongside the OWNER/ADMIN-removing-someone-else path.

### Backend endpoints (`/api/v1/families`)

| Method | Path | Body | Authorization | Notes |
|---|---|---|---|---|
| POST | `/` | `{name}` | any authenticated user | creator becomes OWNER |
| GET | `/` | — | any authenticated user | lists families the user belongs to, with their role in each |
| GET | `/{family_id}` | — | any member | family detail + member list (each member's id, email, display_name, role) |
| PATCH | `/{family_id}` | `{name}` | OWNER or ADMIN | rename |
| DELETE | `/{family_id}` | — | OWNER only | cascades `family_members` |
| POST | `/{family_id}/members` | `{email}` | OWNER or ADMIN | 404 if no registered user has that email; 409 if already a member |
| DELETE | `/{family_id}/members/{user_id}` | — | see permission matrix | self-removal (leave) or OWNER/ADMIN removing someone below their own rank |
| PATCH | `/{family_id}/members/{user_id}` | `{role}` | OWNER only | promote/demote MEMBER↔ADMIN only |

`app/api/deps.py` gains `get_family_membership(family_id, user=Depends(get_current_user)) -> FamilyMember`
— raises 404 if the family doesn't exist, 403 if the current user isn't a
member. Role-specific checks (OWNER-only, OWNER-or-ADMIN) are small
helper functions layered on top of the resolved membership, not separate
FastAPI dependencies, since the exact required role differs per endpoint.

The role-change request body only accepts `role ∈ {"admin", "member"}` —
`"owner"` is not a settable value through this endpoint at all (rejected
as a 422 validation error, the same layer that rejects any other invalid
enum value). Since there is exactly one OWNER (the creator) and no
ownership-transfer in this phase, the target `user_id` for this endpoint
is by construction never the OWNER themselves in normal operation; if it
ever is (e.g. a stale UI state), the resolved target membership's current
role being `"owner"` is rejected with 400 ("cannot change the owner's
role") before any update happens — a business-rule rejection, distinct
from the 422 that would reject `"owner"` as a submitted target value and
the 403 that would reject a non-OWNER caller.

### Frontend

New routes, both protected (require authentication, same as `/` today):

```
/families              list of the user's families + create-family form
/families/:familyId    member list, add-member-by-email form, rename,
                        delete, remove/leave buttons — each gated
                        client-side by the current user's role in that
                        family (server enforces regardless)
```

`frontend/src/families/` mirrors the `auth/` module's shape:
`familyApi.ts` (typed wrappers over the generated client), `FamilyList.tsx`
+ `CreateFamilyForm.tsx` (the `/families` page), `FamilyDetail.tsx` +
`AddMemberForm.tsx` (the `/families/:familyId` page). `HomePage.tsx` gains
a link to `/families` so the new pages are reachable from the existing
home page.

### i18n

New keys under a `family` namespace in both `ja/common.json` and
`vi/common.json`: `family.create`, `family.name`, `family.rename`,
`family.delete`, `family.myFamilies`, `family.noFamilies`,
`family.addMember`, `family.memberEmail`, `family.memberNotFound`,
`family.memberAlreadyExists`, `family.removeMember`, `family.leaveFamily`,
`family.confirmDelete`, `family.confirmLeave`, `role.owner`, `role.admin`,
`role.member`.

## Testing plan

Backend (`pytest`, integration, real Postgres):
- Create family → creator is OWNER; `GET /` lists it with role "owner".
- Add member by email (existing user) → 201, member appears with role
  "member"; adding the same email twice → 409; adding an unregistered
  email → 404.
- Permission matrix, each denied case returning 403: MEMBER attempting to
  rename/delete/add/remove/promote; ADMIN attempting to delete the family,
  remove another ADMIN, remove the OWNER, or change roles.
- OWNER removes an ADMIN and a MEMBER — both succeed.
- ADMIN removes a MEMBER — succeeds; ADMIN attempts to remove another
  ADMIN — 403.
- MEMBER and ADMIN can each remove themselves (leave); OWNER attempting
  to remove themselves — 403.
- OWNER promotes a MEMBER to ADMIN and demotes an ADMIN back to MEMBER;
  submitting `role: "owner"` in the request body — 422; targeting the
  OWNER's own `user_id` (role currently "owner") with a valid target role
  — 400.
- Deleting a family removes its `family_members` rows (cascade) — verified
  by attempting `GET /{family_id}` afterward and getting 404.
- A user not in a family gets 403 (not 404) on `GET /{family_id}` for a
  family that exists but they don't belong to — 404 for one that doesn't
  exist at all. (Standard "don't leak existence to non-members" via 403
  vs "genuinely doesn't exist" via 404 — this is a deliberate distinction,
  not the login-enumeration case from Phase 2 which specifically had to
  hide existence; family IDs are opaque UUIDs already unguessable, so
  404-vs-403 here is about correct semantics, not a security requirement.)

Frontend (`vitest` + React Testing Library):
- `FamilyList` renders the user's families and a create-family form;
  submitting creates and navigates to the new family's detail page.
- `FamilyDetail` renders members with their roles; add-member form shows
  a translated "not found" error for an unregistered email; remove/leave
  buttons only render for roles permitted to use them (client-side hint,
  not the source of truth).

## Security invariants

- Every family-scoped endpoint resolves membership via
  `get_family_membership` before doing anything else — no endpoint trusts
  a `family_id` in the URL without verifying the current user actually
  belongs to that family.
- Role checks happen server-side on every mutating endpoint; the frontend
  hiding a button is UX only, never the enforcement point.
- Adding a member by email never reveals whether an email exists to a
  non-member of the family they're trying to add someone to — the 404
  "no such registered user" response is only reachable by someone who is
  already OWNER/ADMIN of a real family, not by an arbitrary unauthenticated
  probe (the endpoint itself requires authentication + family
  authorization first).

## Acceptance criteria

- A user can create a family, see it in `GET /api/v1/families`, and add
  a second registered user to it by email.
- The full permission matrix above is enforced server-side and covered by
  tests — every denied case actually returns 403, every allowed case
  actually succeeds.
- Deleting a family actually removes its membership rows (cascade
  verified, not assumed).
- No user-facing string in the new frontend code is hardcoded outside the
  i18n system; both `ja` and `vi` locale files are complete.
- `docker compose up` still brings up the full stack cleanly with the new
  migration applied (`alembic upgrade head` reaches `0003`).
- CI (backend + frontend jobs, including the OpenAPI/type-drift checks)
  is green on this branch.
