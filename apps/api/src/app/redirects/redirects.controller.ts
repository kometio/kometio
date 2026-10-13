import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createRedirect,
  deleteRedirect,
  describeRedirect,
  dismissMissingPath,
  importRedirects,
  listMissingPaths,
  listRedirects,
  testRedirectAddress,
  updateRedirect,
  type RedirectListItem,
  type RedirectTestResult,
} from '@kometio/application';
import {
  type CreateRedirectBody,
  type ImportRedirectsBody,
  type ListMissingPathsQuery,
  type ListRedirectsQuery,
  type PaginatedMissingPaths,
  type PaginatedRedirects,
  type RedirectImportReport,
  type RedirectRecord,
  type RedirectTestResult as RedirectTestResultRecord,
  type TestRedirectBody,
  type UpdateRedirectBody,
  createRedirectBodySchema,
  importRedirectsBodySchema,
  listMissingPathsQuerySchema,
  listRedirectsQuerySchema,
  paginatedMissingPathsSchema,
  paginatedRedirectsSchema,
  redirectImportReportSchema,
  redirectRecordSchema,
  redirectTestResultSchema,
  testRedirectBodySchema,
  updateRedirectBodySchema,
} from '@kometio/api-contracts';
import { describeRedirectSource } from '@kometio/shared-types';
import { Allowed } from '../auth/allowed.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantId, UserId } from '../auth/session-identity.decorator';
import { UuidParam } from '../uuid-param.decorator';
import { ZodValidationPipe } from '../zod-validation.pipe';
import type { RedirectsDeps } from './redirects.deps';
import { REDIRECTS_DEPS } from './redirects.tokens';

function toRecord(item: RedirectListItem): RedirectRecord {
  const { redirect, page } = item;
  const target = redirect.target;
  let record: RedirectRecord['target'] = null;
  if (target?.kind === 'page') {
    record = {
      kind: 'page',
      pageGroupId: target.pageGroupId,
      locale: target.locale,
      title: page?.title ?? null,
      path: page?.path ?? null,
      isPublished: page?.isPublished ?? false,
    };
  } else if (target?.kind === 'url') {
    record = { kind: 'url', url: target.url };
  }
  return redirectRecordSchema.parse({
    id: redirect.id,
    siteId: redirect.siteId,
    from: describeRedirectSource(redirect.source),
    kind: redirect.kind,
    target: record,
    status: redirect.status,
    origin: redirect.origin,
    hits: redirect.hits,
    lastHitAt: redirect.lastHitAt?.toISOString() ?? null,
    needsATarget: redirect.needsATarget,
    createdAt: redirect.createdAt.toISOString(),
    updatedAt: redirect.updatedAt.toISOString(),
  });
}

function toTestRecord(result: RedirectTestResult): RedirectTestResultRecord {
  switch (result.outcome) {
    case 'redirect':
      return redirectTestResultSchema.parse({
        outcome: 'redirect',
        status: result.status,
        location: result.location,
        ruleId: result.rule.id,
      });
    case 'gone':
    case 'broken':
    case 'loop':
      return redirectTestResultSchema.parse({
        outcome: result.outcome,
        ruleId: result.rule.id,
      });
    default:
      return redirectTestResultSchema.parse(result);
  }
}

/**
 * The rules that send an old address somewhere (docs/adr/0127), and the list
 * of addresses visitors asked for and the site did not have.
 *
 * All of it is the publisher's: a rule changes what is online at once, as a
 * section's or a term's does.
 */
@Controller('redirects')
@UseGuards(SessionAuthGuard)
export class RedirectsController {
  constructor(@Inject(REDIRECTS_DEPS) private readonly deps: RedirectsDeps) {}

  @Get()
  @Allowed('changeLiveSite')
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listRedirectsQuerySchema))
    query: ListRedirectsQuery,
  ): Promise<PaginatedRedirects> {
    const result = await listRedirects(this.deps, {
      tenantId,
      siteId: query.siteId,
      filter: {
        search: query.search,
        origin: query.origin,
        needsATarget: query.needsATarget,
      },
      page: query.page,
      pageSize: query.pageSize,
    });
    return paginatedRedirectsSchema.parse({
      items: result.items.map(toRecord),
      total: result.total,
    });
  }

  @Post()
  @Allowed('changeLiveSite')
  async create(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(createRedirectBodySchema))
    body: CreateRedirectBody,
  ): Promise<RedirectRecord> {
    const redirect = await createRedirect(this.deps, {
      tenantId,
      siteId: body.siteId,
      from: body.from,
      to: body.to,
      status: body.status,
      createdBy: userId,
    });
    return toRecord(await describeRedirect(this.deps, tenantId, redirect));
  }

  /**
   * A list, in one go (docs/adr/0127). `dryRun` says what would happen and
   * writes nothing; the answer is the same shape either way, so that the
   * preview a person confirms is the report of what was done.
   */
  @Post('import')
  @Allowed('changeLiveSite')
  async importList(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(importRedirectsBodySchema))
    body: ImportRedirectsBody,
  ): Promise<RedirectImportReport> {
    const report = await importRedirects(this.deps, {
      tenantId,
      siteId: body.siteId,
      csv: body.csv,
      dryRun: body.dryRun,
      createdBy: userId,
    });
    return redirectImportReportSchema.parse(report);
  }

  /** Where an address would go, from the same rules the site answers with. */
  @Post('test')
  @HttpCode(200)
  @Allowed('changeLiveSite')
  async test(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(testRedirectBodySchema))
    body: TestRedirectBody,
  ): Promise<RedirectTestResultRecord> {
    const result = await testRedirectAddress(this.deps, {
      tenantId,
      siteId: body.siteId,
      address: body.address,
    });
    return toTestRecord(result);
  }

  @Get('missing')
  @Allowed('changeLiveSite')
  async listMissing(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listMissingPathsQuerySchema))
    query: ListMissingPathsQuery,
  ): Promise<PaginatedMissingPaths> {
    const result = await listMissingPaths(this.deps, {
      tenantId,
      siteId: query.siteId,
      page: query.page,
      pageSize: query.pageSize,
    });
    return paginatedMissingPathsSchema.parse({
      items: result.items.map((item) => ({
        id: item.id,
        path: item.path,
        hits: item.hits,
        firstSeenAt: item.firstSeenAt.toISOString(),
        lastSeenAt: item.lastSeenAt.toISOString(),
      })),
      total: result.total,
    });
  }

  @Post('missing/:id/dismiss')
  @HttpCode(204)
  @Allowed('changeLiveSite')
  async dismissMissing(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<void> {
    await dismissMissingPath(this.deps, { tenantId, missingPathId: id });
  }

  @Patch(':id')
  @Allowed('changeLiveSite')
  async update(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateRedirectBodySchema))
    body: UpdateRedirectBody,
  ): Promise<RedirectRecord> {
    const redirect = await updateRedirect(this.deps, {
      tenantId,
      redirectId: id,
      from: body.from,
      to: body.to,
      status: body.status,
    });
    return toRecord(await describeRedirect(this.deps, tenantId, redirect));
  }

  @Delete(':id')
  @HttpCode(204)
  @Allowed('delete')
  async remove(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<void> {
    await deleteRedirect(this.deps, { tenantId, redirectId: id });
  }
}
