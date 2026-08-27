/**
 * ticket-permissions.service.js — gestion des permissions de canaux tickets
 *
 * Calcule les permission overwrites à appliquer lors de la création
 * d'un ticket (channel privé ou thread) et expose des helpers de
 * vérification d'accès staff / owner.
 */

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { Injectable } = require('../../../core/index.js');

class TicketPermissionsService {
    /**
     * Construit les permission overwrites pour un nouveau ticket
     * @param {import('discord.js').Guild} guild
     * @param {import('discord.js').User} user
     * @param {string[]} staffRoleIds
     * @returns {Array<{id: string, allow: bigint[], deny: bigint[]}>}
     */
    buildOverwrites(guild, user, staffRoleIds = []) {
        const overwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            }
        ];

        for (const roleId of staffRoleIds) {
            overwrites.push({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            });
        }

        overwrites.push({
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        });

        return overwrites;
    }

    /**
     * Vérifie si un utilisateur est staff sur un ticket
     * (admin, manage_channels, ou possède un des rôles staff)
     */
    isStaff(member, staffRoleIds = []) {
        if (!member) return false;
        if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
        if (member.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return true;
        if (Array.isArray(staffRoleIds) && staffRoleIds.length > 0) {
            return staffRoleIds.some(rid => member.roles?.cache?.has?.(rid));
        }
        return false;
    }

    /**
     * Vérifie si l'utilisateur est l'auteur du ticket
     */
    isOwner(member, ownerId) {
        return member?.id === ownerId;
    }

    /**
     * Combine : owner OU staff
     */
    isOwnerOrStaff(member, ownerId, staffRoleIds) {
        return this.isOwner(member, ownerId) || this.isStaff(member, staffRoleIds);
    }
}

module.exports = { TicketPermissionsService };

Injectable()(TicketPermissionsService);
