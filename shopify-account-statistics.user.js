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
    const SYNC_PROGRESS_KEY = 'shopify_sync_progress';
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
        receipt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>`,
        piggy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h3v-2h4v2h3v-3.5c1.7-1.2 2-2.7 2-4.5 0-2.5 0-4.5-2-4.5h-1"/><circle cx="7" cy="11" r="1"/></svg>`,
        chart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="m3 3 7 7 4-4 7 7"/><path d="M14 13h7v7"/></svg>`,
        check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
        spin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shopify-spin-icon" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
        cloudDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M4 14.89 4.13 14c.48-3.32 3.32-6 6.87-6 2.56 0 4.83 1.39 6.06 3.44.22-.04.44-.06.67-.06 2.49 0 4.5 2.01 4.5 4.5 0 2.37-1.83 4.31-4.16 4.49"/><path d="m12 12v9"/><path d="m8 17 4 4 4-4"/></svg>`,
        refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
        trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        calendar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
        tags: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M12 2H2v10l11.29 11.29a1 1 0 0 0 1.41 0l7.58-7.58a1 1 0 0 0 0-1.41L12 2Z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
        tagInline: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-left:2px;margin-right:2px;"><path d="M12 2H2v10l11.29 11.29a1 1 0 0 0 1.41 0l7.58-7.58a1 1 0 0 0 0-1.41L12 2Z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
        arrowUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`,
        arrowDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
        alert: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
        stop: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
        search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        trophy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;color:#d97706;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
        bag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
        note: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:3px;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
        card: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:3px;"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
        close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
    };

    function injectSpinStyles() {
        if (!document.getElementById('shopify-spin-style') && document.head) {
            const style = document.createElement('style');
            style.id = 'shopify-spin-style';
            style.textContent = `@keyframes shopifySpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .shopify-spin-icon { animation: shopifySpin 0.9s linear infinite; } @keyframes shopifyPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }`;
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
            const label = ((btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('title') || '')).toLowerCase();
            if (label.includes('cargar más') || label.includes('ver más') || label.includes('mostrar más') || label.includes('show more') || label.includes('load more') || label.includes('siguiente')) {
                return btn;
            }
        }
        return null;
    }

    async function loadAllOrders(withScroll = false) {
        if (isAutoLoadingAll) return;
        isAutoLoadingAll = true;
        updateDashboard();

        let count = 0;
        const maxAttempts = 200;

        const ensureButton = async () => {
            if (withScroll) window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
            for (let i = 0; i < 8; i++) {
                const b = getPaginationButton();
                if (b) return b;
                await new Promise(resolve => setTimeout(resolve, 500));
                scanDOMOrders();
                if (withScroll) window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
            }
            return null;
        };

        while (count < maxAttempts) {
            if (userStoppedSync || isSyncCancelled) break;
            const loadBtn = await ensureButton();
            if (!loadBtn || userStoppedSync || isSyncCancelled) break;
            loadBtn.click();
            count++;
            await new Promise(resolve => setTimeout(resolve, 600));
            scanDOMOrders();
        }

        isAutoLoadingAll = false;
        hasMorePagesDetected = false;
        updateDashboard();
        await syncMissingOrderDetails(null, true);
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
                await loadAllOrders(true);
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
                const discountType = order.discountType || null;
                if (!code && (order.discountAmount && order.discountAmount > 0)) {
                    if (discountType === 'manual') {
                        code = 'Descuento Sin Nombre (Manual)';
                    } else if (discountType === 'automatic') {
                        code = 'Descuento Sin Nombre (Automático)';
                    } else {
                        code = 'Descuento Sin Nombre (Automático / Manual)';
                    }
                }
                if (code) {
                    if (!discountsMap[code]) {
                        discountsMap[code] = { code: code, count: 0, totalSaved: 0, type: discountType, orders: [] };
                    }
                    discountsMap[code].count += 1;
                    discountsMap[code].totalSaved += (order.discountAmount || 0);
                    discountsMap[code].orders.push({ name: key, gid: order.gid || null });
                }
            }
        }
        return Object.values(discountsMap).sort((a, b) => b.totalSaved - a.totalSaved);
    }

    function getPaymentBreakdown(ordersMap) {
        const paymentsMap = {};
        for (const key in ordersMap) {
            const order = ordersMap[key];
            const method = cleanPaymentMethodLabel(order.paymentMethod) || 'No especificado / Estándar';
            if (!paymentsMap[method]) {
                paymentsMap[method] = { method: method, count: 0, totalSpent: 0, orders: [] };
            }
            paymentsMap[method].count += 1;
            paymentsMap[method].totalSpent += (order.price || 0);
            paymentsMap[method].orders.push({ name: key, gid: order.gid || null });
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
            padding: 24px;
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
                    const pct = p.minPrice > 0 ? (((p.maxPrice - p.minPrice) / p.minPrice) * 100).toFixed(1) : null;
                    priceHistoryHtml = `<span style="font-size: 11px; font-weight: 700; color: #b45309; white-space: nowrap;">📈 ${formatCurrency(p.minPrice)} – ${formatCurrency(p.maxPrice)} ${pct ? `(+${pct}%)` : ''} <span style="color: #70647a; font-weight: 500;">/ und.</span></span>`;
                } else if (p.minPrice > 0) {
                    priceHistoryHtml = `<span style="font-size: 11px; font-weight: 700; color: #16081e; white-space: nowrap;">${formatCurrency(p.minPrice)} <span style="color: #70647a; font-weight: 500;">/ und.</span></span>`;
                } else {
                    priceHistoryHtml = `<span style="font-size: 11px; color: #70647a;">–</span>`;
                }
                const periodChipHtml = p.dateRangeStr ? `<span style="font-size: 10px; color: #70647a; background: #f8f5fb; border: 1px solid #e9ddf5; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">📅 ${p.dateRangeStr}</span>` : '';

                const histEntries = Array.isArray(p.history) ? p.history : [];
                const conDescCount = histEntries.filter(h => h.discountAmount > 0).length;
                const sinDescCount = histEntries.length - conDescCount;
                let discountChipHtml = '';
                if (histEntries.length > 0) {
                    if (conDescCount > 0 && sinDescCount > 0) {
                        discountChipHtml = `<span style="font-size: 10px; font-weight: 600; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">🎁 Con desc. ${conDescCount} · Sin desc. ${sinDescCount}</span>`;
                    } else if (conDescCount > 0) {
                        discountChipHtml = `<span style="font-size: 10px; font-weight: 600; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">🎁 Con desc. en ${conDescCount} compra(s)</span>`;
                    } else {
                        discountChipHtml = `<span style="font-size: 10px; font-weight: 600; color: #94a3b8; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">Sin descuento</span>`;
                    }
                }

                let variantBadgeHtml = '';
                if (Array.isArray(p.variantList) && p.variantList.length > 0) {
                    const hasNonStandard = p.variantList.some(v => v.name !== 'Estándar');
                    if (hasNonStandard || p.variantList.length > 1) {
                        const itemsHtml = p.variantList.map(v => {
                            const orderLabel = v.ordersCount === 1 ? '1 compra' : `${v.ordersCount} compras`;
                            return `<span style="display: inline-flex; align-items: center; gap: 4px; background: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 3px 8px; font-size: 11px; color: #4a3e56; white-space: nowrap;">🎨 <strong style="color: #6b21a8;">${v.name}</strong> · ${v.quantity} und. · ${orderLabel} · ${formatCurrency(v.totalSpent)}</span>`;
                        }).join('');

                        variantBadgeHtml = `
                            <div style="margin-top: 6px; padding: 6px 10px; background: #fcf9fe; border: 1px solid #f0e6f7; border-radius: 8px; font-size: 11px; color: #4a3e56; text-align: left;">
                                <div style="font-weight: 700; color: #7e22ce; margin-bottom: 4px;">🎨 Desglose por Variante (${p.variantList.length}):</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">${itemsHtml}</div>
                            </div>
                        `;
                    }
                }

                const historyRowId = `shopify-history-row-${idx}`;
                const grouped = (Array.isArray(p.groupedHistory) && p.groupedHistory.length > 0) ? p.groupedHistory : null;
                let historySubRowHtml = '';
                if (grouped) {
                    const timelineCardsHtml = grouped.map((g, gIdx) => {
                        const paidStr = formatCurrency(g.unitPricePaid);
                        const hasDiscount = g.discountAmount > 0;
                        const grossStr = hasDiscount ? formatCurrency(g.unitPriceGross) : paidStr;
                        const savedStr = hasDiscount ? formatCurrency(g.discountAmount) : null;
                        const count = g.orders.length;
                        const countLabel = count === 1 ? '1 compra' : `${count} compras`;

                        const variantChip = g.variantName
                            ? `<span style="color:${g.variantName === 'Estándar' ? '#70647a' : '#6b21a8'}; font-weight:600; background:${g.variantName === 'Estándar' ? '#f8f5fb' : '#faf5ff'}; border:1px solid ${g.variantName === 'Estándar' ? '#eee5f7' : '#f3e8ff'}; padding:1px 6px; border-radius:4px; white-space:nowrap;">🎨 ${g.variantName}</span>`
                            : '';

                        const orderLinks = g.orders.map(o => {
                            const url = getOrderUrl(o.orderGid);
                            return url
                                ? `<a href="${url}" target="_blank" rel="noopener noreferrer" style="font-weight:700; color:#9333ea; background:#f3e8ff; padding:1px 6px; border-radius:6px; font-size:11px; text-decoration:none; white-space:nowrap;" onmouseover="this.style.textDecoration='underline';" onmouseout="this.style.textDecoration='none';">${o.orderName} ↗</a>`
                                : `<span style="font-weight:700; color:#9333ea; background:#f3e8ff; padding:1px 6px; border-radius:6px; font-size:11px; white-space:nowrap;">${o.orderName}</span>`;
                        }).join(' ');

                        const dateStrs = g.dates.map(d => formatDateShort(d)).filter(Boolean);
                        const dateLabel = dateStrs.length > 0
                            ? (dateStrs.length === 1 ? dateStrs[0] : `${dateStrs[0]} ➔ ${dateStrs[dateStrs.length - 1]}`)
                            : 'Sin fecha';

                        let changeConnectorHtml = '';
                        if (gIdx < grouped.length - 1) {
                            const next = grouped[gIdx + 1];
                            const curPrice = g.unitPricePaid;
                            const nextPrice = next.unitPricePaid;
                            const curTag = g.discountAmount > 0 ? ' (con desc.)' : ' (sin desc.)';
                            const nextTag = next.discountAmount > 0 ? ' (con desc.)' : ' (sin desc.)';
                            const eps = 0.005;
                            if (nextPrice > curPrice + eps) {
                                const diff = nextPrice - curPrice;
                                const pct = curPrice > 0 ? ((diff / curPrice) * 100).toFixed(1) : '0';
                                changeConnectorHtml = `
                                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 2px 0; padding: 3px 8px; font-size: 11px; font-weight: 700; color: #c2410c; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 8px; text-align: center;">
                                        📈 El precio subió: ${formatCurrency(curPrice)}${curTag} → ${formatCurrency(nextPrice)}${nextTag} / und. (+${pct}%)
                                    </div>`;
                            } else if (nextPrice < curPrice - eps) {
                                const diff = curPrice - nextPrice;
                                const pct = curPrice > 0 ? ((diff / curPrice) * 100).toFixed(1) : '0';
                                changeConnectorHtml = `
                                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 2px 0; padding: 3px 8px; font-size: 11px; font-weight: 700; color: #2e7d32; background: #e9f7ef; border: 1px solid #c8ecd8; border-radius: 8px; text-align: center;">
                                        📉 El precio bajó: ${formatCurrency(curPrice)}${curTag} → ${formatCurrency(nextPrice)}${nextTag} / und. (-${pct}%)
                                    </div>`;
                            }
                        }

                        return `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: #ffffff; border: 1px solid #e9d5ff; border-radius: 8px; font-size: 11px; margin-bottom: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); gap: 10px; flex-wrap: wrap;">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    ${variantChip}
                                    <span style="font-weight: 700; color: #2e7d32; background: #e9f7ef; border: 1px solid #c8ecd8; padding: 1px 6px; border-radius: 4px; white-space:nowrap;">× ${countLabel}</span>
                                    <span style="color: #70647a; font-weight: 500; white-space:nowrap;">📅 ${dateLabel}</span>
                                </div>
                                <div style="text-align: right; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <div>
                                        <span style="font-weight: 700; color: #2e7d32; font-size: 12px; white-space:nowrap;">Con desc.: ${paidStr}/und.</span>
                                        ${hasDiscount ? `<span style="color: #70647a; font-size: 10px; text-decoration: line-through; margin-left: 6px; white-space:nowrap;">Sin desc.: ${grossStr}</span>` : ''}
                                    </div>
                                    ${savedStr ? `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 10px; white-space:nowrap;">🎁 Ahorro ${savedStr}/und. ${g.discountCode ? `(${g.discountCode})` : ''}</span>` : `<span style="color: #94a3b8; font-size: 10px;">Sin descuento</span>`}
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 4px 14px 10px 14px; font-size: 11px; color: #4a3e56;">
                                <span style="font-weight: 600;">Pedidos:</span> ${orderLinks}
                            </div>
                            ${changeConnectorHtml}
                        `;
                    }).join('');

                    historySubRowHtml = `
                        <tr id="${historyRowId}" style="display: none; background: #fdfbfe; border-bottom: 2px solid #e9d5ff;">
                            <td colspan="5" style="padding: 12px 16px;">
                                <div style="background: #ffffff; border: 1px solid #e2d8ee; border-radius: 12px; padding: 12px; box-shadow: 0 4px 12px rgba(147, 51, 234, 0.08);">
                                    <div style="font-weight: 700; color: #7e22ce; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f3e8ff; padding-bottom: 6px;">
                                        <span>📜 Cronograma de Compras & Histórico de Precios — <strong style="color: #16081e;">${p.title}</strong></span>
                                        <span style="font-size: 11px; color: #70647a; background: #f3e8ff; padding: 2px 8px; border-radius: 10px; font-weight: 600;">📅 Periodo Activo: ${p.dateRangeStr || 'Sin fecha'}</span>
                                    </div>
                                    <div style="display: flex; flex-direction: column; gap: 4px;">
                                        ${timelineCardsHtml}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `;
                }

                const toggleHistoryBtn = (grouped && grouped.length > 0) ? `
                    <button class="shopify-toggle-history-btn" data-target="${historyRowId}" style="background: #f8f5fb; color: #9333ea; border: 1px solid #e2d8ee; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; cursor: pointer; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s ease;" onmouseover="this.style.background='#9333ea'; this.style.color='#ffffff';" onmouseout="this.style.background='#f8f5fb'; this.style.color='#9333ea';">
                        📜 Histórico de Precios (${grouped.length})
                    </button>
                ` : '';

                top10RowsHtml += `
                    <tr style="border-bottom: 1px solid #f0ecf4;">
                        <td style="padding: 12px 14px; font-weight: 700; color: #9333ea; font-size: 13px;">#${idx + 1}</td>
                        <td style="padding: 12px 14px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                ${imgHtml}
                                <div>
                                    ${titleHtml}
                                    ${variantBadgeHtml ? `<br>${variantBadgeHtml}` : ''}
                                </div>
                            </div>
                        </td>
                        <td style="padding: 12px 14px; text-align: center; font-weight: 700; color: #16081e; font-size: 13px;">${p.quantity} und.</td>
                        <td style="padding: 12px 14px; text-align: center;">
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                                <div>${priceHistoryHtml}</div>
                                ${(periodChipHtml || toggleHistoryBtn || discountChipHtml) ? `<div style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;">${periodChipHtml}${discountChipHtml}${toggleHistoryBtn}</div>` : ''}
                            </div>
                        </td>
                        <td style="padding: 12px 14px; text-align: right; font-weight: 700; color: #2e7d32; font-size: 13px; white-space: nowrap;">${formatCurrency(p.totalSpent)}</td>
                    </tr>
                    ${historySubRowHtml}
                `;
            });
        }

        let discountRowsHtml = '';
        if (discountBreakdown.length === 0) {
            discountRowsHtml = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #70647a;">No se registran cupones de descuento aplicados.</td></tr>`;
        } else {
            discountBreakdown.forEach((d) => {
                let typeBadgeHtml = '';
                if (d.type === 'manual') {
                    typeBadgeHtml = `<span style="background: #ede9fe; color: #7c3aed; border: 1px solid #ddd6fe; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">${SVG_ICONS.tagInline} Manual</span>`;
                } else if (d.type === 'automatic') {
                    typeBadgeHtml = `<span style="background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">${SVG_ICONS.tagInline} Automático</span>`;
                }

                const dOrdersLinks = (Array.isArray(d.orders) && d.orders.length > 0)
                    ? d.orders.map(o => {
                        const url = getOrderUrl(o.gid);
                        return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#b45309; text-decoration:underline; font-weight:600; padding:1px 5px; background:#fff8e1; border-radius:4px; border:1px solid #fef3c7;">${o.name}</a>` : `<span style="color:#b45309; font-weight:600;">${o.name}</span>`;
                    }).join(' ')
                    : '';

                discountRowsHtml += `
                    <tr style="border-bottom: 1px solid #f0ecf4;">
                        <td style="padding: 12px 14px; font-weight: 700; color: #b45309; font-size: 13px;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                ${SVG_ICONS.tagInline} ${d.code} ${typeBadgeHtml}
                            </div>
                            ${dOrdersLinks ? `<div style="margin-top: 4px; font-size: 11px; color: #70647a; font-weight: 400; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;"><span>Pedidos:</span> ${dOrdersLinks}</div>` : ''}
                        </td>
                        <td style="padding: 12px 14px; text-align: center; font-weight: 600; font-size: 13px; color: #16081e;">${d.count} ${d.count === 1 ? 'pedido' : 'pedidos'}</td>
                        <td style="padding: 12px 14px; text-align: right; font-weight: 700; color: #2e7d32; font-size: 13px;">${formatCurrency(d.totalSaved)} ahorrado</td>
                    </tr>
                `;
            });
        }

        let paymentRowsHtml = '';
        if (paymentBreakdown.length === 0) {
            paymentRowsHtml = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #70647a;">Sin datos de medios de pago.</td></tr>`;
        } else {
            paymentBreakdown.forEach((pm) => {
                const pmOrdersLinks = (Array.isArray(pm.orders) && pm.orders.length > 0)
                    ? pm.orders.map(o => {
                        const url = getOrderUrl(o.gid);
                        return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8; text-decoration:underline; font-weight:600; padding:1px 5px; background:#eff6ff; border-radius:4px; border:1px solid #dbeafe;">${o.name}</a>` : `<span style="color:#1d4ed8; font-weight:600;">${o.name}</span>`;
                    }).join(' ')
                    : '';

                paymentRowsHtml += `
                    <tr style="border-bottom: 1px solid #f0ecf4;">
                        <td style="padding: 12px 14px; font-weight: 600; color: #1d4ed8; font-size: 13px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                ${SVG_ICONS.card} ${pm.method}
                            </div>
                            ${pmOrdersLinks ? `<div style="margin-top: 4px; font-size: 11px; color: #70647a; font-weight: 400; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;"><span>Pedidos:</span> ${pmOrdersLinks}</div>` : ''}
                        </td>
                        <td style="padding: 12px 14px; text-align: center; font-weight: 600; font-size: 13px; color: #16081e;">${pm.count} ${pm.count === 1 ? 'pedido' : 'pedidos'}</td>
                        <td style="padding: 12px 14px; text-align: right; font-weight: 700; color: #16081e; font-size: 13px;">${formatCurrency(pm.totalSpent)}</td>
                    </tr>
                `;
            });
        }

        modal.innerHTML = `
            <div style="background: #ffffff; border-radius: 16px; width: max-content; max-width: 960px; max-height: 85vh; overflow: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.3); border: 2px solid #9333ea; font-family: 'Poppins', sans-serif;">
                <div style="padding: 24px 28px; border-bottom: 1px solid #f0ecf4; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #f8f5fb 0%, #ffffff 100%); border-top-left-radius: 14px; border-top-right-radius: 14px; sticky: top;">
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

                <div style="padding: 28px 32px;">
                    <!-- Seccion Productos Mas Comprados -->
                    <div style="margin-bottom: 28px;">
                        <h3 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #9333ea; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.trophy} Productos Más Comprados
                        </h3>
                        <div style="border: 1px solid #e2d8ee; border-radius: 10px; overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background: #f8f5fb; border-bottom: 1px solid #e2d8ee; font-size: 11px; color: #70647a; text-transform: uppercase;">
                                        <th style="padding: 10px 14px; width: 40px;">Pos</th>
                                        <th style="padding: 10px 14px;">Producto</th>
                                        <th style="padding: 10px 14px; text-align: center;">Unidades</th>
                                        <th style="padding: 10px 14px; text-align: center;">Precio Unitario / Histórico</th>
                                        <th style="padding: 10px 14px; text-align: right;">Total Invertido</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${top10RowsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Seccion Descuentos y Cupones -->
                    <div style="margin-bottom: 28px;">
                        <h3 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #b45309; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.piggy} Descuentos & Cupones Aplicados
                        </h3>
                        <div style="border: 1px solid #fef3c7; border-radius: 10px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background: #fff8e1; border-bottom: 1px solid #fef3c7; font-size: 11px; color: #b45309; text-transform: uppercase;">
                                        <th style="padding: 10px 14px;">Código de Cupón</th>
                                        <th style="padding: 10px 14px; text-align: center;">Uso</th>
                                        <th style="padding: 10px 14px; text-align: right;">Total Ahorrado</th>
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
                        <h3 style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #1d4ed8; display: flex; align-items: center; gap: 6px;">
                            ${SVG_ICONS.card} Medios de Pago Utilizados
                        </h3>
                        <div style="border: 1px solid #dbeafe; border-radius: 10px; overflow: hidden;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background: #eff6ff; border-bottom: 1px solid #dbeafe; font-size: 11px; color: #1d4ed8; text-transform: uppercase;">
                                        <th style="padding: 10px 14px;">Medio de Pago</th>
                                        <th style="padding: 10px 14px; text-align: center;">Pedidos</th>
                                        <th style="padding: 10px 14px; text-align: right;">Monto Total</th>
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

        modal.querySelectorAll('.shopify-toggle-history-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = btn.getAttribute('data-target');
                const targetRow = modal.querySelector('#' + targetId);
                if (targetRow) {
                    const isHidden = targetRow.style.display === 'none';
                    targetRow.style.display = isHidden ? 'table-row' : 'none';
                    btn.style.background = isHidden ? '#9333ea' : '#f8f5fb';
                    btn.style.color = isHidden ? '#ffffff' : '#9333ea';
                }
            });
        });

        const closeBtn = document.getElementById('shopify-modal-close');
        if (closeBtn) closeBtn.onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    let currentRoutePath = window.location.pathname;
    let detailPageMatch = currentRoutePath.match(/account\/orders\/([0-9]+)$/);
    let isOrderDetailPage = !!detailPageMatch;
    let detailOrderId = detailPageMatch ? detailPageMatch[1] : null;

    function handleRouteChange() {
        const newPath = window.location.pathname;
        if (newPath === currentRoutePath) return;
        currentRoutePath = newPath;
        detailPageMatch = newPath.match(/account\/orders\/([0-9]+)$/);
        isOrderDetailPage = !!detailPageMatch;
        detailOrderId = detailPageMatch ? detailPageMatch[1] : null;
        detailPageForcedRefresh = false;
        if (isOrderDetailPage) {
            document.getElementById('shopify-top-analytics-panel')?.remove();
            document.getElementById('shopify-nav-floating-container')?.remove();
            setTimeout(() => {
                const cached = getStoredOrders();
                if (Object.keys(cached).length > 0) injectOrderDetailSummary();
                else syncMissingOrderDetails();
            }, 900);
        } else {
            renderNavFloatingButtons();
            updateDashboard(true);
        }
    }
    setInterval(handleRouteChange, 1000);

    function renderPanel(count, totalSpentFormatted, totalGrossFormatted, totalSavingsFormatted, avgFormatted, statusText, statusBgColor = null, isLoading = false) {
        if (isOrderDetailPage) {
            const existingPanel = document.getElementById('shopify-top-analytics-panel');
            if (existingPanel) existingPanel.remove();
            return;
        }
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
                <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                    <div style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center; justify-content: center; width: 100%;">
                        <div style="min-width: 90px; background: #f3e8ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 6px 10px;">
                            <span style="font-size: 11px; color: #7c3aed; display: flex; align-items: center; gap: 4px; font-weight: 700; text-transform: uppercase;">
                                ${SVG_ICONS.boxes} Órdenes
                            </span>
                            <span id="shopify-stat-count" style="font-size: 17px; font-weight: 700; color: #6b21a8;">${count}</span>
                        </div>
                        <div style="min-width: 140px; background: linear-gradient(135deg, #7c3aed 0%, #6b21a8 100%); border: 1px solid #6d28d9; border-radius: 10px; padding: 6px 10px; box-shadow: 0 2px 8px rgba(147, 51, 234, 0.25);">
                            <span style="font-size: 11px; color: #ede9fe; display: flex; align-items: center; gap: 4px; font-weight: 700; text-transform: uppercase;">
                                ${SVG_ICONS.wallet} Total Gastado
                            </span>
                            <span id="shopify-stat-total" style="font-size: 19px; font-weight: 800; color: #ffffff;">${totalSpentFormatted}</span>
                        </div>
                        <div style="min-width: 120px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 10px; padding: 6px 10px;">
                            <span style="font-size: 11px; color: #555555; display: flex; align-items: center; gap: 4px; font-weight: 700; text-transform: uppercase;">
                                ${SVG_ICONS.receipt} Sin Descuento
                            </span>
                            <span id="shopify-stat-gross" style="font-size: 17px; font-weight: 700; color: #555555;">${totalGrossFormatted}</span>
                        </div>
                        <div style="min-width: 120px; background: #e9f7ef; border: 1px solid #c8ecd8; border-radius: 10px; padding: 6px 10px;">
                            <span style="font-size: 11px; color: #2e7d32; display: flex; align-items: center; gap: 4px; font-weight: 700; text-transform: uppercase;">
                                ${SVG_ICONS.piggy} Total Ahorrado
                            </span>
                            <span id="shopify-stat-savings" style="font-size: 17px; font-weight: 700; color: #2e7d32;">${totalSavingsFormatted}</span>
                        </div>
                        <div style="min-width: 110px; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 10px; padding: 6px 10px;">
                            <span style="font-size: 11px; color: #1d4ed8; display: flex; align-items: center; gap: 4px; font-weight: 700; text-transform: uppercase;">
                                ${SVG_ICONS.chart} Promedio
                            </span>
                            <span id="shopify-stat-avg" style="font-size: 17px; font-weight: 700; color: #1d4ed8;">${avgFormatted}</span>
                        </div>
                        <div style="min-width: 150px; background: #fff8e1; border: 1px solid #fef3c7; border-radius: 10px; padding: 6px 10px;">
                            <span style="font-size: 11px; color: #b45309; display: flex; align-items: center; gap: 4px; font-weight: 700; text-transform: uppercase;">
                                ${SVG_ICONS.trophy} Más Comprado
                            </span>
                            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                                ${topProduct?.imageUrl ? `<img src="${topProduct.imageUrl}" style="width: 22px; height: 22px; border-radius: 4px; object-fit: cover;" />` : ''}
                                <div>
                                    <span id="shopify-stat-topprod-title" style="font-size: 13px; font-weight: 700; color: #b45309; display: block; line-height: 1.1;" title="${topProduct?.title || ''}">${topProductTitle}</span>
                                    <span id="shopify-stat-topprod-sub" style="font-size: 10px; color: #b45309; opacity: 0.75; font-weight: 500;">${topProductSub}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; width: 100%;">
                        <span id="shopify-stat-badge" style="font-size: 11px; background: ${badgeColor}; color: #fff; padding: 5px 10px; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            ${statusText}
                        </span>
                        ${(getPaginationButton() || hasMorePagesDetected) && !isAutoLoadingAll ? `
                            <button id="shopify-btn-load-all" style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${themeColor}; background: #ffffff; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                ${SVG_ICONS.cloudDown} Cargar todos
                            </button>
                        ` : ''}
                        ${userStoppedSync ? `
                            <button id="shopify-btn-resume-sync" style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${themeColor}; background: ${themeColor}; color: #ffffff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(147, 51, 234, 0.25);">
                                ${SVG_ICONS.refresh} Reanudar
                            </button>
                        ` : ''}
                        ${!isSyncingDetails && !isAutoLoadingAll && !userStoppedSync ? `
                            <button id="shopify-btn-force-refresh" style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${themeColor}; background: ${themeColor}; color: #ffffff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(147, 51, 234, 0.25);">
                                ${SVG_ICONS.refresh} Actualizar
                            </button>
                        ` : ''}
                        ${(isSyncingDetails || isAutoLoadingAll) && !userStoppedSync ? `
                            <button id="shopify-btn-stop-sync" style="padding: 5px 10px; border-radius: 6px; border: 1px solid #d32f2f; background: #fff0f0; color: #d32f2f; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                ${SVG_ICONS.trash} Detener
                            </button>
                        ` : ''}
                        <button id="shopify-btn-open-modal" style="padding: 5px 10px; border-radius: 6px; border: 1px solid #9333ea; background: #ffffff; color: #9333ea; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            ${SVG_ICONS.trophy} Ver Reporte Completo
                        </button>
                        <button id="shopify-btn-clear-storage" style="padding: 5px 10px; border-radius: 6px; border: 1px solid #d32f2f; background: #ffffff; color: #d32f2f; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            ${SVG_ICONS.trash} Borrar memoria
                        </button>
                    </div>
                </div>

                <!-- Controles de Filtros de Fecha, Descuento y Navegación Rápida -->
                <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: center; border-top: 1px solid #f0ecf4; padding-top: 12px;">
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

            const btnResumeSync = document.getElementById('shopify-btn-resume-sync');
            if (btnResumeSync) {
                btnResumeSync.onclick = () => {
                    userStoppedSync = false;
                    isSyncCancelled = false;
                    updateDashboard(true);
                    syncMissingOrderDetails(null, true);
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
                    pendingSyncOrderName = '';
                    lastDashboardStateHash = '';
                    clearSyncProgress();
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
                        if (currentOrders[k]) {
                            currentOrders[k].detailFetched = false;
                            currentOrders[k].verifiedNoDiscount = false;
                            currentOrders[k].syncAttempts = 0;
                        }
                    }
                    saveStoredOrders(currentOrders);
                    updateDashboard(true);

                    await loadAllOrders();
                    updateDashboard(true);
                };
            }

            const btnClearStorage = document.getElementById('shopify-btn-clear-storage');
            if (btnClearStorage) {
                btnClearStorage.onclick = () => askClearStorage();
            }
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
                const discountType = typeof item === 'object' && item !== null ? (item.discountType || null) : null;
                const paymentMethod = typeof item === 'object' && item !== null ? (cleanPaymentMethodLabel(item.paymentMethod) || null) : null;
                const note = typeof item === 'object' && item !== null ? item.note : null;
                const items = typeof item === 'object' && item !== null ? item.items : null;
                const gid = typeof item === 'object' && item !== null ? item.gid : null;
                const detailFetched = typeof item === 'object' && item !== null ? (item.detailFetched || false) : false;
                const verifiedNoDiscount = typeof item === 'object' && item !== null ? (item.verifiedNoDiscount || false) : false;
                const syncAttempts = typeof item === 'object' && item !== null ? (item.syncAttempts || 0) : 0;

                if (!isNaN(price)) {
                    if (!cleaned[cleanKey]) {
                        cleaned[cleanKey] = { price, priceBeforeDiscounts, discountAmount, date, discountCode, discountType, paymentMethod, note, items, gid, detailFetched, verifiedNoDiscount, syncAttempts };
                    } else {
                        if (!cleaned[cleanKey].date && date) cleaned[cleanKey].date = date;
                        if (!cleaned[cleanKey].discountCode && discountCode) cleaned[cleanKey].discountCode = discountCode;
                        if (!cleaned[cleanKey].discountType && discountType) cleaned[cleanKey].discountType = discountType;
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

    function formatDiscountApp(app) {
        if (!app || typeof app !== 'object') return null;
        const code = app.code;
        const title = app.title || app.description || app.name;
        const typeName = app.__typename || app.discountApplicationType || app.targetType || '';

        if (code && typeof code === 'string') {
            const cleanCode = code.trim();
            if (!cleanCode.includes('(')) return `${cleanCode} (Código de cupón)`;
            return cleanCode;
        }
        if (title && typeof title === 'string') {
            const cleanTitle = title.trim();
            if (cleanTitle.includes('(')) return cleanTitle;
            if (typeName.includes('Automatic') || cleanTitle.toLowerCase().includes('auto')) {
                return `${cleanTitle} (Automático)`;
            }
            if (typeName.includes('Manual') || cleanTitle.toLowerCase().includes('manual')) {
                return `${cleanTitle} (Manual)`;
            }
            return `${cleanTitle} (Descuento)`;
        }
        return null;
    }

    function findDeepDiscountCode(obj) {
        if (!obj || typeof obj !== 'object') return null;

        if (obj.discountApplication) {
            const res = formatDiscountApp(obj.discountApplication);
            if (res) return res;
        }

        const apps = obj.discountApplications?.nodes || obj.discountApplications || obj.allOrderLevelAppliedDiscounts || obj.discountInformation;
        if (Array.isArray(apps) && apps.length > 0) {
            for (const app of apps) {
                const res = formatDiscountApp(app);
                if (res) return res;
            }
        }

        if (obj.discountCode) {
            return typeof obj.discountCode === 'string' ? (obj.discountCode.includes('(') ? obj.discountCode : `${obj.discountCode} (Código de cupón)`) : formatDiscountApp(obj.discountCode);
        }

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

    function findDeepDiscountType(obj) {
        if (!obj || typeof obj !== 'object') return null;
        const typeName = obj.__typename || obj.discountApplicationType || obj.targetType || '';
        if (typeName) {
            const t = String(typeName).toLowerCase();
            if (t.includes('manual')) return 'manual';
            if (t.includes('automatic')) return 'automatic';
            if (t.includes('code')) return 'code';
        }
        if (obj.discountApplication) {
            const res = findDeepDiscountType(obj.discountApplication);
            if (res) return res;
        }
        const apps = obj.discountApplications?.nodes || obj.discountApplications || obj.allOrderLevelAppliedDiscounts || obj.discountInformation;
        if (Array.isArray(apps)) {
            for (const app of apps) {
                const res = findDeepDiscountType(app);
                if (res) return res;
            }
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const res = findDeepDiscountType(item);
                if (res) return res;
            }
        } else {
            for (const k in obj) {
                if (typeof obj[k] === 'object') {
                    const res = findDeepDiscountType(obj[k]);
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
                const priceBefore = item.totalPriceBeforeDiscounts?.amount || item.priceBeforeDiscounts?.amount || item.originalPrice?.amount || price;
                const imgUrl = item.image?.url || null;
                const prodUrl = item.onlineStoreUrl || item.url || item.product?.onlineStoreUrl || (item.product?.handle ? `/products/${item.product.handle}` : null) || (item.variant?.product?.handle ? `/products/${item.variant.product.handle}` : null) || null;

                let vTitle = item.variantTitle || item.variant_title || item.variant?.title;
                if (!vTitle && Array.isArray(item.variantOptions) && item.variantOptions.length > 0) {
                    vTitle = item.variantOptions.map(o => typeof o === 'object' ? (o.value || o.name) : o).filter(Boolean).join(' / ');
                }
                if (!vTitle && Array.isArray(item.variant_options) && item.variant_options.length > 0) {
                    vTitle = item.variant_options.map(o => typeof o === 'object' ? (o.value || o.name) : o).filter(Boolean).join(' / ');
                }
                const cleanVariant = (vTitle && typeof vTitle === 'string' && vTitle.toLowerCase() !== 'default title') ? vTitle.trim() : null;

                if (title && typeof title === 'string') {
                    const priceNum = !isNaN(parseFloat(price)) ? parseFloat(price) : 0;
                    const priceBeforeNum = !isNaN(parseFloat(priceBefore)) ? parseFloat(priceBefore) : priceNum;
                    const itemDiscount = Math.max(0, priceBeforeNum - priceNum);
                    items.push({
                        title: title.trim(),
                        variantTitle: cleanVariant,
                        quantity: !isNaN(quantity) ? quantity : 1,
                        price: priceNum,
                        priceBefore: priceBeforeNum,
                        discountAmount: itemDiscount,
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

    function formatDateShort(dateStr) {
        if (!dateStr) return '';
        const d = parseSpanishDate(dateStr);
        if (!d || isNaN(d.getTime())) return dateStr;
        const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        return `${d.getDate()}/${months[d.getMonth()]}/${d.getFullYear()}`;
    }

    function buildProductHistoryTooltip(p) {
        if (!p || !Array.isArray(p.history) || p.history.length === 0) return '';

        const lines = [];
        lines.push(`📅 Periodo Activo: ${p.dateRangeStr || 'Sin fecha'}`);
        lines.push(`📦 Total Comprado: ${p.quantity} und. en ${p.history.length} pedido(s)`);
        lines.push(`--- Histórico de Compras ---`);

        p.history.forEach((h, idx) => {
            const dateFormatted = formatDateShort(h.date) || 'Sin fecha';
            const paidStr = formatCurrency(h.unitPricePaid);
            let line = `#${idx + 1} [${dateFormatted}] Pedido ${h.orderName}: Pagado ${paidStr}/und.`;
            if (h.unitPriceGross && h.unitPriceGross > (h.unitPricePaid + 1)) {
                const grossStr = formatCurrency(h.unitPriceGross);
                const savedStr = formatCurrency(h.unitPriceGross - h.unitPricePaid);
                line += ` (Lista sin desc: ${grossStr} | Ahorro: ${savedStr})`;
            } else {
                line += ` (Sin desc. adicional)`;
            }
            if (h.discountCode) {
                line += ` [${h.discountCode}]`;
            }
            lines.push(line);
        });

        return lines.join('\n');
    }

    function getOrderUrl(gid) {
        if (!gid) return null;
        const numericId = String(gid).replace('gid://shopify/Order/', '').trim();
        if (!numericId) return null;
        const basePath = window.location.pathname.split('/account')[0];
        return `${window.location.origin}${basePath}/account/orders/${numericId}`;
    }

    function getTopProducts(ordersMap) {
        const map = {};
        for (const key in ordersMap) {
            const order = ordersMap[key];
            if (Array.isArray(order.items)) {
                // Descuento a nivel de TODA la orden: si los ítems no traen descuento individual,
                // prorratear el descuento de la orden proporcionalmente sobre cada ítem.
                const orderDiscountTotal = order.discountAmount || 0;
                const orderItemsArr = order.items;
                const orderListTotal = orderItemsArr.reduce((s, x) => s + (x.priceBefore || x.price || 0), 0);

                order.items.forEach(it => {
                    // Agrupar por ID de producto (handle de la URL) para que el mismo producto
                    // con distintas variaciones NO se cuente por separado.
                    const itemTitle = it.title ? String(it.title).trim() : '';
                    let groupKey = slugifyTitle(itemTitle) || itemTitle.toLowerCase();
                    if (it.url) {
                        const handleMatch = String(it.url).match(/\/products\/([^/?#]+)/);
                        if (handleMatch && handleMatch[1]) groupKey = handleMatch[1].toLowerCase();
                    }
                    if (!map[groupKey]) {
                        map[groupKey] = {
                            title: itemTitle,
                            quantity: 0,
                            totalSpent: 0,
                            imageUrl: it.imageUrl,
                            url: it.url,
                            prices: [],
                            dates: [],
                            history: [],
                            variants: {}
                        };
                    }
                    const qty = it.quantity > 0 ? it.quantity : 1;
                    const unitPrice = qty > 0 ? (it.price / qty) : it.price;
                    const unitPriceGross = qty > 0 ? (it.priceBefore ? it.priceBefore / qty : unitPrice) : unitPrice;
                    const variantName = it.variantTitle || 'Estándar';

                    let unitPaid = unitPrice;
                    let unitList = unitPriceGross;
                    const hasItemDiscount = it.priceBefore && it.priceBefore > it.price;
                    if (hasItemDiscount) {
                        unitPaid = unitPrice;
                    } else if (orderDiscountTotal > 0 && orderListTotal > 0) {
                        // Descuento sobre toda la orden: aplicar la parte proporcional a este ítem
                        const grossItemTotal = it.priceBefore || it.price || 0;
                        const itemShare = orderDiscountTotal * (grossItemTotal / orderListTotal);
                        const discountedItemTotal = Math.max(0, grossItemTotal - itemShare);
                        unitPaid = qty > 0 ? discountedItemTotal / qty : discountedItemTotal;
                        unitList = qty > 0 ? grossItemTotal / qty : grossItemTotal;
                    }
                    const unitDiscount = unitList > unitPaid ? (unitList - unitPaid) : 0;

                    map[groupKey].quantity += qty;
                    map[groupKey].totalSpent += it.price;
                    if (it.imageUrl && !map[groupKey].imageUrl) {
                        map[groupKey].imageUrl = it.imageUrl;
                    }
                    if (it.url && !map[groupKey].url) {
                        map[groupKey].url = it.url;
                    }

                    if (!map[groupKey].variants[variantName]) {
                        map[groupKey].variants[variantName] = {
                            name: variantName,
                            quantity: 0,
                            totalSpent: 0,
                            prices: [],
                            ordersCount: 0
                        };
                    }
                    map[groupKey].variants[variantName].quantity += qty;
                    map[groupKey].variants[variantName].totalSpent += it.price;
                    map[groupKey].variants[variantName].ordersCount += 1;
                    if (unitPaid > 0) {
                        map[groupKey].variants[variantName].prices.push(unitPaid);
                        map[groupKey].prices.push(unitPaid);
                    }

                    if (order.date) {
                        map[groupKey].dates.push(order.date);
                    }

                    map[groupKey].history.push({
                        orderName: key,
                        orderGid: order.gid || null,
                        date: order.date || null,
                        unitPricePaid: unitPaid,
                        unitPriceGross: unitList,
                        discountAmount: unitDiscount,
                        discountCode: order.discountCode || null,
                        variantName: variantName
                    });
                });
            }
        }

        const result = Object.values(map).map(p => {
            const uniquePrices = Array.from(new Set(p.prices.map(px => parseFloat(px.toFixed(2))))).sort((a, b) => a - b);
            const minPrice = uniquePrices.length > 0 ? uniquePrices[0] : 0;
            const maxPrice = uniquePrices.length > 0 ? uniquePrices[uniquePrices.length - 1] : 0;
            const hasPriceVariation = uniquePrices.length > 1;

            const parsedDates = p.dates.map(d => parseSpanishDate(d)).filter(Boolean).sort((a, b) => a - b);
            const firstDateStr = parsedDates.length > 0 ? formatDateShort(parsedDates[0].toISOString()) : null;
            const lastDateStr = parsedDates.length > 0 ? formatDateShort(parsedDates[parsedDates.length - 1].toISOString()) : null;
            let dateRangeStr = '';
            if (firstDateStr && lastDateStr) {
                dateRangeStr = firstDateStr === lastDateStr ? firstDateStr : `${firstDateStr} ➔ ${lastDateStr}`;
            }

            p.history.sort((a, b) => {
                const da = parseSpanishDate(a.date);
                const db = parseSpanishDate(b.date);
                return (da && db) ? da - db : 0;
            });

            // Agrupar histórico por (variante + precio) para NO repetir info:
            // solo un cambio real de precio o de variante genera una nueva entrada.
            const groupedHistory = [];
            const historyGroups = {};
            p.history.forEach(h => {
                const paidKey = parseFloat(h.unitPricePaid.toFixed(2));
                const grossKey = parseFloat(h.unitPriceGross.toFixed(2));
                const groupKey = `${h.variantName}__${paidKey}__${grossKey}`;
                if (!historyGroups[groupKey]) {
                    historyGroups[groupKey] = {
                        variantName: h.variantName,
                        unitPricePaid: h.unitPricePaid,
                        unitPriceGross: h.unitPriceGross,
                        discountAmount: h.discountAmount,
                        discountCode: h.discountCode,
                        orders: [],
                        dates: []
                    };
                    groupedHistory.push(historyGroups[groupKey]);
                }
                historyGroups[groupKey].orders.push({ orderName: h.orderName, orderGid: h.orderGid });
                historyGroups[groupKey].dates.push(h.date);
            });
            groupedHistory.sort((a, b) => {
                const da = parseSpanishDate(a.dates[0]);
                const db = parseSpanishDate(b.dates[0]);
                return (da && db) ? da - db : 0;
            });

            const variantList = Object.values(p.variants).map(v => {
                const uPrices = Array.from(new Set(v.prices.map(px => parseFloat(px.toFixed(2))))).sort((a, b) => a - b);
                const minVPrice = uPrices.length > 0 ? uPrices[0] : 0;
                const maxVPrice = uPrices.length > 0 ? uPrices[uPrices.length - 1] : 0;
                const hasVIncrease = maxVPrice > minVPrice;
                const increasePercent = hasVIncrease && minVPrice > 0 ? (((maxVPrice - minVPrice) / minVPrice) * 100).toFixed(1) : '0';

                return {
                    ...v,
                    uniquePrices: uPrices,
                    minPrice: minVPrice,
                    maxPrice: maxVPrice,
                    hasIncrease: hasVIncrease,
                    increasePercent: increasePercent
                };
            }).sort((a, b) => b.quantity - a.quantity);

            return {
                ...p,
                minPrice,
                maxPrice,
                hasPriceVariation,
                uniquePrices,
                dateRangeStr,
                variantList,
                groupedHistory
            };
        });

        return result.sort((a, b) => {
            if (b.quantity !== a.quantity) return b.quantity - a.quantity;
            return b.totalSpent - a.totalSpent;
        });
    }

    function cleanPaymentMethodLabel(value) {
        if (!value) return null;
        const v = String(value).trim();
        if (!v) return null;
        const lower = v.toLowerCase();
        if (lower === 'tarjeta credito/debito' || lower === 'tarjeta crédito/débito' || lower === 'tarjeta de crédito/débito') return 'Tarjeta crédito/débito';
        if (lower === 'card' || lower === 'tarjeta' || lower === 'cardpayment' || lower === 'card payment') return null;
        if (['sale', 'authorization', 'capture', 'void', 'refund', 'pending', 'success', 'error'].includes(lower)) return null;
        return v;
    }

    function extractPaymentMethodFromObj(obj) {
        if (!obj || typeof obj !== 'object') return null;

        const txSources = [
            obj.transactions,
            obj.paymentMethods,
            obj.paymentCollections?.nodes?.[0]?.transactions,
            obj.paymentCollections?.nodes?.[0]?.paymentMethods,
            obj.paymentCollections?.nodes?.map(n => n.paymentMethods).flat(),
            obj.data?.order?.transactions,
            obj.data?.order?.paymentMethods,
            obj.data?.order?.paymentCollections?.nodes?.[0]?.transactions,
            obj.data?.order?.paymentCollections?.nodes?.[0]?.paymentMethods
        ].filter(Array.isArray);
        const transactions = txSources.flat();
        if (transactions.length > 0) {
            let bestName = null;
            let bestCardInfo = '';

            for (const tx of transactions) {
                if (!tx || typeof tx !== 'object') continue;

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

                const gatewayName = tx.gateway ? cleanPaymentMethodLabel(tx.gateway) : null;
                const iconName = tx.paymentIcon?.altText ? cleanPaymentMethodLabel(tx.paymentIcon.altText) : null;
                const methodName = tx.paymentDetails?.paymentMethodName ? cleanPaymentMethodLabel(tx.paymentDetails.paymentMethodName) : null;
                const typeName = tx.typeDetails?.name ? cleanPaymentMethodLabel(tx.typeDetails.name) : null;
                const directName = tx.name ? cleanPaymentMethodLabel(tx.name) : null;
                const localBrand = tx.paymentDetails?.brand ? cleanPaymentMethodLabel(tx.paymentDetails.brand) : null;

                const isGeneric = (n) => n === 'Tarjeta crédito/débito' || n === 'Card' || n === 'CardPayment';

                if (gatewayName) {
                    bestName = gatewayName;
                    if (cardInfo) bestCardInfo = cardInfo;
                    break;
                }
                const candidate = localBrand || typeName || methodName || iconName || directName;
                if (candidate) {
                    if (!bestName) {
                        bestName = candidate;
                        if (cardInfo) bestCardInfo = cardInfo;
                    } else if (isGeneric(bestName) && !isGeneric(candidate)) {
                        bestName = candidate;
                        if (cardInfo) bestCardInfo = cardInfo;
                    }
                }
                if (cardInfo && !bestCardInfo) bestCardInfo = cardInfo;
            }

            if (bestName) return bestCardInfo ? `${bestName} (${bestCardInfo})` : bestName;
            if (bestCardInfo) return bestCardInfo;
        }

        if (obj.paymentMethodName && typeof obj.paymentMethodName === 'string') return cleanPaymentMethodLabel(obj.paymentMethodName);
        if (obj.paymentMethod) {
            if (typeof obj.paymentMethod === 'string') return cleanPaymentMethodLabel(obj.paymentMethod);
            if (typeof obj.paymentMethod === 'object' && obj.paymentMethod.name) return cleanPaymentMethodLabel(obj.paymentMethod.name);
        }
        if (obj.transactionGateway && typeof obj.transactionGateway === 'string') return cleanPaymentMethodLabel(obj.transactionGateway);
        if (obj.gateway && typeof obj.gateway === 'string') return cleanPaymentMethodLabel(obj.gateway);
        if (obj.data?.order?.transactionGateway && typeof obj.data.order.transactionGateway === 'string') return cleanPaymentMethodLabel(obj.data.order.transactionGateway);
        if (obj.data?.order?.paymentMethodName && typeof obj.data.order.paymentMethodName === 'string') return cleanPaymentMethodLabel(obj.data.order.paymentMethodName);

        return null;
    }

    function findDeepNote(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.note && typeof obj.note === 'string' && obj.note.trim()) return obj.note.trim();
        if (obj.customerNote && typeof obj.customerNote === 'string' && obj.customerNote.trim()) return obj.customerNote.trim();
        if (Array.isArray(obj.customAttributes) && obj.customAttributes.length > 0) {
            const attrStr = obj.customAttributes.map(a => `${a.key}: ${a.value}`).join(' | ');
            if (attrStr.trim()) return attrStr.trim();
        }
        if (Array.isArray(obj.custom_attributes) && obj.custom_attributes.length > 0) {
            const attrStr = obj.custom_attributes.map(a => `${a.key || a.name}: ${a.value}`).join(' | ');
            if (attrStr.trim()) return attrStr.trim();
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const res = findDeepNote(item);
                if (res) return res;
            }
        } else {
            for (const k in obj) {
                if (typeof obj[k] === 'object') {
                    const res = findDeepNote(obj[k]);
                    if (res) return res;
                }
            }
        }
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
            const discountType = findDeepDiscountType(obj) || (existing.discountType || null);

            const extractedItems = extractLineItemsFromObj(obj);
            const combinedItems = (extractedItems.length > 0) ? extractedItems : (existing.items || null);

            const extractedNote = findDeepNote(obj);
            const note = extractedNote || existing.note || null;
            const extractedPaymentMethod = extractPaymentMethodFromObj(obj);
            const paymentMethod = isDetailResponse
                ? (extractedPaymentMethod || (existing.paymentMethod && existing.paymentMethod !== 'CARD' ? existing.paymentMethod : null))
                : (existing.paymentMethod || null);

            uniqueOrders[targetKey] = {
                price: priceNum,
                priceBeforeDiscounts: priceBeforeNum || existing.priceBeforeDiscounts || (priceNum && discountAmount > 0 ? priceNum + discountAmount : null),
                discountAmount: discountAmount > 0 ? discountAmount : (existing.discountAmount || 0),
                date: date || existing.date || null,
                discountCode: discountCode || existing.discountCode || null,
                discountType: discountType || existing.discountType || null,
                gid: gid || existing.gid || null,
                detailFetched: isDetailResponse ? true : (existing.detailFetched || false),
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
    let pendingSyncOrderName = '';
    let detailPageForcedRefresh = false;

    function saveSyncProgress() {
        try {
            localStorage.setItem(SYNC_PROGRESS_KEY, JSON.stringify({
                total: pendingSyncTotal,
                current: pendingSyncCurrent,
                orderName: pendingSyncOrderName,
                timestamp: Date.now()
            }));
        } catch (e) { }
    }

    function clearSyncProgress() {
        try { localStorage.removeItem(SYNC_PROGRESS_KEY); } catch (e) { }
    }

    function hasInterruptedSync() {
        try {
            const raw = localStorage.getItem(SYNC_PROGRESS_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            const age = Date.now() - (data.timestamp || 0);
            if (age > 10 * 60 * 1000) {
                clearSyncProgress();
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    const TRANSACTIONS_FRAGMENT = `
      transactions {
        id
        kind
        status
        type
        typeDetails { name }
        paymentIcon { altText }
        paymentDetails {
          ... on CardPaymentDetails { last4 cardBrand }
          ... on CustomGiftCardPaymentDetails { last4 }
          ... on LocalPaymentMethodsPaymentDetails { brand paymentDescriptor }
        }
      }`;

    const ORDER_DETAILS_QUERY = `query OrderDetails($orderId: ID!) {
  order(id: $orderId) {
    id
    name
    processedAt
    note
    customAttributes { key value }
    currentTotalPrice: totalPrice { amount currencyCode }
    totalPriceBeforeDiscounts { amount currencyCode }
    totalSavings { amount currencyCode }
    discountApplications(first: 10) {
      nodes {
        targetType
        ... on AutomaticDiscountApplication { title }
        ... on DiscountCodeApplication { code }
        ... on ManualDiscountApplication { title }
      }
    }
    ${TRANSACTIONS_FRAGMENT}
  }
}`;

    const LINE_ITEMS_QUERY = `query LineItems($orderId: ID!, $lineItemsFirst: Int! = 250) {
  order(id: $orderId) {
    id
    name
    note
    customAttributes { key value }
    ${TRANSACTIONS_FRAGMENT}
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
              variantTitle
              variantOptions { name value }
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

    async function syncMissingOrderDetails(forceKey = null, forceRun = false) {
        if (isSyncingDetails || userStoppedSync || isAutoLoadingAll) return;
        // BLOQUEO STRICTO: En la lista de órdenes, JAMÁS pedir detalles mientras falten páginas por cargar al DOM
        if (!isOrderDetailPage && (getPaginationButton() || hasMorePagesDetected)) return;
        const ordersMap = getStoredOrders();
        const orderKeys = Object.keys(ordersMap);

        const pendingList = [];
        const currentGid = isOrderDetailPage && detailOrderId ? `gid://shopify/Order/${detailOrderId}` : null;
        const isCurrentOrder = (k, o) => currentGid && (o.gid === currentGid || k === `#${detailOrderId}`);
        for (const key of orderKeys) {
            const order = ordersMap[key];
            if (isOrderDetailPage && !isCurrentOrder(key, order)) continue;
            const numericMatch = key.match(/\d+/);
            const gid = order.gid || (numericMatch ? `gid://shopify/Order/${numericMatch[0]}` : null);
            const isFullyVerified = (order.detailFetched || order.verifiedNoDiscount) && !!order.paymentMethod;
            const attempts = order.syncAttempts || 0;

            if (gid && (forceKey === key || (!isFullyVerified && attempts < 3))) {
                pendingList.push({ name: key, gid: gid, attempts: attempts });
            }
        }

        if (pendingList.length === 0) {
            pendingSyncTotal = 0;
            pendingSyncCurrent = 0;
            pendingSyncOrderName = '';
            return;
        }

        pendingList.sort((a, b) => {
            const da = parseSpanishDate(ordersMap[a.name]?.date);
            const db = parseSpanishDate(ordersMap[b.name]?.date);
            if (da && db && da.getTime() !== db.getTime()) return db.getTime() - da.getTime();
            if (da && !db) return -1;
            if (!da && db) return 1;

            const gida = parseInt(String(a.gid || '').replace(/\D/g, ''), 10) || 0;
            const gidb = parseInt(String(b.gid || '').replace(/\D/g, ''), 10) || 0;
            if (gida !== gidb) return gidb - gida;

            const na = parseInt(String(a.name).replace(/\D/g, ''), 10) || 0;
            const nb = parseInt(String(b.name).replace(/\D/g, ''), 10) || 0;
            return nb - na;
        });

        isSyncingDetails = true;
        isSyncCancelled = false;
        hasMorePagesDetected = false;
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
                pendingSyncOrderName = item.name;
                logAnalytics(`🔄 [${i + 1}/${pendingList.length}] Consultando detalles, productos y notas de:`, item.name);
                const numericId = item.gid.replace('gid://shopify/Order/', '');
                const remixUrl = `${window.location.origin}${basePath}/account/orders/${numericId}?_data=routes%2Faccount.orders.%24id`;

                let fetchedSuccess = false;
                let paymentFound = false;

                // Estrategia 1 (PRIMARIA): GraphQL OrderDetails POST — query completa (nota, transacciones, descuentos, ítems, variantes)
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
                                if (currentOrders[item.name]) {
                                    currentOrders[item.name].detailFetched = true;
                                    if (currentOrders[item.name].paymentMethod) paymentFound = true;
                                }
                                saveStoredOrders(currentOrders);
                                fetchedSuccess = true;
                                logAnalytics('✅ [GraphQL OrderDetails] Sincronización exitosa para:', item.name);
                            }
                        }
                    }
                } catch (e1) { }

                // Estrategia 2 (SECUNDARIA): Remix Data Loader GET Route — se corre también si el pago no se encontró en la Estrategia 1
                if (!fetchedSuccess || !paymentFound) {
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
                    } catch (e2) { }
                }

                // Estrategia 3 (RESPALDO): GraphQL LineItems POST con token Authorization — también si falta el pago
                if ((!fetchedSuccess || !paymentFound) && authHeader) {
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
                        if (finalOrders[item.name].paymentMethod) {
                            finalOrders[item.name].syncAttempts = 0;
                        } else {
                            const currentAttempts = (finalOrders[item.name].syncAttempts || 0) + 1;
                            finalOrders[item.name].syncAttempts = currentAttempts;
                            if (currentAttempts >= 3) {
                                logAnalytics(`⚠️ Sin método de pago tras ${currentAttempts} intentos para: ${item.name}`);
                            }
                        }
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

                saveSyncProgress();
                updateDashboard();
                if (isSyncCancelled || userStoppedSync) break;
                await new Promise(r => setTimeout(r, 450));
                if (isSyncCancelled || userStoppedSync) break;
            }
        } finally {
            isSyncingDetails = false;
            pendingSyncTotal = 0;
            pendingSyncCurrent = 0;
            pendingSyncOrderName = '';
            clearSyncProgress();
            if (userStoppedSync) {
                lastDashboardStateHash = '';
            }
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
                        const looksDetail = (() => {
                            const o = res?.data?.order;
                            if (!o) return false;
                            return Array.isArray(o.transactions) && o.transactions.some(t => t && (t.typeDetails?.name || t.paymentDetails || t.paymentIcon?.altText));
                        })();
                        if (extractOrdersFromObj(res, uniqueOrders, looksDetail)) {
                            saveStoredOrders(uniqueOrders);
                            updateDashboard();
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

                // Contenedor interno para notas y medio de pago colocado justo debajo del texto de resumen de la orden (subSpan)
                const targetCardBox = subSpan ? subSpan.parentElement : (article.querySelector('h2')?.parentElement || article.firstElementChild || article);

                let extraBadgesContainer = article.querySelector('.shopify-order-extra-badges');
                if ((orderInfo.note || orderInfo.paymentMethod) && !extraBadgesContainer) {
                    extraBadgesContainer = document.createElement('div');
                    extraBadgesContainer.className = 'shopify-order-extra-badges';
                    extraBadgesContainer.style.cssText = `
                        margin-top: 6px;
                        margin-bottom: 4px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        align-items: center;
                        width: 100%;
                    `;
                    targetCardBox.appendChild(extraBadgesContainer);
                }

                // Inyección o limpieza de la etiqueta de nota de pedido
                if (extraBadgesContainer) {
                    let existingNoteBadge = extraBadgesContainer.querySelector('.shopify-order-note-badge');
                    if (orderInfo.note) {
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
                    } else if (existingNoteBadge) {
                        existingNoteBadge.remove();
                    }

                    // Inyección o limpieza de la etiqueta de medio de pago
                    let existingPaymentBadge = extraBadgesContainer.querySelector('.shopify-order-payment-badge');
                    if (orderInfo.paymentMethod) {
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
                    } else if (existingPaymentBadge) {
                        existingPaymentBadge.remove();
                    }

                    if (extraBadgesContainer.children.length === 0) {
                        extraBadgesContainer.remove();
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

    function forceSyncCurrentOrder(orderName) {
        const trySync = () => {
            if (isSyncingDetails || isAutoLoadingAll || userStoppedSync) {
                setTimeout(trySync, 800);
                return;
            }
            syncMissingOrderDetails(orderName);
        };
        trySync();
    }

    function injectOrderDetailSummary() {
        if (!isOrderDetailPage) return;
        const ordersMap = getStoredOrders();
        const gid = `gid://shopify/Order/${detailOrderId}`;
        let order = null;
        let orderName = `#${detailOrderId}`;

        for (const k in ordersMap) {
            const o = ordersMap[k];
            if (o && (o.gid === gid || k === `#${detailOrderId}`)) {
                order = o;
                orderName = k;
                break;
            }
        }

        if (!order) {
            ordersMap[`#${detailOrderId}`] = { price: 0, date: null, gid: gid, detailFetched: false, verifiedNoDiscount: false, syncAttempts: 0 };
            saveStoredOrders(ordersMap);
            order = ordersMap[`#${detailOrderId}`];
            forceSyncCurrentOrder(orderName);
        } else if (!detailPageForcedRefresh) {
            detailPageForcedRefresh = true;
            const isFullyVerified = (order.detailFetched || order.verifiedNoDiscount) && !!order.paymentMethod;
            if (!isFullyVerified) {
                forceSyncCurrentOrder(orderName);
            }
        }

        document.getElementById('shopify-order-detail-summary')?.remove();

        const nativeDateEl = findNativeDateElement();
        if (nativeDateEl && order.date) {
            nativeDateEl.textContent = `Fecha de confirmación: ${formatOrderDate(order.date)}`;
        }

        const targetCard = findPaymentTargetCard();
        if (targetCard) {
            let infoRow = targetCard.querySelector('#shopify-detail-info');
            if (!infoRow) {
                infoRow = document.createElement('div');
                infoRow.id = 'shopify-detail-info';
                infoRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 16px 4px;padding:8px 12px;background:#f8f5fb;border:1px solid #e9ddf5;border-radius:8px;font-family:Poppins,sans-serif;';
                targetCard.appendChild(infoRow);
            }
            const chips = [];
            if (order.paymentMethod) {
                chips.push(`<span style="font-size:11px;font-weight:700;color:#1d4ed8;background:#eff6ff;border:1px solid #dbeafe;padding:4px 10px;border-radius:8px;white-space:nowrap;">${SVG_ICONS.card} <strong>Pago:</strong> ${order.paymentMethod}</span>`);
            }
            infoRow.innerHTML = chips.join('');
            infoRow.style.display = chips.length ? 'flex' : 'none';
        }

        injectDetailNote(order);
    }

    function injectDetailNote(order) {
        let row = document.getElementById('shopify-detail-note-row');
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        if (!order.note) {
            if (row) row.remove();
            return;
        }
        let dl = document.querySelector('dl[aria-label="Detalles del pedido"]');
        if (!dl) {
            const heading = Array.from(document.querySelectorAll('h2, h3')).find(h => /Detalles del pedido/i.test(h.textContent || ''));
            if (heading) dl = heading.closest('section')?.querySelector('dl');
        }
        if (!dl) return;
        if (!row) {
            row = document.createElement('div');
            row.id = 'shopify-detail-note-row';
            row.className = '_1fragempz _1fragemrs _1fragemo6 _1fragemtl _1fragem5u _1fragemws yHNVE';
            dl.insertBefore(row, dl.firstChild);
        }
        row.innerHTML = `<dt class="CIq7V"><span class="_19gi7yt0 _19gi7yt18 _19gi7yt1h _19gi7yt1n _1fragem69">Nota</span></dt><dd class="V-ubC Xw6Ln"><p class="_1tx8jg70 _1fragemws _1tx8jg719 _1tx8jg71h _1tx8jg71j"><span class="oBbb8">${esc(order.note)}</span></p></dd>`;
    }

    function findNativeDateElement() {
        const candidates = document.querySelectorAll('span, p, div, small, h1, h2, h3, li, strong, td');
        for (const el of candidates) {
            if (el.children.length === 0) {
                const t = (el.textContent || '').trim();
                if (/Fecha de confirmación/i.test(t) && t.length < 80) return el;
            }
        }
        return null;
    }

    function findPaymentTargetCard() {
        let card = document.querySelector('._1fragempp._1fragemrs._1fragemo6._1fragemtl._1fragem5u._1fragemws');
        if (!card) {
            const h3s = Array.from(document.querySelectorAll('h3'));
            const heading = h3s.find(h => /Artículos del pedido/i.test(h.textContent || ''));
            if (heading) {
                card = heading.closest('div[class*="_1fragem"]');
            }
        }
        if (!card) {
            const dl = document.querySelector('dl[aria-label="Detalles del pedido"]');
            if (dl) {
                card = dl.closest('div[class*="_1fragem"]') || dl.parentElement;
            }
        }
        return card;
    }

    function askClearStorage() {
        const overlay = document.createElement('div');
        overlay.id = 'shopify-clear-dialog';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,7,26,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:14px;padding:20px 24px;max-width:360px;width:90%;border:2px solid #9333ea;font-family:Poppins,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.3);">
                <h3 style="margin:0 0 6px;font-size:15px;color:#16081e;">¿Qué quieres borrar?</h3>
                <p style="margin:0 0 12px;font-size:12px;color:#70647a;">Los pedidos se mantienen; solo se reinicia la parte de detalles/pago/nota.</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <button id="shopify-clear-details-btn" style="padding:10px 12px;border-radius:8px;border:1px solid #dbeafe;background:#eff6ff;color:#1d4ed8;font-weight:700;cursor:pointer;">Solo detalles (re-sincronizar)</button>
                    <button id="shopify-clear-all-btn" style="padding:10px 12px;border-radius:8px;border:1px solid #fee2e2;background:#fef2f2;color:#b91c1c;font-weight:700;cursor:pointer;">Borrar TODO y recargar página</button>
                    <button id="shopify-clear-cancel-btn" style="padding:10px 12px;border-radius:8px;border:1px solid #e2d8ee;background:#f8f5fb;color:#70647a;cursor:pointer;">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.querySelector('#shopify-clear-details-btn').onclick = () => {
            const currentOrders = getStoredOrders();
            for (const k in currentOrders) {
                if (currentOrders[k]) {
                    delete currentOrders[k].paymentMethod;
                    delete currentOrders[k].note;
                    delete currentOrders[k].items;
                    delete currentOrders[k].discountCode;
                    delete currentOrders[k].discountType;
                    delete currentOrders[k].priceBeforeDiscounts;
                    currentOrders[k].discountAmount = 0;
                    currentOrders[k].detailFetched = false;
                    currentOrders[k].verifiedNoDiscount = false;
                    currentOrders[k].syncAttempts = 0;
                }
            }
            saveStoredOrders(currentOrders);
            clearSyncProgress();
            overlay.remove();
            userStoppedSync = false;
            isSyncCancelled = false;
            updateDashboard(true);
            loadAllOrders();
            logAnalytics('🧹 Todos los detalles (cupones, productos, notas, pago) borrados. Re-sincronizando...');
        };

        overlay.querySelector('#shopify-clear-all-btn').onclick = () => {
            userStoppedSync = false;
            isSyncCancelled = true;
            isSyncingDetails = false;
            isAutoLoadingAll = false;
            pendingSyncTotal = 0;
            pendingSyncCurrent = 0;
            isFullySynced = false;
            lastDashboardStateHash = '';
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(SYNC_PROGRESS_KEY);
            sessionStorage.removeItem('shopify_auth_token');
            localStorage.removeItem('shopify_auth_token');
            capturedAuthToken = null;
            detailPageForcedRefresh = false;
            currentFilterMode = 'all';
            currentDiscountFilter = 'all';
            customStartDate = '';
            customEndDate = '';
            overlay.remove();
            location.reload();
        };

        overlay.querySelector('#shopify-clear-cancel-btn').onclick = () => overlay.remove();
    }

    let lastDashboardStateHash = '';

    function updateDashboard(forceRender = false) {
        scanDOMOrders();

        const ordersMap = getStoredOrders();
        const totalAllOrders = Object.keys(ordersMap).length;
        const filteredIds = filterOrders(ordersMap);

        const currentHash = `${filteredIds.length}_${totalAllOrders}_${currentFilterMode}_${currentDiscountFilter}_${isSyncingDetails}_${pendingSyncCurrent}_${userStoppedSync}_${isAutoLoadingAll}`;

        if (!forceRender && currentHash === lastDashboardStateHash && document.getElementById('shopify-top-analytics-panel')) {
            if (isOrderDetailPage) {
                injectOrderDetailSummary();
            } else {
                injectDatesIntoDOM();
            }
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

        const pendingDetailCount = Object.values(ordersMap).filter(o => !(o.detailFetched || o.verifiedNoDiscount) || !o.paymentMethod).length;

        let statusLabel = `${SVG_ICONS.check} Sincronizado`;
        let statusBgColor = '#2e7d32'; // verde

        if (userStoppedSync) {
            statusLabel = `${SVG_ICONS.stop} Detenido`;
            statusBgColor = '#ea580c'; // naranja / rojo
            isFullySynced = false;
        } else if (isAutoLoadingAll) {
            statusLabel = `${SVG_ICONS.spin} Sincronizando...`;
            statusBgColor = '#0288d1'; // azul
            isFullySynced = false;
        } else if (isSyncingDetails && totalAllOrders > 0) {
            const syncedCount = Object.values(ordersMap).filter(o => o.detailFetched || o.verifiedNoDiscount).length;
            const pct = Math.round((syncedCount / totalAllOrders) * 100);
            statusLabel = `${SVG_ICONS.spin} Detalles ${syncedCount}/${totalAllOrders} (${pct}%)${pendingSyncOrderName ? ' · ' + pendingSyncOrderName : ''}`;
            statusBgColor = '#0288d1'; // azul
            isFullySynced = false;
        } else if (currentFilterMode !== 'all' || currentDiscountFilter !== 'all') {
            statusLabel = `${SVG_ICONS.search} Filtrando (${filteredIds.length} de ${totalAllOrders})`;
            statusBgColor = '#7b1fa2'; // morado
            isFullySynced = isNewestInCache && !pagBtn && pendingDetailCount === 0;
        } else if (totalAllOrders === 0) {
            statusLabel = `${SVG_ICONS.spin} Sincronizando...`;
            statusBgColor = '#0288d1';
            isFullySynced = false;
        } else if (pagBtn || pendingDetailCount > 0) {
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
        if (isOrderDetailPage) {
            injectOrderDetailSummary();
        } else {
            injectDatesIntoDOM();
            applyDOMDateFilter(filteredIds);
        }
        if (!isOrderDetailPage && getPaginationButton() && !isAutoLoadingAll && !userStoppedSync) {
            loadAllOrders();
            return;
        }
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
            if (isOrderDetailPage) {
                injectOrderDetailSummary();
            } else {
                injectDatesIntoDOM();
            }
        }

        if (!isOrderDetailPage) {
            renderNavFloatingButtons();
            // Disparar carga automática inmediata y reintentar si el DOM de Shopify aún no ha montado el botón
            const startAutoLoad = () => {
                const pagBtn = getPaginationButton();
                if (pagBtn || hasMorePagesDetected) {
                    loadAllOrders();
                    return true;
                }
                return false;
            };

            if (!startAutoLoad()) {
                let attempts = 0;
                const autoLoadInterval = setInterval(() => {
                    attempts++;
                    if (startAutoLoad() || attempts > 15) {
                        clearInterval(autoLoadInterval);
                        if (attempts > 15 && hasInterruptedSync()) {
                            clearSyncProgress();
                            syncMissingOrderDetails(null, true);
                        }
                    }
                }, 400);
            }
        }
        setTimeout(updateDashboard, 500);
    });

    setInterval(() => {
        updateDashboard();
    }, 3000);

})();