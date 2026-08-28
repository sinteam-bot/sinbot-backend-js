    CREATE TABLE IF NOT EXISTS user_events (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS form_responses (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        form_name TEXT NOT NULL,
        responses TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_birthdays (
        id SERIAL PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        birthdate DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_xp (
        id SERIAL PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        total_xp_earned INTEGER DEFAULT 0,
        messages_count INTEGER DEFAULT 0,
        voice_minutes INTEGER DEFAULT 0,
        events_participated INTEGER DEFAULT 0,
        last_message_xp TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS xp_transactions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        xp_amount INTEGER NOT NULL,
        xp_type TEXT NOT NULL,
        description TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS voice_sessions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        leave_time TIMESTAMP,
        duration_minutes INTEGER DEFAULT 0,
        xp_earned INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_name TEXT NOT NULL,
        event_description TEXT,
        event_date TIMESTAMP,
        xp_reward INTEGER DEFAULT 0,
        created_by TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_participants (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        xp_earned INTEGER DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS server_members (
        id SERIAL PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        discriminator TEXT,
        tag TEXT,
        display_name TEXT,
        avatar_url TEXT,
        display_color TEXT,
        highest_role_id TEXT,
        highest_role_name TEXT,
        highest_role_color TEXT,
        joined_at TEXT,
        account_created_at TEXT,
        is_bot INTEGER DEFAULT 0,
        rejoin_count INTEGER DEFAULT 0,
        left_at TEXT,
        roles TEXT,
        presence TEXT DEFAULT 'offline',
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS member_history (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS welcome_config (
        id SERIAL PRIMARY KEY,
        guild_id TEXT UNIQUE NOT NULL,
        welcome_channel_id TEXT,
        welcome_message TEXT,
        auto_roles TEXT,
        is_enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS openaimessages (
        id SERIAL PRIMARY KEY,
        msgid TEXT UNIQUE NOT NULL,
        prompt TEXT,
        instruction TEXT,
        model TEXT,
        tokeninput INTEGER DEFAULT 0,
        tokenoutput INTEGER DEFAULT 0,
        content TEXT,
        previousmsgid TEXT,
        rawdata TEXT,
        type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversation_contexts (
        id SERIAL PRIMARY KEY,
        channel_id TEXT UNIQUE NOT NULL,
        context TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        bio TEXT,
        custom_title TEXT,
        color TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS role_assign_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        role_id TEXT NOT NULL,
        role_name TEXT NOT NULL,
        action TEXT NOT NULL,
        assigned_by TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guild_members_cache (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        roles TEXT,
        joined_at TIMESTAMP,
        PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS moderation_logs (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        action TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        moderator_username TEXT NOT NULL,
        target_id TEXT,
        target_username TEXT,
        reason TEXT,
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_captchas (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        verified_at TIMESTAMP,
        expired_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS captcha_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        channel_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS captcha_config (
        id SERIAL PRIMARY KEY,
        guild_id TEXT UNIQUE NOT NULL,
        channel_id TEXT,
        verified_role_id TEXT,
        timeout_minutes INTEGER DEFAULT 10,
        max_attempts INTEGER DEFAULT 3,
        is_enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bump_logs (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        bumped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reminder_sent INTEGER DEFAULT 0,
        reminder_sent_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_channels (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id TEXT,
        position INTEGER DEFAULT 0,
        topic TEXT,
        is_nsfw INTEGER DEFAULT 0,
        created_at TEXT,
        deleted_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_threads (
        thread_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        owner_id TEXT,
        archived INTEGER DEFAULT 0,
        locked INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        member_count INTEGER DEFAULT 0,
        created_at TEXT,
        deleted_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_users (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        global_name TEXT,
        discriminator TEXT,
        bot INTEGER DEFAULT 0,
        avatar_url TEXT,
        banner_url TEXT,
        created_at TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_messages (
        message_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        guild_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_username TEXT NOT NULL,
        content TEXT,
        pinned INTEGER DEFAULT 0,
        embeds_json TEXT,
        attachments_json TEXT,
        reactions_json TEXT,
        created_at TEXT NOT NULL,
        deleted_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS counter_state (
        channel_id TEXT PRIMARY KEY,
        current_number INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_user_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS countdown_state (
        channel_id TEXT PRIMARY KEY,
        current_number INTEGER DEFAULT 900,
        error_count INTEGER DEFAULT 0,
        is_trap_active INTEGER DEFAULT 0,
        trap_number INTEGER,
        last_user_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS countdown_scores (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        PRIMARY KEY (channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS bot_version_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_roles (
        role_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color INTEGER DEFAULT 0,
        color_hex TEXT,
        icon_url TEXT,
        unicode_emoji TEXT,
        member_count INTEGER DEFAULT 0,
        hoist INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        permissions TEXT,
        managed INTEGER DEFAULT 0,
        mentionable INTEGER DEFAULT 0,
        created_at TEXT,
        deleted_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_events_archive (
        id SERIAL PRIMARY KEY,
        event_name TEXT NOT NULL,
        guild_id TEXT,
        target_id TEXT,
        user_id TEXT,
        username TEXT,
        summary TEXT,
        data_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_emojis (
        emoji_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        animated INTEGER DEFAULT 0,
        url TEXT,
        roles_json TEXT,
        created_at TEXT,
        deleted_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Phase 0: Multi-guild foundations
    CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        locale TEXT DEFAULT 'fr',
        timezone TEXT DEFAULT 'Europe/Paris',
        owner_id TEXT,
        premium_tier INTEGER DEFAULT 0,
        joined_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
        guild_id TEXT NOT NULL,
        feature_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL DEFAULT '{}',
        allowed_roles TEXT NOT NULL DEFAULT '[]',
        updated_by TEXT,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, feature_name)
    );

    CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

    -- Phase 1: AutoMod tables
    CREATE TABLE IF NOT EXISTS user_warnings (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mod_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        rule TEXT,
        created_at BIGINT NOT NULL,
        expires_at BIGINT,
        active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_user_warnings_guild_user ON user_warnings(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_user_warnings_active ON user_warnings(active);

    CREATE TABLE IF NOT EXISTS user_sanctions (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        reason TEXT NOT NULL,
        mod_id TEXT NOT NULL,
        duration_ms BIGINT,
        starts_at BIGINT NOT NULL,
        expires_at BIGINT,
        revoked_by TEXT,
        revoked_at BIGINT,
        revoked_reason TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sanctions_guild_user ON user_sanctions(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sanctions_active ON user_sanctions(active);

    CREATE TABLE IF NOT EXISTS mod_logs (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mod_id TEXT,
        action TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        reason TEXT,
        metadata TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mod_logs_guild_created ON mod_logs(guild_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_mod_logs_guild_user ON mod_logs(guild_id, user_id);

    -- Phase 3: Tickets
    CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'support',
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        claimed_by TEXT,
        closed_by TEXT,
        closed_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);

    CREATE TABLE IF NOT EXISTS ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        content TEXT,
        attachments TEXT,
        is_staff INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

    -- Phase 4: Generic event log
    CREATE TABLE IF NOT EXISTS event_log (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_id TEXT,
        target_id TEXT,
        channel_id TEXT,
        metadata TEXT,
        summary TEXT,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_event_log_guild_type ON event_log(guild_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_event_log_guild_created ON event_log(guild_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_log_actor ON event_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_event_log_target ON event_log(target_id);

    -- Phase 6: Welcome card cache
    CREATE TABLE IF NOT EXISTS welcome_cards (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        template TEXT NOT NULL,
        payload TEXT NOT NULL,
        svg TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_welcome_cards_user ON welcome_cards(guild_id, user_id, template);

    -- Phase 5: Giveaways
    CREATE TABLE IF NOT EXISTS giveaways (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        host_id TEXT NOT NULL,
        prize TEXT NOT NULL,
        description TEXT,
        winners_count INTEGER NOT NULL DEFAULT 1,
        required_role_id TEXT,
        starts_at BIGINT NOT NULL,
        ends_at BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        winners_json TEXT,
        color TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_giveaways_guild_status ON giveaways(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_giveaways_ends_at ON giveaways(ends_at);
    CREATE INDEX IF NOT EXISTS idx_giveaways_channel ON giveaways(channel_id);

    CREATE TABLE IF NOT EXISTS giveaway_entries (
        giveaway_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        entered_at BIGINT NOT NULL,
        PRIMARY KEY (giveaway_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_giveaway_entries_user ON giveaway_entries(user_id);

    -- Phase 5: Polls
    CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        question TEXT NOT NULL,
        options_json TEXT NOT NULL,
        multi_choice INTEGER NOT NULL DEFAULT 0,
        anonymous INTEGER NOT NULL DEFAULT 0,
        ends_at BIGINT,
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_polls_guild_status ON polls(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_polls_message ON polls(message_id);

    CREATE TABLE IF NOT EXISTS poll_votes (
        poll_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        option_index INTEGER NOT NULL,
        voted_at BIGINT NOT NULL,
        PRIMARY KEY (poll_id, user_id, option_index)
    );
    CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

    -- Phase 7: Birthdays
    CREATE TABLE IF NOT EXISTS birthday_guild_settings (
        guild_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'public',
        announce_channel_id TEXT,
        announce_hour INTEGER NOT NULL DEFAULT 9,
        announce_timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
        ping_role_id TEXT,
        message_template TEXT NOT NULL DEFAULT '🎂 Joyeux anniversaire {user} ! Tu fêtes tes **{age} ans** aujourdhui !',
        temp_role_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS birthday_visibility (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, guild_id)
    );
    CREATE INDEX IF NOT EXISTS idx_birthday_visibility_user ON birthday_visibility(user_id);

    CREATE TABLE IF NOT EXISTS birthday_change_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        change_number INTEGER NOT NULL,
        previous_birthdate TEXT,
        new_birthdate TEXT NOT NULL,
        cooldown_until BIGINT NOT NULL,
        changed_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_birthday_change_user ON birthday_change_log(user_id, guild_id);
    CREATE INDEX IF NOT EXISTS idx_birthday_change_until ON birthday_change_log(cooldown_until);

    CREATE TABLE IF NOT EXISTS birthday_history (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        age INTEGER,
        message_id TEXT,
        gifts_given TEXT,
        announced_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_birthday_history_user ON birthday_history(user_id, guild_id, announced_at);
    CREATE INDEX IF NOT EXISTS idx_birthday_history_guild ON birthday_history(guild_id, announced_at);

    -- Phase 12: Reports
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reported_id TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        reason TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        status TEXT NOT NULL DEFAULT 'open',
        resolved_by TEXT,
        resolved_at INTEGER,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_guild_status ON reports(guild_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(guild_id, reporter_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(guild_id, reported_id, status);

    CREATE TABLE IF NOT EXISTS report_actions (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        action TEXT NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_report_actions_report ON report_actions(report_id, created_at);

    -- Phase RR: Reaction Roles (v1 + v2 : components)
    CREATE TABLE IF NOT EXISTS reaction_roles (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '',
        role_id TEXT NOT NULL DEFAULT '',
        description TEXT,
        mode TEXT NOT NULL DEFAULT 'toggle',
        kind TEXT NOT NULL DEFAULT 'reaction',
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reaction_roles_message ON reaction_roles(guild_id, message_id);
    CREATE INDEX IF NOT EXISTS idx_reaction_roles_guild ON reaction_roles(guild_id);
    CREATE INDEX IF NOT EXISTS idx_reaction_roles_kind ON reaction_roles(guild_id, kind, message_id);

    -- Phase 9: Economy & Inventory
    CREATE TABLE IF NOT EXISTS user_economy (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        balance BIGINT NOT NULL DEFAULT 0,
        bank_balance BIGINT NOT NULL DEFAULT 0,
        last_daily_claim_at BIGINT,
        total_earned BIGINT NOT NULL DEFAULT 0,
        total_spent BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, guild_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_economy_guild ON user_economy(guild_id, balance DESC);

    CREATE TABLE IF NOT EXISTS economy_transactions (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount BIGINT NOT NULL,
        type TEXT NOT NULL,
        counterparty_id TEXT,
        reason TEXT,
        metadata TEXT,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_economy_tx_user ON economy_transactions(guild_id, user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_economy_tx_created ON economy_transactions(guild_id, created_at);

    CREATE TABLE IF NOT EXISTS shop_items (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        emoji TEXT,
        price BIGINT NOT NULL,
        role_reward_id TEXT,
        xp_reward BIGINT,
        is_tradeable INTEGER NOT NULL DEFAULT 1,
        is_droppable INTEGER NOT NULL DEFAULT 1,
        max_per_user INTEGER,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shop_items_guild ON shop_items(guild_id);

    CREATE TABLE IF NOT EXISTS user_inventory (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        acquired_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, guild_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_inventory_item ON user_inventory(guild_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON user_inventory(guild_id, user_id);

    CREATE TABLE IF NOT EXISTS inventory_drops (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        started_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        claimed_by TEXT,
        claimed_at BIGINT,
        status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_drops_status ON inventory_drops(guild_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_inventory_drops_message ON inventory_drops(message_id);

    CREATE TABLE IF NOT EXISTS inventory_transfers (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        type TEXT NOT NULL,
        price BIGINT,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_transfers_user ON inventory_transfers(guild_id, to_user_id, created_at);

    -- Phase 8: Sticky roles
    CREATE TABLE IF NOT EXISTS sticky_roles (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        saved_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, guild_id, role_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sticky_roles_user ON sticky_roles(guild_id, user_id);

    -- Phase 8: Guild stats cache (denormalized for fast dashboard reads)
    CREATE TABLE IF NOT EXISTS guild_stats (
        guild_id TEXT NOT NULL,
        stat_key TEXT NOT NULL,
        stat_value TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, stat_key)
    );

    -- Phase 11.1: Reminders
    CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        guild_id TEXT,
        channel_id TEXT,
        user_id TEXT NOT NULL,
        reminder_text TEXT NOT NULL,
        fire_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        source_message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status, fire_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, status, fire_at);

    -- Phase 11.2-3: Word triggers + Custom commands
    CREATE TABLE IF NOT EXISTS word_triggers (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        match_type TEXT NOT NULL DEFAULT 'exact',
        response_text TEXT,
        response_embed_json TEXT,
        exclude_channel_ids_json TEXT,
        exclude_role_ids_json TEXT,
        cooldown_seconds INTEGER NOT NULL DEFAULT 10,
        created_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_word_triggers_guild ON word_triggers(guild_id);

    CREATE TABLE IF NOT EXISTS custom_commands (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        response_text TEXT,
        response_embed_json TEXT,
        restrict_channel_ids_json TEXT,
        restrict_role_ids_json TEXT,
        cooldown_seconds INTEGER NOT NULL DEFAULT 5,
        created_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE (guild_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_custom_commands_guild ON custom_commands(guild_id);

    -- Phase 12b: Temp Voice (Join-to-Create)
    CREATE TABLE IF NOT EXISTS temp_voice_config (
        guild_id TEXT PRIMARY KEY,
        category_id TEXT,
        format TEXT NOT NULL DEFAULT '{user}''s game',
        delete_delay_seconds INTEGER NOT NULL DEFAULT 5,
        max_per_guild INTEGER NOT NULL DEFAULT 0,
        locked_role_id TEXT,
        join_channels_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS temp_voice_state (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        creator_id TEXT,
        last_empty_at BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_temp_voice_state_guild ON temp_voice_state(guild_id);

    -- Phase Auth & Sécurité Avancée
    CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        avatar_url TEXT,
        role TEXT NOT NULL DEFAULT 'viewer',
        refresh_token_hash TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        revoked_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(refresh_token_hash);

    CREATE TABLE IF NOT EXISTS auth_audit_logs (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        reason TEXT,
        metadata TEXT,
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_ip ON auth_audit_logs(ip_address, created_at);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user ON auth_audit_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_type ON auth_audit_logs(event_type, created_at);

    CREATE TABLE IF NOT EXISTS auth_failed_attempts (
        identifier TEXT PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        first_attempt_at BIGINT NOT NULL,
        last_attempt_at BIGINT NOT NULL,
        blocked_until BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_failed_blocked ON auth_failed_attempts(blocked_until);
