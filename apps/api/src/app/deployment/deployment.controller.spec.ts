import { testApiEnv } from '../../test/api-env.test-fixture';
import { DeploymentController } from './deployment.controller';

describe('DeploymentController (unit)', () => {
  it('says the deployment can send email when it has a mail server', () => {
    expect(new DeploymentController(testApiEnv()).get()).toEqual({
      emailConfigured: true,
      siteArchive: false,
      demo: false,
    });
  });

  it('says no email goes out in a demo, though it has a mail server: it writes them to the log', () => {
    const demo = testApiEnv({ KOMETIO_DEMO: 'true' });

    expect(new DeploymentController(demo).get()).toMatchObject({
      emailConfigured: false,
      demo: true,
    });
  });

  it('says it is a demo only when KOMETIO_DEMO says `true`', () => {
    const demo = (value: 'true' | 'false' | undefined) =>
      new DeploymentController(testApiEnv({ KOMETIO_DEMO: value })).get().demo;

    expect(demo('true')).toBe(true);
    expect(demo('false')).toBe(false);
    expect(demo(undefined)).toBe(false);
  });

  it('says the site can be exported when the launcher of the single image is there to make the archive', () => {
    const singleImage = testApiEnv({
      KOMETIO_CONTROL_SOCKET: '/run/kometio/control.sock',
    });

    expect(new DeploymentController(singleImage).get().siteArchive).toBe(true);
  });

  it('says it cannot when SMTP_HOST is not set: its emails go to the log', () => {
    const noMailServer = testApiEnv({
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
      SMTP_FROM_ADDRESS: undefined,
    });

    expect(new DeploymentController(noMailServer).get()).toEqual({
      emailConfigured: false,
      siteArchive: false,
      demo: false,
    });
  });
});
