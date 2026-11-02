# Interfaz y entornos

La interfaz conserva la identidad de Yujin con sus fotografías originales, la firma «Yujin ♥», acentos morados y detalles de comunidad. El help mantiene el mismo retrato y banner al recorrer sus categorías y guías. Los perfiles y las tarjetas mantienen las personalizaciones elegidas por cada usuario.

- **Ayuda:** categorías con páginas, selector de comandos y ejemplos basados en las opciones reales de Discord. Las herramientas de desarrollo siguen reservadas al dueño y desarrolladores.
- **Recompensas:** estado de cobro, progreso de misiones, recompensas pendientes y próxima renovación. La racha de recompensas se distingue de la racha de actividad.
- **Tienda:** ocho productos por página, descuentos correctos desde tres días de racha y navegación para quien abrió el panel.
- **Rankings:** histórico, semanal y diario; mensajes enviados, tiempo en llamada o nivel/XP. En semanal y diario, el general muestra XP ganado durante ese período.
- **Saldo, préstamos y notificaciones:** datos agrupados y textos breves que explican el siguiente paso.

## Desarrollo y pruebas

Este proyecto conserva la suite de pruebas y los comandos de diagnóstico. Instala dependencias con `pnpm install --frozen-lockfile` y ejecuta `pnpm test`. No necesitas conectar un bot de Discord para ejecutar la suite automatizada. Sus archivos de datos deben ser independientes de producción.

Para probar con Discord, usa una aplicación y un servidor de pruebas propios, con credenciales diferentes a las del bot final. Copia `.env.example` a tu archivo de configuración local y completa sus valores. El proyecto descargable no incluye credenciales ni datos privados de usuarios.

## Versión final

Ejecuta `pnpm run build:release`. El resultado se guarda en `dist/production`, sin carpetas `__tests__`, fixtures de esas pruebas, archivos `.test.js`, comandos `testboost`, `testbutton` o `testsecurity`, ni scripts de pruebas. La herramienta no sobrescribe una versión final existente.

Las carpetas de datos, registros, dependencias, claves y archivos de entorno quedan fuera del paquete generado. Al actualizar la VM, conserva sus datos y sus credenciales. No copies la carpeta de datos creada durante las pruebas.

La copia anterior al rework se entrega por separado e incluye las pruebas originales.
