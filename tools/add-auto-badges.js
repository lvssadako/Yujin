const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'profile.json');

const raw = fs.readFileSync(file, 'utf8');
const data = JSON.parse(raw);

data.badges = data.badges || {};

function add(id, badge) {
  if (!data.badges[id]) {
    data.badges[id] = badge;
    console.log('Añadido badge', id);
  } else {
    console.log('Saltado (ya existe)', id);
  }
}

add('chatter', {
  id: 'chatter',
  name: 'Hablador',
  icon: '<:discotoolsxyzicon50:1438545909448183818>',
  desc: '1000 mensajes',
  type: 'achievement',
  autoGrant: { minMessages: 1000 }
});

add('level30', {
  id: 'level30',
  name: 'Nivel 30',
  icon: '<:30:1438546605807767683>',
  desc: 'Alcanzar nivel 30',
  type: 'achievement',
  autoGrant: { minLevel: 30 }
});

add('voice100h', {
  id: 'voice100h',
  name: 'Voz 100h',
  icon: '<:voice100:1438545907137122385>',
  desc: '6000 minutos en voz',
  type: 'achievement',
  autoGrant: { minVoiceMinutes: 6000 }
});

add('streak7', {
  id: 'streak7',
  name: 'Racha 7',
  icon: '<:streak:1438540511148507167>',
  desc: '7 días seguidos',
  type: 'achievement',
  autoGrant: { minStreakDays: 7 }
});

add('booster', {
  id: 'booster',
  name: 'Booster',
  icon: '<:boost1:1438505627558219856>',
  desc: 'Impulsor del servidor',
  type: 'achievement',
  autoGrant: { isBooster: true }
});

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Guardado profile.json actualizado.');