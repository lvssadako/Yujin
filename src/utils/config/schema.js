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
  statusRoleTriggers: z.array(z.object({
    field: z.enum(['status']),
    includes: z.string(),
    roleId: z.string().regex(/^\d+$/)
  })).optional(),
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
