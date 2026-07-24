/* ==================== GLOBAL APP STATE ==================== */
let API_URL = "";
let dashboardData = null;
let activeTab = "ostatka";
let currentRankTab = "rank-top";
let sublistType = ""; // 'suppliers', 'customers', 'goods', 'expiring', 'receipts', 'expenses'
let activePartnerName = ""; // Selected partner for Sverka
let activeSupplierFilter = "all"; // 'all' or 'overdue'
let expiringMonthFilter = "all"; // Month number or 'all'
let activeReceiptSupplier = "all"; // Filter for goods receipts
let activeExpenseGroup = "all"; // Filter for cash expenses

// Format currency in Uzbekistan Soum
function formatMoney(amount) {
    return Math.round(amount || 0).toLocaleString('ru-RU') + " сўм";
}

// Format quantity in packs (почка) and units (дона)
function formatPacks(qty, packSize) {
    packSize = Number(packSize) || 1;
    qty = Number(qty) || 0;
    if (packSize <= 1) {
        return `${qty} дона`;
    }
    const packs = Math.floor(qty / packSize);
    const units = Math.round(qty % packSize);

    let res = [];
    if (packs > 0) res.push(`${packs} почка`);
    if (units > 0) res.push(`${units} дона`);
    return res.length > 0 ? res.join(", ") : "0 дона";
}

// Convert "dd.MM.yyyy" or "dd.MM.yyyy HH:mm:ss" to ISO "YYYY-MM-DD" for date range comparisons
function parseDateToIso(dateStr) {
    if (!dateStr) return "";
    let s = String(dateStr).trim().split(' ')[0];
    if (s.includes('.')) {
        const parts = s.split('.');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }
    return s;
}

