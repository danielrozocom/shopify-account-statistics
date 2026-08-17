// ==UserScript==
// @name         Shopify Account Order Statistics & Analytics
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Muestra todas las estadísticas, métricas y fechas exactas en las tarjetas de pedidos de Shopify.
// @author       Daniel Josue Rozo Vargas
// @match        https://shopify.com/*/account/orders*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'shopify_orders_database';
    let currentFilterMode = 'all'; // 'all', 'month', 'year', 'custom'
    let currentDiscountFilter = 'all'; // 'all', 'with_discount', 'without_discount', or specific code string
    let customStartDate = '';
    let customEndDate = '';
    let isAutoLoadingAll = false;
    let hasMorePagesDetected = false;
    let isFullySynced = false;
    let isSyncCancelled = false;
    let userStoppedSync = false;

    function logAnalytics(msg, ...args) {
        console.log(`%c[Shopify Analytics] ${msg}`, 'color: #9333ea; font-weight: bold;', ...args);
    }

    async function parseResponseSafely(resp) {
        if (!resp) return null;
        try {
            const text = await resp.text();
            if (!text || text.trim().length === 0) return null;

            if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                try {
                    return JSON.parse(text);
                } catch (e) { }
            }

            const remixMatch = text.match(/window\.__remixContext\s*=\s*(\{.*?\});\s*<\/script>/s);
            if (remixMatch) {
                try {
                    return JSON.parse(remixMatch[1]);
                } catch (e) { }
            }

            const scriptJsonMatches = [...text.matchAll(/<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs)];
            for (const m of scriptJsonMatches) {
                try {
                    const json = JSON.parse(m[1]);
                    if (json && typeof json === 'object') return json;
                } catch (e) { }
            }
        } catch (err) { }
        return null;
    }

    const SVG_ICONS = {
        boxes: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
        wallet: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M15 12h6v4h-6z"/></svg>`,
        receipt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>`,
        piggy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h3v-2h4v2h3v-3.5c1.7-1.2 2-2.7 2-4.5 0-2.5 0-4.5-2-4.5h-1"/><circle cx="7" cy="11" r="1"/></svg>`,
        chart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="m3 3 7 7 4-4 7 7"/><path d="M14 13h7v7"/></svg>`,
        check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
        spin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shopify-spin-icon" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
        cloudDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M4 14.89 4.13 14c.48-3.32 3.32-6 6.87-6 2.56 0 4.83 1.39 6.06 3.44.22-.04.44-.06.67-.06 2.49 0 4.5 2.01 4.5 4.5 0 2.37-1.83 4.31-4.16 4.49"/><path d="m12 12v9"/><path d="m8 17 4 4 4-4"/></svg>`,
        refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
        trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        calendar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;color:#6b21a8;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
        tags: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;color:#6b21a8;"><path d="M12 2H2v10l11.29 11.29a1 1 0 0 0 1.41 0l7.58-7.58a1 1 0 0 0 0-1.41L12 2Z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
        tagInline: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-left:2px;margin-right:2px;"><path d="M12 2H2v10l11.29 11.29a1 1 0 0 0 1.41 0l7.58-7.58a1 1 0 0 0 0-1.41L12 2Z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
        arrowUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`,
        arrowDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
        alert: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
        search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        trophy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;color:#d97706;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        bag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
        note: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:3px;color:#b45309;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
        card: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:3px;color:#2563eb;"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
        close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
    };

    function injectSpinStyles() {
        if (!document.getElementById('shopify-spin-style') && document.head) {
            const style = document.createElement('style');
            style.id = 'shopify-spin-style';
            style.textContent = `@keyframes shopifySpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .shopify-spin-icon { animation: shopifySpin 0.9s linear infinite; }`;
            document.head.appendChild(style);
        }
    }
    injectSpinStyles();

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

    function getPaginationButton() {
        const candidates = document.querySelectorAll('button, a');
        for (const btn of candidates) {
            const text = (btn.textContent || '').toLowerCase().trim();
            if (text.includes('cargar más') || text.includes('ver más') || text.includes('mostrar más') || text.includes('show more') || text.includes('load more') || text.includes('siguiente')) {
                return btn;
            }
        }
        return null;
    }

    async function loadAllOrders() {
        if (isAutoLoadingAll) return;
        isAutoLoadingAll = true;
        updateDashboard();

        let count = 0;
        const maxAttempts = 100;

        while (count < maxAttempts) {
            const loadBtn = getPaginationButton();
            if (!loadBtn) break;

            // Cargar en segundo plano sin forzar scroll visual en cada paso
            loadBtn.click();
            count++;

            await new Promise(resolve => setTimeout(resolve, 800));
        }

        isAutoLoadingAll = false;
        updateDashboard();
        syncMissingOrderDetails();
    }

    async function scrollToOrder(position) {
        if (position === 'first') {
            const articles = document.querySelectorAll('article');
            if (articles.length > 0) {
                articles[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } else if (position === 'last') {
            const pagBtn = getPaginationButton();
            if (pagBtn) {
                await loadAllOrders();
            }

            const articles = document.querySelectorAll('article');
            if (articles.length > 0) {
                articles[articles.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        }
    }

    function attachPanelToDOM(panel) {
        const mainOrdersSection = document.querySelector('[data-inspector-id="orderListSection"]') ||
            document.querySelector('article')?.parentNode ||
            document.querySelector('main');

        if (mainOrdersSection && document.body.contains(mainOrdersSection)) {
            if (panel.parentNode !== mainOrdersSection || panel !== mainOrdersSection.firstChild) {
                mainOrdersSection.insertBefore(panel, mainOrdersSection.firstChild);
            }
            return;
        }

        if (!document.body.contains(panel)) {
            document.body.insertBefore(panel, document.body.firstChild);
        }
    }

    function getCapturedDiscountCodes(ordersMap) {
        const codes = new Set();
        for (const key in ordersMap) {
            if (ordersMap[key]?.discountCode) {
                codes.add(ordersMap[key].discountCode);
            }
        }
        return Array.from(codes);
    }

    function getDiscountBreakdown(ordersMap) {
        const discountsMap = {};
        for (const key in ordersMap) {
            const order = ordersMap[key];
            if (order) {
                let code = order.discountCode;
                if (!code && (order.discountAmount && order.discountAmount > 0)) {
                    code = 'Descuento Automático / Manual';
                }
                if (code) {
                    if (!discountsMap[code]) {
                        discountsMap[code] = { code: code, count: 0, totalSaved: 0 };
                    }
                    discountsMap[code].count += 1;
                    discountsMap[code].totalSaved += (order.discountAmount || 0);
                }
            }
        }
        return Object.values(discountsMap).sort((a, b) => b.totalSaved - a.totalSaved);
    }

    function getPaymentBreakdown(ordersMap) {
        const paymentsMap = {};
        for (const key in ordersMap) {
            const order = ordersMap[key];
            const method = order.paymentMethod || 'No especificado / Estándar';
            if (!paymentsMap[method]) {
                paymentsMap[method] = { method: method, count: 0, totalSpent: 0 };
            }
            paymentsMap[method].count += 1;
            paymentsMap[method].totalSpent += (order.price || 0);
        }
        return Object.values(paymentsMap).sort((a, b) => b.totalSpent - a.totalSpent);
    }

    function slugifyTitle(title) {
        if (!title || typeof title !== 'string') return '';
        return title
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
    }

    function getFilteredOrdersMap() {
        const allOrders = getStoredOrders();
        const filteredIds = filterOrders(allOrders);
        const filteredMap = {};
        filteredIds.forEach(id => {
            if (allOrders[id]) {
                filteredMap[id] = allOrders[id];
            }
        });
        return filteredMap;
    }

    function openAnalyticsModal(ordersMap) {
        let modal = document.getElementById('shopify-analytics-modal');
        if (modal) modal.remove();

        const topProductsList = getTopProducts(ordersMap);
        const discountBreakdown = getDiscountBreakdown(ordersMap);
        const paymentBreakdown = getPaymentBreakdown(ordersMap);

        modal = document.createElement('div');
        modal.id = 'shopify-analytics-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(15, 7, 26, 0.75);
            backdrop-filter: blur(8px);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        `;

        let top10RowsHtml = '';
        if (topProductsList.length === 0) {
            top10RowsHtml = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #70647a;">Cargando/sin datos de productos...</td></tr>`;
        } else {
            topProductsList.forEach((p, idx) => {
                const titleHtml = p.url ? `
                    <a href="${p.url}" target="_blank" rel="noopener noreferrer" style="font-weight: 600; font-size: 13px; color: #9333ea; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; transition: color 0.2s ease;" onmouseover="this.style.textDecoration='underline'; this.style.color='#6b21a8';" onmouseout="this.style.textDecoration='none'; this.style.color='#9333ea';">
                        ${p.title} <span style="font-size: 11px; opacity: 0.8;">🔗</span>
                    </a>
                ` : `<span style="font-weight: 600; font-size: 13px; color: #16081e;">${p.title}</span>`;

                const imgHtml = p.imageUrl ? `<img src="${p.imageUrl}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid #e2d8ee;">` : `<div style="width: 36px; height: 36px; background: #f0ecf4; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px;">🛍️</div>`;

                let priceHistoryHtml = '';
                if (p.hasPriceVariation) {
                    priceHistoryHtml = `<span style="font-size: 11px; background: #fff3dc; color: #b45309; border: 1px solid #fef3c7; padding: 2px 6px; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" title="Variación detectada: comprado a ${p.uniquePrices.map(formatCurrency).join(', ')}">📈 ${formatCurrency(p.minPrice)} - ${formatCurrency(p.maxPrice)}</span>`;
                } else if (p.minPrice > 0) {
                    priceHistoryHtml = `<span style="font-size: 11px; color: #4a3e56; font-weight: 500;">${formatCurrency(p.minPrice)} / und.</span>`;
                } else {
                    priceHistoryHtml = `<span style="font-size: 11px; color: #70647a;">-</span>`;
                }

                top10RowsHtml += `
                    <tr style="border-bottom: 1px solid #f0ecf4;">
                        <td style="padding: 10px 12px; font-weight: 700; color: #9333ea; font-size: 13px;">#${idx + 1}</td>
                        <td style="padding: 10px 12px; display: flex; align-items: center; gap: 10px;">
                            ${imgHtml}
                            ${titleHtml}
                        </td>
                        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #16081e; font-size: 13px;">${p.quantity} und.</td>
                        <td style="padding: 10px 12px; text-align: center;">${priceHistoryHtml}</td>
                        <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #2e7d32; font-size: 13px;">${formatCurrency(p.totalSpent)}</td>
                    </tr>
                `;
            });
        }

        let discountRowsHtml = '';
        if (discountBreakdown.length === 0) {
            discountRowsHtml = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #70647a;">No se registran cupones de descuento aplicados.</td></tr>`;
        } else {
            discountBreakdown.forEach((d) => {
                discountRowsHtml += `
                    <tr style="border-bottom: 1px solid #f0ecf4;">
                        <td style="padding: 10px 12px; font-weight: 700; color: #b45309; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.tagInline} ${d.code}
                        </td>
                        <td style="padding: 10px 12px; text-align: center; font-weight: 600; font-size: 13px; color: #16081e;">${d.count} ${d.count === 1 ? 'pedido' : 'pedidos'}</td>
                        <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #2e7d32; font-size: 13px;">${formatCurrency(d.totalSaved)} ahorrado</td>
                    </tr>
                `;
            });
        }

        let paymentRowsHtml = '';
        if (paymentBreakdown.length === 0) {
            paymentRowsHtml = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #70647a;">Sin datos de medios de pago.</td></tr>`;
        } else {
            paymentBreakdown.forEach((pm) => {
                paymentRowsHtml += `
                    <tr style="border-bottom: 1px solid #f0ecf4;">
                        <td style="padding: 10px 12px; font-weight: 600; color: #1d4ed8; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.card} ${pm.method}
                        </td>
                        <td style="padding: 10px 12px; text-align: center; font-weight: 600; font-size: 13px; color: #16081e;">${pm.count} ${pm.count === 1 ? 'pedido' : 'pedidos'}</td>
                        <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #16081e; font-size: 13px;">${formatCurrency(pm.totalSpent)}</td>
                    </tr>
                `;
            });
        }

        modal.innerHTML = `
            <div style="background: #ffffff; border-radius: 16px; width: 100%; max-width: 720px; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.3); border: 2px solid #9333ea; font-family: 'Poppins', sans-serif;">
                <div style="padding: 20px 24px; border-bottom: 1px solid #f0ecf4; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #f8f5fb 0%, #ffffff 100%); border-top-left-radius: 14px; border-top-right-radius: 14px; sticky: top;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 22px;">🏆</span>
                        <div>
                            <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #16081e;">Reporte Completo de Analítica</h2>
                            <span style="font-size: 12px; color: #70647a;">Productos Más Comprados, Cupones Ahorrados y Medios de Pago</span>
                        </div>
                    </div>
                    <button id="shopify-modal-close" style="background: #f0ecf4; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #16081e;">
                        ${SVG_ICONS.close}
                    </button>
                </div>

                <div style="padding: 20px 24px;">
                    <!-- Seccion Productos Mas Comprados -->
                    <div style="margin-bottom: 24px;">
                        <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #9333ea; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.trophy} Productos Más Comprados
                        </h3>
                        <div style="border: 1px solid #e2d8ee; border-radius: 10px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background: #f8f5fb; border-bottom: 1px solid #e2d8ee; font-size: 11px; color: #70647a; text-transform: uppercase;">
                                        <th style="padding: 8px 12px; width: 40px;">Pos</th>
                                        <th style="padding: 8px 12px;">Producto</th>
                                        <th style="padding: 8px 12px; text-align: center;">Unidades</th>
                                        <th style="padding: 8px 12px; text-align: center;">Precio Unitario / Histórico</th>
                                        <th style="padding: 8px 12px; text-align: right;">Total Invertido</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${top10RowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Seccion Descuentos y Cupones -->
                    <div style="margin-bottom: 24px;">
                        <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #b45309; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.piggy} Descuentos & Cupones Aplicados
                        </h3>
                        <div style="border: 1px solid #fef3c7; border-radius: 10px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background: #fff8e1; border-bottom: 1px solid #fef3c7; font-size: 11px; color: #b45309; text-transform: uppercase;">
                                        <th style="padding: 8px 12px;">Código de Cupón</th>
                                        <th style="padding: 8px 12px; text-align: center;">Uso</th>
                                        <th style="padding: 8px 12px; text-align: right;">Total Ahorrado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${discountRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Seccion Medios de Pago -->
                    <div>
                        <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #1d4ed8; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.card} Medios de Pago Utilizados
                        </h3>
                        <div style="border: 1px solid #dbeafe; border-radius: 10px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background: #eff6ff; border-bottom: 1px solid #dbeafe; font-size: 11px; color: #1d4ed8; text-transform: uppercase;">
                                        <th style="padding: 8px 12px;">Medio de Pago</th>
                                        <th style="padding: 8px 12px; text-align: center;">Pedidos</th>
                                        <th style="padding: 8px 12px; text-align: right;">Monto Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${paymentRowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = document.getElementById('shopify-modal-close');
        if (closeBtn) closeBtn.onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    function renderPanel(count, totalSpentFormatted, totalGrossFormatted, totalSavingsFormatted, avgFormatted, statusText, statusBgColor = null, isLoading = false) {
        let panel = document.getElementById('shopify-top-analytics-panel');
        const themeColor = getShopifyBrandColor();
        const badgeColor = statusBgColor || themeColor;
        const ordersMap = getStoredOrders();
        const filteredOrdersMap = getFilteredOrdersMap();
        const discountCodes = getCapturedDiscountCodes(ordersMap);
        const topProducts = getTopProducts(filteredOrdersMap);
        const topProduct = topProducts.length > 0 ? topProducts[0] : null;
        const topProductTitle = topProduct ? (topProduct.title.length > 22 ? topProduct.title.substring(0, 22) + '...' : topProduct.title) : 'Sin datos';
        const topProductSub = topProduct ? `${topProduct.quantity} und. · ${formatCurrency(topProduct.totalSpent)}` : 'Sincronizando...';

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
                max-width: 950px;
                margin-left: auto;
                margin-right: auto;
                box-sizing: border-box;
                z-index: 999;
            `;
        }

        attachPanelToDOM(panel);

        const isEditing = panel.contains(document.activeElement);

        if (isLoading && !panel.querySelector('#shopify-stat-count')) {
            panel.innerHTML = `
                <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center; width: 100%;">
                    <div style="flex: 1; min-width: 100px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Órdenes</span>
                        <div style="height: 22px; width: 50px; background: #e0e0e0; border-radius: 4px;"></div>
                    </div>
                    <div style="flex: 1; min-width: 130px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Total Gastado</span>
                        <div style="height: 22px; width: 100px; background: #e0e0e0; border-radius: 4px;"></div>
                    </div>
                    <div style="flex: 1; min-width: 130px;">
                        <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Sin Descuento</span>
                        <div style="height: 22px; width: 100px; background: #e0e0e0; border-radius: 4px;"></div>
                    </div>
                    <div style="flex: 1; min-width: 130px;">
                        <span style="font-size: 11px; color: #2e7d32; display: block; font-weight: 600; text-transform: uppercase;">Total Ahorrado 🎉</span>
                        <div style="height: 22px; width: 100px; background: #e0e0e0; border-radius: 4px;"></div>
                    </div>
                    <div>
                        <span style="font-size: 10px; background: #e0e0e0; color: #555; padding: 4px 8px; border-radius: 6px; font-weight: 600;">Cargando...</span>
                    </div>
                </div>
            `;
        } else if (!isEditing || !panel.querySelector('#shopify-stat-count')) {
            let discountOptionsHtml = `
                <option value="all" ${currentDiscountFilter === 'all' ? 'selected' : ''}>Todos los pedidos</option>
                <option value="with_discount" ${currentDiscountFilter === 'with_discount' ? 'selected' : ''}>Con cualquier descuento</option>
                <option value="without_discount" ${currentDiscountFilter === 'without_discount' ? 'selected' : ''}>Sin descuento</option>
            `;
            discountCodes.forEach(code => {
                discountOptionsHtml += `<option value="${code}" ${currentDiscountFilter === code ? 'selected' : ''}>${code}</option>`;
            });

            panel.innerHTML = `
                <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 18px; flex-wrap: wrap; align-items: center; flex: 1;">
                        <div style="min-width: 80px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.boxes} Órdenes
                            </span>
                            <span id="shopify-stat-count" style="font-size: 17px; font-weight: 700; color: #16081e;">${count}</span>
                        </div>
                        <div style="min-width: 120px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.wallet} Total Gastado
                            </span>
                            <span id="shopify-stat-total" style="font-size: 17px; font-weight: 700; color: #16081e;">${totalSpentFormatted}</span>
                        </div>
                        <div style="min-width: 120px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.receipt} Sin Descuento
                            </span>
                            <span id="shopify-stat-gross" style="font-size: 17px; font-weight: 700; color: #555555;">${totalGrossFormatted}</span>
                        </div>
                        <div style="min-width: 120px;">
                            <span style="font-size: 11px; color: #2e7d32; display: flex; align-items: center; gap: 4px; font-weight: 600; text-transform: uppercase;">
                                ${SVG_ICONS.piggy} Total Ahorrado
                            </span>
                            <span id="shopify-stat-savings" style="font-size: 17px; font-weight: 700; color: #2e7d32;">${totalSavingsFormatted}</span>
                        </div>
                        <div style="min-width: 110px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.chart} Promedio
                            </span>
                            <span id="shopify-stat-avg" style="font-size: 17px; font-weight: 700; color: #16081e;">${avgFormatted}</span>
                        </div>
                        <div style="min-width: 140px; border-left: 1px dashed #e2d9ec; padding-left: 12px;">
                            <span style="font-size: 11px; color: #b45309; display: flex; align-items: center; gap: 4px; font-weight: 600; text-transform: uppercase;">
                                ${SVG_ICONS.trophy} Más Comprado
                            </span>
                            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                                ${topProduct?.imageUrl ? `<img src="${topProduct.imageUrl}" style="width: 22px; height: 22px; border-radius: 4px; object-fit: cover;" />` : ''}
                                <div>
                                    <span id="shopify-stat-topprod-title" style="font-size: 13px; font-weight: 700; color: #16081e; display: block; line-height: 1.1;" title="${topProduct?.title || ''}">${topProductTitle}</span>
                                    <span id="shopify-stat-topprod-sub" style="font-size: 10px; color: #70647a; font-weight: 500;">${topProductSub}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <span id="shopify-stat-badge" style="font-size: 11px; background: ${badgeColor}; color: #fff; padding: 5px 10px; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            ${statusText}
                        </span>
                        ${statusText.includes('parcial') && !isAutoLoadingAll ? `
                            <button id="shopify-btn-load-all" style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${themeColor}; background: #ffffff; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                ${SVG_ICONS.cloudDown} Cargar todos
                            </button>
                        ` : ''}
                        ${!statusText.includes('parcial') && !isAutoLoadingAll ? `
                            <button id="shopify-btn-force-refresh" style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${themeColor}; background: #ffffff; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                ${isSyncingDetails ? SVG_ICONS.spin : SVG_ICONS.refresh} ${isSyncingDetails ? 'Sincronizando...' : 'Actualizar'}
                            </button>
                            ${isSyncingDetails ? `
                                <button id="shopify-btn-stop-sync" style="padding: 5px 10px; border-radius: 6px; border: 1px solid #d32f2f; background: #fff0f0; color: #d32f2f; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                    ${SVG_ICONS.trash} Detener
                                </button>
                            ` : ''}
                            <button id="shopify-btn-open-modal" style="padding: 5px 10px; border-radius: 6px; border: 1px solid #9333ea; background: linear-gradient(135deg, #f8f5fb 0%, #ffffff 100%); color: #9333ea; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                ${SVG_ICONS.trophy} Ver Reporte Completo
                            </button>
                            <button id="shopify-btn-clear-storage" style="padding: 5px 10px; border-radius: 6px; border: 1px solid #d32f2f; background: #ffffff; color: #d32f2f; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                ${SVG_ICONS.trash} Borrar memoria
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Controles de Filtros de Fecha, Descuento y Navegación Rápida -->
                <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; border-top: 1px solid #f0ecf4; padding-top: 12px;">
                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span style="font-size: 12px; font-weight: 600; color: #4a3e56; display: flex; align-items: center; gap: 4px;">
                                ${SVG_ICONS.calendar} Fecha:
                            </span>
                            <select id="shopify-filter-mode-select" style="padding: 5px 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px; font-family: inherit; background: #fff; cursor: pointer;">
                                <option value="all" ${currentFilterMode === 'all' ? 'selected' : ''}>Todas</option>
                                <option value="month" ${currentFilterMode === 'month' ? 'selected' : ''}>Este mes</option>
                                <option value="year" ${currentFilterMode === 'year' ? 'selected' : ''}>Este año</option>
                                <option value="custom" ${currentFilterMode === 'custom' ? 'selected' : ''}>Personalizado</option>
                            </select>

                            <div id="shopify-custom-date-container" style="display: ${currentFilterMode === 'custom' ? 'inline-flex' : 'none'}; gap: 4px; align-items: center;">
                                <input type="date" id="shopify-date-start" value="${customStartDate}" style="padding: 3px 6px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px;">
                                <span style="font-size: 11px; color: #666;">a</span>
                                <input type="date" id="shopify-date-end" value="${customEndDate}" style="padding: 3px 6px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px;">
                            </div>
                        </div>

                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span style="font-size: 12px; font-weight: 600; color: #4a3e56; display: flex; align-items: center; gap: 4px;">
                                ${SVG_ICONS.tags} Descuentos:
                            </span>
                            <select id="shopify-filter-discount-select" style="padding: 5px 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px; font-family: inherit; background: #fff; cursor: pointer;">
                                ${discountOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="shopify-btn-first-order-panel" style="padding: 5px 10px; border-radius: 20px; border: 1px solid ${themeColor}; background: #f8f5fb; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            ${SVG_ICONS.arrowUp} Pedido más reciente
                        </button>
                        <button id="shopify-btn-last-order-panel" style="padding: 5px 10px; border-radius: 20px; border: 1px solid ${themeColor}; background: #f8f5fb; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            ${SVG_ICONS.arrowDown} Pedido más antiguo
                        </button>
                    </div>
                </div>
            `;

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

            const discountSelectEl = document.getElementById('shopify-filter-discount-select');
            if (discountSelectEl) {
                discountSelectEl.onchange = (e) => {
                    currentDiscountFilter = e.target.value;
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

            const btnFirst = document.getElementById('shopify-btn-first-order-panel');
            if (btnFirst) btnFirst.onclick = () => scrollToOrder('first');

            const btnLast = document.getElementById('shopify-btn-last-order-panel');
            if (btnLast) btnLast.onclick = () => scrollToOrder('last');

            const btnOpenModal = document.getElementById('shopify-btn-open-modal');
            if (btnOpenModal) btnOpenModal.onclick = () => openAnalyticsModal(getFilteredOrdersMap());

            const topProdCard = document.getElementById('shopify-stat-card-topprod');
            if (topProdCard) {
                topProdCard.style.cursor = 'pointer';
                topProdCard.onclick = () => openAnalyticsModal(getFilteredOrdersMap());
            }

            const btnLoadAll = document.getElementById('shopify-btn-load-all');
            if (btnLoadAll) {
                btnLoadAll.onclick = () => {
                    userStoppedSync = false;
                    isSyncCancelled = false;
                    loadAllOrders();
                };
            }

            const btnStopSync = document.getElementById('shopify-btn-stop-sync');
            if (btnStopSync) {
                btnStopSync.onclick = () => {
                    userStoppedSync = true;
                    isSyncCancelled = true;
                    isSyncingDetails = false;
                    isAutoLoadingAll = false;
                    pendingSyncTotal = 0;
                    pendingSyncCurrent = 0;
                    updateDashboard(true);
                    logAnalytics('🛑 Sincronización detenida por el usuario.');
                };
            }

            const btnForceRefresh = document.getElementById('shopify-btn-force-refresh');
            if (btnForceRefresh) {
                btnForceRefresh.onclick = async () => {
                    userStoppedSync = false;
                    isSyncCancelled = false;
                    isSyncingDetails = false;
                    pendingSyncTotal = 0;
                    pendingSyncCurrent = 0;
                    let currentOrders = getStoredOrders();
                    for (const k in currentOrders) {
                        if (currentOrders[k]) currentOrders[k].detailFetched = false;
                    }
                    saveStoredOrders(currentOrders);
                    updateDashboard(true);

                    const pagBtn = getPaginationButton();
                    if (pagBtn) {
                        await loadAllOrders();
                    } else {
                        await syncMissingOrderDetails();
                    }
                };
            }

            const btnClearStorage = document.getElementById('shopify-btn-clear-storage');
            if (btnClearStorage) {
                btnClearStorage.onclick = () => {
                    if (confirm('¿Deseas borrar toda la memoria guardada de los pedidos en este navegador?')) {
                        localStorage.removeItem(STORAGE_KEY);
                        currentFilterMode = 'all';
                        currentDiscountFilter = 'all';
                        updateDashboard();
                        loadAllOrders();
                    }
                };
            }
        } else {
            const countEl = panel.querySelector('#shopify-stat-count');
            if (countEl) countEl.textContent = count;

            const totalEl = panel.querySelector('#shopify-stat-total');
            if (totalEl) totalEl.textContent = totalSpentFormatted;

            const grossEl = panel.querySelector('#shopify-stat-gross');
            if (grossEl) grossEl.textContent = totalGrossFormatted;

            const savingsEl = panel.querySelector('#shopify-stat-savings');
            if (savingsEl) savingsEl.textContent = totalSavingsFormatted;

            const avgEl = panel.querySelector('#shopify-stat-avg');
            if (avgEl) avgEl.textContent = avgFormatted;

            const badgeEl = panel.querySelector('#shopify-stat-badge');
            if (badgeEl) {
                badgeEl.innerHTML = statusText;
                badgeEl.style.backgroundColor = badgeColor;
            }

            const topProdTitleEl = panel.querySelector('#shopify-stat-topprod-title');
            if (topProdTitleEl) topProdTitleEl.textContent = topProductTitle;

            const topProdSubEl = panel.querySelector('#shopify-stat-topprod-sub');
            if (topProdSubEl) topProdSubEl.textContent = topProductSub;
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
        btnTop.innerHTML = '⬆️ Pedido más reciente';
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
        btnBottom.innerHTML = '⬇️ Pedido más antiguo';
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
            if (!data) return {};
            const parsed = JSON.parse(data);
            const cleaned = {};

            for (const key in parsed) {
                if (!key) continue;
                let cleanKey = key.trim();
                if (!cleanKey.startsWith('#') && (cleanKey.startsWith('CJ') || /^\d+$/.test(cleanKey))) {
                    cleanKey = `#${cleanKey}`;
                }

                const item = parsed[key];
                const price = typeof item === 'object' && item !== null ? parseFloat(item.price) : parseFloat(item);
                const priceBeforeDiscounts = typeof item === 'object' && item !== null ? parseFloat(item.priceBeforeDiscounts || 0) : null;
                const discountAmount = typeof item === 'object' && item !== null ? parseFloat(item.discountAmount || 0) : 0;
                const date = typeof item === 'object' && item !== null ? item.date : null;
                const discountCode = typeof item === 'object' && item !== null ? item.discountCode : null;
                const paymentMethod = typeof item === 'object' && item !== null ? item.paymentMethod : null;
                const note = typeof item === 'object' && item !== null ? item.note : null;
                const items = typeof item === 'object' && item !== null ? item.items : null;
                const gid = typeof item === 'object' && item !== null ? item.gid : null;
                const detailFetched = typeof item === 'object' && item !== null ? (item.detailFetched || false) : false;
                const verifiedNoDiscount = typeof item === 'object' && item !== null ? (item.verifiedNoDiscount || false) : false;
                const syncAttempts = typeof item === 'object' && item !== null ? (item.syncAttempts || 0) : 0;

                if (!isNaN(price)) {
                    if (!cleaned[cleanKey]) {
                        cleaned[cleanKey] = { price, priceBeforeDiscounts, discountAmount, date, discountCode, paymentMethod, note, items, gid, detailFetched, verifiedNoDiscount, syncAttempts };
                    } else {
                        if (!cleaned[cleanKey].date && date) cleaned[cleanKey].date = date;
                        if (!cleaned[cleanKey].discountCode && discountCode) cleaned[cleanKey].discountCode = discountCode;
                        if (!cleaned[cleanKey].priceBeforeDiscounts && priceBeforeDiscounts) cleaned[cleanKey].priceBeforeDiscounts = priceBeforeDiscounts;
                        if (!cleaned[cleanKey].discountAmount && discountAmount) cleaned[cleanKey].discountAmount = discountAmount;
                        if (!cleaned[cleanKey].paymentMethod && paymentMethod) cleaned[cleanKey].paymentMethod = paymentMethod;
                        if (!cleaned[cleanKey].note && note) cleaned[cleanKey].note = note;
                        if (!cleaned[cleanKey].items && items) cleaned[cleanKey].items = items;
                        if (!cleaned[cleanKey].gid && gid) cleaned[cleanKey].gid = gid;
                        if (detailFetched) cleaned[cleanKey].detailFetched = true;
                        if (verifiedNoDiscount) cleaned[cleanKey].verifiedNoDiscount = true;
                    }
                }
            }
            return cleaned;
        } catch (e) {
            return {};
        }
    }

    function saveStoredOrders(ordersMap) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(ordersMap));
        } catch (e) { }
    }

    function findDeepDiscountCode(obj) {
        if (!obj || typeof obj !== 'object') return null;

        if (obj.discountApplication) {
            return obj.discountApplication.code || obj.discountApplication.title || null;
        }

        if (Array.isArray(obj.discountApplications?.nodes) && obj.discountApplications.nodes.length > 0) {
            for (const app of obj.discountApplications.nodes) {
                const val = app.code || app.title;
                if (val) return val;
            }
        }

        if (Array.isArray(obj.discountApplications) && obj.discountApplications.length > 0) {
            for (const app of obj.discountApplications) {
                const val = app.code || app.title;
                if (val) return val;
            }
        }

        if (Array.isArray(obj.allOrderLevelAppliedDiscounts) && obj.allOrderLevelAppliedDiscounts.length > 0) {
            for (const app of obj.allOrderLevelAppliedDiscounts) {
                const val = app.title || app.code;
                if (val) return val;
            }
        }

        if (Array.isArray(obj.discountInformation) && obj.discountInformation.length > 0) {
            for (const info of obj.discountInformation) {
                const val = info.title || info.code;
                if (val) return val;
            }
        }

        if (obj.discountCode) return obj.discountCode;

        if (Array.isArray(obj)) {
            for (const item of obj) {
                const res = findDeepDiscountCode(item);
                if (res) return res;
            }
        } else {
            for (const k in obj) {
                if (typeof obj[k] === 'object') {
                    const res = findDeepDiscountCode(obj[k]);
                    if (res) return res;
                }
            }
        }
        return null;
    }

    function findDeepDiscountAmount(obj) {
        if (!obj || typeof obj !== 'object') return 0;
        let sum = 0;
        if (obj.totalSavings?.amount && parseFloat(obj.totalSavings.amount) > 0) {
            return parseFloat(obj.totalSavings.amount);
        }
        if (Array.isArray(obj.allOrderLevelAppliedDiscounts)) {
            obj.allOrderLevelAppliedDiscounts.forEach(da => {
                if (da.discountValue?.amount) sum += parseFloat(da.discountValue.amount);
            });
        }
        if (Array.isArray(obj.discountAllocations)) {
            obj.discountAllocations.forEach(da => {
                if (da.allocatedAmount?.amount) sum += parseFloat(da.allocatedAmount.amount);
            });
        }
        if (Array.isArray(obj.discountInformation)) {
            obj.discountInformation.forEach(di => {
                if (di.discountValue?.amount) sum += parseFloat(di.discountValue.amount);
            });
        }

        if (Array.isArray(obj)) {
            obj.forEach(item => { sum += findDeepDiscountAmount(item); });
        } else {
            for (const k in obj) {
                if (typeof obj[k] === 'object') sum += findDeepDiscountAmount(obj[k]);
            }
        }
        return sum;
    }

    function extractLineItemsFromObj(node) {
        const items = [];
        function walk(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                obj.forEach(walk);
                return;
            }
            if (obj.lineItem && typeof obj.lineItem === 'object') {
                const item = obj.lineItem;
                const title = item.title || item.presentmentName || item.presentmentTitle || item.name;
                const quantity = item.quantity !== undefined ? parseInt(item.quantity, 10) : 1;
                const price = item.currentTotalPrice?.amount || item.price?.amount || item.totalPriceWithDiscounts?.amount || 0;
                const imgUrl = item.image?.url || null;
                const prodUrl = item.onlineStoreUrl || item.url || item.product?.onlineStoreUrl || (item.product?.handle ? `/products/${item.product.handle}` : null) || (item.variant?.product?.handle ? `/products/${item.variant.product.handle}` : null) || null;

                if (title && typeof title === 'string') {
                    items.push({
                        title: title.trim(),
                        quantity: !isNaN(quantity) ? quantity : 1,
                        price: !isNaN(parseFloat(price)) ? parseFloat(price) : 0,
                        imageUrl: imgUrl,
                        url: prodUrl
                    });
                }
            }
            for (const k in obj) {
                if (obj[k] && typeof obj[k] === 'object') walk(obj[k]);
            }
        }
        walk(node);
        return items;
    }

    function getTopProducts(ordersMap) {
        const map = {};
        for (const key in ordersMap) {
            const order = ordersMap[key];
            if (Array.isArray(order.items)) {
                order.items.forEach(it => {
                    if (!map[it.title]) {
                        map[it.title] = {
                            title: it.title,
                            quantity: 0,
                            totalSpent: 0,
                            imageUrl: it.imageUrl,
                            url: it.url,
                            prices: []
                        };
                    }
                    map[it.title].quantity += it.quantity;
                    map[it.title].totalSpent += it.price;
                    if (it.imageUrl && !map[it.title].imageUrl) {
                        map[it.title].imageUrl = it.imageUrl;
                    }
                    if (it.url && !map[it.title].url) {
                        map[it.title].url = it.url;
                    }

                    const unitPrice = it.quantity > 0 ? (it.price / it.quantity) : it.price;
                    if (unitPrice > 0) {
                        map[it.title].prices.push(unitPrice);
                    }
                });
            }
        }

        const result = Object.values(map).map(p => {
            const uniquePrices = Array.from(new Set(p.prices.map(px => parseFloat(px.toFixed(2))))).sort((a, b) => a - b);
            const minPrice = uniquePrices.length > 0 ? uniquePrices[0] : 0;
            const maxPrice = uniquePrices.length > 0 ? uniquePrices[uniquePrices.length - 1] : 0;
            const hasPriceVariation = uniquePrices.length > 1;

            return {
                ...p,
                minPrice,
                maxPrice,
                hasPriceVariation,
                uniquePrices
            };
        });

        return result.sort((a, b) => b.quantity - a.quantity);
    }

    function extractPaymentMethodFromObj(obj) {
        if (!obj || typeof obj !== 'object') return null;

        const transactions = obj.transactions || obj.paymentCollections?.nodes?.[0]?.transactions || obj.data?.order?.transactions;
        if (Array.isArray(transactions) && transactions.length > 0) {
            for (const tx of transactions) {
                if (!tx || typeof tx !== 'object') continue;

                const name = tx.typeDetails?.name || tx.paymentDetails?.paymentMethodName || tx.gateway;
                const details = tx.paymentDetails;
                let cardInfo = '';

                if (details) {
                    if (details.cardBrand && details.last4) {
                        cardInfo = `${details.cardBrand} •••• ${details.last4}`;
                    } else if (details.cardBrand) {
                        cardInfo = details.cardBrand;
                    } else if (details.last4) {
                        cardInfo = `•••• ${details.last4}`;
                    }
                }

                if (name) {
                    const cleanName = name.trim();
                    return cardInfo ? `${cleanName} (${cardInfo})` : cleanName;
                }
                if (cardInfo) return cardInfo;
                if (tx.type && tx.type !== 'CARD') return tx.type;
            }
        }

        if (obj.paymentMethodName && typeof obj.paymentMethodName === 'string') return obj.paymentMethodName;
        if (obj.paymentMethod) {
            if (typeof obj.paymentMethod === 'string') return obj.paymentMethod;
            if (typeof obj.paymentMethod === 'object' && obj.paymentMethod.name) return obj.paymentMethod.name;
        }
        if (obj.gateway && typeof obj.gateway === 'string') return obj.gateway;

        return null;
    }

    function extractOrdersFromObj(obj, uniqueOrders, isDetailResponse = false) {
        if (!obj || typeof obj !== 'object') return false;
        let updated = false;

        if (obj.pageInfo && typeof obj.pageInfo.hasNextPage === 'boolean') {
            hasMorePagesDetected = obj.pageInfo.hasNextPage;
        }

        if (Array.isArray(obj)) {
            obj.forEach(item => {
                if (extractOrdersFromObj(item, uniqueOrders, isDetailResponse)) updated = true;
            });
            return updated;
        }

        const name = obj.name || obj.orderNumber;
        const amount = obj.totalPrice?.amount || obj.currentTotalPrice?.amount || obj.totalPrice || obj.total;
        const date = obj.processedAt || obj.createdAt || obj.processed_at || obj.created_at;
        const gid = (obj.id && typeof obj.id === 'string' && obj.id.startsWith('gid://')) ? obj.id : null;

        // Capturar precio sin descuento
        const priceBefore = obj.totalPriceBeforeDiscounts?.amount || obj.subtotalBeforeDiscounts?.amount || null;

        let targetKey = null;
        if (name && typeof name === 'string' && (name.startsWith('#') || name.startsWith('CJ'))) {
            targetKey = name.startsWith('#') ? name.trim() : `#${name.trim()}`;
        } else if (gid) {
            targetKey = Object.keys(uniqueOrders).find(k => uniqueOrders[k].gid === gid);
        }

        if (targetKey) {
            const existing = uniqueOrders[targetKey] || {};
            const rawPriceNum = (amount !== undefined) ? (typeof amount === 'object' ? parseFloat(amount.amount) : parseFloat(amount)) : NaN;
            const priceNum = !isNaN(rawPriceNum) ? rawPriceNum : (existing.price || 0);

            const priceBeforeNum = priceBefore ? parseFloat(priceBefore) : null;
            const discountCode = findDeepDiscountCode(obj);
            const discountAmount = findDeepDiscountAmount(obj);

            const extractedItems = extractLineItemsFromObj(obj);
            const combinedItems = (extractedItems.length > 0) ? extractedItems : (existing.items || null);

            let extractedNote = obj.note || obj.customerNote || null;
            if (!extractedNote && Array.isArray(obj.customAttributes) && obj.customAttributes.length > 0) {
                extractedNote = obj.customAttributes.map(a => `${a.key}: ${a.value}`).join(' | ');
            }
            const note = extractedNote || existing.note || null;
            const extractedPaymentMethod = extractPaymentMethodFromObj(obj);
            const paymentMethod = extractedPaymentMethod || (existing.paymentMethod && existing.paymentMethod !== 'CARD' ? existing.paymentMethod : null);

            const hasDetailInfo = isDetailResponse || discountCode !== null || discountAmount > 0 || priceBeforeNum !== null || (combinedItems && combinedItems.length > 0);

            uniqueOrders[targetKey] = {
                price: priceNum,
                priceBeforeDiscounts: priceBeforeNum || existing.priceBeforeDiscounts || (priceNum && discountAmount > 0 ? priceNum + discountAmount : null),
                discountAmount: discountAmount > 0 ? discountAmount : (existing.discountAmount || 0),
                date: date || existing.date || null,
                discountCode: discountCode || existing.discountCode || null,
                gid: gid || existing.gid || null,
                detailFetched: hasDetailInfo ? true : (existing.detailFetched || false),
                verifiedNoDiscount: isDetailResponse ? true : (existing.verifiedNoDiscount || false),
                items: combinedItems,
                note: note,
                paymentMethod: paymentMethod
            };
            updated = true;
            return updated;
        }

        for (const key in obj) {
            if (obj[key] && typeof obj[key] === 'object') {
                if (extractOrdersFromObj(obj[key], uniqueOrders, isDetailResponse)) updated = true;
            }
        }
        return updated;
    }

    let isSyncingDetails = false;
    let pendingSyncTotal = 0;
    let pendingSyncCurrent = 0;

    const ORDER_DETAILS_QUERY = `query OrderDetails($orderId: ID!) {
  order(id: $orderId) {
    id
    name
    processedAt
    note
    customAttributes { key value }
    currentTotalPrice: totalPrice { amount currencyCode }
    subtotal: subtotalBeforeDiscounts { amount currencyCode }
    totalSavings { amount currencyCode }
    transactions {
      id
      kind
      status
      type
      typeDetails { name }
      paymentDetails {
        ... on CardPaymentDetails { cardBrand last4 }
        ... on CustomGiftCardPaymentDetails { last4 }
        ... on LocalPaymentMethodsPaymentDetails { paymentMethodName }
      }
    }
    discountApplications(first: 50) {
      nodes {
        ... on AutomaticDiscountApplication { title }
        ... on DiscountCodeApplication { code }
        ... on ManualDiscountApplication { title }
      }
    }
    discountInformation {
      allOrderLevelAppliedDiscounts: allOrderLevelAppliedDiscountsOnSoldItems {
        title
        targetType
        discountApplicationType
        discountValue { amount currencyCode }
      }
    }
    lineItemContainers {
      ... on RemainingLineItemContainer {
        lineItems(first: 250) {
          nodes {
            lineItem {
              totalPriceBeforeDiscounts { amount currencyCode }
              totalPriceWithDiscounts { amount currencyCode }
              discountAllocations {
                allocatedAmount { amount currencyCode }
                discountApplication {
                  ... on AutomaticDiscountApplication { title }
                  ... on DiscountCodeApplication { code }
                  ... on ManualDiscountApplication { title }
                }
              }
              discountInformation { title discountValue { amount currencyCode } }
              image { url altText }
              title
              quantity
              onlineStoreUrl
            }
          }
        }
      }
    }
  }
}`;

    const LINE_ITEMS_QUERY = `query LineItems($orderId: ID!, $lineItemsFirst: Int! = 250) {
  order(id: $orderId) {
    id
    lineItems: lineItemContainers {
      ... on RemainingLineItemContainer {
        id
        lineItems(first: $lineItemsFirst) {
          nodes {
            id
            lineItem {
              id
              presentmentName
              title
              presentmentTitle
              quantity
              onlineStoreUrl
              currentTotalPrice: totalPriceWithDiscounts { amount currencyCode }
              totalPriceBeforeDiscounts: totalPriceBeforeDiscounts { amount currencyCode }
              discountAllocations {
                allocatedAmount { amount currencyCode }
                discountApplication {
                  ... on AutomaticDiscountApplication { title }
                  ... on DiscountCodeApplication { code }
                  ... on ManualDiscountApplication { title }
                }
              }
              discountInformation { title discountValue { amount currencyCode } }
              image { url altText }
            }
          }
        }
      }
    }
  }
}`;

    async function syncMissingOrderDetails() {
        if (isSyncingDetails || userStoppedSync || isAutoLoadingAll) return;
        const ordersMap = getStoredOrders();
        const orderKeys = Object.keys(ordersMap);

        const pendingList = [];
        for (const key of orderKeys) {
            const order = ordersMap[key];
            const numericMatch = key.match(/\d+/);
            const gid = order.gid || (numericMatch ? `gid://shopify/Order/${numericMatch[0]}` : null);
            const isFullyVerified = order.detailFetched || order.discountCode || order.verifiedNoDiscount;
            const attempts = order.syncAttempts || 0;

            if (gid && !isFullyVerified && attempts < 3) {
                pendingList.push({ name: key, gid: gid, attempts: attempts });
            }
        }

        if (pendingList.length === 0) {
            pendingSyncTotal = 0;
            pendingSyncCurrent = 0;
            return;
        }

        isSyncingDetails = true;
        isSyncCancelled = false;
        pendingSyncTotal = pendingList.length;
        pendingSyncCurrent = 0;

        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const basePath = window.location.pathname.split('/account')[0];
        const graphqlUrl = window.location.origin + basePath + '/account/customer/api/unstable/graphql';

        const authHeader = findAuthTokenInPage();
        const defaultReqHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (authHeader) {
            defaultReqHeaders['Authorization'] = authHeader;
        }

        logAnalytics(`🔄 Iniciando sincronización de ${pendingList.length} pedidos pendientes...`);

        try {
            for (let i = 0; i < pendingList.length; i++) {
                if (isSyncCancelled || userStoppedSync) {
                    logAnalytics('🛑 Sincronización detenida por el usuario.');
                    break;
                }

                pendingSyncCurrent = i + 1;
                const item = pendingList[i];
                logAnalytics(`🔄 [${i + 1}/${pendingList.length}] Consultando detalles, productos y notas de:`, item.name);
                const numericId = item.gid.replace('gid://shopify/Order/', '');
                const remixUrl = `${window.location.origin}${basePath}/account/orders/${numericId}?_data=routes%2Faccount.orders.%24id`;

                let fetchedSuccess = false;

                // Estrategia 1 (PRIMARIA - NATIVA IDENTICA AL CLIC MANUAL): Remix Data Loader GET Route
                try {
                    const resp = await targetWindow.fetch(remixUrl, {
                        method: 'GET',
                        credentials: 'include',
                        headers: { 'Accept': 'application/json, text/plain, */*' }
                    });

                    if (resp.status === 429) {
                        await new Promise(r => setTimeout(r, 1500));
                    } else if (resp.ok) {
                        const resJson = await parseResponseSafely(resp);
                        if (resJson) {
                            if (resJson?.order && !resJson.order.name) {
                                resJson.order.name = item.name;
                            }
                            let currentOrders = getStoredOrders();
                            if (extractOrdersFromObj(resJson, currentOrders, true)) {
                                if (currentOrders[item.name]) currentOrders[item.name].detailFetched = true;
                                saveStoredOrders(currentOrders);
                                fetchedSuccess = true;
                                logAnalytics('✅ [Remix Loader] Sincronización nativa exitosa para:', item.name);
                            }
                        }
                    }
                } catch (e1) { }

                // Estrategia 2 (SECUNDARIA): GraphQL OrderDetails POST con token Authorization
                if (!fetchedSuccess && authHeader) {
                    try {
                        const resp = await targetWindow.fetch(graphqlUrl + '?operation=OrderDetails', {
                            method: 'POST',
                            credentials: 'include',
                            headers: defaultReqHeaders,
                            body: JSON.stringify({
                                operationName: 'OrderDetails',
                                variables: {
                                    orderId: item.gid
                                },
                                query: ORDER_DETAILS_QUERY
                            })
                        });

                        if (resp.status === 429) {
                            await new Promise(r => setTimeout(r, 1500));
                        } else if (resp.ok) {
                            const resJson = await parseResponseSafely(resp);
                            if (resJson) {
                                if (resJson?.data?.order && !resJson.data.order.name) {
                                    resJson.data.order.name = item.name;
                                }
                                let currentOrders = getStoredOrders();
                                if (extractOrdersFromObj(resJson, currentOrders, true)) {
                                    if (currentOrders[item.name]) currentOrders[item.name].detailFetched = true;
                                    saveStoredOrders(currentOrders);
                                    fetchedSuccess = true;
                                    logAnalytics('✅ [GraphQL OrderDetails] Sincronización exitosa para:', item.name);
                                }
                            }
                        }
                    } catch (e2) { }
                }

                // Estrategia 3 (RESPALDO): GraphQL LineItems POST con token Authorization
                if (!fetchedSuccess && authHeader) {
                    try {
                        const resp = await targetWindow.fetch(graphqlUrl + '?operation=LineItems', {
                            method: 'POST',
                            credentials: 'include',
                            headers: defaultReqHeaders,
                            body: JSON.stringify({
                                operationName: 'LineItems',
                                variables: {
                                    orderId: item.gid,
                                    lineItemsFirst: 250
                                },
                                query: LINE_ITEMS_QUERY
                            })
                        });

                        if (resp.status === 429) {
                            await new Promise(r => setTimeout(r, 1500));
                        } else if (resp.ok) {
                            const resJson = await parseResponseSafely(resp);
                            if (resJson) {
                                if (resJson?.data?.order && !resJson.data.order.name) {
                                    resJson.data.order.name = item.name;
                                }
                                let currentOrders = getStoredOrders();
                                if (extractOrdersFromObj(resJson, currentOrders, true)) {
                                    if (currentOrders[item.name]) currentOrders[item.name].detailFetched = true;
                                    saveStoredOrders(currentOrders);
                                    fetchedSuccess = true;
                                    logAnalytics('✅ [GraphQL LineItems] Sincronización exitosa para:', item.name);
                                }
                            }
                        }
                    } catch (e3) { }
                }

                // Manejo de reintentos y actualización de estado
                let finalOrders = getStoredOrders();
                if (finalOrders[item.name]) {
                    if (fetchedSuccess) {
                        finalOrders[item.name].detailFetched = true;
                        finalOrders[item.name].syncAttempts = 0;
                    } else {
                        // Solo incrementar syncAttempts si se contó con token de autorización
                        if (authHeader) {
                            const currentAttempts = (finalOrders[item.name].syncAttempts || 0) + 1;
                            finalOrders[item.name].syncAttempts = currentAttempts;
                            if (currentAttempts >= 3) {
                                finalOrders[item.name].detailFetched = true;
                                logAnalytics(`⚠️ Máximo de 3 intentos alcanzado para: ${item.name}`);
                            } else {
                                logAnalytics(`⚠️ Intento ${currentAttempts}/3 fallido para: ${item.name}. Se reintentará en el próximo ciclo.`);
                            }
                        } else {
                            logAnalytics(`ℹ️ Esperando token de autorización para consultar: ${item.name}`);
                        }
                    }
                    saveStoredOrders(finalOrders);
                }

                updateDashboard();
                await new Promise(r => setTimeout(r, 450));
            }
        } finally {
            isSyncingDetails = false;
            pendingSyncTotal = 0;
            pendingSyncCurrent = 0;
        }
    }

    let capturedAuthToken = null;

    function findAuthTokenInPage() {
        if (capturedAuthToken) return capturedAuthToken;
        try {
            const stored = sessionStorage.getItem('shopify_auth_token') || localStorage.getItem('shopify_auth_token');
            if (stored) {
                capturedAuthToken = stored;
                return stored;
            }

            for (let i = 0; i < sessionStorage.length; i++) {
                const val = sessionStorage.getItem(sessionStorage.key(i));
                if (val && val.includes('shcat_')) {
                    const match = val.match(/(shcat_[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/);
                    if (match) {
                        capturedAuthToken = match[1];
                        sessionStorage.setItem('shopify_auth_token', match[1]);
                        return match[1];
                    }
                }
            }
            for (let i = 0; i < localStorage.length; i++) {
                const val = localStorage.getItem(localStorage.key(i));
                if (val && val.includes('shcat_')) {
                    const match = val.match(/(shcat_[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/);
                    if (match) {
                        capturedAuthToken = match[1];
                        sessionStorage.setItem('shopify_auth_token', match[1]);
                        return match[1];
                    }
                }
            }
        } catch (e) { }

        return null;
    }

    function captureAuthTokenFromHeaders(headers) {
        if (!headers) return;
        try {
            if (typeof Headers !== 'undefined' && headers instanceof Headers) {
                const auth = headers.get('authorization') || headers.get('Authorization');
                if (auth && auth.includes('shcat_')) {
                    if (capturedAuthToken !== auth) {
                        capturedAuthToken = auth;
                        sessionStorage.setItem('shopify_auth_token', auth);
                        logAnalytics('🔑 Token Authorization shcat_ capturado:', auth.substring(0, 30) + '...');
                    }
                }
            } else if (typeof headers === 'object') {
                for (const key in headers) {
                    if (key.toLowerCase() === 'authorization' && typeof headers[key] === 'string' && headers[key].includes('shcat_')) {
                        if (capturedAuthToken !== headers[key]) {
                            capturedAuthToken = headers[key];
                            sessionStorage.setItem('shopify_auth_token', headers[key]);
                            logAnalytics('🔑 Token Authorization shcat_ capturado:', headers[key].substring(0, 30) + '...');
                        }
                        break;
                    }
                }
            }
        } catch (e) { }
    }

    function setupFetchInterceptor() {
        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

        try {
            const originalXHRSetHeader = targetWindow.XMLHttpRequest.prototype.setRequestHeader;
            targetWindow.XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
                if (header && typeof header === 'string' && header.toLowerCase() === 'authorization' && value && value.includes('shcat_')) {
                    capturedAuthToken = value;
                    sessionStorage.setItem('shopify_auth_token', value);
                }
                return originalXHRSetHeader.apply(this, arguments);
            };
        } catch (ex) { }

        const originalFetch = targetWindow.fetch;
        targetWindow.fetch = async function (...args) {
            const firstArg = args[0];
            const options = args[1];

            if (firstArg && typeof firstArg === 'object' && firstArg.headers) {
                captureAuthTokenFromHeaders(firstArg.headers);
            }
            if (options && options.headers) {
                captureAuthTokenFromHeaders(options.headers);
            }

            const response = await originalFetch.apply(this, args);
            try {
                let requestUrl = (typeof firstArg === 'string') ? firstArg : (firstArg?.url || '');
                if (requestUrl.includes('graphql') || requestUrl.includes('/account') || requestUrl.includes('/api')) {
                    const clone = response.clone();
                    clone.json().then(res => {
                        let uniqueOrders = getStoredOrders();
                        if (extractOrdersFromObj(res, uniqueOrders)) {
                            saveStoredOrders(uniqueOrders);
                            updateDashboard();
                            syncMissingOrderDetails();
                        }
                    }).catch(() => { });
                }
            } catch (err) { }
            return response;
        };
    }

    function extractOrderIdFromArticle(article) {
        if (!article) return null;

        const ariaLabel = article.getAttribute('aria-labelledby') || article.querySelector('h2')?.id || '';
        let match = ariaLabel.match(/(#(?:CJ|[A-Za-z]{2,})[A-Za-z0-9\-_]+)/i);
        if (match) return match[1].trim();

        const textContent = article.textContent || '';
        match = textContent.match(/(#(?:CJ|[A-Za-z]{2,})[A-Za-z0-9\-_]+)/i);
        if (match) return match[1].trim();

        match = textContent.match(/#(?![\d]{1,3}\s)[A-Za-z0-9\-_]{4,}/);
        if (match) return match[0].trim();

        return null;
    }

    function injectDatesIntoDOM() {
        const ordersMap = getStoredOrders();
        const articles = Array.from(document.querySelectorAll('article'));
        const totalAllOrders = Object.keys(ordersMap).length || articles.length;

        articles.forEach((article, index) => {
            const orderId = extractOrderIdFromArticle(article);
            if (orderId && ordersMap[orderId]) {
                const orderInfo = ordersMap[orderId];
                const formattedDate = orderInfo.date ? formatOrderDate(orderInfo.date) : '';
                const discountCode = orderInfo.discountCode ? ` · ${SVG_ICONS.tagInline} ${orderInfo.discountCode}` : '';

                // Número consecutivo de pedido: #547 para el más reciente de arriba, descendiendo hasta #1
                const orderIndexNum = totalAllOrders - index;
                const indexPrefix = orderIndexNum > 0 ? `#${orderIndexNum} · ` : '';

                // Buscar el span interno exacto que contiene "#CJ..." y el monto
                const spans = Array.from(article.querySelectorAll('span'));
                const subSpan = spans.find(span => {
                    const text = span.textContent || '';
                    return text.includes(orderId) && (text.includes('COP') || text.includes('$') || text.includes('·'));
                });

                if (subSpan) {
                    // Prepend del número correlativo #X si no existe
                    let existingIndexBadge = subSpan.querySelector('.shopify-order-index-badge');
                    if (existingIndexBadge) {
                        if (existingIndexBadge.textContent !== indexPrefix) {
                            existingIndexBadge.textContent = indexPrefix;
                        }
                    } else if (indexPrefix) {
                        const indexBadge = document.createElement('span');
                        indexBadge.className = 'shopify-order-index-badge';
                        indexBadge.style.cssText = `
                            color: inherit;
                            font-weight: inherit;
                            font-size: inherit;
                            display: inline;
                        `;
                        indexBadge.textContent = indexPrefix;
                        subSpan.insertBefore(indexBadge, subSpan.firstChild);
                    }

                    // Inyección de la fecha y descuento heredando el mismo color de texto nativo
                    let existingBadge = subSpan.querySelector('.shopify-order-date-badge');
                    const badgeText = `${discountCode}${formattedDate ? ` · ${formattedDate}` : ''}`;

                    if (badgeText) {
                        if (existingBadge) {
                            if (existingBadge.innerHTML !== badgeText) {
                                existingBadge.innerHTML = badgeText;
                            }
                        } else {
                            const badge = document.createElement('span');
                            badge.className = 'shopify-order-date-badge';
                            badge.style.cssText = `
                                color: inherit;
                                font-weight: inherit;
                                font-size: inherit;
                                opacity: 0.9;
                                display: inline;
                            `;
                            badge.innerHTML = badgeText;
                            subSpan.appendChild(badge);
                        }
                    }
                }

                // Contenedor interno de la tarjeta para NO desbordar horizontalmente como columna de article
                const cardInnerContainer = subSpan?.parentElement || article.querySelector('h2')?.parentElement || article.firstElementChild || article;

                let extraBadgesContainer = cardInnerContainer.querySelector('.shopify-order-extra-badges');
                if ((orderInfo.note || orderInfo.paymentMethod) && !extraBadgesContainer) {
                    extraBadgesContainer = document.createElement('div');
                    extraBadgesContainer.className = 'shopify-order-extra-badges';
                    extraBadgesContainer.style.cssText = `
                        margin-top: 6px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        align-items: center;
                        width: 100%;
                    `;
                    cardInnerContainer.appendChild(extraBadgesContainer);
                }

                // Inyección de la etiqueta de nota de pedido si existe
                if (orderInfo.note && extraBadgesContainer) {
                    let existingNoteBadge = extraBadgesContainer.querySelector('.shopify-order-note-badge');
                    if (existingNoteBadge) {
                        if (existingNoteBadge.getAttribute('data-note') !== orderInfo.note) {
                            existingNoteBadge.setAttribute('data-note', orderInfo.note);
                            existingNoteBadge.innerHTML = `${SVG_ICONS.note} <strong>Nota:</strong> ${orderInfo.note}`;
                        }
                    } else {
                        const noteBadge = document.createElement('div');
                        noteBadge.className = 'shopify-order-note-badge';
                        noteBadge.setAttribute('data-note', orderInfo.note);
                        noteBadge.style.cssText = `
                            font-size: 11px;
                            background: #fff8e1;
                            color: #b45309;
                            padding: 3px 8px;
                            border-radius: 6px;
                            font-weight: 500;
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            border: 1px solid #fef3c7;
                            width: fit-content;
                        `;
                        noteBadge.innerHTML = `${SVG_ICONS.note} <strong>Nota:</strong> ${orderInfo.note}`;
                        extraBadgesContainer.appendChild(noteBadge);
                    }
                }

                // Inyección de la etiqueta de medio de pago si existe
                if (orderInfo.paymentMethod && extraBadgesContainer) {
                    let existingPaymentBadge = extraBadgesContainer.querySelector('.shopify-order-payment-badge');
                    if (existingPaymentBadge) {
                        if (existingPaymentBadge.getAttribute('data-payment') !== orderInfo.paymentMethod) {
                            existingPaymentBadge.setAttribute('data-payment', orderInfo.paymentMethod);
                            existingPaymentBadge.innerHTML = `${SVG_ICONS.card} <strong>Pago:</strong> ${orderInfo.paymentMethod}`;
                        }
                    } else {
                        const paymentBadge = document.createElement('div');
                        paymentBadge.className = 'shopify-order-payment-badge';
                        paymentBadge.setAttribute('data-payment', orderInfo.paymentMethod);
                        paymentBadge.style.cssText = `
                            font-size: 11px;
                            background: #eff6ff;
                            color: #1d4ed8;
                            padding: 3px 8px;
                            border-radius: 6px;
                            font-weight: 500;
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            border: 1px solid #dbeafe;
                            width: fit-content;
                        `;
                        paymentBadge.innerHTML = `${SVG_ICONS.card} <strong>Pago:</strong> ${orderInfo.paymentMethod}`;
                        extraBadgesContainer.appendChild(paymentBadge);
                    }
                }
            }
        });
    }

    function applyDOMDateFilter(filteredOrderIds) {
        const filterSet = new Set(filteredOrderIds);
        const articles = document.querySelectorAll('article');
        let visibleCount = 0;

        articles.forEach(article => {
            const orderId = extractOrderIdFromArticle(article);
            if (orderId) {
                if (currentFilterMode === 'all' && currentDiscountFilter === 'all') {
                    article.style.display = '';
                    visibleCount++;
                } else {
                    if (filterSet.has(orderId)) {
                        article.style.display = '';
                        visibleCount++;
                    } else {
                        article.style.display = 'none';
                    }
                }
            }
        });

        let emptyNotice = document.getElementById('shopify-empty-filter-notice');
        if (visibleCount === 0 && (currentFilterMode !== 'all' || currentDiscountFilter !== 'all')) {
            if (!emptyNotice) {
                emptyNotice = document.createElement('div');
                emptyNotice.id = 'shopify-empty-filter-notice';
                emptyNotice.style.cssText = `
                    margin-top: 20px;
                    padding: 24px;
                    background: #ffffff;
                    border: 1px dashed #cccccc;
                    border-radius: 12px;
                    text-align: center;
                    color: #70647a;
                    font-family: 'Poppins', sans-serif;
                `;
                emptyNotice.innerHTML = `
                    <span style="font-size: 24px; display: block; margin-bottom: 8px;">🔍</span>
                    <strong style="color: #16081e; font-size: 14px;">No hay pedidos en pantalla que coincidan con este filtro.</strong>
                    <span style="display: block; font-size: 12px; margin-top: 4px;">Selecciona "Todas" o cambia el rango de fechas. Si tienes pedidos antiguos, haz clic en "Cargar todos".</span>
                `;
                const panel = document.getElementById('shopify-top-analytics-panel');
                if (panel && panel.parentNode) {
                    panel.parentNode.insertBefore(emptyNotice, panel.nextSibling);
                }
            } else {
                emptyNotice.style.display = 'block';
            }
        } else if (emptyNotice) {
            emptyNotice.style.display = 'none';
        }
    }

    function extractGidFromArticle(article) {
        if (!article) return null;
        const htmlText = article.innerHTML || '';
        const match = htmlText.match(/\/orders\/([0-9]+)/);
        if (match) {
            return `gid://shopify/Order/${match[1]}`;
        }
        return null;
    }

    function scanDOMOrders() {
        let uniqueOrders = getStoredOrders();
        let newFound = false;

        const articles = document.querySelectorAll('article');
        articles.forEach(article => {
            const orderId = extractOrderIdFromArticle(article);
            const gid = extractGidFromArticle(article);
            const textContent = article.textContent || "";
            const priceMatch = textContent.match(/\$\s*([\d\.,]+)\s*COP/) || textContent.match(/([\d\.,]+)\s*COP/);

            const timeEl = article.querySelector('time');
            let extractedDate = null;
            if (timeEl) {
                extractedDate = timeEl.getAttribute('datetime') || timeEl.textContent;
            }

            if (orderId && priceMatch) {
                let cleanNumStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
                let price = parseFloat(cleanNumStr);

                if (!isNaN(price)) {
                    if (!uniqueOrders[orderId]) {
                        uniqueOrders[orderId] = { price: price, date: extractedDate, gid: gid, detailFetched: false };
                        newFound = true;
                    } else {
                        if (!uniqueOrders[orderId].gid && gid) {
                            uniqueOrders[orderId].gid = gid;
                            newFound = true;
                        }
                        if (!uniqueOrders[orderId].date && extractedDate) {
                            uniqueOrders[orderId].date = extractedDate;
                            newFound = true;
                        }
                    }
                }
            }
        });

        if (newFound) {
            saveStoredOrders(uniqueOrders);
        }

        return uniqueOrders;
    }

    const MONTH_MAP = {
        'ENE': 0, 'FEB': 1, 'MAR': 2, 'ABR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AGO': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DIC': 11
    };

    function parseSpanishDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const isoDate = new Date(dateStr);
        if (!isNaN(isoDate.getTime())) return isoDate;

        const match = dateStr.match(/(\d{1,2})[\/\s]+([A-Za-z]{3})[\/\s]+(\d{4})/i);
        if (match) {
            const day = parseInt(match[1], 10);
            const monthStr = match[2].toUpperCase();
            const year = parseInt(match[3], 10);
            const month = MONTH_MAP[monthStr];
            if (month !== undefined) return new Date(year, month, day);
        }
        return null;
    }

    function filterOrders(ordersMap) {
        const orderIds = Object.keys(ordersMap);
        const now = new Date();

        return orderIds.filter(id => {
            const order = ordersMap[id];
            if (!order) return false;

            // 1. Filtro por Fecha
            if (currentFilterMode !== 'all') {
                if (!order.date) return false;
                const orderDate = parseSpanishDate(order.date);
                if (!orderDate || isNaN(orderDate.getTime())) return false;

                if (currentFilterMode === 'month') {
                    if (orderDate.getMonth() !== now.getMonth() || orderDate.getFullYear() !== now.getFullYear()) return false;
                } else if (currentFilterMode === 'year') {
                    if (orderDate.getFullYear() !== now.getFullYear()) return false;
                } else if (currentFilterMode === 'custom') {
                    if (customStartDate) {
                        const start = new Date(customStartDate + 'T00:00:00');
                        if (orderDate < start) return false;
                    }
                    if (customEndDate) {
                        const end = new Date(customEndDate + 'T23:59:59');
                        if (orderDate > end) return false;
                    }
                }
            }

            // 2. Filtro por Descuento
            if (currentDiscountFilter === 'with_discount') {
                if (!order.discountCode && (!order.discountAmount || order.discountAmount <= 0)) return false;
            } else if (currentDiscountFilter === 'without_discount') {
                if (order.discountCode || (order.discountAmount && order.discountAmount > 0)) return false;
            } else if (currentDiscountFilter !== 'all') {
                if (order.discountCode !== currentDiscountFilter) return false;
            }

            return true;
        });
    }

    let lastDashboardStateHash = '';

    function updateDashboard(forceRender = false) {
        scanDOMOrders();

        const ordersMap = getStoredOrders();
        const totalAllOrders = Object.keys(ordersMap).length;
        const filteredIds = filterOrders(ordersMap);

        const currentHash = `${filteredIds.length}_${totalAllOrders}_${currentFilterMode}_${currentDiscountFilter}_${isSyncingDetails}_${pendingSyncCurrent}_${userStoppedSync}`;

        if (!forceRender && currentHash === lastDashboardStateHash && document.getElementById('shopify-top-analytics-panel')) {
            injectDatesIntoDOM();
            if (!userStoppedSync && !isSyncingDetails) {
                syncMissingOrderDetails();
            }
            return;
        }

        lastDashboardStateHash = currentHash;

        // Validar si el pedido más reciente del DOM ya está en la memoria local (localStorage)
        const articles = document.querySelectorAll('article');
        let newestDomOrderId = null;
        if (articles.length > 0) {
            newestDomOrderId = extractOrderIdFromArticle(articles[0]);
        }

        const isNewestInCache = newestDomOrderId && ordersMap[newestDomOrderId];
        const pagBtn = getPaginationButton();

        let statusLabel = `${SVG_ICONS.check} Sincronizado`;
        let statusBgColor = '#2e7d32'; // verde

        if (userStoppedSync) {
            statusLabel = `🛑 Detenido`;
            statusBgColor = '#ea580c'; // naranja / rojo
            isFullySynced = false;
        } else if (isAutoLoadingAll) {
            statusLabel = `${SVG_ICONS.spin} Sincronizando...`;
            statusBgColor = '#0288d1'; // azul
            isFullySynced = false;
        } else if (isSyncingDetails && pendingSyncTotal > 0) {
            statusLabel = `${SVG_ICONS.spin} Detalles (${pendingSyncCurrent} de ${pendingSyncTotal})`;
            statusBgColor = '#0288d1'; // azul
            isFullySynced = false;
        } else if (currentFilterMode !== 'all' || currentDiscountFilter !== 'all') {
            statusLabel = `${SVG_ICONS.search} Filtrando (${filteredIds.length} de ${totalAllOrders})`;
            statusBgColor = '#7b1fa2'; // morado
            isFullySynced = isNewestInCache;
        } else if (totalAllOrders === 0) {
            statusLabel = `${SVG_ICONS.spin} Sincronizando...`;
            statusBgColor = '#0288d1';
            isFullySynced = false;
        } else if (!isNewestInCache && pagBtn) {
            statusLabel = `${SVG_ICONS.alert} Sincronización parcial`;
            statusBgColor = '#e65100';
            isFullySynced = false;
        } else {
            statusLabel = `${SVG_ICONS.check} Sincronizado`;
            statusBgColor = '#2e7d32';
            isFullySynced = true;
        }

        const orderCount = filteredIds.length;

        let totalSpent = 0;
        let totalGross = 0;
        let totalSavings = 0;

        filteredIds.forEach(id => {
            const orderData = ordersMap[id];
            const price = orderData.price || 0;
            const discountAmt = orderData.discountAmount || 0;
            const priceBefore = orderData.priceBeforeDiscounts || (price + discountAmt);

            totalSpent += price;
            totalGross += priceBefore;
            totalSavings += (priceBefore > price ? (priceBefore - price) : discountAmt);
        });

        const average = orderCount > 0 ? totalSpent / orderCount : 0;

        renderPanel(orderCount, formatCurrency(totalSpent), formatCurrency(totalGross), formatCurrency(totalSavings), formatCurrency(average), statusLabel, statusBgColor, false);
        injectDatesIntoDOM();
        applyDOMDateFilter(filteredIds);
        syncMissingOrderDetails();
    }

    setupFetchInterceptor();

    window.addEventListener('load', () => {
        logAnalytics('🚀 Userscript de Analítica de Pedidos inicializado correctamente.');
        renderPanel(0, "$ 0,00", "$ 0,00", "$ 0,00", "$ 0,00", "Cargando...", null, true);

        const cached = getStoredOrders();
        const ids = Object.keys(cached);
        if (ids.length > 0) {
            let totalSpent = 0;
            let totalGross = 0;
            let totalSavings = 0;

            ids.forEach(id => {
                const item = cached[id];
                const price = typeof item === 'object' ? item.price : item;
                const discountAmt = typeof item === 'object' ? (item.discountAmount || 0) : 0;
                const priceBefore = typeof item === 'object' ? (item.priceBeforeDiscounts || (price + discountAmt)) : price;

                totalSpent += price;
                totalGross += priceBefore;
                totalSavings += (priceBefore > price ? (priceBefore - price) : discountAmt);
            });

            renderPanel(ids.length, formatCurrency(totalSpent), formatCurrency(totalGross), formatCurrency(totalSavings), formatCurrency(totalSpent / ids.length), "Caché Local", null, false);
            injectDatesIntoDOM();
        }

        renderNavFloatingButtons();
        setTimeout(updateDashboard, 1000);
        setTimeout(updateDashboard, 2500);
    });

    setInterval(() => {
        updateDashboard();
    }, 3000);

})();