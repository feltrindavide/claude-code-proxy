#!/usr/bin/env bash
# Generate CA + server + client certs for optional admin mTLS listener.
set -euo pipefail

CERT_DIR="${HOME}/.claude/claude-code-proxy/data/certs/admin-mtls"
DAYS=3650

mkdir -p "${CERT_DIR}"
chmod 700 "${CERT_DIR}"

CA_KEY="${CERT_DIR}/ca-key.pem"
CA_CERT="${CERT_DIR}/ca.pem"
SERVER_KEY="${CERT_DIR}/server-key.pem"
SERVER_CSR="${CERT_DIR}/server.csr"
SERVER_CERT="${CERT_DIR}/server.pem"
CLIENT_KEY="${CERT_DIR}/client-key.pem"
CLIENT_CSR="${CERT_DIR}/client.csr"
CLIENT_CERT="${CERT_DIR}/client.pem"

echo "=== Admin mTLS certificate generation ==="
echo "Output: ${CERT_DIR}"
echo ""

# CA
openssl genrsa -out "${CA_KEY}" 4096
chmod 600 "${CA_KEY}"
openssl req -new -x509 -days "${DAYS}" -key "${CA_KEY}" -out "${CA_CERT}" \
  -subj "/CN=ClaudeCodeProxy-Admin-CA/O=ClaudeCodeProxy/C=IT"

# Server (localhost only)
openssl genrsa -out "${SERVER_KEY}" 2048
chmod 600 "${SERVER_KEY}"
openssl req -new -key "${SERVER_KEY}" -out "${SERVER_CSR}" \
  -subj "/CN=claude-code-proxy-admin/O=ClaudeCodeProxy/C=IT"
openssl x509 -req -days "${DAYS}" -in "${SERVER_CSR}" \
  -CA "${CA_CERT}" -CAkey "${CA_KEY}" -CAcreateserial \
  -out "${SERVER_CERT}" \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1")

# Client
openssl genrsa -out "${CLIENT_KEY}" 2048
chmod 600 "${CLIENT_KEY}"
openssl req -new -key "${CLIENT_KEY}" -out "${CLIENT_CSR}" \
  -subj "/CN=claude-code-proxy-admin-client/O=ClaudeCodeProxy/C=IT"
openssl x509 -req -days "${DAYS}" -in "${CLIENT_CSR}" \
  -CA "${CA_CERT}" -CAkey "${CA_KEY}" -CAcreateserial \
  -out "${CLIENT_CERT}"

rm -f "${SERVER_CSR}" "${CLIENT_CSR}" "${CERT_DIR}/ca.srl"

echo ""
echo "[OK] Certificates generated."
echo ""
echo "Enable in config.json:"
echo '  "adminMtls": { "enabled": true, "port": 3458 }'
echo ""
echo "Test (after restart):"
echo "  curl --cert ${CLIENT_CERT} --key ${CLIENT_KEY} --cacert ${CA_CERT} \\"
echo "    https://127.0.0.1:3458/admin/network"
