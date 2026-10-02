export interface FormSubmissionProps {
  id: string;
  tenantId: string;
  siteId: string;
  pageId: string | null;
  // Nullable, onDelete: set null (docs/adr/0015) — deleting a form must
  // never destroy the historical record that someone submitted it.
  formId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export class FormSubmission {
  private constructor(private props: FormSubmissionProps) {}

  static create(
    input: Omit<FormSubmissionProps, 'createdAt'> & { now?: Date },
  ): FormSubmission {
    const { now, ...rest } = input;
    return new FormSubmission({ ...rest, createdAt: now ?? new Date() });
  }

  static fromProps(props: FormSubmissionProps): FormSubmission {
    return new FormSubmission({ ...props });
  }

  toProps(): FormSubmissionProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get siteId(): string {
    return this.props.siteId;
  }

  get pageId(): string | null {
    return this.props.pageId;
  }

  get formId(): string | null {
    return this.props.formId;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
