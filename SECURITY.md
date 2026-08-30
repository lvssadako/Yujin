# 🛡️ Política de Seguridad (Security Policy)

## 📌 Versiones Soportadas

Actualmente brindamos soporte de seguridad y parches activos a las siguientes versiones de la plataforma:

| Versión / Rama | Soportada | Estado | Requisitos |
| :--- | :---: | :---: | :--- |
| **`refactor/structure` / `main` (v1.x)** | ✅ | Activo | Node.js `>= 18.0.0` (Recomendado `>= 20.0.0`) |
| `< 1.0.0` (Legacy monolítico) | ❌ | Obsoleto | No recibe actualizaciones de seguridad |

---

## 🔒 Reporte de Vulnerabilidades

La seguridad de la comunidad y la integridad de los datos de los usuarios son de máxima prioridad. Si descubres una vulnerabilidad de seguridad en este proyecto:

1. **No abras un Issue público**: Evita divulgar públicamente vulnerabilidades antes de que hayan sido mitigadas.
2. **Reporte Privado**:
   - Envía un reporte detallado al mantenedor a través de GitHub Security Advisory en el repositorio: [Reportar Vulnerabilidad](https://github.com/lvssadako/Yujin/security/advisories/new).
   - O contacta por mensaje directo de Discord a la administración del servidor (`@Sadako`).

### Información a incluir en el reporte:
- Descripción clara de la vulnerabilidad detectada.
- Pasos reproducibles o prueba de concepto (PoC).
- Impacto potencial en la economía, moderación, infraestructura o privacidad de usuarios.
- Sugerencia de parche o remediación si la tienes disponible.

### Tiempo de Respuesta:
- **Acuse de recibo inicial:** Menos de 24 a 48 horas.
- **Evaluación y triage:** 3 a 5 días hábiles.
- **Lanzamiento de parche:** Publicación prioritaria con commit de seguridad.

---

## 🧱 Estándares de Seguridad del Proyecto

El código base se rige por las siguientes directrices obligatorias de seguridad definidas en [`AGENTS.md`](./AGENTS.md):

### 1. Validación de Roles y Jerarquías (`canBotManageRole`)
- Los comandos administrativos (`ban`, `kick`, `timeout`, `role assignment`) verifican siempre la jerarquía del ejecutor y del bot respecto al objetivo.
- Se bloquea cualquier intento de manipular el rol `@everyone`, roles gestionados por integraciones externas o roles por encima del rol más alto del bot.

### 2. Protección Contra SSRF y Validación de URLs Externas (`urlSafety.js`)
- Toda URL de imagen externa proporcionada por usuarios (fondos de perfil, banners de racha) pasa por validación y normalización estricta.
- Se rechazan protocolos no seguros (`file://`, `ftp://`), IPs privadas (`localhost`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`) y dominios no autorizados.

### 3. Persistencia Atómica y Prevención de Corrupción (`jsonStore.js`)
- La persistencia en JSON utiliza escrituras atómicas con archivos temporales y renombramiento seguro (`writeJsonAtomic`).
- Se previene la pérdida de datos o corrupción por fallos imprevistos de proceso o concurrencia.

### 4. Idempotencia y Prevención de Duplicidad de Recompensas (`grantOnce`)
- Todos los eventos que otorgan monedas, experiencia o ítems utilizan identificadores compuestos únicos (`guild:user:event`) y ventanas de tiempo (TTL) para evitar doble cobro o explotación por spam.

### 5. Protección de Credenciales y Secretos
- El token del bot (`TOKEN`), `CLIENT_ID` y cualquier secreto deben residir exclusivamente en el archivo `.env`.
- El archivo `.env` y las bases de datos de datos sensibles están estrictamente incluidos en el `.gitignore`.

---

## 🤖 Dependencias y Automatización

- **Dependabot**: Monitoreo y actualización semanal automatizada de dependencias en `package.json` mediante [`.github/dependabot.yml`](./.github/dependabot.yml).
- **Auditorías npm**: Ejecución periódica de `npm audit` o `pnpm audit` para mitigar CVEs en dependencias directas y transitivas.
