#include "dns_server.h"
#include "app_config.h"

#include "lwip/sockets.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "DNS";

// AP gateway IP bytes
#define DNS_REPLY_IP0  192
#define DNS_REPLY_IP1  168
#define DNS_REPLY_IP2  4
#define DNS_REPLY_IP3  1

#define DNS_PORT       53
#define DNS_BUF_SIZE   512

// ── Build a DNS A-record response in-place ────────────────────────────────────
// We copy the query, flip the QR bit, set ANCOUNT=1, then append one answer.
static int build_response(const uint8_t *query, int qlen, uint8_t *resp, int resp_max)
{
    if (qlen < 12 || qlen + 16 > resp_max) return -1;

    memcpy(resp, query, qlen);

    // Header flags: QR=1 (response), AA=1 (authoritative), RD copied, RA=1
    resp[2] = 0x81;  // QR=1, AA=1, TC=0, RD=1
    resp[3] = 0x80;  // RA=1, RCODE=0 (no error)

    // ANCOUNT = 1
    resp[6] = 0x00;
    resp[7] = 0x01;

    // Answer section appended after the query
    uint8_t *ans = resp + qlen;

    ans[0]  = 0xC0;  // name: pointer
    ans[1]  = 0x0C;  //       to offset 12 (start of question name)
    ans[2]  = 0x00;  // TYPE  A
    ans[3]  = 0x01;
    ans[4]  = 0x00;  // CLASS IN
    ans[5]  = 0x01;
    ans[6]  = 0x00;  // TTL   60 s
    ans[7]  = 0x00;
    ans[8]  = 0x00;
    ans[9]  = 0x3C;
    ans[10] = 0x00;  // RDLENGTH 4
    ans[11] = 0x04;
    ans[12] = DNS_REPLY_IP0;
    ans[13] = DNS_REPLY_IP1;
    ans[14] = DNS_REPLY_IP2;
    ans[15] = DNS_REPLY_IP3;

    return qlen + 16;
}

// ── DNS server task ───────────────────────────────────────────────────────────
static void dns_task(void *arg)
{
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) {
        ESP_LOGE(TAG, "socket() failed");
        vTaskDelete(NULL);
        return;
    }

    struct sockaddr_in srv = {
        .sin_family      = AF_INET,
        .sin_port        = htons(DNS_PORT),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };
    if (bind(sock, (struct sockaddr *)&srv, sizeof(srv)) < 0) {
        ESP_LOGE(TAG, "bind() failed on port %d", DNS_PORT);
        close(sock);
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "DNS spoof server listening on port %d -> %d.%d.%d.%d",
             DNS_PORT, DNS_REPLY_IP0, DNS_REPLY_IP1, DNS_REPLY_IP2, DNS_REPLY_IP3);

    static uint8_t buf[DNS_BUF_SIZE];
    static uint8_t resp[DNS_BUF_SIZE];

    while (1) {
        struct sockaddr_in client;
        socklen_t clen = sizeof(client);

        int n = recvfrom(sock, buf, sizeof(buf), 0,
                         (struct sockaddr *)&client, &clen);
        if (n < 12) continue;  // too short to be a valid DNS query

        int rlen = build_response(buf, n, resp, sizeof(resp));
        if (rlen > 0) {
            sendto(sock, resp, rlen, 0, (struct sockaddr *)&client, clen);
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────
void dns_server_start(void)
{
    xTaskCreate(dns_task, "dns_task", 4096, NULL, 5, NULL);
    ESP_LOGI(TAG, "DNS server started");
}
