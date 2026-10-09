#include <WiFi.h>
#include <HTTPClient.h>

// ============================================================
// SAFEROUTE - PROTÓTIPO COM WI-FI + INTEGRAÇÃO NODE.JS
// ESP32 DOIT DEVKIT V1
// ============================================================


// ============================================================
// WI-FI
// ============================================================

const char* SSID = "nome da rede";
const char* SENHA = "senha";


// ============================================================
// SERVIDOR SAFEROUTE
// ============================================================

// IP do computador onde o Node.js está rodando
const char* SERVER_URL =
  "http://172.20.10.2:3000/api/device-data";


// Identificação deste ambiente
const int ENVIRONMENT_ID = 1;

const char* DEVICE_ID = "SR-001";


// ============================================================
// PINOS
// ============================================================

const int SENSOR_ENTRADA = 27;
const int SENSOR_SAIDA = 26;

const int LED_PRESENCA = 2;

const int INTERRUPTOR = 14;

const int SENSOR_FUMACA_AO = 34;
const int SENSOR_FUMACA_DO = 25;


// ============================================================
// CONFIGURAÇÃO DA FUMAÇA
// ============================================================

// Valor mantido conforme a configuração atual do protótipo.

const int LIMITE_FUMACA = 180;


// ============================================================
// CONTAGEM DE PESSOAS
// ============================================================

int pessoas = 0;


// Estados anteriores dos sensores
int estadoEntradaAnterior = HIGH;
int estadoSaidaAnterior = HIGH;


// Controle da sequência
bool sensorEntradaAcionado = false;
bool sensorSaidaAcionado = false;


// Tempo em que o primeiro sensor foi acionado
unsigned long inicioSequencia = 0;


// Tempo máximo para completar uma passagem
const unsigned long TEMPO_PASSAGEM = 3000;


// ============================================================
// ESTADO DO SISTEMA
// ============================================================

bool sistemaLigado = false;


// ============================================================
// CONTROLE DO ENVIO
// ============================================================

// Envia os dados para o servidor a cada 1 segundo.

unsigned long ultimoEnvio = 0;

const unsigned long INTERVALO_ENVIO = 1000;


// ============================================================
// FUNÇÃO: DETERMINAR STATUS
// ============================================================

String determinarStatus(
  bool fumacaDetectada
) {

  if (fumacaDetectada) {
    return "perigo";
  }

  if (pessoas > 0) {
    return "atencao";
  }

  return "normal";
}


// ============================================================
// FUNÇÃO: ENVIAR DADOS PARA O NODE.JS
// ============================================================

void enviarDados() {

  // ----------------------------------------------------------
  // Verifica Wi-Fi
  // ----------------------------------------------------------

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println(
      "[HTTP] Wi-Fi desconectado."
    );

    return;
  }


  // ----------------------------------------------------------
  // Leitura do FC-22
  // ----------------------------------------------------------

  int valorFumaca =
    analogRead(SENSOR_FUMACA_AO);

  int estadoFumacaDigital =
    digitalRead(SENSOR_FUMACA_DO);


  bool fumacaDetectada =
    valorFumaca >= LIMITE_FUMACA;


  // ----------------------------------------------------------
  // Define status
  // ----------------------------------------------------------

  String status =
    determinarStatus(fumacaDetectada);


  // Se o sistema estiver desligado,
  // informamos isso ao servidor.

  if (!sistemaLigado) {
    status = "desativado";
  }


  // ----------------------------------------------------------
  // Monta JSON
  // ----------------------------------------------------------

  String json = "{";

  json += "\"type\":\"environment_update\",";
  json += "\"environmentId\":";
  json += String(ENVIRONMENT_ID);
  json += ",";

  json += "\"deviceId\":\"";
  json += DEVICE_ID;
  json += "\",";

  json += "\"pessoas\":";
  json += String(pessoas);
  json += ",";

  json += "\"fumaca\":";
  json += fumacaDetectada ? "true" : "false";
  json += ",";

  json += "\"valorFumaca\":";
  json += String(valorFumaca);
  json += ",";

  json += "\"fumacaDigital\":";
  json += estadoFumacaDigital == LOW ? "true" : "false";
  json += ",";

  json += "\"status\":\"";
  json += status;
  json += "\",";

  json += "\"sistemaLigado\":";
  json += sistemaLigado ? "true" : "false";
  json += ",";

  json += "\"online\":true";

  json += "}";


  // ----------------------------------------------------------
  // Mostra o JSON no Serial
  // ----------------------------------------------------------

  Serial.println();
  Serial.println(
    "----------------------------------------"
  );

  Serial.println(
    "[HTTP] Enviando dados para SafeRoute:"
  );

  Serial.println(json);


  // ----------------------------------------------------------
  // HTTP POST
  // ----------------------------------------------------------

  HTTPClient http;

  http.begin(SERVER_URL);

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  http.setTimeout(3000);


  int codigoResposta =
    http.POST(json);


  // ----------------------------------------------------------
  // Resultado
  // ----------------------------------------------------------

  if (codigoResposta > 0) {

    Serial.print(
      "[HTTP] Codigo de resposta: "
    );

    Serial.println(codigoResposta);


    String resposta =
      http.getString();


    Serial.print(
      "[HTTP] Resposta do servidor: "
    );

    Serial.println(resposta);

  }

  else {

    Serial.print(
      "[HTTP] Erro no envio: "
    );

    Serial.println(
      http.errorToString(
        codigoResposta
      )
    );

  }


  http.end();

  Serial.println(
    "----------------------------------------"
  );
}


// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(115200);

  delay(1000);


  // ----------------------------------------------------------
  // PINOS
  // ----------------------------------------------------------

  pinMode(
    SENSOR_ENTRADA,
    INPUT_PULLUP
  );

  pinMode(
    SENSOR_SAIDA,
    INPUT_PULLUP
  );

  pinMode(
    LED_PRESENCA,
    OUTPUT
  );

  pinMode(
    INTERRUPTOR,
    INPUT_PULLUP
  );

  pinMode(
    SENSOR_FUMACA_DO,
    INPUT
  );


  digitalWrite(
    LED_PRESENCA,
    LOW
  );


  // ----------------------------------------------------------
  // INFORMAÇÕES INICIAIS
  // ----------------------------------------------------------

  Serial.println();

  Serial.println(
    "========================================"
  );

  Serial.println(
    "     SAFEROUTE - ESP32 + NODE.JS"
  );

  Serial.println(
    "========================================"
  );

  Serial.println();

  Serial.println(
    "Inicializando Wi-Fi..."
  );


  // ----------------------------------------------------------
  // WI-FI
  // ----------------------------------------------------------

  WiFi.begin(
    SSID,
    SENHA
  );


  int tentativas = 0;


  while (
    WiFi.status() != WL_CONNECTED &&
    tentativas < 30
  ) {

    delay(500);

    Serial.print(".");

    tentativas++;
  }


  Serial.println();


  // ----------------------------------------------------------
  // RESULTADO WI-FI
  // ----------------------------------------------------------

  if (
    WiFi.status() == WL_CONNECTED
  ) {

    Serial.println(
      "Wi-Fi conectado!"
    );


    Serial.print(
      "Rede: "
    );

    Serial.println(
      SSID
    );


    Serial.print(
      "IP do ESP32: "
    );

    Serial.println(
      WiFi.localIP()
    );


    Serial.println();


    Serial.print(
      "Servidor SafeRoute: "
    );

    Serial.println(
      SERVER_URL
    );

  }

  else {

    Serial.println(
      "ERRO: nao foi possivel conectar ao Wi-Fi."
    );

  }


  Serial.println();

  Serial.println(
    "Inicializacao concluida."
  );

  Serial.println();

}


// ============================================================
// LOOP
// ============================================================

