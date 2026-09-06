const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Integration tests against REAL git repositories.
 *
 * The unit suite stubs `simple-git` to return empty strings, which means it
 * cannot tell a correct git invocation from an incorrect one — a query with
 * the wrong flags looks identical to a repository with no history. That gap
 * hid a real defect: `getCoupledFiles` used `git log --name-only -- <path>`,
 * but supplying a pathspec makes --name-only list only the names matching
 * that pathspec, so the one file it returned was the file itself, which was
 * then filtered out as self-coupling. Co-change analysis returned nothing for
 * every file in every repository, and every unit test still passed.
 *
 * These tests build small repositories with a known answer and assert the
 * value, not just the shape.
 */
suite('Git Behaviour Integration Suite', function () {
    // Spawning git is slower than a mocked call.
    this.timeout(30000);

    let GitAnalyzer;
    let analyzer;
    let repo;

    const git = (cwd, cmd) => execSync(cmd, { cwd, stdio: 'pipe' });

    suiteSetup(() => {
        GitAnalyzer = require('../../dist/git-analyzer');
        analyzer = new GitAnalyzer();

        // auth.ts and auth.test.ts change together in 5 of auth.ts's 7 commits.
        repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vestige-it-'));
        git(repo, 'git init -q');
        git(repo, 'git config user.email dev@example.com');
        git(repo, 'git config user.name "Dana Dev"');

        fs.writeFileSync(path.join(repo, 'README.md'), '# project\n');
        git(repo, 'git add -A');
        git(repo, 'git commit -qm initial');

        for (let i = 1; i <= 5; i++) {
            fs.writeFileSync(path.join(repo, 'auth.ts'), `export function auth() { return ${i}; }\n`);
            fs.writeFileSync(path.join(repo, 'auth.test.ts'), `expect(auth()).toBe(${i});\n`);
            git(repo, 'git add -A');
            git(repo, `git commit -qm "auth change ${i}"`);
        }
        for (let i = 6; i <= 7; i++) {
            fs.writeFileSync(path.join(repo, 'auth.ts'), `export function auth() { return ${i}; }\n`);
            git(repo, 'git add -A');
            git(repo, `git commit -qm "auth only ${i}"`);
        }
    });

    suiteTeardown(() => {
        if (repo) fs.rmSync(repo, { recursive: true, force: true });
    });

    const authFile = () => path.join(repo, 'auth.ts');

    test('co-change finds the partner file with an exact shared-commit count', async () => {
        const coupled = await analyzer.getCoupledFiles(repo, authFile());

        assert.ok(coupled.length > 0, 'co-change must return partners for a file that has them');
        const top = coupled[0];
        assert.strictEqual(top.file, 'auth.test.ts');
        assert.strictEqual(top.count, 5, 'five commits touched both files');
        assert.strictEqual(top.frequency, 71, '5 of 7 commits, rounded');
    });

    test('co-change does not report unrelated or self files', async () => {
        const coupled = await analyzer.getCoupledFiles(repo, authFile());
        assert.ok(!coupled.some(c => c.file === 'auth.ts'), 'a file is not coupled to itself');
        assert.ok(!coupled.some(c => c.file === 'README.md'), 'README never changed with auth.ts');
    });

    test('collaborators are people, not file paths', async () => {
        const people = await analyzer.findFrequentCollaborators(repo, authFile());
        assert.ok(Array.isArray(people));
        if (people.length) {
            assert.strictEqual(people[0].name, 'Dana Dev');
            assert.ok(!people[0].name.includes('.ts'), 'must not be a path');
        }
    });

    test('line history returns real revisions, newest first', async () => {
        const chain = await analyzer.getLineageChain(repo, authFile(), 1, 1);

        assert.ok(chain.length > 0, 'the line has been changed repeatedly');
        const newest = chain[0];
        assert.ok(/^[0-9a-f]{40}$/.test(newest.hash), 'full hash');
        assert.strictEqual(newest.author, 'Dana Dev');
        assert.ok(newest.date instanceof Date && !isNaN(newest.date), 'date parsed');
        assert.ok(!newest.message.includes('\n'), 'subject is a single line');
        assert.strictEqual(newest.message, 'auth only 7', 'newest revision first');
    });

    test('line history explains an untraceable path instead of reporting no history', async () => {
        await assert.rejects(
            () => analyzer.getLineageChain(repo, path.join(repo, 'never-existed.ts'), 1, 1),
            /no record|not yet committed/i
        );
    });

    test('technical debt is produced with its inputs and without money', async () => {
        const debt = await analyzer.calculateTechnicalDebt(repo, authFile());
        assert.ok(debt, 'a tracked file yields a debt result');
        assert.ok(!('cost' in debt), 'no monetary field may exist');
        assert.ok(Number.isFinite(debt.score));
        ['churn', 'complexity', 'age'].forEach(k =>
            assert.ok(k in debt, `inputs must be visible: missing ${k}`));
    });

    test('CODEOWNERS audit flags a stale owner without flagging the real author', async () => {
        assert.strictEqual(await analyzer.auditCodeowners(repo), null, 'no file yet');

        fs.mkdirSync(path.join(repo, '.github'), { recursive: true });
        fs.writeFileSync(path.join(repo, '.github', 'CODEOWNERS'),
            '# owners\n' +
            '*.ts @ghost-who-never-committed\n' +
            '!negated @someone\n' +
            'badline-no-owner\n' +
            '*.md @dana\n');
        git(repo, 'git add -A');
        git(repo, 'git commit -qm codeowners');

        const audit = await analyzer.auditCodeowners(repo);
        assert.ok(audit, 'the file must be found');

        assert.ok(audit.malformed.some(m => /negation/.test(m.reason)),
            'CODEOWNERS does not support "!" negation');
        assert.ok(audit.malformed.some(m => /no owner/.test(m.reason)));

        const ghost = audit.findings.find(f => f.owner === '@ghost-who-never-committed');
        assert.ok(ghost, 'an owner with no commits must be reported');
        assert.strictEqual(ghost.type, 'never-contributed');

        // The matcher must be fuzzy enough to tie @dana to "Dana Dev", but not
        // so fuzzy that a one-character identity matches everything — an
        // earlier version matched any shared substring and so flagged nobody.
        assert.ok(!audit.findings.some(f => f.owner === '@dana'),
            '@dana corresponds to the real author and must not be flagged');
    });
});
