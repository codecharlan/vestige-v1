export {};
const { parentPort } = require('worker_threads');

function parseBlame(blameOutput) {
    const lines = [];
    const blameLines = blameOutput.split('\n');
    let currentLine: any = {};

    for (const line of blameLines) {
        if (line.match(/^[0-9a-f]{40}/)) {
            const hash = line.split(' ')[0];
            currentLine = {
                hash: hash,
                lineNo: parseInt(line.split(' ')[2]),
                isUncommitted: hash === '0000000000000000000000000000000000000000'
            };
        } else if (line.startsWith('author ')) {
            currentLine.author = line.substring(7);
        } else if (line.startsWith('author-time ')) {
            currentLine.date = new Date(parseInt(line.substring(12)) * 1000);
        } else if (line.startsWith('summary ')) {
            currentLine.summary = line.substring(8);
        } else if (line.startsWith('\t')) {
            currentLine.content = line.substring(1);
            // Handle uncommitted changes
            if (currentLine.isUncommitted) {
                currentLine.author = 'You (Uncommitted)';
                currentLine.date = new Date(); // Now
                currentLine.summary = 'Uncommitted changes';
            }
            lines.push(currentLine);
        }
    }
    return lines;
}

parentPort.on('message', (message) => {
    try {
        if (message.type === 'parseBlame') {
            const result = parseBlame(message.blameOutput);
            parentPort.postMessage({ id: message.id, result });
        } else {
            parentPort.postMessage({ id: message.id, error: `Unknown task: ${message.type}` });
        }
    } catch (error) {
        parentPort.postMessage({ id: message.id, error: error.message });
    }
});
