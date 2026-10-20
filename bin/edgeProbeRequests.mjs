import { Resolver } from "node:dns/promises";
import tls from "node:tls";
import { measureApexRedirects } from "./edgeProbeMeasurements.mjs";

export const APEX = "tudomacae.com.br";
export const CANONICAL = "www.tudomacae.com.br";
export const MCP_HOSTNAME = "mcp.tudomacae.com.br";
const REQUEST_TIMEOUT_MS = 20_000;
export const DELIVERY_CONTRACT = "docs/agents/production-topology.md";
export const MCP_CONTRACT = "docs/agents/mcp-edge-runbook.md";

export const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

export async function request(
  url,
  { method = "GET", headers = {}, body: requestBody } = {},
) {
  const response = await fetch(url, {
    method,
    headers,
    body: requestBody,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const responseBody = method === "HEAD" ? "" : await response.text();
  return { response, body: responseBody };
}

export function initializeMcpRequest() {
  return request(`https://${MCP_HOSTNAME}/mcp`, {
    method: "POST",
    headers: {
      "accept": "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "edge-probe", version: "1.0.0" },
      },
    }),
  });
}

export function editorialSessionRequest(method = "POST") {
  return request(`https://${MCP_HOSTNAME}/sessions/v1`, { method });
}

export async function apexRedirectMeasurement(protocol) {
  const paths = [
    "/",
    "/noticias/servi%C3%A7os?tag=a%2Fb&tag=c&empty=",
    "/robots.txt?edge_probe=1",
    "/edge-probe-missing-route?edge_probe=1",
  ];
  const measurements = await Promise.all(paths.map(async (path) => {
    const url = `${protocol}://${APEX}${path}`;
    const { response } = await request(url);
    return { url, response };
  }));
  return measureApexRedirects(measurements);
}

async function peerCertificate(hostname) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname },
      () => {
        const certificate = socket.getPeerCertificate();
        socket.end();
        resolve(certificate);
      },
    );
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error("TLS handshake timed out"));
    });
    socket.on("error", reject);
  });
}

export async function wildcardCertificateMeasurement(hostname) {
  const certificate = await peerCertificate(hostname);
  const names = (certificate.subjectaltname ?? "")
    .split(", ")
    .map(entry => entry.replace(/^DNS:/, ""));
  return {
    value: names.includes(`*.${APEX}`) ? "wildcard SAN" : "no wildcard SAN",
    detail: `issuer ${certificate.issuer?.O ?? "unknown"}, expires ${certificate.valid_to ?? "unknown"}`,
  };
}
