const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, SlashCommandBuilder, REST, Routes } = require('discord.js');
const tokens = require('./tokens.js');

// إعداد العميل للبوتات
const createBotClient = (intents = []) => {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMessageReactions,
            ...intents
        ]
    });
};

// بوت التذاكر (Tickets)
const ticketBot = createBotClient();
ticketBot.commands = new Collection();
ticketBot.activeTickets = new Collection();
ticketBot.adminRoles = new Collection(); // لحفظ رتب مشرفين التذاكر
ticketBot.logChannels = new Collection(); // لحفظ رومز سجلات التذاكر
ticketBot.cooldowns = new Map(); // لمنع الضغط المتكرر

// بوت التقييمات
const reviewBot = createBotClient();
reviewBot.reviewStats = new Collection();
reviewBot.reviewChannels = new Collection(); // لحفظ الرومز المخصصة للتقييم

// بوت مراقبة النشاط - يتم استيراده في index.js منفصلاً

// دالة إرسال سجلات التذاكر
const sendTicketLog = async (ticketChannel, closedBy, action) => {
    try {
        const guildId = ticketChannel.guild.id;
        const logChannelId = ticketBot.logChannels.get(guildId);
        
        if (!logChannelId) return; // لا يوجد روم سجلات محدد
        
        const logChannel = ticketChannel.guild.channels.cache.get(logChannelId);
        if (!logChannel) return; // روم السجلات غير موجود
        
        // جمع آخر 50 رسالة من التذكرة
        const messages = await ticketChannel.messages.fetch({ limit: 50 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        // إنشاء ملخص المحادثة
        let conversation = '';
        sortedMessages.forEach(msg => {
            if (msg.author.bot && msg.embeds.length > 0) {
                // تخطي رسائل البوت مع embeds
                return;
            }
            const timestamp = new Date(msg.createdTimestamp).toLocaleString('ar-SA');
            conversation += `[${timestamp}] ${msg.author.username}: ${msg.content || '[مرفق/embed]'}\n`;
        });
        
        // قص المحادثة إذا كانت طويلة جداً
        if (conversation.length > 4000) {
            conversation = conversation.substring(0, 4000) + '\n... (تم قص الرسائل الطويلة)';
        }
        
        const logEmbed = new EmbedBuilder()
            .setTitle('📋 سجل تذكرة')
            .addFields(
                { name: 'اسم التذكرة:', value: ticketChannel.name, inline: true },
                { name: 'الإجراء:', value: action, inline: true },
                { name: 'تم بواسطة:', value: `<@${closedBy.id}>`, inline: true },
                { name: 'التاريخ والوقت:', value: new Date().toLocaleString('ar-SA'), inline: false },
                { name: 'المحادثة:', value: conversation.length > 0 ? `\`\`\`\n${conversation}\n\`\`\`` : 'لا توجد رسائل', inline: false }
            )
            .setColor(0xe74c3c)
            .setTimestamp();
        
        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error('خطأ في إرسال سجل التذكرة:', error);
    }
};

// وظائف مساعدة للتذاكر
const createTicketMainEmbed = () => {
    return new EmbedBuilder()
        .setTitle('افتح تذكرتك واختار مايناسبك')
        .setDescription('فتح تذكرة من هنا')
        .setImage('attachment://ticket_banner.png')
        .setColor(0x000000)
        .setTimestamp();
};

const createTicketOptionsEmbed = () => {
    return new EmbedBuilder()
        .setTitle('فتح تذكرة من هنا')
        .setColor(0x2F3136);
};

const createTicketEmbed = (ticketType, description, user) => {
    const embed = new EmbedBuilder()
        .setTitle(`🎫 تذكرة جديدة - ${ticketType}`)
        .setDescription(description)
        .addFields(
            { name: 'نوع التذكرة:', value: ticketType, inline: true },
            { name: 'المستخدم:', value: `<@${user.id}>`, inline: true },
            { name: 'التاريخ:', value: new Date().toLocaleString('ar-SA'), inline: true }
        )
        .setColor(0x00AE86)
        .setImage('attachment://ticket_banner.png')
        .setTimestamp()
        .setFooter({ text: 'جميع الحقوق محفوظة لـ CEO Abdullah' });
    
    return embed;
};

// وظائف مساعدة للتقييمات
const createReviewEmbed = (rating, reviewerUser, reviewId, reviewCount) => {
    const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
    const currentDate = new Date().toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    return new EmbedBuilder()
        .setTitle('شكرًا على التقييم!')
        .addFields(
            { name: 'رسالة التقييم:', value: 'تم', inline: false },
            { name: 'التقييم:', value: stars, inline: false },
            { name: 'رقم التقييم:', value: reviewId.toString(), inline: false },
            { name: 'المقيم:', value: `<@${reviewerUser.id}>`, inline: false },
            { name: 'تاريخ التقييم:', value: currentDate, inline: false }
        )
        .setColor(0x00AE86)
        .setFooter({ 
            text: 'جميع الحقوق محفوظة لـ CEO Abdullah'
        });
};

// إنشاء embed تقييم مع النص الأصلي
const createReviewEmbedWithText = (rating, reviewerUser, reviewId, reviewCount, originalText) => {
    const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
    const currentDate = new Date().toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    return new EmbedBuilder()
        .setTitle('شكرًا على التقييم!')
        .addFields(
            { name: 'رسالة التقييم:', value: originalText || 'تم', inline: false },
            { name: 'التقييم:', value: stars, inline: false },
            { name: 'رقم التقييم:', value: reviewId.toString(), inline: false },
            { name: 'المقيم:', value: `<@${reviewerUser.id}>`, inline: false },
            { name: 'تاريخ التقييم:', value: currentDate, inline: false }
        )
        .setColor(0x00AE86)
        .setFooter({ 
            text: 'جميع الحقوق محفوظة لـ CEO Abdullah'
        });
};

// إنشاء الأزرار
const createTicketMainButton = () => {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket_menu')
                .setLabel('فتح تذكرة من هنا | Open Ticket Here')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );
    return row;
};

const createTicketOptionsButtons = () => {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_senior_complaint')
                .setLabel('استفسار | Inquiry')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('ticket_compensation')
                .setLabel('حل مشكلة تطبيق | App Solution')
                .setStyle(ButtonStyle.Secondary)
        );
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_transfer')
                .setLabel('حل مشكلة مع الدعم الفني | Technical Support')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('ticket_admin_complaint')
                .setLabel('حل مشكلة عامة | General Solution')
                .setStyle(ButtonStyle.Secondary)
        );
    return [row1, row2];
};

