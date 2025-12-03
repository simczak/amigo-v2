document.addEventListener('DOMContentLoaded', () => {
    // --- Supabase Initialization ---
    let supabase = null;
    if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        try {
            console.log("Initializing Supabase with URL:", CONFIG.SUPABASE_URL);
            supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            console.log("Supabase initialized successfully");
        } catch (e) {
            console.error("Failed to initialize Supabase", e);
        }
    } else {
        console.warn("Supabase configuration missing or invalid. Using local storage only.");
        console.log("CONFIG state:", typeof CONFIG !== 'undefined' ? CONFIG : "undefined");
    }

    // State
    let participants = [];
    let currentPairs = [];
    let currentSlug = null; // Store the current draw's slug
    let restrictions = new Map(); // Map<string, Set<string>>

    // DOM Elements
    const setupView = document.getElementById('setup-view');
    const adminView = document.getElementById('admin-view');
    const revealView = document.getElementById('reveal-view');

    const participantInput = document.getElementById('participant-name');
    const eventNameInput = document.getElementById('event-name');
    const addBtn = document.getElementById('add-btn');
    const participantsList = document.getElementById('participants-list');
    const drawBtn = document.getElementById('draw-btn');
    const circleModeCheckbox = document.getElementById('circle-mode');
    const maxValueInput = document.getElementById('max-value');
    const minValueInput = document.getElementById('min-value');
    const revealDateInput = document.getElementById('reveal-date');

    // Wizard Elements
    const wizardSteps = document.querySelectorAll('.wizard-step');
    const nextStepBtns = document.querySelectorAll('.next-step-btn');
    const prevStepBtns = document.querySelectorAll('.prev-step-btn');

    function showStep(stepId) {
        wizardSteps.forEach(step => {
            if (step.id === stepId) {
                step.classList.add('active');
                step.classList.remove('hidden');
            } else {
                step.classList.remove('active');
                step.classList.add('hidden');
            }
        });
    }

    nextStepBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const nextStepId = btn.getAttribute('data-next');
            showStep(nextStepId);
        });
    });

    prevStepBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const prevStepId = btn.getAttribute('data-prev');
            showStep(prevStepId);
        });
    });

    const resultsList = document.getElementById('results-list');
    const resetBtn = document.getElementById('reset-btn');
    const verifyBtn = document.getElementById('verify-btn');

    const verifyModal = document.getElementById('verify-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const verificationList = document.getElementById('verification-list');

    const giftBoxTrigger = document.getElementById('gift-box-trigger');
    const revealContent = document.getElementById('reveal-content');
    const giverNameDisplay = document.getElementById('giver-name');
    const revealGiverName = document.getElementById('reveal-giver-name');
    const receiverNameDisplay = document.getElementById('receiver-name');
    const displayDate = document.getElementById('display-date');
    const displayValue = document.getElementById('display-value');

    const toast = document.getElementById('toast');
    let toastTimeout = null; // Track toast timeout to prevent overlapping

    // New Elements for URL Display
    const urlDisplay = document.getElementById('url-display');
    const generatedUrlSpan = document.getElementById('generated-url');
    const copyUrlBtn = document.getElementById('copy-url-btn');
    const resetContainer = document.getElementById('reset-container');

    // Restrictions Modal Elements
    const restrictionsModal = document.getElementById('restrictions-modal');
    const restrictionsList = document.getElementById('restrictions-list');
    const saveRestrictionsBtn = document.getElementById('save-restrictions-btn');
    const restrictionGiverName = document.getElementById('restriction-giver-name');
    let currentRestrictionGiver = null;

    const redrawBtn = document.getElementById('redraw-btn');
    let wasRedrawn = false;

    // Tracking Elements
    const trackingView = document.getElementById('tracking-view');
    const trackingBtn = document.getElementById('tracking-btn');
    const backAdminBtn = document.getElementById('back-admin-btn');
    const trackingList = document.getElementById('tracking-list');
    const totalViewsEl = document.getElementById('total-views');
    const totalRevealsEl = document.getElementById('total-reveals');

    // --- Initialization ---
    checkUrlForReveal();

    // --- Event Listeners ---
    addBtn.addEventListener('click', addParticipant);
    participantInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addParticipant();
    });

    drawBtn.addEventListener('click', performDraw);
    resetBtn.addEventListener('click', resetApp);
    verifyBtn.addEventListener('click', verifyResults);

    closeModalBtn.addEventListener('click', () => {
        verifyModal.classList.remove('active');
        if (wasRedrawn) {
            showToast("Links atualizados com o novo sorteio!", "success");
            wasRedrawn = false;
        }
    });

    if (redrawBtn) {
        redrawBtn.addEventListener('click', redraw);
    }

    if (saveRestrictionsBtn) {
        saveRestrictionsBtn.addEventListener('click', saveRestrictions);
    }

    giftBoxTrigger.addEventListener('click', () => {
        giftBoxTrigger.style.display = 'none';
        revealContent.classList.remove('hidden');
        confettiEffect();

        // Log Reveal Event
        const giver = document.getElementById('giver-name').textContent;
        logTrackingEvent(giver, 'reveal');
    });

    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const url = generatedUrlSpan.textContent;
            if (url && url !== '...') {
                navigator.clipboard.writeText(url).then(() => {
                    showToast("Link copiado!", "success", copyUrlBtn);
                    copyUrlBtn.classList.add('copied');
                    setTimeout(() => copyUrlBtn.classList.remove('copied'), 600);
                });
            }
        });
    }

    if (trackingBtn) {
        trackingBtn.addEventListener('click', async () => {
            adminView.classList.remove('active');
            adminView.classList.add('hidden');

            // Hide external elements
            if (urlDisplay) urlDisplay.classList.add('hidden');
            if (resetContainer) resetContainer.classList.add('hidden');

            trackingView.classList.remove('hidden');
            trackingView.classList.add('active');
            await renderTrackingView();
        });
    }

    if (backAdminBtn) {
        backAdminBtn.addEventListener('click', () => {
            trackingView.classList.remove('active');
            trackingView.classList.add('hidden');

            adminView.classList.remove('hidden');
            adminView.classList.add('active');

            // Restore external elements
            if (urlDisplay) urlDisplay.classList.remove('hidden');
            if (resetContainer) resetContainer.classList.remove('hidden');
        });
    }

    // --- Core Functions ---

    async function checkUrlForReveal() {
        const urlParams = new URLSearchParams(window.location.search);
        const dataParam = urlParams.get('data');
        const idParam = urlParams.get('id'); // Friendly Slug
        const userParam = urlParams.get('u'); // User for individual link (Secret ID or Slug)
        const adminParam = urlParams.get('admin'); // Admin Token

        const loadingView = document.getElementById('loading-view');

        // Helper to switch views
        const showView = (viewId) => {
            loadingView.classList.remove('active');
            loadingView.style.display = 'none'; // Ensure it's hidden

            if (viewId === 'setup-view') {
                setupView.classList.add('active');
            } else if (viewId === 'admin-view') {
                adminView.classList.remove('hidden');
                adminView.classList.add('active'); // Ensure active class if used
            } else if (viewId === 'reveal-view') {
                revealView.classList.remove('hidden');
            }
        };

        // If no parameters, go straight to setup
        if (!dataParam && !idParam) {
            showView('setup-view');
            return;
        }

        // Case 1: Legacy URL (base64 data) - REMOVED
        if (dataParam) {
            showToast("Links antigos não são mais suportados nesta versão.");
            showView('setup-view');
            return;
        }

        // Case 2: Friendly URL (Supabase)
        if (idParam) {
            // SECURITY FIX: If only ID is present (no admin, no user), do NOT load data.
            // This prevents users from accidentally editing an existing draw or seeing its config.
            if (!adminParam && !userParam) {
                // Just show setup view as if it were a new draw, but maybe clear the URL to avoid confusion?
                // Or just return.
                console.log("ID present but no access token. Treating as new session.");

                // Optional: Clear URL to remove the ID so it looks like a fresh start
                const url = new URL(window.location.href);
                url.searchParams.delete('id');
                window.history.replaceState({}, '', url);

                showView('setup-view');
                return;
            }

            if (!supabase) {
                showToast("Erro de conexão com o banco de dados.");
                showView('setup-view');
                return;
            }

            try {
                // Fetch draw data
                const { data: draw, error } = await supabase
                    .from('draws_v2')
                    .select('*')
                    .eq('slug', idParam)
                    .single();

                if (error || !draw) {
                    console.error("Draw not found", error);
                    showToast("Sorteio não encontrado.");
                    showView('setup-view');
                    return;
                }

                // Only load data if we have a valid token (Admin or User)
                // Actually, we need to load it to verify the token, BUT we shouldn't populate the global state
                // unless the token is valid.

                // However, the logic below splits into "if adminParam" and "if userParam".
                // The issue is that we were populating `participants` and `currentPairs` BEFORE checking the token.

                // Let's move the population logic INSIDE the valid blocks.

                if (adminParam) {
                    // Admin View
                    if (adminParam === draw.admin_token) {
                        // Valid Admin
                        currentPairs = draw.pairs;
                        participants = draw.participants;
                        currentSlug = draw.slug;

                        // Restore settings
                        if (draw.settings) {
                            if (draw.settings.maxValue) maxValueInput.value = draw.settings.maxValue;
                            if (draw.settings.revealDate) revealDateInput.value = draw.settings.revealDate;
                            if (draw.settings.eventName) {
                                eventNameInput.value = draw.settings.eventName;
                                document.title = draw.settings.eventName;
                            }
                        }

                        renderResults();
                        generateMasterLink(adminParam);
                        showView('admin-view');
                    } else {
                        showToast("Acesso negado. Token inválido.");
                        showView('setup-view');
                    }
                } else if (userParam) {
                    // Reveal View
                    // We need pairs to find the user
                    currentPairs = draw.pairs;
                    // We don't necessarily need to populate global participants or settings for the reveal view
                    // but it doesn't hurt as long as we don't show the setup view.

                    const pair = currentPairs.find(p => {
                        const slug = GameLogic.generateSlug(p.giver);
                        const matchSecret = p.secretId === userParam;
                        const matchSlug = slug === userParam;
                        return matchSecret || matchSlug;
                    });

                    if (pair) {
                        const revealData = {
                            g: pair.giver,
                            r: pair.receiver,
                            v: draw.settings ? draw.settings.maxValue : '',
                            min: draw.settings ? draw.settings.minValue : '',
                            d: draw.settings ? draw.settings.revealDate : ''
                        };
                        showRevealView(revealData);
                        showView('reveal-view');
                        logTrackingEvent(pair.giver, 'view');
                    } else {
                        showToast("Participante não encontrado neste sorteio.");
                        showView('setup-view');
                    }
                }

            } catch (e) {
                console.error("Error fetching draw", e);
                showToast("Erro ao carregar sorteio.");
                showView('setup-view');
            }
        }
    }






    // ... (rest of functions) ...



    function openRestrictionsModal(giverName) {
        currentRestrictionGiver = giverName;
        restrictionGiverName.textContent = giverName;
        restrictionsList.innerHTML = '';

        const currentRestricted = restrictions.get(giverName) || new Set();

        participants.forEach(p => {
            if (p === giverName) return; // Can't restrict self

            const li = document.createElement('li');
            li.className = 'participant-item';
            li.style.cursor = 'pointer';

            const isChecked = currentRestricted.has(p) ? 'checked' : '';

            li.innerHTML = `
                <label style="display: flex; align-items: center; width: 100%; cursor: pointer; padding: 5px 0;">
                    <input type="checkbox" value="${p}" ${isChecked} style="margin-right: 10px; width: 20px; height: 20px; accent-color: var(--primary-color);">
                    <span>${p}</span>
                </label>
            `;
            restrictionsList.appendChild(li);
        });

        restrictionsModal.classList.add('active');
    }

    function saveRestrictions() {
        if (!currentRestrictionGiver) return;

        const checkboxes = restrictionsList.querySelectorAll('input[type="checkbox"]');
        const restrictedSet = new Set();

        checkboxes.forEach(cb => {
            if (cb.checked) {
                restrictedSet.add(cb.value);
            }
        });

        if (restrictedSet.size > 0) {
            restrictions.set(currentRestrictionGiver, restrictedSet);
        } else {
            restrictions.delete(currentRestrictionGiver);
        }

        restrictionsModal.classList.remove('active');
        renderParticipants();
    }

    async function checkIfAnyRevealed() {
        if (!supabase || !currentSlug) return false;

        try {
            const { count, error } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('draw_slug', currentSlug)
                .eq('action', 'reveal');

            if (error) {
                console.error("Error checking reveals", error);
                return false; // Fail safe: allow redraw if check fails? Or block? Let's allow but log.
            }

            return count > 0;
        } catch (e) {
            console.error("Exception checking reveals", e);
            return false;
        }
    }

    async function redraw() {
        if (participants.length < 3) return;

        // Check if anyone has already revealed
        const hasReveals = await checkIfAnyRevealed();
        if (hasReveals) {
            showToast("Não é possível resortear: Alguém já revelou o amigo secreto!", "error");
            return;
        }

        // Use GameLogic to perform the draw
        const restrictionsObj = {};
        restrictions.forEach((set, key) => {
            restrictionsObj[key] = Array.from(set);
        });

        const result = GameLogic.performDrawLogic(participants, circleModeCheckbox.checked, restrictionsObj);

        if (!result.success) {
            showToast(result.error, "error");
            return;
        }

        currentPairs = result.pairs;
        wasRedrawn = true;

        // Update UI (Main Results List - Always Participant Order)
        renderResults();

        // Update Verification List in Modal (Respects Circle Mode)
        verifyResults(false); // Pass false to not toggle modal visibility if already open

        // Save new results to Supabase (updates the existing slug if possible, or creates new)
        // Pass current admin token to maintain the same URL
        const urlParams = new URLSearchParams(window.location.search);
        const currentAdminToken = urlParams.get('admin');
        await generateMasterLink(currentAdminToken, true); // true = force update

        showToast("Sorteio refeito com sucesso!", "success");
    }

    async function saveToHistory(url, count, slug = null, drawData = null, forceUpdate = false) {
        console.log("Attempting to save draw to history...", { url, count, slug, forceUpdate });
        const timestamp = new Date().toISOString();

        // 1. Save to LocalStorage (Always do this as backup)
        try {
            const history = JSON.parse(localStorage.getItem('amigoSecretoHistory') || '[]');
            // If updating, remove old entry with same slug if exists
            let newHistory = history;
            if (forceUpdate && slug) {
                newHistory = history.filter(item => item.slug !== slug);
            }

            const newItem = {
                id: Date.now(),
                date: timestamp,
                participants: count,
                url: url,
                slug: slug // Store slug locally too if available
            };
            newHistory.unshift(newItem); // Add to beginning
            localStorage.setItem('amigoSecretoHistory', JSON.stringify(newHistory));
            console.log("Saved to LocalStorage");
        } catch (e) {
            console.error("Failed to save local history", e);
        }

        // 2. Try Supabase
        if (supabase) {
            try {
                console.log("Saving to Supabase 'draws' table...");

                const payload = {
                    slug: slug,
                    admin_token: drawData.adminToken,
                    participants: drawData.participants,
                    pairs: drawData.pairs,
                    settings: {
                        maxValue: drawData.maxValue,
                        minValue: drawData.minValue,
                        revealDate: drawData.revealDate,
                        eventName: drawData.eventName
                    },
                    // url: url, // Not strictly needed in DB if we have slug, but can keep if column exists. 
                    // New schema doesn't have 'url' column? Let's check schema_v2.sql.
                    // Schema v2: id, slug, admin_token, participants, pairs, settings, created_at.
                    // So we should NOT send 'url' or 'participants_count' unless we add them to schema.
                    // Let's stick to schema v2.
                };

                let query;
                if (forceUpdate && slug) {
                    // Update existing row
                    console.log("Updating existing row for slug:", slug);
                    query = supabase
                        .from('draws_v2')
                        .update(payload)
                        .eq('slug', slug)
                        .select(); // IMPORTANT: Select to return the updated data and verify it worked
                } else {
                    // Insert new row
                    query = supabase
                        .from('draws_v2')
                        .insert([payload])
                        .select(); // Select to return data
                }

                const { data, error } = await query;

                if (error) {
                    console.error("Supabase save ERROR:", error);
                    let msg = "Erro ao salvar no histórico online.";
                    showToast(msg, "error");
                    return { success: false, code: error.code, error: error };
                } else {
                    // Check if update actually happened (for update case)
                    if (data && data.length === 0) {
                        console.error("Supabase save WARNING: No rows affected.");
                        return { success: false, error: "No rows updated." };
                    }

                    console.log("Supabase save SUCCESS:", data);
                    return { success: true, data: data };
                }
            } catch (e) {
                console.error("Supabase save EXCEPTION:", e);
                return { success: false, error: e };
            }
        } else {
            showToast("Erro: Conexão com banco de dados necessária.", "error");
            return { success: false, error: "No Supabase connection" };
        }
    }

    function restoreAdminView(data) {
        setupView.classList.remove('active');
        setupView.classList.add('hidden');
        revealView.classList.remove('active');
        revealView.classList.add('hidden');

        adminView.classList.add('active');
        adminView.classList.remove('hidden');

        // Restore state
        currentPairs = data.pairs;
        maxValueInput.value = data.maxValue || '';
        minValueInput.value = data.minValue || '';
        revealDateInput.value = data.revealDate || '';

        // Render results
        renderResults();
        updateIndividualLinks();

        // Show master link again
        if (urlDisplay) {
            urlDisplay.classList.remove('hidden');
            // If we have a slug, show the friendly URL, otherwise show current URL
            if (currentSlug) {
                const baseUrl = window.location.href.split('?')[0];
                generatedUrlSpan.textContent = `${baseUrl}?id=${currentSlug}`;
                // Add admin token if available in data
                if (data.adminToken) {
                    generatedUrlSpan.textContent += `&admin=${data.adminToken}`;
                }
            } else {
                generatedUrlSpan.textContent = window.location.href;
            }
        }

        if (resetContainer) resetContainer.classList.remove('hidden');
    }

    function showRevealView(data) {
        setupView.classList.remove('active');
        setupView.classList.add('hidden');
        adminView.classList.remove('active');
        adminView.classList.add('hidden');

        revealView.classList.add('active');
        revealView.classList.remove('hidden');

        // Ensure content is hidden initially
        revealContent.classList.add('hidden');
        giftBoxTrigger.style.display = 'flex'; // Restore gift box

        giverNameDisplay.textContent = data.g; // giver
        if (revealGiverName) revealGiverName.textContent = data.g; // Show name on box screen
        receiverNameDisplay.textContent = data.r; // receiver

        if (data.d) {
            const [year, month, day] = data.d.split('-');
            displayDate.textContent = `${day}/${month}/${year}`;
        } else {
            displayDate.textContent = "Data não definida";
        }

        let valueText = '';
        if (data.min && data.v) {
            valueText = `R$ ${data.min} - R$ ${data.v}`;
        } else if (data.v) {
            valueText = `Max: R$ ${data.v}`;
        } else if (data.min) {
            valueText = `Min: R$ ${data.min}`;
        } else {
            valueText = "Valor livre";
        }
        displayValue.textContent = valueText;
    }

    function addParticipant() {
        const name = participantInput.value.trim();
        if (!name) return;

        if (participants.includes(name)) {
            showToast("Nome já adicionado!", "error");
            return;
        }

        participants.push(name);
        renderParticipants();
        participantInput.value = '';
        participantInput.focus();
        updateDrawButton();
    }

    function removeParticipant(name) {
        participants = participants.filter(p => p !== name);
        renderParticipants();
        updateDrawButton();
    }

    function renderParticipants() {
        participantsList.innerHTML = '';
        participants.forEach((name, index) => {
            const li = document.createElement('li');
            li.className = 'participant-item';

            // Check if has restrictions to show indicator
            const hasRestrictions = restrictions.has(name) && restrictions.get(name).size > 0;
            const restrictionClass = hasRestrictions ? 'text-danger' : 'text-muted';
            const restrictionIcon = hasRestrictions ? 'fa-ban' : 'fa-ban'; // Can change icon if needed

            li.innerHTML = `
                <div style="display: flex; flex-direction: column; flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="color: var(--text-muted); font-size: 0.9em;">${index + 1}.</span>
                        <strong>${name}</strong>
                    </div>
                    ${hasRestrictions ? `<small style="color: var(--accent-color); margin-left: 25px; font-size: 0.8em;">🚫 Não tira: ${Array.from(restrictions.get(name)).join(', ')}</small>` : ''}
                </div>
                <div class="action-buttons" style="display: flex; gap: 5px;">
                    <button class="btn-icon restriction-btn" title="Restrições (Quem não pode tirar)">
                        <i class="fas ${restrictionIcon} ${restrictionClass}"></i>
                    </button>
                    <button class="btn-icon remove-btn" title="Remover">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            li.querySelector('.restriction-btn').addEventListener('click', () => openRestrictionsModal(name));
            li.querySelector('.remove-btn').addEventListener('click', () => removeParticipant(name));
            participantsList.appendChild(li);
        });
    }

    function updateDrawButton() {
        drawBtn.disabled = participants.length < 3;
        if (participants.length < 3) {
            drawBtn.textContent = `Mínimo 3 participantes (${participants.length}/3)`;
        } else {
            drawBtn.textContent = "Realizar Sorteio";
        }
    }

    function performDraw() {
        if (participants.length < 3) return;

        // Use GameLogic to perform the draw
        const restrictionsObj = {};
        restrictions.forEach((set, key) => {
            restrictionsObj[key] = Array.from(set);
        });

        const result = GameLogic.performDrawLogic(participants, circleModeCheckbox.checked, restrictionsObj);

        if (!result.success) {
            showToast(result.error, "error");
            return;
        }

        currentPairs = result.pairs;

        renderResults();
        setupView.classList.remove('active');
        setupView.classList.add('hidden');
        adminView.classList.add('active');
        adminView.classList.remove('hidden');

        if (eventNameInput.value.trim()) {
            document.title = eventNameInput.value.trim();
        } else {
            document.title = "Amigo Secreto - Sorteio Realizado";
        }

        if (resetContainer) resetContainer.classList.remove('hidden');

        // Generate Master Link (and save to Supabase)
        generateMasterLink();
    }

    function renderResults() {
        resultsList.innerHTML = '';

        // Sort pairs based on the original participants order
        const sortedPairs = [...currentPairs].sort((a, b) => {
            return participants.indexOf(a.giver) - participants.indexOf(b.giver);
        });

        sortedPairs.forEach((pair, index) => {
            const li = document.createElement('li');
            li.className = 'result-item';

            li.innerHTML = `
                <div class="result-info" data-giver="${pair.giver}">
                    <strong><span style="color: var(--text-muted); margin-right: 5px;">${index + 1}.</span> ${pair.giver}</strong>
                    <small style="margin-top: 4px;">Pegou: ???</small>
                </div>
                <div class="result-actions">
                    <button class="action-btn btn-copy">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn btn-whatsapp">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            `;
            resultsList.appendChild(li);
        });
    }

    // --- Friendly URL Helpers ---

    async function generateMasterLink(existingAdminToken = null, forceUpdate = false) {
        if (!urlDisplay) return;

        const adminToken = existingAdminToken || GameLogic.generateSecretId(); // Use existing or generate new

        const masterData = {
            master: true,
            pairs: currentPairs,
            participants: participants, // Save original participants list
            maxValue: maxValueInput.value,
            minValue: minValueInput.value,
            revealDate: revealDateInput.value,
            eventName: eventNameInput.value, // Save event name
            adminToken: adminToken // Save token in data
        };

        // --- UI UPDATE: Show Loading State Immediately ---
        const urlLoading = document.getElementById('url-loading');
        const urlContent = document.getElementById('url-content');

        urlDisplay.classList.remove('hidden');
        if (urlLoading) urlLoading.classList.remove('hidden');
        if (urlContent) urlContent.classList.add('hidden');
        generatedUrlSpan.textContent = '...';
        // -------------------------------------------------

        // Default to legacy encoding if Supabase is down
        let fullUrl = '';
        let slug = null;
        let saveSuccess = false;

        if (supabase && participants.length > 0) {
            // If we already have a slug and an existing token, we don't need to save again unless we want to update
            // For this fix, if existingAdminToken is provided, we assume we are just restoring the view.
            if (existingAdminToken && currentSlug && !forceUpdate) {
                const baseUrl = window.location.href.split('?')[0];
                fullUrl = `${baseUrl}?id=${currentSlug}&admin=${adminToken}`;
                saveSuccess = true; // Treat as success since we are just restoring
                slug = currentSlug;
            } else if (existingAdminToken && currentSlug && forceUpdate) {
                // Force Update Case
                const baseUrl = window.location.href.split('?')[0];
                fullUrl = `${baseUrl}?id=${currentSlug}&admin=${adminToken}`;
                slug = currentSlug;

                const result = await saveToHistory(fullUrl, currentPairs.length, slug, masterData, true);
                if (result.success) {
                    saveSuccess = true;
                } else {
                    console.warn("Failed to update existing draw", result.error);
                }
            } else {
                // Retry logic for slug generation and saving
                let attempts = 0;
                while (!saveSuccess && attempts < 3) {
                    attempts++;
                    // Generate Friendly Slug
                    let baseSlugName = "sorteio";

                    if (eventNameInput && eventNameInput.value.trim()) {
                        baseSlugName = eventNameInput.value.trim();
                    } else if (participants.length > 0) {
                        // Fallback to first participant if no name provided (or "sorteio" if user prefers anonymity, but let's stick to requested behavior)
                        // User asked: "não pode ter o nome do primeiro participante".
                        // So if NO name is provided, we should use a generic name.
                        baseSlugName = "amigo-secreto";
                    }

                    slug = await getUniqueSlug(baseSlugName); // This now includes a DB check

                    if (slug) {
                        currentSlug = slug;
                        const baseUrl = window.location.href.split('?')[0];
                        fullUrl = `${baseUrl}?id=${slug}&admin=${adminToken}`;

                        // Save full data to Supabase
                        const result = await saveToHistory(fullUrl, currentPairs.length, slug, masterData);
                        if (result.success) {
                            saveSuccess = true;
                        } else {
                            console.warn(`Failed to save with slug ${slug}, retrying...`, result.error);
                            slug = null; // Reset slug to try again
                        }
                    } else {
                        break; // If getUniqueSlug fails to return anything, stop trying
                    }
                }
            }
        }

        if (saveSuccess && slug) {
            // Success with Supabase
            // fullUrl is already set
        } else {
            // Fallback FAILED
            console.error("Failed to save to Supabase and Legacy fallback is disabled.");
            showToast("Erro ao criar sorteio. Tente novamente.", "error");
            if (urlLoading) urlLoading.classList.add('hidden');
            return;
        }

        // --- UI UPDATE: Show Result ---
        generatedUrlSpan.textContent = fullUrl;
        if (urlLoading) urlLoading.classList.add('hidden');
        if (urlContent) urlContent.classList.remove('hidden');
        // ------------------------------

        // Automatically update the browser URL so it's saved in history
        window.history.pushState({ path: fullUrl }, '', fullUrl);

        // Update individual links now that we have the slug (or not)
        updateIndividualLinks();

        // Update Copy Button for Admin Link
        if (copyUrlBtn) {
            // Remove old listeners to avoid duplicates (simple clone replacement)
            const newCopyBtn = copyUrlBtn.cloneNode(true);
            copyUrlBtn.parentNode.replaceChild(newCopyBtn, copyUrlBtn);

            newCopyBtn.addEventListener('click', () => {
                const url = generatedUrlSpan.textContent;
                if (url && url !== '...') {
                    navigator.clipboard.writeText(url).then(() => {
                        showToast("Copiado, não compartilhe esse link, pois ele revela todo o resultado do sorteio.", "warning", newCopyBtn, 4000);
                        newCopyBtn.classList.add('copied');
                        setTimeout(() => newCopyBtn.classList.remove('copied'), 600);
                    });
                }
            });
        }
    }

    function updateIndividualLinks() {
        const items = resultsList.querySelectorAll('.result-item');
        const maxValue = maxValueInput.value;
        const revealDate = revealDateInput.value;
        const baseUrl = window.location.href.split('?')[0]; // Clean URL

        items.forEach((item) => {
            const giverName = item.querySelector('.result-info').dataset.giver;
            const pair = currentPairs.find(p => p.giver === giverName);

            if (!pair) return;

            let link = '';

            if (currentSlug && pair.secretId) {
                // Secure Friendly Link: ?id=slug&u=secretId
                link = `${baseUrl}?id=${currentSlug}&u=${pair.secretId}`;
            } else if (currentSlug) {
                // Fallback for old draws without secretId (shouldn't happen for new ones)
                const userSlug = GameLogic.generateSlug(pair.giver);
                link = `${baseUrl}?id=${currentSlug}&u=${userSlug}`;
            } else {
                // Legacy Link: ?data=base64 - REMOVED
                link = '#error-no-slug';
            }

            const copyBtn = item.querySelector('.btn-copy');
            const whatsappBtn = item.querySelector('.btn-whatsapp');

            // Remove old listeners (cloning is a quick way)
            const newCopyBtn = copyBtn.cloneNode(true);
            const newWhatsappBtn = whatsappBtn.cloneNode(true);

            // Add test hook
            newCopyBtn.setAttribute('data-test-link', link);

            copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
            whatsappBtn.parentNode.replaceChild(newWhatsappBtn, whatsappBtn);

            newCopyBtn.onclick = () => {
                navigator.clipboard.writeText(link).then(() => {
                    showToast("Link copiado!", "success", newCopyBtn);
                    newCopyBtn.classList.add('copied');
                    setTimeout(() => newCopyBtn.classList.remove('copied'), 600);
                });
            };

            newWhatsappBtn.onclick = () => {
                const text = `Olá *${pair.giver}*!%0A%0ASeu amigo secreto já foi sorteado.%0A%0AVeja quem você tirou aqui:%0A${link}`;
                window.open(`https://wa.me/?text=${text}`, '_blank');
            };
        });
    }

    function verifyResults(openModal = true) {
        verificationList.innerHTML = '';
        let displayPairs = [...currentPairs];

        if (circleModeCheckbox.checked && displayPairs.length > 0) {
            // Circle Mode: Sort A->B, B->C, C->A
            const ordered = [];
            // Find the pair starting with the first participant (or just the first pair's giver)
            // To make it look nice, let's try to start with the first participant in the list if possible
            let startGiver = participants[0];
            let current = displayPairs.find(p => p.giver === startGiver) || displayPairs[0];

            if (current) {
                ordered.push(current);
                for (let i = 1; i < displayPairs.length; i++) {
                    const next = displayPairs.find(p => p.giver === current.receiver);
                    if (next) {
                        ordered.push(next);
                        current = next;
                    }
                }
                displayPairs = ordered;
            }
        } else {
            // Random Mode: Sort by Registration Order (Participant Index)
            displayPairs.sort((a, b) => {
                return participants.indexOf(a.giver) - participants.indexOf(b.giver);
            });
        }

        // Create a consistent color map for participants
        const colorMap = new Map();
        const colors = ['text-color-0', 'text-color-1', 'text-color-2', 'text-color-3', 'text-color-4'];

        // Assign colors based on name hash/index from original list to ensure consistency
        participants.forEach((name, index) => {
            colorMap.set(name, colors[index % colors.length]);
        });

        displayPairs.forEach((pair) => {
            const li = document.createElement('li');
            li.className = 'verification-item';

            // Get consistent color for each person
            const giverColor = colorMap.get(pair.giver) || 'text-color-0';
            const receiverColor = colorMap.get(pair.receiver) || 'text-color-0';

            li.innerHTML = `
                <span class="${giverColor}"><strong>${pair.giver}</strong></span>
                <i class="fas fa-arrow-right verification-arrow"></i>
                <span class="${receiverColor}"><strong>${pair.receiver}</strong></span>
            `;
            verificationList.appendChild(li);
        });

        if (openModal) {
            verifyModal.classList.add('active');
        }
    }

    function resetApp() {
        if (!confirm("Tem certeza que deseja apagar tudo e recomeçar? O sorteio atual será perdido.")) return;

        participants = [];
        currentPairs = [];
        currentSlug = null;
        restrictions.clear();
        renderParticipants();
        participantInput.value = '';
        maxValueInput.value = '';
        minValueInput.value = '';
        revealDateInput.value = '';
        eventNameInput.value = '';
        circleModeCheckbox.checked = false;

        // Clear lists
        resultsList.innerHTML = '';
        verificationList.innerHTML = '';

        // Reset Wizard
        showStep('step-1');

        adminView.classList.remove('active');
        adminView.classList.add('hidden');
        setupView.classList.add('active');
        setupView.classList.remove('hidden');

        if (urlDisplay) urlDisplay.classList.add('hidden');
        if (resetContainer) resetContainer.classList.add('hidden');

        const url = new URL(window.location.href);
        url.searchParams.delete('data');
        url.searchParams.delete('id');
        url.searchParams.delete('u');
        url.searchParams.delete('admin');
        window.history.replaceState({}, '', url);

        document.title = "Amigo Secreto Premium";
    }

    function showToast(msg, type = 'success', targetEl = null, duration = 2000) {
        // Clear any existing timeout to prevent overlapping toasts
        if (toastTimeout) {
            clearTimeout(toastTimeout);
            toast.classList.remove('show', 'hide');
        }

        toast.textContent = msg;
        toast.className = 'toast show';

        if (type === 'error') {
            toast.classList.add('error');
        } else if (type === 'warning') {
            toast.classList.add('warning'); // Add warning class support if needed, or just default style
            // Ensure warning style is handled in CSS if 'warning' class is used, 
            // otherwise it might just default. For now, let's assume 'success' or 'error' are main ones,
            // but since we passed 'warning' in the previous step, we should handle it or map it.
            // Let's just keep the class add logic simple.
        } else {
            toast.classList.add('success');
        }

        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();

            // Position above the button using viewport coordinates (fixed positioning)
            const topPos = Math.max(10, rect.top - 60);

            toast.style.position = 'fixed';
            toast.style.top = topPos + 'px';
            toast.style.left = (rect.left + (rect.width / 2)) + 'px';
            toast.style.bottom = 'auto';
        } else {
            // Fallback to center bottom
            toast.style.position = 'fixed';
            toast.style.left = '50%';
            toast.style.bottom = '30px';
            toast.style.top = 'auto';
        }

        // Hide toast after duration with slide-out animation
        toastTimeout = setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => {
                toast.classList.remove('show', 'hide');
                toastTimeout = null;
            }, 300); // Match animation duration
        }, duration);
    }

    function confettiEffect() {
        const colors = ['#8b5cf6', '#f43f5e', '#3b82f6', '#10b981', '#fbbf24'];

        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'fixed';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = '-10px';
            confetti.style.width = '10px';
            confetti.style.height = '10px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.zIndex = '1000';
            confetti.style.animation = `fall ${Math.random() * 3 + 2}s linear forwards`;
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 5000);
        }

        if (!document.getElementById('confetti-style')) {
            const style = document.createElement('style');
            style.id = 'confetti-style';
            style.innerHTML = `
                @keyframes fall {
                    to { transform: translateY(100vh) rotate(720deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    async function getUniqueSlug(baseName) {
        let slug = GameLogic.generateSlug(baseName);
        let unique = false;
        let counter = 0;

        while (!unique) {
            const checkSlug = counter === 0 ? slug : `${slug}-${counter}`;

            // Create a promise that rejects after 5 seconds
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)
            );

            try {
                const { data, error } = await Promise.race([
                    supabase
                        .from('draws_v2')
                        .select('slug')
                        .eq('slug', checkSlug)
                        .maybeSingle(),
                    timeout
                ]);

                if (error) {
                    console.error("Error checking slug uniqueness", error);
                    // Fallback to random if DB error
                    return `${slug}-${GameLogic.generateSecretId()}`;
                }

                if (!data) {
                    unique = true;
                    return checkSlug;
                }
            } catch (e) {
                console.error("Slug check timed out or failed", e);
                // Fallback to random suffix on timeout
                return `${slug}-${GameLogic.generateSecretId()}`;
            }
            counter++;
        }
    }

    // Helper for encoding/decoding data
    function encodeData(obj) {
        const str = JSON.stringify(obj);
        // Use Base64 for simple encoding (not encryption, but hides text)
        return btoa(encodeURIComponent(str));
    }

    function decodeData(str) {
        const decodedStr = decodeURIComponent(atob(str));
        return JSON.parse(decodedStr);
    }
    // --- Tracking Functions ---

    async function logTrackingEvent(participantName, action) {
        if (!supabase || !currentSlug) return;

        try {
            await supabase
                .from('tracking_events')
                .insert([{
                    draw_slug: currentSlug,
                    participant: participantName,
                    action: action
                }]);
        } catch (e) {
            console.error("Failed to log tracking event", e);
        }
    }

    async function renderTrackingView() {
        if (!supabase || !currentSlug) return;

        trackingList.innerHTML = '<div class="loader" style="margin: 20px auto;"></div>';

        try {
            const { data, error } = await supabase
                .from('tracking_events')
                .select('*')
                .eq('draw_slug', currentSlug)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Process Data
            const stats = {}; // { name: { views: [], reveals: [] } }
            let uniqueViewCount = 0;
            let uniqueRevealCount = 0;

            // Initialize with all participants
            participants.forEach(p => {
                stats[p] = { views: [], reveals: [] };
            });

            // Process events (data is already sorted desc by created_at, so we get latest first)
            data.forEach(event => {
                if (!stats[event.participant]) return;

                const eventTime = new Date(event.created_at);
                const timeStr = eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = eventTime.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
                const fullTimeStr = `${dateStr} ${timeStr}`;

                if (event.action === 'view') {
                    stats[event.participant].views.push(fullTimeStr);
                } else if (event.action === 'reveal') {
                    stats[event.participant].reveals.push(fullTimeStr);
                }
            });

            // Calculate unique counts
            Object.values(stats).forEach(s => {
                if (s.views.length > 0) uniqueViewCount++;
                if (s.reveals.length > 0) uniqueRevealCount++;
            });

            totalViewsEl.textContent = uniqueViewCount;
            totalRevealsEl.textContent = uniqueRevealCount;

            trackingList.innerHTML = '';
            participants.forEach(p => {
                const s = stats[p];
                const li = document.createElement('li');
                li.className = 'participant-item';
                li.style.flexDirection = 'column'; // Stack content vertically
                li.style.alignItems = 'stretch';

                // Add click handler to toggle logs
                li.onclick = (e) => {
                    // Don't toggle if clicking a link/button inside (if any)
                    if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;

                    const logsDiv = li.querySelector('.participant-logs');
                    const chevron = li.querySelector('.fa-chevron-down');
                    if (logsDiv) {
                        logsDiv.classList.toggle('active');
                        if (chevron) {
                            chevron.style.transform = logsDiv.classList.contains('active') ? 'rotate(180deg)' : 'rotate(0deg)';
                        }
                    }
                };

                // Format logs
                let logsHtml = '';
                const hasLogs = s.views.length > 0 || s.reveals.length > 0;

                if (hasLogs) {
                    logsHtml += '<div class="participant-logs">';

                    if (s.reveals.length > 0) {
                        logsHtml += `<div style="color: var(--accent-color); margin-bottom: 4px;"><strong><i class="fas fa-gift"></i> Revelou:</strong> ${s.reveals.join(', ')}</div>`;
                    }
                    if (s.views.length > 0) {
                        logsHtml += `<div style="color: var(--primary-color);"><strong><i class="fas fa-eye"></i> Visualizou:</strong> ${s.views.join(', ')}</div>`;
                    }
                    logsHtml += '</div>';
                } else {
                    logsHtml = '<div class="participant-logs"><div style="font-size: 0.8em; color: var(--text-muted);">Nenhum acesso registrado.</div></div>';
                }

                li.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <strong>${p}</strong>
                            <i class="fas fa-chevron-down" style="font-size: 0.8em; color: var(--text-muted); transition: transform 0.3s;"></i>
                        </div>
                        <div style="display: flex; gap: 15px; font-size: 1.1em;">
                            <div style="display: flex; align-items: center; gap: 5px; color: ${s.views.length > 0 ? 'var(--primary-color)' : 'var(--text-muted)'}; opacity: ${s.views.length > 0 ? 1 : 0.5};" title="Visualizações">
                                <i class="fas fa-eye"></i> <span>${s.views.length}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 5px; color: ${s.reveals.length > 0 ? 'var(--accent-color)' : 'var(--text-muted)'}; opacity: ${s.reveals.length > 0 ? 1 : 0.5};" title="Revelações">
                                <i class="fas fa-gift"></i> <span>${s.reveals.length}</span>
                            </div>
                        </div>
                    </div>
                    ${logsHtml}
                `;
                trackingList.appendChild(li);
            });

        } catch (e) {
            console.error("Error loading tracking data", e);
            trackingList.innerHTML = '<p style="color: var(--danger-color); text-align: center;">Erro ao carregar dados.</p>';
        }
    }

});