void loop() {


  // ==========================================================
  // INTERRUPTOR
  // ==========================================================

  if (
    digitalRead(INTERRUPTOR) == LOW
  ) {

    if (!sistemaLigado) {

      sistemaLigado = true;

      Serial.println();

      Serial.println(
        ">>> SISTEMA ATIVADO <<<"
      );

      Serial.println();

    }

  }

  else {

    if (sistemaLigado) {

      sistemaLigado = false;

      sensorEntradaAcionado = false;

      sensorSaidaAcionado = false;

      digitalWrite(
        LED_PRESENCA,
        LOW
      );


      Serial.println();

      Serial.println(
        ">>> SISTEMA DESATIVADO <<<"
      );

      Serial.println();

    }

    // Mesmo desligado, enviamos o estado
    // para o SafeRoute.

    if (
      millis() - ultimoEnvio >=
      INTERVALO_ENVIO
    ) {

      ultimoEnvio = millis();

      enviarDados();

    }

    delay(50);

    return;
  }


  // ==========================================================
  // SENSORES DE PASSAGEM
  // ==========================================================

  int estadoEntrada =
    digitalRead(
      SENSOR_ENTRADA
    );

  int estadoSaida =
    digitalRead(
      SENSOR_SAIDA
    );


  // ==========================================================
  // PRIMEIRO SENSOR = ENTRADA
  // ==========================================================

  if (
    estadoEntrada == LOW &&
    estadoEntradaAnterior == HIGH &&
    !sensorEntradaAcionado &&
    !sensorSaidaAcionado
  ) {

    sensorEntradaAcionado = true;

    inicioSequencia = millis();


    Serial.println(
      "Sensor de ENTRADA acionado."
    );

  }


  // ==========================================================
  // PRIMEIRO SENSOR = SAÍDA
  // ==========================================================

  if (
    estadoSaida == LOW &&
    estadoSaidaAnterior == HIGH &&
    !sensorSaidaAcionado &&
    !sensorEntradaAcionado
  ) {

    sensorSaidaAcionado = true;

    inicioSequencia = millis();


    Serial.println(
      "Sensor de SAIDA acionado."
    );

  }


  // ==========================================================
  // ENTRADA CONFIRMADA
  // ==========================================================

  if (
    sensorEntradaAcionado &&
    estadoSaida == LOW
  ) {

    pessoas++;


    Serial.println();

    Serial.println(
      ">>> ENTRADA CONFIRMADA <<<"
    );


    Serial.print(
      "Pessoas no ambiente: "
    );

    Serial.println(
      pessoas
    );


    sensorEntradaAcionado = false;


    delay(500);
  }


  // ==========================================================
  // SAÍDA CONFIRMADA
  // ==========================================================

  if (
    sensorSaidaAcionado &&
    estadoEntrada == LOW
  ) {

    if (pessoas > 0) {

      pessoas--;

    }


    Serial.println();

    Serial.println(
      ">>> SAIDA CONFIRMADA <<<"
    );


    Serial.print(
      "Pessoas no ambiente: "
    );

    Serial.println(
      pessoas
    );


    sensorSaidaAcionado = false;


    delay(500);
  }


  // ==========================================================
  // CANCELAMENTO DA SEQUÊNCIA
  // ==========================================================

  if (
    (
      sensorEntradaAcionado ||
      sensorSaidaAcionado
    ) &&

    millis() - inicioSequencia >
    TEMPO_PASSAGEM
  ) {

    Serial.println(
      "Sequencia cancelada."
    );


    sensorEntradaAcionado = false;

    sensorSaidaAcionado = false;

  }


  // ==========================================================
  // LED DE PRESENÇA
  // ==========================================================

  if (pessoas > 0) {

    digitalWrite(
      LED_PRESENCA,
      HIGH
    );

  }

  else {

    digitalWrite(
      LED_PRESENCA,
      LOW
    );

  }


  // ==========================================================
  // LEITURA DO FC-22
  // ==========================================================

  int valorFumaca =
    analogRead(
      SENSOR_FUMACA_AO
    );


  bool fumacaDetectada =
    valorFumaca >= LIMITE_FUMACA;


  // ==========================================================
  // MONITOR SERIAL
  // ==========================================================

  Serial.print(
    "Pessoas: "
  );

  Serial.print(
    pessoas
  );


  Serial.print(
    " | Fumaca AO: "
  );

  Serial.print(
    valorFumaca
  );


  Serial.print(
    " | Fumaca: "
  );


  if (fumacaDetectada) {

    Serial.println(
      "DETECTADA"
    );

  }

  else {

    Serial.println(
      "NORMAL"
    );

  }


  // ==========================================================
  // ATUALIZA ESTADOS
  // ==========================================================

  estadoEntradaAnterior =
    estadoEntrada;

  estadoSaidaAnterior =
    estadoSaida;


  // ==========================================================
  // ENVIO PARA O NODE.JS
  // ==========================================================

  if (
    millis() - ultimoEnvio >=
    INTERVALO_ENVIO
  ) {

    ultimoEnvio = millis();

    enviarDados();

  }


  delay(100);
}