// Normalize string for transliterated, case-insensitive search (Cyrillic <-> Latin)
function normalizeForSearch(str) {
    if (!str) return "";
    let s = String(str).toLowerCase();
    
    // Transliteration map Cyrillic -> Latin
    const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
        'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'қ': 'q', 'ҳ': 'h', 'ў': 'o', 'ғ': 'g'
    };
    
    let res = "";
    for (let i = 0; i < s.length; i++) {
        let char = s[i];
        res += map[char] || char;
    }
    
    // Normalize combinations
    res = res.replace(/sh/g, 'w')
             .replace(/ch/g, 'c')
             .replace(/kh/g, 'x')
             .replace(/zh/g, 'j')
             .replace(/yo/g, 'o')
             .replace(/yu/g, 'u')
             .replace(/ya/g, 'a')
             .replace(/o'/g, 'o')
             .replace(/g'/g, 'g')
             .replace(/['`’‘"”]/g, ''); // Remove apostrophes
             
    return res;
}

// Perform search matching over item name and barcode
function matchSearch(item, searchWords) {
    if (searchWords.length === 0) return true;
    
    const normItemName = item._normName || normalizeForSearch(item.Товар);
    const normBarcode = item._normBarcode || normalizeForSearch(item.ШтрихКод);
    
    return searchWords.every(word => 
        normItemName.includes(word) || 
        normBarcode.includes(word)
    );
}

function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

function prepareDataForSearch(data) {
    if (!data) return;
    if (data.ОстаткаларРуйхати && Array.isArray(data.ОстаткаларРуйхати)) {
        data.ОстаткаларРуйхати.forEach(item => {
            if (item.Товар && !item._normName) {
                item._normName = normalizeForSearch(item.Товар);
            }
            if (item.ШтрихКод && !item._normBarcode) {
                item._normBarcode = normalizeForSearch(item.ШтрихКод);
            }
        });
    }
    if (data.Отказлар && Array.isArray(data.Отказлар)) {
        data.Отказлар.forEach(item => {
            if (item.Товары && !item._normName) {
                item._normName = normalizeForSearch(item.Товары);
            }
        });
    }
}

// Use local proxy endpoint dynamically (supports PC, GitHub Pages, iPhone, Android over Tailscale/IP).
function getApiUrl() {
    const saved = localStorage.getItem('apiBaseUrl');
    if (saved && saved.trim() !== "") return saved;
    
    let host = localStorage.getItem('serverHost');
    
    // If no host saved, or host is default localhost on GitHub Pages
    if (!host || (host === 'localhost' && window.location.hostname.includes('github.io'))) {
        host = 'localhost';
    }
    
    if (host.startsWith('http://') || host.startsWith('https://')) {
        return host.endsWith('/api') ? host : `${host}/api`;
    }
    
    return `http://${host}:8003/api`;
}



// Generate Authorization Header based on stored credentials
function getAuthHeader() {
    return "Basic U2VydmVyOjIzNDA=";
}

// Initialize Application Settings on Load
function initSettings() {
    if (!localStorage.getItem('serverHost')) {
        localStorage.setItem('serverHost', 'localhost');
    }
    if (!localStorage.getItem('serverPublication')) {
        localStorage.setItem('serverPublication', 'bossAPI_AL');
    }
    if (!localStorage.getItem('serverService')) {
        localStorage.setItem('serverService', 'app');
    }
    if (!localStorage.getItem('expiringMonths')) {
        localStorage.setItem('expiringMonths', '3');
    }
    API_URL = getApiUrl();
}

// Get expiring threshold in days
function getExpiringDays() {
    return parseInt(localStorage.getItem('expiringMonths') || '3') * 30;
}

/* ==================== SHOW/HIDE SPINNERS ==================== */
function showLoader(message = "Маълумотлар юкланмоқда...") {
    document.getElementById("global-loader-text").textContent = message;
    document.getElementById("global-loader").style.display = "flex";
}

function hideLoader() {
    document.getElementById("global-loader").style.display = "none";
}

function showStatusBanner(message, type = "warning") {
    const banner = document.getElementById("app-status-banner");
    if (!banner) return;

    banner.textContent = message;
    banner.className = `app-status-banner ${type}`;
    banner.style.display = "block";

    clearTimeout(showStatusBanner.timeoutId);
    showStatusBanner.timeoutId = setTimeout(() => {
        banner.style.display = "none";
    }, 3200);
}

/* ==================== SCREEN NAVIGATION ==================== */
function showScreen(screenId) {
    // Hide all main screens/subs
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-screen").style.display = "none";
    document.getElementById("sublist-screen").style.display = "none";
    document.getElementById("sverka-screen").style.display = "none";
    document.getElementById("receipt-detail-screen").style.display = "none";

    if (screenId === "login") {
        document.getElementById("login-screen").style.display = "flex";
    } else if (screenId === "main") {
        document.getElementById("main-screen").style.display = "flex";
    } else if (screenId === "sublist") {
        document.getElementById("sublist-screen").style.display = "flex";
    } else if (screenId === "sverka") {
        document.getElementById("sverka-screen").style.display = "flex";
    } else if (screenId === "receipt-detail") {
        document.getElementById("receipt-detail-screen").style.display = "flex";
    }
}

/* ==================== DOM CONTENT LOADED ==================== */
document.addEventListener("DOMContentLoaded", () => {
    initSettings();
    loadFirmName();
    applyLanguage(); // Apply saved language on every page load


    // 1. Setup Date Selectors
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    document.getElementById("date-from").value = todayStr;
    document.getElementById("date-to").value = todayStr;

    // Default Sverka date range (Jan 1st of current year to Today)
    const currentYear = today.getFullYear();
    const startOfYearStr = `${currentYear}-01-01`;
    document.getElementById("sverka-date-from").value = startOfYearStr;
    document.getElementById("sverka-date-to").value = todayStr;

    // 2. Attach Event Listeners
    const refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => loadDashboardData());
    }

    // Auto-refresh when main dates change
    const mainFromInput = document.getElementById("date-from");
    const mainToInput = document.getElementById("date-to");
    if (mainFromInput) mainFromInput.addEventListener("change", () => loadDashboardData());
    if (mainToInput) mainToInput.addEventListener("change", () => loadDashboardData());

    // Auto-refresh when sublist dates change
    const subFromInput = document.getElementById("sublist-date-from");
    const subToInput = document.getElementById("sublist-date-to");
    const onSublistDateChange = async () => {
        if (subFromInput && subToInput) {
            document.getElementById("date-from").value = subFromInput.value;
            document.getElementById("date-to").value = subToInput.value;
            await loadDashboardData(sublistType);
            updateSublistHeader();
            renderSublistItems();
        }
    };
    if (subFromInput) subFromInput.addEventListener("change", onSublistDateChange);
    if (subToInput) subToInput.addEventListener("change", onSublistDateChange);
    
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }
    
    // Settings modal triggers
    const loginSettingsBtn = document.getElementById("settings-btn-login");
    if (loginSettingsBtn) {
        loginSettingsBtn.addEventListener("click", openSettingsModal);
    }
    
    const settingsBtnDash = document.getElementById("settings-btn-dash");
    if (settingsBtnDash) {
        settingsBtnDash.addEventListener("click", openSettingsModal);
    }
    
    const closeSettingsBtn = document.getElementById("close-settings-btn");
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener("click", closeSettingsModal);
    }
    
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener("click", saveSettings);
    }
    
    const editSettingsBtn = document.getElementById("edit-settings-btn");
    if (editSettingsBtn) {
        editSettingsBtn.addEventListener("click", toggleSettingsEditMode);
    }
    const testSettingsBtn = document.getElementById("test-settings-btn");
    if (testSettingsBtn) {
        testSettingsBtn.addEventListener("click", testServerConnection);
    }

    // Auto-formatting phone number input as: 90 123 45 67
    const phoneInput = document.getElementById("phone");
    const formatPhone = (e) => {
        let rawVal = e.target.value.replace(/\D/g, ''); // Extract only digits
        
        // Strip out +998 from start if user pasted it
        if (rawVal.startsWith('998') && rawVal.length > 3) {
            rawVal = rawVal.substring(3);
        }
        
        // Match segments
        let match = rawVal.match(/(\d{0,2})(\d{0,3})(\d{0,2})(\d{0,2})/);
        if (!match) {
            e.target.value = '';
            return;
        }
        
        let formatted = '';
        if (match[1]) formatted += match[1];
        if (match[2]) formatted += ' ' + match[2];
        if (match[3]) formatted += ' ' + match[3];
        if (match[4]) formatted += ' ' + match[4];
        
        e.target.value = formatted.trim();
    };

    phoneInput.addEventListener("input", formatPhone);
    phoneInput.addEventListener("change", formatPhone);
    phoneInput.addEventListener("blur", formatPhone);

    // Format prefilled or autofilled values (especially from browser password managers)
    const runInitialFormats = () => {
        if (phoneInput.value) {
            formatPhone({ target: phoneInput });
        }
    };
    runInitialFormats();
    setTimeout(runInitialFormats, 100);
    setTimeout(runInitialFormats, 300);
    setTimeout(runInitialFormats, 800);
    setTimeout(runInitialFormats, 1500);

    // Handle login submit form
    document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);

    // Navigation item switcher
    const navItems = document.querySelectorAll(".bottom-nav .nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            const btn = e.currentTarget;
            const targetTab = btn.getAttribute("data-tab");
            switchTab(targetTab);
        });
    });

    // Sublist Back Button
    document.getElementById("sublist-back-btn").addEventListener("click", () => {
        showScreen("main");
    });

    // Sverka Back Button
    document.getElementById("sverka-back-btn").addEventListener("click", () => {
        // Go back to sublist if we came from sublist, otherwise main
        if (sublistType === "suppliers" || sublistType === "customers") {
            showScreen("sublist");
        } else {
            showScreen("main");
        }
    });

    // Sublist search input trigger with debounce to avoid freezing
    document.getElementById("sublist-search-input").addEventListener("input", debounce(filterSublistItems, 200));
    
    // Main searchable tabs triggers with debounce to avoid freezing
    document.getElementById("search-tovar-input").addEventListener("input", debounce(renderTovarTab, 200));
    document.getElementById("search-otkaz-input").addEventListener("input", debounce(renderOtkazTab, 200));

    // Section-specific refresh buttons
    document.getElementById("refresh-tovar-btn").addEventListener("click", async () => {
        await loadDashboardData("tovar");
        renderTovarTab();
    });
    document.getElementById("refresh-otkaz-btn").addEventListener("click", async () => {
        await loadDashboardData("otkaz");
        renderOtkazTab();
    });

    // Cards Click listeners (Drill-down)
    document.getElementById("card-ostatka-suppliers").addEventListener("click", () => openSublist("suppliers"));
    document.getElementById("card-ostatka-customers").addEventListener("click", () => openSublist("customers"));
    document.getElementById("card-ostatka-goods").addEventListener("click", () => openSublist("goods"));
    document.getElementById("card-ostatka-expiring").addEventListener("click", () => openSublist("expiring"));
    const cardReceiptsEl = document.getElementById("card-ostatka-receipts");
    if (cardReceiptsEl) cardReceiptsEl.addEventListener("click", () => openSublist("receipts"));
    const cardExpensesEl = document.getElementById("card-ostatka-expenses");
    if (cardExpensesEl) cardExpensesEl.addEventListener("click", () => openSublist("expenses"));

    // Expenses group filter change
    document.getElementById("expenses-group-select").addEventListener("change", (e) => {
        activeExpenseGroup = e.target.value;
        renderSublistItems();
    });

    // Back button from receipt detail
    document.getElementById("receipt-detail-back-btn").addEventListener("click", () => showScreen("sublist"));

    // Supplier filter tabs triggers
    document.getElementById("btn-sup-all").addEventListener("click", () => switchSupplierFilter("all"));
    document.getElementById("btn-sup-overdue").addEventListener("click", () => switchSupplierFilter("overdue"));

    // Sverka refresh trigger
    document.getElementById("sverka-refresh-btn").addEventListener("click", () => {
        loadSverkaData(activePartnerName);
    });

    // Sublist refresh trigger
    const sublistRefreshBtn = document.getElementById("sublist-refresh-btn");
    if (sublistRefreshBtn) {
        sublistRefreshBtn.addEventListener("click", async () => {
            const subFrom = document.getElementById("sublist-date-from").value;
            const subTo = document.getElementById("sublist-date-to").value;
            document.getElementById("date-from").value = subFrom;
            document.getElementById("date-to").value = subTo;
            await loadDashboardData(sublistType);
            updateSublistHeader();
            renderSublistItems();
        });
    }

    // Sales ranking tabs switcher
    const rankBtns = document.querySelectorAll(".ranking-tabs .rank-tab-btn");
    rankBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            rankBtns.forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            currentRankTab = e.currentTarget.getAttribute("data-tab");
            renderSalesRankings();
        });
    });

    document.getElementById("menu-btn-ostatka").addEventListener("click", () => showView("ostatka"));
    document.getElementById("menu-btn-tovar").addEventListener("click", () => showView("tovar"));
    document.getElementById("menu-btn-savdo").addEventListener("click", () => showView("savdo"));
    document.getElementById("menu-btn-otkaz").addEventListener("click", () => showView("otkaz"));
    document.getElementById("menu-btn-receipts").addEventListener("click", () => openSublist("receipts"));
    document.getElementById("menu-btn-expenses").addEventListener("click", () => openSublist("expenses"));
    
    // Tab header Back button
    document.getElementById("tab-back-btn").addEventListener("click", () => showView("home"));

    // Tab header Refresh button
    const tabRefreshBtn = document.getElementById("tab-refresh-btn");
    if (tabRefreshBtn) {
        tabRefreshBtn.addEventListener("click", () => {
            loadDashboardData(activeTab);
        });
    }

    // Login screen Settings button
    document.getElementById("login-settings-btn").addEventListener("click", openSettingsModal);

    // 3. Auto-login if valid session exists
    const employeesStr = localStorage.getItem('employees');
    const savedPhone = localStorage.getItem('userPhone');
    const savedPassword = localStorage.getItem('userPassword');
    
    // Prefill phone and password fields if they exist in cache
    if (savedPhone) {
        let rawPhone = savedPhone.replace(/\D/g, '');
        if (rawPhone.startsWith('998') && rawPhone.length > 3) {
            rawPhone = rawPhone.substring(3);
        }
        let match = rawPhone.match(/(\d{0,2})(\d{0,3})(\d{0,2})(\d{0,2})/);
        if (match) {
            let formatted = (match[1] || '') + 
                            (match[2] ? ' ' + match[2] : '') + 
                            (match[3] ? ' ' + match[3] : '') + 
                            (match[4] ? ' ' + match[4] : '');
            document.getElementById("phone").value = formatted.trim();
        }
    }
    if (savedPassword) {
        document.getElementById("password").value = savedPassword;
    }

    if (savedPhone && savedPassword && employeesStr) {
        try {
            const employees = JSON.parse(employeesStr);
            const res = checkCredentialsLocally(savedPhone, savedPassword, employees);
            if (res.success) {
                showScreen("main");
                showView("home");
                applyLanguage();
                loadDashboardData();
                return;
            }
        } catch (e) {
            console.warn("Auto-login check error:", e);
        }
    }
    showScreen("login");
});


/* ==================== LATIN / CYRILLIC I18N SYSTEM ==================== */
let currentLang = localStorage.getItem('appLang') || 'cyrl';

function toLatin(str) {
    if (!str || typeof str !== 'string') return str;
    if (currentLang !== 'latn') return str;

    const map = {
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'J', 'З': 'Z',
        'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R',
        'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'X', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sh',
        'Ъ': "'", 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya', 'Ў': "O'", 'Қ': 'Q', 'Ғ': "G'", 'Ҳ': 'H',
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
        'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
        'ъ': "'", 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ў': "o'", 'қ': 'q', 'ғ': "g'", 'ҳ': 'h'
    };

    return str.replace(/[А-Яа-яЎўҚқҒғҲҳЁё]/g, letter => map[letter] || letter);
}

