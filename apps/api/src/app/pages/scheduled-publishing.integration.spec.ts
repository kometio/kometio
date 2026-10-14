import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { PageTranslationRepositoryPort } from '@kometio/ports';
import { PAGE_TRANSLATION_REPOSITORY } from '../adapters/port.tokens';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { PagesModule } from './pages.module';
import { ScheduledPublishService } from './scheduled-publish.service';

/**
 * Publishing at a moment (docs/adr/0135), over HTTP against a real Postgres:
 * what the editor asks, what is written, and what a tick of the API does with
 * it. The tick is asked directly (`publishDue`): the timer is Nest's, and
 * what is being tested is what it runs.
 */
describe('publishing at a moment (integration)', () => {
  let integration: IntegrationApp;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({ imports: [PagesModule] });
    siteId = await integration.createSite({
      defaultLocale: 'it',
      enabledLocales: ['it'],
    });
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  async function aDraft() {
    const group = await agent
      .post('/page-groups')
      .send({
        siteId,
        content: [{ id: 'b1', type: 'Text', props: { body: 'prima' } }],
      })
      .expect(201);
    const translation = await agent
      .post(`/page-groups/${group.body.id}/translations`)
      .send({
        locale: 'it',
        slug: `novita-${randomUUID()}`,
        seoMeta: { title: 'Novità', description: '' },
      })
      .expect(201);
    return {
      groupId: group.body.id as string,
      id: translation.body.id as string,
    };
  }

  const inAMinute = (minutes: number) =>
    new Date(Date.now() + minutes * 60_000).toISOString();

  it('schedules, shows what it is, and takes it back', async () => {
    const { id } = await aDraft();
    const publishAt = inAMinute(90);

    const scheduled = await agent
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt })
      .expect(200);
    expect(scheduled.body.scheduledPublishAt).toBe(publishAt);
    expect(scheduled.body.scheduleFailure).toBeNull();
    expect(scheduled.body.status).toBe('draft');

    const cancelled = await agent
      .delete(`/page-groups/translations/${id}/schedule`)
      .expect(200);
    expect(cancelled.body.scheduledPublishAt).toBeNull();
  });

  it('refuses a moment that is not ahead, and a value that is not an instant', async () => {
    const { id } = await aDraft();

    await agent
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(400);
    await agent
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt: 'domani mattina' })
      .expect(400);
  });

  it('is a publisher’s: a role that can only save a draft cannot schedule', async () => {
    const { id } = await aDraft();
    const author = await integration.login(
      await integration.createUser({ role: 'editor' }),
    );

    await author
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt: inAMinute(90) })
      .expect(403);
  });

  it('is published by a tick once its moment has come, as the person who set it, with the draft as it is then', async () => {
    const { groupId, id } = await aDraft();
    await agent
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt: inAMinute(10) })
      .expect(200);
    // The draft changes after it was scheduled: the tick must publish this.
    await agent
      .patch(`/page-groups/${groupId}/content`)
      .send({
        content: [{ id: 'b1', type: 'Text', props: { body: 'dopo' } }],
      })
      .expect(200);
    const service = integration.app.get(ScheduledPublishService);

    // Before its time: nothing happens.
    await service.publishDue(integration.tenantId);
    const before = await agent
      .get(`/page-groups/${groupId}/translations`)
      .expect(200);
    expect(before.body[0].status).toBe('draft');

    await service.publishDue(
      integration.tenantId,
      new Date(Date.now() + 11 * 60_000),
    );

    const after = await agent
      .get(`/page-groups/${groupId}/translations`)
      .expect(200);
    expect(after.body[0].status).toBe('published');
    expect(after.body[0].scheduledPublishAt).toBeNull();
    // The text is what the sanitiser makes of it, as for a publication by hand.
    expect(after.body[0].publishedSnapshot).toEqual([
      { id: 'b1', type: 'Text', props: { body: '<p>dopo</p>' } },
    ]);
  });

  it('forgets the schedule when a person publishes by hand first', async () => {
    const { id } = await aDraft();
    await agent
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt: inAMinute(90) })
      .expect(200);

    const published = await agent
      .post(`/page-groups/translations/${id}/publish`)
      .expect(201);

    expect(published.body.scheduledPublishAt).toBeNull();
  });

  it('shows why an attempt did not happen, keeps it scheduled, and forgets the reason once it is scheduled again', async () => {
    const { groupId, id } = await aDraft();
    const publishAt = inAMinute(90);
    await agent
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt })
      .expect(200);
    const repository = integration.app.get<PageTranslationRepositoryPort>(
      PAGE_TRANSLATION_REPOSITORY,
    );
    const translation = await repository.findById(integration.tenantId, id);
    translation?.recordScheduleFailure('the search index did not answer');
    if (translation) await repository.saveSchedule(translation);

    const failed = await agent
      .get(`/page-groups/${groupId}/translations`)
      .expect(200);
    expect(failed.body[0].scheduledPublishAt).toBe(publishAt);
    expect(failed.body[0].scheduleFailure).toBe(
      'the search index did not answer',
    );

    const again = await agent
      .put(`/page-groups/translations/${id}/schedule`)
      .send({ publishAt: inAMinute(120) })
      .expect(200);
    expect(again.body.scheduleFailure).toBeNull();
  });
});
