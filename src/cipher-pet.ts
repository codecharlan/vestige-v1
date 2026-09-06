export {};
const vscode = require('vscode');

class CipherPetManager { [key: string]: any;
    constructor(context) {
        this.context = context;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'vestige.showPetDetails';
        this.reputation = 0;
        this.level = 1;
        this.states = ['🥚', '🐣', '🐥', '🦉', '🐉', '👑'];
        this.idleTimer = null;
        this.isDisposed = false;
        this.messages = [
            "Ready for some archaeology?",
            "I smell some fossil code nearby...",
            "Your Lore contributions make me strong!",
            "Refactoring is like snacks for me.",
            "I'm keeping an eye on those interest rates."
        ];
    }

    initialize() {
        // Restore persisted progress
        const saved = this.context?.globalState?.get('vestige.cipherPet');
        if (saved) {
            this.reputation = saved.reputation || 0;
            this.level = Math.min(this.states.length - 1, saved.level || 0);
        }

        this.update();
        this.statusBarItem.show();

        // Idle animation
        this.idleTimer = setInterval(() => {
            if (Math.random() > 0.7) {
                this.bounce();
            }
        }, 5000);
    }

    updateReputation(points) {
        this.reputation += points;
        this.level = Math.min(this.states.length - 1, Math.floor(this.reputation / 100));
        this._persist();
        this.update();
    }

    update() {
        if (this.isDisposed) return;
        const pet = this.states[this.level];
        this.statusBarItem.text = `${pet} Cipher (Lvl ${this.level + 1})`;
        this.statusBarItem.tooltip = `Cipher is happy! \nReputation: ${this.reputation} \n"${this.getRandomMessage()}"`;
    }

    bounce() {
        if (this.isDisposed) return;
        const pet = this.states[this.level];
        this.statusBarItem.text = `✨ ${pet} ✨`;
        setTimeout(() => {
            if (this.isDisposed) return;
            this.update();
        }, 1000);
    }

    getRandomMessage() {
        return this.messages[Math.floor(Math.random() * this.messages.length)];
    }

    showDetails() {
        const pet = this.states[this.level];
        vscode.window.showInformationMessage(`${pet} Cipher: "Thanks for taking care of the code! Let's clean some more fossils today."`);
    }

    _persist() {
        this.context?.globalState?.update('vestige.cipherPet', {
            reputation: this.reputation,
            level: this.level
        });
    }

    dispose() {
        this.isDisposed = true;
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = null;
        }
        this.statusBarItem.dispose();
    }
}

module.exports = CipherPetManager;
