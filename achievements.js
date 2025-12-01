const vscode = require('vscode');

const ACHIEVEMENTS = {
    FOSSIL_HUNTER: {
        id: 'fossil_hunter',
        name: '🗿 Fossil Hunter',
        description: 'View a file older than 5 years',
        requirement: 1
    },
    TIME_TRAVELER: {
        id: 'time_traveler',
        name: '🎬 Time Traveler',
        description: 'Use the evolution slider 10 times',
        requirement: 10
    },
    GRAVEDIGGER: {
        id: 'gravedigger',
        name: '💀 Gravedigger',
        description: 'View a deleted file in the graveyard',
        requirement: 1
    },
    TEAM_PLAYER: {
        id: 'team_player',
        name: '👥 Team Player',
        description: 'Edit a file with Bus Factor of 1',
        requirement: 1
    },
    DATA_SCIENTIST: {
        id: 'data_scientist',
        name: '📊 Data Scientist',
        description: 'View the dashboard 5 times',
        requirement: 5
    },
    ARCHAEOLOGIST: {
        id: 'archaeologist',
        name: '🏛️ Master Archaeologist',
        description: 'Unlock all achievements',
        requirement: 1
    }
};

class AchievementSystem {
    constructor(context) {
        this.context = context;
        this.storage = context.globalState;
    }

    async trackAction(actionType, value = 1) {
        const stats = this.getStats();
        stats[actionType] = (stats[actionType] || 0) + value;
        await this.storage.update('vestige.achievements', stats);

        // Check for new achievements
        this.checkAchievements(actionType, stats[actionType]);
    }

    getStats() {
        return this.storage.get('vestige.achievements') || {};
    }

    getUnlocked() {
        return this.storage.get('vestige.unlocked') || [];
    }

    async checkAchievements(actionType, count) {
        const unlocked = this.getUnlocked();

        // Map actions to achievements
        const actionMap = {
            'viewOldFile': { achievement: ACHIEVEMENTS.FOSSIL_HUNTER, threshold: 5 * 365 },
            'useEvolution': ACHIEVEMENTS.TIME_TRAVELER,
            'viewGraveyard': ACHIEVEMENTS.GRAVEDIGGER,
            'editBusFactor1': ACHIEVEMENTS.TEAM_PLAYER,
            'viewDashboard': ACHIEVEMENTS.DATA_SCIENTIST
        };

        const mapping = actionMap[actionType];
        if (!mapping) return;

        const achievement = mapping.achievement || mapping;

        if (unlocked.includes(achievement.id)) return;

        // Check if requirement met
        if (count >= achievement.requirement) {
            unlocked.push(achievement.id);
            await this.storage.update('vestige.unlocked', unlocked);
            newUnlock = achievement;

            // Show notification
            vscode.window.showInformationMessage(
                `🎉 Achievement Unlocked: ${achievement.name}`,
                'View Achievements'
            ).then(selection => {
                if (selection === 'View Achievements') {
                    vscode.commands.executeCommand('vestige.showAchievements');
                }
            });
        }

        // Check for master achievement
        if (unlocked.length === Object.keys(ACHIEVEMENTS).length - 1) {
            if (!unlocked.includes(ACHIEVEMENTS.ARCHAEOLOGIST.id)) {
                unlocked.push(ACHIEVEMENTS.ARCHAEOLOGIST.id);
                await this.storage.update('vestige.unlocked', unlocked);

                vscode.window.showInformationMessage(
                    `🏆 MASTER ACHIEVEMENT: ${ACHIEVEMENTS.ARCHAEOLOGIST.name}!`,
                    'Amazing!'
                );
            }
        }
    }

    getProgress() {
        const stats = this.getStats();
        const unlocked = this.getUnlocked();

        return Object.values(ACHIEVEMENTS).map(achievement => {
            const isUnlocked = unlocked.includes(achievement.id);
            const actionType = this.getActionTypeForAchievement(achievement.id);
            const current = stats[actionType] || 0;

            return {
                ...achievement,
                unlocked: isUnlocked,
                progress: Math.min(current, achievement.requirement),
                total: achievement.requirement
            };
        });
    }

    getActionTypeForAchievement(id) {
        const map = {
            'fossil_hunter': 'viewOldFile',
            'time_traveler': 'useEvolution',
            'gravedigger': 'viewGraveyard',
            'team_player': 'editBusFactor1',
            'data_scientist': 'viewDashboard',
            'archaeologist': 'master'
        };
        return map[id] || id;
    }
}

module.exports = AchievementSystem;
