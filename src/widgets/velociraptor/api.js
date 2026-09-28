import { credentials, makeGenericClientConstructor } from "@grpc/grpc-js";
import protobuf from "protobufjs";

// Wire-compatible subset of actions/proto/vql.proto, served by /proto.API/Query.
// https://github.com/Velocidex/velociraptor/blob/master/actions/proto/vql.proto
// Keep this schema inline so Next's standalone output needs no external proto files.
const schema = protobuf.parse(
  `syntax = "proto3";
message VQLRequest { string VQL = 1; string Name = 2; }
message VQLCollectorArgs {
  repeated VQLRequest Query = 2; uint64 max_row = 4;
  uint64 max_wait = 6; uint64 timeout = 25; string org_id = 35;
}
message VQLResponse {
  string Response = 1; string log = 9; string JSONLResponse = 10;
  uint64 uncompressed_size = 13;
}`,
  { keepCase: true },
).root;
const requestType = schema.lookupType("VQLCollectorArgs");
const responseType = schema.lookupType("VQLResponse");
export const queryDefinition = {
  path: "/proto.API/Query",
  requestStream: false,
  responseStream: true,
  requestSerialize: (value) => Buffer.from(requestType.encode(requestType.fromObject(value)).finish()),
  requestDeserialize: (value) => requestType.decode(value),
  responseSerialize: (value) => Buffer.from(responseType.encode(responseType.fromObject(value)).finish()),
  responseDeserialize: (value) => responseType.decode(value),
};
const API = makeGenericClientConstructor({ Query: queryDefinition }, "API");

export function createClient(config) {
  return new API(
    config.api_connection_string,
    credentials.createSsl(
      Buffer.from(config.ca_certificate),
      Buffer.from(config.client_private_key),
      Buffer.from(config.client_cert),
    ),
    {
      "grpc.ssl_target_name_override": "VelociraptorServer",
      "grpc.default_authority": "VelociraptorServer",
      "grpc.max_receive_message_length": 4 * 1024 * 1024,
    },
  );
}

export function queryClients(client, orgId = "") {
  return new Promise((resolve, reject) => {
    const summary = { total: 0, recent: 0, stale: 0 };
    const cutoff = Date.now() * 1000 - 15 * 60 * 1_000_000;
    let completed = false;
    const stream = client.Query(
      {
        Query: [{ Name: "GatherClients", VQL: "SELECT client_id, last_seen_at FROM clients()" }],
        org_id: orgId,
        max_row: 1000,
        max_wait: 1,
        timeout: 15,
      },
      { deadline: Date.now() + 20_000 },
    );
    const fail = () => {
      if (completed) return;
      completed = true;
      reject(new Error("Velociraptor query failed"));
      stream.cancel();
    };
    stream.on("data", (message) => {
      if (completed) return;
      try {
        if (
          Number(message.uncompressed_size) > 0 ||
          /\b(error|fatal|denied|timeout|cancelled|canceled)\b|clients:|client_info:/i.test(message.log || "")
        ) {
          fail();
          return;
        }
        const rows = message.JSONLResponse
          ? message.JSONLResponse.split("\n")
              .filter((line) => line.trim())
              .map((line) => JSON.parse(line))
          : message.Response
            ? JSON.parse(message.Response)
            : [];
        if (!Array.isArray(rows)) throw new Error("Invalid rows");
        for (const row of rows) {
          const seen = Number(row.last_seen_at);
          if (typeof row.client_id !== "string" || row.last_seen_at == null || !Number.isFinite(seen) || seen < 0) {
            throw new Error("Invalid client");
          }
          summary.total += 1;
          if (seen >= cutoff) summary.recent += 1;
          else summary.stale += 1;
        }
      } catch {
        fail();
      }
    });
    stream.on("error", fail);
    stream.on("end", () => {
      if (!completed) {
        completed = true;
        resolve(summary);
      }
    });
  });
}
