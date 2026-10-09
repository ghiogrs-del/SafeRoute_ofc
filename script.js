const API_BASE_URL = "";

let websocket = null;

let currentInstitutionId = 1;
let currentBuildingId = 1;

let devices = [];
let rooms = [];

let currentRoom = null;
let addingRoom = false;

let plantImage = null;

let deviceRefreshTimer = null;

let isAuthenticated =
    sessionStorage.getItem("safeRouteAuthenticated") === "true";


// ============================================================
// UTILITÁRIOS
// ============================================================

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}


function getDeviceId(device) {
    return String(
        device?.deviceId ??
        device?.id ??
        ""
    );
}


function getRoomDevice(room) {
    if (!room || !room.dispositivoId) {
        return null;
    }

    return devices.find(
        device =>
            getDeviceId(device) ===
            String(room.dispositivoId)
    );
}


// ============================================================
// AUTENTICAÇÃO
// ============================================================

function checkAuthentication() {
    const loginScreen =
        document.getElementById("loginScreen");

    const app =
        document.getElementById("app");

    if (!isAuthenticated) {
        if (loginScreen) {
            loginScreen.style.display = "flex";
        }

        if (app) {
            app.style.display = "none";
        }

        return false;
    }

    if (loginScreen) {
        loginScreen.style.display = "none";
    }

    if (app) {
        app.style.display = "block";
    }

    return true;
}


function logout() {
    sessionStorage.removeItem(
        "safeRouteAuthenticated"
    );

    isAuthenticated = false;

    checkAuthentication();
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        checkAuthentication();

        if (!isAuthenticated) {
            return;
        }

        initializeInterface();

        await loadRooms();

        await loadDevices();

        connectWebSocket();

        startDeviceRefresh();

        renderAll();
    }
);


// ============================================================
// INTERFACE
// ============================================================

function initializeInterface() {

    const loginForm =
        document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            event => {

                event.preventDefault();

                sessionStorage.setItem(
                    "safeRouteAuthenticated",
                    "true"
                );

                isAuthenticated = true;

                checkAuthentication();

                location.reload();
            }
        );
    }


    const logoutButton =
        document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            logout
        );
    }


    const dashboardButton =
        document.getElementById(
            "dashboardButton"
        );

    if (dashboardButton) {
        dashboardButton.addEventListener(
            "click",
            () => {
                showDashboard();
            }
        );
    }


    const configurationButton =
        document.getElementById(
            "configurationButton"
        );

    if (configurationButton) {
        configurationButton.addEventListener(
            "click",
            () => {
                showConfiguration();
            }
        );
    }
}


// ============================================================
// CARREGAMENTO DE DISPOSITIVOS
// ============================================================

