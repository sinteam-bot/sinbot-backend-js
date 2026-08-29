/**
 * src/modules/community_daily-message/daily-message.controller.js
 *
 * Contrôleur REST du module Daily Message (statut, historique, IA, validation, publication).
 */

const { Controller, Get, Post } = require('../../core/index.js');
const { DailyMessageService } = require('./daily-message.service.js');
const { getConfig, config } = require('../../config/index.js');
const { pool } = require('../../db/index.js');
const logger = require('../../utils/logger.js');

class DailyMessageController {
    static inject = [DailyMessageService];

    constructor(service) {
        this.service = service;
    }

    async getStatus(req) {
        try {
            const conf = getConfig ? getConfig() : config;
            const baseStatus = await this.service.getStatus().catch(() => ({}));

            // 1. Récupérer le brouillon en attente
            let pending = baseStatus.pendingDraft || null;
            if (!pending) {
                try {
                    pending = await this.service.getPendingDraft();
                } catch (e) {
                    logger.warn(`Impossible de récupérer le brouillon daily message: ${e.message}`, 'API');
                }
            }

            // 2. Récupérer l'historique complet depuis openaimessages
            const query = `
                SELECT * FROM openaimessages 
                ORDER BY created_at DESC 
                LIMIT 100
            `;
            let rawMessages = [];
            try {
                const result = await pool.query(query);
                rawMessages = result.rows || [];
            } catch (e) {
                logger.warn(`Impossible de récupérer openaimessages: ${e.message}`, 'API');
            }

            const promptMap = new Map();
            rawMessages.forEach(m => {
                if (m.msgid && (m.msgid.startsWith('prompt_') || !m.previousmsgid)) {
                    promptMap.set(m.msgid, m);
                }
            });

            const defaultModel = conf.daily_message?.ai_config?.model || conf.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

            const history = rawMessages.map(m => {
                let step1Data = null;
                if (m.previousmsgid && promptMap.has(m.previousmsgid)) {
                    step1Data = promptMap.get(m.previousmsgid);
                }

                let tokens = {
                    input: m.tokeninput || 0,
                    output: m.tokenoutput || 0,
                    total: (m.tokeninput || 0) + (m.tokenoutput || 0)
                };

                let step1Tokens = step1Data ? {
                    input: step1Data.tokeninput || 0,
                    output: step1Data.tokenoutput || 0,
                    total: (step1Data.tokeninput || 0) + (step1Data.tokenoutput || 0)
                } : null;

                return {
                    id: m.id,
                    msgId: m.msgid,
                    content: m.content || '',
                    prompt: m.prompt || '',
                    instruction: m.instruction || '',
                    model: m.model || defaultModel,
                    tokens,
                    previousMsgId: m.previousmsgid,
                    step1: step1Data ? {
                        msgId: step1Data.msgid,
                        metaPrompt: step1Data.prompt,
                        creativePrompt: step1Data.content,
                        model: step1Data.model || defaultModel,
                        tokens: step1Tokens,
                        createdAt: step1Data.created_at
                    } : null,
                    createdAt: m.created_at,
                    updatedAt: m.updated_at
                };
            });

            const totalMessages = history.length;
            const totalTokens = history.reduce((acc, cur) => acc + cur.tokens.total, 0);
            const configuredModel = conf.daily_message?.ai_config?.model || conf.openrouter?.default_model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';
            const configuredChannelId = conf.daily_message?.channel_id || process.env.DAILY_MESSAGE_CHANNEL_ID || '1337807772024180756';
            const configuredPreviewChannelId = conf.daily_message?.preview_channel_id || process.env.LOG_CHANNEL_ID;

            return {
                success: true,
                data: {
                    enabled: conf.daily_message?.enabled !== false,
                    ...baseStatus,
                    pending,
                    pendingPublish: pending,
                    stats: {
                        totalMessages,
                        totalTokens,
                        configuredChannelId,
                        configuredPreviewChannelId,
                        configuredModel,
                        scheduleTime: '09:00',
                        previewTime: '21:00'
                    },
                    env: {
                        dailyMessageChannelId: configuredChannelId,
                        configuredModel,
                        openaiModel: configuredModel
                    },
                    history
                }
            };
        } catch (error) {
            logger.error(`Erreur DailyMessageController.getStatus: ${error.message}`, 'WEB');
            return { success: false, error: error.message };
        }
    }

