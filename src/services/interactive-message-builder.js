/**
 * InteractiveMessageBuilder — composant partagé pour construire
 * des messages Discord interactives (boutons + select menus).
 *
 * Analogue à CardRendererService (Phase 6) : un service pur
 * réutilisable par plusieurs features (reaction-roles, tickets,
 * custom commands, future welcome-message-builder, etc).
 *
 * API :
 *   - validateComponent(comp) : lève une erreur si invalide
 *   - buildRow(components) : ActionRow depuis 1-5 components
 *   - buildMessage(components) : ActionRow[] (chaque row <= 5)
 *   - makeCustomId(prefix, suffix?) : 'ir:<id>' ou 'ir:<id>:<suffix>'
 *   - execute(interaction, comp, member) : dispatch vers la bonne
 *     action (toggle_role / give_role / take_role / open_url)
 *
 * Composants supportés (Phase 10 v2) :
 *   - button : { kind: 'button', label, style, emoji?, action, roleId?, url?, customIdSuffix? }
 *   - select : { kind: 'select', placeholder?, minValues?, maxValues?, options: [{label, value, roleId?, description?}] }
 *
 * Limites (validées ici) :
 *   - max 5 ActionRows × 5 components par message (= 25 actions max)
 *   - max 25 options par select
 *   - max 80 chars par label, 100 par description, 100 par value
 *
 * Note : `execute()` ne touche pas la BDD. Le composant
 * reaction-roles passe `roleId` à un service dédié pour l'ajout/retrait.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ROWS = 5;
const MAX_OPTIONS = 25;
const MAX_LABEL = 80;
const MAX_DESCRIPTION = 100;
const MAX_VALUE = 100;
const MAX_CUSTOM_ID = 100;
const VALID_BUTTON_STYLES = ['primary', 'secondary', 'success', 'danger', 'link'];
const VALID_ACTIONS = ['toggle_role', 'give_role', 'take_role', 'open_url'];

class InteractiveMessageBuilder {
    static inject = [];

    /**
     * Valide un composant et lève une erreur explicite si invalide.
     */
    validateComponent(comp, depth = 0) {
        if (!comp || typeof comp !== 'object') {
            throw new Error('Composant invalide (objet attendu)');
        }
        if (!comp.kind || !['button', 'select'].includes(comp.kind)) {
            throw new Error(`kind invalide: "${comp.kind}" (attendu: button | select)`);
        }
        if (comp.kind === 'button') {
            this._validateButton(comp);
        } else {
            this._validateSelect(comp);
        }
    }

    /**
     * Construit un ActionRow depuis 1 à 5 components
     */
    buildRow(components) {
        if (!Array.isArray(components) || components.length === 0) {
            throw new Error('Au moins un component est requis par row');
        }
        if (components.length > MAX_COMPONENTS_PER_ROW) {
            throw new Error(`Maximum ${MAX_COMPONENTS_PER_ROW} components par row (reçu: ${components.length})`);
        }
        for (const c of components) this.validateComponent(c);

        const builder = new ActionRowBuilder();
        for (const comp of components) {
            if (comp.kind === 'button') {
                builder.addComponents(this._buildButton(comp));
            } else {
                builder.addComponents(this._buildSelect(comp));
            }
        }
        return builder;
    }

    /**
     * Construit la liste d'ActionRow depuis une liste plate de components.
     * Groupe automatiquement en rows de 5 (Discord limite).
     * Les selects occupent toujours une row entière (max 1 par row).
     */
    buildMessage(components) {
        if (!Array.isArray(components)) {
            throw new Error('components doit être un tableau');
        }
        if (components.length === 0) return [];
        for (const c of components) this.validateComponent(c);

        // Les selects doivent être isolés dans leur propre row
        // (Discord interdit de mélanger select + button dans la même row)
        const rows = [];
        let currentRow = new ActionRowBuilder();
        let currentRowCount = 0;

        for (const c of components) {
            if (c.kind === 'select') {
                // Flush current row if non-empty
                if (currentRowCount > 0) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                    currentRowCount = 0;
                }
                rows.push(new ActionRowBuilder().addComponents(this._buildSelect(c)));
                continue;
            }
            // button
            if (currentRowCount >= MAX_COMPONENTS_PER_ROW) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
                currentRowCount = 0;
            }
            currentRow.addComponents(this._buildButton(c));
            currentRowCount++;
        }
        if (currentRowCount > 0) rows.push(currentRow);

        if (rows.length > MAX_ROWS) {
            throw new Error(`Maximum ${MAX_ROWS} ActionRows par message (reçu: ${rows.length})`);
        }
        return rows;
    }

    /**
     * Génère un custom_id standardisé `ir:<id>` ou `ir:<id>:<suffix>`
     */
    makeCustomId(id, suffix) {
        let cid = `ir:${id}`;
        if (suffix) cid += `:${suffix}`;
        if (cid.length > MAX_CUSTOM_ID) {
            throw new Error(`custom_id trop long (${cid.length} > ${MAX_CUSTOM_ID})`);
        }
        return cid;
    }

    /**
     * Parse un custom_id `ir:<id>[:<suffix>]` → { id, suffix }
     */
    parseCustomId(customId) {
        if (!customId || !customId.startsWith('ir:')) return null;
        const rest = customId.slice(3);
        const idx = rest.indexOf(':');
        if (idx < 0) return { id: rest, suffix: null };
        return { id: rest.slice(0, idx), suffix: rest.slice(idx + 1) };
    }

    /**
     * Exécute l'action associée à un component.
     * @returns {Promise<{ok: boolean, message?: string, error?: string}>}
     */
    async execute(interaction, comp, member) {
        if (!comp) return { ok: false, error: 'no_component' };

        if (comp.kind === 'button') {
            return this._executeButton(interaction, comp, member);
        }
        if (comp.kind === 'select') {
            return this._executeSelect(interaction, comp, member);
        }
        return { ok: false, error: 'unknown_kind' };
    }

    // =================== PRIVATE ===================

    _validateButton(comp) {
        if (!comp.label || typeof comp.label !== 'string') {
            throw new Error('button.label requis (string)');
        }
        if (comp.label.length > MAX_LABEL) {
            throw new Error(`button.label trop long (${comp.label.length} > ${MAX_LABEL})`);
        }
        if (comp.action && !VALID_ACTIONS.includes(comp.action)) {
            throw new Error(`button.action invalide: "${comp.action}" (attendu: ${VALID_ACTIONS.join(' | ')})`);
        }
        const action = comp.action || 'toggle_role';
        if (['toggle_role', 'give_role', 'take_role'].includes(action)) {
            if (!comp.roleId) {
                throw new Error(`button.roleId requis pour action="${action}"`);
            }
        }
        if (action === 'open_url') {
            if (!comp.url || !/^https?:\/\//.test(comp.url)) {
                throw new Error('button.url doit commencer par http(s)://');
            }
        }
    }

    _validateSelect(comp) {
        if (!Array.isArray(comp.options) || comp.options.length === 0) {
            throw new Error('select.options doit être un tableau non-vide');
        }
        if (comp.options.length > MAX_OPTIONS) {
            throw new Error(`select.options trop nombreuses (${comp.options.length} > ${MAX_OPTIONS})`);
        }
        for (const opt of comp.options) {
            if (!opt.label || opt.label.length > MAX_LABEL) {
                throw new Error(`select option label invalide: "${opt.label}"`);
            }
            if (!opt.value || opt.value.length > MAX_VALUE) {
                throw new Error(`select option value invalide: "${opt.value}"`);
            }
            if (opt.description && opt.description.length > MAX_DESCRIPTION) {
                throw new Error(`select option description trop longue (${opt.description.length} > ${MAX_DESCRIPTION})`);
            }
        }
        if (comp.minValues !== undefined && (comp.minValues < 0 || comp.minValues > comp.options.length)) {
            throw new Error('select.minValues doit être entre 0 et options.length');
        }
        if (comp.maxValues !== undefined && (comp.maxValues < 1 || comp.maxValues > comp.options.length)) {
            throw new Error('select.maxValues doit être entre 1 et options.length');
        }
    }

    _buildButton(comp) {
        const action = comp.action || 'toggle_role';
        const isLink = action === 'open_url';
        const btn = new ButtonBuilder()
            .setCustomId(isLink ? this.makeCustomId('noop') : this.makeCustomId(comp.roleId, comp.customIdSuffix))
            .setLabel(comp.label)
            .setStyle(this._mapStyle(comp.style, isLink));
        if (comp.emoji) btn.setEmoji(comp.emoji);
        if (isLink && comp.url) btn.setURL(comp.url);
        return btn;
    }

    _buildSelect(comp) {
        const select = new StringSelectMenuBuilder()
            .setCustomId(this.makeCustomId('select', comp.customIdSuffix || comp.placeholder?.slice(0, 16)))
            .setPlaceholder(comp.placeholder || 'Choisis une option…')
            .addOptions(comp.options.map(opt => ({
                label: opt.label,
                value: opt.value,
                description: opt.description || undefined
            })));
        const min = comp.minValues !== undefined ? comp.minValues : 1;
        const max = comp.maxValues !== undefined ? comp.maxValues : 1;
        select.setMinValues(min);
        select.setMaxValues(max);
        if (min === 0) select.setRequired(false);
        return select;
    }

    _mapStyle(style, isLink) {
        if (isLink) return ButtonStyle.Link;
        switch (style) {
            case 'primary': return ButtonStyle.Primary;
            case 'success': return ButtonStyle.Success;
            case 'danger': return ButtonStyle.Danger;
            case 'secondary': return ButtonStyle.Secondary;
            default: return ButtonStyle.Primary;
        }
    }

    async _executeButton(interaction, comp, member) {
        const action = comp.action || 'toggle_role';
        if (action === 'open_url') {
            return { ok: true, message: 'opened_url' };
        }
        if (!comp.roleId) {
            return { ok: false, error: 'no_role_id' };
        }
        if (!member) {
            return { ok: false, error: 'no_member' };
        }
        try {
            const has = member.roles?.cache?.has?.(comp.roleId);
            if (action === 'toggle_role') {
                if (has) await member.roles.remove(comp.roleId);
                else await member.roles.add(comp.roleId);
                return { ok: true, action: has ? 'removed' : 'added' };
            }
            if (action === 'give_role') {
                if (!has) await member.roles.add(comp.roleId);
                return { ok: true, action: 'added' };
            }
            if (action === 'take_role') {
                if (has) await member.roles.remove(comp.roleId);
                return { ok: true, action: 'removed' };
            }
        } catch (err) {
            return { ok: false, error: err.message };
        }
        return { ok: false, error: 'unknown_action' };
    }

    async _executeSelect(interaction, comp, member) {
        if (!member) return { ok: false, error: 'no_member' };
        const selected = interaction.values || [];
        if (selected.length === 0) return { ok: true, action: 'no_selection' };
        const optByValue = new Map(comp.options.map(o => [o.value, o]));
        const added = [];
        const removed = [];
        for (const val of selected) {
            const opt = optByValue.get(val);
            if (!opt || !opt.roleId) continue;
            try {
                const has = member.roles?.cache?.has?.(opt.roleId);
                if (!has) {
                    await member.roles.add(opt.roleId);
                    added.push(opt.roleId);
                }
            } catch {}
        }
        return { ok: true, action: 'select_applied', added, count: added.length };
    }
}

module.exports = { InteractiveMessageBuilder };
