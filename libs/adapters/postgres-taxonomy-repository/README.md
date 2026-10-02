# @kometio/postgres-taxonomy-repository

Drizzle implementation of `TaxonomyRepositoryPort` — dimensions
(`taxonomies`), their values (`terms`), a term's address per language
(`term_slugs`) and which pages carry which terms (`page_group_terms`).
See [ADR-0064](../../../docs/adr/0064-classification-as-its-own-dimension.md).

Terms and dimensions share one port and one repository because they are
one aggregate in practice: changing a dimension's URL prefix rewrites
the address of every term under it, and a term's address row means
nothing without the dimension it hangs from.

Connects as `kometio_app` through `withTenant`, so every query passes the
tenant policy as well as the explicit `tenantId`
([ADR-0002](../../../docs/adr/0002-non-superuser-role-for-rls-enforcement.md)).

Two rules worth knowing before changing anything here:

- **A term and its addresses are written in one transaction.** A term
  whose slugs landed and whose row did not is a URL that resolves to
  nothing.
- **A root-mounted dimension's `route_prefix` is `NULL`**, and `is null`
  is not `= null`. Written as an equality, a lookup would match nothing
  and every root-mounted address would look free.
