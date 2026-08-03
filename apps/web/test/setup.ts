import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `vitest.config.ts` sets `globals: false` (this repo prefers explicit imports over global test
// APIs), so @testing-library/react's auto-cleanup — which detects a global `afterEach` — never
// registers on its own. Wire it up explicitly instead.
afterEach(cleanup);
