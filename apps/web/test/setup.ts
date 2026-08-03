import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `vitest.config.ts` sets `globals: false` (this repo prefers explicit imports over global test
// APIs), so @testing-library/react's auto-cleanup — which detects a global `afterEach` — never
// registers on its own. Wire it up explicitly instead.
afterEach(cleanup);

// CI runs all three workspaces concurrently on a two-core runner, where the
// 1s default for waitFor/findBy* leaves no headroom under contention — the
// ImageUploader sample-load assertions timed out there while passing locally.
// The work being awaited is two microtasks, so a longer ceiling cannot mask a
// real regression; it only stops scheduler jitter failing the build.
configure({ asyncUtilTimeout: 5_000 });
