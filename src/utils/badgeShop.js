const path = require('path');
const logger = require('./logger');
const { secureRandomInt } = require('./cryptoRandom');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');

const SHOP_FILE = path.join(__dirname, '../../data/badgeShop.json');

const DEFAULT_SHOP = {
  rotation: [],
  lastRotation: 0,
  rotationInterval: 24 * 60 * 60 * 1000, // 24h
  poolSize: 6
};

let shopRotationInterval = null;

function readShop() {
  return readJsonSafe(SHOP_FILE, { ...DEFAULT_SHOP });
}

function writeShop(data) {
  writeJsonAtomic(SHOP_FILE, data);
}

function rotateShop(allBadges) {
  const shop = readShop();
  const now = Date.now();

  // Filtrar badges válidos
  const shopBadges = Object.values(allBadges).filter(b =>
    b.type === 'shop' &&
    b.price > 0 &&
    ['common', 'rare', 'epic', 'legendary'].includes(b.rarity)
  );

  if (!shopBadges.length) {
    logger.warn('[SHOP] No hay badges válidos para rotar');
    return shop.rotation;
  }

  // Shuffle seguro con Fisher-Yates
  const shuffled = [...shopBadges];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const stockByRarity = { legendary: 1, epic: 2, rare: 3, common: 5 };

  shop.rotation = shuffled.slice(0, shop.poolSize).map(b => ({
    id: b.id,
    price: b.price,
    stock: stockByRarity[b.rarity] || 3,
    soldCount: 0
  }));

  shop.lastRotation = now;
  writeShop(shop);
  logger.info('[SHOP] Rotación realizada:', shop.rotation.map(r => r.id).join(', '));
  return shop.rotation;
}

// Forzar rotación si vencido
function ensureRotation(allBadges) {
  const shop = readShop();
  const now = Date.now();
  if (now - shop.lastRotation >= shop.rotationInterval || !shop.rotation.length) {
    rotateShop(allBadges);
  }
  return readShop();
}

// Programar rotación automática cada 10 min (verifica vencimiento)
function scheduleShopRotation(getAllBadgesFn) {
  if (shopRotationInterval) {
    clearInterval(shopRotationInterval);
  }

  try {
    ensureRotation(getAllBadgesFn());
  } catch (e) {
    logger.warn('[SHOP] Error en rotación inicial:', e.message);
  }

  shopRotationInterval = setInterval(() => {
    try {
      ensureRotation(getAllBadgesFn());
    } catch (e) {
      logger.warn('[SHOP] Error en rotación periódica:', e.message);
    }
  }, 10 * 60 * 1000);
}

function stopShopRotation() {
  if (shopRotationInterval) {
    clearInterval(shopRotationInterval);
    shopRotationInterval = null;
  }
}

module.exports = {
  readShop,
  writeShop,
  rotateShop,
  ensureRotation,
  scheduleShopRotation,
  stopShopRotation
};