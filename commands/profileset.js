const { SlashCommandBuilder } = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');

module.exports = {
  name: 'profileset',
  description: 'Configura tu perfil (título, color, fondo)',
  data: new SlashCommandBuilder()
    .setName('profileset')
    .setDescription('Configura tu perfil')
    .addStringOption(o => o.setName('title').setDescription('Título bajo tu nombre').setRequired(false).setMaxLength(32))
    .addStringOption(o => o.setName('accent').setDescription('Color acento (hex ej. #e94560)').setRequired(false))
    .addStringOption(o => o.setName('bg').setDescription('URL de imagen de fondo').setRequired(false))
    .addNumberOption(o => o.setName('opacity').setDescription('Opacidad del fondo (0.1 a 1.0)').setRequired(false).setMinValue(0.1).setMaxValue(1.0)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

       // Verificar si es booster
    const member = interaction.member;
    const boosterRole = interaction.guild.roles.premiumSubscriberRole;
    const isBooster = Boolean(member.premiumSince) || (boosterRole && member.roles.cache.has(boosterRole.id));
    
    if (!isBooster) {
      return interaction.editReply('❌ Este comando es exclusivo para **Boosters** del servidor. 🚀');
    }
    
    const title = interaction.options.getString('title');
    const accent = interaction.options.getString('accent');
    let bg = interaction.options.getString('bg');
    const opacity = interaction.options.getNumber('opacity');

    // Limpiar query params de Discord CDN
    if (bg && /cdn\.discordapp\.com|media\.discordapp\.net/.test(bg)) {
      bg = bg.split('?')[0];
      console.log('[profileset] URL limpiada:', bg);
    }

    const profiles = readProfiles();
    const user = ensureUser(profiles, interaction.guildId, interaction.user.id);
    
    if (title !== null) user.title = title || '';
    if (accent !== null) {
      user.accent = /^#?[0-9a-f]{6}$/i.test(accent || '') 
        ? (accent.startsWith('#') ? accent : '#' + accent) 
        : user.accent;
    }
    if (bg !== null) user.bgUrl = bg || '';
    if (opacity !== null) user.bgOpacity = opacity;

    writeProfiles(profiles);
    
    let msg = '✅ Perfil actualizado.';
    if (bg) msg += '\n🖼️ Fondo actualizado (URL limpiada).';
    if (opacity !== null) msg += `\n🎨 Opacidad: ${Math.round(opacity * 100)}%`;
    
    return interaction.editReply(msg);
  }
};