import { testApiEnv } from '../../test/api-env.test-fixture';
import { DeploymentController } from './deployment.controller';

describe('DeploymentController (unit)', () => {
  it('says the deployment can send email when it has a mail server', () => {
    expect(new DeploymentController(testApiEnv()).get()).toEqual({
      emailConfigured: true,
    });
  });

  it('says it cannot when SMTP_HOST is not set: its emails go to the log', () => {
    const noMailServer = testApiEnv({
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
      SMTP_FROM_ADDRESS: undefined,
    });

    expect(new DeploymentController(noMailServer).get()).toEqual({
      emailConfigured: false,
    });
  });
});
