#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/../certs"
mkdir -p "${CERT_DIR}"

KEY_FILE="${CERT_DIR}/signing-key.pem"
CERT_FILE="${CERT_DIR}/signing-cert.pem"
P12_FILE="${CERT_DIR}/signing-cert.p12"
PASS="${SIGNING_CERT_PASSWORD:-}"

echo "Generating RSA-2048 self-signed X.509 certificate for local PDF signing..."

openssl req -x509 \
  -newkey rsa:2048 \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=California/L=San Francisco/O=Crystal DocPad/OU=Document Verification/CN=Crystal DocPad Signer"

openssl pkcs12 -export \
  -out "${P12_FILE}" \
  -inkey "${KEY_FILE}" \
  -in "${CERT_FILE}" \
  -passout "pass:${PASS}" \
  -name "Crystal DocPad Signer"

rm -f "${KEY_FILE}" "${CERT_FILE}"

echo "PKCS#12 certificate generated at: ${P12_FILE}"
echo "Set SIGNING_CERT_PATH=${P12_FILE} in your environment."