// إنشاء أزرار إدارة التذاكر
const createTicketManageButtons = () => {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('استلام التذكرة')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('قفل التذكرة')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );
    return row;
};

// إعداد slash commands للتذاكر
const ticketCommands = [
    new SlashCommandBuilder()
        .setName('تذكرة')
        .setDescription('فتح نظام التذاكر مع الأزرار التفاعلية'),
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Open the ticket system with interactive buttons'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('عرض قائمة الأوامر المتاحة')
        .setDescriptionLocalizations({
            'en-US': 'Show available commands list'
        }),
    new SlashCommandBuilder()
        .setName('مشرفين_التذاكر')
        .setDescription('إضافة أو إزالة رتب مشرفين التذاكر')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('إضافة أو إزالة رتبة')
                .setRequired(true)
                .addChoices(
                    { name: 'إضافة', value: 'add' },
                    { name: 'إزالة', value: 'remove' },
                    { name: 'عرض القائمة', value: 'list' }
                )
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('الرتبة المراد إضافتها أو إزالتها')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('ticket_admins')
        .setDescription('Add or remove ticket admin roles')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Add or remove role')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' },
                    { name: 'List', value: 'list' }
                )
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to add or remove')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('سجلات_التذاكر')
        .setDescription('تحديد روم سجلات التذاكر')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الروم الذي سيتم إرسال سجلات التذاكر فيه')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('ticket_logs')
        .setDescription('Set the channel for ticket logs')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where ticket logs will be sent')
                .setRequired(true)
        )
];

// إعداد slash commands للتقييمات
const reviewCommands = [
    new SlashCommandBuilder()
        .setName('تقييم')
        .setDescription('إرسال تقييم بالنجوم')
        .addIntegerOption(option =>
            option.setName('rating')
                .setDescription('التقييم من 1 إلى 5 نجوم')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5)
        ),
    new SlashCommandBuilder()
        .setName('review')
        .setDescription('Send a star rating')
        .addIntegerOption(option =>
            option.setName('rating')
                .setDescription('Rating from 1 to 5 stars')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(5)
        ),
    new SlashCommandBuilder()
        .setName('اختيار_روم_تقييم')
        .setDescription('اختيار الروم المخصص للتقييمات')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('الروم الذي سيتم تحويل الرسائل فيه إلى تقييمات')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('set_review_room')
        .setDescription('Set the room for automatic reviews')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where messages will be converted to reviews')
                .setRequired(true)
        )
];

// تسجيل slash commands للتذاكر (للعمل في جميع السيرفرات)
async function registerTicketCommands() {
    try {
        if (tokens.REMINDER_BOT_TOKEN && ticketBot.user) {
            const rest = new REST({ version: '10' }).setToken(tokens.REMINDER_BOT_TOKEN);
            
            console.log('بدء تسجيل slash commands للتذاكر...');
            
            // تسجيل الأوامر عالمياً
            await rest.put(
                Routes.applicationCommands(ticketBot.user.id),
                { body: ticketCommands }
            );
            
            // تسجيل الأوامر لكل سيرفر موجود (لظهور فوري)
            const guilds = ticketBot.guilds.cache;
            for (const [guildId, guild] of guilds) {
                try {
                    await rest.put(
                        Routes.applicationGuildCommands(ticketBot.user.id, guildId),
                        { body: ticketCommands }
                    );
                    console.log(`✅ تم تسجيل slash commands للتذاكر في ${guild.name}`);
                } catch (guildError) {
                    console.error(`خطأ في تسجيل commands لسيرفر ${guild.name}:`, guildError.message);
                }
            }
            
            console.log('✅ تم تسجيل slash commands للتذاكر بنجاح');
        }
    } catch (error) {
        console.error('خطأ في تسجيل slash commands للتذاكر:', error);
    }
}

