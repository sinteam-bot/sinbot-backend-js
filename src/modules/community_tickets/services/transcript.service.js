/**
 * transcript.service.js — génération de transcripts
 *
 * Construit un transcript HTML à partir des messages BDD et envoie
 * un embed récapitulatif dans le salon de transcript configuré.
 */

const { EmbedBuilder } = require('discord.js');
const { Injectable } = require('../../../core/index.js');

class TranscriptService {
    constructor() {
        this.ticketService = null;
    }

    setTicketService(svc) {
        this.ticketService = svc;
    }

    /**
     * Génère un transcript HTML pour un ticket
     */
    async generateHTML(ticketId) {
        const messages = await this.ticketService.getMessages(ticketId, 1000);
        const ticket = await this.ticketService.get(ticketId);
        if (!ticket) return null;

        const escape = (s) => String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const rows = messages.map(m => {
            const ts = new Date(m.createdAt).toISOString();
            const author = m.authorId;
            const staff = m.isStaff ? ' <span class="staff">[STAFF]</span>' : '';
            const content = escape(m.content).replace(/\n/g, '<br>');
            return `<div class="msg"><span class="ts">[${ts}]</span> <span class="author">${escape(author)}${staff}</span>: <span class="content">${content || '<em>(vide)</em>'}</span></div>`;
        }).join('\n');

        return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Transcript ticket #${escape(ticketId)}</title>
<style>
body { font-family: 'Segoe UI', sans-serif; background: #1e1f22; color: #dcddde; padding: 24px; }
h1 { color: #f2c7ce; border-bottom: 2px solid #f2c7ce; padding-bottom: 8px; }
.meta { color: #80848e; margin-bottom: 24px; }
.msg { padding: 6px 0; border-bottom: 1px solid #2b2d31; }
.ts { color: #72767d; font-size: 12px; }
.author { color: #fee75c; font-weight: 600; }
.staff { color: #5865f2; font-size: 11px; }
.content { color: #dcddde; }
</style>
</head>
<body>
<h1>📋 Transcript — Ticket #${escape(ticketId.slice(0, 8))}</h1>
<div class="meta">
  <strong>Sujet :</strong> ${escape(ticket.subject) || '—'}<br>
  <strong>Catégorie :</strong> ${escape(ticket.category)}<br>
  <strong>Ouvert par :</strong> ${escape(ticket.userId)}<br>
  <strong>Statut :</strong> ${escape(ticket.status)}<br>
  <strong>Créé le :</strong> ${new Date(ticket.createdAt).toISOString()}<br>
  ${ticket.closedAt ? `<strong>Fermé le :</strong> ${new Date(ticket.closedAt).toISOString()}<br>` : ''}
</div>
<div class="messages">
${rows || '<em>Aucun message.</em>'}
</div>
</body>
</html>`;
    }

    /**
     * Construit un embed récapitulatif
     */
    buildSummaryEmbed(ticket) {
        return new EmbedBuilder()
            .setColor(ticket.status === 'closed' ? 0x80848e : 0x5865f2)
            .setTitle(`📋 Ticket ${ticket.id.slice(0, 8)}`)
            .addFields(
                { name: 'Sujet', value: ticket.subject || '—', inline: true },
                { name: 'Catégorie', value: ticket.category, inline: true },
                { name: 'Statut', value: ticket.status, inline: true },
                { name: 'Ouvert par', value: `<@${ticket.userId}>`, inline: true },
                { name: 'Claim', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
                { name: 'Fermé par', value: ticket.closedBy ? `<@${ticket.closedBy}>` : '—', inline: true }
            )
            .setTimestamp(ticket.createdAt);
    }

    /**
     * Envoie le transcript dans le salon configuré
     */
    async publishToTranscriptChannel(guild, ticketId, transcriptChannelId) {
        if (!transcriptChannelId) return null;
        const ticket = await this.ticketService.get(ticketId);
        if (!ticket) return null;
        const channel = await guild.channels.fetch(transcriptChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return null;
        const embed = this.buildSummaryEmbed(ticket);
        try {
            const msg = await channel.send({ embeds: [embed], content: `Transcript pour ticket <#${ticket.channelId}>` });
            return msg;
        } catch (err) {
            console.error(`[TranscriptService] publish failed: ${err.message}`);
            return null;
        }
    }
}

module.exports = { TranscriptService };

Injectable()(TranscriptService);
