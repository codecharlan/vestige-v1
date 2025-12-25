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
    },
    LORE_KEEPER: {
        id: 'lore_keeper',
        name: '📜 Lore Keeper',
        description: 'Document 10+ architectural decisions',
        requirement: 10
    },
    ORIGINALITY_KING: {
        id: 'originality_king',
        name: '👑 Originality King',
        description: 'Maintain 95%+ originality in a large file',
        requirement: 1
    },
    ZOMBIE_SLAYER: {
        id: 'zombie_slayer',
        name: '⚔️ Zombie Slayer',
        description: 'Keep a high-churn file free of zombies',
        requirement: 1
    },
    BUS_DRIVER: {
        id: 'bus_driver',
        name: '🚌 Bus Driver',
        description: 'Eliminate Bus Factor risks in a team file',
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

        // Code Archeology Credits (XP)
        await this.addCredits(value * 10);

        // Check for new achievements
        this.checkAchievements(actionType, stats[actionType]);
    }

    async addCredits(amount) {
        const credits = this.getCredits();
        await this.storage.update('vestige.credits', credits + amount);
    }

    getCredits() {
        return this.storage.get('vestige.credits') || 0;
    }

    getStats() {
        return this.storage.get('vestige.achievements') || {};
    }

    getUnlocked() {
        return this.storage.get('vestige.unlocked') || [];
    }

    /**
     * Temporal Discovery: Advanced features unlock as you explore history.
     */
    isFeatureUnlocked(featureId) {
        const unlocked = this.getUnlocked();
        const credits = this.getCredits();

        switch (featureId) {
            case 'timeMachine': return unlocked.includes('time_traveler');
            case 'wormhole': return credits >= 500;
            case 'ghostCursor': return unlocked.length >= 3;
            case 'aiArchaeologist': return credits >= 1000;
            default: return true;
        }
    }

    async checkAchievements(actionType, count, analysis = null) {
        const unlocked = this.getUnlocked();
        const actionMap = {
            'viewOldFile': ACHIEVEMENTS.FOSSIL_HUNTER,
            'useEvolution': ACHIEVEMENTS.TIME_TRAVELER,
            'viewGraveyard': ACHIEVEMENTS.GRAVEDIGGER,
            'editBusFactor1': ACHIEVEMENTS.TEAM_PLAYER,
            'viewDashboard': ACHIEVEMENTS.DATA_SCIENTIST,
            'loreAdded': ACHIEVEMENTS.LORE_KEEPER
        };

        const checkUnlock = async (achievement, threshold = null) => {
            if (unlocked.includes(achievement.id)) return;
            const actualCount = threshold !== null ? threshold : count;
            if (actualCount >= achievement.requirement) {
                unlocked.push(achievement.id);
                await this.storage.update('vestige.unlocked', unlocked);
                vscode.window.showInformationMessage(`🎉 Achievement Unlocked: ${achievement.name}`);
            }
        };

        const mapping = actionMap[actionType];
        if (mapping) await checkUnlock(mapping);

        // Elite: Analysis-based triggers
        if (analysis) {
            if (analysis.originalityIndex >= 95 && analysis.churn.totalLines > 500) await checkUnlock(ACHIEVEMENTS.ORIGINALITY_KING);
            if (analysis.zombieMethods && analysis.zombieMethods.length === 0 && analysis.churn.totalCommits > 50) await checkUnlock(ACHIEVEMENTS.ZOMBIE_SLAYER);
            if (analysis.ownershipHeat && !analysis.ownershipHeat.isBusRisk && analysis.churn.totalAuthors > 3) await checkUnlock(ACHIEVEMENTS.BUS_DRIVER);
        }

        // Master check
        if (unlocked.length >= Object.keys(ACHIEVEMENTS).length - 1 && !unlocked.includes(ACHIEVEMENTS.ARCHAEOLOGIST.id)) {
            unlocked.push(ACHIEVEMENTS.ARCHAEOLOGIST.id);
            await this.storage.update('vestige.unlocked', unlocked);
            vscode.window.showInformationMessage(`🏆 MASTER ARCHAEOLOGIST: ${ACHIEVEMENTS.ARCHAEOLOGIST.name}`);
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
