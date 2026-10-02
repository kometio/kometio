import { describe, expect, it } from 'vitest';
import { Form } from './form';

describe('Form entity', () => {
  it('create starts with no fields, no steps, and no notification email', () => {
    const form = Form.create({
      id: 'form-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      name: 'Contattaci',
    });

    expect(form.name).toBe('Contattaci');
    expect(form.fields).toEqual([]);
    expect(form.steps).toEqual([]);
    expect(form.notificationEmails).toEqual([]);
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = {
      id: 'form-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      name: 'Contattaci',
      fields: [
        {
          id: 'f1',
          label: 'Nome',
          type: 'text' as const,
          required: true,
          stepId: 'step-1',
        },
      ],
      steps: [{ id: 'step-1', title: 'Dati personali' }],
      notificationEmails: ['info@example.com'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const form = Form.fromProps(props);

    expect(form.toProps()).toEqual(props);
  });

  it('update replaces name, fields, steps, and notification email, bumping updatedAt', () => {
    const form = Form.create({
      id: 'form-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      name: 'Contattaci',
      now: new Date('2026-01-01T00:00:00Z'),
    });

    form.update(
      {
        name: 'Richiedi preventivo',
        fields: [{ id: 'f1', label: 'Email', type: 'email', required: true }],
        steps: [{ id: 'step-1', title: 'Contatti' }],
        notificationEmails: ['preventivi@example.com'],
      },
      new Date('2026-01-02T00:00:00Z'),
    );

    expect(form.name).toBe('Richiedi preventivo');
    expect(form.fields).toEqual([
      { id: 'f1', label: 'Email', type: 'email', required: true },
    ]);
    expect(form.steps).toEqual([{ id: 'step-1', title: 'Contatti' }]);
    expect(form.notificationEmails).toEqual(['preventivi@example.com']);
    expect(form.updatedAt).toEqual(new Date('2026-01-02T00:00:00Z'));
  });

  it('keeps one of each notification address, trimmed, whatever its capitals', () => {
    const form = Form.create({
      id: 'form-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      name: 'Contatti',
    });

    form.update({
      name: 'Contatti',
      fields: [],
      steps: [],
      notificationEmails: [
        ' Owner@example.com',
        'owner@example.com',
        '',
        'sales@example.com',
      ],
    });

    expect(form.notificationEmails).toEqual([
      'Owner@example.com',
      'sales@example.com',
    ]);
  });

  describe('duplicate', () => {
    function original() {
      const form = Form.create({
        id: 'form-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        name: 'Contattaci',
        now: new Date('2026-01-01T00:00:00Z'),
      });
      form.update({
        name: 'Contattaci',
        fields: [{ id: 'f1', label: 'Email', type: 'email', required: true }],
        steps: [{ id: 'step-1', title: 'Contatti' }],
        notificationEmails: ['preventivi@example.com'],
      });
      return form;
    }

    it('has the same site, fields, steps and notification addresses under its own id and name', () => {
      const copy = original().duplicate({
        id: 'form-2',
        name: 'Copia di Contattaci',
        now: new Date('2026-02-01T00:00:00Z'),
      });

      expect(copy.id).toBe('form-2');
      expect(copy.name).toBe('Copia di Contattaci');
      expect(copy.tenantId).toBe('tenant-1');
      expect(copy.siteId).toBe('site-1');
      expect(copy.fields).toEqual(original().fields);
      expect(copy.steps).toEqual([{ id: 'step-1', title: 'Contatti' }]);
      expect(copy.notificationEmails).toEqual(['preventivi@example.com']);
      expect(copy.createdAt).toEqual(new Date('2026-02-01T00:00:00Z'));
      expect(copy.updatedAt).toEqual(new Date('2026-02-01T00:00:00Z'));
    });

    it('shares nothing with the original: a field changed in the copy is not changed in it', () => {
      const form = original();
      const copy = form.duplicate({ id: 'form-2', name: 'Copia' });

      const [copiedField] = copy.fields;
      if (!copiedField) throw new Error('the copy has no field');
      copiedField.label = 'Changed in the copy';
      copy.steps.push({ id: 'step-2', title: 'Only in the copy' });
      copy.notificationEmails.push('only-the-copy@example.com');

      expect(form.fields[0]?.label).toBe('Email');
      expect(form.steps).toEqual([{ id: 'step-1', title: 'Contatti' }]);
      expect(form.notificationEmails).toEqual(['preventivi@example.com']);
    });
  });
});
