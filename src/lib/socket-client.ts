"use client";



import { useEffect, useRef, useState } from "react";

import { io, type Socket } from "socket.io-client";

import { SOCKET_EVENTS, type RoomEndedPayload } from "@/lib/socket-events";

import type { RevealView, RoomStateView } from "@/lib/types";



let socket: Socket | null = null;



function getSocket() {

  if (!socket) {

    socket = io({

      withCredentials: true,

      autoConnect: false,

      transports: ["websocket", "polling"],

    });

  }

  return socket;

}



function joinRoom(client: Socket, roomCode: string) {

  client.emit(SOCKET_EVENTS.ROOM_JOIN, roomCode);

}



export function useRoomSocket(

  code: string,

  onState?: (state: RoomStateView) => void,

  onEnded?: (payload: RoomEndedPayload) => void,

  onReveal?: (reveal: RevealView) => void,

) {

  const [connected, setConnected] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const onStateRef = useRef(onState);

  const onEndedRef = useRef(onEnded);

  const onRevealRef = useRef(onReveal);



  useEffect(() => {

    onStateRef.current = onState;

  }, [onState]);



  useEffect(() => {

    onEndedRef.current = onEnded;

  }, [onEnded]);



  useEffect(() => {

    onRevealRef.current = onReveal;

  }, [onReveal]);



  useEffect(() => {

    if (!code) {

      return;

    }



    const client = getSocket();

    const roomCode = code.toUpperCase();



    const handleConnect = () => {

      setConnected(true);

      setError(null);

      joinRoom(client, roomCode);

    };



    const handleDisconnect = () => {

      setConnected(false);

    };



    const handleState = (state: RoomStateView) => onStateRef.current?.(state);

    const handleEnded = (payload: RoomEndedPayload) => onEndedRef.current?.(payload);

    const handleReveal = (reveal: RevealView) => onRevealRef.current?.(reveal);

    const handleError = (payload: { message: string }) => setError(payload.message);



    client.on("connect", handleConnect);

    client.on("disconnect", handleDisconnect);

    client.on(SOCKET_EVENTS.ROOM_STATE, handleState);

    client.on(SOCKET_EVENTS.ROOM_ENDED, handleEnded);

    client.on(SOCKET_EVENTS.ROUND_REVEALED, handleReveal);

    client.on(SOCKET_EVENTS.ERROR, handleError);



    if (!client.connected) {

      client.connect();

    } else {

      handleConnect();

    }



    return () => {

      client.emit(SOCKET_EVENTS.ROOM_LEAVE, roomCode);

      client.off("connect", handleConnect);

      client.off("disconnect", handleDisconnect);

      client.off(SOCKET_EVENTS.ROOM_STATE, handleState);

      client.off(SOCKET_EVENTS.ROOM_ENDED, handleEnded);

      client.off(SOCKET_EVENTS.ROUND_REVEALED, handleReveal);

      client.off(SOCKET_EVENTS.ERROR, handleError);

    };

  }, [code]);



  return { connected, error };

}

