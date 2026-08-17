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
            const loadBtn = getPaginationButton();
            if (loadBtn) {
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
                discountOptionsHtml += `<option value="${code}" ${currentDiscountFilter === code ? 'selected' : ''}>🏷️ ${code}</option>`;
            });

            panel.innerHTML = `
                <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center; flex: 1;">
                        <div style="min-width: 90px;">
                            <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Órdenes</span>
                            <span id="shopify-stat-count" style="font-size: 17px; font-weight: 700; color: #16081e;">${count}</span>
                        </div>
                        <div style="min-width: 130px;">
                            <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Total Gastado</span>
                            <span id="shopify-stat-total" style="font-size: 17px; font-weight: 700; color: #16081e;">${totalSpentFormatted}</span>
                        </div>
                        <div style="min-width: 130px;">
                            <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Sin Descuento</span>
                            <span id="shopify-stat-gross" style="font-size: 17px; font-weight: 700; color: #555555;">${totalGrossFormatted}</span>
                        </div>
                        <div style="min-width: 130px;">
                            <span style="font-size: 11px; color: #2e7d32; display: block; font-weight: 600; text-transform: uppercase;">Total Ahorrado 🎉</span>
                            <span id="shopify-stat-savings" style="font-size: 17px; font-weight: 700; color: #2e7d32;">${totalSavingsFormatted}</span>
                        </div>
                        <div style="min-width: 120px;">
                            <span style="font-size: 11px; color: #70647a; display: block; font-weight: 500; text-transform: uppercase;">Promedio</span>
                            <span id="shopify-stat-avg" style="font-size: 17px; font-weight: 700; color: #16081e;">${avgFormatted}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <span id="shopify-stat-badge" style="font-size: 11px; background: ${badgeColor}; color: #fff; padding: 5px 10px; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                            ${statusText}
                        </span>
                        ${statusText.includes('parcial') && !isAutoLoadingAll ? `
                            <button id="shopify-btn-load-all" style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${themeColor}; background: #ffffff; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer;">
                                🔄 Cargar todos
                            </button>
                        ` : ''}
                        ${!statusText.includes('parcial') && !isAutoLoadingAll && !isSyncingDetails ? `
                            <button id="shopify-btn-force-refresh" style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${themeColor}; background: #ffffff; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer;">
                                🔄 Actualizar
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Controles de Filtros de Fecha, Descuento y Navegación Rápida -->
                <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; border-top: 1px solid #f0ecf4; padding-top: 12px;">
                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span style="font-size: 12px; font-weight: 600; color: #4a3e56;">📅 Fecha:</span>
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
                            <span style="font-size: 12px; font-weight: 600; color: #4a3e56;">🏷️ Descuentos:</span>
                            <select id="shopify-filter-discount-select" style="padding: 5px 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px; font-family: inherit; background: #fff; cursor: pointer;">
                                ${discountOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="shopify-btn-first-order-panel" style="padding: 5px 10px; border-radius: 20px; border: 1px solid ${themeColor}; background: #f8f5fb; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            ⬆️ Pedido más reciente
                        </button>
                        <button id="shopify-btn-last-order-panel" style="padding: 5px 10px; border-radius: 20px; border: 1px solid ${themeColor}; background: #f8f5fb; color: #16081e; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            ⬇️ Pedido más antiguo
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
                    let currentOrders = getStoredOrders();
                    for (const k in currentOrders) {
                        if (currentOrders[k]) currentOrders[k].detailFetched = false;
                    }
                    saveStoredOrders(currentOrders);
                    updateDashboard();
                    await syncMissingOrderDetails();
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
                badgeEl.textContent = statusText;
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
        if (obj.totalSavings?.amount) return parseFloat(obj.totalSavings.amount);
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

    function extractOrdersFromObj(obj, uniqueOrders) {
        if (!obj || typeof obj !== 'object') return false;
        let updated = false;

        if (obj.pageInfo && typeof obj.pageInfo.hasNextPage === 'boolean') {
            hasMorePagesDetected = obj.pageInfo.hasNextPage;
        }

        if (Array.isArray(obj)) {
            obj.forEach(item => {
                if (extractOrdersFromObj(item, uniqueOrders)) updated = true;
            });
            return updated;
        }

        const name = obj.name || obj.orderNumber;
        const amount = obj.totalPrice?.amount || obj.currentTotalPrice?.amount || obj.totalPrice || obj.total;
        const date = obj.processedAt || obj.createdAt || obj.processed_at || obj.created_at;
        const gid = (obj.id && typeof obj.id === 'string' && obj.id.startsWith('gid://')) ? obj.id : null;

        // Capturar precio sin descuento
        const priceBefore = obj.totalPriceBeforeDiscounts?.amount || obj.subtotalBeforeDiscounts?.amount || null;

        if (name && typeof name === 'string' && (name.startsWith('#') || name.startsWith('CJ')) && amount !== undefined) {
            const priceNum = typeof amount === 'object' ? parseFloat(amount.amount) : parseFloat(amount);
            if (!isNaN(priceNum)) {
                const formattedName = name.startsWith('#') ? name.trim() : `#${name.trim()}`;
                const priceBeforeNum = priceBefore ? parseFloat(priceBefore) : null;
                const discountCode = findDeepDiscountCode(obj);
                const discountAmount = findDeepDiscountAmount(obj);
                const existing = uniqueOrders[formattedName] || {};

                uniqueOrders[formattedName] = {
                    price: priceNum,
                    priceBeforeDiscounts: priceBeforeNum || existing.priceBeforeDiscounts || null,
                    discountAmount: discountAmount > 0 ? discountAmount : (existing.discountAmount || 0),
                    date: date || existing.date || null,
                    discountCode: discountCode || existing.discountCode || null,
                    gid: gid || existing.gid || null,
                    detailFetched: existing.detailFetched || false
                };
                updated = true;
            }
            return updated;
        }

        for (const key in obj) {
            if (obj[key] && typeof obj[key] === 'object') {
                if (extractOrdersFromObj(obj[key], uniqueOrders)) updated = true;
            }
        }
        return updated;
    }

    let isSyncingDetails = false;

    async function syncMissingOrderDetails() {
        if (isSyncingDetails) return;
        const ordersMap = getStoredOrders();
        const orderKeys = Object.keys(ordersMap);

        const pendingList = [];
        for (const key of orderKeys) {
            const order = ordersMap[key];
            if (order.gid && !order.detailFetched) {
                pendingList.push({ name: key, gid: order.gid });
            }
        }

        if (pendingList.length === 0) return;

        isSyncingDetails = true;
        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const basePath = window.location.pathname.split('/account')[0];
        const graphqlUrl = window.location.origin + basePath + '/account/customer/api/unstable/graphql?operation=LineItems';

        for (let i = 0; i < pendingList.length; i++) {
            const item = pendingList[i];
            try {
                const resp = await targetWindow.fetch(graphqlUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        operationName: "LineItems",
                        variables: {
                            redacted: false,
                            skipCompareAtPricing: true,
                            skipOnlineStoreUrl: false,
                            orderId: item.gid,
                            lineItemsFirst: 250
                        },
                        query: `query LineItems($orderId: ID!, $lineItemsFirst: Int!) {
                            order(id: $orderId) {
                                id
                                name
                                totalPrice { amount currencyCode }
                                processedAt
                                lineItems: lineItemContainers {
                                    ... on RemainingLineItemContainer {
                                        lineItems(first: $lineItemsFirst) {
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
                        }`
                    })
                });

                if (resp.ok) {
                    const resJson = await resp.json();
                    let currentOrders = getStoredOrders();
                    if (extractOrdersFromObj(resJson, currentOrders)) {
                        if (currentOrders[item.name]) {
                            currentOrders[item.name].detailFetched = true;
                        }
                        saveStoredOrders(currentOrders);
                        updateDashboard();
                    } else if (currentOrders[item.name]) {
                        currentOrders[item.name].detailFetched = true;
                        saveStoredOrders(currentOrders);
                    }
                }
            } catch (e) { }

            await new Promise(r => setTimeout(r, 250));
        }

        isSyncingDetails = false;
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
        let match = ariaLabel.match(/(#[A-Za-z0-9\-_]+)/);
        if (match) return match[1].trim();

        const textContent = article.textContent || '';
        match = textContent.match(/(#[A-Za-z0-9\-_]+)/);
        if (match) return match[1].trim();

        return null;
    }

    function injectDatesIntoDOM() {
        const ordersMap = getStoredOrders();
        const articles = document.querySelectorAll('article');

        articles.forEach(article => {
            const orderId = extractOrderIdFromArticle(article);
            if (orderId && ordersMap[orderId]) {
                const orderInfo = ordersMap[orderId];
                const formattedDate = orderInfo.date ? formatOrderDate(orderInfo.date) : '';
                const discountCode = orderInfo.discountCode ? ` · 🏷️ ${orderInfo.discountCode}` : '';

                if (!formattedDate && !discountCode) return;

                // Buscar el span interno exacto que contiene "#CJ..." y el monto
                const spans = Array.from(article.querySelectorAll('span'));
                const subSpan = spans.find(span => {
                    const text = span.textContent || '';
                    return text.includes(orderId) && (text.includes('COP') || text.includes('$') || text.includes('·'));
                });

                if (subSpan) {
                    let existingBadge = subSpan.querySelector('.shopify-order-date-badge');
                    const badgeText = `${discountCode}${formattedDate ? ` · ${formattedDate}` : ''}`;

                    if (existingBadge) {
                        if (existingBadge.textContent !== badgeText) {
                            existingBadge.textContent = badgeText;
                        }
                    } else {
                        const badge = document.createElement('span');
                        badge.className = 'shopify-order-date-badge';
                        badge.style.cssText = `
                            color: #70647a;
                            font-weight: 400;
                            display: inline;
                        `;
                        badge.textContent = badgeText;
                        subSpan.appendChild(badge);
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

    function scanDOMOrders() {
        let uniqueOrders = getStoredOrders();
        let newFound = false;

        const articles = document.querySelectorAll('article');
        articles.forEach(article => {
            const orderId = extractOrderIdFromArticle(article);
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

        let statusLabel = '✅ Sincronizado';
        let statusBgColor = '#2e7d32'; // verde

        if (isAutoLoadingAll) {
            statusLabel = '🔄 Sincronizando...';
            statusBgColor = '#0288d1'; // azul
            isFullySynced = false;
        } else if (currentFilterMode !== 'all' || currentDiscountFilter !== 'all') {
            const filteredIds = filterOrders(ordersMap);
            statusLabel = `🔍 Filtrando (${filteredIds.length} de ${totalAllOrders})`;
            statusBgColor = '#7b1fa2'; // morado
            isFullySynced = isNewestInCache;
        } else if (totalAllOrders === 0) {
            statusLabel = '🔄 Sincronizando...';
            statusBgColor = '#0288d1';
            isFullySynced = false;
        } else if (!isNewestInCache && pagBtn) {
            statusLabel = '⚠️ Sincronización parcial';
            statusBgColor = '#e65100';
            isFullySynced = false;
        } else {
            statusLabel = '✅ Sincronizado';
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