function applyLanguage() {
    currentLang = localStorage.getItem('appLang') || 'cyrl';
    const isLatn = currentLang === 'latn';

    const langSelect = document.getElementById("settings-lang");
    if (langSelect) langSelect.value = currentLang;

    const subtitle = document.querySelector(".subtitle");
    if (subtitle) subtitle.textContent = isLatn ? "Tizimga xush kelibsiz" : "Тизимга хуш келибсиз";

    const phoneLbl = document.querySelector("label[for='phone']");
    if (phoneLbl) phoneLbl.textContent = isLatn ? "Telefon raqam" : "Телефон рақам";

    const passLbl = document.querySelector("label[for='password']");
    if (passLbl) passLbl.textContent = isLatn ? "Parol" : "Парол";

    const loginBtn = document.getElementById("login-submit-btn");
    if (loginBtn) loginBtn.textContent = isLatn ? "Kirish" : "Кириш";

    const dateFromLbl = document.querySelector("label[for='date-from']");
    if (dateFromLbl) dateFromLbl.textContent = isLatn ? "Dan:" : "Дан:";

    const dateToLbl = document.querySelector("label[for='date-to']");
    if (dateToLbl) dateToLbl.textContent = isLatn ? "Gacha:" : "Гача:";

    const testBtn = document.getElementById("test-settings-btn");
    if (testBtn) testBtn.textContent = isLatn ? "Tekshirish" : "Текшириш";

    const saveBtn = document.getElementById("save-settings-btn");
    if (saveBtn) saveBtn.textContent = isLatn ? "Saqlash" : "Сақлаш";

    const labelLang = document.getElementById("label-settings-lang");
    if (labelLang) labelLang.textContent = isLatn ? "Tilni tanlash" : "Тилни танлаш";

    document.querySelectorAll(".card-title").forEach(el => {
        let txt = el.textContent.trim();
        if (txt.includes("сотув") || txt.includes("sotuv")) el.textContent = isLatn ? "Bugungi sotuv" : "Бугунги сотув";
        else if (txt.includes("кирими") || txt.includes("kirimi")) el.textContent = isLatn ? "Tovar kirimi" : "Товар кирими";
        else if (txt.includes("чиқимлари") || txt.includes("chiqimlari")) el.textContent = isLatn ? "Kassa chiqimlari" : "Касса чиқимлари";
        else if (txt.includes("Қарздорлар") || txt.includes("Qarzdorlar")) el.textContent = isLatn ? "Qarzdorlar ro'yxati" : "Қарздорлар рўйхати";
        else if (txt.includes("қолдиғи") || txt.includes("qoldig'i")) el.textContent = isLatn ? "Tovar qoldig'i" : "Товар қолдиғи";
    });

    // Menu labels (home screen grid)
    const menuLabels = {
        'menu-btn-ostatka': { cyrl: 'Остатка', latn: 'Ostatka' },
        'menu-btn-tovar':   { cyrl: 'Товарлар', latn: "Tovarlar" },
        'menu-btn-savdo':   { cyrl: 'Савдо', latn: 'Savdo' },
        'menu-btn-otkaz':   { cyrl: 'Отказлар', latn: "Otkazlar" },
        'menu-btn-receipts':{ cyrl: 'Товар кирими', latn: 'Tovar kirimi' },
        'menu-btn-expenses':{ cyrl: 'Касса чиқими', latn: 'Kassa chiqimi' }
    };
    Object.entries(menuLabels).forEach(([id, txt]) => {
        const el = document.querySelector(`#${id} .menu-label`);
        if (el) el.textContent = isLatn ? txt.latn : txt.cyrl;
    });

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.innerHTML = isLatn ? '⏻ Chiqish' : '⏻ Чиқиш';

    // Card labels on Ostatka tab
    const cardLabels = [
        ['card-label', "Таъминотчилар Ҳаққи", "Ta'minotchilar Haqqi"],
        ['card-label', "Харидорлар Қарзи", "Xaridorlar Qarzi"],
        ['card-label', "Товарлар Қолдиғи", "Tovarlar Qoldig'i"],
        ['card-label', "Муддати яқин қолдиқлар", "Muddati yaqin qoldiqlar"]
    ];
    document.querySelectorAll('.card-label').forEach(el => {
        const txt = el.textContent.trim();
        if (txt === "Таъминотчилар Ҳаққи" || txt === "Ta'minotchilar Haqqi")
            el.textContent = isLatn ? "Ta'minotchilar Haqqi" : "Таъминотчилар Ҳаққи";
        else if (txt === "Харидорлар Қарзи" || txt === "Xaridorlar Qarzi")
            el.textContent = isLatn ? "Xaridorlar Qarzi" : "Харидорлар Қарзи";
        else if (txt === "Товарлар Қолдиғи" || txt === "Tovarlar Qoldig'i")
            el.textContent = isLatn ? "Tovarlar Qoldig'i" : "Товарлар Қолдиғи";
        else if (txt === "Муддати яқин қолдиқлар" || txt === "Muddati yaqin qoldiqlar")
            el.textContent = isLatn ? "Muddati yaqin qoldiqlar" : "Муддати яқин қолдиқлар";
    });

    // Sub-screen titles
    const subTitles = document.querySelectorAll('.sub-title');
    subTitles.forEach(el => {
        const txt = el.textContent.trim();
        if (txt === 'Таъминотчилар' || txt === "Ta'minotchilar") el.textContent = isLatn ? "Ta'minotchilar" : 'Таъминотчилар';
        else if (txt === 'Харидорлар' || txt === 'Xaridorlar') el.textContent = isLatn ? 'Xaridorlar' : 'Харидорлар';
        else if (txt === 'Товар кирими' || txt === 'Tovar kirimi') el.textContent = isLatn ? 'Tovar kirimi' : 'Товар кирими';
        else if (txt === 'Касса чиқими' || txt === 'Kassa chiqimi') el.textContent = isLatn ? 'Kassa chiqimi' : 'Касса чиқими';
        else if (txt === 'Товарлар' || txt === 'Tovarlar') el.textContent = isLatn ? 'Tovarlar' : 'Товарлар';
    });

    if (dashboardData) {
        renderDashboard();
    }
}

/* ==================== SETTINGS MODAL CONTROLS ==================== */
let settingsEditMode = false;

function toggleSettingsEditMode() {
    settingsEditMode = !settingsEditMode;
    const inputs = [
        document.getElementById("settings-host"),
        document.getElementById("settings-pub"),
        document.getElementById("settings-service")
    ];
    const editBtn = document.getElementById("edit-settings-btn");
    
    inputs.forEach(input => {
        if (input) {
            input.readOnly = !settingsEditMode;
            if (settingsEditMode) {
                input.classList.add("editable");
            } else {
                input.classList.remove("editable");
            }
        }
    });

    if (editBtn) {
        if (settingsEditMode) {
            editBtn.classList.add("active");
        } else {
            editBtn.classList.remove("active");
        }
    }
}

function openSettingsModal() {
    settingsEditMode = false;
    
    document.getElementById("settings-host").value = localStorage.getItem('serverHost') || 'localhost';
    document.getElementById("settings-pub").value = localStorage.getItem('serverPublication') || 'bossAPI';
    document.getElementById("settings-service").value = localStorage.getItem('serverService') || 'app';
    const langSel = document.getElementById("settings-lang");
    if (langSel) langSel.value = localStorage.getItem('appLang') || 'cyrl';
    
    // Set all to readOnly initially
    const inputs = [
        document.getElementById("settings-host"),
        document.getElementById("settings-pub"),
        document.getElementById("settings-service")
    ];
    inputs.forEach(input => {
        if (input) {
            input.readOnly = true;
            input.classList.remove("editable");
        }
    });

    const editBtn = document.getElementById("edit-settings-btn");
    if (editBtn) editBtn.classList.remove("active");

    document.getElementById("settings-modal").style.display = "flex";
}

function closeSettingsModal() {
    document.getElementById("settings-modal").style.display = "none";
}

async function testServerConnection() {
    const host = document.getElementById("settings-host").value.trim();
    const pub = document.getElementById("settings-pub").value.trim();
    const service = document.getElementById("settings-service").value.trim();
    
    if (!host || !pub || !service) {
        alert(currentLang === 'latn' ? "Iltimos, barcha maydonlarni kiriting!" : "Илтимос, барча майдонларни киритинг!");
        return;
    }
    
    showLoader(currentLang === 'latn' ? "1C bilan ulanish..." : "1С билан уланиш ва ходимлар маълумотлари юкланмоқда...");
    
    const authHeader = getAuthHeader();
    const proxyUrl = getApiUrl();
    const directUrl = `http://${host}/${pub}/hs/${service}`;
    
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10000);
        
        let response;
        try {
            response = await fetch(`${proxyUrl}/raxbar_data`, {
                method: 'GET',
                headers: { "Authorization": authHeader },
                signal: controller.signal
            });
        } catch (proxyErr) {
            response = await fetch(`${directUrl}/raxbar_data`, {
                method: 'GET',
                headers: { "Authorization": authHeader },
                signal: controller.signal
            });
        }
        clearTimeout(id);
        
        if (response.ok) {
            const rawText = await response.text();
            const json = safeJsonParse(rawText);
            const data = json["#value"] || json;
            
            let empMsg = "";
            if (data.ХодимларЛисти && Array.isArray(data.ХодимларЛисти)) {
                localStorage.setItem('employees', JSON.stringify(data.ХодимларЛисти));
                empMsg = currentLang === 'latn' ? `\n\n1C dan ${data.ХодимларЛисти.length} ta xodim ma'lumotlari yuklandi.` : `\n\n1С дан ${data.ХодимларЛисти.length} та ходим маълумотлари юкланди ва янгиланди.`;
            }
            if (data.ФирмаНоми) {
                const headerBrandEl = document.getElementById("header-company-name");
                if (headerBrandEl) headerBrandEl.textContent = toLatin(data.ФирмаНоми.toUpperCase());
            }
            
            // Save settings as well
            localStorage.setItem('serverHost', host);
            localStorage.setItem('serverPublication', pub);
            localStorage.setItem('serverService', service);

            alert((currentLang === 'latn' ? "Ulanish muvaffaqiyatli bajarildi!" : "Уланиш муваффақиятли бажарилди!") + empMsg);
            closeSettingsModal();
        } else {
            alert(`Уланишда хатолик! Сервер коди: ${response.status}`);
        }
    } catch (err) {
        console.error("Test connection error:", err);
        alert("1С Серверга ёки проксига уланиб бўлмади!");
    } finally {
        hideLoader();
    }
}


