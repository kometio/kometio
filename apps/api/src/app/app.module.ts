import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DeploymentModule } from './deployment/deployment.module';
import { DeploymentTenantModule } from './deployment-tenant.module';
import { FormsModule } from './forms/forms.module';
import { ImportsModule } from './imports/imports.module';
import { HealthModule } from './health/health.module';
import { SetupModule } from './setup/setup.module';
import { LegalDocumentsModule } from './legal-documents/legal-documents.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { MediaModule } from './media/media.module';
import { PagesModule } from './pages/pages.module';
import { PublicFormsModule } from './public-forms/public-forms.module';
import { PublicNewsletterModule } from './public-newsletter/public-newsletter.module';
import { PublicPagesModule } from './public-pages/public-pages.module';
import { ReusableSectionsModule } from './reusable-sections/reusable-sections.module';
import { CollectionsModule } from './collections/collections.module';
import { TaxonomiesModule } from './taxonomies/taxonomies.module';
import { SiteLayoutSectionsModule } from './site-layout-sections/site-layout-sections.module';
import { SitesModule } from './sites/sites.module';
import { PageGenerationModule } from './page-generation/page-generation.module';
import { ThemesModule } from './themes/themes.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    DeploymentTenantModule,
    SetupModule,
    ScheduleModule.forRoot(),
    AuthModule,
    AccountModule,
    DashboardModule,
    DeploymentModule,
    HealthModule,
    MaintenanceModule,
    PagesModule,
    LegalDocumentsModule,
    PublicPagesModule,
    MediaModule,
    SitesModule,
    ThemesModule,
    PageGenerationModule,
    FormsModule,
    ImportsModule,
    PublicFormsModule,
    PublicNewsletterModule,
    ReusableSectionsModule,
    CollectionsModule,
    TaxonomiesModule,
    SiteLayoutSectionsModule,
    UsersModule,
  ],
})
export class AppModule {}
