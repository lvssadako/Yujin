const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');

const SHOP_FILE = path.join(__dirname, '..', 'data', 'badgeShop.json');

function readShop() {
  if (!fs.existsSync(SHOP_FILE)) {
    const initial = {
      rotation: [],
      lastRotation: 0,
      rotationInterval: 24 * 60 * 60 * 1000,
      poolSize: 4
    };
    fs.writeFileSync(SHOP_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(SHOP_FILE, 'utf8'));
}

function writeShop(data) {
  fs.writeFileSync(SHOP_FILE, JSON.stringify(data, null, 2));
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

  const shuffled = shopBadges.sort(() => Math.random() - 0.5);
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
  // Primera verificación inmediata
  try {
    ensureRotation(getAllBadgesFn());
  } catch (e) {
    logger.warn('[SHOP] Error en rotación inicial:', e.message);
  }

  setInterval(() => {
    try {
      ensureRotation(getAllBadgesFn());
    } catch (e) {
      logger.warn('[SHOP] Error en rotación programada:', e.message);
    }
  }, 10 * 60 * 1000); // cada 10 minutos
}

module.exports = { readShop, writeShop, rotateShop, ensureRotation, scheduleShopRotation };