# 📊 Shopify Account Order Statistics & Analytics

[![Instalar con Tampermonkey](https://img.shields.io/badge/Instalar_con-Tampermonkey-00A88F?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/danielrozocom/shopify-account-statistics/main/shopify-account-statistics.user.js)
[![Versión](https://img.shields.io/badge/versión-5.0-purple?style=for-the-badge)](file:///c:/Users/Daniel%20Rozo/Documents/Shopify%20Account%20Statistics/shopify-account-statistics.user.js)
[![Licencia](https://img.shields.io/badge/licencia-MIT-blue?style=for-the-badge)](LICENSE)

Un Userscript avanzado para **Tampermonkey** que añade un panel completo de estadísticas, análisis financiero, fechas exactas, desglose de descuentos y filtros a la sección de historial de pedidos de cualquier cuenta de **Shopify** (`/account/orders`).

---

## ⚡ Instalación Rápida

1. Asegúrate de tener instalada la extensión **Tampermonkey** en tu navegador:
   - [Tampermonkey para Chrome / Edge / Brave / Opera](https://www.tampermonkey.net/)
   - [Tampermonkey para Firefox](https://addons.mozilla.org/es/firefox/addon/tampermonkey/)

2. Haz clic en el siguiente botón para instalar el script:

[![Instalar Userscript](https://img.shields.io/badge/🚀_Hacer_clic_aquí_para_Instalar-Userscript-00A88F?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/danielrozocom/shopify-account-statistics/main/shopify-account-statistics.user.js)

3. Tampermonkey abrirá una pestaña de confirmación. Haz clic en **Instalar**.
4. ¡Listo! Abre la sección de pedidos de tu cuenta Shopify (`/account/orders`) y verás el panel de analíticas cargado automáticamente.

---

## 🔥 Características Principales

### 📈 Panel de Estadísticas & Analíticas
- **Órdenes Totales**: Conteo global y filtrado de pedidos.
- **Total Gastado**: Suma neta acumulada efectivamente pagada en la plataforma.
- **Sin Descuento**: Subtotal original bruto que se habría pagado sin promociones.
- **Total Ahorrado 🎉**: Dinero ahorrado gracias a cupones y códigos promocionales.
- **Promedio por Orden**: Valor promedio gastado por cada compra.

### 📅 Fechas Inline en Cada Tarjeta
- Muestra la fecha y hora exacta de cada pedido (`15/AGO/2026 - 12:26 p.m.`) directamente en el subtítulo del pedido (`#CJ937357 · $ 24.800,00 COP · 15/AGO/2026 - 12:26 p.m.`), sin emojis redundantes ni columnas laterales que desfasen el diseño.

### 🏷️ Captura Automática de Descuentos en Segundo Plano
- **Intercepción de GraphQL API**: El script consulta en segundo plano las peticiones de GraphQL (`LineItems` / `OrderDetails`) para extraer los códigos de descuento aplicados (ej: `Cooperativa ELSP`) y los montos ahorrados en cada ítem.
- **Sin Clics Manuales**: La sincronización procesa las órdenes en segundo plano automáticamente.

### 🔍 Filtros Combinados de Fecha y Descuentos
- **Filtros de Fecha**:
  - `Todas las fechas`
  - `Este mes`
  - `Este año`
  - `Rango personalizado` (selectores de fecha inicio/fin)
- **Filtros de Descuento**:
  - `Todos los pedidos`
  - `Con cualquier descuento`
  - `Sin descuento`
  - **Desplegable Dinámico por Código**: Opciones automáticas con cada código promocional detectado en tus compras.

### ⬆️⬇️ Navegación Inteligente
- **`⬆️ Pedido más reciente`**: Desplaza la pantalla suavemente hacia la orden más reciente (arriba).
- **`⬇️ Pedido más antiguo`**: Carga automáticamente las páginas restantes en segundo plano si existen pedidos sin mostrar y se desplaza suavemente hasta la última orden de la cuenta.

### 🔄 Actualizar & 🗑️ Borrar Memoria
- **`🔄 Actualizar`**: Resincroniza en segundo plano las consultas GraphQL de detalles para refrescar cupones y montos ahorrados.
- **`🗑️ Borrar memoria`**: Limpia el almacenamiento local (`localStorage`), resetea los registros y ejecuta un nuevo escaneo completo desde cero.

---

## 🛠️ Desarrollo e Integración

### Requisitos
- Tampermonkey v4.0 o superior.
- Compatible con páginas de Cuentas de Cliente Remix/GraphQL de Shopify (`https://shopify.com/*/account/orders*`).

### Repositorio Git
```bash
git clone https://github.com/danielrozocom/shopify-account-statistics.git
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia [MIT](LICENSE). Creado por **Daniel Josue Rozo Vargas**.
