// Test-process-only loader registration. No product module or disk input is replaced.
import { register } from 'node:module';

register(new URL('./regression-loader.mjs', import.meta.url));
