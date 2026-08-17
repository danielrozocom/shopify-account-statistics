// ==UserScript==
// @name         Shopify Orders Analytics Safe v4.9 - No Filters, Perfect Badges
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  Muestra todas las estadísticas y fechas exactas en las tarjetas de pedidos sin ningún filtro previo.
// @author       Dani
// @match        https://shopify.com/*/account/orders*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'shopify_orders_database_v4.9';

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
                flex-wrap: wrap;
                gap: 20px;
                align-items: center;
                justify-content: space-between;
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
                <div style="display: flex; gap: 30px; flex-wrap: wrap; align-items: center; width: 100%;">
                    <div style="flex: 1; min-width: 130px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Órdenes Totales</span>
                        <span style="font-size: 18px; font-weight: 700; color: #16081e;">${count}</span>
                    </div>
                    <div style="flex: 1; min-width: 160px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Total Gastado</span>
                        <span style="font-size: 18px; font-weight: 700; color: #16081e;">${total}</span>
                    </div>
                    <div style="flex: 1; min-width: 160px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Promedio por Orden</span>
                        <span style="font-size: 18px; font-weight: 700; color: #16081e;">${avg}</span>
                    </div>
                    <div>
                        <span style="font-size: 10px; background: ${themeColor}; color: #fff; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${statusText}</span>
                    </div>
                </div>
            `;
        }
        return true;
    }

    function renderScrollTopButton() {
        if (document.getElementById('shopify-scroll-top-btn')) return;

        const themeColor = getShopifyBrandColor();
        const btn = document.createElement('button');
        btn.id = 'shopify-scroll-top-btn';
        btn.innerHTML = '⬆️ Ir al primer pedido';
        btn.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            background: #ffffff;
            color: #16081e;
            border: 2px solid ${themeColor};
            padding: 10px 16px;
            border-radius: 30px;
            font-family: 'Poppins', sans-serif;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(0,0,0,0.15);
            z-index: 99999;
            transition: all 0.2s ease;
        `;

        btn.onclick = () => {
            const firstOrder = document.querySelector('article') || document.querySelector('h1');
            if (firstOrder) {
                firstOrder.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        document.body.appendChild(btn);
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
        } catch (e) {}
    }

    function setupFetchInterceptor() {
        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const originalFetch = targetWindow.fetch;

        targetWindow.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = args[0];
                if (typeof url === 'string' && url.includes('graphql') && url.includes('Orders')) {
                    const clone = response.clone();
                    clone.json().then(res => {
                        const nodes = res?.data?.customer?.orders?.nodes;
                        if (nodes && Array.isArray(nodes)) {
                            let uniqueOrders = getStoredOrders();
                            let updated = false;

                            nodes.forEach(order => {
                                const id = order.name; 
                                const amount = parseFloat(order.totalPrice?.amount);
                                const processedAt = order.processedAt;

                                if (id && !isNaN(amount)) {
                                    if (!uniqueOrders[id] || !uniqueOrders[id].date) {
                                        uniqueOrders[id] = { price: amount, date: processedAt };
                                        updated = true;
                                    }
                                }
                            });

                            if (updated) {
                                saveStoredOrders(uniqueOrders);
                                updateDashboard();
                            }
                        }
                    }).catch(() => {});
                }
            } catch (err) {}
            return response;
        };
    }

    function injectDatesIntoDOM() {
        const ordersMap = getStoredOrders();
        const articles = document.querySelectorAll('article');

        articles.forEach(article => {
            const heading = article.querySelector('h2');
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

        const items = document.querySelectorAll('article, li');
        items.forEach(item => {
            const textContent = item.textContent || "";
            const orderMatch = textContent.match(/(#CJ\d+)/);
            const priceMatch = textContent.match(/\$\s*([\d\.,]+)\s*COP/);

            if (orderMatch && priceMatch) {
                const orderId = orderMatch[1];
                let cleanNumStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
                let price = parseFloat(cleanNumStr);

                if (!isNaN(price)) {
                    if (!uniqueOrders[orderId]) {
                        uniqueOrders[orderId] = { price: price, date: null };
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

    function updateDashboard() {
        scanDOMOrders();
        const ordersMap = getStoredOrders();
        const orderIds = Object.keys(ordersMap);
        const orderCount = orderIds.length;

        let totalSpent = 0;
        orderIds.forEach(id => {
            const orderData = ordersMap[id];
            const price = typeof orderData === 'object' ? orderData.price : orderData;
            totalSpent += price;
        });

        const average = orderCount > 0 ? totalSpent / orderCount : 0;

        renderPanel(orderCount, formatCurrency(totalSpent), formatCurrency(average), `Sincronizado`, false);
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

        renderScrollTopButton();
        setTimeout(updateDashboard, 1000);
        setTimeout(updateDashboard, 2500);
    });

    setInterval(() => {
        injectDatesIntoDOM();
    }, 1500);

})();