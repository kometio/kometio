import { Module } from '@nestjs/common';
import type {
  AttachmentStoragePort,
  ExpiredRecordsPort,
  FormSubmissionRepositoryPort,
} from '@kometio/ports';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  ATTACHMENT_STORAGE,
  EXPIRED_RECORDS,
  FORM_SUBMISSION_REPOSITORY,
} from '../adapters/port.tokens';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import {
  DEPLOYMENT_TENANT_RESOLVER,
  type DeploymentTenantResolver,
} from '../deployment-tenant.resolver';
import { ExpiredTokensCleanupService } from './expired-tokens-cleanup.service';
import { FormAttachmentsSweepService } from './form-attachments-sweep.service';
import { FormSubmissionsRetentionCleanupService } from './form-submissions-retention-cleanup.service';

@Module({
  imports: [AdaptersModule, DeploymentTenantModule],
  providers: [
    {
      provide: ExpiredTokensCleanupService,
      useFactory: (
        expiredRecords: ExpiredRecordsPort,
        tenant: DeploymentTenantResolver,
      ) =>
        new ExpiredTokensCleanupService(expiredRecords, () => tenant.resolve()),
      inject: [EXPIRED_RECORDS, DEPLOYMENT_TENANT_RESOLVER],
    },
    {
      provide: FormAttachmentsSweepService,
      useFactory: (
        attachmentStorage: AttachmentStoragePort,
        formSubmissionRepository: FormSubmissionRepositoryPort,
        tenant: DeploymentTenantResolver,
      ) =>
        new FormAttachmentsSweepService(
          { attachmentStorage, formSubmissionRepository },
          () => tenant.resolve(),
        ),
      inject: [
        ATTACHMENT_STORAGE,
        FORM_SUBMISSION_REPOSITORY,
        DEPLOYMENT_TENANT_RESOLVER,
      ],
    },
    {
      provide: FormSubmissionsRetentionCleanupService,
      useFactory: (
        expiredRecords: ExpiredRecordsPort,
        tenant: DeploymentTenantResolver,
      ) =>
        new FormSubmissionsRetentionCleanupService(expiredRecords, () =>
          tenant.resolve(),
        ),
      inject: [EXPIRED_RECORDS, DEPLOYMENT_TENANT_RESOLVER],
    },
  ],
})
export class MaintenanceModule {}
