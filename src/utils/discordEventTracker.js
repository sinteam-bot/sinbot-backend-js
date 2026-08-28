const { AuditRepository } = require('../db/schemas/shared/audit.repository.js');
const { DiscordCacheRepository } = require('../db/schemas/shared/discord-cache.repository.js');
const { MembersRepository } = require('../db/schemas/shared/members.repository.js');
const { DumpDiscordRepository } = require('../db/schemas/shared/dump-discord.repository.js');
const auditRepo = new AuditRepository();
const cacheRepo = new DiscordCacheRepository();
const membersRepo = new MembersRepository();
const dumpRepo = new DumpDiscordRepository();
const db = {
    ...auditRepo,
    ...cacheRepo,
    ...membersRepo,
    ...dumpRepo
};
const logger = require('./logger.js');
const { toISOStringSafe } = require('./dateUtils.js');

/**
 * Initialise les écouteurs pour tous les événements Discord (Discord.js v14)
 * Enregistre chaque événement dans la base SQLite et synchronise les entités.
 * @param {import('discord.js').Client} client 
 */
function initDiscordEventTracker(client) {
    logger.info('📡 Initialisation du tracker universel d\'événements Discord...', 'EVENT');

    // ============================================
    // 1. SALONS & CATÉGORIES
    // ============================================
    client.on('channelCreate', async (channel) => {
        try {
            const summary = `Salon créé : #${channel.name} (${channel.type})`;
            logger.info(`[channelCreate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('channelCreate', {
                guildId: channel.guild?.id || channel.guildId,
                targetId: channel.id,
                summary,
                data: { id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId }
            });
            await db.upsertDiscordChannel(channel);
        } catch (e) {
            console.error('Erreur tracker channelCreate:', e);
        }
    });

    client.on('channelDelete', async (channel) => {
        try {
            const summary = `Salon supprimé : #${channel.name} (ID: ${channel.id})`;
            logger.info(`[channelDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('channelDelete', {
                guildId: channel.guild?.id || channel.guildId,
                targetId: channel.id,
                summary,
                data: { id: channel.id, name: channel.name, type: channel.type }
            });
            await db.deleteDiscordChannel(channel.id);
        } catch (e) {
            console.error('Erreur tracker channelDelete:', e);
        }
    });

    client.on('channelUpdate', async (oldChannel, newChannel) => {
        try {
            const hasNameChanged = oldChannel.name !== newChannel.name;
            const hasTopicChanged = oldChannel.topic !== newChannel.topic;
            const hasPositionChanged = oldChannel.position !== newChannel.position;
            const hasParentChanged = oldChannel.parentId !== newChannel.parentId;
            const hasNsfwChanged = oldChannel.nsfw !== newChannel.nsfw;
            const hasRateLimitChanged = oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser;

            // Toujours mettre à jour le cache sans logger inutilement
            await db.upsertDiscordChannel(newChannel);

            // Ne logger et n'archiver que si un changement réel et visible est survenu
            if (!hasNameChanged && !hasTopicChanged && !hasPositionChanged && !hasParentChanged && !hasNsfwChanged && !hasRateLimitChanged) {
                return;
            }

            let summary = `Salon modifié : #${newChannel.name}`;
            if (hasNameChanged) {
                summary = `Salon renommé : #${oldChannel.name} -> #${newChannel.name}`;
            } else if (hasTopicChanged) {
                summary = `Description modifiée pour #${newChannel.name}`;
            } else if (hasPositionChanged) {
                summary = `Position modifiée pour #${newChannel.name} (${oldChannel.position} -> ${newChannel.position})`;
            }

            logger.info(`[channelUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('channelUpdate', {
                guildId: newChannel.guild?.id || newChannel.guildId,
                targetId: newChannel.id,
                summary,
                data: {
                    id: newChannel.id,
                    oldName: oldChannel.name,
                    newName: newChannel.name,
                    oldTopic: oldChannel.topic,
                    newTopic: newChannel.topic,
                    oldPosition: oldChannel.position,
                    newPosition: newChannel.position
                }
            });
        } catch (e) {
            console.error('Erreur tracker channelUpdate:', e);
        }
    });

    client.on('channelPinsUpdate', async (channel, time) => {
        try {
            const summary = `Épingles mises à jour dans #${channel.name || channel.id}`;
            logger.info(`[channelPinsUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('channelPinsUpdate', {
                guildId: channel.guild?.id || channel.guildId,
                targetId: channel.id,
                summary,
                data: { channelId: channel.id, time: toISOStringSafe(time) }
            });
        } catch (e) {
            console.error('Erreur tracker channelPinsUpdate:', e);
        }
    });

    // ============================================
    // 2. RÔLES
    // ============================================
    client.on('roleCreate', async (role) => {
        try {
            const summary = `Rôle créé : @${role.name} (ID: ${role.id})`;
            logger.info(`[roleCreate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('roleCreate', {
                guildId: role.guild?.id,
                targetId: role.id,
                summary,
                data: { id: role.id, name: role.name, color: role.color, permissions: role.permissions?.bitfield?.toString() }
            });
            await db.upsertDiscordRole(role);
        } catch (e) {
            console.error('Erreur tracker roleCreate:', e);
        }
    });

    client.on('roleDelete', async (role) => {
        try {
            const summary = `Rôle supprimé : @${role.name} (ID: ${role.id})`;
            logger.info(`[roleDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('roleDelete', {
                guildId: role.guild?.id,
                targetId: role.id,
                summary,
                data: { id: role.id, name: role.name }
            });
            await db.deleteDiscordRole(role.id);
        } catch (e) {
            console.error('Erreur tracker roleDelete:', e);
        }
    });

    client.on('roleUpdate', async (oldRole, newRole) => {
        try {
            const hasNameChanged = oldRole.name !== newRole.name;
            const hasColorChanged = oldRole.color !== newRole.color;
            const hasPositionChanged = oldRole.position !== newRole.position;
            const hasPermissionsChanged = oldRole.permissions?.bitfield !== newRole.permissions?.bitfield;
            const hasHoistChanged = oldRole.hoist !== newRole.hoist;

            await db.upsertDiscordRole(newRole);

            if (!hasNameChanged && !hasColorChanged && !hasPositionChanged && !hasPermissionsChanged && !hasHoistChanged) {
                return;
            }

            let summary = `Rôle modifié : @${newRole.name}`;
            if (hasNameChanged) {
                summary = `Rôle renommé : @${oldRole.name} -> @${newRole.name}`;
            } else if (hasColorChanged) {
                summary = `Couleur modifiée pour @${newRole.name}`;
            } else if (hasPositionChanged) {
                summary = `Position modifiée pour @${newRole.name} (${oldRole.position} -> ${newRole.position})`;
            }

            logger.info(`[roleUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('roleUpdate', {
                guildId: newRole.guild?.id,
                targetId: newRole.id,
                summary,
                data: {
                    id: newRole.id,
                    oldName: oldRole.name,
                    newName: newRole.name,
                    oldColor: oldRole.color,
                    newColor: newRole.color
                }
            });
        } catch (e) {
            console.error('Erreur tracker roleUpdate:', e);
        }
    });

    // ============================================
    // 3. EMOJIS & STICKERS
    // ============================================
    client.on('emojiCreate', async (emoji) => {
        try {
            const summary = `Emoji créé : :${emoji.name}: (ID: ${emoji.id})`;
            logger.info(`[emojiCreate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('emojiCreate', {
                guildId: emoji.guild?.id,
                targetId: emoji.id,
                summary,
                data: { id: emoji.id, name: emoji.name, animated: emoji.animated, url: emoji.url }
            });
        } catch (e) {
            console.error('Erreur tracker emojiCreate:', e);
        }
    });

    client.on('emojiDelete', async (emoji) => {
        try {
            const summary = `Emoji supprimé : :${emoji.name}: (ID: ${emoji.id})`;
            logger.info(`[emojiDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('emojiDelete', {
                guildId: emoji.guild?.id,
                targetId: emoji.id,
                summary,
                data: { id: emoji.id, name: emoji.name }
            });
        } catch (e) {
            console.error('Erreur tracker emojiDelete:', e);
        }
    });

    client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
        try {
            if (oldEmoji.name === newEmoji.name) return;
            const summary = `Emoji modifié : :${oldEmoji.name}: -> :${newEmoji.name}:`;
            logger.info(`[emojiUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('emojiUpdate', {
                guildId: newEmoji.guild?.id,
                targetId: newEmoji.id,
                summary,
                data: { id: newEmoji.id, oldName: oldEmoji.name, newName: newEmoji.name }
            });
        } catch (e) {
            console.error('Erreur tracker emojiUpdate:', e);
        }
    });

    client.on('stickerCreate', async (sticker) => {
        try {
            const summary = `Sticker créé : ${sticker.name} (ID: ${sticker.id})`;
            logger.info(`[stickerCreate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('stickerCreate', {
                guildId: sticker.guildId || sticker.guild?.id,
                targetId: sticker.id,
                summary,
                data: { id: sticker.id, name: sticker.name, description: sticker.description }
            });
        } catch (e) {
            console.error('Erreur tracker stickerCreate:', e);
        }
    });

    client.on('stickerDelete', async (sticker) => {
        try {
            const summary = `Sticker supprimé : ${sticker.name}`;
            logger.info(`[stickerDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('stickerDelete', {
                guildId: sticker.guildId || sticker.guild?.id,
                targetId: sticker.id,
                summary,
                data: { id: sticker.id, name: sticker.name }
            });
        } catch (e) {
            console.error('Erreur tracker stickerDelete:', e);
        }
    });

    client.on('stickerUpdate', async (oldSticker, newSticker) => {
        try {
            const hasNameChanged = oldSticker.name !== newSticker.name;
            const hasDescChanged = oldSticker.description !== newSticker.description;
            const hasTagsChanged = oldSticker.tags !== newSticker.tags;

            if (!hasNameChanged && !hasDescChanged && !hasTagsChanged) {
                return;
            }

            let summary = `Sticker modifié : ${newSticker.name}`;
            if (hasNameChanged) {
                summary = `Sticker renommé : ${oldSticker.name} -> ${newSticker.name}`;
            }

            logger.info(`[stickerUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('stickerUpdate', {
                guildId: newSticker.guildId || newSticker.guild?.id,
                targetId: newSticker.id,
                summary,
                data: { id: newSticker.id, oldName: oldSticker.name, newName: newSticker.name, description: newSticker.description }
            });
        } catch (e) {
            console.error('Erreur tracker stickerUpdate:', e);
        }
    });

    // ============================================
    // 4. MEMBRES & UTILISATEURS
    // ============================================
    client.on('guildMemberRemove', async (member) => {
        try {
            const username = member.user?.username || member.displayName || 'Inconnu';
            const summary = `Membre parti du serveur : @${username} (ID: ${member.id})`;
            logger.info(`[guildMemberRemove] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('guildMemberRemove', {
                guildId: member.guild?.id,
                targetId: member.id,
                userId: member.id,
                username,
                summary,
                data: { id: member.id, username, roles: Array.from(member.roles?.cache?.keys() || []) }
            });
            await db.markMemberLeft(member.id, username, member.guild?.id);
        } catch (e) {
            console.error('Erreur tracker guildMemberRemove:', e);
        }
    });

    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        try {
            const hasNickChanged = oldMember.nickname !== newMember.nickname;
            const hasRolesChanged = oldMember.roles?.cache?.size !== newMember.roles?.cache?.size || 
                                    !oldMember.roles?.cache?.equals(newMember.roles?.cache);
            const hasAvatarChanged = oldMember.avatar !== newMember.avatar;

            const roles = Array.from(newMember.roles.cache.values()).map(r => r.name);
            await db.updateMemberRoles(newMember.id, roles);

            if (!hasNickChanged && !hasRolesChanged && !hasAvatarChanged) {
                return;
            }

            const username = newMember.user?.username || newMember.displayName;
            let summary = `Membre mis à jour : @${username}`;
            if (hasNickChanged) {
                summary = `Surnom modifié pour @${username} (${oldMember.nickname || 'aucun'} -> ${newMember.nickname || 'aucun'})`;
            } else if (hasRolesChanged) {
                summary = `Rôles mis à jour pour @${username}`;
            }

            logger.info(`[guildMemberUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('guildMemberUpdate', {
                guildId: newMember.guild?.id,
                targetId: newMember.id,
                userId: newMember.id,
                username,
                summary,
                data: {
                    id: newMember.id,
                    oldNickname: oldMember.nickname,
                    newNickname: newMember.nickname,
                    rolesCount: newMember.roles?.cache?.size || 0
                }
            });
        } catch (e) {
            console.error('Erreur tracker guildMemberUpdate:', e);
        }
    });

    client.on('userUpdate', async (oldUser, newUser) => {
        try {
            const hasUsernameChanged = oldUser.username !== newUser.username;
            const hasAvatarChanged = oldUser.avatar !== newUser.avatar;
            const hasGlobalNameChanged = oldUser.globalName !== newUser.globalName;

            await db.saveDumpUser(newUser);

            if (!hasUsernameChanged && !hasAvatarChanged && !hasGlobalNameChanged) {
                return;
            }

            const summary = `Utilisateur modifié : @${oldUser.username} -> @${newUser.username}`;
            logger.info(`[userUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('userUpdate', {
                targetId: newUser.id,
                userId: newUser.id,
                username: newUser.username,
                summary,
                data: {
                    id: newUser.id,
                    oldUsername: oldUser.username,
                    newUsername: newUser.username,
                    oldAvatar: oldUser.avatar,
                    newAvatar: newUser.avatar
                }
            });
        } catch (e) {
            console.error('Erreur tracker userUpdate:', e);
        }
    });

    // ============================================
    // 5. MODÉRATION & BANNISSEMENTS
    // ============================================
    client.on('guildBanAdd', async (ban) => {
        try {
            const username = ban.user?.username || 'Inconnu';
            const summary = `Membre banni : @${username} (Raison: ${ban.reason || 'Aucune'})`;
            logger.warn(`[guildBanAdd] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('guildBanAdd', {
                guildId: ban.guild?.id,
                targetId: ban.user?.id,
                userId: ban.user?.id,
                username,
                summary,
                data: { userId: ban.user?.id, username, reason: ban.reason }
            });
        } catch (e) {
            console.error('Erreur tracker guildBanAdd:', e);
        }
    });

    client.on('guildBanRemove', async (ban) => {
        try {
            const username = ban.user?.username || 'Inconnu';
            const summary = `Bannissement révoqué pour @${username}`;
            logger.info(`[guildBanRemove] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('guildBanRemove', {
                guildId: ban.guild?.id,
                targetId: ban.user?.id,
                userId: ban.user?.id,
                username,
                summary,
                data: { userId: ban.user?.id, username }
            });
        } catch (e) {
            console.error('Erreur tracker guildBanRemove:', e);
        }
    });

    client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
        try {
            const summary = `Action d'audit : ${auditLogEntry.action} par ${auditLogEntry.executor?.username || 'Système'}`;
            await db.archiveDiscordEvent('guildAuditLogEntryCreate', {
                guildId: guild.id,
                targetId: auditLogEntry.targetId,
                userId: auditLogEntry.executorId,
                username: auditLogEntry.executor?.username,
                summary,
                data: {
                    id: auditLogEntry.id,
                    action: auditLogEntry.action,
                    actionType: auditLogEntry.actionType,
                    reason: auditLogEntry.reason,
                    targetType: auditLogEntry.targetType
                }
            });
        } catch (e) {
            console.error('Erreur tracker guildAuditLogEntryCreate:', e);
        }
    });

    client.on('autoModerationActionExecution', async (execution) => {
        try {
            const summary = `AutoMod déclenché dans #${execution.channel?.name || execution.channelId} par ID: ${execution.userId}`;
            logger.warn(`[autoModerationActionExecution] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('autoModerationActionExecution', {
                guildId: execution.guild?.id || execution.guildId,
                targetId: execution.ruleId,
                userId: execution.userId,
                summary,
                data: {
                    action: execution.action,
                    ruleId: execution.ruleId,
                    ruleTriggerType: execution.ruleTriggerType,
                    matchedContent: execution.matchedContent,
                    matchedKeyword: execution.matchedKeyword
                }
            });
        } catch (e) {
            console.error('Erreur tracker autoModerationActionExecution:', e);
        }
    });

    // ============================================
    // 6. MESSAGES & RÉACTIONS
    // ============================================
    client.on('messageDelete', async (message) => {
        try {
            const authorName = message.author?.username || 'Inconnu';
            const channelName = message.channel?.name || message.channelId;
            const summary = `Message supprimé dans #${channelName} (Auteur: @${authorName})`;
            logger.info(`[messageDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('messageDelete', {
                guildId: message.guildId,
                targetId: message.id,
                userId: message.author?.id,
                username: authorName,
                summary,
                data: {
                    messageId: message.id,
                    channelId: message.channelId,
                    content: message.content,
                    authorId: message.author?.id
                }
            });
            await db.deleteDiscordMessage(message.id);
        } catch (e) {
            console.error('Erreur tracker messageDelete:', e);
        }
    });

    client.on('messageDeleteBulk', async (messages, channel) => {
        try {
            const count = messages.size;
            const summary = `Suppression en masse de ${count} messages dans #${channel.name}`;
            logger.warn(`[messageDeleteBulk] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('messageDeleteBulk', {
                guildId: channel.guild?.id || channel.guildId,
                targetId: channel.id,
                summary,
                data: {
                    count,
                    channelId: channel.id,
                    messageIds: Array.from(messages.keys())
                }
            });
            for (const msgId of messages.keys()) {
                await db.deleteDiscordMessage(msgId);
            }
        } catch (e) {
            console.error('Erreur tracker messageDeleteBulk:', e);
        }
    });

    client.on('messageUpdate', async (oldMessage, newMessage) => {
        try {
            const hasContentChanged = oldMessage.content !== newMessage.content;
            const hasPinnedChanged = oldMessage.pinned !== newMessage.pinned;

            if (!hasContentChanged && !hasPinnedChanged) return; // ignore embeds / link previews updates

            const authorName = newMessage.author?.username || 'Inconnu';
            const channelName = newMessage.channel?.name || newMessage.channelId;
            let summary = `Message édité dans #${channelName} par @${authorName}`;
            if (hasPinnedChanged) {
                summary = newMessage.pinned ? `Message épinglé dans #${channelName} par @${authorName}` : `Message désépinglé dans #${channelName}`;
            }

            await db.archiveDiscordEvent('messageUpdate', {
                guildId: newMessage.guildId,
                targetId: newMessage.id,
                userId: newMessage.author?.id,
                username: authorName,
                summary,
                data: {
                    messageId: newMessage.id,
                    channelId: newMessage.channelId,
                    oldContent: oldMessage.content,
                    newContent: newMessage.content,
                    pinned: newMessage.pinned
                }
            });
            await db.updateDiscordMessage(newMessage);
        } catch (e) {
            console.error('Erreur tracker messageUpdate:', e);
        }
    });

    client.on('messageReactionAdd', async (reaction, user) => {
        try {
            const summary = `Réaction :${reaction.emoji.name}: ajoutée par @${user.username}`;
            await db.archiveDiscordEvent('messageReactionAdd', {
                guildId: reaction.message.guildId,
                targetId: reaction.message.id,
                userId: user.id,
                username: user.username,
                summary,
                data: {
                    messageId: reaction.message.id,
                    channelId: reaction.message.channelId,
                    emoji: reaction.emoji.name,
                    userId: user.id
                }
            });
            if (reaction.message.content !== undefined) {
                await db.updateDiscordMessage(reaction.message);
            }
        } catch (e) {
            console.error('Erreur tracker messageReactionAdd:', e);
        }
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        try {
            const summary = `Réaction :${reaction.emoji.name}: retirée par @${user.username}`;
            await db.archiveDiscordEvent('messageReactionRemove', {
                guildId: reaction.message.guildId,
                targetId: reaction.message.id,
                userId: user.id,
                username: user.username,
                summary,
                data: {
                    messageId: reaction.message.id,
                    emoji: reaction.emoji.name,
                    userId: user.id
                }
            });
            if (reaction.message.content !== undefined) {
                await db.updateDiscordMessage(reaction.message);
            }
        } catch (e) {
            console.error('Erreur tracker messageReactionRemove:', e);
        }
    });

    // ============================================
    // 7. THREADS (FILS DE DISCUSSION)
    // ============================================
    client.on('threadCreate', async (thread) => {
        try {
            const summary = `Thread créé : "${thread.name}" dans #${thread.parent?.name || thread.parentId}`;
            logger.info(`[threadCreate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('threadCreate', {
                guildId: thread.guildId || thread.guild?.id,
                targetId: thread.id,
                summary,
                data: { id: thread.id, name: thread.name, parentId: thread.parentId, ownerId: thread.ownerId }
            });
            await db.upsertDiscordThread(thread);
        } catch (e) {
            console.error('Erreur tracker threadCreate:', e);
        }
    });

    client.on('threadDelete', async (thread) => {
        try {
            const summary = `Thread supprimé : "${thread.name}" (ID: ${thread.id})`;
            logger.info(`[threadDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('threadDelete', {
                guildId: thread.guildId || thread.guild?.id,
                targetId: thread.id,
                summary,
                data: { id: thread.id, name: thread.name }
            });
            await db.deleteDiscordThread(thread.id);
        } catch (e) {
            console.error('Erreur tracker threadDelete:', e);
        }
    });

    client.on('threadUpdate', async (oldThread, newThread) => {
        try {
            const hasNameChanged = oldThread.name !== newThread.name;
            const hasArchivedChanged = oldThread.archived !== newThread.archived;
            const hasLockedChanged = oldThread.locked !== newThread.locked;
            const hasRateLimitChanged = oldThread.rateLimitPerUser !== newThread.rateLimitPerUser;
            const hasAutoArchiveChanged = oldThread.autoArchiveDuration !== newThread.autoArchiveDuration;

            await db.upsertDiscordThread(newThread);

            if (!hasNameChanged && !hasArchivedChanged && !hasLockedChanged && !hasRateLimitChanged && !hasAutoArchiveChanged) {
                return;
            }

            let summary = `Thread modifié : "${newThread.name}"`;
            if (hasNameChanged) {
                summary = `Thread renommé : "${oldThread.name}" -> "${newThread.name}"`;
            } else if (hasArchivedChanged) {
                summary = newThread.archived ? `Thread archivé : "${newThread.name}"` : `Thread désarchivé : "${newThread.name}"`;
            } else if (hasLockedChanged) {
                summary = newThread.locked ? `Thread verrouillé : "${newThread.name}"` : `Thread déverrouillé : "${newThread.name}"`;
            }

            logger.info(`[threadUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('threadUpdate', {
                guildId: newThread.guildId || newThread.guild?.id,
                targetId: newThread.id,
                summary,
                data: {
                    id: newThread.id,
                    oldName: oldThread.name,
                    newName: newThread.name,
                    archived: newThread.archived,
                    locked: newThread.locked
                }
            });
        } catch (e) {
            console.error('Erreur tracker threadUpdate:', e);
        }
    });

    // ============================================
    // 8. ÉVÉNEMENTS PROGRAMMÉS & SERVEUR
    // ============================================
    client.on('guildScheduledEventCreate', async (scheduledEvent) => {
        try {
            const summary = `Événement programmé créé : "${scheduledEvent.name}"`;
            logger.info(`[guildScheduledEventCreate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('guildScheduledEventCreate', {
                guildId: scheduledEvent.guild?.id,
                targetId: scheduledEvent.id,
                summary,
                data: { 
                    id: scheduledEvent.id, 
                    name: scheduledEvent.name, 
                    scheduledStartTime: toISOStringSafe(scheduledEvent.scheduledStartTime),
                    scheduledEndTime: toISOStringSafe(scheduledEvent.scheduledEndTime)
                }
            });
        } catch (e) {
            console.error('Erreur tracker guildScheduledEventCreate:', e);
        }
    });

    client.on('guildScheduledEventDelete', async (scheduledEvent) => {
        try {
            const summary = `Événement programmé supprimé : "${scheduledEvent.name}"`;
            logger.info(`[guildScheduledEventDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('guildScheduledEventDelete', {
                guildId: scheduledEvent.guild?.id,
                targetId: scheduledEvent.id,
                summary,
                data: { id: scheduledEvent.id, name: scheduledEvent.name }
            });
        } catch (e) {
            console.error('Erreur tracker guildScheduledEventDelete:', e);
        }
    });

    client.on('guildUpdate', async (oldGuild, newGuild) => {
        try {
            const hasNameChanged = oldGuild.name !== newGuild.name;
            const hasIconChanged = oldGuild.icon !== newGuild.icon;
            const hasBannerChanged = oldGuild.banner !== newGuild.banner;
            const hasDescriptionChanged = oldGuild.description !== newGuild.description;
            const hasOwnerChanged = oldGuild.ownerId !== newGuild.ownerId;
            const hasVanityChanged = oldGuild.vanityURLCode !== newGuild.vanityURLCode;

            if (!hasNameChanged && !hasIconChanged && !hasBannerChanged && !hasDescriptionChanged && !hasOwnerChanged && !hasVanityChanged) {
                return;
            }

            let summary = `Serveur Discord mis à jour : "${newGuild.name}"`;
            if (hasNameChanged) {
                summary = `Serveur Discord renommé : "${oldGuild.name}" -> "${newGuild.name}"`;
            } else if (hasIconChanged) {
                summary = `Icône du serveur mise à jour (${newGuild.name})`;
            } else if (hasBannerChanged) {
                summary = `Bannière du serveur mise à jour (${newGuild.name})`;
            } else if (hasOwnerChanged) {
                summary = `Propriétaire du serveur modifié : ID ${oldGuild.ownerId} -> ${newGuild.ownerId}`;
            }

            logger.info(`[guildUpdate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('guildUpdate', {
                guildId: newGuild.id,
                targetId: newGuild.id,
                summary,
                data: {
                    id: newGuild.id,
                    oldName: oldGuild.name,
                    newName: newGuild.name,
                    memberCount: newGuild.memberCount
                }
            });
        } catch (e) {
            console.error('Erreur tracker guildUpdate:', e);
        }
    });

    client.on('inviteCreate', async (invite) => {
        try {
            const summary = `Invitation créée : discord.gg/${invite.code} par @${invite.inviter?.username || 'Inconnu'}`;
            logger.info(`[inviteCreate] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('inviteCreate', {
                guildId: invite.guild?.id,
                targetId: invite.code,
                userId: invite.inviter?.id,
                username: invite.inviter?.username,
                summary,
                data: { code: invite.code, maxUses: invite.maxUses, maxAge: invite.maxAge }
            });
        } catch (e) {
            console.error('Erreur tracker inviteCreate:', e);
        }
    });

    client.on('inviteDelete', async (invite) => {
        try {
            const summary = `Invitation supprimée : discord.gg/${invite.code}`;
            logger.info(`[inviteDelete] ${summary}`, 'EVENT');
            await db.archiveDiscordEvent('inviteDelete', {
                guildId: invite.guild?.id,
                targetId: invite.code,
                summary,
                data: { code: invite.code }
            });
        } catch (e) {
            console.error('Erreur tracker inviteDelete:', e);
        }
    });

    logger.info('✅ Tracker d\'événements Discord prêt et actif.', 'EVENT');
}

module.exports = {
    initDiscordEventTracker
};
