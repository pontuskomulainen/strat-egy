import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
// @ts-expect-error eslint.config.js has no declaration file; the import below is
// cast to Linter.Config[] on the next line.
import eslintConfigDefault from '../eslint.config.js';

const eslintConfig = eslintConfigDefault as Linter.Config[];

// The fixture lives in tests/fixtures/ (outside src/sim/**) so that `npm run lint`
// never flags it when run normally over the repo. To exercise the src/sim/**-scoped
// determinism rules, this test pulls that config block's exact rule options straight
// out of eslint.config.js — no duplication — and verifies the fixture against them
// directly, sidestepping the typed parser's requirement that linted files be real,
// on-disk members of the tsconfig project.
const fixturePath = path.join(process.cwd(), 'tests/fixtures/sim-determinism-violations.ts');

const simRulesConfig = eslintConfig.find(
  (config) => Array.isArray(config.files) && config.files.includes('src/sim/**/*.ts'),
);

if (!simRulesConfig?.rules) {
  throw new Error('eslint.config.js no longer has a src/sim/**-scoped rules block');
}
const simRules = simRulesConfig.rules;

const bannedGlobals = ['Date', 'performance', 'setTimeout', 'setInterval', 'crypto'];
const bannedMathProperties = ['random', 'sin', 'cos', 'tan', 'pow', 'exp', 'log'];

describe('determinism ESLint rules for src/sim/**', () => {
  it('reports every banned global and Math property in the fixture', () => {
    const linter = new Linter();
    const code = readFileSync(fixturePath, 'utf8');

    const messages = linter.verify(code, {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: simRules,
    });

    for (const name of bannedGlobals) {
      const hit = messages.find(
        (m) => m.ruleId === 'no-restricted-globals' && m.message.includes(name),
      );
      expect(hit, `expected no-restricted-globals to report ${name}`).toBeDefined();
    }

    for (const property of bannedMathProperties) {
      const hit = messages.find(
        (m) => m.ruleId === 'no-restricted-properties' && m.message.includes(`Math.${property}`),
      );
      expect(hit, `expected no-restricted-properties to report Math.${property}`).toBeDefined();
    }

    const restrictedGlobalHits = messages.filter((m) => m.ruleId === 'no-restricted-globals');
    const restrictedPropertyHits = messages.filter((m) => m.ruleId === 'no-restricted-properties');
    expect(restrictedGlobalHits).toHaveLength(bannedGlobals.length);
    expect(restrictedPropertyHits).toHaveLength(bannedMathProperties.length);
  });

  it('leaves the fixture unflagged when linted outside src/sim/**', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint();
    const code = readFileSync(fixturePath, 'utf8');
    const [result] = await eslint.lintText(code, { filePath: fixturePath });

    const messages = result.messages.filter(
      (m) => m.ruleId === 'no-restricted-globals' || m.ruleId === 'no-restricted-properties',
    );
    expect(messages).toHaveLength(0);
  });
});
