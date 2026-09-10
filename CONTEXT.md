# Contract workspace

The workspace gives each company its own configurable contracts and a durable record of their changes.

## Language

**Tenant**:
A company workspace that owns its users, template, and contracts. Each user belongs to exactly one tenant.
_Avoid_: Account when referring to a company workspace.

**Admin**:
A tenant user who can read and create contracts, manage the tenant's template, edit or migrate Drafts, and activate or close contracts. The role grants no authority over other tenants.

**Member**:
A tenant user who can read the workspace's template, contracts, and history and create Draft contracts. Members cannot change existing contracts or templates.

**Logical template**:
The single continuing template identity within a tenant, shared by its successive versions.
_Avoid_: Template version when referring to that continuing identity.

**Template version**:
An immutable definition of the template's fields, including their stable keys, labels, types, required flags, and optional defaults. A contract retains the version that gives its values meaning until an explicit Draft migration.

**Contract**:
A tenant-owned document whose field values are interpreted by one template version and whose lifecycle is Draft → Active → Closed.

**Draft**:
The initial contract state, in which an Admin may edit values or explicitly migrate the contract to the active template version.

**Active**:
The contract state reached by activation from Draft, with fixed contents and closure as its only next lifecycle step. This is distinct from an active template version, which is the definition selected for new contracts.

**Closed**:
The terminal contract state reached from Active, retaining its contents and history.

**Revision**:
The change marker used to distinguish the current state of a contract or logical template from an earlier state. A successful state-changing mutation advances it once; a valid unchanged submission does not.
_Avoid_: Template version when referring to a concurrency marker.

**History**:
The immutable, ordered record of contract changes, identifying who changed the contract, when, and the before/after states. Each state retains the template version needed to interpret its values; creation has no prior state.
_Avoid_: Notification log when referring to contract changes.

**Outbox event**:
The durable record of an activation awaiting or having completed publication, with an identity preserved across delivery attempts. It represents that activation even if the contract has since closed.

**Refresh session**:
One sign-in's renewable access relationship and the revocation boundary for its succession of Refresh credentials within a fixed seven-day lifetime. Independent sign-ins create independent Refresh sessions.

**Refresh credential**:
A rotating, single-use proof belonging to one Refresh session. Reuse revokes that Refresh session without affecting independent sign-ins.

**Notification log**:
Persisted evidence that an activation event was processed, recorded once per event identity. It is not an email or a user-facing notification inbox.
