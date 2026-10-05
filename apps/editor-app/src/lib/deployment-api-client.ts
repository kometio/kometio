import {
  deploymentRecordSchema,
  type DeploymentRecord,
} from '@kometio/api-contracts';
import { request } from './http-client';

/** What the server can do (docs/adr/0103): today, whether it can send email. */
export async function getDeployment(): Promise<DeploymentRecord> {
  return deploymentRecordSchema.parse(await request('/deployment'));
}