// تسجيل slash commands للتقييمات (للعمل في جميع السيرفرات)
async function registerReviewCommands() {
    try {
        if (tokens.REVIEW_BOT_TOKEN && reviewBot.user) {
            const rest = new REST({ version: '10' }).setToken(tokens.REVIEW_BOT_TOKEN);
            
            console.log('بدء تسجيل slash commands للتقييمات...');
            
            // تسجيل الأوامر عالمياً
            await rest.put(
                Routes.applicationCommands(reviewBot.user.id),
                { body: reviewCommands }
            );
            
            // تسجيل الأوامر لكل سيرفر موجود (لظهور فوري)
            const guilds = reviewBot.guilds.cache;
            for (const [guildId, guild] of guilds) {
                try {
                    await rest.put(
                        Routes.applicationGuildCommands(reviewBot.user.id, guildId),
                        { body: reviewCommands }
                    );
                    console.log(`✅ تم تسجيل slash commands للتقييمات في ${guild.name}`);
                } catch (guildError) {
                    console.error(`خطأ في تسجيل commands لسيرفر ${guild.name}:`, guildError.message);
                }
            }
            
            console.log('✅ تم تسجيل slash commands للتقييمات بنجاح');
        }
    } catch (error) {
        console.error('خطأ في تسجيل slash commands للتقييمات:', error);
    }
}

// بوت التذاكر
ticketBot.once('clientReady', async () => {
    console.log(`بوت التذاكر جاهز! مسجل باسم ${ticketBot.user.tag}`);
    await registerTicketCommands();
});

// معالجة slash commands للتذاكر
// منع معالجة interactions متعددة  
const processedInteractions = new Map();

// تنظيف المعرفات القديمة كل دقيقة
setInterval(() => {
    const oneMinuteAgo = Date.now() - 60000;
    for (const [interactionId, timestamp] of processedInteractions.entries()) {
        if (timestamp < oneMinuteAgo) {
            processedInteractions.delete(interactionId);
        }
    }
}, 60000);

