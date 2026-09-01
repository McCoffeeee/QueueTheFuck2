import type { Server as SocketServer } from "socket.io";

const IO_GLOBAL_KEY = "__spotify_party_io__" as const;

type IoGlobal = typeof globalThis & {
  [IO_GLOBAL_KEY]?: SocketServer;
};

export function setSocketServer(server: SocketServer) {
  (globalThis as IoGlobal)[IO_GLOBAL_KEY] = server;
}

export function getSocketServer() {
  return (globalThis as IoGlobal)[IO_GLOBAL_KEY] ?? null;
}
