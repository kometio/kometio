import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  Body,
} from '@nestjs/common';
import {
  countFormSubmissions,
  deleteForm,
  deleteFormSubmission,
  duplicateForm,
  exportFormSubmissions,
  getFormById,
  listFormSubmissions,
  listForms,
  updateForm,
  createForm,
} from '@kometio/application';
import type { Response } from 'express';
import type { Form } from '@kometio/domain-core';
import {
  type FormRecord,
  type PaginatedFormSubmissions,
  type PaginatedForms,
  formRecordSchema,
  paginatedFormSubmissionsSchema,
  paginatedFormsSchema,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { buildFormSubmissionsCsv } from './form-submissions-csv';
import {
  type CreateFormBody,
  createFormBodySchema,
  type DuplicateFormBody,
  duplicateFormBodySchema,
  type ListFormsQuery,
  listFormsQuerySchema,
  type ListFormSubmissionsQuery,
  listFormSubmissionsQuerySchema,
  type UpdateFormBody,
  updateFormBodySchema,
} from './forms.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { FormsDeps } from './forms.deps';
import { FORMS_DEPS } from './forms.tokens';
import { TenantId } from '../auth/session-identity.decorator';

@Controller('forms')
@UseGuards(SessionAuthGuard)
export class FormsController {
  constructor(@Inject(FORMS_DEPS) private readonly deps: FormsDeps) {}

  @Post()
  @Allowed('changeLiveSite')
  async create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(createFormBodySchema)) body: CreateFormBody,
  ): Promise<FormRecord> {
    const form = await createForm(this.deps, { tenantId, ...body });
    // Nothing can have been submitted to a form that did not exist a
    // moment ago.
    return this.toDto(form, 0);
  }

  /**
   * A copy of the form: its fields, steps and notification addresses, under
   * a name the caller gives it, and none of its answers. Like creating one
   * it is live at once (docs/roles.md).
   */
  @Post(':id/duplicate')
  @Allowed('changeLiveSite')
  async duplicate(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(duplicateFormBodySchema))
    body: DuplicateFormBody,
  ): Promise<FormRecord> {
    const copy = await duplicateForm(this.deps, {
      tenantId,
      formId: id,
      name: body.name,
    });
    return this.toDto(copy, 0);
  }

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listFormsQuerySchema)) query: ListFormsQuery,
  ): Promise<PaginatedForms> {
    const result = await listForms(this.deps, {
      tenantId,
      siteId: query.siteId,
      page: query.page,
      pageSize: query.pageSize,
    });
    // One extra query for the whole page rather than one per row: the list
    // is where someone finds out that answers came in at all, and without
    // a number here they have to open every form to know.
    const counts = await countFormSubmissions(this.deps, {
      tenantId,
      formIds: result.items.map((form) => form.id),
    });

    return paginatedFormsSchema.parse({
      items: result.items.map((form) => this.toDto(form, counts[form.id] ?? 0)),
      total: result.total,
    });
  }

  /**
   * One form's submissions. Behind the same session guard as the rest of
   * this controller — the payloads are whatever visitors typed into a
   * public form, which is exactly the kind of data that must not be
   * readable without being logged in.
   *
   * Returns the form alongside them: a payload is keyed by field id and is
   * unreadable without the field definitions to render it against.
   */
  @Get(':id/submissions')
  async listSubmissions(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Query(new ZodValidationPipe(listFormSubmissionsQuerySchema))
    query: ListFormSubmissionsQuery,
  ): Promise<PaginatedFormSubmissions> {
    const result = await listFormSubmissions(this.deps, {
      tenantId,
      formId: id,
      page: query.page,
      pageSize: query.pageSize,
    });
    return paginatedFormSubmissionsSchema.parse({
      items: result.items.map((submission) => {
        const props = submission.toProps();
        return {
          id: props.id,
          payload: props.payload,
          createdAt: props.createdAt.toISOString(),
          // The id alone; the page is named once in `pages` below rather
          // than repeated on every row that shares it.
          pageId: props.pageId,
        };
      }),
      total: result.total,
      fields: result.form.toProps().fields,
      pages: result.pages,
    });
  }

  /**
   * The same data as a file. A separate route rather than a query param on
   * the one above: it answers with a different content type and a
   * different pagination story (all of it), and conflating the two makes
   * both harder to reason about.
   */
  @Get(':id/submissions.csv')
  async exportSubmissions(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const { form, submissions, pages } = await exportFormSubmissions(
      this.deps,
      { tenantId, formId: id },
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      // The form's own name would be friendlier and is not worth the
      // escaping: it is user-supplied text going into a header, and a
      // quote or a newline there is a header-injection bug.
      `attachment; filename="submissions-${id}.csv"`,
    );
    return buildFormSubmissionsCsv(form, submissions, pages);
  }

  /**
   * One answer, for good: a person's request to be forgotten, for a form
   * that holds many. Deleting is a publisher's, like every other delete.
   */
  @Delete(':id/submissions/:submissionId')
  @Allowed('delete')
  @HttpCode(204)
  async deleteSubmission(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @UuidParam('submissionId') submissionId: string,
  ): Promise<void> {
    await deleteFormSubmission(this.deps, {
      tenantId,
      formId: id,
      submissionId,
    });
  }

  @Get(':id')
  async findById(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<FormRecord> {
    const form = await getFormById(this.deps, { tenantId, formId: id });
    return this.toDto(form, await this.submissionCountOf(tenantId, form));
  }

  @Patch(':id')
  @Allowed('changeLiveSite')
  async update(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateFormBodySchema)) body: UpdateFormBody,
  ): Promise<FormRecord> {
    const form = await updateForm(this.deps, {
      tenantId,
      formId: id,
      ...body,
    });
    return this.toDto(form, await this.submissionCountOf(tenantId, form));
  }

  @Delete(':id')
  @Allowed('delete')
  @HttpCode(204)
  async delete(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<void> {
    await deleteForm(this.deps, { tenantId, formId: id });
  }

  /**
   * The count travels with every form, not only with the list: the form
   * editor labels its Submissions tab with it, and after a save it keeps
   * the PATCH response as the form it shows.
   */
  private async submissionCountOf(
    tenantId: string,
    form: Form,
  ): Promise<number> {
    const counts = await countFormSubmissions(this.deps, {
      tenantId,
      formIds: [form.id],
    });
    return counts[form.id] ?? 0;
  }

  /**
   * Whitelisted field by field, never a raw form.toProps() (security review
   * 2026-08-24): there is no sensitive field on Form today, but without a
   * whitelist a future one would be exposed automatically, with nobody
   * here noticing.
   */
  private toDto(form: Form, submissionCount: number): FormRecord {
    const props = form.toProps();
    return formRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      name: props.name,
      fields: props.fields,
      steps: props.steps,
      notificationEmails: props.notificationEmails,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
      submissionCount,
    });
  }
}
