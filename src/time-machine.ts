export {};
const { execFile } = require('child_process');

class TimeMachineManager { [key: string]: any;
    /**
     * Retrieve a file's historical state and "run" it virtually.
     *
     * Security note: this deliberately does NOT execute the historical code.
     * Running arbitrary code from a repo's history (e.g. a cloned repo) with
     * the user's privileges is remote code execution by design — instead we
     * fetch the content safely with `git show` and present it for inspection.
     */
    async runVirtual(repoPath, filePath, commitHash) {
        const content = await this.getHistoricalContent(repoPath, filePath, commitHash);
        return content || '(empty file at this commit)';
    }

    /** Safely fetch a file's content at a commit — no shell interpolation, no execution. */
    getHistoricalContent(repoPath, filePath, commitHash): Promise<string> {
        return new Promise((resolve, reject) => {
            const path = require('path');
            const relativePath = path.relative(repoPath, filePath);

            if (!/^[0-9a-f]{4,40}$/i.test(String(commitHash))) {
                reject(new Error('Invalid commit hash'));
                return;
            }

            execFile('git', ['show', `${commitHash}:${relativePath}`],
                { cwd: repoPath, maxBuffer: 1024 * 1024 * 10 },
                (err, stdout, stderr) => {
                    if (err) {
                        reject(new Error(`Failed to extract historical code: ${stderr || err.message}`));
                        return;
                    }
                    resolve(stdout);
                });
        });
    }
}

module.exports = TimeMachineManager;
