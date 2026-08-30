const logger = require('../src/utils/logger');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos del bot (Administrador only).')
    .addStringOption(opt => opt.setName('comando').setDescription('Nombre de un comando para ver detalles').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // sólo administradores pueden ejecutar
  async execute(interaction, client) {
    try {
      // seguridad extra: comprobar permisos aunque el builder ya lo limita
      if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Sólo administradores pueden usar este comando.', ephemeral: true });
      }

      const query = interaction.options.getString('comando');
      const commands = Array.from((client.commands || client.slashCommands || new Map()).values());

      // Si piden un comando específico
      if (query) {
        const cmd = commands.find(c =>
          (c.data && c.data.name && c.data.name.toLowerCase() === query.toLowerCase()) ||
          (c.name && c.name.toLowerCase() === query.toLowerCase())
        );
        if (!cmd) {
          return interaction.reply({ content: `❌ Comando no encontrado: \`${query}\``, ephemeral: true });
        }

        const detail = new EmbedBuilder()
          .setTitle(`Help — ${cmd.data?.name || cmd.name}`)
          .setDescription(cmd.data?.description || cmd.description || 'Sin descripción')
          .addFields(
            { name: 'Uso / Ejemplo', value: cmd.usage || `/${cmd.data?.name || cmd.name}`, inline: false },
            { name: 'Requiere permisos', value: cmd.data?.defaultMemberPermissions ? String(cmd.data.defaultMemberPermissions) : 'Ninguno', inline: true }
          )
          .setTimestamp();

        return interaction.reply({ embeds: [detail], ephemeral: true });
      }

      // Agrupar comandos por categoría si existe, sino 'General'
      const grouped = {};
      for (const c of commands) {
        const cat = (c.category || (c.data && c.data.category) || 'General');
        grouped[cat] = grouped[cat] || [];
        grouped[cat].push(c);
      }

      // Crear páginas: cada página mostrará hasta 6 comandos (ajustable)
      const pages = [];
      const pageSize = 6;
      const flat = [];
      for (const [cat, list] of Object.entries(grouped)) {
        for (const cmd of list) {
          flat.push({ name: cmd.data?.name || cmd.name, desc: cmd.data?.description || cmd.description || 'Sin descripción', category: cat });
        }
      }
      for (let i = 0; i < flat.length; i += pageSize) {
        const slice = flat.slice(i, i + pageSize);
        const emb = new EmbedBuilder()
          .setTitle('Help — Comandos')
          .setColor(0x5865F2)
          .setFooter({ text: `Página ${Math.floor(i / pageSize) + 1} / ${Math.ceil(flat.length / pageSize)}` })
          .setTimestamp();

        for (const item of slice) {
          emb.addFields({ name: `/${item.name} — ${item.category}`, value: item.desc, inline: false });
        }
        pages.push(emb);
      }

      if (pages.length === 0) {
        return interaction.reply({ content: 'No hay comandos cargados.', ephemeral: true });
      }

      // Componentes de paginación
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev_help').setLabel('◀️ Anterior').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('next_help').setLabel('Siguiente ▶️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_help').setLabel('Cerrar ❌').setStyle(ButtonStyle.Danger)
      );

      let pageIndex = 0;
      await interaction.reply({ embeds: [pages[pageIndex]], components: [row], ephemeral: true });

      const msg = await interaction.fetchReply();

      const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 120_000 // 2 minutos
      });

      collector.on('collect', async i => {
        if (i.customId === 'prev_help') {
          pageIndex = (pageIndex - 1 + pages.length) % pages.length;
          await i.update({ embeds: [pages[pageIndex]], components: [row] });
        } else if (i.customId === 'next_help') {
          pageIndex = (pageIndex + 1) % pages.length;
          await i.update({ embeds: [pages[pageIndex]], components: [row] });
        } else if (i.customId === 'close_help') {
          await i.update({ content: 'Comando help cerrado.', embeds: [], components: [] });
          collector.stop();
        }
      });

      collector.on('end', async () => {
        try { await msg.edit({ components: [] }); } catch {}
      });

    } catch (err) {
      logger.error('help command error:', err);
      try {
        if (!interaction.replied) await interaction.reply({ content: '❌ Error interno.', ephemeral: true });
      } catch {}
    }
  }
};