function saveSettings() {
    const host = document.getElementById("settings-host").value.trim();
    const pub = document.getElementById("settings-pub").value.trim();
    const service = document.getElementById("settings-service").value.trim();
    const lang = document.getElementById("settings-lang")?.value || 'cyrl';

    if (!host || !pub || !service) {
        alert(currentLang === 'latn' ? "Iltimos, barcha maydonlarni to'ldiring!" : "Илтимос, барча майдонларни тўлдиринг!");
        return;
    }

    localStorage.setItem("serverHost", host);
    localStorage.setItem("serverPublication", pub);
    localStorage.setItem("serverService", service);
    localStorage.setItem("appLang", lang);

    API_URL = getApiUrl();
    applyLanguage();
    closeSettingsModal();
    alert(lang === 'latn' ? "Sozlamalar muvaffaqiyatli saqlandi!" : "Созламалар муваффақиятли сақланди!");
    loadFirmName();
    
    if (localStorage.getItem('userPhone') && localStorage.getItem('userPassword')) {
        loadDashboardData();
    }
}


/* ==================== AUTHENTICATION ==================== */
async function handleLoginSubmit(e) {
    e.preventDefault();
    const phone = document.getElementById("phone").value;
    const password = document.getElementById("password").value;

    showLoader(currentLang === 'latn' ? "Tizimga kirilmoqda..." : "Тизимга кирилмоқда...");
    
    localStorage.setItem("userPhone", phone || "+998 88 888 88 88");
    localStorage.setItem("userPassword", password || "1");
    showScreen("main");
    showView("home");
    
    // Load cached dashboard data silently without making server request on login
    const cached = localStorage.getItem('cachedDashboardData');
    if (cached) {
        try {
            dashboardData = JSON.parse(cached);
            renderDashboard();
        } catch (err) {
            console.warn("Cached data parse error:", err);
        }
    }
    hideLoader();
}



function checkCredentialsLocally(phone, password, employeeList) {
    let inputPhoneDigits = (phone || "").replace(/\D/g, '');
    let inputPass = String(password || "").trim();

    if (!employeeList || !Array.isArray(employeeList) || employeeList.length === 0) {
        return { success: true, employee: { name: "Администратор", role: "admin", allow_mobile: true } };
    }

    // 1. Match password and phone flexibly
    for (let emp of employeeList) {
        let empPass = String(emp.password || "").trim();
        let empPhoneDigits = (emp.phone || "").replace(/\D/g, '');

        if (empPass === inputPass) {
            if (empPhoneDigits.length === 0 || inputPhoneDigits.length === 0 || 
                inputPhoneDigits.includes(empPhoneDigits) || empPhoneDigits.includes(inputPhoneDigits) ||
                (inputPhoneDigits.length >= 4 && empPhoneDigits.length >= 4 && inputPhoneDigits.slice(-4) === empPhoneDigits.slice(-4))) {
                return { success: true, employee: emp };
            }
        }
    }

    // 2. If password matches any 1C user password, log in
    for (let emp of employeeList) {
        let empPass = String(emp.password || "").trim();
        if (empPass !== "" && empPass === inputPass) {
            return { success: true, employee: emp };
        }
    }

    // 3. Fallback for admin password
    if (inputPass === "1" || inputPass === "2340") {
        return { success: true, employee: { name: "Администратор", role: "admin", allow_mobile: true } };
    }

    return { success: false, message: "Парол нотўғри!" };
}


async function performLogin(phone, password, isAuto) {
    // Always attempt to fetch the latest employee list from 1C when logging in
    try {
        const resp = await fetch(`${API_URL}/raxbar_data`, {
            headers: { "Authorization": getAuthHeader() }
        });
        if (resp.ok) {
            const rawText = await resp.text();
            const json = safeJsonParse(rawText);
            const data = json["#value"] || json;
            if (data.ХодимларЛисти && Array.isArray(data.ХодимларЛисти) && data.ХодимларЛисти.length > 0) {
                localStorage.setItem('employees', JSON.stringify(data.ХодимларЛисти));
            }
        }
    } catch (netErr) {
        console.warn("Offline or 1C unreachable, using cached employees list:", netErr);
    }

    const employeesStr = localStorage.getItem('employees');
    
    if (!employeesStr) {
        alert("1С нинг 'Обмен' HTTP-сервиси билан алоқа ўрнатилмади! Илтимос, Созламалар (⚙️) ойнасида 'Текшириш' тугмасини босинг.");
        hideLoader();
        return;
    }
    
    try {
        const employees = JSON.parse(employeesStr);
        const result = checkCredentialsLocally(phone, password, employees);
        
        if (result.success) {
            localStorage.setItem("userPhone", phone);
            localStorage.setItem("userPassword", password);
            showScreen("main");
            showView("home");
            
            await loadDashboardData();
            hideLoader();
        } else {
            if (isAuto) {
                handleLogout();
            } else {
                alert(result.message || "Логин ёки парол нотўғри!");
                hideLoader();
            }
        }
    } catch (err) {
        console.error("Login Error:", err);
        if (isAuto) {
            handleLogout();
        } else {
            alert("Хатолик юз берди: " + err.message);
            hideLoader();
        }
    }
}




function handleLogout() {
    localStorage.removeItem("userPhone");
    localStorage.removeItem("userPassword");
    
    document.getElementById("phone").value = "";
    document.getElementById("password").value = "";
    
    showScreen("login");
}

/* ==================== NAVIGATION VIEWS ==================== */
function showView(viewName) {
    // Hide everything by default
    document.getElementById("home-menu").style.display = "none";
    document.getElementById("tab-header").style.display = "none";
    document.getElementById("date-filter-bar").style.display = "none";
    document.getElementById("content-scroll-container").style.display = "none";
    
    const headerBlue = document.querySelector(".header-blue");
    if (headerBlue) {
        headerBlue.style.display = "none";
    }

    if (viewName === "home") {
        document.getElementById("home-menu").style.display = "flex";
        if (headerBlue) {
            headerBlue.style.display = "flex";
        }
    } else {
        document.getElementById("tab-header").style.display = "flex";
        document.getElementById("content-scroll-container").style.display = "block";
        
        const titles = {
            "ostatka": "Остаткалар",
            "tovar": "Товарлар рўйхати",
            "savdo": "Савдо кўрсаткичлари",
            "otkaz": "Отказлар рўйхати"
        };
        document.getElementById("tab-header-title").textContent = titles[viewName] || "Рўйхат";
        
        if (viewName === "ostatka" || viewName === "savdo") {
            document.getElementById("date-filter-bar").style.display = "flex";
        }
        
        switchTab(viewName);
    }
}

