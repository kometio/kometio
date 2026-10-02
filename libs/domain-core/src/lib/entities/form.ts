import type { FormField, FormStep } from '@kometio/shared-types';

export interface FormProps {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  fields: FormField[];
  // Empty by default — a plain single-step form, the shape every form had
  // before this field existed (docs/adr/0015's multi-step follow-up).
  steps: FormStep[];
  /** Who is emailed each submission — none, one, or a team (at most MAX_NOTIFICATION_EMAILS). */
  notificationEmails: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFormProps {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  now?: Date;
}

/** Enough for a team inbox and its deputies; a longer list is a mailing list, and belongs in one. */
export const MAX_NOTIFICATION_EMAILS = 10;

/** The same inbox typed twice, or once in capitals, is still one inbox — and one email. */
function uniqueAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of addresses) {
    const address = raw.trim();
    const key = address.toLowerCase();
    if (address === '' || seen.has(key)) continue;
    seen.add(key);
    unique.push(address);
  }
  return unique;
}

/**
 * A pure entity: no dependency on Postgres, Express or Puck (see
 * docs/adr/0015). `fields` is the single source of truth both for how the
 * module renders publicly and for how a submission is validated — there is
 * no separate format for the editor, the rendering and the validation.
 */
export class Form {
  private constructor(private props: FormProps) {}

  static create(input: CreateFormProps): Form {
    const now = input.now ?? new Date();
    return new Form({
      id: input.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      name: input.name,
      fields: [],
      steps: [],
      notificationEmails: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromProps(props: FormProps): Form {
    return new Form({ ...props });
  }

  toProps(): FormProps {
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

  get name(): string {
    return this.props.name;
  }

  get fields(): FormField[] {
    return this.props.fields;
  }

  get steps(): FormStep[] {
    return this.props.steps;
  }

  get notificationEmails(): string[] {
    return this.props.notificationEmails;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * A new form with this one's fields, steps and notification addresses,
   * under its own id and name. Nothing that was submitted comes along: a
   * copy starts with no answers, however many the original has.
   *
   * Field ids are the same in both, which is right: they are only ever
   * read inside the form that has them (a submission's payload is keyed by
   * them against its own form's fields).
   */
  duplicate(input: { id: string; name: string; now?: Date }): Form {
    const now = input.now ?? new Date();
    return new Form({
      ...structuredClone(this.props),
      id: input.id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    });
  }

  update(
    input: {
      name: string;
      fields: FormField[];
      steps: FormStep[];
      notificationEmails: string[];
    },
    now: Date = new Date(),
  ): void {
    this.props.name = input.name;
    this.props.fields = input.fields;
    this.props.steps = input.steps;
    this.props.notificationEmails = uniqueAddresses(input.notificationEmails);
    this.props.updatedAt = now;
  }
}
