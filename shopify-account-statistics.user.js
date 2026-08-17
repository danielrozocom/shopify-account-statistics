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
        search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`
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

    function renderPanel(count, totalSpentFormatted, totalGrossFormatted, totalSavingsFormatted, avgFormatted, statusText, statusBgColor = null, isLoading = false) {
        let panel = document.getElementById('shopify-top-analytics-panel');
        const themeColor = getShopifyBrandColor();
        const badgeColor = statusBgColor || themeColor;
        const ordersMap = getStoredOrders();
        const discountCodes = getCapturedDiscountCodes(ordersMap);

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
                    <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center; flex: 1;">
                        <div style="min-width: 90px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.boxes} Órdenes
                            </span>
                            <span id="shopify-stat-count" style="font-size: 17px; font-weight: 700; color: #16081e;">${count}</span>
                        </div>
                        <div style="min-width: 130px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.wallet} Total Gastado
                            </span>
                            <span id="shopify-stat-total" style="font-size: 17px; font-weight: 700; color: #16081e;">${totalSpentFormatted}</span>
                        </div>
                        <div style="min-width: 130px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.receipt} Sin Descuento
                            </span>
                            <span id="shopify-stat-gross" style="font-size: 17px; font-weight: 700; color: #555555;">${totalGrossFormatted}</span>
                        </div>
                        <div style="min-width: 130px;">
                            <span style="font-size: 11px; color: #2e7d32; display: flex; align-items: center; gap: 4px; font-weight: 600; text-transform: uppercase;">
                                ${SVG_ICONS.piggy} Total Ahorrado
                            </span>
                            <span id="shopify-stat-savings" style="font-size: 17px; font-weight: 700; color: #2e7d32;">${totalSavingsFormatted}</span>
                        </div>
                        <div style="min-width: 120px;">
                            <span style="font-size: 11px; color: #70647a; display: flex; align-items: center; gap: 4px; font-weight: 500; text-transform: uppercase;">
                                ${SVG_ICONS.chart} Promedio
                            </span>
                            <span id="shopify-stat-avg" style="font-size: 17px; font-weight: 700; color: #16081e;">${avgFormatted}</span>
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

            const btnLoadAll = document.getElementById('shopify-btn-load-all');
            if (btnLoadAll) btnLoadAll.onclick = () => loadAllOrders();

            const btnForceRefresh = document.getElementById('shopify-btn-force-refresh');
            if (btnForceRefresh) {
                btnForceRefresh.onclick = async () => {
                    isSyncingDetails = false; // Reset lock
                    let currentOrders = getStoredOrders();
                    for (const k in currentOrders) {
                        if (currentOrders[k]) currentOrders[k].detailFetched = false;
                    }
                    saveStoredOrders(currentOrders);
                    updateDashboard();

                    const pagBtn = getPaginationButton();
                    if (pagBtn) {
                        await loadAllOrders();
                    }

                    await syncMissingOrderDetails();
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

                if (!isNaN(price)) {
                    if (!cleaned[cleanKey]) {
                        cleaned[cleanKey] = { price, priceBeforeDiscounts, discountAmount, date, discountCode };
                    } else {
                        if (!cleaned[cleanKey].date && date) cleaned[cleanKey].date = date;
                        if (!cleaned[cleanKey].discountCode && discountCode) cleaned[cleanKey].discountCode = discountCode;
                        if (!cleaned[cleanKey].priceBeforeDiscounts && priceBeforeDiscounts) cleaned[cleanKey].priceBeforeDiscounts = priceBeforeDiscounts;
                        if (!cleaned[cleanKey].discountAmount && discountAmount) cleaned[cleanKey].discountAmount = discountAmount;
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
        if (obj.discountApplication?.code) return obj.discountApplication.code;
        if (Array.isArray(obj.discountApplications) && obj.discountApplications.length > 0) {
            return obj.discountApplications[0].code || obj.discountApplications[0].title || null;
        }
        if (Array.isArray(obj.allOrderLevelAppliedDiscounts) && obj.allOrderLevelAppliedDiscounts.length > 0) {
            return obj.allOrderLevelAppliedDiscounts[0].title || obj.allOrderLevelAppliedDiscounts[0].code || null;
        }
        if (Array.isArray(obj.discountInformation) && obj.discountInformation.length > 0) {
            return obj.discountInformation[0].title || null;
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

            const hasDetailInfo = isDetailResponse || discountCode !== null || discountAmount > 0 || priceBeforeNum !== null;

            uniqueOrders[targetKey] = {
                price: priceNum,
                priceBeforeDiscounts: priceBeforeNum || existing.priceBeforeDiscounts || (priceNum && discountAmount > 0 ? priceNum + discountAmount : null),
                discountAmount: discountAmount > 0 ? discountAmount : (existing.discountAmount || 0),
                date: date || existing.date || null,
                discountCode: discountCode || existing.discountCode || null,
                gid: gid || existing.gid || null,
                detailFetched: hasDetailInfo ? true : (existing.detailFetched || false),
                verifiedNoDiscount: isDetailResponse ? true : (existing.verifiedNoDiscount || false)
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

    const ORDER_DETAILS_QUERY = `query OrderDetails($orderId: ID!, $isBusinessCustomer: Boolean! = false, $redacted: Boolean = false) {
  order(id: $orderId) {
    id
    name
    processedAt
    currentTotalPrice: totalPrice { amount currencyCode }
    subtotal: subtotalBeforeDiscounts { amount currencyCode }
    totalSavings { amount currencyCode }
    discountApplications {
      ... on AutomaticDiscountApplication { title }
      ... on DiscountCodeApplication { code }
      ... on ManualDiscountApplication { title }
    }
    discountInformation {
      allOrderLevelAppliedDiscounts: allOrderLevelAppliedDiscountsOnSoldItems {
        title
        targetType
        discountApplicationType
        discountValue { amount currencyCode }
      }
      title
      discountValue { amount currencyCode }
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
            }
          }
        }
      }
    }
  }
}`;

    async function syncMissingOrderDetails() {
        if (isSyncingDetails) return;
        const ordersMap = getStoredOrders();
        const orderKeys = Object.keys(ordersMap);

        const pendingList = [];
        for (const key of orderKeys) {
            const order = ordersMap[key];
            const numericMatch = key.match(/\d+/);
            const gid = order.gid || (numericMatch ? `gid://shopify/Order/${numericMatch[0]}` : null);
            const isFullyVerified = order.detailFetched && (order.discountCode || order.verifiedNoDiscount);

            if (gid && !isFullyVerified) {
                pendingList.push({ name: key, gid: gid });
            }
        }

        if (pendingList.length === 0) {
            pendingSyncTotal = 0;
            pendingSyncCurrent = 0;
            return;
        }

        isSyncingDetails = true;
        pendingSyncTotal = pendingList.length;
        pendingSyncCurrent = 0;

        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const basePath = window.location.pathname.split('/account')[0];
        const graphqlUrl = window.location.origin + basePath + '/account/customer/api/unstable/graphql';

        try {
            for (let i = 0; i < pendingList.length; i++) {
                pendingSyncCurrent = i + 1;
                const item = pendingList[i];
                const numericId = item.gid.replace('gid://shopify/Order/', '');
                const remixUrl = `${window.location.origin}${basePath}/account/orders/${numericId}?_data=routes%2Faccount.orders.%24id`;

                let fetchedSuccess = false;

                // Estrategia 1: Remix Data Loader Endpoint
                try {
                    const resp = await targetWindow.fetch(remixUrl, {
                        method: 'GET',
                        credentials: 'include',
                        headers: { 'Accept': 'application/json, text/plain, */*' }
                    });

                    if (resp.ok) {
                        const resJson = await resp.json();
                        if (resJson?.order && !resJson.order.name) {
                            resJson.order.name = item.name;
                        }
                        let currentOrders = getStoredOrders();
                        if (extractOrdersFromObj(resJson, currentOrders, true)) {
                            if (currentOrders[item.name]) currentOrders[item.name].detailFetched = true;
                            saveStoredOrders(currentOrders);
                            fetchedSuccess = true;
                        }
                    }
                } catch (e1) { }

                // Estrategia 2: GraphQL OrderDetails con nombre exacto de variable orderId y operationName
                if (!fetchedSuccess) {
                    try {
                        const resp = await targetWindow.fetch(graphqlUrl + '?operation=OrderDetails', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({
                                operationName: 'OrderDetails',
                                variables: {
                                    orderId: item.gid,
                                    isBusinessCustomer: false,
                                    redacted: false
                                },
                                query: ORDER_DETAILS_QUERY
                            })
                        });

                        if (resp.ok) {
                            const resJson = await resp.json();
                            if (resJson?.data?.order && !resJson.data.order.name) {
                                resJson.data.order.name = item.name;
                            }
                            let currentOrders = getStoredOrders();
                            if (extractOrdersFromObj(resJson, currentOrders, true)) {
                                if (currentOrders[item.name]) currentOrders[item.name].detailFetched = true;
                                saveStoredOrders(currentOrders);
                                fetchedSuccess = true;
                            }
                        }
                    } catch (e2) { }
                }

                // Marcar detailFetched = true para garantizar progreso
                let finalOrders = getStoredOrders();
                if (finalOrders[item.name]) {
                    finalOrders[item.name].detailFetched = true;
                    saveStoredOrders(finalOrders);
                }

                updateDashboard();
                await new Promise(r => setTimeout(r, 120));
            }
        } finally {
            isSyncingDetails = false;
            pendingSyncTotal = 0;
            pendingSyncCurrent = 0;
            updateDashboard();
        }
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
                            if (existingBadge.textContent !== badgeText) {
                                existingBadge.textContent = badgeText;
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
                            badge.textContent = badgeText;
                            subSpan.appendChild(badge);
                        }
                    }
                }
            }
        });
    }

    function applyDOMDateFilter(filteredOrderIds) {
        const filterSet = new Set(filteredOrderIds);
        const articles = document.querySelectorAll('article');

        articles.forEach(article => {
            const orderId = extractOrderIdFromArticle(article);
            if (orderId) {
                if (currentFilterMode === 'all' && currentDiscountFilter === 'all') {
                    article.style.display = '';
                } else {
                    if (filterSet.has(orderId)) {
                        article.style.display = '';
                    } else {
                        article.style.display = 'none';
                    }
                }
            }
        });
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

    function filterOrders(ordersMap) {
        const orderIds = Object.keys(ordersMap);
        const now = new Date();

        return orderIds.filter(id => {
            const order = ordersMap[id];
            if (!order) return false;

            // 1. Filtro por Fecha
            if (currentFilterMode !== 'all') {
                if (!order.date) return false;
                const orderDate = new Date(order.date);
                if (isNaN(orderDate.getTime())) return false;

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

    function updateDashboard() {
        scanDOMOrders();

        const ordersMap = getStoredOrders();
        const totalAllOrders = Object.keys(ordersMap).length;

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

        if (isAutoLoadingAll) {
            statusLabel = `${SVG_ICONS.spin} Sincronizando...`;
            statusBgColor = '#0288d1'; // azul
            isFullySynced = false;
        } else if (isSyncingDetails && pendingSyncTotal > 0) {
            statusLabel = `${SVG_ICONS.spin} Descuentos (${pendingSyncCurrent} de ${pendingSyncTotal})`;
            statusBgColor = '#0288d1'; // azul
            isFullySynced = false;
        } else if (currentFilterMode !== 'all' || currentDiscountFilter !== 'all') {
            const filteredIds = filterOrders(ordersMap);
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

        const filteredIds = filterOrders(ordersMap);
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
    }, 1500);

})();