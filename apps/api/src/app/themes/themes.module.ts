import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import { THEME_CATALOG, THEME_UPLOADS } from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { ThemeUploadsController } from './theme-uploads.controller';
import type { ThemesDeps } from './themes.deps';
import { THEMES_DEPS } from './themes.tokens';

@Module({
  imports: [
    AdaptersModule,
    AuthModule,
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 5 }] }),
  ],
  controllers: [ThemeUploadsController],
  providers: [
    moduleDeps<ThemesDeps>(THEMES_DEPS, {
      themeUploads: THEME_UPLOADS,
      themeCatalog: THEME_CATALOG,
    }),
  ],
})
export class ThemesModule {}
