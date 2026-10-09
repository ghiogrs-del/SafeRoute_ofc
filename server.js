const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const HOST = "0.0.0.0";
const PORT = 3000;

// ============================================================
// DISPOSITIVOS ESP32 CONECTADOS
// ============================================================

const dispositivos = new Map();

// Tempo máximo sem receber dados para considerar o dispositivo offline.
const TEMPO_OFFLINE = 5000;


// ============================================================
// SERVIDOR HTTP
// ============================================================

const server = http.createServer((req, res) => {

    // ========================================================
    // ESP32 → SERVIDOR
    // ========================================================

    if (req.method === "POST" && req.url === "/api/device-data") {

        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });

        req.on("end", () => {

            try {

                const data = JSON.parse(body);

                console.log("\n====================================");
                console.log("DADOS RECEBIDOS DO ESP32");
                console.log("====================================");
                console.log(JSON.stringify(data, null, 2));


                // ====================================================
                // REGISTRA / ATUALIZA O ESP32
                // ====================================================

                if (data.deviceId) {

                    dispositivos.set(data.deviceId, {
                        deviceId: data.deviceId,
                        online: true,
                        ultimaAtualizacao: Date.now(),
                        dados: data
                    });

                }


                // ====================================================
                // ENVIA OS DADOS PARA OS DASHBOARDS
                // ====================================================

                broadcast(data);


                // ====================================================
                // RESPOSTA PARA O ESP32
                // ====================================================

                res.writeHead(200, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    success: true,
                    message: "Dados recebidos com sucesso"
                }));

            }

            catch (error) {

                console.error(
                    "Erro ao interpretar JSON:",
                    error
                );

                res.writeHead(400, {
                    "Content-Type": "application/json"
                });

                res.end(JSON.stringify({
                    success: false,
                    message: "JSON inválido"
                }));

            }

        });

        return;
    }


    // ========================================================
    // LISTA DE DISPOSITIVOS
    // ========================================================

    if (req.method === "GET" && req.url === "/api/devices") {

        const agora = Date.now();

        const lista = Array.from(dispositivos.values()).map(dispositivo => {

            const online =
                agora - dispositivo.ultimaAtualizacao
                <= TEMPO_OFFLINE;

            return {
                deviceId: dispositivo.deviceId,
                online: online,
                ultimaAtualizacao: dispositivo.ultimaAtualizacao,
                dados: dispositivo.dados
            };

        });

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify(lista));

        return;
    }


    // ========================================================
    // SAFEROUTE → ARQUIVOS DO SITE
    // ========================================================

    let filePath;

    if (req.url === "/" || req.url === "") {

        filePath = path.join(__dirname, "index.html");

    } else {

        filePath = path.join(__dirname, req.url);

    }


    // ========================================================
    // SEGURANÇA BÁSICA
    // ========================================================

    if (!filePath.startsWith(__dirname)) {

        res.writeHead(403);
        res.end("Acesso negado");

        return;
    }


    // ========================================================
    // LEITURA DOS ARQUIVOS
    // ========================================================

    fs.readFile(filePath, (error, content) => {

        if (error) {

            res.writeHead(404, {
                "Content-Type":
                    "text/plain; charset=utf-8"
            });

            res.end("Arquivo não encontrado");

            return;
        }


        const extension = path.extname(filePath);

        const contentTypes = {

            ".html":
                "text/html; charset=utf-8",

            ".css":
                "text/css; charset=utf-8",

            ".js":
                "application/javascript; charset=utf-8",

            ".json":
                "application/json",

            ".png":
                "image/png",

            ".jpg":
                "image/jpeg",

            ".jpeg":
                "image/jpeg",

            ".svg":
                "image/svg+xml",

            ".ico":
                "image/x-icon"

        };


        const contentType =
            contentTypes[extension] ||
            "application/octet-stream";


        res.writeHead(200, {
            "Content-Type": contentType
        });

        res.end(content);

    });

});


// ============================================================
// WEBSOCKET
// ============================================================

const websocketServer = new WebSocket.Server({
    noServer: true
});


server.on("upgrade", (request, socket, head) => {

    const url = new URL(
        request.url,
        `http://${request.headers.host}`
    );


    if (url.pathname !== "/ws") {

        socket.destroy();

        return;
    }


    websocketServer.handleUpgrade(
        request,
        socket,
        head,
        ws => {

            websocketServer.emit(
                "connection",
                ws,
                request
            );

        }
    );

});


// ============================================================
// CLIENTE SAFEROUTE CONECTADO
// ============================================================

websocketServer.on("connection", ws => {

    console.log(
        "SafeRoute conectado ao WebSocket."
    );


    // Informa que a conexão foi estabelecida.

    ws.send(JSON.stringify({

        type: "connection_status",

        online: true,

        message:
            "Servidor SafeRoute conectado"

    }));


    // Envia imediatamente a lista de dispositivos
    // já conhecidos pelo servidor.

    const listaDispositivos =
        Array.from(dispositivos.values()).map(
            dispositivo => {

                const online =
                    Date.now() -
                    dispositivo.ultimaAtualizacao
                    <= TEMPO_OFFLINE;

                return {

                    deviceId:
                        dispositivo.deviceId,

                    online: online,

                    ultimaAtualizacao:
                        dispositivo.ultimaAtualizacao,

                    dados:
                        dispositivo.dados

                };

            }
        );


    ws.send(JSON.stringify({

        type: "device_list",

        devices: listaDispositivos

    }));


    ws.on("close", () => {

        console.log(
            "SafeRoute desconectado."
        );

    });

});


// ============================================================
// ENVIA DADOS PARA OS DASHBOARDS
// ============================================================

function broadcast(data) {

    const mensagem =
        JSON.stringify(data);


    websocketServer.clients.forEach(client => {

        if (
            client.readyState ===
            WebSocket.OPEN
        ) {

            client.send(mensagem);

        }

    });

}


// ============================================================
// ATUALIZA STATUS ONLINE/OFFLINE
// ============================================================

setInterval(() => {

    const agora = Date.now();

    dispositivos.forEach((dispositivo, deviceId) => {

        const estavaOnline =
            dispositivo.online;

        const estaOnline =
            agora -
            dispositivo.ultimaAtualizacao
            <= TEMPO_OFFLINE;


        dispositivo.online =
            estaOnline;


        // Se mudou de online para offline,
        // ou vice-versa, avisa a interface.

        if (estavaOnline !== estaOnline) {

            broadcast({

                type: "device_status",

                deviceId: deviceId,

                online: estaOnline

            });

        }

    });

}, 1000);


// ============================================================
// INICIA SERVIDOR
// ============================================================

server.listen(PORT, HOST, () => {

    console.log("");

    console.log(
        "=============================================="
    );

    console.log(
        "          SAFEROUTE - SERVIDOR"
    );

    console.log(
        "=============================================="
    );

    console.log("");

    console.log(
        `Servidor local: http://localhost:${PORT}`
    );

    console.log(
        `Servidor na rede: http://172.20.10.2:${PORT}`
    );

    console.log("");

    console.log("WebSocket:");

    console.log(
        `ws://172.20.10.2:${PORT}/ws`
    );

    console.log("");

    console.log(
        "API de dispositivos:"
    );

    console.log(
        `http://172.20.10.2:${PORT}/api/devices`
    );

    console.log("");

    console.log(
        "Aguardando ESP32..."
    );

    console.log(
        "=============================================="
    );

    console.log("");

});