// ==UserScript==
// @name         Shopify Orders Analytics Safe v4.9 - No Filters, Perfect Badges
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  Muestra todas las estadísticas y fechas exactas en las tarjetas de pedidos sin ningún filtro previo.
// @author       Daniel Josue Rozo Vargas
// @match        https://shopify.com/*/account/orders*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'shopify_orders_database_v4.9';
    let currentFilterMode = 'all'; // 'all', 'month', 'year', 'custom'
    let customStartDate = '';
    let customEndDate = '';

    function formatCurrency(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 2
        }).format(amount);
    }

    // Formato de fecha exacto requerido: "01/AGO/2026 - 1:00 p.m."
    function formatOrderDate(isoString) {
        if (!isoString) return "";
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;

        const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
        const day = String(date.getDate()).padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
        hours = hours % 12;
        hours = hours ? hours : 12;

        return `${day}/${month}/${year} - ${hours}:${minutes} ${ampm}`;
    }

    function getShopifyBrandColor() {
        const sampleButton = document.querySelector('a._1m2hr9gi, button, [role="button"]');
        if (sampleButton) {
            const compColor = window.getComputedStyle(sampleButton);
            const bg = compColor.backgroundColor;
            const color = compColor.color;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
            if (color) return color;
        }
        return 'rgb(192, 159, 219)';
    }

    function scrollToOrder(position) {
        const articles = document.querySelectorAll('article');
        if (articles.length > 0) {
            const target = position === 'first' ? articles[0] : articles[articles.length - 1];
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            if (position === 'first') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        }
    }

    function renderPanel(count, total, avg, statusText, isLoading = false) {
        const headerContainer = document.querySelector('._17kya4u18._1fragem120._1fragem5u._1fragemws') || document.querySelector('h1');
        if (!headerContainer) return false;

        let panel = document.getElementById('shopify-top-analytics-panel');
        const themeColor = getShopifyBrandColor();

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'shopify-top-analytics-panel';
            panel.style.cssText = `
                margin-top: 10px;
                margin-bottom: 20px;
                background: #ffffff;
                border: 2px solid ${themeColor};
                border-radius: 12px;
                padding: 16px 20px;
                font-family: 'Poppins', sans-serif;
                color: #16081e;
                display: flex;
                flex-direction: column;
                gap: 16px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                width: 100%;
                box-sizing: border-box;
                z-index: 999;
            `;
            headerContainer.parentNode.insertBefore(panel, headerContainer.nextSibling);
        }

        if (isLoading) {
            panel.innerHTML = `
                <div style="display: flex; gap: 30px; flex-wrap: wrap; align-items: center; width: 100%;">
                    <div style="flex: 1; min-width: 130px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Órdenes Totales</span>
                        <div style="height: 22px; width: 60px; background: #e0e0e0; border-radius: 4px;"></div>
                    </div>
                    <div style="flex: 1; min-width: 160px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Total Gastado</span>
                        <div style="height: 22px; width: 110px; background: #e0e0e0; border-radius: 4px;"></div>
                    </div>
                    <div style="flex: 1; min-width: 160px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Promedio por Orden</span>
                        <div style="height: 22px; width: 110px; background: #e0e0e0; border-radius: 4px;"></div>
                    </div>
                    <div>
                        <span style="font-size: 10px; background: #e0e0e0; color: #555; padding: 4px 8px; border-radius: 6px; font-weight: 600;">Cargando...</span>
                    </div>
                </div>
            `;
        } else {
            panel.innerHTML = `
                <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center; flex: 1;">
                        <div style="min-width: 120px;">
                            <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Órdenes Totales</span>
                            <span style="font-size: 18px; font-weight: 700; color: #16081e;">${count}</span>
                        </div>
                        <div style="min-width: 150px;">
                            <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Total Gastado</span>
                            <span style="font-size: 18px; font-weight: 700; color: #16081e;">${total}</span>
                        </div>
                        <div style="min-width: 150px;">
                            <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Promedio por Orden</span>
                            <span style="font-size: 18px; font-weight: 700; color: #16081e;">${avg}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <span style="font-size: 10px; background: ${themeColor}; color: #fff; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${statusText}</span>
                    </div>
                </div>

                <!-- Controles de Filtros de Fecha y Navegación Rápida -->
                <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; border-top: 1px solid #f0ecf4; padding-top: 12px;">
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span style="font-size: 12px; font-weight: 600; color: #4a3e56;">📅 Filtrar por fecha:</span>
                        <select id="shopify-filter-mode-select" style="padding: 6px 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 12px; font-family: inherit; background: #fff; cursor: pointer;">
                            <option value="all" ${currentFilterMode === 'all' ? 'selected' : ''}>Todas las fechas</option>
                            <option value="month" ${currentFilterMode === 'month' ? 'selected' : ''}>Este mes</option>
                            <option value="year" ${currentFilterMode === 'year' ? 'selected' : ''}>Este año</option>
                            <option value="custom" ${currentFilterMode === 'custom' ? 'selected' : ''}>Rango personalizado</option>
                        </select>

                        <div id="shopify-custom-date-container" style="display: ${currentFilterMode === 'custom' ? 'inline-flex' : 'none'}; gap: 6px; align-items: center;">
                            <input type="date" id="shopify-date-start" value="${customStartDate}" style="padding: 4px 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px;">
                            <span style="font-size: 11px; color: #666;">a</span>
                            <input type="date" id="shopify-date-end" value="${customEndDate}" style="padding: 4px 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px;">
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="shopify-btn-first-order-panel" style="padding: 6px 12px; border-radius: 20px; border: 1px solid ${themeColor}; background: #f8f5fb; color: #16081e; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            ⬆️ Primer pedido
                        </button>
                        <button id="shopify-btn-last-order-panel" style="padding: 6px 12px; border-radius: 20px; border: 1px solid ${themeColor}; background: #f8f5fb; color: #16081e; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            ⬇️ Último pedido
                        </button>
                    </div>
                </div>
            `;

            // Event Listeners para Filtros
            const selectEl = document.getElementById('shopify-filter-mode-select');
            if (selectEl) {
                selectEl.onchange = (e) => {
                    currentFilterMode = e.target.value;
                    const dateContainer = document.getElementById('shopify-custom-date-container');
                    if (dateContainer) {
                        dateContainer.style.display = currentFilterMode === 'custom' ? 'inline-flex' : 'none';
                    }
                    updateDashboard();
                };
            }

            const startEl = document.getElementById('shopify-date-start');
            if (startEl) {
                startEl.onchange = (e) => {
                    customStartDate = e.target.value;
                    updateDashboard();
                };
            }

            const endEl = document.getElementById('shopify-date-end');
            if (endEl) {
                endEl.onchange = (e) => {
                    customEndDate = e.target.value;
                    updateDashboard();
                };
            }

            // Event Listeners para botones del Panel
            const btnFirst = document.getElementById('shopify-btn-first-order-panel');
            if (btnFirst) btnFirst.onclick = () => scrollToOrder('first');

            const btnLast = document.getElementById('shopify-btn-last-order-panel');
            if (btnLast) btnLast.onclick = () => scrollToOrder('last');
        }
        return true;
    }

    function renderNavFloatingButtons() {
        if (document.getElementById('shopify-nav-floating-container')) return;

        const themeColor = getShopifyBrandColor();
        const container = document.createElement('div');
        container.id = 'shopify-nav-floating-container';
        container.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 99999;
        `;

        const btnTop = document.createElement('button');
        btnTop.id = 'shopify-scroll-top-btn';
        btnTop.innerHTML = '⬆️ Primer pedido';
        btnTop.style.cssText = `
            background: #ffffff;
            color: #16081e;
            border: 2px solid ${themeColor};
            padding: 8px 14px;
            border-radius: 30px;
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.15);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        `;
        btnTop.onclick = () => scrollToOrder('first');

        const btnBottom = document.createElement('button');
        btnBottom.id = 'shopify-scroll-bottom-btn';
        btnBottom.innerHTML = '⬇️ Último pedido';
        btnBottom.style.cssText = `
            background: #ffffff;
            color: #16081e;
            border: 2px solid ${themeColor};
            padding: 8px 14px;
            border-radius: 30px;
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.15);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        `;
        btnBottom.onclick = () => scrollToOrder('last');

        container.appendChild(btnTop);
        container.appendChild(btnBottom);
        document.body.appendChild(container);
    }

    function getStoredOrders() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    function saveStoredOrders(ordersMap) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(ordersMap));
        } catch (e) { }
    }

    function extractOrdersFromObj(obj, uniqueOrders) {
        if (!obj || typeof obj !== 'object') return false;
        let updated = false;

        if (Array.isArray(obj)) {
            obj.forEach(item => {
                if (extractOrdersFromObj(item, uniqueOrders)) updated = true;
            });
        } else {
            const name = obj.name || obj.orderNumber || obj.id;
            const amount = obj.totalPrice?.amount || obj.currentTotalPrice?.amount || obj.totalPrice || obj.total;
            const date = obj.processedAt || obj.createdAt || obj.processed_at || obj.created_at;

            if (name && typeof name === 'string' && (name.startsWith('#') || name.startsWith('CJ')) && amount !== undefined) {
                const priceNum = parseFloat(amount);
                if (!isNaN(priceNum)) {
                    const formattedName = name.startsWith('#') ? name : `#${name}`;
                    if (!uniqueOrders[formattedName] || (!uniqueOrders[formattedName].date && date)) {
                        uniqueOrders[formattedName] = {
                            price: priceNum,
                            date: date || uniqueOrders[formattedName]?.date || null
                        };
                        updated = true;
                    }
                }
            }

            for (const key in obj) {
                if (obj[key] && typeof obj[key] === 'object') {
                    if (extractOrdersFromObj(obj[key], uniqueOrders)) updated = true;
                }
            }
        }
        return updated;
    }

    function setupFetchInterceptor() {
        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const originalFetch = targetWindow.fetch;

        targetWindow.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);
            try {
                let requestUrl = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
                if (requestUrl.includes('graphql') || requestUrl.includes('/account') || requestUrl.includes('/api')) {
                    const clone = response.clone();
                    clone.json().then(res => {
                        let uniqueOrders = getStoredOrders();
                        if (extractOrdersFromObj(res, uniqueOrders)) {
                            saveStoredOrders(uniqueOrders);
                            updateDashboard();
                        }
                    }).catch(() => { });
                }
            } catch (err) { }
            return response;
        };
    }

    function injectDatesIntoDOM() {
        const ordersMap = getStoredOrders();
        const articles = document.querySelectorAll('article');

        articles.forEach(article => {
            const heading = article.querySelector('h2, h3, header, strong');
            if (heading) {
                const orderIdText = heading.textContent.trim();

                if (ordersMap[orderIdText] && ordersMap[orderIdText].date) {
                    let existingBadge = article.querySelector('.shopify-order-date-badge');
                    const formattedDate = formatOrderDate(ordersMap[orderIdText].date);

                    if (existingBadge) {
                        if (existingBadge.textContent !== `📅 ${formattedDate}`) {
                            existingBadge.innerHTML = `📅 ${formattedDate}`;
                        }
                    } else {
                        const badge = document.createElement('div');
                        badge.className = 'shopify-order-date-badge';
                        badge.style.cssText = `
                            font-size: 11px;
                            color: #70647a;
                            background: #f8f5fb;
                            padding: 4px 8px;
                            border-radius: 6px;
                            display: inline-block;
                            margin-top: 6px;
                            font-weight: 500;
                        `;
                        badge.innerHTML = `📅 ${formattedDate}`;
                        heading.parentNode.appendChild(badge);
                    }
                }
            }
        });
    }

    function scanDOMOrders() {
        let uniqueOrders = getStoredOrders();
        let newFound = false;

        const articles = document.querySelectorAll('article');
        articles.forEach(article => {
            const textContent = article.textContent || "";
            const orderMatch = textContent.match(/(#[A-Za-z0-9\-_]+)/);
            const priceMatch = textContent.match(/\$\s*([\d\.,]+)\s*COP/) || textContent.match(/([\d\.,]+)\s*COP/);

            // Intentar obtener la fecha del DOM (<time datetime="..."> o texto de fecha)
            const timeEl = article.querySelector('time');
            let extractedDate = null;
            if (timeEl) {
                extractedDate = timeEl.getAttribute('datetime') || timeEl.textContent;
            }

            if (orderMatch && priceMatch) {
                const orderId = orderMatch[1];
                let cleanNumStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
                let price = parseFloat(cleanNumStr);

                if (!isNaN(price)) {
                    if (!uniqueOrders[orderId]) {
                        uniqueOrders[orderId] = { price: price, date: extractedDate };
                        newFound = true;
                    } else if (!uniqueOrders[orderId].date && extractedDate) {
                        uniqueOrders[orderId].date = extractedDate;
                        newFound = true;
                    }
                }
            }
        });

        if (newFound) {
            saveStoredOrders(uniqueOrders);
        }

        return uniqueOrders;
    }

    function filterOrdersByDate(ordersMap) {
        const orderIds = Object.keys(ordersMap);
        const now = new Date();

        return orderIds.filter(id => {
            const order = ordersMap[id];
            if (currentFilterMode === 'all') return true;
            if (!order) return false;

            if (!order.date) {
                // Si la fecha aún no se ha obtenido, se incluye por defecto
                return true;
            }

            const orderDate = new Date(order.date);
            if (isNaN(orderDate.getTime())) return true;

            if (currentFilterMode === 'month') {
                return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
            }
            if (currentFilterMode === 'year') {
                return orderDate.getFullYear() === now.getFullYear();
            }
            if (currentFilterMode === 'custom') {
                if (customStartDate) {
                    const start = new Date(customStartDate + 'T00:00:00');
                    if (orderDate < start) return false;
                }
                if (customEndDate) {
                    const end = new Date(customEndDate + 'T23:59:59');
                    if (orderDate > end) return false;
                }
                return true;
            }
            return true;
        });
    }

    function updateDashboard() {
        scanDOMOrders();
        const ordersMap = getStoredOrders();
        const filteredIds = filterOrdersByDate(ordersMap);
        const orderCount = filteredIds.length;

        let totalSpent = 0;
        filteredIds.forEach(id => {
            const orderData = ordersMap[id];
            const price = typeof orderData === 'object' ? orderData.price : orderData;
            totalSpent += price;
        });

        const average = orderCount > 0 ? totalSpent / orderCount : 0;
        const totalAllOrders = Object.keys(ordersMap).length;
        const statusLabel = currentFilterMode !== 'all' ? `Filtrando (${orderCount} de ${totalAllOrders})` : 'Sincronizado';

        renderPanel(orderCount, formatCurrency(totalSpent), formatCurrency(average), statusLabel, false);
        injectDatesIntoDOM();
    }

    setupFetchInterceptor();

    window.addEventListener('load', () => {
        renderPanel(0, "$ 0,00", "$ 0,00", "Cargando...", true);

        const cached = getStoredOrders();
        const ids = Object.keys(cached);
        if (ids.length > 0) {
            let total = 0;
            ids.forEach(id => {
                total += (typeof cached[id] === 'object' ? cached[id].price : cached[id]);
            });
            renderPanel(ids.length, formatCurrency(total), formatCurrency(total / ids.length), "Caché Local", false);
            injectDatesIntoDOM();
        }

        renderNavFloatingButtons();
        setTimeout(updateDashboard, 1000);
        setTimeout(updateDashboard, 2500);
    });

    setInterval(() => {
        injectDatesIntoDOM();
    }, 1500);

})();