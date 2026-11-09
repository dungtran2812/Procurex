// Conventional Commits: <type>(<scope>): <subject>
// type: feat | fix | chore | docs | refactor | test | build | ci | perf | style | revert
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Mức 1 = cảnh báo: scope lạ vẫn commit được nhưng bị nhắc.
    'scope-enum': [
      1,
      'always',
      ['repo', 'infra', 'api', 'identity', 'catalog', 'procurement', 'web', 'deps', 'docs', 'ci'],
    ],
  },
};
