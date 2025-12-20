const vscode = require('vscode');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class TimeMachineManager {
    /**
     * God-Tier: Execute a file's historical state virtually.
     */
    async runVirtual(repoPath, filePath, commitHash) {
        return new Promise((resolve, reject) => {
            const fileName = path.basename(filePath);
            const tempDir = path.join(os.tmpdir(), `vestige-tm-${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });
            const tempPath = path.join(tempDir, fileName);

            // 1. Extract file at commit
            const gitCmd = `git show ${commitHash}:"${path.relative(repoPath, filePath)}"`;

            exec(gitCmd, { cwd: repoPath }, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(`Failed to extract historical code: ${stderr}`));
                    return;
                }

                // 2. Write to temp file
                fs.writeFileSync(tempPath, stdout);

                // 3. Execute (Simulation for generic files, real Node execution for .js)
                const isJS = fileName.endsWith('.js');
                const runCmd = isJS ? `node "${tempPath}"` : `cat "${tempPath}"`;

                exec(runCmd, { timeout: 5000 }, (runErr, runStat, runErrOutput) => {
                    // Cleanup
                    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }

                    if (runErr && isJS) {
                        resolve(`Execution Error: ${runErr.message}\n\n${runErrOutput}`);
                    } else {
                        resolve(runStat || "Success (Virtual Execution Complete)");
                    }
                });
            });
        });
    }
}

module.exports = TimeMachineManager;
