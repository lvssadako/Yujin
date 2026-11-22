const { z } = require('zod');

const ConfigSchema = z.object({
  token: z.string().min(1).optional(),
  clientId: z.string().regex(/^\d+$/).optional(),
  guildId: z.string().regex(/^\d+$/).optional(),
  vipRoleId: z.string().regex(/^\d+$/).optional(),
  boostChannelId: z.string().regex(/^\d+$/).optional(),
  boostAddedChannelId: z.string().regex(/^\d+$/).optional(),
  boostRemovedChannelId: z.string().regex(/^\d+$/).optional(),
  levelUpChannelId: z.string().regex(/^\d+$/).optional(),
  botLogChannelId: z.string().regex(/^\d+$/).optional(),
  statusRoleId: z.string().regex(/^\d+$/).optional(),
  coinEmoji: z.string().max(64).optional(),
  boosterPerks: z.object({
    enabled: z.boolean().optional(),
    xpBonus: z.number().min(0).max(2).optional(),
    coinBonus: z.number().min(0).max(3).optional(),
    dailyBonus: z.number().min(0).max(3).optional(),
    shopDiscount: z.number().min(0).max(45).optional()
  }).optional(),
  shopRoles: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]{3,32}$/),
    name: z.string().min(1).max(40),
    price: z.number().int().min(1).max(100000000),
    roleId: z.string().regex(/^\d+$/),
    days: z.number().int().min(0).max(365),
    description: z.string().max(120).optional()
  })).max(15).optional(),
  statusRoleTriggers: z.array(z.object({
    field: z.enum(['status', 'tag']),
    includes: z.string().optional().default(''),
    roleId: z.string().regex(/^\d+$/)
  }).refine(t => t.field === 'tag' || t.includes.trim().length > 0, { message: 'Un trigger de estado requiere "includes"' })).optional(),
  levelRewards: z.record(z.string(), z.string().regex(/^\d+$/)).optional(),
  roleXpBonuses: z.record(
    z.string(),
    z.number().min(0).max(10).refine(value => Number.isFinite(value), 'Multiplier must be a finite number')
  ).optional(),
  topRoles: z.record(z.string(), z.string().regex(/^\d+$/)).optional(),
  channels: z.record(z.string(), z.any()).optional(),
  menus: z.array(z.object({
    channelId: z.string().regex(/^\d+$/),
    messageId: z.string().regex(/^\d+$/)
  })).optional(),
  xpBoosts: z.record(z.string(), z.object({
    name: z.string(),
    multiplier: z.number().min(0).max(10),
    durationMs: z.number().min(0),
    price: z.number().min(0),
    description: z.string().optional()
  })).optional(),
  shopBundles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().min(0),
    description: z.string().optional(),
    featured: z.boolean().optional()
  })).optional(),
  shopFeatured: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().min(0),
    description: z.string().optional(),
    featured: z.boolean().optional()
  })).optional(),
  profileCard: z.object({
    scale: z.number().optional(),
    dpi: z.number().optional(),
    badgeSize: z.number().optional(),
    emojiSize: z.number().optional(),
    smoothing: z.string().optional()
  }).passthrough().optional(),
  colors: z.record(z.string(), z.object({
    name: z.string(),
    roleId: z.string().regex(/^\d+$/)
  })).optional()
}).passthrough();

module.exports = { ConfigSchema };
