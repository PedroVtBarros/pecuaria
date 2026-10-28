import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'nutrition-engine',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
