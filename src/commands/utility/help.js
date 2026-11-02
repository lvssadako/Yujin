const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, COLORS, clip } = require('../../utils/ui');
const { CATEGORIES, visibleCommands, buildHome, buildCategory, buildDetail } = require('../../utils/helpView');
const { isOwnerOrDev } = require('../../utils/staffAuth');
const logger = require('../../utils/logger');
const { createHelpArtwork } = require('../../utils/helpArtwork');

async function openHelp(target, prefix, query) {
  const user = prefix ? target.author : target.user;
  const entries = visibleCommands((target.client.commands || new Map()).values(), isOwnerOrDev(user.id));
  const artwork = createHelpArtwork();
  const reply = payload => target.reply(prefix ? payload : { ...payload, flags: 64 });
  if (query) {
    const entry = entries.find(command => command.name === String(query).replace(/^[\/&]/, '').toLowerCase());
    const embed = entry ? buildDetail(entry) : createEmbed(COLORS.warning).setTitle('No encontré ese comando').setDescription('Abre `/help` o `&help` y selecciona un comando disponible.');
    return reply({ embeds: [artwork.apply(embed)], files: artwork.files });
  }
  const categories = Object.entries(CATEGORIES).filter(([key]) => entries.some(entry => entry.category === key));
  let category = null;
  let page = 0;
  let detail = null;
  const home = artwork.apply(buildHome(entries));
  function components(disabled = false) {
    if (!categories.length) return [];
    const rows = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help_category_select').setPlaceholder('Explorar categorías').setDisabled(disabled)
      .addOptions(categories.map(([key, meta]) => ({ label: meta.name, value: key, description: meta.desc, emoji: meta.emoji, default: key === category }))))];
    const view = category ? buildCategory(entries, category, page) : null;
    if (view?.items.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help_command_select').setPlaceholder('Abrir guía de un comando').setDisabled(disabled)
      .addOptions(view.items.map(entry => ({ label: '/' + entry.name, value: entry.name, description: clip(entry.desc, 100), default: entry.name === detail })))));
    const buttons = [new ButtonBuilder().setCustomId('help_home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Primary).setDisabled(disabled || !category)];
    if (view) buttons.push(
      new ButtonBuilder().setCustomId('help_prev').setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(disabled || view.page === 0),
      new ButtonBuilder().setCustomId('help_next').setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(disabled || view.page === view.pages - 1));
    buttons.push(new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
    rows.push(new ActionRowBuilder().addComponents(buttons));
    return rows;
  }
  const result = await reply({ embeds: [home], components: components(), files: artwork.files });
  const message = result?.createMessageComponentCollector ? result : await target.fetchReply?.();
  if (!message?.createMessageComponentCollector) return;
  const collector = message.createMessageComponentCollector({ filter: interaction => interaction.user.id === user.id, time: 120000 });
  collector.on('collect', async interaction => {
    try {
      if (interaction.customId === 'help_close') {
        await interaction.update({ content: 'Panel cerrado. Usa /help o &help para abrirlo de nuevo.', embeds: [], components: [] });
        collector.stop('closed'); return;
      }
      if (interaction.customId === 'help_home') { category = null; detail = null; page = 0; }
      if (interaction.customId === 'help_category_select') {
        if (!categories.some(([key]) => key === interaction.values[0])) return interaction.deferUpdate();
        category = interaction.values[0]; page = 0; detail = null;
      }
      if (interaction.customId === 'help_prev') { page = Math.max(0, page - 1); detail = null; }
      if (interaction.customId === 'help_next') { page = Math.min(buildCategory(entries, category, page).pages - 1, page + 1); detail = null; }
      if (interaction.customId === 'help_command_select') {
        if (!buildCategory(entries, category, page).items.some(entry => entry.name === interaction.values[0])) return interaction.deferUpdate();
        detail = interaction.values[0];
      }
      const embed = detail ? buildDetail(entries.find(entry => entry.name === detail)) : category ? buildCategory(entries, category, page).embed : home;
      await interaction.update({ embeds: [artwork.apply(embed)], components: components() });
    } catch (error) { logger.error('[help] No se pudo actualizar el panel', { error: error.message }); }
  });
  collector.on('end', async (_, reason) => {
    if (reason === 'closed') return;
    await message.edit({ components: components(true) }).catch(() => {});
  });
}
module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Explora los comandos y consulta sus opciones y ejemplos.').addStringOption(option => option.setName('comando').setDescription('Nombre del comando que quieres consultar')),
  async execute(interaction) { return openHelp(interaction, false, interaction.options.getString('comando')); },
  async executePrefix(message, args) { return openHelp(message, true, args[0]); },
};
