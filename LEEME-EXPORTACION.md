# Proyecto completo de Yujin

Esta es la versión de desarrollo y QA: úsala para actualizar tu repositorio y conservar las pruebas.

1. Instala Node.js 24 o posterior y `pnpm@11.24.0`.
2. Ejecuta `pnpm install --frozen-lockfile`.
3. Ejecuta `pnpm test` para probar el proyecto sin conectar el bot a Discord.
4. Para un servidor de pruebas de Discord, usa una aplicación independiente y completa tu configuración local a partir de `.env.example`.
5. Genera la versión final con `pnpm run build:release`; se guarda en `dist/production` sin pruebas.

No se incluyen credenciales, claves, datos privados de usuarios, dependencias ni registros. Al actualizar una instalación existente, conserva sus datos y credenciales.

La interfaz y la separación de entornos se describen en `docs/Interfaz-y-entornos.md`. La copia anterior al rework se entrega en un archivo separado.
