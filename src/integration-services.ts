export {};
const vscode = require('vscode');

/**
 * Outbound integrations.
 *
 * Only the webhook is real. The Jira and Confluence methods that used to live
 * here reported "not configured" and nothing else — there was no integration
 * behind them for a user to reach, so they were removed rather than left as
 * menu entries that can only ever decline. The Kotlin plugin's equivalents
 * were deleted for the same reason.
 */
class IntegrationServices { [key: string]: any;
    constructor(context) {
        this.context = context;
    }

    /**
     * Post a message to the configured Slack/Discord webhook.
     * Returns true only when the webhook actually accepted it.
     */
    async notifyWebhook(message) {
        const webhookUrl = vscode.workspace.getConfiguration('vestige').get('collabWebhookUrl');
        if (!webhookUrl) {
            const action = await vscode.window.showWarningMessage(
                'No team webhook is configured, so nothing was shared.',
                'Configure'
            );
            if (action === 'Configure') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'vestige.collabWebhookUrl');
            }
            return false;
        }

        try {
            const response = await fetch(String(webhookUrl), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: message }),
            });

            if (!response.ok) {
                vscode.window.showErrorMessage(`Webhook rejected the message (status ${response.status}).`);
                return false;
            }

            vscode.window.showInformationMessage('Shared to your team channel.');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Could not reach the webhook: ${error.message}`);
            return false;
        }
    }
}

module.exports = IntegrationServices;
