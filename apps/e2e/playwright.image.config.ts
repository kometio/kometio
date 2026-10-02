import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The same suite, against a stack that is ALREADY running (the single image)
 * and which Playwright must never start by itself: without `webServer`, a
 * server that is down is a failed run, not a second API started from a
 * build and pointed at whatever database the root .env names.
 */
export default defineConfig({ ...base, webServer: undefined });
