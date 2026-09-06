export {};
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

class AchievementSystem { [key: string]: any;
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
        await this.checkAchievements(actionType, stats[actionType]);
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
    /**
     * Every feature is always available.
     *
     * This used to withhold the Time Machine, Wormhole, Ghost Cursor and AI
     * Archaeologist until the user had earned enough XP — so a new user who
     * installed Vestige for the AI Archaeologist was told "Feature Locked:
     * requires 1000 XP". Achievements now only ever *reward* usage; they never
     * stand between the user and the functionality they installed.
     *
     * Retained (rather than deleted) so callers and the skill tree keep
     * working; use `getProgress()` for what the user has actually earned.
     */
    isFeatureUnlocked(featureId) {
        return true;
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

        // Record lore progress when invoked directly with a cumulative count
        // (e.g. from a lore scan), so getProgress() can display it.
        if (actionType === 'loreAdded' && typeof count === 'number') {
            const stats = this.getStats();
            if ((stats.loreAdded || 0) < count) {
                stats.loreAdded = count;
                await this.storage.update('vestige.achievements', stats);
            }
        }

        const mapping = actionMap[actionType];
        if (mapping) await checkUnlock(mapping);

        // Elite: Analysis-based triggers — pass 1 explicitly so these can
        // unlock even when no numeric action count accompanies the call.
        if (analysis) {
            if (analysis.originalityIndex >= 95 && (analysis.lines || []).length > 500) await checkUnlock(ACHIEVEMENTS.ORIGINALITY_KING, 1);
            if (Array.isArray(analysis.zombieMethods) && analysis.zombieMethods.length === 0 && analysis.churn?.totalCommits > 50) await checkUnlock(ACHIEVEMENTS.ZOMBIE_SLAYER, 1);
            if (analysis.ownershipHeat && !analysis.ownershipHeat.isBusRisk && (analysis.churn?.authors || []).length > 3) await checkUnlock(ACHIEVEMENTS.BUS_DRIVER, 1);
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
            'lore_keeper': 'loreAdded',
            'archaeologist': 'master'
        };
        return map[id] || id;
    }
}

module.exports = AchievementSystem;
