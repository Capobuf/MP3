# Multitenancy conventions

Tenant context is always taken from the authorized `{tenant:slug}` route model. It is never read from a session value or trusted from a submitted `tenant_id`.

Future tenant-owned tables must include an indexed `tenant_id` foreign key. Queries and route bindings for tenant-owned models must be constrained through the current tenant relationship, and cross-entity assignments must verify that both records belong to that same tenant. Superusers bypass tenant membership checks, but all data queries made inside a tenant remain constrained to that tenant.

Use scoped route model binding where a tenant-owned child model is nested below a tenant route, together with an authorization policy. Reject requests when the tenant context is missing or unauthorized.
