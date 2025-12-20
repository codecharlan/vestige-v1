const vscode = require('vscode');

class CipherPetManager {
    constructor(context) {
        this.context = context;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'vestige.showPetDetails';
        this.reputation = 0;
        this.level = 1;
        this.states = ['🥚', '🐣', '🐥', '🦉', '🐉', '👑'];
        this.messages = [
            "Ready for some archaeology?",
            "I smell some fossil code nearby...",
            "Your Lore contributions make me strong!",
            "Refactoring is like snacks for me.",
            "I'm keeping an eye on those interest rates."
        ];
    }

    initialize() {
        this.update();
        this.statusBarItem.show();

        // Idle animation
        setInterval(() => {
            if (Math.random() > 0.7) {
                this.bounce();
            }
        }, 5000);
    }

    updateReputation(points) {
        this.reputation += points;
        this.level = Math.min(this.states.length - 1, Math.floor(this.reputation / 100));
        this.update();
    }

    update() {
        const pet = this.states[this.level];
        this.statusBarItem.text = `${pet} Cipher (Lvl ${this.level + 1})`;
        this.statusBarItem.tooltip = `Cipher is happy! \nReputation: ${this.reputation} \n"${this.getRandomMessage()}"`;
    }

    bounce() {
        const pet = this.states[this.level];
        this.statusBarItem.text = `✨ ${pet} ✨`;
        setTimeout(() => this.update(), 1000);
    }

    getRandomMessage() {
        return this.messages[Math.floor(Math.random() * this.messages.length)];
    }

    showDetails() {
        const pet = this.states[this.level];
        vscode.window.showInformationMessage(`${pet} Cipher: "Thanks for taking care of the code! Let's clean some more fossils today."`);
    }
}

module.exports = CipherPetManager;
