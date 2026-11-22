const { getFinalPrice, getDiscountForUser, findItem } = require('./shopCatalog');

const asHours = ms => `${(ms / 3600000).toFixed(1)}h`;
const fmt = n => new Intl.NumberFormat('es-MX').format(n);

/**
 * Única ruta de compra de la tienda (antes duplicada en /shop, el botón y &shop).
 * Orden: validar → cobrar → entregar → reembolsar si la entrega falla.
 */
function createPurchaseService({ economy, grantBoost, leases, rerollMissions, missionsUntouched, validateRole, logger = { warn() {}, error() {} }, now = Date.now }) {
  const fail = error => ({ ok: false, error });

  async function precheck({ item, member, guild, userId, tz }) {
    if (item.kind === 'role') {
      if (!member) return 'No pude encontrarte en el servidor. Vuelve a intentarlo.';
      if (!validateRole(guild, item.roleId, 'shop role', { rejectDangerous: true }).valid) return 'Ese rol no está disponible ahora mismo (el staff debe revisar su configuración). No se te cobró nada.';
      if (member.roles.cache.has(item.roleId) && item.days <= 0) return 'Ya tienes este rol de forma permanente.';
    }
    if (item.kind === 'reroll' && !missionsUntouched(guild, userId, tz)) {
      return 'Solo puedes renovar tus misiones si aún no has avanzado ni cobrado ninguna. No se te cobró nada.';
    }
    return null;
  }

  async function deliver({ item, guild, member, userId, catalog, cfg, tz, price, userData, extraDiscount = 0 }) {
    const guildId = guild.id;
    const priceText = `${fmt(price)} 🪙${getDiscountForUser(item, userData, extraDiscount) > 0 ? ` (-${getDiscountForUser(item, userData, extraDiscount)}%)` : ''}`;
    switch (item.kind) {
      case 'bundle': {
        let granted = 0;
        for (const includedId of item.included || []) {
          const boost = findItem(catalog, includedId) || { ...((cfg.xpBoosts || {})[includedId] || {}), id: includedId };
          if (!boost.multiplier && !boost.durationMs && !boost.name) continue;
          grantBoost(guildId, userId, { id: includedId, multiplier: boost.multiplier, durationMs: boost.durationMs }, 1);
          granted += 1;
        }
        return { title: 'Pack comprado', summary: `✅ Compraste el pack **${item.name}**.`, fields: [{ name: 'Incluye', value: `${granted} boosts`, inline: true }, { name: 'Precio', value: priceText, inline: true }] };
      }
      case 'item':
        economy.addItem(guildId, userId, item.id, 1);
        return { title: 'Objeto comprado', summary: `✅ Compraste **${item.name}**.\n*${item.description}*`, fields: [{ name: 'Precio', value: priceText, inline: true }] };
      case 'role': {
        const lease = leases.grant({ guildId, userId, roleId: item.roleId, days: item.days });
        try { await member.roles.add(item.roleId, 'Compra en la tienda'); }
        catch (error) { leases.rollback({ guildId, userId, roleId: item.roleId, previous: lease.previous }); throw error; }
        const until = lease.permanent ? 'Permanente' : `<t:${Math.floor(lease.expiresAt / 1000)}:R> (<t:${Math.floor(lease.expiresAt / 1000)}:d>)`;
        return { title: 'Rol comprado', summary: `✅ Ya tienes el rol <@&${item.roleId}>.`, fields: [{ name: 'Vence', value: until, inline: true }, { name: 'Precio', value: priceText, inline: true }] };
      }
      case 'reroll':
        rerollMissions(guild, userId, tz);
        return { title: 'Misiones renovadas', summary: '✅ Tus misiones de hoy fueron reemplazadas. Míralas con `/daily`.', fields: [{ name: 'Precio', value: priceText, inline: true }] };
      default:
        grantBoost(guildId, userId, item, 1);
        return { title: 'Boost comprado', summary: `✅ Comprado: **${item.name}**`, fields: [{ name: 'Multiplicador', value: `${item.multiplier}x`, inline: true }, { name: 'Duración', value: asHours(item.durationMs), inline: true }, { name: 'Precio', value: priceText, inline: true }] };
    }
  }

  async function purchase({ guild, member, userId, item, catalog, cfg = {}, userData = {}, tz = 0, extraDiscount = 0 }) {
    if (!item) return fail('No encontré ese producto. Abre /shop para consultar los IDs disponibles.');
    const price = getFinalPrice(item, userData, extraDiscount);
    if (!Number.isSafeInteger(price) || price < 0) return fail('Este producto no está disponible por ahora.');
    const blocked = await precheck({ item, member, guild, userId, tz });
    if (blocked) return fail(blocked);
    if (economy.getBalance(guild.id, userId).coins < price) return fail(`No tienes suficientes monedas en la billetera (necesitas **${fmt(price)} 🪙**). Consulta /balance o retira con /bank withdraw.`);
    if (!economy.subtractCoins(guild.id, userId, price)) return fail('No pude completar la compra. Revisa tu saldo antes de intentarlo de nuevo.');
    try {
      const result = await deliver({ item, guild, member, userId, catalog, cfg, tz, price, userData, extraDiscount });
      return { ok: true, price, rarity: item.rarity, ...result };
    } catch (error) {
      economy.addCoins(guild.id, userId, price); // la entrega falló: se devuelve el dinero
      logger.error('[shop] Falló la entrega; compra reembolsada', { itemId: item.id, userId, error: error?.message });
      return fail('No pude entregarte el producto, así que **no se te cobró nada**. Inténtalo de nuevo o avisa al staff.');
    }
  }

  return { purchase, precheck };
}

let singleton = null;
function getPurchaseService() {
  if (!singleton) {
    const { economyService } = require('../economy');
    const missions = require('../../utils/dailyMissions');
    singleton = createPurchaseService({
      economy: economyService,
      grantBoost: require('./boostGrant').grantBoostToUser,
      leases: require('./shopRuntime').getLeaseStore(),
      rerollMissions: (guild, userId, tz) => missions.genDaily(guild, userId, tz),
      missionsUntouched: (guild, userId, tz) => missions.getDaily(guild, userId, tz).every(m => !m.completed && !m.claimed && !(m.progress > 0)),
      validateRole: require('../../utils/roleValidation').validateRoleForAssignment,
      logger: require('../../utils/logger')
    });
  }
  return singleton;
}

module.exports = { createPurchaseService, getPurchaseService };
