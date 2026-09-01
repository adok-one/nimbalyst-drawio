/**
 * Testing Library registers its own `afterEach` cleanup only when Vitest runs with globals,
 * and this suite does not. Without it every `render` stays in `document.body` for the rest of
 * the file, and a query that should find one element finds three -- or finds the previous
 * test's element and passes for the wrong reason.
 */
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