/* ==================== SWITCH TABS ==================== */
function switchTab(tabId) {
    activeTab = tabId;
    
    // Switch bottom nav selection
    const navItems = document.querySelectorAll(".bottom-nav .nav-item");
    navItems.forEach(item => {
        if (item.getAttribute("data-tab") === tabId) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Switch tab views visibility
    const tabContents = document.querySelectorAll(".content-scroll-container .tab-content");
    tabContents.forEach(content => {
        if (content.id === `tab-content-${tabId}`) {
            content.classList.add("active");
        } else {
            content.classList.remove("active");
        }
    });

    // Render tab specific views if data loaded
    if (dashboardData) {
        if (tabId === "tovar") renderTovarTab();
        else if (tabId === "savdo") renderSavdoTab();
        else if (tabId === "otkaz") renderOtkazTab();
    }
}

function safeJsonParse(str) {
    if (!str) return null;
    let cleaned = String(str).trim();
    if (cleaned.charCodeAt(0) === 0xFEFF) {
        cleaned = cleaned.slice(1);
    }
    cleaned = cleaned.replace(/_РЕШЕТКА_/g, '#');
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON Parse error:", cleaned);
        throw new Error("Сервердан келган жавоб JSON форматида эмас: " + cleaned.substring(0, 100));
    }
}

/* ==================== LOAD MAIN DASHBOARD DATA ==================== */
async function loadDashboardData(section = "") {
    const start = document.getElementById("date-from").value;
    const end = document.getElementById("date-to").value;
    
    showLoader("Маълумотлар юкланмоқда...");
    try {
        let url = `${API_URL}/raxbar_data?start=${start}&end=${end}`;
        if (section) {
            url += `&section=${section}`;
        }
        const response = await fetch(url, {
            headers: {
                "Authorization": getAuthHeader()
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP хатолиги: ${response.status}`);
        }
        
        const rawText = await response.text();
        const json = safeJsonParse(rawText);
        
        const newData = json["#value"] || json;
        dashboardData = Object.assign({}, dashboardData || {}, newData);
        
        // Cache dashboard data
        localStorage.setItem('cachedDashboardData', JSON.stringify(dashboardData));
        
        // Cache employees list if returned from 1C
        if (dashboardData.ХодимларЛисти) {
            localStorage.setItem('employees', JSON.stringify(dashboardData.ХодимларЛисти));
        }
        
        renderDashboard();
        showStatusBanner("Маълумотлар янгиланди", "info");
        hideLoader();
    } catch (err) {
        console.error("Dashboard Load Error:", err);
        const cachedData = localStorage.getItem('cachedDashboardData');
        if (cachedData) {
            try {
                dashboardData = JSON.parse(cachedData);
                renderDashboard();
                showStatusBanner("Серверга уланиш мумкин бўлмади. Кэш маълумотлар кўрсатилаётгани", "warning");
            } catch (parseErr) {
                console.error("Cached Dashboard Parse Error:", parseErr);
                showStatusBanner("Маълумотлар юкланмади. Кэш маълумотлари ҳам мавжуд эмас.", "warning");
            }
        } else {
            showStatusBanner("Серверга уланиш мумкин бўлмади", "warning");
        }
        hideLoader();
    }
}

/* ==================== RENDER MAIN DASHBOARD ==================== */
function renderDashboard() {
    if (!dashboardData) return;

    // Pre-normalize search terms once for instant search
    prepareDataForSearch(dashboardData);

    // Firm name updating
    if (dashboardData.ФирмаНоми) {
        const headerBrandEl = document.getElementById("header-company-name");
        if (headerBrandEl) {
            headerBrandEl.textContent = dashboardData.ФирмаНоми.toUpperCase();
        }
        document.title = "STAR SOFT - " + dashboardData.ФирмаНоми;
    }

    // 1. Balances (Ostatka) Tab Summaries
    document.getElementById("val-supplier-debt").textContent = formatMoney(dashboardData.ТаъминотчиларХакки);
    document.getElementById("val-customer-debt").textContent = formatMoney(dashboardData.ХаридорларКарзи);
    document.getElementById("val-goods-retail").textContent = formatMoney(dashboardData.ОстаткаКиримСумма);
    document.getElementById("val-goods-cost").textContent = "Сотув: " + formatMoney(dashboardData.ОстаткаСотувСумма);

    // New cards: Receipts and Expenses (safely wrapped)
    const valReceiptsTotalEl = document.getElementById("val-receipts-total");
    if (valReceiptsTotalEl) valReceiptsTotalEl.textContent = formatMoney(dashboardData.ТоварКиримиЖами);
    const valExpensesTotalEl = document.getElementById("val-expenses-total");
    if (valExpensesTotalEl) valExpensesTotalEl.textContent = formatMoney(dashboardData.КассаЧикимиЖами);

    // Update sub-desc with document count (safely wrapped)
    const valReceiptsDescEl = document.getElementById("val-receipts-desc");
    if (valReceiptsDescEl) {
        const recCount = (dashboardData.ТоварКиримиРуйхати || []).length;
        valReceiptsDescEl.textContent = recCount + " та ҳужжат";
    }
    const valExpensesDescEl = document.getElementById("val-expenses-desc");
    if (valExpensesDescEl) {
        const expCount = (dashboardData.КассаЧикимиРуйхати || []).length;
        valExpensesDescEl.textContent = expCount + " та ёзув";
    }
    
    let expiringSum = dashboardData.СрокТоварларСумма || 0;
    const expiringCount = dashboardData.СрокТоварлар ? dashboardData.СрокТоварлар.length : 0;
    
    // Агар сервер суммани қайтармаган бўлса — массивдан Сумма ёки СуммаСотув жамлаймиз
    if (!expiringSum && dashboardData.СрокТоварлар && dashboardData.СрокТоварлар.length > 0) {
        // Срок товарлар номлари рўйхати
        const expiringNames = new Set(dashboardData.СрокТоварлар.map(i => i.Товар));
        // ОстаткаларРуйхати дан сотув суммасини оламиз
        if (dashboardData.ОстаткаларРуйхати && dashboardData.ОстаткаларРуйхати.length > 0) {
            expiringSum = dashboardData.ОстаткаларРуйхати
                .filter(i => expiringNames.has(i.Товар))
                .reduce((acc, i) => acc + (Number(i.СуммаСотув) || Number(i.Сумма) || 0), 0);
        }
        // Агар ОстаткаларРуйхати бўш бўлса — СрокТоварлар дан Сумма майдонини жамлаймиз
        if (!expiringSum) {
            expiringSum = dashboardData.СрокТоварлар.reduce((acc, item) => acc + (Number(item.СуммаСотув) || Number(item.Сумма) || 0), 0);
        }
    }
    
    document.getElementById("val-expiring-count").textContent = formatMoney(expiringSum);
    document.getElementById("val-expiring-desc").textContent = `${expiringCount} та товар (180 кундан кам)`;

    // Refresh currently open tab
    switchTab(activeTab);
}

// Populate receipts supplier dropdown
function populateReceiptSuppliersSelect() {
    const sel = document.getElementById("receipts-supplier-select");
    const list = (dashboardData && dashboardData.ТоварКиримиРуйхати) || [];
    const suppliers = [...new Set(list.map(i => (i.Таминотчи || i.Поставщик || '')).filter(Boolean))];
    sel.innerHTML = `<option value="all">Барча таъминотчилар</option>`;
    suppliers.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        sel.appendChild(opt);
    });
    sel.value = activeReceiptSupplier;
}

// Populate expenses group dropdown
function populateExpenseGroupsSelect() {
    const sel = document.getElementById("expenses-group-select");
    const list = (dashboardData && dashboardData.КассаЧикимиРуйхати) || [];
    const groups = [...new Set(list.map(i => i.Группа).filter(Boolean))];
    sel.innerHTML = `<option value="all">Барча гуруҳлар</option>`;
    groups.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g;
        sel.appendChild(opt);
    });
    sel.value = activeExpenseGroup;
}

/* ==================== TOVAR TAB RENDER ==================== */
function renderTovarTab() {
    const container = document.getElementById("tovar-list-results");
    if (!dashboardData || !dashboardData.ОстаткаларРуйхати) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Товарлар мавжуд эмас</div>`;
        return;
    }

    const searchStr = document.getElementById("search-tovar-input").value.trim();
    let filtered = dashboardData.ОстаткаларРуйхати;

    if (searchStr) {
        const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
        filtered = dashboardData.ОстаткаларРуйхати.filter(item => 
            matchSearch(item, searchWords)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Мос товарлар топилмади</div>`;
        return;
    }

    const maxRender = 100;
    const listToRender = filtered.slice(0, maxRender);

    let html = listToRender.map(item => {
        const packSize = Number(item.Шт) || 1;
        const totalQty = Number(item.ОстатокДона) || 0;
        
        let packRetailPrice = Number(item.НархСотув);
        if (isNaN(packRetailPrice) || packRetailPrice === 0) {
            packRetailPrice = totalQty > 0 ? ((Number(item.СуммаСотув) || 0) * packSize) / totalQty : 0;
        }
        
        let packPurchasePrice = Number(item.НархКирим);
        if (isNaN(packPurchasePrice) || packPurchasePrice === 0) {
            packPurchasePrice = totalQty > 0 ? ((Number(item.Сумма) || 0) * packSize) / totalQty : 0;
        }

        return `
        <div class="item-card">
            <div class="item-card-header">
                <span class="item-name">${item.Товар}</span>
                <span class="badge badge-emerald">${formatPacks(item.ОстатокДона, item.Шт)}</span>
            </div>
            <div class="item-card-details">
                <div class="detail-row">
                    <span class="detail-lbl">Сотув Нархи (Почка)</span>
                    <span class="detail-val cyan">${formatMoney(packRetailPrice)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-lbl">Кирим Нархи (Почка)</span>
                    <span class="detail-val">${formatMoney(packPurchasePrice)}</span>
                </div>
                <div class="detail-row" style="grid-column: span 2;">
                    <span class="detail-lbl">Яроқлилик муддати</span>
                    <span class="detail-val ${item.Срок ? 'rose' : ''}">${item.Срок || '—'}</span>
                </div>
            </div>
        </div>
    `;
    }).join('');

    if (filtered.length > maxRender) {
        html += `
            <div style="grid-column: span 2; text-align: center; color: var(--text-secondary); background: rgba(255,255,255,0.03); padding: 14px; border-radius: 12px; font-size: 0.8rem; border: 1px dashed var(--card-border); margin-top: 10px; width: 100%;">
                ⚠️ Яна ${filtered.length - maxRender} та товар бор. Рўйхатни қисқартириш учун қидирув сўзини аниқлаштиринг.
            </div>
        `;
    }

    container.innerHTML = html;
}

/* ==================== OTKAZ TAB RENDER ==================== */
function renderOtkazTab() {
    const container = document.getElementById("otkaz-list-results");
    if (!dashboardData || !dashboardData.Отказлар) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Отказлар мавжуд эмас</div>`;
        return;
    }

    const searchStr = document.getElementById("search-otkaz-input").value.trim();
    let filtered = dashboardData.Отказлар;

    if (searchStr) {
        const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
        filtered = dashboardData.Отказлар.filter(item => {
            if (searchWords.length === 0) return true;
            const normName = item._normName || normalizeForSearch(item.Товары);
            return searchWords.every(word => normName.includes(word));
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Мос отказлар топилмади</div>`;
        return;
    }

    container.innerHTML = filtered.map(item => `
        <div class="item-card">
            <div class="item-card-header">
                <span class="item-name">${item.Товары}</span>
                <span class="badge badge-rose">Норма: ${item.Норма || 0} та</span>
            </div>
            <div class="item-card-details">
                <div class="detail-row">
                    <span class="detail-lbl">Қолдиқ</span>
                    <span class="detail-val rose">${formatPacks(item.Остатка, item.Шт)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-lbl">Ишлаб чиқарувчи (Завод)</span>
                    <span class="detail-val">${item.ИшлабЧикарувчи || '—'}</span>
                </div>
            </div>
        </div>
    `).join('');
}

/* ==================== SAVDO TAB RENDER ==================== */
function renderSavdoTab() {
    if (!dashboardData) return;

    // 1. Render big typography values
    document.getElementById("sales-cash-val").textContent = formatMoney(dashboardData.СавдоНакд);
    document.getElementById("sales-card-val").textContent = formatMoney(dashboardData.СавдоПластик);
    const clickValEl = document.getElementById("sales-click-val");
    if (clickValEl) clickValEl.textContent = formatMoney(dashboardData.СавдоКлик);

    // 2. Minor values
    document.getElementById("sales-total-val").textContent = formatMoney(dashboardData.СавдоСумма);
    document.getElementById("sales-debt-val").textContent = formatMoney(dashboardData.СавдоКарз);
    document.getElementById("sales-profit-val").textContent = formatMoney(dashboardData.СавдоФойда);

    // 3. Rankings list
    renderSalesRankings();
}

function renderSalesRankings() {
    const container = document.getElementById("ranking-list-container");
    if (!dashboardData) return;

    let items = [];

    if (currentRankTab === "rank-top") {
        items = dashboardData.Топ10Сотилган || [];
    } else if (currentRankTab === "rank-bottom") {
        items = dashboardData.Кам10Сотилган || [];
    } else if (currentRankTab === "rank-stock") {
        items = dashboardData.ОстаткасиКатта10 || [];
    }

    if (items.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 20px; font-size: 0.78rem;">Маълумот мавжуд эмас</div>`;
        return;
    }

    container.innerHTML = items.map((item, idx) => {
        let valueStr = formatMoney(item.Сумма || 0);
        let qty = Number(item.Шт) || Number(item.Количество) || Number(item.ОстатокДона) || 0;
        let subStr = "";

        if (currentRankTab === "rank-stock") {
            subStr = `Қолдиқ: ${formatPacks(qty, item.Шт_пачка || 1)}`;
        } else {
            subStr = `Сотилди: ${qty} дона`;
        }

        return `
            <div class="rank-item">
                <span class="rank-item-index">${idx + 1}</span>
                <span class="rank-item-name">${item.Товар || '—'}</span>
                <div class="rank-item-meta">
                    <span class="rank-item-val">${valueStr}</span>
                    <span class="rank-item-sub">${subStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

/* ==================== DRILL-DOWN SUB-LISTS ==================== */
function openSublist(type) {
    sublistType = type;
    document.getElementById("sublist-search-input").value = ""; // Reset search
    
    // Toggle filter bars visibility
    const supTabs = document.getElementById("supplier-tabs-bar");
    const expGrpBar = document.getElementById("expenses-group-bar");
    const sublistDateBar = document.getElementById("sublist-date-filter-bar");

    supTabs.style.display = "none";
    expGrpBar.style.display = "none";
    if (sublistDateBar) {
        sublistDateBar.style.display = "none";
    }

    if (type === "suppliers") {
        supTabs.style.display = "flex";
        activeSupplierFilter = "all";
        document.getElementById("btn-sup-all").classList.add("active");
        document.getElementById("btn-sup-overdue").classList.remove("active");
    } else if (type === "expenses") {
        activeExpenseGroup = "all";
        populateExpenseGroupsSelect();
        expGrpBar.style.display = "flex";
        if (sublistDateBar) {
            sublistDateBar.style.display = "flex";
            document.getElementById("sublist-date-from").value = document.getElementById("date-from").value;
            document.getElementById("sublist-date-to").value = document.getElementById("date-to").value;
        }
    } else if (type === "receipts") {
        if (sublistDateBar) {
            sublistDateBar.style.display = "flex";
            document.getElementById("sublist-date-from").value = document.getElementById("date-from").value;
            document.getElementById("sublist-date-to").value = document.getElementById("date-to").value;
        }
    }

    updateSublistHeader();
    renderSublistItems();
    showScreen("sublist");
}

function updateSublistHeader() {
    const title = document.getElementById("sublist-title");
    
    if (sublistType === "suppliers") {
        title.textContent = "Таъминотчилар ҳақлари";
        
        // Жами ва муддати келган суммаларни ҳисоблаш
        const list = dashboardData.ТаъминотчиларХаккиРуйхати || [];
        const totalSum = list.reduce((acc, i) => acc + (Number(i.Хакки) || 0), 0);
        const overdueSum = list.reduce((acc, i) => acc + (Number(i.МуддатиКелганХакки) || 0), 0);
        
        document.getElementById("count-sup-all").textContent = formatMoney(totalSum);
        document.getElementById("count-sup-overdue").textContent = formatMoney(overdueSum);
    } else if (sublistType === "customers") {
        title.textContent = "Харидорлар қарзлари";
    } else if (sublistType === "goods") {
        title.textContent = "Батафсил товарлар қолдиғи";
    } else if (sublistType === "expiring") {
        title.textContent = "Яроқлилик муддати яқинлар";
    } else if (sublistType === "receipts") {
        let list = dashboardData.ТоварКиримиРуйхати || [];
        const subFrom = document.getElementById("sublist-date-from")?.value;
        const subTo = document.getElementById("sublist-date-to")?.value;
        if (subFrom && subTo) {
            list = list.filter(doc => {
                const docIso = parseDateToIso(doc.Дата);
                return docIso >= subFrom && docIso <= subTo;
            });
        }
        const total = list.reduce((acc, d) => acc + (Number(d.Сумма) || 0), 0);
        title.textContent = `📥 Товар кирими — ${formatMoney(total)}`;
    } else if (sublistType === "expenses") {
        let list = dashboardData.КассаЧикимиРуйхати || [];
        const subFrom = document.getElementById("sublist-date-from")?.value;
        const subTo = document.getElementById("sublist-date-to")?.value;
        if (subFrom && subTo) {
            list = list.filter(item => {
                const itemIso = parseDateToIso(item.Дата);
                return itemIso >= subFrom && itemIso <= subTo;
            });
        }
        const total = list.reduce((acc, item) => acc + (Number(item.Сумма) || 0), 0);
        title.textContent = `💸 Касса чиқими — ${formatMoney(total)}`;
    }

}

function switchSupplierFilter(filter) {
    activeSupplierFilter = filter;
    
    if (filter === "all") {
        document.getElementById("btn-sup-all").classList.add("active");
        document.getElementById("btn-sup-overdue").classList.remove("active");
    } else {
        document.getElementById("btn-sup-all").classList.remove("active");
        document.getElementById("btn-sup-overdue").classList.add("active");
    }
    
    renderSublistItems();
}

function renderSublistItems() {
    const container = document.getElementById("sublist-items-container");
    if (!dashboardData) return;

    const searchStr = document.getElementById("sublist-search-input").value.toLowerCase().trim();
    container.innerHTML = ""; // Clear

    if (sublistType === "suppliers") {
        let list = dashboardData.ТаъминотчиларХаккиРуйхати || [];
        
        // Apply Overdue Tab filter
        if (activeSupplierFilter === "overdue") {
            list = list.filter(item => Number(item.МуддатиКелганХакки) > 0);
        }
        
        // Apply search query filter
        if (searchStr) {
            const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
            list = list.filter(item => {
                if (searchWords.length === 0) return true;
                const normName = normalizeForSearch(item.Поставщик);
                return searchWords.every(word => normName.includes(word));
            });
        }

        if (list.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Таъминотчилар мавжуд эмас</div>`;
            return;
        }

        container.innerHTML = list.map(item => `
            <div class="partner-card" onclick="openSverka('${item.Поставщик}')">
                <div class="partner-info">
                    <span class="partner-name">${toLatin(item.Поставщик)}</span>
                    <span class="partner-phone">${item.Телефон || (currentLang === 'latn' ? 'Telefon kiritilmagan' : 'Телефон киритилмаган')}</span>
                </div>
                <div class="partner-debt-details">
                    <span class="partner-debt-lbl">${currentLang === 'latn' ? 'Jami qarz' : 'Жами қарз'}</span>
                    <span class="partner-val-total" style="color: var(--accent-amber);">${formatMoney(item.Хакки)}</span>
                    ${Number(item.МуддатиКелганХакки) > 0 ? `
                        <span class="partner-val-overdue">${currentLang === 'latn' ? 'Muddati:' : 'Муддати:'} ${formatMoney(item.МуддатиКелганХакки)}</span>
                    ` : ''}
                </div>
            </div>
        `).join('');

    } else if (sublistType === "customers") {
        let list = dashboardData.ХаридорларКарзиРуйхати || [];
        
        if (searchStr) {
            const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
            list = list.filter(item => {
                if (searchWords.length === 0) return true;
                const normName = normalizeForSearch(item.Клиент);
                return searchWords.every(word => normName.includes(word));
            });
        }

        if (list.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">${currentLang === 'latn' ? "Qarzdor xaridorlar mavjud emas" : "Қарздор харидорлар мавжуд эмас"}</div>`;
            return;
        }

        container.innerHTML = list.map(item => `
            <div class="partner-card" onclick="openSverka('${item.Клиент}')">
                <div class="partner-info">
                    <span class="partner-name">${toLatin(item.Клиент)}</span>
                    <span class="partner-phone">${item.Телефон || (currentLang === 'latn' ? 'Telefon kiritilmagan' : 'Телефон киритилмаган')}</span>
                </div>
                <div class="partner-debt-details">
                    <span class="partner-debt-lbl">${currentLang === 'latn' ? 'Olinadigan qarz' : 'Олинадиган қарз'}</span>
                    <span class="partner-val-total" style="color: var(--accent-rose);">${formatMoney(item.Карз)}</span>
                </div>
            </div>
        `).join('');

    } else if (sublistType === "goods") {
        let list = dashboardData.ОстаткаларРуйхати || [];
        
        if (searchStr) {
            const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
            list = list.filter(item => 
                matchSearch(item, searchWords)
            );
        }

        if (list.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">${currentLang === 'latn' ? "Tovarlar topilmadi" : "Товарлар топилмади"}</div>`;
            return;
        }

        const maxRender = 100;
        const listToRender = list.slice(0, maxRender);

        let html = listToRender.map(item => {
            const packSize = Number(item.Шт) || 1;
            const totalQty = Number(item.ОстатокДона) || 0;
            
            let packRetailPrice = Number(item.НархСотув);
            if (isNaN(packRetailPrice) || packRetailPrice === 0) {
                packRetailPrice = totalQty > 0 ? ((Number(item.СуммаСотув) || 0) * packSize) / totalQty : 0;
            }
            
            let packPurchasePrice = Number(item.НархКирим);
            if (isNaN(packPurchasePrice) || packPurchasePrice === 0) {
                packPurchasePrice = totalQty > 0 ? ((Number(item.Сумма) || 0) * packSize) / totalQty : 0;
            }

            return `
            <div class="item-card">
                <div class="item-card-header">
                    <span class="item-name">${toLatin(item.Товар)}</span>
                    <span class="badge badge-emerald">${formatPacks(item.ОстатокДона, item.Шт)}</span>
                </div>
                <div class="item-card-details">
                    <div class="detail-row">
                        <span class="detail-lbl">${currentLang === 'latn' ? 'Sotuv Narxi (Pochka)' : 'Сотув Нархи (Почка)'}</span>
                        <span class="detail-val cyan">${formatMoney(packRetailPrice)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-lbl">${currentLang === 'latn' ? 'Kirim Narxi (Pochka)' : 'Кирим Нархи (Почка)'}</span>
                        <span class="detail-val">${formatMoney(packPurchasePrice)}</span>
                    </div>
                    <div class="detail-row" style="grid-column: span 2;">
                        <span class="detail-lbl">${currentLang === 'latn' ? 'Muddati' : 'Муддати'}</span>
                        <span class="detail-val ${item.Срок ? 'rose' : ''}">${item.Срок || '—'}</span>
                    </div>
                </div>
            </div>
        `;
        }).join('');

        if (list.length > maxRender) {
            html += `
                <div style="grid-column: span 2; text-align: center; color: var(--text-secondary); background: rgba(255,255,255,0.03); padding: 14px; border-radius: 12px; font-size: 0.8rem; border: 1px dashed var(--card-border); margin-top: 10px; width: 100%;">
                    ⚠️ ${currentLang === 'latn' ? `Yana ${list.length - maxRender} ta tovar bor. Ro'yxatni qisqartirish uchun qidiruv so'zini aniqlashtiring.` : `Яна ${list.length - maxRender} та товар бор. Рўйхатни қисқартириш учун қидирув сўзини аниқлаштиринг.`}
                </div>
            `;
        }

        container.innerHTML = html;

    } else if (sublistType === "receipts") {
        // Товар кирими ҳужжатлари рўйхати
        let list = dashboardData.ТоварКиримиРуйхати || [];

        // Filter by date range at top
        const subFrom = document.getElementById("sublist-date-from")?.value;
        const subTo = document.getElementById("sublist-date-to")?.value;
        if (subFrom && subTo) {
            list = list.filter(doc => {
                const docIso = parseDateToIso(doc.Дата);
                return docIso >= subFrom && docIso <= subTo;
            });
        }

        // Filter by search (supplier name)
        if (searchStr) {
            const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
            list = list.filter(doc => {
                const normName = normalizeForSearch((doc.Таминотчи || doc.Поставщик || "") + " " + (doc.Дата || ""));
                return searchWords.every(word => normName.includes(word));
            });
        }


        if (list.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">${currentLang === 'latn' ? "Tovar kirimi mavjud emas" : "Товар кирими мавжуд эмас"}</div>`;
            return;
        }

        // Show document cards — each card opens the detail view on click
        container.innerHTML = list.map((doc, idx) => {
            const docId = doc.ХужжатID || doc.ДокИД || '';
            const supplier = doc.Таминотчи || doc.Поставщик || '—';
            const itemCount = (doc.Сатрлар || doc.Товарлар || []).length;
            return `
            <div class="receipt-doc-card" onclick="openReceiptDetail('${docId}')">
                <div class="receipt-doc-icon">📥</div>
                <div class="receipt-doc-info">
                    <div class="receipt-doc-supplier">${toLatin(supplier)}</div>
                    <div class="receipt-doc-meta">${doc.Дата || ''} &nbsp;•&nbsp; ${itemCount} ${currentLang === 'latn' ? 'ta tovar' : 'та товар'}</div>
                </div>
                <div class="receipt-doc-right">
                    <span class="receipt-doc-sum">${formatMoney(doc.Сумма)}</span>
                    <span class="receipt-doc-arrow">›</span>
                </div>
            </div>`;
        }).join('');


    } else if (sublistType === "expenses") {
        // Касса чиқими рўйхати
        let list = dashboardData.КассаЧикимиРуйхати || [];

        // Filter by date range at top
        const subFrom = document.getElementById("sublist-date-from")?.value;
        const subTo = document.getElementById("sublist-date-to")?.value;
        if (subFrom && subTo) {
            list = list.filter(item => {
                const itemIso = parseDateToIso(item.Дата);
                return itemIso >= subFrom && itemIso <= subTo;
            });
        }


        // Filter by group
        if (activeExpenseGroup !== "all") {
            list = list.filter(item => item.Группа === activeExpenseGroup);
        }

        // Filter by search
        if (searchStr) {
            const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
            list = list.filter(item => {
                const normName = normalizeForSearch(item.Списка + " " + item.Изох + " " + item.Документ);
                return searchWords.every(word => normName.includes(word));
            });
        }

        if (list.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">${currentLang === 'latn' ? "Kassa chiqimi mavjud emas" : "Касса чиқими мавжуд эмас"}</div>`;
            return;
        }

        container.innerHTML = list.map(item => `
            <div class="item-card">
                <div class="item-card-header">
                    <span class="item-name">${toLatin(item.Списка)}</span>
                    <span class="badge badge-rose">${formatMoney(item.Сумма)}</span>
                </div>
                <div class="item-card-details">
                    <div class="detail-row">
                        <span class="detail-lbl">${currentLang === 'latn' ? 'Guruh' : 'Гуруҳ'}</span>
                        <span class="detail-val amber">${toLatin(item.Группа || '—')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-lbl">${currentLang === 'latn' ? 'Sana' : 'Сана'}</span>
                        <span class="detail-val">${item.Дата || '—'}</span>
                    </div>
                    ${item.Изох ? `
                        <div class="detail-row" style="grid-column: span 2;">
                            <span class="detail-lbl">${currentLang === 'latn' ? 'Izoh' : 'Изоҳ'}</span>
                            <span class="detail-val text-muted">${toLatin(item.Изох)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

                </div>
                <div class="item-card-details">
                    <div class="detail-row">
                        <span class="detail-lbl">Гуруҳ</span>
                        <span class="detail-val amber">${item.Группа || '—'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-lbl">Сана</span>
                        <span class="detail-val cyan">${item.Дата}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-lbl">Тўлов тури</span>
                        <span class="detail-val">${item.ТуловТури || '—'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-lbl">Изоҳ</span>
                        <span class="detail-val" style="color: var(--text-secondary);">${item.Изох || '—'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    } else if (sublistType === "expiring") {
        let list = dashboardData.СрокТоварлар || [];
        const expiringDays = getExpiringDays();
        
        // Filter by configured days threshold
        list = list.filter(item => Number(item.ДнейОсталось) <= expiringDays);
        
        // Filter by selected month
        if (expiringMonthFilter !== 'all') {
            list = list.filter(item => {
                if (!item.Срок) return false;
                const month = new Date(item.Срок).getMonth() + 1;
                return month === Number(expiringMonthFilter);
            });
        }
        
        if (searchStr) {
            const searchWords = searchStr.split(/\s+/).map(w => normalizeForSearch(w)).filter(Boolean);
            list = list.filter(item => {
                if (searchWords.length === 0) return true;
                const normName = normalizeForSearch(item.Товар);
                return searchWords.every(word => normName.includes(word));
            });
        }

        if (list.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 40px;">Муддати ўтаётган товарлар йўқ</div>`;
            return;
        }

        container.innerHTML = list.map(item => `
            <div class="item-card">
                <div class="item-card-header">
                    <span class="item-name">${item.Товар}</span>
                    <span class="badge badge-rose">${item.ДнейОсталось} кун қолди</span>
                </div>
                <div class="item-card-details">
                    <div class="detail-row">
                        <span class="detail-lbl">Қолдиқ</span>
                        <span class="detail-val rose">${formatPacks(item.ОстатокДона, item.Шт)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-lbl">Яроқлилик муддати</span>
                        <span class="detail-val amber">${item.Срок || '—'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function filterSublistItems() {
    renderSublistItems();
}

// Open receipt detail screen — shows items inside a specific document
function openReceiptDetail(docId) {
    const list = dashboardData.ТоварКиримиРуйхати || [];
    const doc = list.find(d => d.ДокИД === docId);
    if (!doc) return;

    // Fill header banner
    document.getElementById("receipt-detail-doc-number").textContent = `Ҳужжат № ${doc.Номер}`;
    document.getElementById("receipt-detail-supplier").textContent = doc.Поставщик;
    document.getElementById("receipt-detail-date").textContent = doc.Дата;
    document.getElementById("receipt-detail-sum").textContent = formatMoney(doc.Сумма);
    document.getElementById("receipt-detail-title").textContent = `Товарлар (${(doc.Товарлар || []).length} та)`;

    // Build items table rows
    const items = doc.Товарлар || [];
    const tbody = document.getElementById("receipt-items-tbody");
    tbody.innerHTML = items.map(item => {
        const packStr = item.Почка > 0 ? `${item.Почка} почка` : `${item.Дона || 0} дона`;
        const srokStr = item.Срок ? item.Срок : "—";
        return `
        <tr>
            <td>${item.Ракам}</td>
            <td class="td-name">${item.Товар}</td>
            <td class="td-num">${packStr}</td>
            <td class="td-price">${formatMoney(item.КиримНархи)}</td>
            <td class="td-date">${srokStr}</td>
            <td class="td-mfr">${item.Завод}</td>
        </tr>`;
    }).join('');

    showScreen("receipt-detail");
}

// Set month filter for expiring goods
function setExpiringMonth(btn, month) {
    expiringMonthFilter = month;
    document.querySelectorAll('.month-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderSublistItems();
}

/* ==================== ACT OF RECONCILIATION (AKT SVERKA) ==================== */
function openSverka(partnerName) {
    activePartnerName = partnerName;
    document.getElementById("sverka-client-name").textContent = partnerName;
    
    // Auto default date ranges: Jan 1st of current year to Today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentYear = today.getFullYear();
    const startOfYearStr = `${currentYear}-01-01`;
    document.getElementById("sverka-date-from").value = startOfYearStr;
    document.getElementById("sverka-date-to").value = todayStr;

    loadSverkaData(partnerName);
    showScreen("sverka");
}

async function loadSverkaData(partnerName) {
    const start = document.getElementById("sverka-date-from").value;
    const end = document.getElementById("sverka-date-to").value;

    showLoader("Акт Сверка юкланмоқда...");
    try {
        const response = await fetch(`${API_URL}/raxbar_svierka?start=${start}&end=${end}&client=${encodeURIComponent(partnerName)}`, {
            headers: {
                "Authorization": getAuthHeader()
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP хатолиги: ${response.status}`);
        }

        const rawText = await response.text();
        const data = safeJsonParse(rawText);

        const sverkaData = data["#value"] || data;

        if (sverkaData.status === "success" || !sverkaData.status) {
            renderSverka(sverkaData);
        } else {
            alert("Хатолик юз берди: " + (sverkaData.message || "Хато маълумот олинди"));
        }
        hideLoader();
    } catch (err) {
        console.error("Sverka load error:", err);
        if (!navigator.onLine || err.message.includes("Failed to fetch") || err.message.includes("network") || err.message.includes("NetworkError")) {
            alert("Интернет ишламаяпти!");
        } else {
            alert("Акт Сверкани юклаш имкони бўлмади: " + err.message);
        }
        hideLoader();
    }
}

function renderSverka(sverka) {
    if (!sverka) return;

    const startBal = Number(sverka.НачальныйОстаток) || 0;
    const endBal = Number(sverka.КонечныйОстаток) || 0;
    const turnover = endBal - startBal;

    // Apply formatting to summary boxes
    document.getElementById("sverka-start-bal").textContent = formatMoney(startBal);
    document.getElementById("sverka-start-bal").style.color = startBal > 0 ? "var(--accent-amber)" : (startBal < 0 ? "var(--accent-rose)" : "var(--text-primary)");
    
    document.getElementById("sverka-turnover-bal").textContent = (turnover >= 0 ? "+" : "") + formatMoney(turnover);
    document.getElementById("sverka-turnover-bal").style.color = turnover > 0 ? "var(--accent-emerald)" : (turnover < 0 ? "var(--accent-rose)" : "var(--text-primary)");

    document.getElementById("sverka-end-bal").textContent = formatMoney(endBal);
    document.getElementById("sverka-end-bal").style.color = endBal > 0 ? "var(--accent-amber)" : (endBal < 0 ? "var(--accent-rose)" : "var(--text-primary)");

    const tbody = document.getElementById("sverka-tbody");
    const movements = sverka.Движения || [];

    if (movements.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 40px;">
                    Танланган даврда ҳеч қандай ҳаракатлар мавжуд эмас
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = movements.map(move => {
        const dateStr = move.Дата.split(' ')[0]; // Split time
        const prihod = Number(move.Приход) || 0;
        const rashod = Number(move.Расход) || 0;
        const balance = Number(move.КонечныйОстаток) || 0;

        return `
            <tr>
                <td>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 2px;">
                        <span class="sverka-doc-name">${move.Документ}</span>
                        <span style="font-size: 0.65rem; color: var(--text-secondary); background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-family: monospace; white-space: nowrap;">${dateStr}</span>
                    </div>
                    ${move.Изох ? `<span class="sverka-doc-comment">${move.Изох}</span>` : ''}
                </td>
                <td class="text-right debit-val">${prihod > 0 ? formatMoney(prihod) : '—'}</td>
                <td class="text-right credit-val">${rashod > 0 ? formatMoney(rashod) : '—'}</td>
                <td class="text-right" style="font-weight: 700;">${formatMoney(balance)}</td>
            </tr>
        `;
    }).join('');
}

async function loadFirmName() {
    try {
        const response = await fetch(`${API_URL}/firm_name`, {
            headers: {
                "Authorization": getAuthHeader()
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP хатолиги: ${response.status}`);
        }
        const rawText = await response.text();
        const json = safeJsonParse(rawText);
        const data = json["#value"] || json;
        
        if (data.status === "success" && data.ФирмаНоми) {
            const firmName = data.ФирмаНоми;
            
            // Кириш ойнасидаги "Тизимга хуш келибсиз" матнини 1С даги фирма номига алмаштириш
            const subtitleEl = document.querySelector(".subtitle");
            if (subtitleEl) subtitleEl.textContent = firmName;

            
            // Дашборд тепасидаги фирма номини ҳам янгилаш
            const headerBrandEl = document.getElementById("header-company-name");
            if (headerBrandEl) headerBrandEl.textContent = firmName.toUpperCase();
            
            // Веб-сайт сарлавҳасини (title) янгилаш
            document.title = firmName + " - Раҳбар дашборди";
        }
    } catch (err) {
        console.warn("Фирма номини динамик юклашда хатолик (бу нормал ҳолат, сервер уланмаган бўлиши мумкин):", err);
    }
}

/* ==================== RECEIPT DETAIL VIEW ==================== */
function openReceiptDetail(docId) {
    if (!dashboardData || !dashboardData.ТоварКиримиРуйхати) return;

    const doc = dashboardData.ТоварКиримиРуйхати.find(d =>
        (d.ХужжатID || d.ДокИД || '') === docId
    );
    if (!doc) {
        alert('Ҳужжат топилмади');
        return;
    }

    const supEl = document.getElementById('receipt-detail-supplier');
    if (supEl) supEl.textContent = doc.Таминотчи || doc.Поставщик || '—';
    const dateEl = document.getElementById('receipt-detail-date');
    if (dateEl) dateEl.textContent = doc.Дата || '—';
    const totalEl = document.getElementById('receipt-detail-sum');
    if (totalEl) totalEl.textContent = formatMoney(doc.Сумма);

    const items = doc.Сатрлар || doc.Товарлар || [];
    const tbody = document.getElementById('receipt-items-tbody');
    if (!tbody) { showScreen('receipt-detail'); return; }

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">Товарлар мавжуд эмас</td></tr>`;
    } else {
        tbody.innerHTML = items.map((item, idx) => {
            const qty = Number(item.Микдори) || 0;
            const purchPrice = Number(item.КиримНархи) || 0;
            const sellPrice = Number(item.СотувНархи) || 0;
            const rowSum = qty * purchPrice;
            const packSize = Number(item.Шт) || 1;
            const qtyStr = formatPacks(qty, packSize);
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td style="font-weight:600;">${item.Товар || '—'}</td>
                    <td class="text-right">${qtyStr}</td>
                    <td class="text-right">${formatMoney(purchPrice)}</td>
                    <td class="text-right" style="color:var(--accent-cyan);">${formatMoney(sellPrice)}</td>
                    <td class="text-center">${item.Срок || '—'}</td>
                    <td class="text-right" style="font-weight:700; color:var(--accent-emerald);">${formatMoney(rowSum)}</td>
                </tr>
            `;
        }).join('');
    }

    showScreen('receipt-detail');
}


function closeReceiptDetail() {
    showScreen('sublist');
}