    async generateDraft(req) {
        try {
            const dailyData = await this.service.generateDailyMessageContent(new Date());
            await this.service.saveCurrentDraft(dailyData);
            return {
                success: true,
                data: {
                    ...dailyData,
                    content: dailyData.text,
                    metaPrompt: dailyData.metaPrompt,
                    creativePrompt: dailyData.promptResponse?.text,
                    finalPrompt: dailyData.finalPrompt,
                    finalInstruction: dailyData.finalInstruction,
                    usage: dailyData.messageResponse?.usage
                },
                message: 'Nouveau brouillon généré avec succès !'
            };
        } catch (error) {
            logger.error(`Erreur generateDraft: ${error.message}`, 'WEB');
            return { success: false, error: error.message };
        }
    }

    async acceptDraft(req) {
        try {
            const accepted = await this.service.acceptDraft(req.body?.draft);
            return {
                success: true,
                data: accepted,
                message: 'Brouillon validé et programmé pour diffusion à 09:00 !'
            };
        } catch (error) {
            logger.error(`Erreur acceptDraft: ${error.message}`, 'WEB');
            return { success: false, error: error.message };
        }
    }

    async rejectDraft() {
        try {
            await this.service.rejectDraft();
            return {
                success: true,
                message: 'Brouillon refusé et supprimé.'
            };
        } catch (error) {
            logger.error(`Erreur rejectDraft: ${error.message}`, 'WEB');
            return { success: false, error: error.message };
        }
    }

    async regenerateDraft() {
        try {
            const newDraft = await this.service.regenerateDraft(new Date());
            return {
                success: true,
                data: {
                    ...newDraft,
                    content: newDraft.text
                },
                message: 'Nouveau brouillon régénéré avec succès !'
            };
        } catch (error) {
            logger.error(`Erreur regenerateDraft: ${error.message}`, 'WEB');
            return { success: false, error: error.message };
        }
    }

    async sendPreview(req) {
        try {
            const client = req.app?.get('discordClient');
            if (!client) {
                return { success: false, error: 'Client Discord non disponible' };
            }
            const message = await this.service.sendPreview(client);
            return { success: true, messageId: message?.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async publishNow(req) {
        try {
            const client = req.app?.get('discordClient') || req.client || null;
            const text = req.body?.text || req.body?.content;
            let draft = text ? { text, model: 'manual' } : await this.service.getPendingDraft();
            if (!draft) {
                draft = await this.service.generateDailyMessageContent(new Date());
            }
            await this.service.executePublication(client, draft);
            await this.service.rejectDraft();
            return {
                success: true,
                message: 'Message du jour publié immédiatement sur Discord !'
            };
        } catch (error) {
            logger.error(`Erreur publishNow: ${error.message}`, 'WEB');
            return { success: false, error: error.message };
        }
    }
}

Controller('/api/daily-message')(DailyMessageController);
Get('')(DailyMessageController.prototype, 'getStatus');
Get('/status')(DailyMessageController.prototype, 'getStatus');
Post('/generate')(DailyMessageController.prototype, 'generateDraft');
Post('/generate-test')(DailyMessageController.prototype, 'generateDraft');
Post('/generate-preview')(DailyMessageController.prototype, 'generateDraft');
Post('/accept')(DailyMessageController.prototype, 'acceptDraft');
Post('/reject')(DailyMessageController.prototype, 'rejectDraft');
Post('/regenerate')(DailyMessageController.prototype, 'regenerateDraft');
Post('/preview')(DailyMessageController.prototype, 'sendPreview');
Post('/publish')(DailyMessageController.prototype, 'publishNow');
Post('/publish-now')(DailyMessageController.prototype, 'publishNow');

module.exports = {
    DailyMessageController
};
