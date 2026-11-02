# Validación del rework de interfaz

- Windows (laptop): 426 pruebas aprobadas, 0 fallos.
- Linux (entorno QA en la VM): 426 pruebas aprobadas, 0 fallos.
- Sintaxis: 256 archivos JavaScript comprobados, 0 errores.
- Versión final: 69 comandos slash y 83 entradas con prefijo cargadas en la comprobación sin conexión; sin comandos de prueba.
- Producción: no quedan carpetas __tests__, archivos .test.js ni script test en package.json.
- Se conservaron los datos de producción durante el despliegue.

Se verificaron las páginas de ayuda y tienda, los límites de los embeds, los estados de misiones y cobro, la compatibilidad slash/prefijo y las regresiones de economía, XP y rachas.

Las vistas incluidas usan datos ficticios. Los embeds son presentaciones aproximadas; Discord adapta los tamaños a la pantalla y al tema del usuario. El ranking es una imagen generada por el propio código del bot.

El respaldo previo incluye las pruebas originales. Las credenciales y los datos privados se mantienen en la VM.