async function loadDevices() {

    try {

        const response =
            await fetch(
                `${API_BASE_URL}/api/devices`
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        devices =
            Array.isArray(data)
                ? data.map(device => ({
                    ...device,
                    deviceId: getDeviceId(device)
                }))
                : [];

        console.log(
            "Dispositivos carregados:",
            devices
        );

        populateDeviceSelect();

        syncRoomDeviceStatus();

        updateDashboard();

    } catch (error) {

        console.error(
            "Erro ao carregar dispositivos:",
            error
        );
    }
}


// ============================================================
// SELECT DE DISPOSITIVOS
// ============================================================

function populateDeviceSelect() {

    const select =
        document.getElementById(
            "deviceInput"
        );

    if (!select) {
        return;
    }

    const currentValue =
        select.value;

    select.innerHTML = `
        <option value="">
            Selecione um dispositivo
        </option>
    `;

    devices.forEach(device => {

        const deviceId =
            getDeviceId(device);

        if (!deviceId) {
            return;
        }

        const option =
            document.createElement("option");

        option.value =
            deviceId;

        option.textContent =
            device.online !== false
                ? `🟢 ${deviceId} — Online`
                : `🔴 ${deviceId} — Offline`;

        select.appendChild(option);
    });

    if (
        currentValue &&
        devices.some(
            device =>
                getDeviceId(device) ===
                currentValue
        )
    ) {
        select.value =
            currentValue;
    }
}


// ============================================================
// SINCRONIZAÇÃO DO STATUS DOS ESP32
// ============================================================

function syncRoomDeviceStatus() {

    rooms.forEach(room => {

        if (!room.dispositivoId) {

            room.dispositivoOnline =
                false;

            return;
        }

        const device =
            getRoomDevice(room);

        room.dispositivoOnline =
            device
                ? device.online !== false
                : false;
    });

    renderRoomsList();

    renderRoomOverlays();

    updateDashboard();
}


// ============================================================
// ATUALIZAÇÃO PERIÓDICA
// ============================================================

function startDeviceRefresh() {

    if (deviceRefreshTimer) {
        clearInterval(
            deviceRefreshTimer
        );
    }

    deviceRefreshTimer =
        setInterval(
            loadDevices,
            2000
        );
}


// ============================================================
// WEBSOCKET
// ============================================================

function connectWebSocket() {

    try {

        const protocol =
            location.protocol === "https:"
                ? "wss:"
                : "ws:";

        websocket =
            new WebSocket(
                `${protocol}//${location.host}`
            );


        websocket.addEventListener(
            "open",
            () => {

                console.log(
                    "WebSocket conectado."
                );

                updateDashboardConnection(
                    "Conectado em tempo real"
                );
            }
        );


        websocket.addEventListener(
            "message",
            event => {

                try {

                    const data =
                        JSON.parse(
                            event.data
                        );

                    handleWebSocketMessage(
                        data
                    );

                } catch (error) {

                    console.error(
                        "Erro ao interpretar WebSocket:",
                        error
                    );
                }
            }
        );


        websocket.addEventListener(
            "close",
            () => {

                console.warn(
                    "WebSocket desconectado."
                );

                updateDashboardConnection(
                    "Reconectando..."
                );

                setTimeout(
                    connectWebSocket,
                    2000
                );
            }
        );


        websocket.addEventListener(
            "error",
            error => {

                console.error(
                    "Erro no WebSocket:",
                    error
                );
            }
        );

    } catch (error) {

        console.error(
            "Erro ao conectar WebSocket:",
            error
        );
    }
}


// ============================================================
// MENSAGENS DO WEBSOCKET
// ============================================================

function handleWebSocketMessage(data) {

    if (!data || !data.type) {
        return;
    }


    // --------------------------------------------------------
    // LISTA DE DISPOSITIVOS
    // --------------------------------------------------------

    if (
        data.type ===
        "device_list"
    ) {

        devices =
            Array.isArray(
                data.devices
            )
                ? data.devices.map(
                    device => ({
                        ...device,
                        deviceId:
                            getDeviceId(
                                device
                            )
                    })
                )
                : [];

        populateDeviceSelect();

        syncRoomDeviceStatus();

        updateDashboard();

        return;
    }


    // --------------------------------------------------------
    // STATUS DE DISPOSITIVO
    // --------------------------------------------------------

    if (
        data.type ===
        "device_status"
    ) {

        const deviceId =
            String(
                data.deviceId ?? ""
            );

        const device =
            devices.find(
                item =>
                    getDeviceId(item) ===
                    deviceId
            );

        if (device) {

            device.online =
                data.online !== false;

            device.ultimaAtualizacao =
                Date.now();
        }

        const room =
            rooms.find(
                item =>
                    item.dispositivoId &&
                    String(
                        item.dispositivoId
                    ) === deviceId
            );

        if (room) {

            room.dispositivoOnline =
                data.online !== false;
        }

        populateDeviceSelect();

        renderRoomsList();

        renderRoomOverlays();

        updateDashboard();

        return;
    }


    // --------------------------------------------------------
    // DADOS DO AMBIENTE
    // --------------------------------------------------------

    if (
        data.type ===
        "environment_update"
    ) {

        handleEnvironmentUpdate(
            data
        );

        return;
    }
}


// ============================================================
// ATUALIZAÇÃO RECEBIDA DO ESP32
// ============================================================

function handleEnvironmentUpdate(data) {

    console.log(
        "Dados recebidos do ESP32:",
        data
    );


    // --------------------------------------------------------
    // ATUALIZA DISPOSITIVO
    // --------------------------------------------------------

    if (data.deviceId) {

        const deviceId =
            String(
                data.deviceId
            );

        const existingDevice =
            devices.find(
                device =>
                    String(
                        device.deviceId ??
                        device.id
                    ) === deviceId
            );


        if (existingDevice) {

            existingDevice.online =
                data.online !== false;

            existingDevice.ultimaAtualizacao =
                Date.now();

            existingDevice.dados =
                data;

        } else {

            devices.push({

                deviceId:
                    deviceId,

                online:
                    data.online !== false,

                ultimaAtualizacao:
                    Date.now(),

                dados:
                    data
            });

            console.log(
                `Novo ESP32 detectado: ${deviceId}`
            );
        }

        populateDeviceSelect();
    }


    // --------------------------------------------------------
    // ENCONTRA O AMBIENTE PELO ESP32
    // --------------------------------------------------------

    const room =
        rooms.find(
            item =>
                item.dispositivoId &&
                String(
                    item.dispositivoId
                ) ===
                String(
                    data.deviceId
                )
        );


    if (!room) {

        console.warn(
            `ESP32 ${data.deviceId} detectado, mas ainda não está associado a nenhum ambiente.`
        );

        renderRoomsList();

        updateDashboard();

        return;
    }


    // --------------------------------------------------------
    // ATUALIZA DADOS DO AMBIENTE
    // --------------------------------------------------------

    room.pessoas =
        Number(
            data.pessoas ?? 0
        );

    room.fumaca =
        Boolean(
            data.fumaca
        );

    room.valorFumaca =
        Number(
            data.valorFumaca ?? 0
        );

    room.status =
        data.status ||
        "normal";

    room.sistemaLigado =
        data.sistemaLigado !== false;

    room.dispositivoOnline =
        data.online !== false;


    // --------------------------------------------------------
    // ATUALIZA TODA A INTERFACE
    // --------------------------------------------------------

    renderRoomsList();

    renderRoomOverlays();

    renderDashboard();

    updateAlertMode();


    const lastUpdate =
        document.getElementById(
            "dashboardLastUpdate"
        );

    if (lastUpdate) {

        lastUpdate.textContent =
            new Date()
                .toLocaleTimeString(
                    "pt-BR"
                );
    }


    updateDashboardConnection(
        "Dados recebidos em tempo real"
    );
}


// ============================================================
// CARREGAMENTO DOS AMBIENTES
// ============================================================

async function loadRooms() {

    try {

        const response =
            await fetch(
                `${API_BASE_URL}/api/environments?building_id=${currentBuildingId}`
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        rooms =
            Array.isArray(data)
                ? data.map(
                    normalizeRoomFromAPI
                )
                : [];

        console.log(
            "Ambientes carregados:",
            rooms
        );

    } catch (error) {

        console.warn(
            "Não foi possível carregar ambientes pela API. Mantendo dados locais.",
            error
        );
    }
}


// ============================================================
// NORMALIZAÇÃO DE AMBIENTE
// ============================================================

function normalizeRoomFromAPI(room) {

    return {

        ...room,

        id:
            room.id ??
            room.environmentId ??
            room.ambienteId,

        nome:
            room.nome ??
            room.name ??
            "Ambiente",

        tipo:
            room.tipo ??
            "sala",

        x:
            Number(
                room.x ?? 0
            ),

        y:
            Number(
                room.y ?? 0
            ),

        dispositivoId:
            room.dispositivoId ??
            room.deviceId ??
            "",

        monitorado:
            Boolean(
                room.monitorado
            ),

        pessoas:
            Number(
                room.pessoas ?? 0
            ),

        fumaca:
            Boolean(
                room.fumaca
            ),

        valorFumaca:
            Number(
                room.valorFumaca ?? 0
            ),

        dispositivoOnline:
            Boolean(
                room.dispositivoOnline
            ),

        sistemaLigado:
            room.sistemaLigado !== false,

        status:
            room.status ||
            "normal"
    };
}


// ============================================================
// RENDERIZAÇÃO GERAL
// ============================================================

function renderAll() {

    renderRoomsList();

    renderRoomOverlays();

    renderDashboard();
}


// ============================================================
// PLANTA — CONFIGURAÇÃO
// ============================================================

function renderPlant() {

    const container =
        document.getElementById(
            "plantContainer"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";


    if (!plantImage) {

        container.innerHTML = `
            <div class="plant-placeholder">
                <p>
                    Nenhuma planta carregada.
                </p>
            </div>
        `;

        return;
    }


    const stage =
        document.createElement(
            "div"
        );

    stage.className =
        "plant-stage";


    const image =
        document.createElement(
            "img"
        );

    image.src =
        plantImage;

    image.alt =
        "Planta da edificação";

    image.className =
        "plant-image";


    stage.appendChild(
        image
    );


    container.appendChild(
        stage
    );


    renderRoomOverlays();
}


// ============================================================
// SOBREPOSIÇÕES DOS AMBIENTES
// ============================================================

function renderRoomOverlays() {

    const container =
        document.getElementById(
            "plantContainer"
        );

    if (!container) {
        return;
    }


    const stage =
        container.querySelector(
            ".plant-stage"
        );

    if (!stage) {
        return;
    }


    stage
        .querySelectorAll(
            ".room-overlay"
        )
        .forEach(
            element =>
                element.remove()
        );


    rooms.forEach(
        room => {

            const overlay =
                document.createElement(
                    "div"
                );


            overlay.className =
                `room-overlay room-status-${room.status || "normal"}`;


            overlay.style.left =
                `${room.x * 100}%`;

            overlay.style.top =
                `${room.y * 100}%`;


            overlay.innerHTML = `
                <span class="room-overlay-label">
                    ${escapeHtml(
                        room.nome ||
                        "Ambiente"
                    )}
                </span>
            `;


            overlay.addEventListener(
                "click",
                () => {

                    currentRoom =
                        room;

                    openRoomModal(
                        room
                    );
                }
            );


            stage.appendChild(
                overlay
            );
        }
    );
}


// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {

    renderDashboardSummary();

    renderDashboardPlant();

    renderAlerts();

    renderMonitoredRooms();

    updateDashboardConnection();

    updateAlertMode();
}


// ============================================================
// RESUMO DO DASHBOARD
// ============================================================

function renderDashboardSummary() {

    const totalPeople =
        rooms.reduce(
            (
                total,
                room
            ) =>
                total +
                Number(
                    room.pessoas ||
                    0
                ),
            0
        );


    const monitoredRooms =
        rooms.filter(
            room =>
                room.monitorado
        ).length;


    const alerts =
        rooms.filter(
            room =>
                room.fumaca ||
                room.status ===
                    "perigo" ||
                room.status ===
                    "atencao"
        ).length;


    const onlineDevices =
        devices.filter(
            device =>
                device.online !== false
        ).length;


    const totalPeopleElement =
        document.getElementById(
            "totalPeople"
        );

    if (totalPeopleElement) {

        totalPeopleElement.textContent =
            totalPeople;
    }


    const monitoredRoomsElement =
        document.getElementById(
            "monitoredRooms"
        );

    if (monitoredRoomsElement) {

        monitoredRoomsElement.textContent =
            monitoredRooms;
    }


    const alertsElement =
        document.getElementById(
            "totalAlerts"
        );

    if (alertsElement) {

        alertsElement.textContent =
            alerts;
    }


    const onlineDevicesElement =
        document.getElementById(
            "onlineDevices"
        );

    if (onlineDevicesElement) {

        onlineDevicesElement.textContent =
            onlineDevices;
    }
}


// ============================================================
// PLANTA DO DASHBOARD
// ============================================================

function renderDashboardPlant() {

    const container =
        document.getElementById(
            "dashboardPlantContainer"
        );


    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (!plantImage) {

        container.innerHTML = `
            <div
                id="dashboardPlantPlaceholder"
                class="dashboard-plant-placeholder"
            >
                <p>
                    A planta da edificação aparecerá aqui.
                </p>
            </div>
        `;

        return;
    }


    const stage =
        document.createElement(
            "div"
        );

    stage.className =
        "dashboard-plant-stage";


    const image =
        document.createElement(
            "img"
        );

    image.src =
        plantImage;

    image.alt =
        "Planta da edificação";

    image.className =
        "dashboard-plant-image";


    stage.appendChild(
        image
    );


    // ========================================================
    // CRIA OS INDICADORES DOS AMBIENTES
    // ========================================================

    rooms.forEach(
        room => {

            const marker =
                document.createElement(
                    "div"
                );


            // ------------------------------------------------
            // DEFINE O ESTADO VISUAL
            // ------------------------------------------------

            let roomState =
                "free";


            if (
                room.fumaca === true
            ) {

                roomState =
                    "smoke";

            } else if (
                Number(
                    room.pessoas || 0
                ) > 0
            ) {

                roomState =
                    "occupied";

            } else {

                roomState =
                    "free";
            }


            // ------------------------------------------------
            // CLASSE DO AMBIENTE
            // ------------------------------------------------

            marker.className =
                `dashboard-room-marker room-state-${roomState}`;


            marker.style.left =
                `${room.x * 100}%`;

            marker.style.top =
                `${room.y * 100}%`;


            // ------------------------------------------------
            // INDICADOR CIRCULAR
            // ------------------------------------------------

            const indicator =
                document.createElement(
                    "span"
                );

            indicator.className =
                "monitoring-indicator";


            // Texto auxiliar ao passar o mouse

            if (
                roomState ===
                "smoke"
            ) {

                indicator.title =
                    "Perigo: fumaça detectada";

            } else if (
                roomState ===
                "occupied"
            ) {

                indicator.title =
                    "Ambiente ocupado";

            } else {

                indicator.title =
                    "Ambiente livre";
            }


            // ------------------------------------------------
            // NOME DO AMBIENTE
            // ------------------------------------------------

            const label =
                document.createElement(
                    "span"
                );

            label.className =
                "dashboard-room-label";

            label.textContent =
                room.nome ||
                "Ambiente";


            // ------------------------------------------------
            // MONTA O MARCADOR
            // ------------------------------------------------

            marker.appendChild(
                indicator
            );

            marker.appendChild(
                label
            );


            // ------------------------------------------------
            // CLIQUE NO AMBIENTE
            // ------------------------------------------------

            marker.addEventListener(
                "click",
                () =>
                    showRoomDashboardDetails(
                        room
                    )
            );


            stage.appendChild(
                marker
            );
        }
    );


    container.appendChild(
        stage
    );
}


// ============================================================
// AMBIENTES MONITORADOS
// ============================================================

function renderMonitoredRooms() {

    const container =
        document.getElementById(
            "monitoredRoomsContainer"
        );

    if (!container) {
        return;
    }


    const monitoredRooms =
        rooms.filter(
            room =>
                room.monitorado
        );


    if (
        monitoredRooms.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                Nenhum ambiente monitorado.
            </div>
        `;

        return;
    }


    container.innerHTML =
        monitoredRooms
            .map(
                room => {

                    let statusText =
                        "Livre";


                    if (
                        room.fumaca
                    ) {

                        statusText =
                            "Fumaça detectada";

                    } else if (
                        Number(
                            room.pessoas ||
                            0
                        ) > 0
                    ) {

                        statusText =
                            "Ocupado";
                    }


                    const online =
                        room.dispositivoOnline;


                    return `
                        <div
                            class="monitored-room-card"
                        >

                            <div
                                class="monitored-room-header"
                            >

                                <strong>
                                    ${escapeHtml(
                                        room.nome ||
                                        "Ambiente"
                                    )}
                                </strong>

                                <span
                                    class="device-status ${
                                        online
                                            ? "online"
                                            : "offline"
                                    }"
                                >
                                    ${
                                        online
                                            ? "Online"
                                            : "Offline"
                                    }
                                </span>

                            </div>


                            <div
                                class="monitored-room-info"
                            >

                                <span>
                                    Pessoas:
                                    ${
                                        Number(
                                            room.pessoas ||
                                            0
                                        )
                                    }
                                </span>

                                <span>
                                    Status:
                                    ${statusText}
                                </span>

                                <span>
                                    Fumaça:
                                    ${
                                        room.fumaca
                                            ? "Detectada"
                                            : "Não detectada"
                                    }
                                </span>

                                <span>
                                    ESP32:
                                    ${
                                        escapeHtml(
                                            room.dispositivoId ||
                                            "Não associado"
                                        )
                                    }
                                </span>

                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


// ============================================================
// ALERTAS
// ============================================================

function renderAlerts() {

    const container =
        document.getElementById(
            "alertsContainer"
        );

    if (!container) {
        return;
    }


    const alertRooms =
        rooms.filter(
            room =>
                room.fumaca ||
                room.status ===
                    "perigo" ||
                room.status ===
                    "atencao"
        );


    if (
        alertRooms.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                Nenhum alerta no momento.
            </div>
        `;

        return;
    }


    container.innerHTML =
        alertRooms
            .map(
                room => {

                    const smoke =
                        room.fumaca;


                    return `
                        <div
                            class="alert-card ${
                                smoke
                                    ? "alert-danger"
                                    : "alert-warning"
                            }"
                        >

                            <strong>
                                ${escapeHtml(
                                    room.nome ||
                                    "Ambiente"
                                )}
                            </strong>

                            <span>
                                ${
                                    smoke
                                        ? "Fumaça detectada"
                                        : "Situação de atenção"
                                }
                            </span>

                        </div>
                    `;
                }
            )
            .join("");
}


// ============================================================
// MODO DE ALERTA
// ============================================================

function updateAlertMode() {

    const hasAlert =
        rooms.some(
            room =>
                room.fumaca ||
                room.status ===
                    "perigo"
        );


    document.body.classList.toggle(
        "alert-mode",
        hasAlert
    );
}


// ============================================================
// STATUS DA CONEXÃO
// ============================================================

function updateDashboardConnection(
    message
) {

    const element =
        document.getElementById(
            "dashboardConnection"
        );

    if (!element) {
        return;
    }


    if (message) {

        element.textContent =
            message;

        return;
    }


    if (
        websocket &&
        websocket.readyState ===
            WebSocket.OPEN
    ) {

        element.textContent =
            "Conectado em tempo real";

    } else {

        element.textContent =
            "Desconectado";
    }
}


// ============================================================
// DETALHES DO AMBIENTE
// ============================================================

function showRoomDashboardDetails(
    room
) {

    currentRoom =
        room;


    const modal =
        document.getElementById(
            "roomDashboardModal"
        );


    if (!modal) {
        return;
    }


    const name =
        modal.querySelector(
            ".room-dashboard-name"
        );

    if (name) {

        name.textContent =
            room.nome ||
            "Ambiente";
    }


    const people =
        modal.querySelector(
            ".room-dashboard-people"
        );

    if (people) {

        people.textContent =
            Number(
                room.pessoas ||
                0
            );
    }


    const smoke =
        modal.querySelector(
            ".room-dashboard-smoke"
        );

    if (smoke) {

        smoke.textContent =
            room.fumaca
                ? "Detectada"
                : "Não detectada";
    }


    const device =
        modal.querySelector(
            ".room-dashboard-device"
        );

    if (device) {

        device.textContent =
            room.dispositivoId ||
            "Não associado";
    }


    modal.style.display =
        "flex";
}


// ============================================================
// MODAL DE AMBIENTE
// ============================================================

function openRoomModal(room) {

    currentRoom =
        room;


    const modal =
        document.getElementById(
            "roomModal"
        );

    if (!modal) {
        return;
    }


    const nameInput =
        document.getElementById(
            "roomNameInput"
        );

    if (nameInput) {

        nameInput.value =
            room.nome ||
            "";
    }


    const deviceInput =
        document.getElementById(
            "deviceInput"
        );

    if (deviceInput) {

        deviceInput.value =
            room.dispositivoId ||
            "";
    }


    const monitorInput =
        document.getElementById(
            "monitorInput"
        );

    if (monitorInput) {

        monitorInput.checked =
            Boolean(
                room.monitorado
            );
    }


    modal.style.display =
        "flex";
}


// ============================================================
// FECHAR MODAIS
// ============================================================

function closeModal(
    modalId
) {

    const modal =
        document.getElementById(
            modalId
        );

    if (modal) {

        modal.style.display =
            "none";
    }
}


// ============================================================
// SALVAR AMBIENTE
// ============================================================

async function saveRoom() {

    if (!currentRoom) {
        return;
    }


    const nameInput =
        document.getElementById(
            "roomNameInput"
        );

    const deviceInput =
        document.getElementById(
            "deviceInput"
        );

    const monitorInput =
        document.getElementById(
            "monitorInput"
        );


    if (nameInput) {

        currentRoom.nome =
            nameInput.value.trim();
    }


    if (deviceInput) {

        currentRoom.dispositivoId =
            deviceInput.value;
    }


    if (monitorInput) {

        currentRoom.monitorado =
            monitorInput.checked;
    }


    const device =
        getRoomDevice(
            currentRoom
        );


    currentRoom.dispositivoOnline =
        device
            ? device.online !== false
            : false;


    renderRoomsList();

    renderRoomOverlays();

    renderDashboard();

    closeModal(
        "roomModal"
    );
}


// ============================================================
// LISTA DE AMBIENTES
// ============================================================

function renderRoomsList() {

    const container =
        document.getElementById(
            "roomsList"
        );

    if (!container) {
        return;
    }


    if (rooms.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                Nenhum ambiente cadastrado.
            </div>
        `;

        return;
    }


    container.innerHTML =
        rooms
            .map(
                room => `

                    <div
                        class="room-list-item"
                    >

                        <strong>
                            ${escapeHtml(
                                room.nome ||
                                "Ambiente"
                            )}
                        </strong>

                        <span>
                            ${
                                room.monitorado
                                    ? "Monitorado"
                                    : "Não monitorado"
                            }
                        </span>

                    </div>

                `
            )
            .join("");
}


// ============================================================
// DASHBOARD / CONFIGURAÇÃO
// ============================================================

function showDashboard() {

    const dashboard =
        document.getElementById(
            "dashboardSection"
        );

    const configuration =
        document.getElementById(
            "configurationSection"
        );


    if (dashboard) {

        dashboard.style.display =
            "block";
    }


    if (configuration) {

        configuration.style.display =
            "none";
    }


    renderDashboard();
}


function showConfiguration() {

    const dashboard =
        document.getElementById(
            "dashboardSection"
        );

    const configuration =
        document.getElementById(
            "configurationSection"
        );


    if (dashboard) {

        dashboard.style.display =
            "none";
    }


    if (configuration) {

        configuration.style.display =
            "block";
    }


    renderPlant();

    renderRoomsList();
}


// ============================================================
// ATUALIZAÇÃO DO DASHBOARD
// ============================================================

function updateDashboard() {

    renderDashboardSummary();

    renderDashboardPlant();

    renderAlerts();

    renderMonitoredRooms();

    updateDashboardConnection();

    updateAlertMode();
}


// ============================================================
// PLANTA
// ============================================================

function setPlantImage(
    imageData
) {

    plantImage =
        imageData;

    renderPlant();

    renderDashboardPlant();
}


// ============================================================
// UPLOAD DA PLANTA
// ============================================================

function setupPlantUpload() {

    const input =
        document.getElementById(
            "plantInput"
        );

    if (!input) {
        return;
    }


    input.addEventListener(
        "change",
        event => {

            const file =
                event.target.files?.[0];

            if (!file) {
                return;
            }


            const reader =
                new FileReader();


            reader.onload =
                () => {

                    setPlantImage(
                        reader.result
                    );
                };


            reader.readAsDataURL(
                file
            );
        }
    );
}


// ============================================================
// INICIALIZA UPLOAD
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setupPlantUpload();
    }
);