ticketBot.on('interactionCreate', async (interaction) => {
    // منع معالجة نفس interaction
    if (processedInteractions.has(interaction.id) || interaction.replied || interaction.deferred) {
        return;
    }
    
    processedInteractions.set(interaction.id, Date.now());
    
    // تسجيل التفاعل للتشخيص
    console.log('🔔 تفاعل جديد:', {
        type: interaction.type,
        customId: interaction.customId || 'N/A',
        commandName: interaction.commandName || 'N/A',
        user: interaction.user.username,
        guild: interaction.guild?.name || 'DM'
    });
    
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'تذكرة':
                case 'ticket':
                    const mainEmbed = createTicketMainEmbed();
                    const mainButton = createTicketMainButton();
                    
                    try {
                        // إرسال الصورة مع الembed
                        const { AttachmentBuilder } = require('discord.js');
                        const fs = require('fs');
                        
                        let replyOptions = { 
                            embeds: [mainEmbed], 
                            components: [mainButton]
                        };
                        
                        // فحص وجود الصورة قبل إرفاقها
                        if (fs.existsSync('attached_assets/ticket_banner.png')) {
                            const attachment = new AttachmentBuilder('attached_assets/ticket_banner.png', { name: 'ticket_banner.png' });
                            replyOptions.files = [attachment];
                        } else {
                            console.warn('⚠️ الصورة غير موجودة: attached_assets/ticket_banner.png');
                        }
                        
                        await interaction.reply(replyOptions);
                        console.log('✅ تم إرسال نظام التذاكر بنجاح');
                        
                    } catch (replyError) {
                        console.error('❌ خطأ في الرد على أمر التذكرة:', replyError.message);
                        if (!interaction.replied && !interaction.deferred) {
                            try {
                                await interaction.reply({ 
                                    content: 'حدث خطأ في عرض نظام التذاكر. حاول مرة أخرى.', 
                                    ephemeral: true 
                                });
                            } catch (fallbackError) {
                                console.error('❌ فشل في الرد الاحتياطي:', fallbackError.message);
                            }
                        }
                    }
                    break;

                case 'help':
                    const helpEmbed = new EmbedBuilder()
                        .setTitle('📋 أوامر بوت التذاكر')
                        .setDescription(
                            `**الأوامر المتاحة:**\n\n` +
                            `\`/تذكرة\` - فتح نظام التذاكر\n` +
                            `\`/ticket\` - Open ticket system (English)\n` +
                            `\`/مشرفين_التذاكر\` - إدارة رتب مشرفين التذاكر\n` +
                            `\`/ticket_admins\` - Manage ticket admin roles (English)\n` +
                            `\`/سجلات_التذاكر\` - تحديد روم سجلات التذاكر\n` +
                            `\`/ticket_logs\` - Set ticket logs channel (English)\n` +
                            `\`/help\` - عرض هذه القائمة`
                        )
                        .setColor(0x3498db);
                    
                    try {
                        await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
                    } catch (replyError) {
                        console.error('خطأ في الرد على أمر المساعدة:', replyError.message);
                    }
                    break;
                    
                case 'مشرفين_التذاكر':
                case 'ticket_admins':
                    const action = interaction.options.getString('action');
                    const role = interaction.options.getRole('role');
                    const guildId = interaction.guild.id;
                    
                    // الحصول على قائمة الرتب المحفوظة للسيرفر
                    let adminRoles = ticketBot.adminRoles.get(guildId) || [];
                    
                    if (action === 'add') {
                        if (!role) {
                            await interaction.reply({ content: 'يجب تحديد الرتبة المراد إضافتها', ephemeral: true });
                            break;
                        }
                        
                        if (adminRoles.includes(role.id)) {
                            try {
                                await interaction.reply({ content: `الرتبة ${role.name} موجودة بالفعل في قائمة مشرفين التذاكر`, ephemeral: true });
                            } catch (e) { console.log('خطأ في الرد'); }
                            break;
                        }
                        
                        adminRoles.push(role.id);
                        ticketBot.adminRoles.set(guildId, adminRoles);
                        
                        const addEmbed = new EmbedBuilder()
                            .setTitle('✅ تم إضافة رتبة مشرف تذاكر')
                            .setDescription(`تم إضافة الرتبة ${role} إلى قائمة مشرفين التذاكر`)
                            .setColor(0x00AE86);
                        
                        try {
                            await interaction.reply({ embeds: [addEmbed], ephemeral: true });
                        } catch (e) { console.log('خطأ في الرد'); }
                        
                    } else if (action === 'remove') {
                        if (!role) {
                            await interaction.reply({ content: 'يجب تحديد الرتبة المراد إزالتها', ephemeral: true });
                            break;
                        }
                        
                        const roleIndex = adminRoles.indexOf(role.id);
                        if (roleIndex === -1) {
                            await interaction.reply({ content: `الرتبة ${role.name} غير موجودة في قائمة مشرفين التذاكر`, ephemeral: true });
                            break;
                        }
                        
                        adminRoles.splice(roleIndex, 1);
                        ticketBot.adminRoles.set(guildId, adminRoles);
                        
                        const removeEmbed = new EmbedBuilder()
                            .setTitle('❌ تم إزالة رتبة مشرف تذاكر')
                            .setDescription(`تم إزالة الرتبة ${role} من قائمة مشرفين التذاكر`)
                            .setColor(0xe74c3c);
                        
                        try {
                            await interaction.reply({ embeds: [removeEmbed], ephemeral: true });
                        } catch (e) { console.log('خطأ في الرد'); }
                        
                    } else if (action === 'list') {
                        if (adminRoles.length === 0) {
                            await interaction.reply({ content: 'لا توجد رتب مشرفين تذاكر محددة حالياً', ephemeral: true });
                            break;
                        }
                        
                        const rolesList = adminRoles.map(roleId => {
                            const roleObj = interaction.guild.roles.cache.get(roleId);
                            return roleObj ? roleObj.toString() : `رتبة محذوفة (${roleId})`;
                        }).join('\n');
                        
                        const listEmbed = new EmbedBuilder()
                            .setTitle('👥 قائمة مشرفين التذاكر')
                            .setDescription(rolesList)
                            .setColor(0x3498db);
                        
                        try {
                            await interaction.reply({ embeds: [listEmbed], ephemeral: true });
                        } catch (e) { console.log('خطأ في الرد'); }
                    }
                    break;
                    
                case 'سجلات_التذاكر':
                case 'ticket_logs':
                    const logChannel = interaction.options.getChannel('channel');
                    const logGuildId = interaction.guild.id;
                    
                    // حفظ الروم المخصص للسجلات
                    ticketBot.logChannels.set(logGuildId, logChannel.id);
                    
                    const logEmbed = new EmbedBuilder()
                        .setTitle('✅ تم تحديد روم سجلات التذاكر')
                        .setDescription(`تم تحديد ${logChannel} كروم لسجلات التذاكر.\nسيتم إرسال جميع سجلات التذاكر إلى هذا الروم.`)
                        .setColor(0x00AE86);
                    
                    try {
                        await interaction.reply({ embeds: [logEmbed], ephemeral: true });
                    } catch (e) { console.log('خطأ في الرد'); }
                    break;
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة slash command:', {
                error: error.message || error,
                commandName: interaction.commandName,
                user: interaction.user.username,
                guild: interaction.guild?.name
            });
            
            // محاولة الرد على الأخطاء إذا لم يتم الرد بعد
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'حدث خطأ أثناء تنفيذ الأمر. حاول مرة أخرى.', 
                        ephemeral: true 
                    });
                } catch (replyError) {
                    console.error('❌ فشل في الرد على الخطأ:', replyError.message);
                }
            }
        }
    } else if (interaction.isButton()) {
        try {
            switch (interaction.customId) {
                case 'open_ticket_menu':
                    try {
                        const optionsEmbed = createTicketOptionsEmbed();
                        const optionsButtons = createTicketOptionsButtons();
                        
                        await interaction.update({ 
                            embeds: [optionsEmbed], 
                            components: optionsButtons 
                        });
                    } catch (updateError) {
                        console.error('خطأ في تحديث قائمة التذاكر:', updateError.message);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ 
                                content: 'حدث خطأ في عرض قائمة التذاكر. حاول مرة أخرى.', 
                                ephemeral: true 
                            }).catch(() => {});
                        }
                    }
                    break;

                case 'ticket_senior_complaint':
                    // فحص cooldown لمنع إنشاء تذاكر متعددة
                    const seniorComplaintUserId = interaction.user.id;
                    const seniorComplaintCooldownKey = `${seniorComplaintUserId}-ticket`;
                    const seniorComplaintNow = Date.now();
                    const seniorComplaintCooldownAmount = 10000; // 10 ثوان
                    
                    if (ticketBot.cooldowns.has(seniorComplaintCooldownKey)) {
                        const seniorComplaintExpirationTime = ticketBot.cooldowns.get(seniorComplaintCooldownKey) + seniorComplaintCooldownAmount;
                        
                        if (seniorComplaintNow < seniorComplaintExpirationTime) {
                            const seniorComplaintTimeLeft = (seniorComplaintExpirationTime - seniorComplaintNow) / 1000;
                            await interaction.reply({ 
                                content: `يجب الانتظار ${seniorComplaintTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, 
                                ephemeral: true 
                            });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(seniorComplaintCooldownKey, seniorComplaintNow);
                    setTimeout(() => ticketBot.cooldowns.delete(seniorComplaintCooldownKey), seniorComplaintCooldownAmount);
                    
                    // إنشاء روم تذكرة جديد
                    const seniorComplaintAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const seniorComplaintPermissionOverwrites = [
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                    ];
                    
                    // إضافة رتب المشرفين
                    seniorComplaintAdminRoles.forEach(roleId => {
                        seniorComplaintPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const seniorComplaintChannel = await interaction.guild.channels.create({
                        name: `شكوى-ادارة-عليا-${interaction.user.username}`,
                        type: 0, // text channel
                        parent: null, // يمكن تحديد category إذا أردت
                        permissionOverwrites: seniorComplaintPermissionOverwrites,
                    });
                    
                    const seniorComplaintEmbed = createTicketEmbed(
                        'شكوى على ادارة عليا',
                        'هذه التذكرة مخصصة لتقديم شكاوى على الإدارة العليا',
                        interaction.user
                    );
                    
                    // إرسال رسالة في الروم الجديد مع أزرار الإدارة
                    const seniorComplaintManageButtons = createTicketManageButtons();
                    
                    try {
                        // إرسال الصورة مع الembed في التذكرة
                        const fs = require('fs');
                        let ticketMessageOptions = { embeds: [seniorComplaintEmbed], components: [seniorComplaintManageButtons] };
                        
                        if (fs.existsSync('attached_assets/ticket_banner.png')) {
                            const { AttachmentBuilder } = require('discord.js');
                            const attachment = new AttachmentBuilder('attached_assets/ticket_banner.png', { name: 'ticket_banner.png' });
                            ticketMessageOptions.files = [attachment];
                        }
                        
                        await seniorComplaintChannel.send(ticketMessageOptions);
                        console.log('✅ تم إنشاء تذكرة شكوى على إدارة عليا بنجاح');
                    } catch (sendError) {
                        console.error('❌ خطأ في إرسال رسالة التذكرة:', sendError.message);
                        // رسالة احتياطية بدون صورة
                        await seniorComplaintChannel.send({ embeds: [seniorComplaintEmbed], components: [seniorComplaintManageButtons] });
                    }
                    
                    await interaction.reply({ 
                        content: `تم إنشاء تذكرة شكوى على ادارة عليا في ${seniorComplaintChannel}`, 
                        ephemeral: true 
                    });
                    break;

                case 'ticket_compensation':
                    // فحص cooldown لمنع إنشاء تذاكر متعددة
                    const compensationUserId = interaction.user.id;
                    const compensationCooldownKey = `${compensationUserId}-ticket`;
                    const compensationNow = Date.now();
                    const compensationCooldownAmount = 10000; // 10 ثوان
                    
                    if (ticketBot.cooldowns.has(compensationCooldownKey)) {
                        const compensationExpirationTime = ticketBot.cooldowns.get(compensationCooldownKey) + compensationCooldownAmount;
                        
                        if (compensationNow < compensationExpirationTime) {
                            const compensationTimeLeft = (compensationExpirationTime - compensationNow) / 1000;
                            await interaction.reply({ 
                                content: `يجب الانتظار ${compensationTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, 
                                ephemeral: true 
                            });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(compensationCooldownKey, compensationNow);
                    setTimeout(() => ticketBot.cooldowns.delete(compensationCooldownKey), compensationCooldownAmount);
                    
                    // إنشاء روم تذكرة جديد
                    const compensationGuildAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const compensationPermissionOverwrites = [
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                    ];
                    
                    // إضافة رتب المشرفين
                    compensationGuildAdminRoles.forEach(roleId => {
                        compensationPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const compensationChannel = await interaction.guild.channels.create({
                        name: `تعويض-${interaction.user.username}`,
                        type: 0, // text channel
                        parent: null, // يمكن تحديد category إذا أردت
                        permissionOverwrites: compensationPermissionOverwrites,
                    });
                    
                    const compensationEmbed = createTicketEmbed(
                        'تعويض',
                        'هذه التذكرة مخصصة لطلب التعويض',
                        interaction.user
                    );
                    
                    // إرسال رسالة في الروم الجديد مع أزرار الإدارة
                    const compensationManageButtons = createTicketManageButtons();
                    
                    try {
                        // إرسال الصورة مع الembed في التذكرة
                        const fs = require('fs');
                        let ticketMessageOptions = { embeds: [compensationEmbed], components: [compensationManageButtons] };
                        
                        if (fs.existsSync('attached_assets/ticket_banner.png')) {
                            const { AttachmentBuilder } = require('discord.js');
                            const attachment = new AttachmentBuilder('attached_assets/ticket_banner.png', { name: 'ticket_banner.png' });
                            ticketMessageOptions.files = [attachment];
                        }
                        
                        await compensationChannel.send(ticketMessageOptions);
                        console.log('✅ تم إنشاء تذكرة تعويض بنجاح');
                    } catch (sendError) {
                        console.error('❌ خطأ في إرسال رسالة التذكرة:', sendError.message);
                        // رسالة احتياطية بدون صورة
                        await compensationChannel.send({ embeds: [compensationEmbed], components: [compensationManageButtons] });
                    }
                    
                    await interaction.reply({ 
                        content: `تم إنشاء تذكرة تعويض في ${compensationChannel}`, 
                        ephemeral: true 
                    });
                    break;

                case 'ticket_transfer':
                    // فحص cooldown لمنع إنشاء تذاكر متعددة
                    const transferUserId = interaction.user.id;
                    const transferCooldownKey = `${transferUserId}-ticket`;
                    const transferNow = Date.now();
                    const transferCooldownAmount = 10000; // 10 ثوان
                    
                    if (ticketBot.cooldowns.has(transferCooldownKey)) {
                        const transferExpirationTime = ticketBot.cooldowns.get(transferCooldownKey) + transferCooldownAmount;
                        
                        if (transferNow < transferExpirationTime) {
                            const transferTimeLeft = (transferExpirationTime - transferNow) / 1000;
                            await interaction.reply({ 
                                content: `يجب الانتظار ${transferTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, 
                                ephemeral: true 
                            });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(transferCooldownKey, transferNow);
                    setTimeout(() => ticketBot.cooldowns.delete(transferCooldownKey), transferCooldownAmount);
                    
                    // إنشاء روم تذكرة جديد
                    const transferGuildAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const transferPermissionOverwrites = [
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                    ];
                    
                    // إضافة رتب المشرفين
                    transferGuildAdminRoles.forEach(roleId => {
                        transferPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const transferChannel = await interaction.guild.channels.create({
                        name: `نقل-${interaction.user.username}`,
                        type: 0, // text channel
                        parent: null, // يمكن تحديد category إذا أردت
                        permissionOverwrites: transferPermissionOverwrites,
                    });
                    
                    const transferEmbed = createTicketEmbed(
                        'نقل',
                        'هذه التذكرة مخصصة لطلبات النقل',
                        interaction.user
                    );
                    
                    // إرسال رسالة في الروم الجديد مع أزرار الإدارة
                    const transferManageButtons = createTicketManageButtons();
                    
                    try {
                        // إرسال الصورة مع الembed في التذكرة
                        const fs = require('fs');
                        let ticketMessageOptions = { embeds: [transferEmbed], components: [transferManageButtons] };
                        
                        if (fs.existsSync('attached_assets/ticket_banner.png')) {
                            const { AttachmentBuilder } = require('discord.js');
                            const attachment = new AttachmentBuilder('attached_assets/ticket_banner.png', { name: 'ticket_banner.png' });
                            ticketMessageOptions.files = [attachment];
                        }
                        
                        await transferChannel.send(ticketMessageOptions);
                        console.log('✅ تم إنشاء تذكرة نقل بنجاح');
                    } catch (sendError) {
                        console.error('❌ خطأ في إرسال رسالة التذكرة:', sendError.message);
                        // رسالة احتياطية بدون صورة
                        await transferChannel.send({ embeds: [transferEmbed], components: [transferManageButtons] });
                    }
                    
                    await interaction.reply({ 
                        content: `تم إنشاء تذكرة نقل في ${transferChannel}`, 
                        ephemeral: true 
                    });
                    break;

                case 'ticket_admin_complaint':
                    // فحص cooldown لمنع إنشاء تذاكر متعددة
                    const adminComplaintUserId = interaction.user.id;
                    const adminComplaintCooldownKey = `${adminComplaintUserId}-ticket`;
                    const adminComplaintNow = Date.now();
                    const adminComplaintCooldownAmount = 10000; // 10 ثوان
                    
                    if (ticketBot.cooldowns.has(adminComplaintCooldownKey)) {
                        const adminComplaintExpirationTime = ticketBot.cooldowns.get(adminComplaintCooldownKey) + adminComplaintCooldownAmount;
                        
                        if (adminComplaintNow < adminComplaintExpirationTime) {
                            const adminComplaintTimeLeft = (adminComplaintExpirationTime - adminComplaintNow) / 1000;
                            await interaction.reply({ 
                                content: `يجب الانتظار ${adminComplaintTimeLeft.toFixed(1)} ثانية قبل إنشاء تذكرة جديدة.`, 
                                ephemeral: true 
                            });
                            break;
                        }
                    }
                    
                    ticketBot.cooldowns.set(adminComplaintCooldownKey, adminComplaintNow);
                    setTimeout(() => ticketBot.cooldowns.delete(adminComplaintCooldownKey), adminComplaintCooldownAmount);
                    
                    // إنشاء روم تذكرة جديد
                    const adminComplaintGuildAdminRoles = ticketBot.adminRoles.get(interaction.guild.id) || [];
                    const adminComplaintPermissionOverwrites = [
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                    ];
                    
                    // إضافة رتب المشرفين
                    adminComplaintGuildAdminRoles.forEach(roleId => {
                        adminComplaintPermissionOverwrites.push({
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'],
                        });
                    });
                    
                    const adminComplaintChannel = await interaction.guild.channels.create({
                        name: `شكوى-إداري-${interaction.user.username}`,
                        type: 0, // text channel
                        parent: null, // يمكن تحديد category إذا أردت
                        permissionOverwrites: adminComplaintPermissionOverwrites,
                    });
                    
                    const adminComplaintEmbed = createTicketEmbed(
                        'شكوى على إداري',
                        'هذه التذكرة مخصصة لتقديم شكاوى على الإداريين',
                        interaction.user
                    );
                    
                    // إرسال رسالة في الروم الجديد مع أزرار الإدارة
                    const adminComplaintManageButtons = createTicketManageButtons();
                    
                    try {
                        // إرسال الصورة مع الembed في التذكرة
                        const fs = require('fs');
                        let ticketMessageOptions = { embeds: [adminComplaintEmbed], components: [adminComplaintManageButtons] };
                        
                        if (fs.existsSync('attached_assets/ticket_banner.png')) {
                            const { AttachmentBuilder } = require('discord.js');
                            const attachment = new AttachmentBuilder('attached_assets/ticket_banner.png', { name: 'ticket_banner.png' });
                            ticketMessageOptions.files = [attachment];
                        }
                        
                        await adminComplaintChannel.send(ticketMessageOptions);
                        console.log('✅ تم إنشاء تذكرة شكوى على إداري بنجاح');
                    } catch (sendError) {
                        console.error('❌ خطأ في إرسال رسالة التذكرة:', sendError.message);
                        // رسالة احتياطية بدون صورة
                        await adminComplaintChannel.send({ embeds: [adminComplaintEmbed], components: [adminComplaintManageButtons] });
                    }
                    
                    await interaction.reply({ 
                        content: `تم إنشاء تذكرة شكوى على إداري في ${adminComplaintChannel}`, 
                        ephemeral: true 
                    });
                    break;

                case 'claim_ticket':
                    // التحقق من أن المستخدم مشرف تذاكر
                    const claimGuildId = interaction.guild.id;
                    const claimAdminRoles = ticketBot.adminRoles.get(claimGuildId) || [];
                    const claimUserRoles = interaction.member.roles.cache.map(role => role.id);
                    const claimIsAdmin = claimAdminRoles.some(roleId => claimUserRoles.includes(roleId)) || interaction.member.permissions.has('ManageChannels');
                    
                    if (!claimIsAdmin) {
                        await interaction.reply({ content: 'لا يمكنك استلام التذاكر. هذه الميزة مخصصة للمشرفين فقط.', ephemeral: true });
                        break;
                    }
                    
                    const claimEmbed = new EmbedBuilder()
                        .setTitle('👤 تم استلام التذكرة')
                        .setDescription(`تم استلام هذه التذكرة من قبل ${interaction.user}\nسيتم التعامل معها في أقرب وقت.`)
                        .setColor(0x3498db)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [claimEmbed] });
                    break;
                    
                case 'close_ticket':
                    // التحقق من أن المستخدم مشرف تذاكر
                    const closeGuildId = interaction.guild.id;
                    const closeAdminRoles = ticketBot.adminRoles.get(closeGuildId) || [];
                    const closeUserRoles = interaction.member.roles.cache.map(role => role.id);
                    const closeIsAdmin = closeAdminRoles.some(roleId => closeUserRoles.includes(roleId)) || interaction.member.permissions.has('ManageChannels');
                    
                    if (!closeIsAdmin) {
                        await interaction.reply({ content: 'لا يمكنك قفل التذكرة. هذه الميزة مخصصة للمشرفين فقط.', ephemeral: true });
                        break;
                    }
                    
                    const closeEmbed = new EmbedBuilder()
                        .setTitle('🔒 جاري قفل التذكرة')
                        .setDescription('سيتم قفل هذه التذكرة في غضون 10 ثوان...')
                        .setColor(0xe74c3c)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [closeEmbed] });
                    
                    // إرسال السجل قبل الحذف
                    try {
                        await sendTicketLog(interaction.channel, interaction.user, 'قفل التذكرة');
                    } catch (logError) {
                        console.error('خطأ في إرسال سجل التذكرة:', logError);
                    }
                    
                    // حذف القناة بعد 10 ثوان
                    setTimeout(async () => {
                        try {
                            await interaction.channel.delete();
                        } catch (error) {
                            console.error('خطأ في حذف قناة التذكرة:', error);
                        }
                    }, 10000);
                    break;
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة الأزرار:', {
                error: error.message || error,
                customId: interaction.customId,
                user: interaction.user.username,
                guild: interaction.guild?.name,
                stack: error.stack
            });
            
            // محاولة الرد على الأخطاء إذا لم يتم الرد بعد
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'حدث خطأ أثناء معالجة طلبك. حاول مرة أخرى.', 
                        ephemeral: true 
                    });
                } catch (replyError) {
                    console.error('❌ فشل في الرد على خطأ الزر:', replyError.message);
                }
            }
        }
    }
});

// بوت التقييمات
reviewBot.once('clientReady', async () => {
    console.log(`بوت التقييمات جاهز! مسجل باسم ${reviewBot.user.tag}`);
    await registerReviewCommands();
});

// معالجة slash commands للتقييمات
reviewBot.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === 'تقييم' || commandName === 'review') {
            const rating = interaction.options.getInteger('rating');
            
            // الحصول على إحصائيات التقييم للمستخدم
            const userId = interaction.user.id;
            let userStats = reviewBot.reviewStats.get(userId) || { count: 0, lastReviewId: 2000 };
            userStats.count++;
            userStats.lastReviewId++;
            reviewBot.reviewStats.set(userId, userStats);
            
            // إنشاء embed التقييم
            const reviewEmbed = createReviewEmbed(rating, interaction.user, userStats.lastReviewId, userStats.count);
            
            // إرسال التقييم
            await interaction.reply({ embeds: [reviewEmbed] });
        } else if (commandName === 'اختيار_روم_تقييم' || commandName === 'set_review_room') {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guild.id;
            
            // حفظ الروم المخصص للتقييم
            reviewBot.reviewChannels.set(guildId, channel.id);
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تم تحديد روم التقييم')
                .setDescription(`تم تحديد ${channel} كروم للتقييمات.\nالآن أي رسالة ترسل في هذا الروم ستتحول تلقائياً إلى تقييم.`)
                .setColor(0x00AE86);
            
            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        }
    } catch (error) {
        console.error('خطأ في بوت التقييمات:', error);
        if (!interaction.replied) {
            await interaction.reply({ content: 'حدث خطأ أثناء إرسال التقييم', ephemeral: true });
        }
    }
});

// بوت التقييم يعمل في الروم المحددة أو القنوات المسماة للتقييم
reviewBot.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const guildId = message.guild?.id;
    const channelId = message.channel.id;
    
    // التحقق إذا كان هذا الروم محدد للتقييمات
    const selectedReviewChannel = reviewBot.reviewChannels.get(guildId);
    const isSelectedChannel = selectedReviewChannel === channelId;
    
    // أو التحقق إذا كانت القناة تحتوي على كلمة "تقييم" أو "review" في الاسم
    const channelName = message.channel.name ? message.channel.name.toLowerCase() : '';
    const isReviewChannel = channelName.includes('تقييم') || 
                           channelName.includes('review') || 
                           channelName.includes('rating') ||
                           channelName.includes('feedback');
    
    // أو إذا كانت الرسالة تحتوي على رقم من 1-5 فقط
    const isRatingMessage = /^[1-5]$/.test(message.content.trim());
    
    if (isSelectedChannel || isReviewChannel || isRatingMessage) {
        try {
            // حذف الرسالة الأصلية
            await message.delete().catch(() => {});
            
            // استخراج التقييم
            let rating;
            const ratingMatch = message.content.match(/[1-5]/);
            if (ratingMatch) {
                rating = parseInt(ratingMatch[0]);
            } else {
                // إذا لم يكن هناك رقم محدد، أعطي تقييم حسب طول النص
                const textLength = message.content.length;
                if (textLength > 50) rating = 5;
                else if (textLength > 30) rating = 4;
                else if (textLength > 15) rating = 3;
                else if (textLength > 5) rating = 2;
                else rating = 1;
            }
            
            // الحصول على إحصائيات التقييم للمستخدم
            const userId = message.author.id;
            let userStats = reviewBot.reviewStats.get(userId) || { count: 0, lastReviewId: 2000 };
            userStats.count++;
            userStats.lastReviewId++;
            reviewBot.reviewStats.set(userId, userStats);
            
            // إنشاء embed التقييم مع النص الأصلي
            const reviewEmbed = createReviewEmbedWithText(rating, message.author, userStats.lastReviewId, userStats.count, message.content);
            
            // إرسال التقييم
            await message.channel.send({ embeds: [reviewEmbed] });
            
        } catch (error) {
            console.error('خطأ في بوت التقييمات:', error);
        }
    }
});

module.exports = {
    ticketBot,
    reviewBot,
    createTicketMainEmbed,
    createTicketOptionsEmbed,
    createTicketEmbed,
    createReviewEmbed,
    registerTicketCommands,
    registerReviewCommands
};